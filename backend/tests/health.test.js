import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

// A stand-in for ComfyUI so the test runs without a graphics card
const fakeComfy = http.createServer((req, res) => {
  if (req.url === '/system_stats') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ devices: [{ name: 'cuda:0 Test GPU' }] }));
    return;
  }
  res.writeHead(404).end();
});
await new Promise(resolve => fakeComfy.listen(0, resolve));

const { default: app } = await import('../src/app.js');
const server = app.listen(0);
await new Promise(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`;

after(() => {
  server.close();
  fakeComfy.close();
});

test('health says the API is up and ComfyUI is online', async () => {
  process.env.COMFYUI_URL = `http://127.0.0.1:${fakeComfy.address().port}`;
  const res = await fetch(`${base}/api/health`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, 'ok');
  assert.equal(body.engine.online, true);
  assert.deepEqual(body.engine.devices, ['cuda:0 Test GPU']);
});

test('health reports ComfyUI offline without failing', async () => {
  // Nothing listens on port 9 here
  process.env.COMFYUI_URL = 'http://127.0.0.1:9';
  const res = await fetch(`${base}/api/health`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, 'ok');
  assert.equal(body.engine.online, false);
  assert.match(body.engine.error, /not running/);
});

test('no feature is marked live before it is tested for real', async () => {
  const res = await fetch(`${base}/api/features`);
  const { features } = await res.json();
  assert.ok(features.length > 0);
  assert.ok(features.every(f => ['planned', 'built'].includes(f.status)));
});

test('unknown API paths return 404', async () => {
  const res = await fetch(`${base}/api/nope`);
  assert.equal(res.status, 404);
});
