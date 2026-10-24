/**
 * ComfyUI connection
 *
 * ComfyUI runs on Blue's PC and makes the images. Image Forge only talks to it
 * over HTTP, so it must be running for covers and character art.
 */

import { randomUUID } from 'node:crypto';

const CHECK_TIMEOUT_MS = 2000;
const POLL_INTERVAL_MS = 1000;

export function comfyUrl() {
  return process.env.COMFYUI_URL || 'http://127.0.0.1:8188';
}

// Raised when ComfyUI is not running or rejects the job
export class EngineOfflineError extends Error {}

// Is ComfyUI running? Never throws: an offline engine is a normal state.
export async function checkComfyUI() {
  const url = comfyUrl();
  try {
    const res = await fetch(`${url}/system_stats`, { signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) });
    if (!res.ok) return { name: 'comfyui', url, online: false, error: `ComfyUI answered ${res.status}` };
    const stats = await res.json();
    return {
      name: 'comfyui',
      url,
      online: true,
      devices: (stats.devices || []).map(d => d.name)
    };
  } catch (error) {
    return { name: 'comfyui', url, online: false, error: `ComfyUI is not running at ${url}` };
  }
}

async function comfyFetch(path, options) {
  const url = comfyUrl();
  let res;
  try {
    res = await fetch(`${url}${path}`, options);
  } catch (error) {
    throw new EngineOfflineError(`ComfyUI is not running at ${url}`);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new EngineOfflineError(`ComfyUI refused the job (${res.status}) ${text.slice(0, 300)}`.trim());
  }
  return res;
}

// Run a workflow and return the PNG bytes of every image it saved
export async function runWorkflow(workflow, { timeoutMs = Number(process.env.COMFYUI_TIMEOUT_MS) || 300000 } = {}) {
  const queued = await comfyFetch('/prompt', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: workflow, client_id: randomUUID() })
  });
  const { prompt_id: promptId } = await queued.json();

  // ComfyUI works in the background; its history shows the job once it is done
  const deadline = Date.now() + timeoutMs;
  let outputs;
  while (!outputs) {
    if (Date.now() > deadline) throw new EngineOfflineError('ComfyUI took too long to make the image');
    const history = await (await comfyFetch(`/history/${promptId}`)).json();
    const job = history[promptId];
    if (job?.status?.status_str === 'error') throw new EngineOfflineError('ComfyUI could not make the image');
    if (job?.outputs && Object.keys(job.outputs).length) outputs = job.outputs;
    else await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  const images = Object.values(outputs).flatMap(node => node.images || []);
  const files = [];
  for (const image of images) {
    const query = new URLSearchParams({ filename: image.filename, subfolder: image.subfolder || '', type: image.type || 'output' });
    const res = await comfyFetch(`/view?${query}`);
    files.push(Buffer.from(await res.arrayBuffer()));
  }
  if (!files.length) throw new EngineOfflineError('ComfyUI finished but saved no image');
  return files;
}
