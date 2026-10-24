/**
 * Draws a puppet on a canvas for one pose
 *
 * Two kinds of puppet:
 *  - the built-in demo drake, drawn with shapes so it works with no art
 *  - your own layers: same-sized transparent PNGs stacked in order
 *    (body, arms, head, eyes, mouth), like a paper cut-out puppet
 */

// Layers a custom puppet can have. Only head, body and a closed mouth are required.
export const LAYERS = [
  { key: 'body', label: 'Body', required: true },
  { key: 'armLeft', label: 'Left arm' },
  { key: 'armRight', label: 'Right arm' },
  { key: 'head', label: 'Head', required: true },
  { key: 'eyesOpen', label: 'Eyes open' },
  { key: 'eyesClosed', label: 'Eyes closed' },
  { key: 'mouthClosed', label: 'Mouth closed', required: true },
  { key: 'mouthSmall', label: 'Mouth a little open' },
  { key: 'mouthWide', label: 'Mouth wide open' }
];

export function drawBackground(ctx, background) {
  const { width, height } = ctx.canvas;
  if (background?.image?.complete && background.image.naturalWidth) {
    // Cover the stage, cropping the image's edges if its shape differs
    const img = background.image;
    const scale = Math.max(width / img.naturalWidth, height / img.naturalHeight);
    const w = img.naturalWidth * scale;
    const h = img.naturalHeight * scale;
    ctx.drawImage(img, (width - w) / 2, (height - h) / 2, w, h);
    return;
  }
  ctx.fillStyle = background?.color || '#15151d';
  ctx.fillRect(0, 0, width, height);
}

// The head group turns around the neck: tilt, plus a small shift for turn and nod
function withHead(ctx, pivot, pose, size, draw) {
  ctx.save();
  ctx.translate(pivot.x + pose.yaw * size * 0.06, pivot.y + pose.pitch * size * 0.03);
  ctx.rotate(pose.roll);
  ctx.translate(-pivot.x, -pivot.y);
  draw();
  ctx.restore();
}

function withSwing(ctx, pivot, angle, draw) {
  ctx.save();
  ctx.translate(pivot.x, pivot.y);
  ctx.rotate(angle);
  ctx.translate(-pivot.x, -pivot.y);
  draw();
  ctx.restore();
}

/* ---------- Built-in demo drake ---------- */

const DRAKE = { body: '#2f8f5b', belly: '#e9c46a', dark: '#1d5c3a', horn: '#f4e3b1', eye: '#ffd166', mouth: '#5a1a1a' };

