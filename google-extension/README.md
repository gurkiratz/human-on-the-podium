# HumanonthePodium

Real-time AI-written likelihood feedback for browser tab audio (livestreams, meetings, videos).

## MVP Pipeline

```txt
Chrome tab audio -> extension recorder -> Gemini transcription -> GPTZero scoring -> live overlay + report
```

## Prerequisites

- Node.js 20+
- Chrome browser
- Gemini API key (free tier works for transcription)
- GPTZero API key (for AI-written likelihood scoring)

## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy environment variables:

```bash
cp .env.example .env
```

3. Add API keys:

```env
GEMINI_API_KEY=your_gemini_key
GPTZERO_API_KEY=your_gptzero_key
USE_MOCK_APIS=false
```

Mock behavior:

- `USE_MOCK_APIS=true` forces mock transcription and mock GPTZero scoring.
- If only `GEMINI_API_KEY` is missing, transcription falls back to mock mode.
- If only `GPTZERO_API_KEY` is missing, scoring falls back to mock mode.

## Run locally

Terminal 1 — backend:

```bash
npm run dev:server
```

Terminal 2 — extension:

```bash
npm run dev:extension
```

Load the extension from `apps/extension/.output/chrome-mv3` in `chrome://extensions` (Developer mode -> Load unpacked).

## Test the actual product

1. Open a browser tab with audible spoken content, such as YouTube, Twitch, Google Meet, or Zoom web.
2. Start playback or join the meeting so the tab is producing audio.
3. Click the HumanonthePodium extension icon. Chrome opens the HumanonthePodium side panel.
4. Click **Start on this tab** in the side panel.
5. Keep the tab audio running for at least 20-45 seconds so HumanonthePodium can transcribe and score a meaningful chunk.
6. Watch the side panel for transcript updates, AI-written likelihood, score timeline, flagged phrases, claim warnings, and explanations.
7. Click **Stop capture** when done, then open **Full report** or export Markdown/JSON from the Analysis tab.

## Project structure

- `apps/extension` — WXT Chrome extension (side panel, overlay, offscreen recorder, dashboard)
- `apps/server` — Fastify backend (Gemini transcription, GPTZero, WebSocket live events)
- `packages/shared` — shared TypeScript types

## Notes

- HumanonthePodium analyzes **transcribed speech**, not AI-generated voices or deepfakes.
- Scores are probabilistic and use cautious language only.
- Gemini replaces OpenAI for transcription in this MVP.
