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

// SDXL sizes for the ratios the studio offers, all near one megapixel
const RATIO_SIZES = {
  '1:1': [1024, 1024], '16:9': [1344, 768], '9:16': [768, 1344], '4:3': [1152, 896], '3:4': [896, 1152],
  '3:2': [1216, 832], '2:3': [832, 1216], '21:9': [1536, 640], '9:21': [640, 1536], '5:4': [1152, 896], '4:5': [896, 1152]
};

export function sizeForRatio(ratio) {
  const [width, height] = RATIO_SIZES[ratio] || RATIO_SIZES['1:1'];
  return { width, height };
}

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
