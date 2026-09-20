import type { Claim } from "./claims";
import { lookupEconomicData, type DataEvidence } from "./economic";
import { env } from "./env";

/**
 * Verify the checkable claims two ways, always with a citation:
 *  - match against human fact-checks that already exist (Google Fact Check Tools API);
 *  - for economic statistics, show the latest official figure (FRED).
 *
 * We never adjudicate truth. A miss means "nobody has checked this", not "false".
 */

const ENDPOINT = "https://factchecktools.googleapis.com/v1alpha1/claims:search";

/** Bound the fan-out so one transcript cannot burn the whole quota. */
const MAX_CLAIMS = 15;
const CONCURRENCY = 3;
const MAX_MATCHES_PER_CLAIM = 3;

export interface FactCheckMatch {
  /** The outlet that published the review. */
  publisher: string;
  /** Their verdict, e.g. "False", "Mostly True". */
  rating: string;
  title: string;
  url: string;
  reviewDate: string | null;
  /** The claim as it was fact-checked, so the user can judge the match. */
  claim: string;
}

export type VerificationStatus = "matched" | "no_match" | "error";

export interface ClaimVerification {
  id: string;
  status: VerificationStatus;
  error?: string;
  matches: FactCheckMatch[];
  /** Latest official figure when the claim is an economic statistic we recognise. */
  data?: DataEvidence | null;
}

export interface VerifyReport {
  results: ClaimVerification[];
}

const STOPWORDS = new Set([
  "the", "and", "for", "that", "this", "with", "from", "have", "has", "had", "was", "were",
  "are", "is", "be", "been", "being", "will", "would", "can", "could", "should", "our", "your",
  "their", "they", "them", "his", "her", "its", "it", "not", "but", "all", "any", "some",
  "more", "most", "than", "then", "there", "here", "about", "into", "over", "after", "before",
  "you", "we", "us", "who", "what", "when", "where", "why", "how",
]);

function tokens(text: string): Set<string> {
  const out = new Set<string>();
  for (const raw of text.toLowerCase().split(/[^a-z0-9.]+/)) {
    const token = raw.replace(/^\.+|\.+$/g, "");
    if (token.length < 2 || STOPWORDS.has(token)) continue;
    out.add(token);
  }
  return out;
}

/** Loose relatedness gate: unrelated reviews are worse than no review at all. */
function related(target: Set<string>, candidate: Set<string>): boolean {
  let shared = 0;
  for (const token of target) {
    if (candidate.has(token)) shared += 1;
    if (shared >= 2) return true;
  }
  return false;
}

type RawReview = {
  publisher?: { name?: string; site?: string };
  url?: string;
  title?: string;
  reviewDate?: string;
  textualRating?: string;
};

type RawClaim = {
  text?: string;
  claimReview?: RawReview[];
};

async function matchFactChecks(claim: Pick<Claim, "id" | "text">): Promise<{
  status: VerificationStatus;
  error?: string;
  matches: FactCheckMatch[];
}> {
  const url = new URL(ENDPOINT);
  url.searchParams.set("query", claim.text);
  url.searchParams.set("key", env.factCheckApiKey);
  url.searchParams.set("languageCode", "en");
  url.searchParams.set("pageSize", "10");

  try {
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) {
      return {
        status: "error",
        error: `Fact Check Tools returned ${response.status}.`,
        matches: [],
      };
    }

    const payload = (await response.json()) as { claims?: RawClaim[] };
    const target = tokens(claim.text);
    const matches: FactCheckMatch[] = [];
    const seen = new Set<string>();

    for (const item of payload.claims ?? []) {
      if (!related(target, tokens(item.text ?? ""))) continue;
      for (const review of item.claimReview ?? []) {
        if (!review.url || seen.has(review.url)) continue;
        seen.add(review.url);
        matches.push({
          publisher: review.publisher?.name ?? review.publisher?.site ?? "Unknown outlet",
          rating: review.textualRating?.trim() || "No rating given",
          title: review.title?.trim() || item.text?.trim() || claim.text,
          url: review.url,
          reviewDate: review.reviewDate ?? null,
          claim: item.text?.trim() ?? "",
        });
        if (matches.length >= MAX_MATCHES_PER_CLAIM) break;
      }
      if (matches.length >= MAX_MATCHES_PER_CLAIM) break;
    }

    return { status: matches.length > 0 ? "matched" : "no_match", matches };
  } catch (error) {
    return {
      status: "error",
      error: error instanceof Error ? error.message : "Lookup failed.",
      matches: [],
    };
  }
}

async function checkOne(
  claim: Pick<Claim, "id" | "text" | "type">,
): Promise<ClaimVerification> {
  // The two lookups are independent: a missing fact-check shouldn't hide the official figure.
  const [factCheck, data] = await Promise.all([
    matchFactChecks(claim),
    claim.type === "statistic" ? lookupEconomicData(claim.text) : Promise.resolve(null),
  ]);

  return {
    id: claim.id,
    status: factCheck.status,
    error: factCheck.error,
    matches: factCheck.matches,
    data,
  };
}

export async function verifyClaims(
  claims: Array<Pick<Claim, "id" | "text" | "type">>,
): Promise<VerifyReport> {
  const queue = claims.slice(0, MAX_CLAIMS);
  const results: ClaimVerification[] = [];

  const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    for (;;) {
      const next = queue.shift();
      if (!next) return;
      results.push(await checkOne(next));
    }
  });
  await Promise.all(workers);

  // Keep the caller's order so the sheet does not reshuffle under the user.
  const order = new Map(claims.map((claim, index) => [claim.id, index]));
  results.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

  return { results };
}
