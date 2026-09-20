import { env } from "@/lib/env";
import { scoreChunk } from "@/lib/live-scoring";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Scores one live chunk of transcript with GPTZero. The `/api/detect` route
 * next door scores a finished, diarized clip; this one takes raw streamed text
 * and returns a point-in-time verdict for the Live tab.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { text?: string; index?: number };
    const text = body.text?.trim();
    if (!text) {
      return Response.json({ error: "Empty document" }, { status: 400 });
    }
    // The API rejects documents over 50000 characters.
    if (text.length > 50_000) {
      return Response.json({ error: "Document too long" }, { status: 400 });
    }
    if (!env.hasGptzero()) {
      return Response.json(
        { error: "GPTZero is not configured." },
        { status: 503 },
      );
    }
    const detection = await scoreChunk(text, body.index ?? 0);
    return Response.json(detection);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 502 },
    );
  }
}