function ellipse(ctx, x, y, rx, ry, color, rotation = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rotation, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

function drawDrake(ctx, pose, timeMs) {
  const { width, height } = ctx.canvas;
  const s = height / 800; // drawn on an 800-high grid
  const cx = width / 2;
  const breathe = Math.sin(timeMs / 900) * 4 * s;
  const neck = { x: cx, y: 430 * s + breathe };

  ctx.save();
  // Tail
  ctx.beginPath();
  ctx.moveTo(cx + 90 * s, 700 * s);
  ctx.quadraticCurveTo(cx + 260 * s, 760 * s, cx + 300 * s, 620 * s + Math.sin(timeMs / 600) * 15 * s);
  ctx.lineWidth = 34 * s;
  ctx.lineCap = 'round';
  ctx.strokeStyle = DRAKE.body;
  ctx.stroke();

  // Wings are the "arms": they flap gently
  const flap = Math.sin(timeMs / 700) * 0.12;
  for (const side of [-1, 1]) {
    withSwing(ctx, { x: cx + side * 90 * s, y: 520 * s + breathe }, side * flap, () => {
      ctx.beginPath();
      ctx.moveTo(cx + side * 90 * s, 500 * s + breathe);
      ctx.lineTo(cx + side * 290 * s, 380 * s + breathe);
      ctx.lineTo(cx + side * 250 * s, 520 * s + breathe);
      ctx.lineTo(cx + side * 200 * s, 470 * s + breathe);
      ctx.lineTo(cx + side * 160 * s, 580 * s + breathe);
      ctx.closePath();
      ctx.fillStyle = DRAKE.dark;
      ctx.fill();
    });
  }

  // Body and belly
  ellipse(ctx, cx, 600 * s + breathe / 2, 150 * s, 175 * s, DRAKE.body);
  ellipse(ctx, cx, 630 * s + breathe / 2, 90 * s, 130 * s, DRAKE.belly);
  ellipse(ctx, cx - 80 * s, 765 * s, 55 * s, 28 * s, DRAKE.dark);
  ellipse(ctx, cx + 80 * s, 765 * s, 55 * s, 28 * s, DRAKE.dark);

  withHead(ctx, neck, pose, height, () => {
    const hy = 300 * s + breathe;
    // Horns
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx + side * 70 * s, hy - 90 * s);
      ctx.lineTo(cx + side * 120 * s, hy - 190 * s);
      ctx.lineTo(cx + side * 105 * s, hy - 75 * s);
      ctx.closePath();
      ctx.fillStyle = DRAKE.horn;
      ctx.fill();
    }
    ellipse(ctx, cx, neck.y - 10 * s, 70 * s, 70 * s, DRAKE.body); // neck
    ellipse(ctx, cx, hy, 150 * s, 125 * s, DRAKE.body); // head
    ellipse(ctx, cx, hy + 70 * s, 105 * s, 62 * s, DRAKE.belly); // snout
    ellipse(ctx, cx - 30 * s, hy + 45 * s, 8 * s, 6 * s, DRAKE.dark); // nostrils
    ellipse(ctx, cx + 30 * s, hy + 45 * s, 8 * s, 6 * s, DRAKE.dark);

    // Eyes: open with a pupil that follows the head turn, or closed lines
    for (const side of [-1, 1]) {
      const ex = cx + side * 62 * s;
      const ey = hy - 25 * s;
      if (pose.blink > 0.5) {
        ctx.beginPath();
        ctx.moveTo(ex - 26 * s, ey);
        ctx.quadraticCurveTo(ex, ey + 14 * s, ex + 26 * s, ey);
        ctx.lineWidth = 6 * s;
        ctx.strokeStyle = DRAKE.dark;
        ctx.stroke();
      } else {
        ellipse(ctx, ex, ey, 28 * s, 32 * s, '#ffffff');
        ellipse(ctx, ex + pose.yaw * 10 * s, ey + pose.pitch * 6 * s, 15 * s, 22 * s, DRAKE.eye);
        ellipse(ctx, ex + pose.yaw * 10 * s, ey + pose.pitch * 6 * s, 6 * s, 16 * s, '#111111');
      }
    }

    // Mouth: a line when closed, an open shape that grows with mouthOpen
    const my = hy + 92 * s;
    if (pose.mouth === 'closed') {
      ctx.beginPath();
      ctx.moveTo(cx - 55 * s, my);
      ctx.quadraticCurveTo(cx, my + 16 * s, cx + 55 * s, my);
      ctx.lineWidth = 6 * s;
      ctx.strokeStyle = DRAKE.dark;
      ctx.stroke();
    } else {
      const open = (pose.mouth === 'wide' ? 34 : 16) * s + pose.mouthOpen * 10 * s;
      ellipse(ctx, cx, my + open / 2, 50 * s, open, DRAKE.mouth);
      ellipse(ctx, cx, my + open * 1.1, 26 * s, open * 0.35, '#c75c5c'); // tongue
    }
  });
  ctx.restore();
}

/* ---------- Your own layered puppet ---------- */

function pickMouth(layers, pose) {
  if (pose.mouth === 'wide') return layers.mouthWide || layers.mouthSmall || layers.mouthClosed;
  if (pose.mouth === 'small') return layers.mouthSmall || layers.mouthWide || layers.mouthClosed;
  return layers.mouthClosed;
}

function drawLayers(ctx, puppet, pose, timeMs) {
  const { layers } = puppet;
  const base = layers.body || layers.head;
  if (!base?.naturalWidth) return;
  const { width, height } = ctx.canvas;
  // Fit the layer stack to 92% of the stage height, centred at the bottom
  const scale = Math.min((height * 0.92) / base.naturalHeight, (width * 0.9) / base.naturalWidth);
  const w = base.naturalWidth * scale;
  const h = base.naturalHeight * scale;
  const x = (width - w) / 2;
  const y = height - h;
  const breathe = Math.sin(timeMs / 900) * h * 0.004;
  const place = img => img?.naturalWidth && ctx.drawImage(img, x, y + breathe, w, h);

  // Where the neck and shoulders are, as fractions of the layer size
  const neck = { x: x + w * puppet.neck.x, y: y + h * puppet.neck.y + breathe };
  const swing = Math.sin(timeMs / 800) * 0.06;

  place(layers.body);
  withSwing(ctx, { x: x + w * 0.38, y: neck.y + h * 0.08 }, swing, () => place(layers.armLeft));
  withSwing(ctx, { x: x + w * 0.62, y: neck.y + h * 0.08 }, -swing, () => place(layers.armRight));
  withHead(ctx, neck, pose, h, () => {
    place(layers.head);
    place(pose.blink > 0.5 ? layers.eyesClosed || layers.eyesOpen : layers.eyesOpen);
    place(pickMouth(layers, pose));
  });
}

export function drawPuppet(ctx, puppet, pose, timeMs) {
  if (puppet?.kind === 'layers') drawLayers(ctx, puppet, pose, timeMs);
  else drawDrake(ctx, pose, timeMs);
}
