/**
 * Replicate connection (cloud images)
 *
 * For computers without an NVIDIA graphics card. Replicate runs the image
 * model in the cloud and charges a few cents per picture. Needs
 * REPLICATE_API_TOKEN in backend/.env.
 */

import { EngineOfflineError } from './comfyui.js';

const CHECK_TIMEOUT_MS = 5000;
const POLL_INTERVAL_MS = 1000;

function apiUrl() {
  return process.env.REPLICATE_API_URL || 'https://api.replicate.com';
}

export function replicateModel() {
  return process.env.REPLICATE_MODEL || 'black-forest-labs/flux-schnell';
}

function headers() {
  return {
    authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}`,
    'content-type': 'application/json'
  };
}

async function replicateFetch(url, options = {}) {
  let res;
  try {
    res = await fetch(url, { ...options, headers: { ...headers(), ...options.headers } });
  } catch (error) {
    throw new EngineOfflineError('Could not reach Replicate. Check the internet connection.');
  }
  if (res.status === 401) throw new EngineOfflineError('Replicate did not accept the key in REPLICATE_API_TOKEN');
  if (res.status === 402) throw new EngineOfflineError('Your Replicate account needs credit. Add some in Replicate billing.');
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new EngineOfflineError(`Replicate refused the job (${res.status}) ${text.slice(0, 300)}`.trim());
  }
  return res.json();
}

// Is the cloud engine ready? Never throws.
export async function checkReplicate() {
  const base = { name: 'replicate', model: replicateModel() };
  if (!process.env.REPLICATE_API_TOKEN) {
    return { ...base, online: false, error: 'No Replicate key. Add REPLICATE_API_TOKEN to backend/.env' };
  }
  try {
    const res = await fetch(`${apiUrl()}/v1/account`, { headers: headers(), signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) });
    if (res.status === 401) return { ...base, online: false, error: 'Replicate did not accept the key in REPLICATE_API_TOKEN' };
    if (!res.ok) return { ...base, online: false, error: `Replicate answered ${res.status}` };
    return { ...base, online: true, devices: ['Replicate cloud'] };
  } catch (error) {
    return { ...base, online: false, error: 'Could not reach Replicate' };
  }
}

// Replicate's own ratio names for a width and height
export function aspectRatio(width, height) {
  if (width === height) return '1:1';
  return width > height ? '3:2' : '2:3';
}

export function editModel() {
  return process.env.REPLICATE_EDIT_MODEL || 'black-forest-labs/flux-kontext-pro';
}

// Run one prediction, wait for it, and return the PNG bytes of every output
async function runPrediction(model, input, { timeoutMs = Number(process.env.REPLICATE_TIMEOUT_MS) || 180000 } = {}) {
  let prediction = await replicateFetch(`${apiUrl()}/v1/models/${model}/predictions`, {
    method: 'POST',
    headers: { prefer: 'wait=60' },
    body: JSON.stringify({ input })
  });

  const deadline = Date.now() + timeoutMs;
  while (!['succeeded', 'failed', 'canceled'].includes(prediction.status)) {
    if (Date.now() > deadline) throw new EngineOfflineError('Replicate took too long to make the image');
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
    prediction = await replicateFetch(prediction.urls.get);
  }
  if (prediction.status !== 'succeeded') {
    throw new EngineOfflineError(`Replicate could not make the image${prediction.error ? `: ${prediction.error}` : ''}`);
  }

  const urls = [prediction.output].flat().filter(Boolean);
  const files = [];
  for (const url of urls) {
    const res = await fetch(url).catch(() => null);
    if (!res?.ok) throw new EngineOfflineError('Replicate made the image but it could not be downloaded');
    files.push(Buffer.from(await res.arrayBuffer()));
  }
  if (!files.length) throw new EngineOfflineError('Replicate finished but returned no image');
  return files;
}

// Make one image in the cloud and return its PNG bytes in an array.
// ratio (like '16:9') wins over width and height when given.
export function runReplicate({ positive, width, height, ratio, seed }) {
  // This model has no negative prompt, so the no-text rule goes in the prompt
  return runPrediction(replicateModel(), {
    prompt: `${positive}. The picture contains no text, letters, words or signs of any kind.`,
    aspect_ratio: ratio || aspectRatio(width, height),
    output_format: 'png',
    num_outputs: 1,
    seed
  });
}

// Hand Replicate a picture to work from. It returns a link its models can read.
async function uploadFile(png) {
  const form = new FormData();
  form.append('content', new Blob([png], { type: 'image/png' }), 'image.png');
  let res;
  try {
    res = await fetch(`${apiUrl()}/v1/files`, {
      method: 'POST',
      headers: { authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}` },
      body: form
    });
  } catch {
    throw new EngineOfflineError('Could not reach Replicate. Check the internet connection.');
  }
  if (!res.ok) throw new EngineOfflineError(`Replicate would not take the picture (${res.status})`);
  const file = await res.json();
  return file.urls.get;
}

// Change an existing picture by following plain instructions, keeping the rest
export async function editWithReplicate({ instruction, png, seed, ratio }) {
  return runPrediction(editModel(), {
    prompt: instruction,
    input_image: await uploadFile(png),
    aspect_ratio: ratio || 'match_input_image',
    output_format: 'png',
    seed
  });
}
