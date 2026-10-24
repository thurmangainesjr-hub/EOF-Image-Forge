import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// A few bytes standing in for a WebM recording
const WEBM = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3, 4]);

let server;
let base;
let dataDir;

before(async () => {
  dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'image-forge-puppet-'));
  process.env.PUPPET_DATA_DIR = dataDir;
  const { default: app } = await import('../src/app.js');
  server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server.close();
  await fs.rm(dataDir, { recursive: true, force: true });
});

function postJson(url, body) {
  return fetch(base + url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
}

function postVideo(query, body = WEBM) {
  return fetch(`${base}/api/puppet/videos?${new URLSearchParams(query)}`, {
    method: 'POST', headers: { 'content-type': 'video/webm' }, body
  });
}

test('a performer\'s consent is recorded with the exact statement they agreed to', async () => {
  const { statement } = await (await fetch(`${base}/api/puppet/consent-statement`)).json();
  const res = await postJson('/api/puppet/consents', { performerName: ' Blue ', source: 'webcam', agreed: true });
  assert.equal(res.status, 201);
  const { consent } = await res.json();
  assert.equal(consent.performerName, 'Blue');
  assert.equal(consent.statement, statement);
  assert.ok(consent.createdAt);

  const read = await (await fetch(`${base}/api/puppet/consents/${consent.id}`)).json();
  assert.equal(read.consent.id, consent.id);
});

test('consent needs a clear yes, a name and a real source', async () => {
  assert.equal((await postJson('/api/puppet/consents', { performerName: 'Blue', source: 'webcam' })).status, 400);
  assert.equal((await postJson('/api/puppet/consents', { performerName: 'Blue', source: 'webcam', agreed: 'yes' })).status, 400);
  assert.equal((await postJson('/api/puppet/consents', { performerName: '  ', source: 'webcam', agreed: true })).status, 400);
  assert.equal((await postJson('/api/puppet/consents', { performerName: 'Blue', source: 'tv', agreed: true })).status, 400);
});

test('an audio-driven take is saved and served without consent', async () => {
  const res = await postVideo({ mode: 'audio', name: 'Drake says hello' });
  assert.equal(res.status, 201, await res.clone().text());
  const { video } = await res.json();
  assert.equal(video.mode, 'audio');
  assert.equal(video.bytes, WEBM.length);

  const file = await fetch(base + video.url);
  assert.equal(file.status, 200);
  assert.match(file.headers.get('content-type'), /video\/webm/);
  assert.deepEqual(Buffer.from(await file.arrayBuffer()), WEBM);

  const { videos } = await (await fetch(`${base}/api/puppet/videos`)).json();
  assert.ok(videos.some(v => v.id === video.id));
});

test('a webcam or video take is refused without the performer\'s consent', async () => {
  assert.equal((await postVideo({ mode: 'webcam' })).status, 403);
  assert.equal((await postVideo({ mode: 'video', consentId: '00000000-0000-0000-0000-000000000000' })).status, 403);
  assert.equal((await postVideo({ mode: 'video', consentId: '../../etc/passwd' })).status, 403);
});

test('a webcam take with consent keeps who agreed', async () => {
  const { consent } = await (await postJson('/api/puppet/consents', { performerName: 'Blue', source: 'webcam', agreed: true })).json();
  const res = await postVideo({ mode: 'webcam', consentId: consent.id });
  assert.equal(res.status, 201);
  const { video } = await res.json();
  assert.equal(video.consentId, consent.id);
  assert.equal(video.performerName, 'Blue');
});

test('bad takes are refused', async () => {
  assert.equal((await postVideo({ mode: 'dance' })).status, 400);
  assert.equal((await postVideo({ mode: 'audio' }, Buffer.alloc(0))).status, 400);
  assert.equal((await fetch(`${base}/api/puppet/videos/not-an-id.webm`)).status, 404);
});
