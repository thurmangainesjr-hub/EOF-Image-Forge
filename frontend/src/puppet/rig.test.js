import { test } from 'node:test';
import assert from 'node:assert/strict';
import { levelFromSamples, mouthShape, mouthFromLevel, idleBlink, poseFromFace, smoothPose, NEUTRAL_POSE } from './rig.js';

test('silence is level 0 and a loud tone is loud', () => {
  assert.equal(levelFromSamples(new Uint8Array(512).fill(128)), 0);
  const loud = Uint8Array.from({ length: 512 }, (_, i) => (i % 2 ? 228 : 28));
  assert.ok(levelFromSamples(loud) > 0.7);
  assert.equal(levelFromSamples(new Uint8Array(0)), 0);
});

test('mouth shapes go closed, small, wide', () => {
  assert.equal(mouthShape(0), 'closed');
  assert.equal(mouthShape(0.3), 'small');
  assert.equal(mouthShape(0.9), 'wide');
});

test('speech opens the mouth and silence closes it again', () => {
  let open = 0;
  for (let i = 0; i < 10; i++) open = mouthFromLevel(0.25, open).mouthOpen;
  assert.equal(mouthFromLevel(0.25, open).mouth, 'wide');
  for (let i = 0; i < 20; i++) open = mouthFromLevel(0, open).mouthOpen;
  assert.equal(mouthFromLevel(0, open).mouth, 'closed');
});

test('one loud frame does not snap the mouth fully open', () => {
  const { mouthOpen } = mouthFromLevel(1, 0);
  assert.ok(mouthOpen > 0 && mouthOpen < 1);
});

test('idle blinks are short and regular', () => {
  assert.equal(idleBlink(0), 1);
  assert.equal(idleBlink(500), 0);
  assert.equal(idleBlink(3800 + 50), 1);
});

// A fake FaceLandmarker result: 478 points, with the eyes and nose placed
function face({ tilt = 0, noseX = 0.5, jaw = 0, blink = 0 } = {}) {
  const points = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  points[33] = { x: 0.4, y: 0.4 - tilt, z: 0 };
  points[263] = { x: 0.6, y: 0.4 + tilt, z: 0 };
  points[1] = { x: noseX, y: 0.51, z: 0 };
  return {
    faceLandmarks: [points],
    faceBlendshapes: [{ categories: [
      { categoryName: 'jawOpen', score: jaw },
      { categoryName: 'eyeBlinkLeft', score: blink },
      { categoryName: 'eyeBlinkRight', score: blink }
    ] }]
  };
}

test('no face gives no pose', () => {
  assert.equal(poseFromFace({ faceLandmarks: [] }), null);
  assert.equal(poseFromFace(undefined), null);
});

test('a straight, still face gives a neutral head', () => {
  const pose = poseFromFace(face());
  assert.equal(pose.mouth, 'closed');
  assert.equal(pose.blink, 0);
  assert.ok(Math.abs(pose.roll) < 1e-9);
  assert.ok(Math.abs(pose.yaw) < 1e-9);
});

test('tilting the head tilts the puppet, mirrored for a webcam', () => {
  const pose = poseFromFace(face({ tilt: 0.03 }));
  assert.ok(pose.roll > 0.2);
  assert.ok(poseFromFace(face({ tilt: 0.03 }), { mirror: true }).roll < -0.2);
});

test('a big tilt is limited so the head never spins', () => {
  assert.ok(poseFromFace(face({ tilt: 0.5 })).roll <= 0.45);
});

test('turning, talking and blinking come through', () => {
  const pose = poseFromFace(face({ noseX: 0.55, jaw: 0.6, blink: 0.9 }));
  assert.ok(pose.yaw > 0.4);
  assert.equal(pose.mouth, 'wide');
  assert.equal(pose.blink, 1);
});

test('smoothing moves part of the way to the new pose', () => {
  const next = { ...NEUTRAL_POSE, roll: 0.4, mouthOpen: 1, mouth: 'wide' };
  const pose = smoothPose(NEUTRAL_POSE, next, 0.5);
  assert.ok(Math.abs(pose.roll - 0.2) < 1e-9);
  assert.equal(pose.mouth, 'wide');
});
