/**
 * ComfyUI workflows in API format
 *
 * A plain SDXL text-to-image graph: load model, encode prompts, sample, decode, save.
 */

// The model installed on Blue's PC; change it with COMFYUI_CHECKPOINT
export function checkpointName() {
  return process.env.COMFYUI_CHECKPOINT || 'sd_xl_base_1.0.safetensors';
}

// SDXL works best near one megapixel
export const SIZES = {
  cover: { width: 832, height: 1216 },     // portrait, about 2:3 like a book
  character: { width: 1216, height: 832 }  // landscape, room for front and side views
};

export function textToImage({ positive, negative, width, height, seed, steps = 30, cfg = 7, prefix = 'eof-image-forge' }) {
  return {
    '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: checkpointName() } },
    '2': { class_type: 'CLIPTextEncode', inputs: { text: positive, clip: ['1', 1] } },
    '3': { class_type: 'CLIPTextEncode', inputs: { text: negative, clip: ['1', 1] } },
    '4': { class_type: 'EmptyLatentImage', inputs: { width, height, batch_size: 1 } },
    '5': {
      class_type: 'KSampler',
      inputs: {
        model: ['1', 0],
        positive: ['2', 0],
        negative: ['3', 0],
        latent_image: ['4', 0],
        seed,
        steps,
        cfg,
        sampler_name: 'euler',
        scheduler: 'normal',
        denoise: 1
      }
    },
    '6': { class_type: 'VAEDecode', inputs: { samples: ['5', 0], vae: ['1', 2] } },
    '7': { class_type: 'SaveImage', inputs: { images: ['6', 0], filename_prefix: prefix } }
  };
}
