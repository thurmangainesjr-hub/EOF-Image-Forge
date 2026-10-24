import 'dotenv/config';
import app from './app.js';

const PORT = process.env.PORT || 3010;

app.listen(PORT, () => {
  console.log(`EOF Image Forge API on http://localhost:${PORT}`);
});
