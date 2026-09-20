import { overrideSpeechMeta } from "@/lib/reports";
import { normalizeMeta } from "@/lib/speech-meta";

export const runtime = "nodejs";

/**
 * Correct the labels on a speech. `key` is the speech's video id (or its title when there is
 * none), which is how the leaderboard groups rows together.
 */
export async function PATCH(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    key?: unknown;
    politician?: unknown;
    party?: unknown;
    topic?: unknown;
  } | null;

  const key = typeof body?.key === "string" ? body.key.trim() : "";
  if (!key) {
    return Response.json({ error: "A speech key is required." }, { status: 400 });
  }

  try {
    const meta = normalizeMeta({
      politician: body?.politician,
      party: body?.party,
      topic: body?.topic,
    });
    const updated = await overrideSpeechMeta(key, meta);
    if (updated === 0) {
      return Response.json({ error: "No speech matches that key." }, { status: 404 });
    }
    return Response.json({ ok: true, updated, meta });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not save the labels." },
      { status: 502 },
    );
  }
}
