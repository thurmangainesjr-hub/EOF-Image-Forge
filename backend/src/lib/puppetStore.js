/**
 * Puppet consents and recorded puppet videos
 *
 * A consent is the performer's agreement, recorded before any webcam or
 * video of a real person is used to move a puppet. Videos are the WebM
 * files the puppet studio records. Both live in PUPPET_DATA_DIR
 * (backend/data/puppet by default).
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const defaultDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../data/puppet');
const ID_PATTERN = /^[0-9a-f-]{36}$/;

export const CONSENT_STATEMENT =
  'I am the person in this webcam feed or video, or I have their permission. ' +
  'I agree that my face and head movements are used to animate a puppet in EOF Image Forge.';

function dir(kind) {
  return path.join(process.env.PUPPET_DATA_DIR || defaultDir, kind);
}

async function writeRecord(kind, record, extra) {
  const folder = dir(kind);
  await fs.mkdir(folder, { recursive: true });
  if (extra) await fs.writeFile(path.join(folder, `${record.id}${extra.ext}`), extra.data);
  await fs.writeFile(path.join(folder, `${record.id}.json`), JSON.stringify(record, null, 2));
  return record;
}

async function readRecord(kind, id) {
  if (!ID_PATTERN.test(id || '')) return null;
  try {
    return JSON.parse(await fs.readFile(path.join(dir(kind), `${id}.json`), 'utf8'));
  } catch {
    return null;
  }
}

async function listRecords(kind) {
  let names;
  try {
    names = await fs.readdir(dir(kind));
  } catch {
    return [];
  }
  const records = await Promise.all(
    names.filter(n => n.endsWith('.json')).map(async n => JSON.parse(await fs.readFile(path.join(dir(kind), n), 'utf8')))
  );
  return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function saveConsent({ performerName, source }) {
  return writeRecord('consents', {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    performerName,
    source,
    statement: CONSENT_STATEMENT
  });
}

export const getConsent = id => readRecord('consents', id);

export function saveVideo(webm, meta) {
  const record = { id: randomUUID(), createdAt: new Date().toISOString(), bytes: webm.length, ...meta };
  return writeRecord('videos', record, { ext: '.webm', data: webm });
}

export const listVideos = () => listRecords('videos');

// Path of a video's WebM, or null for an unknown or unsafe id
export async function videoPath(id) {
  if (!ID_PATTERN.test(id)) return null;
  const file = path.join(dir('videos'), `${id}.webm`);
  try {
    await fs.access(file);
    return file;
  } catch {
    return null;
  }
}
