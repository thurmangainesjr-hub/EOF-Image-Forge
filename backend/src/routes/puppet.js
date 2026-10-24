/**
 * 2D puppet: performer consent and recorded videos
 *
 * The puppet itself runs in the browser (layered art, lip sync from the
 * dialogue, MediaPipe face tracking). The server only keeps the consent
 * records and the finished WebM videos.
 */

import express from 'express';
import { saveConsent, getConsent, saveVideo, listVideos, videoPath, CONSENT_STATEMENT } from '../lib/puppetStore.js';

const router = express.Router();

// What drives the puppet. Webcam and video use a real person's face.
const MODES = ['audio', 'webcam', 'video'];
const NEEDS_CONSENT = ['webcam', 'video'];
const MAX_VIDEO = process.env.PUPPET_MAX_VIDEO || '200mb';

const withUrl = video => ({ ...video, url: `/api/puppet/videos/${video.id}.webm` });

router.get('/consent-statement', (req, res) => {
  res.json({ statement: CONSENT_STATEMENT });
});

// The performer agrees before their webcam feed or video is used
router.post('/consents', async (req, res) => {
  const { performerName, source, agreed } = req.body || {};
  if (agreed !== true) return res.status(400).json({ error: 'The performer has to agree first' });
  if (!performerName?.trim()) return res.status(400).json({ error: 'Type the performer\'s name' });
  if (!NEEDS_CONSENT.includes(source)) return res.status(400).json({ error: 'Source must be webcam or video' });
  const consent = await saveConsent({ performerName: performerName.trim().slice(0, 120), source });
  res.status(201).json({ consent });
});

router.get('/consents/:id', async (req, res) => {
  const consent = await getConsent(req.params.id);
  if (!consent) return res.status(404).json({ error: 'Consent not found' });
  res.json({ consent });
});

// A finished puppet video. Webcam or video takes must carry a consent.
router.post('/videos', express.raw({ type: 'video/webm', limit: MAX_VIDEO }), async (req, res) => {
  const { mode, consentId, name } = req.query;
  if (!MODES.includes(mode)) return res.status(400).json({ error: 'Mode must be audio, webcam or video' });
  if (!Buffer.isBuffer(req.body) || !req.body.length) {
    return res.status(400).json({ error: 'Send the recording as a video/webm body' });
  }
  let consent = null;
  if (NEEDS_CONSENT.includes(mode)) {
    consent = await getConsent(consentId);
    if (!consent) return res.status(403).json({ error: 'This take uses a real person\'s face, so it needs their recorded consent' });
  }
  const video = await saveVideo(req.body, {
    name: String(name || 'Puppet take').slice(0, 120),
    mode,
    consentId: consent?.id || null,
    performerName: consent?.performerName || null
  });
  res.status(201).json({ video: withUrl(video) });
});

router.get('/videos', async (req, res) => {
  res.json({ videos: (await listVideos()).map(withUrl) });
});

router.get('/videos/:id.webm', async (req, res) => {
  const file = await videoPath(req.params.id);
  if (!file) return res.status(404).json({ error: 'Video not found' });
  res.type('video/webm').sendFile(file);
});

export default router;
