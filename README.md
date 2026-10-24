# EOF Image Forge

Book covers, character art and animated character puppets for the E.O.F. Creative Cloud.

Part of the EOF ecosystem alongside EOF Library, Griot AI and DIY University. See the build plan in the EOF project.

## Run it on your computer

You need Node.js 22.

1. Start the server: open a terminal in `backend`, run `npm install` once, then `npm run dev`. It runs at http://localhost:3010.
2. Start the web page: open a second terminal in `frontend`, run `npm install` once, then `npm run dev`. Open http://localhost:5190.
3. Pick how pictures are made. Copy `backend/.env.example` to `backend/.env`, then either:
   - **Cloud (any computer):** make a Replicate account, add a little credit, and paste your key from https://replicate.com/account/api-tokens after `REPLICATE_API_TOKEN=`. Each picture costs about $0.003 with the default model. Keep the key private.
   - **ComfyUI (needs an NVIDIA graphics card):** start ComfyUI. Image Forge looks for it at http://127.0.0.1:8188 and uses the `sd_xl_base_1.0.safetensors` model.
4. Finished images are saved in `backend/data/images` (not uploaded to GitHub).

## Tests

`npm test` in `backend`. GitHub runs the tests and the web page build on every pull request.

## Status

| Tool | Status |
| --- | --- |
| Book covers | Built (Phase B); works with ComfyUI or Replicate, not yet tested with a real engine |
| Character art | Built (Phase B); works with ComfyUI or Replicate, not yet tested with a real engine |
| 2D character puppet | Planned (Phase C) |
