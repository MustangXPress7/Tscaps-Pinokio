# Tscaps

**Add animated captions to any video, in your browser. Free, open source, no account, no upload.**

Tscaps is a client-side subtitle editor for short-form video (TikTok, Reels, Shorts). Drop a video, transcribe it with in-browser Whisper, pick a template, tune the controls, and export the result with captions burned into the pixels. The video never leaves the browser.

This is a Pinokio launcher for the [francozanardi/tscaps](https://github.com/francozanardi/tscaps) repository.

## What it does

- 36 animated caption templates across five families (Modern, Key moments, Viral, Classic, Lab)
- Word-by-word timing with karaoke reveal, per-word emphasis, and per-word style overrides
- In-browser Whisper transcription (tiny, base, small, medium) — no API key, no account, no upload
- Import SRT or VTT, export SRT / VTT / ASS / SBV / plain text
- Frame-accurate mp4 export via WebCodecs (chars captions burned into the pixels)
- Timeline with cuts, auto-cut silences, text-behind-subject segmentation, RTL/mixed-script support
- Every caption template is editable CSS

## Requirements

- Pinokio (bundles `node`, `pnpm`, and `git`)
- A browser: Chrome 94+, Edge 94+, Safari 16.4+, Firefox 130+

## Install

Run the **Install** tab. It clones the tscaps repository into `app/` and runs `pnpm install` (which also builds the template CSS via the postinstall hook).

## Start

Run the **Start** tab. It launches the Vite dev server:

```
pnpm --filter ./apps/studio dev
```

Once the dev server prints its URL, the app auto-opens in your system browser (default `http://localhost:5173`). The **Open Web UI** tab also appears and opens the app in the system browser.

## Update

Run the **Update** tab. It runs `git pull` on both the launcher and `app/` repositories, then `pnpm install` inside `app/`.

## Reset

Run the **Reset** tab to delete the `app/` folder. Then re-run **Install** to rebuild from scratch.

## How to use

1. Open the app and drop a video (mp4, webm, mov — anything the browser's WebCodecs API can decode).
2. Transcribe with in-browser Whisper (first run downloads the model, ~80 MB, cached after that).
3. Pick a template, tune the controls (font, size, weight, colour, spacing, animation), or write your own CSS.
4. Export frame-accurate captioned mp4, or export caption files (SRT, VTT, ASS, SBV, TXT).

## API

The rendering engine is framework-agnostic and ships separately on npm as [`@tscaps/engine`](https://www.npmjs.com/package/@tscaps/engine).

### JavaScript

```javascript
import { RenderPipelineBuilder } from '@tscaps/engine';

const inputVideo = /* Blob from a file input, fetch, etc. */;
const pipeline = new RenderPipelineBuilder()
  .withInputVideo(inputVideo)
  .build();

const { blob } = await pipeline.run();
// blob is a Blob containing the captioned mp4
```

### Python

No native Python API is published; call the browser app over HTTP via the dev-server URL:

```python
import webbrowser
webbrowser.open("http://localhost:5173")
```

### Curl

The dev server serves static assets. Fetch the app entry point:

```
curl -s http://localhost:5173/
```

For programmatic caption rendering, use `@tscaps/engine` in Node/Browser (see JavaScript). The full pipeline API, document model, transcriber, splitter, and tag docs live in `app/packages/engine/README.md`.

## Project structure

```
Tscaps/
├── app/              # Cloned francozanardi/tscaps repository (pnpm monorepo)
├── install.js        # Clone repo + pnpm install
├── start.js          # Vite dev server launcher
├── update.js         # Pull launcher + app + reinstall
├── reset.js          # Remove app folder
├── pinokio.js        # Launcher UI
├── pinokio.json      # Launcher metadata
└── README.md         # This file
```

## License

The tscaps repo is mixed-license: the engine and templates are MIT, the editor app is AGPL-3.0. See the `LICENSE` files under `app/packages/engine`, `app/apps/studio`, and `app/templates`.