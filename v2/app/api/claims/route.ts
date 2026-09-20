import { getOrExtractClaims } from "@/lib/claims-store";
import type { Transcript } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Triage the claims in a transcript (optionally one speaker's words). Cached in Postgres by
 * the scoped text, so re-opening the same speech does not pay for another model call.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    transcript?: Transcript;
    speakerId?: string | null;
    force?: boolean;
    source?: string;
    title?: string;
  } | null;

  if (!body?.transcript?.words?.length) {
    return Response.json({ error: "No transcript supplied." }, { status: 400 });
  }

  try {
    const report = await getOrExtractClaims(body.transcript, body.speakerId ?? null, {
      force: body.force === true,
      source: typeof body.source === "string" ? body.source : null,
      title: typeof body.title === "string" ? body.title : null,
    });
    return Response.json(report);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Claim extraction failed." },
      { status: 502 },
    );
  }
}
