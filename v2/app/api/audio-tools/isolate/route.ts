import { env } from "@/lib/env";
import { upstreamError } from "@/lib/errors";

export const runtime = "nodejs";
export const maxDuration = 120;

const ELEVENLABS_ISOLATION_URL = "https://api.elevenlabs.io/v1/audio-isolation";
/** Reject oversized uploads before buffering them into memory and re-posting. */
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/**
 * Proxy an uploaded clip to ElevenLabs' audio isolation (voice isolator) and stream the
 * cleaned speech back. The API only accepts a file, so the browser uploads one.
 */
export async function POST(request: Request) {
  const incoming = await request.formData().catch(() => null);
  const file = incoming?.get("audio");

  if (!(file instanceof File) || file.size === 0) {
    return Response.json({ error: "Attach an audio or video file to isolate." }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return Response.json(
      { error: "That file is too large (25 MB max)." },
      { status: 413 },
    );
  }

  const form = new FormData();
  form.set("audio", file, file.name || "input");

  try {
    const response = await fetch(ELEVENLABS_ISOLATION_URL, {
      method: "POST",
      headers: { "xi-api-key": env.elevenLabsApiKey },
      body: form,
    });

    if (!response.ok || !response.body) {
      const detail = await response.text().catch(() => "");
      return Response.json(
        { error: upstreamError("ElevenLabs isolation", response.status, detail).message },
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
      { error: error instanceof Error ? error.message : "Audio isolation failed." },
      { status: 502 },
    );
  }
}
