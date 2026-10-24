/**
 * Puppet rig: turns sound and face tracking into a pose
 *
 * Pure functions with no browser APIs, so they can be tested with Node.
 * A pose is { mouth, mouthOpen, blink, roll, yaw, pitch }:
 *   mouth      'closed' | 'small' | 'wide' (which mouth layer to show)
 *   mouthOpen  0..1
 *   blink      0..1 (1 = eyes shut)
 *   roll       head tilt in radians
 *   yaw/pitch  head turn left/right and up/down, about -1..1
 */

export const NEUTRAL_POSE = { mouth: 'closed', mouthOpen: 0, blink: 0, roll: 0, yaw: 0, pitch: 0 };

const MAX_ROLL = 0.45;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Loudness (0..1) of one frame of audio from an AnalyserNode's byte time-domain data
export function levelFromSamples(samples) {
  if (!samples?.length) return 0;
  let sum = 0;
  for (const s of samples) {
    const v = (s - 128) / 128;
    sum += v * v;
  }
  return Math.sqrt(sum / samples.length);
}

// Pick the mouth shape for how open the mouth is
export function mouthShape(open) {
  if (open < 0.12) return 'closed';
  if (open < 0.45) return 'small';
  return 'wide';
}

// Lip sync from dialogue: speech loudness becomes mouth opening.
// Smoothing stops the mouth flickering between shapes on every frame.
export function mouthFromLevel(level, previousOpen = 0, gain = 6) {
  const target = clamp((level - 0.01) * gain, 0, 1);
  // Open quickly, close a little slower, like real speech
  const rate = target > previousOpen ? 0.6 : 0.35;
  const open = previousOpen + (target - previousOpen) * rate;
  return { mouthOpen: open, mouth: mouthShape(open) };
}

// Idle blink when nothing is tracking the eyes: a short blink every few seconds
export function idleBlink(timeMs, everyMs = 3800, lengthMs = 140) {
  const phase = timeMs % everyMs;
  return phase < lengthMs ? 1 : 0;
}

function blendshape(categories, name) {
  return categories?.find(c => c.categoryName === name)?.score ?? 0;
}

/**
 * Pose from one MediaPipe FaceLandmarker result.
 * Uses the eye corners (landmarks 33 and 263) for tilt and the nose tip (1)
 * for turn, and the jawOpen / eyeBlink blendshapes for mouth and eyes.
 * mirror=true for a webcam, so the puppet moves like a mirror image.
 * Returns null when no face was found.
 */
export function poseFromFace(result, { mirror = false } = {}) {
  const landmarks = result?.faceLandmarks?.[0];
  if (!landmarks || landmarks.length < 264) return null;
  const categories = result.faceBlendshapes?.[0]?.categories;

  const right = landmarks[33];
  const left = landmarks[263];
  const nose = landmarks[1];
  const eyeDistance = Math.hypot(left.x - right.x, left.y - right.y) || 1;
  const mid = { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 };

  let roll = Math.atan2(left.y - right.y, left.x - right.x);
  let yaw = (nose.x - mid.x) / eyeDistance * 2;
  const pitch = ((nose.y - mid.y) / eyeDistance - 0.55) * 2;
  if (mirror) {
    roll = -roll;
    yaw = -yaw;
  }

  const mouthOpen = clamp(blendshape(categories, 'jawOpen') * 1.6, 0, 1);
  const blink = Math.max(blendshape(categories, 'eyeBlinkLeft'), blendshape(categories, 'eyeBlinkRight'));

  return {
    mouth: mouthShape(mouthOpen),
    mouthOpen,
    blink: blink > 0.5 ? 1 : 0,
    roll: clamp(roll, -MAX_ROLL, MAX_ROLL),
    yaw: clamp(yaw, -1, 1),
    pitch: clamp(pitch, -1, 1)
  };
}

// Ease from the last pose to a new one, so tracking jitter doesn't shake the puppet
export function smoothPose(previous, next, amount = 0.5) {
  const mix = key => previous[key] + (next[key] - previous[key]) * amount;
  const mouthOpen = mix('mouthOpen');
  return {
    mouth: mouthShape(mouthOpen),
    mouthOpen,
    blink: next.blink,
    roll: mix('roll'),
    yaw: mix('yaw'),
    pitch: mix('pitch')
  };
}
