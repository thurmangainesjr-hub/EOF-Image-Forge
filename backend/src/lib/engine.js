/**
 * Picks which image engine makes the pictures
 *
 * comfyui: ComfyUI on a computer with an NVIDIA graphics card
 * replicate: Replicate in the cloud, for computers without one
 *
 * IMAGE_ENGINE chooses. If it is not set, a Replicate key means replicate.
 */

import { checkComfyUI, runWorkflow } from './comfyui.js';
import { checkReplicate, runReplicate } from './replicate.js';
import { textToImage } from './workflows.js';

export function engineName() {
  const chosen = (process.env.IMAGE_ENGINE || '').toLowerCase();
  if (chosen === 'comfyui' || chosen === 'replicate') return chosen;
  return process.env.REPLICATE_API_TOKEN ? 'replicate' : 'comfyui';
}

export function checkEngine() {
  return engineName() === 'replicate' ? checkReplicate() : checkComfyUI();
}

// Returns an array of PNG buffers
export function makeImage({ positive, negative, width, height, seed, prefix }) {
  if (engineName() === 'replicate') return runReplicate({ positive, width, height, seed });
  return runWorkflow(textToImage({ positive, negative, width, height, seed, prefix }));
}
