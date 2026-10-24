/**
 * Read-only book lookup in EOF Library, to fill in the cover form.
 * Attaching a cover to a Library book comes later, with shared EOF login.
 */

import express from 'express';

const router = express.Router();

function libraryUrl() {
  return process.env.LIBRARY_API_URL || 'http://localhost:3002';
}

router.get('/books/:id', async (req, res) => {
  const id = req.params.id;
  if (!/^[\w-]{1,100}$/.test(id)) return res.status(404).json({ error: 'Book not found' });

  let response;
  try {
    response = await fetch(`${libraryUrl()}/api/products/${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(5000) });
  } catch {
    return res.status(503).json({ error: `EOF Library is not running at ${libraryUrl()}` });
  }
  if (response.status === 404) return res.status(404).json({ error: 'Book not found in EOF Library' });
  if (!response.ok) return res.status(502).json({ error: `EOF Library answered ${response.status}` });

  const { data } = await response.json();
  const product = data?.product || {};
  res.json({
    book: {
      id: product.id,
      title: product.title,
      author: product.author,
      description: product.description || '',
      genre: product.genres?.[0]?.genre?.name || product.genres?.[0]?.name || ''
    }
  });
});

export default router;
