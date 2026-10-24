/**
 * Turn book and character details into image prompts
 *
 * Image models draw letters badly, so covers are made without text.
 * The page lays the title and author over the art instead.
 */

export const STYLES = {
  painted: 'digital painting, rich color, dramatic lighting',
  photo: 'cinematic photograph, shallow depth of field, film grain',
  illustrated: 'storybook illustration, clean line art, warm palette',
  comic: 'comic book art, bold ink lines, flat colors',
  noir: 'black and white, high contrast, noir mood'
};

const NO_TEXT = 'text, letters, words, title, typography, watermark, signature, logo';
const QUALITY_NEGATIVE = 'blurry, low quality, deformed, extra limbs, bad anatomy, jpeg artifacts';

function clean(value, max) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

// The title is never put in the prompt: models try to letter any words they see in quotes
export function coverPrompt({ title, author, genre, description, style }) {
  const parts = [
    `wordless painted artwork for a ${clean(genre, 60) || 'fiction'} book cover, the image only, with no title, no lettering and no writing anywhere`,
    clean(description, 600),
    'striking central image, strong composition with empty space at the top and bottom for the title',
    STYLES[style] || STYLES.painted
  ].filter(Boolean);
  return {
    positive: parts.join(', '),
    negative: `${NO_TEXT}, ${QUALITY_NEGATIVE}`,
    // Kept for the page, which puts these on the cover as real text
    overlay: { title: clean(title, 120), author: clean(author, 80) }
  };
}

export function characterPrompt({ name, description, style }) {
  const parts = [
    `character reference sheet of ${clean(name, 80)}`,
    clean(description, 600),
    'full body, front view and side view, neutral pose, plain light background, consistent design',
    STYLES[style] || STYLES.painted
  ].filter(Boolean);
  return {
    positive: parts.join(', '),
    negative: `${NO_TEXT}, ${QUALITY_NEGATIVE}, busy background, cropped`
  };
}
