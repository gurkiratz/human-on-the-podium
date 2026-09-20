import { CLAIM_SET_ID, saveReview, type ReviewVerdict } from "@/lib/claims-store";

export const runtime = "nodejs";

const VERDICTS: readonly ReviewVerdict[] = ["confirmed", "rejected", "flagged"];

/**
 * Record a human's ruling on one claim's automated result. Send `verdict: null` to clear it.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!CLAIM_SET_ID.test(id)) {
    return Response.json({ error: "Unknown claim set." }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as {
    claimId?: unknown;
    verdict?: unknown;
  } | null;

  const claimId = typeof body?.claimId === "string" ? body.claimId.trim() : "";
  if (!claimId) {
    return Response.json({ error: "A claim id is required." }, { status: 400 });
  }

  const raw = body?.verdict;
  const verdict: ReviewVerdict | null | undefined =
    raw === null
      ? null
      : typeof raw === "string" && (VERDICTS as readonly string[]).includes(raw)
        ? (raw as ReviewVerdict)
        : undefined;

  if (verdict === undefined) {
    return Response.json(
      { error: "Verdict must be confirmed, rejected, flagged or null." },
      { status: 400 },
    );
  }

  try {
    const updated = await saveReview(id, claimId, verdict);
    if (!updated) {
      return Response.json({ error: "Claim set not found." }, { status: 404 });
    }
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not save the review." },
      { status: 502 },
    );
  }
}
