/**
 * Covers and character art
 */

import express from 'express';
import { EngineOfflineError } from '../lib/comfyui.js';
import { makeImage, engineName } from '../lib/engine.js';
import { SIZES } from '../lib/workflows.js';
import { coverPrompt, characterPrompt, STYLES } from '../lib/prompts.js';
import { saveImage, listImages, imagePath } from '../lib/store.js';

const router = express.Router();

function pickSeed(seed) {
  const n = Number(seed);
  return Number.isInteger(n) && n >= 0 ? n : Math.floor(Math.random() * 2 ** 32);
}

async function generate(res, kind, prompt, request, seed) {
  try {
    const { width, height } = SIZES[kind];
    const [png] = await makeImage({ ...prompt, width, height, seed, prefix: `eof-${kind}` });
    const record = await saveImage(png, {
      kind,
      engine: engineName(),
      request,
      prompt: prompt.positive,
      negativePrompt: prompt.negative,
      overlay: prompt.overlay,
      seed,
      width,
      height
    });
    res.status(201).json({ image: { ...record, url: `/api/images/${record.id}.png` } });
  } catch (error) {
    if (error instanceof EngineOfflineError) {
      return res.status(503).json({ error: error.message });
    }
    console.error(`${kind} error:`, error);
    res.status(500).json({ error: 'Could not make the image' });
  }
}

router.get('/styles', (req, res) => {
  res.json({ styles: Object.keys(STYLES) });
});

// Book cover art (no text on the image; the page adds title and author)
router.post('/cover', async (req, res) => {
  const { title, author, genre, description, style } = req.body || {};
  if (!title?.trim() || !author?.trim()) {
    return res.status(400).json({ error: 'A cover needs the book title and the author' });
  }
  const request = { title, author, genre, description, style };
  await generate(res, 'cover', coverPrompt(request), request, pickSeed(req.body.seed));
});

// Character reference sheet
router.post('/character', async (req, res) => {
  const { name, description, style } = req.body || {};
  if (!name?.trim() || !description?.trim()) {
    return res.status(400).json({ error: 'A character needs a name and a description' });
  }
  const request = { name, description, style };
  await generate(res, 'character', characterPrompt(request), request, pickSeed(req.body.seed));
});

router.get('/', async (req, res) => {
  const images = await listImages();
  res.json({ images: images.map(i => ({ ...i, url: `/api/images/${i.id}.png` })) });
});

router.get('/:id.png', async (req, res) => {
  const file = await imagePath(req.params.id);
  if (!file) return res.status(404).json({ error: 'Image not found' });
  res.sendFile(file);
});

export default router;
