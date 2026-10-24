/**
 * Studio choices: picture shapes, styles and optional presets
 *
 * Everything here is a starting point. A request typed in the chat always
 * works without any of it.
 */

export const RATIOS = [
  { id: '1:1', label: 'Square' },
  { id: '16:9', label: 'Widescreen' },
  { id: '9:16', label: 'Portrait (phone)' },
  { id: '4:3', label: 'Landscape' },
  { id: '3:4', label: 'Portrait art' },
  { id: '2:3', label: 'Book cover' },
  { id: '21:9', label: 'Cinematic' },
  { id: '5:4', label: 'Classic landscape' },
  { id: '4:5', label: 'Classic portrait' }
];

export const STYLES = [
  { id: 'none', label: 'No style (just my words)', prompt: '' },
  { id: 'photoreal', label: 'Photorealistic', prompt: 'photorealistic, natural skin texture, realistic lighting, cinematic detail, shot on a full-frame camera' },
  { id: 'stylized-3d', label: 'Stylized 3D animation', prompt: 'stylized 3D animated family film look, expressive proportions, soft global illumination, polished render' },
  { id: 'anime', label: 'Anime', prompt: 'anime style, clean cel shading, vibrant color, illustrated light effects' },
  { id: 'manga', label: 'Manga', prompt: 'black and white manga art, crisp ink lines, screentone shading' },
  { id: 'comic', label: 'Comic book', prompt: 'comic book art, bold ink outlines, dramatic shadows, flat graphic color' },
  { id: 'realistic-3d', label: 'Realistic 3D', prompt: 'realistic 3D game render, detailed materials and textures, physically based lighting' },
  { id: 'watercolor', label: 'Watercolor', prompt: 'watercolor painting, soft washes, visible paper texture' },
  { id: 'oil', label: 'Oil painting', prompt: 'oil painting, rich brush strokes, classical lighting' },
  { id: 'fantasy', label: 'Fantasy illustration', prompt: 'epic fantasy illustration, painterly detail, dramatic atmosphere' },
  { id: 'cyberpunk', label: 'Cyberpunk', prompt: 'cyberpunk, neon lights, rain-slick streets, high-tech details' },
  { id: 'clay', label: 'Clay animation', prompt: 'clay animation look, handmade plasticine models, stop-motion lighting' },
  { id: 'pixel', label: 'Pixel art', prompt: 'detailed pixel art, limited palette, crisp pixels' },
  { id: 'noir', label: 'Noir', prompt: 'black and white film noir, high contrast, hard shadows' },
  { id: 'concept', label: 'Concept art', prompt: 'professional film concept art, painterly, strong composition' },
  { id: 'archviz', label: 'Architectural visualization', prompt: 'architectural visualization, clean realistic render, natural daylight' }
];

// Presets only fill in settings; the chat can change all of them
export const PRESETS = [
  { id: 'character-sheet', label: 'Character sheet', ratio: '3:2', style: 'comic', hint: 'full-body character design, front view and side view, plain light background' },
  { id: 'book-cover', label: 'Book cover', ratio: '2:3', style: 'fantasy', hint: 'book cover artwork with a strong central image and space at the top for a title' },
  { id: 'graphic-novel', label: 'Graphic novel page', ratio: '2:3', style: 'comic', hint: 'dramatic graphic novel panel' },
  { id: 'movie-poster', label: 'Movie poster', ratio: '2:3', style: 'photoreal', hint: 'cinematic movie poster composition' },
  { id: 'storyboard', label: 'Storyboard frame', ratio: '16:9', style: 'concept', hint: 'storyboard frame, clear staging, readable action' },
  { id: 'album-cover', label: 'Album cover', ratio: '1:1', style: 'none', hint: 'striking album cover artwork' },
  { id: 'product', label: 'Product photo', ratio: '4:5', style: 'photoreal', hint: 'studio product photography, clean background, soft shadows' },
  { id: 'environment', label: 'Environment', ratio: '16:9', style: 'concept', hint: 'wide environment design, sense of scale' },
  { id: 'vehicle', label: 'Vehicle', ratio: '16:9', style: 'realistic-3d', hint: 'vehicle design, three-quarter view' },
  { id: 'sports-card', label: 'Sports poster or card', ratio: '2:3', style: 'photoreal', hint: 'dynamic sports poster, action pose, dramatic lighting' },
  { id: 'puppet-ready', label: 'Puppet-ready character', ratio: '3:4', style: 'stylized-3d', hint: 'full-body character facing forward, arms slightly away from the body, mouth closed, flat even lighting, plain white background' }
];

export const findRatio = id => RATIOS.find(r => r.id === id);
export const findStyle = id => STYLES.find(s => s.id === id);
export const findPreset = id => PRESETS.find(p => p.id === id);

// The prompt for a new picture: the creator's words first, then the optional extras
export function buildPrompt(text, { style, preset } = {}) {
  return [String(text).trim(), findPreset(preset)?.hint, findStyle(style)?.prompt].filter(Boolean).join(', ');
}

// Width and height from a PNG's header, so every saved picture knows its size
export function pngSize(png) {
  if (png.length < 24 || png.toString('ascii', 12, 16) !== 'IHDR') return {};
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}
