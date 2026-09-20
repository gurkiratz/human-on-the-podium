# Human on the Podium

When AI-written text is read aloud, it is hard to catch by ear. This finds out
how much of a speech — or an appointment record — a machine wrote.

Four surfaces over one detection pipeline:

|                            | What it does                                                                                                                                                                                              |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Live** (`/`)             | Transcribes you as you talk, analyzes each chunk, and cuts you off out loud the moment you start reading AI text.                                                                                         |
| **Analyze** (`/youtube`)   | Takes a sixty-second excerpt from a speech or talk by an MP and returns its AI share, transcript, and sentence-level evidence.                                                                            |
| **Database** (`/database`) | Every record analyzed so far, searchable, with the evidence behind each reading.                                                                                                                          |
| **Map** (`/map`)           | The whole corpus placed by meaning and coloured by AI share. Records that say the same thing sit together, so a tight knot in two colours is the detector reading near-identical text two different ways. |

```bash
npm run dev
```

Needs `.env` in the project root:

```
GPT_ZERO_API_KEY=...
11LABS_API_KEY=...
ELASTIC_URL=...
ELASTIC_API_KEY=...
```

`yt-dlp` and `ffmpeg` must be on `PATH` for the Analyze page. A project-local
`yt-dlp` in `bin/` is used when present, or set `YT_DLP_PATH`.

## Tech stack

| Layer            | Choice                                                                                       |
| ---------------- | -------------------------------------------------------------------------------------------- |
| Framework        | Next.js 16 (App Router, Turbopack), React 19, TypeScript, TanStack Table v8                  |
| Tables           | TanStack Table v8                                                                            |
| Vectors          | elastic.co Serverless (`dense_vector` + kNN)                                                 |
| Audio capture    | `getUserMedia` + an AudioWorklet (`public/worklets/pcm-recorder.js`) emitting PCM16 @ 16 kHz |
| Media extraction | `yt-dlp` and `ffmpeg`, shelled out from the Node runtime                                     |
| Storage          | Local SQLite via `node:sqlite`, file at `data/sloppy.db` (gitignored)                        |
| Hardware         | ESP32-C3 badge (Arduino sketch in `badge_detect/wifi_api`): 6 WS2812 LEDs, ST7789 screen, HTTP API |

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

**Written records**

CSVs of government appointment records (`title, source, body, source_type`),
filed with `source_type = 'doc'`. Two formats are handled, and they differ in
ways that matter:

- Provincial Orders in Council open `Order in Council ... <Month D, YYYY>`.
- Federal Privy Council orders carry a labelled `Date: YYYY-MM-DD`, and arrive
  with their line breaks escaped as the two characters `\` and `n`.

So the ingest unescapes the body before storing it, and reads the labelled ISO
date first, falling back to the prose form bounded to the first 200 characters
— dates deeper into those texts are effective dates and term ends, not the
date of the order.

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

## The badge

A physical ESP32-C3 badge mirrors the Live reading: six LEDs change colour and the
screen shows the AI share. The badge runs its own small HTTP server on the local
network, so the app just calls it. The Arduino sketch is in
`badge_detect/wifi_api.ino`. It needs the ESP32 board package and the
Adafruit NeoPixel, Adafruit GFX and Adafruit ST7735 and ST7789 libraries, and the
Wi-Fi name and password are set at the top of the sketch.

| Call                                    | Effect                                                                  |
| --------------------------------------- | ----------------------------------------------------------------------- |
| `POST /api/score {"score": 87}`         | Screen shows `87% AI`, red at 50 and above, green below                 |
| `POST /api/score {"score": -1}`         | Screen shows `Analyzing` (use while a chunk is being scored)            |
| `POST /api/led {"state": "flash_red"}`  | LEDs: `off`, `yellow`, `green`, `red`, `flash_red` or `flash_green`     |
| `GET /api/led`, `GET /api/score`        | Read the current LED state or score                                     |
| `GET /api/status`                       | LED state, score, IP and uptime (works as a heartbeat)                  |

```bash
curl "http://<badge-ip>/api/status"
curl "http://<badge-ip>/api/led?state=green"
curl "http://<badge-ip>/api/score?score=-1"
```

(On Windows PowerShell, use `curl.exe`.)

Things to know:

- The badge and the machine calling it must be on the same 2.4 GHz Wi-Fi. The badge
  shows its IP at the bottom of the screen, and opening `http://<badge-ip>/` in a
  browser gives a manual button page for testing the LEDs.
- It is plain HTTP with no authentication, for local-network use only.
- State isn't saved: after a reboot the LEDs are off and the screen says `Analyzing`.
  Re-send the state if `uptime_s` in `/api/status` resets.
