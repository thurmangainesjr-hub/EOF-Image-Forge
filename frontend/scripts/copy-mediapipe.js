// Copies MediaPipe's face tracking files into public/ so the page serves
// them itself instead of downloading them from a CDN. Runs before dev and build.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const from = path.join(root, 'node_modules/@mediapipe/tasks-vision/wasm');
const to = path.join(root, 'public/mediapipe/wasm');

fs.mkdirSync(to, { recursive: true });
fs.cpSync(from, to, { recursive: true });
