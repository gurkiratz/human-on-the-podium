import { env } from "@/lib/env";
import { upstreamError } from "@/lib/errors";

export const runtime = "nodejs";
export const maxDuration = 120;

const ELEVENLABS_SFX_URL =
  "https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128";

const MAX_DURATION_SECONDS = 30;

/** Generate a sound effect from a text prompt and stream the MP3 back. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    text?: string;
    durationSeconds?: number;
  } | null;

  const text = body?.text?.trim();
  if (!text) {
    return Response.json({ error: "Describe the sound effect you want." }, { status: 400 });
  }

  const duration =
    typeof body?.durationSeconds === "number" && Number.isFinite(body.durationSeconds)
      ? Math.min(Math.max(body.durationSeconds, 0.5), MAX_DURATION_SECONDS)
      : undefined;

  try {
    const response = await fetch(ELEVENLABS_SFX_URL, {
      method: "POST",
      headers: {
        "xi-api-key": env.elevenLabsApiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({ text, duration_seconds: duration }),
    });

    if (!response.ok || !response.body) {
      const detail = await response.text().catch(() => "");
      return Response.json(
        { error: upstreamError("ElevenLabs sound effect", response.status, detail).message },
        { status: 502 },
      );
    }

    return new Response(response.body, {
      headers: {
        "Content-Type": response.headers.get("content-type") ?? "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Sound effect generation failed." },
      { status: 502 },
    );
  }
}
