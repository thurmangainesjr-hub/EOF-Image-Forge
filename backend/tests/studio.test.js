import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// Smallest valid PNG (1x1 pixel)
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAwS2OUAAAAABJRU5ErkJggg==', 'base64');

// Stand-in for Replicate: the image model, the edit model and file uploads
const calls = [];
let fail = false;
const fake = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks);
  const url = `http://127.0.0.1:${fake.address().port}`;
  const json = (status, data) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(data));
  };
  if (req.url === '/v1/files' && req.method === 'POST') {
    calls.push({ path: req.url, uploadedPng: body.includes(PNG.subarray(0, 16)) });
    return json(201, { id: 'f1', urls: { get: `${url}/v1/files/f1` } });
  }
  const model = req.url.match(/^\/v1\/models\/(.+)\/predictions$/);
  if (model) {
    calls.push({ model: model[1], input: JSON.parse(body).input });
    if (fail) return json(200, { id: 'p', status: 'failed', error: 'model fell over' });
    return json(201, { id: 'p', status: 'succeeded', output: `${url}/out.png` });
  }
  if (req.url === '/out.png') {
    res.writeHead(200, { 'content-type': 'image/png' });
    return res.end(PNG);
  }
  json(404, {});
});

let server;
let base;
let dataDir;

before(async () => {
  await new Promise(resolve => fake.listen(0, resolve));
  dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'image-forge-studio-'));
  Object.assign(process.env, {
    REPLICATE_API_TOKEN: 'test-key',
    REPLICATE_API_URL: `http://127.0.0.1:${fake.address().port}`,
    IMAGE_DATA_DIR: path.join(dataDir, 'images'),
    STUDIO_DATA_DIR: path.join(dataDir, 'studio')
  });
  const { default: app } = await import('../src/app.js');
  server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server.close();
  fake.close();
  await fs.rm(dataDir, { recursive: true, force: true });
});

beforeEach(() => {
  calls.length = 0;
  fail = false;
  delete process.env.IMAGE_ENGINE;
});

function send(method, url, body) {
  return fetch(base + url, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) });
}

async function newProject(body = {}) {
  const res = await send('POST', '/api/studio/projects', body);
  assert.equal(res.status, 201);
  return (await res.json()).project;
}

async function say(project, body) {
  const res = await send('POST', `/api/studio/projects/${project.id}/messages`, body);
  return { status: res.status, ...(await res.json()) };
}

test('the studio lists its ratios, styles and presets', async () => {
  const options = await (await fetch(`${base}/api/studio/options`)).json();
  assert.ok(options.ratios.some(r => r.id === '21:9'));
  assert.ok(options.styles.some(s => s.id === 'manga'));
  assert.ok(options.presets.some(p => p.id === 'book-cover'));
});

test('typing a request with no settings makes a picture (the design rule)', async () => {
  const project = await newProject();
  const text = 'A 35-year-old African American superhero in black armor with gold detailing, on a rooftop at night';
  const result = await say(project, { text });
  assert.equal(result.status, 201);

  assert.equal(calls[0].model, 'black-forest-labs/flux-schnell');
  assert.match(calls[0].input.prompt, /superhero in black armor/);
  assert.equal(calls[0].input.aspect_ratio, '1:1');

  const [version] = result.project.versions;
  assert.equal(result.project.currentImageId, version.id);
  assert.equal(version.action, 'generate');
  assert.equal(version.model, 'replicate:black-forest-labs/flux-schnell');
  assert.deepEqual([version.width, version.height], [1, 1]);
  assert.deepEqual(result.project.messages.map(m => m.role), ['user', 'assistant']);
  assert.equal(result.project.messages[1].imageId, version.id);

  const png = await fetch(base + version.url);
  assert.equal(png.status, 200);
});

test('the next message changes the current picture and keeps the rest', async () => {
  const project = await newProject();
  await say(project, { text: 'A knight on a rooftop' });
  const first = calls.length;
  const result = await say(project, { text: 'Make the armor silver and keep his face exactly the same' });
  assert.equal(result.status, 201);

  const [upload, edit] = calls.slice(first);
  assert.equal(upload.path, '/v1/files');
  assert.ok(upload.uploadedPng, 'the current picture is sent to be changed');
  assert.equal(edit.model, 'black-forest-labs/flux-kontext-pro');
  assert.equal(edit.input.prompt, 'Make the armor silver and keep his face exactly the same');
  assert.equal(edit.input.aspect_ratio, 'match_input_image');

  const [v1, v2] = result.project.versions;
  assert.equal(v2.parentId, v1.id);
  assert.equal(v2.action, 'edit');
  assert.equal(result.project.currentImageId, v2.id);
});

