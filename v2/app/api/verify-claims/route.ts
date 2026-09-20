import { hasRecentAlert, raiseAlert } from "@/lib/alerts";
import { CLAIM_TYPES, type ClaimType } from "@/lib/claims";
import { getClaimSetSource, saveVerifications } from "@/lib/claims-store";
import { env } from "@/lib/env";
import { verifyClaims, type ClaimVerification } from "@/lib/verification";

export const runtime = "nodejs";
export const maxDuration = 60;

function isClaimType(value: unknown): value is ClaimType {
  return typeof value === "string" && (CLAIM_TYPES as readonly string[]).includes(value);
}

/**
 * Match already-extracted claims against existing human fact-checks, and look up official
 * figures for economic statistics. Only checkable claims should be sent; the caller decides
 * which ones those are. Pass `claimSetId` to persist the matches and raise an alert when
 * checkable claims come back with no source at all.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    claims?: unknown;
    claimSetId?: unknown;
  } | null;

  const claims = Array.isArray(body?.claims)
    ? body.claims
        .filter(
          (claim): claim is { id: string; text: string; type?: unknown } =>
            Boolean(claim) &&
            typeof (claim as { id?: unknown }).id === "string" &&
            typeof (claim as { text?: unknown }).text === "string",
        )
        .map((claim) => ({
          id: claim.id,
          text: claim.text,
          // An unrecognised type never triggers the economic lookup.
          type: isClaimType(claim.type) ? claim.type : ("value" as ClaimType),
        }))
    : [];

  if (claims.length === 0) {
    return Response.json({ error: "No claims supplied." }, { status: 400 });
  }

  if (!env.hasFactCheck()) {
    return Response.json(
      { error: "GOOGLE_FACTCHECK_API_KEY is not set, so claims cannot be matched yet." },
      { status: 503 },
    );
  }

  try {
    const report = await verifyClaims(claims);

    if (typeof body?.claimSetId === "string") {
      await saveVerifications(body.claimSetId, report.results);
      await alertUnsupported(body.claimSetId, report.results, claims);
    }

    return Response.json(report);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Claim matching failed." },
      { status: 502 },
    );
  }
}

/**
 * A checkable claim with neither a fact-check nor an official figure is the "unsupported" case
 * the brief cares about, so it raises an alert. Best effort — never fail the request over it.
 */
async function alertUnsupported(
  claimSetId: string,
  results: ClaimVerification[],
  claims: Array<{ id: string; text: string }>,
): Promise<void> {
  const unsupported = results.filter((result) => result.status === "no_match" && !result.data);
  if (unsupported.length === 0) return;

  try {
    const meta = await getClaimSetSource(claimSetId);
    const speech = meta?.title?.trim() || meta?.source?.trim() || "A speech";
    // Dedupe on a stable title, so re-checking the same speech cannot spam the channel.
    const title = `Unsupported claims in ${speech}`;
    if (await hasRecentAlert("unsupported_claim", title)) return;

    const example = claims.find((claim) => claim.id === unsupported[0].id)?.text ?? "";
    await raiseAlert({
      kind: "unsupported_claim",
      severity: unsupported.length >= 3 ? "high" : "medium",
      title,
      detail:
        `${unsupported.length} of ${results.length} checkable claims have no fact-check or official figure.` +
        (example ? ` e.g. “${example.slice(0, 120)}”` : ""),
      source: meta?.source ?? null,
      value: unsupported.length,
    });
  } catch {
    // A missed alert is not worth failing the request over.
  }
}
