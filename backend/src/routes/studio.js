/**
 * The chat studio
 *
 * The creator types what they want and gets a picture. Anything typed after
 * that changes the current picture and keeps the rest, unless they ask for a
 * new one. Ratio, style and preset are optional extras.
 */

import express from 'express';
import { RATIOS, STYLES, PRESETS, findRatio, findStyle, findPreset, buildPrompt, pngSize } from '../lib/studio.js';
import { createProject, getProject, listProjects, saveProject, addMessage } from '../lib/projects.js';
import { makeImage, editImage, modelName, EngineOfflineError, EngineCannotError } from '../lib/engine.js';
import { saveImage, getImage, readImagePng } from '../lib/store.js';

const router = express.Router();

const randomSeed = () => Math.floor(Math.random() * 2 ** 31);
const withUrl = image => image && { ...image, url: `/api/images/${image.id}.png` };

// The project with its picture records filled in, ready for the page
async function expand(project) {
  const versions = (await Promise.all(project.versions.map(getImage))).filter(Boolean).map(withUrl);
  return { ...project, versions };
}

// Only known values; anything else is ignored
function cleanSettings(input = {}, current = {}) {
  const next = { ...current };
  if ('ratio' in input && findRatio(input.ratio)) next.ratio = input.ratio;
  if ('style' in input && findStyle(input.style)) next.style = input.style;
  if ('preset' in input) next.preset = findPreset(input.preset) ? input.preset : null;
  return next;
}

router.get('/options', (req, res) => {
  res.json({ ratios: RATIOS, styles: STYLES, presets: PRESETS });
});

router.get('/projects', async (req, res) => {
  res.json({ projects: await listProjects() });
});

router.post('/projects', async (req, res) => {
  const { name, settings } = req.body || {};
  const preset = findPreset(settings?.preset);
  // A preset fills in its shape and style unless they were chosen too
  const base = preset ? { ratio: preset.ratio, style: preset.style } : {};
  const project = await createProject({ name, settings: cleanSettings(settings, { ratio: '1:1', style: 'none', preset: null, ...base }) });
  res.status(201).json({ project: await expand(project) });
});

async function loadProject(req, res, next) {
  const project = await getProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  req.project = project;
  next();
}

router.get('/projects/:id', loadProject, async (req, res) => {
  res.json({ project: await expand(req.project) });
});

// Rename, change settings, or pick an older version to keep working from
router.patch('/projects/:id', loadProject, async (req, res) => {
  const { project } = req;
  const { name, settings, currentImageId } = req.body || {};
  if (typeof name === 'string' && name.trim()) project.name = name.trim().slice(0, 120);
  if (settings) project.settings = cleanSettings(settings, project.settings);
  if (currentImageId !== undefined) {
    if (!project.versions.includes(currentImageId)) return res.status(400).json({ error: 'That picture is not in this project' });
    project.currentImageId = currentImageId;
  }
  await saveProject(project);
  res.json({ project: await expand(project) });
});

// Work out what a message asks for: a new picture, a change, or another try
async function plan(project, body) {
  const { text, mode, regenerate } = body;
  const current = project.currentImageId && await getImage(project.currentImageId);
  const { ratio } = project.settings;

  if (regenerate) {
    const last = [...project.messages].reverse().find(m => m.role === 'user' && m.action);
    if (!last) return { error: 'There is nothing to try again yet' };
    if (last.action === 'edit') {
      const parent = await getImage(last.parentId);
      if (!parent) return { error: 'The picture that was changed is gone' };
      return { action: 'edit', text: last.text, parent, ratio: last.ratio, again: true };
    }
    return { action: 'generate', text: last.text, ratio: last.ratio, style: last.style, preset: last.preset, again: true };
  }

  if (!String(text || '').trim()) return { error: 'Type what you would like to see' };
  if (current && mode !== 'new') {
    // A new shape is passed to the edit so the picture is re-made in that shape
    const reshape = current.ratio && current.ratio !== ratio ? ratio : null;
    return { action: 'edit', text: text.trim(), parent: current, ratio: reshape };
  }
  return { action: 'generate', text: text.trim(), ratio, style: project.settings.style, preset: project.settings.preset };
}

function replyFor(step) {
  if (step.again) return 'Here is another try.';
  if (step.action === 'edit') {
    return step.ratio
      ? `Done. I re-made it in ${step.ratio} and kept everything else as close as I could.`
      : 'Done. I made that change and kept everything else as close as I could.';
  }
  const style = findStyle(step.style);
  return style && step.style !== 'none' ? `Here is your picture, in the ${style.label} style.` : 'Here is your picture.';
}

router.post('/projects/:id/messages', loadProject, async (req, res) => {
  const { project } = req;
  const body = req.body || {};
  if (body.settings) project.settings = cleanSettings(body.settings, project.settings);

  const step = await plan(project, body);
  if (step.error) return res.status(400).json({ error: step.error });

  const seed = randomSeed();
  addMessage(project, {
    role: 'user',
    text: step.again ? 'Try again' : step.text,
    action: step.again ? undefined : step.action,
    parentId: step.parent?.id,
    ratio: step.ratio,
    style: step.style,
    preset: step.preset
  });

  try {
    let png;
    let prompt;
    if (step.action === 'edit') {
      prompt = step.text;
      [png] = await editImage({ instruction: prompt, png: await readImagePng(step.parent.id), seed, ratio: step.ratio });
    } else {
      prompt = buildPrompt(step.text, step);
      [png] = await makeImage({ positive: prompt, negative: 'text, letters, watermark, blurry, low quality, deformed', ratio: step.ratio, seed, prefix: 'eof-studio' });
    }
    const image = await saveImage(png, {
      kind: 'studio',
      projectId: project.id,
      action: step.action,
      text: step.text,
      prompt,
      parentId: step.parent?.id || null,
      ratio: step.ratio || step.parent?.ratio || project.settings.ratio,
      style: step.action === 'edit' ? step.parent.style : step.style,
      preset: step.action === 'edit' ? step.parent.preset : step.preset,
      seed,
      model: modelName(step.action),
      ...pngSize(png)
    });
    project.versions.push(image.id);
    project.currentImageId = image.id;
    addMessage(project, { role: 'assistant', text: replyFor(step), imageId: image.id });
    await saveProject(project);
    res.status(201).json({ project: await expand(project) });
  } catch (error) {
    const known = error instanceof EngineOfflineError || error instanceof EngineCannotError;
    if (!known) console.error('studio error:', error);
    addMessage(project, { role: 'assistant', error: true, text: known ? error.message : 'Something went wrong making that picture.' });
    await saveProject(project);
    res.status(error instanceof EngineCannotError ? 400 : known ? 503 : 500).json({ error: known ? error.message : 'Could not make the picture', project: await expand(project) });
  }
});

export default router;