test('style and preset are optional extras added after the creator\'s words', async () => {
  const project = await newProject({ settings: { preset: 'book-cover' } });
  assert.equal(project.settings.ratio, '2:3');
  assert.equal(project.settings.style, 'fantasy');

  await say(project, { text: 'A drake guarding an egg', settings: { style: 'manga' } });
  const { prompt, aspect_ratio: ratio } = calls[0].input;
  assert.ok(prompt.startsWith('A drake guarding an egg'));
  assert.match(prompt, /book cover artwork/);
  assert.match(prompt, /manga/);
  assert.equal(ratio, '2:3');
});

test('changing the shape mid-conversation re-makes the picture in that shape', async () => {
  const project = await newProject();
  await say(project, { text: 'A city street' });
  const first = calls.length;
  await say(project, { text: 'Show more of the street', settings: { ratio: '21:9' } });
  assert.equal(calls[first + 1].input.aspect_ratio, '21:9');
});

test('"new picture" starts fresh instead of changing the current one', async () => {
  const project = await newProject();
  await say(project, { text: 'A red car' });
  const first = calls.length;
  const result = await say(project, { text: 'A blue boat', mode: 'new' });
  assert.equal(calls[first].model, 'black-forest-labs/flux-schnell');
  assert.equal(result.project.versions[1].parentId, null);
});

test('try again repeats the last request with a new seed', async () => {
  const project = await newProject();
  await say(project, { text: 'A lighthouse' });
  const result = await say(project, { regenerate: true });
  assert.equal(result.status, 201);
  assert.equal(calls[1].input.prompt, calls[0].input.prompt);
  assert.equal(result.project.versions.length, 2);
  assert.equal(result.project.messages.at(-1).text, 'Here is another try.');
});

test('an older version can be picked to keep working from', async () => {
  const project = await newProject();
  await say(project, { text: 'A tree' });
  const { project: after } = await say(project, { text: 'Add snow' });
  const older = after.versions[0].id;
  const res = await send('PATCH', `/api/studio/projects/${project.id}`, { currentImageId: older, name: 'Winter tree' });
  const { project: picked } = await res.json();
  assert.equal(picked.currentImageId, older);
  assert.equal(picked.name, 'Winter tree');

  const bad = await send('PATCH', `/api/studio/projects/${project.id}`, { currentImageId: '00000000-0000-0000-0000-000000000000' });
  assert.equal(bad.status, 400);
});

test('a failed picture is reported in the chat and nothing is saved as a version', async () => {
  const project = await newProject();
  fail = true;
  const result = await say(project, { text: 'A dragon' });
  assert.equal(result.status, 503);
  assert.match(result.error, /model fell over/);
  assert.equal(result.project.versions.length, 0);
  assert.equal(result.project.messages.at(-1).error, true);
});

test('changing a picture needs the cloud engine', async () => {
  const project = await newProject();
  await say(project, { text: 'A tree' });
  process.env.IMAGE_ENGINE = 'comfyui';
  const result = await say(project, { text: 'Add snow' });
  assert.equal(result.status, 400);
  assert.match(result.error, /needs the cloud engine/);
});

test('empty requests and unknown projects are refused', async () => {
  const project = await newProject();
  assert.equal((await say(project, { text: '   ' })).status, 400);
  assert.equal((await say(project, { regenerate: true })).status, 400);
  assert.equal((await send('GET', '/api/studio/projects/not-a-project')).status, 404);
});

test('projects are listed newest first without their conversations', async () => {
  const project = await newProject({ name: 'Superhero' });
  await say(project, { text: 'A hero' });
  const { projects } = await (await fetch(`${base}/api/studio/projects`)).json();
  assert.equal(projects[0].id, project.id);
  assert.equal(projects[0].messages, undefined);
  assert.equal(projects[0].messageCount, 2);
});
