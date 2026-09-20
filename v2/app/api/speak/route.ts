import { env } from "@/lib/env";
import { upstreamError } from "@/lib/errors";
import { stripTags } from "@/lib/roast";
import { DEFAULT_VOICE_ID, TTS_MODEL_ID, VOICES } from "@/lib/voices";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Longest line we will synthesize; the roast bank is far shorter. */
const MAX_TEXT_LENGTH = 1_000;

/**
 * The roast lines come from a fixed bank, so the same audio is requested over
 * and over within a session. Caching them in memory means the expressive (but
 * slower) v3 model only costs latency the first time a line is used, and
 * `warm: true` requests let the client pay that cost before recording starts.
 */
const cache = new Map<string, ArrayBuffer>();
const MAX_CACHED = 64;

function cacheKey(voiceId: string, text: string) {
  return `${voiceId}::${TTS_MODEL_ID}::${text}`;
}

async function synthesize(voiceId: string, text: string): Promise<ArrayBuffer> {
  const key = cacheKey(voiceId, text);
  const hit = cache.get(key);
  if (hit) return hit;

  const usesTags = TTS_MODEL_ID.startsWith("eleven_v3");
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: {
        "xi-api-key": env.elevenLabsApiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: usesTags ? text : stripTags(text),
        model_id: TTS_MODEL_ID,
        // Low stability keeps the delivery expressive rather than flat, which
        // is what makes the shouted lines land.
        voice_settings: { stability: 0.3, similarity_boost: 0.75, style: 0.6 },
      }),
    },
  );

  if (!res.ok) {
    throw upstreamError("ElevenLabs TTS", res.status, await res.text());
  }

  const audio = await res.arrayBuffer();
  if (cache.size >= MAX_CACHED) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, audio);
  return audio;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      text?: string;
      voiceId?: string;
      /** Synthesize and cache without returning the audio. */
      warm?: boolean;
    };
    const text = body.text?.trim();
    if (!text) return Response.json({ error: "Empty text" }, { status: 400 });
    if (text.length > MAX_TEXT_LENGTH) {
      return Response.json({ error: "Text too long" }, { status: 400 });
    }

    // Only allow a voice we ship; the id is interpolated into the upstream URL.
    const requested = body.voiceId;
    const voiceId =
      requested && VOICES.some((voice) => voice.id === requested)
        ? requested
        : DEFAULT_VOICE_ID;
    const audio = await synthesize(voiceId, text);

    if (body.warm) return Response.json({ ok: true, bytes: audio.byteLength });

    return new Response(audio, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 502 },
    );
  }
}
