# Sloppy

Live AI speech detector. It transcribes you as you talk, scores what you said
with GPTZero, and cuts you off with a shouted insult the moment you start
reading AI text out loud.

```bash
npm run dev
```

Needs `.env` in the project root:

```
GPT_ZERO_API_KEY=...
11LABS_API_KEY=...
```

## How the loop works

1. **Capture** — `getUserMedia` on the chosen mic, an AudioWorklet
   (`public/worklets/pcm-recorder.js`) converts it to PCM16 at 16 kHz.
2. **Transcribe** — streamed to the ElevenLabs Scribe v2 realtime WebSocket.
   The browser connects directly using a single-use token minted by
   `/api/scribe-token`, so the API key stays on the server.
3. **Chunk** — `src/lib/chunker.ts` banks committed words and releases a chunk
   at 80 words, or after 2.5s of silence if at least 40 words are waiting.
   Chunks never overlap, so each word is billed to GPTZero exactly once.
4. **Score** — `/api/detect` calls GPTZero `/v2/predict/text`.
5. **React** — `/api/speak` returns ElevenLabs audio for a line from
   `src/lib/roast.ts`. The mic is hard-muted before playback starts and
   reopened when it ends, so the app never transcribes its own voice.

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
| Roast lines | `src/lib/roast.ts` |
| Voices, TTS model | `src/lib/voices.ts` |
| Praise cooldown | `PRAISE_COOLDOWN_MS` in `src/lib/useDetector.ts` |

The roast lines use `eleven_v3` so the `[shouting]` tags actually shout, which
costs ~3.4s to synthesize. `/api/speak` caches every line in memory and the
client pre-warms the common ones when you hit record, so playback is ~4ms
after the first use.
