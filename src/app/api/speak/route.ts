import { elevenLabsKey } from "@/lib/env";
import { stripTags } from "@/lib/roast";
import { DEFAULT_VOICE_ID, TTS_MODEL_ID } from "@/lib/voices";

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
        "xi-api-key": elevenLabsKey(),
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
    throw new Error(`ElevenLabs TTS ${res.status}: ${await res.text()}`);
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

    const voiceId = body.voiceId || DEFAULT_VOICE_ID;
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
