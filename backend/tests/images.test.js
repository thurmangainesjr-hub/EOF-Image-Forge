import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// Smallest valid PNG (1x1 pixel)
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAwS2OUAAAAABJRU5ErkJggg==', 'base64');

// Stand-in for ComfyUI: accepts a job, reports it done, serves the PNG
const comfyJobs = [];
let comfyMode = 'ok'; // ok, reject
const fakeComfy = http.createServer(async (req, res) => {
  let body = '';
  for await (const chunk of req) body += chunk;
  const json = (status, data) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(data));
  };
  if (req.url === '/prompt' && req.method === 'POST') {
    if (comfyMode === 'reject') return json(400, { error: 'ckpt_name not in list' });
    comfyJobs.push(JSON.parse(body).prompt);
    return json(200, { prompt_id: `job-${comfyJobs.length}` });
  }
  const history = req.url.match(/^\/history\/(.+)$/);
  if (history) {
    return json(200, {
      [history[1]]: {
        status: { status_str: 'success' },
        outputs: { '7': { images: [{ filename: 'eof_00001_.png', subfolder: '', type: 'output' }] } }
      }
    });
  }
  if (req.url.startsWith('/view?')) {
    res.writeHead(200, { 'content-type': 'image/png' });
    return res.end(PNG);
  }
  json(404, {});
});

// Stand-in for EOF Library
const fakeLibrary = http.createServer((req, res) => {
  res.writeHead(req.url === '/api/products/book-1' ? 200 : 404, { 'content-type': 'application/json' });
  res.end(JSON.stringify(req.url === '/api/products/book-1'
    ? { success: true, data: { product: { id: 'book-1', title: 'The Drake Prophecy', author: 'Blue', description: 'A drake guards the last egg.', genres: [{ genre: { name: 'Fantasy' } }] } } }
    : { success: false, error: 'Book not found' }));
});

let server;
let base;
let dataDir;

before(async () => {
  await new Promise(resolve => fakeComfy.listen(0, resolve));
  await new Promise(resolve => fakeLibrary.listen(0, resolve));
  dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'image-forge-'));
  Object.assign(process.env, {
    COMFYUI_URL: `http://127.0.0.1:${fakeComfy.address().port}`,
    LIBRARY_API_URL: `http://127.0.0.1:${fakeLibrary.address().port}`,
    IMAGE_DATA_DIR: dataDir
  });
  const { default: app } = await import('../src/app.js');
  server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server.close();
  fakeComfy.close();
  fakeLibrary.close();
  await fs.rm(dataDir, { recursive: true, force: true });
});

beforeEach(() => {
  comfyJobs.length = 0;
  comfyMode = 'ok';
});

function post(url, body) {
  return fetch(base + url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
}

test('a cover is made by ComfyUI, saved and served', async () => {
  const res = await post('/api/images/cover', {
    title: 'The Drake Prophecy', author: 'Blue', genre: 'Fantasy',
    description: 'A drake guards the last egg under an old stone bridge', style: 'painted', seed: 42
  });
  assert.equal(res.status, 201, await res.clone().text());
  const { image } = await res.json();

  // The workflow asked for a portrait SDXL image with our seed and no text
  const job = comfyJobs[0];
  assert.equal(job['1'].inputs.ckpt_name, 'sd_xl_base_1.0.safetensors');
  assert.deepEqual([job['4'].inputs.width, job['4'].inputs.height], [832, 1216]);
  assert.equal(job['5'].inputs.seed, 42);
  assert.match(job['2'].inputs.text, /drake guards the last egg/);
  assert.match(job['3'].inputs.text, /text, letters/);
  assert.doesNotMatch(job['2'].inputs.text, /Drake Prophecy/, 'the title is left out so the model does not letter it');

  // Title and author are kept to lay over the art as real text
  assert.deepEqual(image.overlay, { title: 'The Drake Prophecy', author: 'Blue' });

  const png = await fetch(base + image.url);
  assert.equal(png.status, 200);
  assert.deepEqual(Buffer.from(await png.arrayBuffer()), PNG);

  const list = await (await fetch(`${base}/api/images`)).json();
  assert.equal(list.images[0].id, image.id);
});

test('a character sheet uses a wide image', async () => {
  const res = await post('/api/images/character', { name: 'Ada', description: 'a girl with a red scarf and a map' });
  assert.equal(res.status, 201, await res.clone().text());
  const job = comfyJobs[0];
  assert.deepEqual([job['4'].inputs.width, job['4'].inputs.height], [1216, 832]);
  assert.match(job['2'].inputs.text, /front view .* side profile view/);
  assert.match(job['2'].inputs.text, /red scarf/);
  assert.doesNotMatch(job['2'].inputs.text, /Ada/, 'the name is left out so the model does not letter it');
});

test('missing details are refused before anything is sent to ComfyUI', async () => {
  assert.equal((await post('/api/images/cover', { title: 'No author' })).status, 400);
  assert.equal((await post('/api/images/character', { name: 'Ada' })).status, 400);
  assert.equal(comfyJobs.length, 0);
});

test('a clear error when ComfyUI rejects the job', async () => {
  comfyMode = 'reject';
  const res = await post('/api/images/cover', { title: 'T', author: 'A' });
  assert.equal(res.status, 503);
  assert.match((await res.json()).error, /ckpt_name not in list/);
});

test('a clear error when ComfyUI is not running', async () => {
  const saved = process.env.COMFYUI_URL;
  process.env.COMFYUI_URL = 'http://127.0.0.1:9';
  try {
    const res = await post('/api/images/cover', { title: 'T', author: 'A' });
    assert.equal(res.status, 503);
    assert.match((await res.json()).error, /not running/);
  } finally {
    process.env.COMFYUI_URL = saved;
  }
});

test('unknown or unsafe image ids are not served', async () => {
  assert.equal((await fetch(`${base}/api/images/00000000-0000-0000-0000-000000000000.png`)).status, 404);
  assert.equal((await fetch(`${base}/api/images/..%2F..%2Fpackage.png`)).status, 404);
});

test('the cover form can be filled from an EOF Library book', async () => {
  const res = await fetch(`${base}/api/library/books/book-1`);
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).book, {
    id: 'book-1', title: 'The Drake Prophecy', author: 'Blue',
    description: 'A drake guards the last egg.', genre: 'Fantasy'
  });
  assert.equal((await fetch(`${base}/api/library/books/missing`)).status, 404);
});
