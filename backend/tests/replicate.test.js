import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// Smallest valid PNG (1x1 pixel)
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAwS2OUAAAAABJRU5ErkJggg==', 'base64');

// Stand-in for Replicate: the first answer is still "processing", then it is done
const jobs = [];
let mode = 'ok'; // ok, badkey, nocredit, failed
const fakeReplicate = http.createServer(async (req, res) => {
  let body = '';
  for await (const chunk of req) body += chunk;
  const url = `http://127.0.0.1:${fakeReplicate.address().port}`;
  const json = (status, data) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(data));
  };
  // Finished files are public links; only the API needs the key
  if (req.url.startsWith('/v1/') && (req.headers.authorization !== 'Bearer test-key' || mode === 'badkey')) {
    return json(401, { detail: 'Unauthenticated' });
  }
  if (req.url === '/v1/account') return json(200, { username: 'blue' });
  if (req.url === '/v1/models/black-forest-labs/flux-schnell/predictions' && req.method === 'POST') {
    if (mode === 'nocredit') return json(402, { detail: 'Payment required' });
    jobs.push({ body: JSON.parse(body), prefer: req.headers.prefer });
    return json(201, { id: 'p1', status: 'processing', urls: { get: `${url}/v1/predictions/p1` } });
  }
  if (req.url === '/v1/predictions/p1') {
    if (mode === 'failed') return json(200, { id: 'p1', status: 'failed', error: 'NSFW content detected' });
    return json(200, { id: 'p1', status: 'succeeded', output: [`${url}/files/out-0.png`] });
  }
  if (req.url === '/files/out-0.png') {
    res.writeHead(200, { 'content-type': 'image/png' });
    return res.end(PNG);
  }
  json(404, {});
});

let server;
let base;
let dataDir;

before(async () => {
  await new Promise(resolve => fakeReplicate.listen(0, resolve));
  dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'image-forge-replicate-'));
  Object.assign(process.env, {
    REPLICATE_API_TOKEN: 'test-key',
    REPLICATE_API_URL: `http://127.0.0.1:${fakeReplicate.address().port}`,
    IMAGE_DATA_DIR: dataDir
  });
  const { default: app } = await import('../src/app.js');
  server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server.close();
  fakeReplicate.close();
  await fs.rm(dataDir, { recursive: true, force: true });
});

beforeEach(() => {
  jobs.length = 0;
  mode = 'ok';
  delete process.env.IMAGE_ENGINE;
});

function post(url, body) {
  return fetch(base + url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
}

test('with a Replicate key, health shows the cloud engine is ready', async () => {
  const { engine } = await (await fetch(`${base}/api/health`)).json();
  assert.equal(engine.name, 'replicate');
  assert.equal(engine.online, true);
});

test('a cover is made in the cloud, saved and served', async () => {
  const res = await post('/api/images/cover', {
    title: 'The Drake Prophecy', author: 'Blue', genre: 'Fantasy',
    description: 'A drake guards the last egg', seed: 7
  });
  assert.equal(res.status, 201, await res.clone().text());
  const { image } = await res.json();

  const { input } = jobs[0].body;
  assert.equal(input.aspect_ratio, '2:3');
  assert.equal(input.seed, 7);
  assert.equal(input.output_format, 'png');
  assert.match(input.prompt, /drake guards the last egg/);
  assert.match(input.prompt, /no text/);
  assert.doesNotMatch(input.prompt, /Drake Prophecy/, 'the title is left out so the model does not letter it');
  assert.equal(image.engine, 'replicate');
  assert.deepEqual(image.overlay, { title: 'The Drake Prophecy', author: 'Blue' });

  const png = await fetch(base + image.url);
  assert.deepEqual(Buffer.from(await png.arrayBuffer()), PNG);
});

test('a character sheet asks the cloud for a wide image', async () => {
  const res = await post('/api/images/character', { name: 'Ada', description: 'a girl with a red scarf' });
  assert.equal(res.status, 201, await res.clone().text());
  assert.equal(jobs[0].body.input.aspect_ratio, '3:2');
});

test('clear errors for a wrong key, no credit, or a failed picture', async () => {
  mode = 'badkey';
  let res = await post('/api/images/cover', { title: 'T', author: 'A' });
  assert.equal(res.status, 503);
  assert.match((await res.json()).error, /did not accept the key/);
  assert.equal((await (await fetch(`${base}/api/health`)).json()).engine.online, false);

  mode = 'nocredit';
  res = await post('/api/images/cover', { title: 'T', author: 'A' });
  assert.equal(res.status, 503);
  assert.match((await res.json()).error, /needs credit/);

  mode = 'failed';
  res = await post('/api/images/cover', { title: 'T', author: 'A' });
  assert.equal(res.status, 503);
  assert.match((await res.json()).error, /NSFW content detected/);
});

test('IMAGE_ENGINE=comfyui still uses ComfyUI even with a Replicate key', async () => {
  process.env.IMAGE_ENGINE = 'comfyui';
  process.env.COMFYUI_URL = 'http://127.0.0.1:9';
  const { engine } = await (await fetch(`${base}/api/health`)).json();
  assert.equal(engine.name, 'comfyui');
  assert.equal(jobs.length, 0);
});
