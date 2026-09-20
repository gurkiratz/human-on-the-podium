import { createHash } from "node:crypto";
import { extractClaims, type ClaimReport } from "./claims";
import { jsonb, query } from "./db";
import type { ClaimVerification } from "./verification";

/**
 * Claims are expensive (a model call) and so is matching them (external lookups), so a
 * transcript's claim sheet is cached in Postgres. The key is a hash of the scoped text, so
 * the same speech seen again — from a project, the library, or a re-open — is free.
 */

export interface StoredClaimSet extends ClaimReport {
  id: string;
  /** claimId -> verification result, so matches survive a reload. */
  verifications: Record<string, ClaimVerification>;
  /** claimId -> a human's ruling on the automated result. */
  reviews: Record<string, ClaimReview>;
  /** The speech this sheet came from, so alerts can name it. */
  source: string | null;
  title: string | null;
  cached: boolean;
}

export type ReviewVerdict = "confirmed" | "rejected" | "flagged";

export interface ClaimReview {
  verdict: ReviewVerdict;
  at: string;
}

type ClaimSetRow = {
  id: string;
  speaker_id: string | null;
  scorable: boolean;
  reason: string | null;
  word_count: number;
  checkable_count: number;
  claims: ClaimReport["claims"];
  verifications: Record<string, ClaimVerification>;
  reviews: Record<string, ClaimReview>;
  source: string | null;
  title: string | null;
};

/** Claim-set ids are truncated sha256 digests. */
export const CLAIM_SET_ID = /^[a-f0-9]{32}$/;

export function claimSetId(transcriptText: string, speakerId: string | null): string {
  return createHash("sha256")
    .update(`${speakerId ?? "all"}:${transcriptText}`)
    .digest("hex")
    .slice(0, 32);
}

async function getStored(id: string): Promise<StoredClaimSet | null> {
  const { rows } = await query<ClaimSetRow>(`SELECT * FROM claim_sets WHERE id = $1`, [id]);
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    scopedTo: row.speaker_id,
    scorable: row.scorable,
    reason: row.reason ?? undefined,
    wordCount: row.word_count,
    checkableCount: row.checkable_count,
    claims: row.claims ?? [],
    verifications: row.verifications ?? {},
    reviews: row.reviews ?? {},
    source: row.source,
    title: row.title,
    cached: true,
  };
}

export async function getOrExtractClaims(
  transcript: Parameters<typeof extractClaims>[0],
  speakerId: string | null,
  options: { force?: boolean; source?: string | null; title?: string | null } = {},
): Promise<StoredClaimSet> {
  const id = claimSetId(transcript.text, speakerId);
  const source = options.source?.trim() || null;
  const title = options.title?.trim() || null;

  if (!options.force) {
    const existing = await getStored(id);
    if (existing) return existing;
  }

  const report = await extractClaims(transcript, speakerId);

  await query(
    `INSERT INTO claim_sets (
       id, speaker_id, scorable, reason, word_count, checkable_count, claims, source, title
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (id) DO UPDATE SET
       speaker_id      = EXCLUDED.speaker_id,
       scorable        = EXCLUDED.scorable,
       reason          = EXCLUDED.reason,
       word_count      = EXCLUDED.word_count,
       checkable_count = EXCLUDED.checkable_count,
       claims          = EXCLUDED.claims,
       source          = EXCLUDED.source,
       title           = EXCLUDED.title,
       updated_at      = now()`,
    [
      id,
      speakerId,
      report.scorable,
      report.reason ?? null,
      report.wordCount,
      report.checkableCount,
      jsonb(report.claims),
      source,
      title,
    ],
  );

  return { ...report, id, verifications: {}, reviews: {}, source, title, cached: false };
}

/** The speech a claim set belongs to, for raising a named alert from the verify route. */
export async function getClaimSetSource(
  id: string,
): Promise<{ source: string | null; title: string | null; speakerId: string | null } | null> {
  const { rows } = await query<{
    source: string | null;
    title: string | null;
    speaker_id: string | null;
  }>(`SELECT source, title, speaker_id FROM claim_sets WHERE id = $1`, [id]);
  const row = rows[0];
  if (!row) return null;
  return { source: row.source, title: row.title, speakerId: row.speaker_id };
}

export interface ReviewStats {
  confirmed: number;
  rejected: number;
  flagged: number;
  reviewed: number;
  /** Share of ruled-on matches a human upheld. Null until something has been reviewed. */
  precision: number | null;
}

/** Tally of every human ruling, so match quality is a number rather than a feeling. */
export async function reviewStats(): Promise<ReviewStats> {
  const { rows } = await query<{
    confirmed: number;
    rejected: number;
    flagged: number;
  }>(
    `SELECT
       count(*) FILTER (WHERE entry.value->>'verdict' = 'confirmed')::int AS confirmed,
       count(*) FILTER (WHERE entry.value->>'verdict' = 'rejected')::int  AS rejected,
       count(*) FILTER (WHERE entry.value->>'verdict' = 'flagged')::int   AS flagged
     FROM claim_sets
     CROSS JOIN LATERAL jsonb_each(reviews) AS entry(key, value)`,
  );

  const confirmed = rows[0]?.confirmed ?? 0;
  const rejected = rows[0]?.rejected ?? 0;
  const flagged = rows[0]?.flagged ?? 0;
  const reviewed = confirmed + rejected + flagged;
  const ruled = confirmed + rejected;

  return {
    confirmed,
    rejected,
    flagged,
    reviewed,
    precision: ruled > 0 ? confirmed / ruled : null,
  };
}

/** Merge a batch of verification results into the stored sheet, keyed by claim id. */
export async function saveVerifications(
  id: string,
  results: ClaimVerification[],
): Promise<void> {
  if (results.length === 0) return;
  const patch = Object.fromEntries(results.map((result) => [result.id, result]));
  await query(
    `UPDATE claim_sets
        SET verifications = verifications || $2::jsonb,
            updated_at    = now()
      WHERE id = $1`,
    [id, jsonb(patch)],
  );
}

/**
 * Record (or clear) a human's ruling on one claim's automated result. Passing null clears it,
 * which is how a reviewer undoes a decision.
 */
export async function saveReview(
  id: string,
  claimId: string,
  verdict: ReviewVerdict | null,
): Promise<boolean> {
  if (verdict === null) {
    const { rowCount } = await query(
      `UPDATE claim_sets
          SET reviews = reviews - $2::text,
              updated_at = now()
        WHERE id = $1`,
      [id, claimId],
    );
    return (rowCount ?? 0) > 0;
  }

  const review: ClaimReview = { verdict, at: new Date().toISOString() };
  const { rowCount } = await query(
    `UPDATE claim_sets
        SET reviews = reviews || $2::jsonb,
            updated_at = now()
      WHERE id = $1`,
    [id, jsonb({ [claimId]: review })],
  );
  return (rowCount ?? 0) > 0;
}
