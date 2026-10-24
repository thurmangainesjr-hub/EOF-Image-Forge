/**
 * Studio projects
 *
 * A project keeps one conversation: what the creator asked, what came back,
 * and every picture version, so nothing is lost when they change their mind.
 * Saved as JSON in STUDIO_DATA_DIR (backend/data/studio by default).
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const defaultDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../data/studio');
const ID_PATTERN = /^[0-9a-f-]{36}$/;

function dir() {
  return process.env.STUDIO_DATA_DIR || defaultDir;
}

const file = id => path.join(dir(), `${id}.json`);

export async function saveProject(project) {
  await fs.mkdir(dir(), { recursive: true });
  project.updatedAt = new Date().toISOString();
  await fs.writeFile(file(project.id), JSON.stringify(project, null, 2));
  return project;
}

export function createProject({ name, settings }) {
  const now = new Date().toISOString();
  return saveProject({
    id: randomUUID(),
    name: String(name || '').trim().slice(0, 120) || 'Untitled project',
    createdAt: now,
    updatedAt: now,
    settings: { ratio: '1:1', style: 'none', preset: null, ...settings },
    currentImageId: null,
    versions: [],
    messages: []
  });
}

export async function getProject(id) {
  if (!ID_PATTERN.test(id || '')) return null;
  try {
    return JSON.parse(await fs.readFile(file(id), 'utf8'));
  } catch {
    return null;
  }
}

// Newest first, without the full conversations
export async function listProjects() {
  let names;
  try {
    names = await fs.readdir(dir());
  } catch {
    return [];
  }
  const projects = await Promise.all(
    names.filter(n => n.endsWith('.json')).map(async n => JSON.parse(await fs.readFile(path.join(dir(), n), 'utf8')))
  );
  return projects
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map(({ messages, ...summary }) => ({ ...summary, messageCount: messages.length }));
}

export function addMessage(project, message) {
  const full = { id: randomUUID(), at: new Date().toISOString(), ...message };
  project.messages.push(full);
  return full;
}
