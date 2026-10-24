/**
 * Picks which image engine makes the pictures
 *
 * comfyui: ComfyUI on a computer with an NVIDIA graphics card
 * replicate: Replicate in the cloud, for computers without one
 *
 * IMAGE_ENGINE chooses. If it is not set, a Replicate key means replicate.
 */

import { checkComfyUI, runWorkflow } from './comfyui.js';
import { EngineOfflineError } from './comfyui.js';
import { checkReplicate, runReplicate, editWithReplicate, replicateModel, editModel } from './replicate.js';
import { textToImage, sizeForRatio, checkpointName } from './workflows.js';

export function engineName() {
  const chosen = (process.env.IMAGE_ENGINE || '').toLowerCase();
  if (chosen === 'comfyui' || chosen === 'replicate') return chosen;
  return process.env.REPLICATE_API_TOKEN ? 'replicate' : 'comfyui';
}

export function checkEngine() {
  return engineName() === 'replicate' ? checkReplicate() : checkComfyUI();
}

// Raised when the chosen engine can't do what was asked
export class EngineCannotError extends Error {}

// Returns an array of PNG buffers. Give width and height, or a ratio like '16:9'.
export function makeImage({ positive, negative, width, height, ratio, seed, prefix }) {
  if (engineName() === 'replicate') return runReplicate({ positive, width, height, ratio, seed });
  const size = ratio ? sizeForRatio(ratio) : { width, height };
  return runWorkflow(textToImage({ positive, negative, ...size, seed, prefix }));
}

// Change a picture by instruction. Only the cloud engine can do this for now.
// A ratio reshapes the picture to that shape; without one it keeps its shape.
export async function editImage({ instruction, png, seed, ratio }) {
  if (engineName() !== 'replicate') {
    throw new EngineCannotError('Changing a picture by chat needs the cloud engine (a Replicate key in backend/.env)');
  }
  return editWithReplicate({ instruction, png, seed, ratio });
}

// Which model made a picture, saved with it
export function modelName(kind = 'generate') {
  if (engineName() !== 'replicate') return `comfyui:${checkpointName()}`;
  return `replicate:${kind === 'edit' ? editModel() : replicateModel()}`;
}

export { EngineOfflineError };
