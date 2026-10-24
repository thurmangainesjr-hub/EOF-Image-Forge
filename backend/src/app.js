/**
 * EOF Image Forge API
 */

import express from 'express';
import cors from 'cors';
import { checkEngine } from './lib/engine.js';
import imageRoutes from './routes/images.js';
import libraryRoutes from './routes/library.js';

const app = express();

app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5190' }));
app.use(express.json({ limit: '1mb' }));

// Is the API up, and can it reach the image engine?
app.get('/api/health', async (req, res) => {
  const engine = await checkEngine();
  res.json({
    status: 'ok',
    service: 'eof-image-forge',
    engine
  });
});

// What Image Forge can do today. Features only switch on when they really work.
app.get('/api/features', (req, res) => {
  res.json({
    features: [
      { id: 'covers', name: 'Book covers', status: 'built', phase: 'B' },
      { id: 'character-art', name: 'Character art', status: 'built', phase: 'B' },
      { id: 'puppet', name: '2D character puppet', status: 'planned', phase: 'C' }
    ]
  });
});

app.use('/api/images', imageRoutes);
app.use('/api/library', libraryRoutes);

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

export default app;
