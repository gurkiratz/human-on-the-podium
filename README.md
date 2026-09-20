# Human on the Podium

When AI-written text is read aloud, it is hard to catch by ear. This finds out
how much of a speech a machine wrote.

Three surfaces over one detection pipeline:

| | What it does |
|---|---|
| **Live** (`/`) | Transcribes you as you talk, analyzes each chunk, and cuts you off out loud the moment you start reading AI text. |
| **Analyze** (`/youtube`) | Takes a sixty-second excerpt from a speech or talk by an MP and returns its AI share, transcript, and sentence-level evidence. |
| **Investigate** (`/investigate`) | The archive — every excerpt analyzed so far, searchable, with the evidence behind each reading. |

```bash
npm run dev
```

Needs `.env` in the project root:

```
GPT_ZERO_API_KEY=...
11LABS_API_KEY=...
```

`yt-dlp` and `ffmpeg` must be on `PATH` for the Analyze page. A project-local
`yt-dlp` in `bin/` is used when present, or set `YT_DLP_PATH`.

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack), React 19, TypeScript |
| Styling | Tailwind CSS v4, CSS custom properties for theming |
| Motion | `motion` (Framer Motion), springs over fixed-duration curves |
| Tables | TanStack Table v8 |
| Dates | Luxon |
| Audio capture | `getUserMedia` + an AudioWorklet (`public/worklets/pcm-recorder.js`) emitting PCM16 @ 16 kHz |
| Media extraction | `yt-dlp` and `ffmpeg`, shelled out from the Node runtime |
| Storage | Local SQLite via `node:sqlite`, file at `data/sloppy.db` (gitignored) |

Everything server-side runs on the Node runtime, not the edge — the analyze
route spawns binaries and can take minutes.

## Sources

**Speech and audio**

- **YouTube** — `yt-dlp` pulls a 60-second window via `--download-sections`,
  preferring HLS audio formats (234/233) because progressive ones now 403
  often. Title, upload date, and duration come from a single `--print` pass.
- **CPAC** (`cpac.ca`) — the episode page carries an HLS master playlist and,
  on the same element, `data-livedatetime` (airdate) and `data-videoduration`.
  `ffmpeg` cuts the window straight out of the audio rendition.

For both, the recording's real length is checked before anything downloads, so
a start time past the end fails with a readable message instead of an opaque
codec error. The stored clip length is what we actually analyzed, which is
shorter than 60s when the excerpt runs off the end of a short recording.

**Analysis**

- **GPTZero** `/v2/predict/text` — document and sentence-level AI probability.
- **ElevenLabs Scribe v2 Realtime** — streaming speech-to-text for the Live
  page, over a WebSocket the browser opens directly with a single-use token
  minted by `/api/scribe-token`, so the API key never reaches the client.
- **ElevenLabs TTS** (`eleven_v3`) — the spoken interruptions on the Live page.

Recording dates are treated as calendar dates and rendered in UTC. CPAC reports
its airdate at midnight UTC, so localising it would show the day before.

## How the live loop works

1. **Capture** — `getUserMedia` on the chosen mic; the AudioWorklet converts to
   PCM16 at 16 kHz.
2. **Transcribe** — streamed to the Scribe v2 realtime WebSocket.
3. **Chunk** — `src/lib/chunker.ts` banks committed words and releases a chunk
   at 80 words, or after 2.5s of silence if at least 40 words are waiting.
   Chunks never overlap, so each word is billed to GPTZero exactly once.
4. **Analyze** — `/api/detect` calls GPTZero.
5. **React** — `/api/speak` returns ElevenLabs audio for a line from
   `src/lib/roast.ts`. The mic is hard-muted before playback and reopened when
   it ends, so the app never transcribes its own voice.

## Reading the result

Every reading is shown as the **share of the excerpt that reads as
machine-written**, never as a bare verdict word. A lone "HUMAN" stamp reads as
a hard ruling even when the model is hedging, so the number carries its own
unit (`28% AI`) and a plain-language band sits beside it:

| AI share | Reads |
|---|---|
| 0–9% | Human hands |
| 10–29% | Mostly human |
| 30–54% | Ghostwriter? |
| 55–79% | Leans machine |
| 80–100% | Reads like a bot |

The scale lives in `src/components/ai-scale.tsx` and is shared by every surface;
its colors are CSS variables, retuned per theme rather than duplicated.

These are machine assessments of transcribed speech, not proof of authorship.

## What the findings doc changed

`GPT_ZERO_FINDINGS.md` drove three decisions worth knowing about:

- **Sentence level, not paragraph level.** A transcript has no line breaks, so
  every sentence lands in one paragraph that scores 0.000. Highlighting uses
  `sentences[].class_probabilities.ai` against a 0.65 threshold, and ignores
  `highlight_sentence_for_ai`, which was false even for known AI sentences.
- **70 words is the floor for casual speech.** Chunks below it are marked
  `thin`.
- **Thin chunks are trusted in one direction only.** A short chunk can miss AI
  text but never invents it, so a thin `ai` verdict is spoken aloud while a
  thin `human` verdict is shown as insufficient evidence and never praised.
  This is what stops the app congratulating you for a half-sentence.

## Tuning

| What | Where |
|---|---|
| Chunk size, pause threshold | `src/lib/chunker.ts` |
| Sentence highlight threshold | `src/lib/constants.ts` |
| AI-share bands and labels | `src/components/ai-scale.tsx` |
| Concurrent analyze jobs | `MAX_YOUTUBE_JOBS` in `src/lib/constants.ts` |
| Roast lines | `src/lib/roast.ts` |
| Voices, TTS model | `src/lib/voices.ts` |
| Praise cooldown | `PRAISE_COOLDOWN_MS` in `src/lib/useDetector.ts` |

The roast lines use `eleven_v3` so the `[shouting]` tags actually shout, which
costs ~3.4s to synthesize. `/api/speak` caches every line in memory and the
client pre-warms the common ones when you hit record, so playback is ~4ms
after the first use.

## Scripts

```bash
npx tsx scripts/backfill-source-meta.mts --dry   # preview
npx tsx scripts/backfill-source-meta.mts         # fill in missing dates/durations
```

Re-runnable; only touches records still missing metadata, and downloads no
audio.