- There are no CORS headers, so call it from a server route, not directly from the browser.

## The map

`scripts/build-embeddings.mts` embeds each record, indexes the vector in
Elasticsearch, then projects every vector to 2D and caches `x,y` on the SQLite
row. Notes worth keeping:

- **Dense, not sparse.** ELSER produces weighted term expansions, which cannot
  be projected onto a canvas. The default is `.jina-embeddings-v5-text-small`
  (1024 dims) via Elastic-hosted inference, so there is no second provider key.
  Swap `EMBED_MODEL` and `EMBED_DIMS` together in `src/lib/elastic.ts`.
- **UMAP is seeded.** An unseeded run redraws the map differently every time,
  which destroys any sense of place.
- **Elasticsearch 9 keeps `dense_vector` out of `_source`.** A plain `get`
  returns the document without its vector and kNN then finds nothing, with no
  error. Reads that need the vector pass `_source: { exclude_vectors: false }`.
- **Projection happens once, not in the browser.** The page reads flat rows.

Clicking a dot runs a kNN query for the records nearest in meaning and shows
their readings next to each other — which is where the detector's
disagreements become legible.

## Reading the result

Every reading is shown as the **share of the excerpt that reads as
machine-written**, never as a bare verdict word. A lone "HUMAN" stamp reads as
a hard ruling even when the model is hedging, so the number carries its own
unit (`28% AI`) and a plain-language band sits beside it:

| AI share | Reads            |
| -------- | ---------------- |
| 0–9%     | Human hands      |
| 10–29%   | Mostly human     |
| 30–54%   | Ghostwriter?     |
| 55–79%   | Leans machine    |
| 80–100%  | Reads like a bot |

The scale lives in `src/components/ai-scale.tsx` and is shared by every surface;
its colors are CSS variables, retuned per theme rather than duplicated.

These are machine assessments of transcribed speech and written records, not
proof of authorship.

## What the findings doc changed

`GPT_ZERO_FINDINGS.md` drove three decisions worth knowing about:

- **Sentence level, not paragraph level.** A transcript has no line breaks, so
  every sentence lands in one paragraph that comes back 0.000. Highlighting
  uses `sentences[].class_probabilities.ai` against a 0.65 threshold, and
  ignores `highlight_sentence_for_ai`, which was false even for known AI
  sentences.
- **70 words is the floor for casual speech.** Chunks below it are marked
  `thin`.
- **Thin chunks are trusted in one direction only.** A short chunk can miss AI
  text but never invents it, so a thin `ai` verdict is spoken aloud while a
  thin `human` verdict is shown as insufficient evidence and never praised.
  This is what stops the app congratulating you for a half-sentence.

## Tuning

| What                              | Where                                            |
| --------------------------------- | ------------------------------------------------ |
| Chunk size, pause threshold       | `src/lib/chunker.ts`                             |
| Sentence highlight threshold      | `src/lib/constants.ts`                           |
| AI-share bands and labels         | `src/components/ai-scale.tsx`                    |
| Embedding model and dimensions    | `src/lib/elastic.ts`                             |
| Contested-neighbourhood threshold | `DISAGREEMENT` in `src/app/map/page.tsx`         |
| Concurrent analyze jobs           | `MAX_YOUTUBE_JOBS` in `src/lib/constants.ts`     |
| Roast lines                       | `src/lib/roast.ts`                               |
| Voices, TTS model                 | `src/lib/voices.ts`                              |
| Praise cooldown                   | `PRAISE_COOLDOWN_MS` in `src/lib/useDetector.ts` |
| Badge colours, thresholds, screen layout | `badge_detect/wifi_api.ino` |

The roast lines use `eleven_v3` so the `[shouting]` tags actually shout, which
costs ~3.4s to synthesize. `/api/speak` caches every line in memory and the
client pre-warms the common ones when you hit record, so playback is ~4ms
after the first use.

## Scripts

```bash
# Analyze a CSV of written records and file them
npx tsx scripts/ingest-appointments.mts --file data/your.csv --dry
npx tsx scripts/ingest-appointments.mts --file data/your.csv

# Embed anything new, then reproject the whole corpus
npx tsx scripts/build-embeddings.mts
npx tsx scripts/build-embeddings.mts --project    # reproject only, no API calls
npx tsx scripts/build-embeddings.mts --reembed    # rebuild every vector

# Fill in dates and durations for records filed before we captured them
npx tsx scripts/backfill-source-meta.mts --dry
npx tsx scripts/backfill-source-meta.mts
```

All three are re-runnable and skip work already done, so an interrupted run can
simply be repeated without paying for it twice.
