import { env } from "@/lib/env";
import { upstreamError } from "@/lib/errors";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Mints a single-use token so the browser can open the Scribe realtime
 * WebSocket directly. The API key never leaves the server.
 */
export async function POST() {
  try {
    const res = await fetch(
      "https://api.elevenlabs.io/v1/single-use-token/realtime_scribe",
      { method: "POST", headers: { "xi-api-key": env.elevenLabsApiKey } },
    );
    if (!res.ok) {
      const detail = await res.text();
      return Response.json(
        { error: upstreamError("ElevenLabs token request", res.status, detail).message },
        { status: 502 },
      );
    }
    const data = (await res.json()) as { token?: string };
    if (!data.token) {
      return Response.json({ error: "No token in response" }, { status: 502 });
    }
    return Response.json({ token: data.token });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
