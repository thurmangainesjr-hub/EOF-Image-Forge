# EOF Image Forge

Book covers, character art and animated character puppets for the E.O.F. Creative Cloud.

Part of the EOF ecosystem alongside EOF Library, Griot AI and DIY University. See the build plan in the EOF project.

## Run it on your computer

You need Node.js 22.

1. Start the server: open a terminal in `backend`, run `npm install` once, then `npm run dev`. It runs at http://localhost:3010.
2. Start the web page: open a second terminal in `frontend`, run `npm install` once, then `npm run dev`. Open http://localhost:5190.
3. For images (Phase B), start ComfyUI on the same computer. Image Forge looks for it at http://127.0.0.1:8188. Copy `backend/.env.example` to `backend/.env` to change that.

## Tests

`npm test` in `backend`. GitHub runs the tests and the web page build on every pull request.

## Status

| Tool | Status |
| --- | --- |
| Book covers | Planned (Phase B) |
| Character art | Planned (Phase B) |
| 2D character puppet | Planned (Phase C) |
