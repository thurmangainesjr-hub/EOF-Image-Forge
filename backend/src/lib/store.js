/**
 * Saved images
 *
 * Each image is a PNG plus a small JSON file with how it was made,
 * kept in IMAGE_DATA_DIR (backend/data/images by default).
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const defaultDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../data/images');
const ID_PATTERN = /^[0-9a-f-]{36}$/;

export function imageDir() {
  return process.env.IMAGE_DATA_DIR || defaultDir;
}

export async function saveImage(png, meta) {
  const dir = imageDir();
  await fs.mkdir(dir, { recursive: true });
  const id = randomUUID();
  const record = { id, createdAt: new Date().toISOString(), ...meta };
  await fs.writeFile(path.join(dir, `${id}.png`), png);
  await fs.writeFile(path.join(dir, `${id}.json`), JSON.stringify(record, null, 2));
  return record;
}

export async function listImages() {
  const dir = imageDir();
  let names;
  try {
    names = await fs.readdir(dir);
  } catch {
    return [];
  }
  const records = await Promise.all(
    names.filter(n => n.endsWith('.json')).map(async n => JSON.parse(await fs.readFile(path.join(dir, n), 'utf8')))
  );
  return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// Path of an image's PNG, or null for an unknown or unsafe id
export async function imagePath(id) {
  if (!ID_PATTERN.test(id)) return null;
  const file = path.join(imageDir(), `${id}.png`);
  try {
    await fs.access(file);
    return file;
  } catch {
    return null;
  }
}

// One image's record, or null
export async function getImage(id) {
  if (!ID_PATTERN.test(id || '')) return null;
  try {
    return JSON.parse(await fs.readFile(path.join(imageDir(), `${id}.json`), 'utf8'));
  } catch {
    return null;
  }
}

export async function readImagePng(id) {
  const file = await imagePath(id);
  return file ? fs.readFile(file) : null;
}
