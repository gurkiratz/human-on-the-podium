"use client";

import { ShieldQuestion } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader } from "@/components/ui/loader";
import { cn } from "@/lib/utils";
import type { Claim, ClaimType } from "@/lib/claims";
import type { ClaimReview, ReviewVerdict, StoredClaimSet } from "@/lib/claims-store";
import type { DataEvidence } from "@/lib/economic";
import type { ClaimVerification, FactCheckMatch, VerifyReport } from "@/lib/verification";

const TYPE_LABEL: Record<ClaimType, string> = {
  statistic: "Statistic",
  causal: "Causal",
  predictive: "Prediction",
  definitional: "Definition",
  value: "Value",
  anecdote: "Anecdote",
  attribution: "Attribution",
};

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  return `${minutes}:${rest.toString().padStart(2, "0")}`;
}

function ratingTone(rating: string): string {
  const value = rating.toLowerCase();
  if (/(false|fake|wrong|incorrect|fake|pants|no evidence|misleading|distorts)/.test(value)) {
    return "text-red-300";
  }
  if (/(true|correct|accurate|right|confirmed)/.test(value)) {
    return "text-emerald-300";
  }
  return "text-amber-300";
}

export function ClaimPanel({
  report,
  loading,
  error,
  scopedLabel,
  onSeek,
}: {
  report: StoredClaimSet | null;
  loading: boolean;
  error: string | null;
  scopedLabel: string;
  /** Jump the video to a claim's moment, when there is a video to jump. */
  onSeek?: (seconds: number) => void;
}) {
  const [verification, setVerification] = useState<Map<string, ClaimVerification> | null>(null);
  const [reviews, setReviews] = useState<Map<string, ClaimReview>>(new Map());
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);

  // A new scope means a new claim set — seed from whatever was already matched and stored.
  useEffect(() => {
    setVerification(
      report && Object.keys(report.verifications).length > 0
        ? new Map(Object.entries(report.verifications))
        : null,
    );
    setReviews(new Map(Object.entries(report?.reviews ?? {})));
    setVerifyError(null);
    setReviewError(null);
  }, [report]);

  const checkable = report?.claims.filter((claim) => claim.checkable) ?? [];

  async function verify() {
    if (checkable.length === 0) return;
    setVerifying(true);
    setVerifyError(null);
    try {
      const response = await fetch("/api/verify-claims", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          claims: checkable.map((claim) => ({ id: claim.id, text: claim.text, type: claim.type })),
          claimSetId: report?.id,
        }),
      });
      const data = (await response.json()) as VerifyReport & { error?: string };
      if (!response.ok) throw new Error(data.error ?? `Matching failed (${response.status}).`);
      setVerification(new Map(data.results.map((result) => [result.id, result])));
    } catch (caught) {
      setVerifyError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setVerifying(false);
    }
  }

  /** Record a reviewer's ruling, or clear it when they click the active one again. */
  async function review(claimId: string, verdict: ReviewVerdict) {
    if (!report) return;
    const previous = reviews.get(claimId)?.verdict;
    const next = previous === verdict ? null : verdict;
    setReviewError(null);

    setReviews((current) => {
      const map = new Map(current);
      if (next === null) map.delete(claimId);
      else map.set(claimId, { verdict: next, at: new Date().toISOString() });
      return map;
    });

    try {
      const response = await fetch(`/api/claims/${report.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claimId, verdict: next }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `Could not save the review (${response.status}).`);
      }
    } catch (caught) {
      setReviewError(caught instanceof Error ? caught.message : String(caught));
      setReviews((current) => {
        const map = new Map(current);
        if (previous === undefined) map.delete(claimId);
        else map.set(claimId, { verdict: previous, at: new Date().toISOString() });
        return map;
      });
    }
  }

  if (loading) {
    return (
      <div className="glass flex items-center gap-3 rounded-2xl border border-border/70 px-5 py-4">
        <Loader variant="dots" size="sm" />
        <span className="text-xs text-muted-foreground">
          Finding claims in {scopedLabel}…
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass rounded-2xl border border-destructive/40 bg-destructive/5 px-5 py-4">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Claim sheet
        </p>
        <p className="mt-1 text-xs leading-relaxed text-foreground">{error}</p>
      </div>
    );
  }

  if (!report) return null;

  if (!report.scorable) {
    return (
      <div className="glass rounded-2xl border border-border/70 px-5 py-4">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Claim sheet
        </p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {report.reason ?? "Nothing to check yet."}
        </p>
      </div>
    );
  }

  const verified = verification ? [...verification.values()] : [];
  const matched = verified.filter((result) => result.matches.length > 0).length;
  const withData = verified.filter((result) => result.data).length;
  const needsChecking = verified.filter(
    (result) => result.status === "no_match" && !result.data,
  ).length;
  const failed = verified.filter((result) => result.status === "error").length;
  const reviewed = reviews.size;

  return (
    <div
      data-testid="claim-panel"
      className="glass flex flex-col gap-3 rounded-2xl border border-border/70 px-5 py-4"
    >
      <div className="flex items-start justify-between gap-4">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          <ShieldQuestion className="size-3.5" />
          Claim sheet · {scopedLabel}
        </span>
        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
          {report.claims.length} claims · {report.checkableCount} checkable
        </span>
      </div>

      {report.claims.length === 0 ? (
        <p className="text-xs leading-relaxed text-muted-foreground">
          No assertions found — this reading is all rhetoric and pleasantries.
        </p>
      ) : (
        <ol className="flex flex-col gap-2">
          {report.claims.map((claim) => (
            <ClaimRow
              key={claim.id}
              claim={claim}
              verification={verification?.get(claim.id)}
              review={reviews.get(claim.id)}
              onSeek={onSeek}
              onReview={(verdict) => void review(claim.id, verdict)}
            />
          ))}
        </ol>
      )}

      {checkable.length > 0 ? (
        <div className="flex flex-wrap items-center gap-3 border-t border-border/60 pt-3">
          <Button
            size="sm"
            variant="outline"
            className="gap-2 border-border/70"
            onClick={() => void verify()}
            disabled={verifying}
          >
            {verifying ? <Loader variant="dots" size="sm" /> : null}
            {verifying
              ? "Checking…"
              : verification
                ? "Re-check"
                : `Check ${checkable.length} checkable claim${checkable.length === 1 ? "" : "s"}`}
          </Button>
          {verification ? (
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {[
                `${matched} matched`,
                `${withData} official figures`,
                `${needsChecking} unsupported`,
              ]
                .concat(reviewed ? [`${reviewed} reviewed`] : [])
                .concat(failed ? [`${failed} failed`] : [])
                .join(" · ")}
            </span>
          ) : null}
        </div>
      ) : null}

      {verifyError ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[11px] text-foreground">
          {verifyError}
        </p>
      ) : null}

      {reviewError ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[11px] text-foreground">
          {reviewError}
        </p>
      ) : null}

      <p className="border-t border-border/60 pt-2 text-[11px] leading-relaxed text-muted-foreground">
        Checkable means a source could confirm or refute the claim. Matches come from existing
        published fact-checks (Google Fact Check Tools) and official figures (FRED). “Unsupported”
        means no source was found — not that the claim is false.
      </p>
    </div>
  );
}

function ClaimRow({
  claim,
  verification,
  review,
  onSeek,
  onReview,
}: {
  claim: Claim;
  verification?: ClaimVerification;
  review?: ClaimReview;
  onSeek?: (seconds: number) => void;
  onReview?: (verdict: ReviewVerdict) => void;
}) {
  const at = claim.start;
  return (
    <li
      className={cn(
        "rounded-xl border-l-2 bg-card/40 px-3 py-2",
        claim.checkable ? "border-l-amber-400/70" : "border-l-border",
      )}
    >
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide">
        {at === null ? (
          <span className="tabular-nums text-muted-foreground">—:—</span>
        ) : onSeek ? (
          <button
            type="button"
            onClick={() => onSeek(at)}
            title="Play from this moment"
            className="rounded tabular-nums text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {formatTime(at)}
          </button>
        ) : (
          <span className="tabular-nums text-muted-foreground">{formatTime(at)}</span>
        )}
        <span className="rounded-full border border-border/70 px-2 py-0.5 text-muted-foreground">
          {TYPE_LABEL[claim.type]}
        </span>
        <span
          className={cn(
            "rounded-full border px-2 py-0.5 font-semibold",
            claim.checkable
              ? "border-amber-400/40 text-amber-300"
              : "border-border/70 text-muted-foreground",
          )}
        >
          {claim.checkable ? "Checkable" : "Rhetoric"}
        </span>
        <span className="ml-auto tabular-nums text-muted-foreground/70">
          {Math.round(claim.confidence * 100)}%
        </span>
      </div>

      <p className="mt-1.5 text-[13px] leading-snug text-foreground">{claim.text}</p>

      {claim.rationale ? (
        <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
          {claim.rationale}
        </p>
      ) : null}

      {verification ? (
        <>
          <VerificationBlock
            verification={verification}
            rejected={review?.verdict === "rejected"}
          />
          {onReview ? <ReviewControls review={review} onReview={onReview} /> : null}
        </>
      ) : null}
    </li>
  );
}

const REVIEW_OPTIONS: Array<{ verdict: ReviewVerdict; label: string; activeClass: string }> = [
  { verdict: "confirmed", label: "Confirmed", activeClass: "border-emerald-400/50 text-emerald-300" },
  { verdict: "rejected", label: "Rejected", activeClass: "border-red-400/50 text-red-300" },
  { verdict: "flagged", label: "Follow up", activeClass: "border-amber-400/50 text-amber-300" },
];

function ReviewControls({
  review,
  onReview,
}: {
  review?: ClaimReview;
  onReview: (verdict: ReviewVerdict) => void;
}) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground/60">Review</span>
      {REVIEW_OPTIONS.map((option) => {
        const active = review?.verdict === option.verdict;
        return (
          <button
            key={option.verdict}
            type="button"
            onClick={() => onReview(option.verdict)}
            aria-pressed={active}
            className={cn(
              "rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors",
              active
                ? option.activeClass
                : "border-border/70 text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function VerificationBlock({
  verification,
  rejected,
}: {
  verification: ClaimVerification;
  rejected?: boolean;
}) {
  const hasMatches = verification.matches.length > 0;
  const hasData = Boolean(verification.data);

  return (
    <div
      className={cn(
        "mt-2 flex flex-col gap-1.5 border-t border-border/50 pt-2",
        rejected && "opacity-45",
      )}
    >
      {hasMatches ? (
        <ul className="flex flex-col gap-1.5">
          {verification.matches.map((match) => (
            <MatchRow key={match.url} match={match} />
          ))}
        </ul>
      ) : null}

      {verification.data ? <DataRow data={verification.data} /> : null}

      {verification.status === "error" ? (
        <p className="text-[11px] leading-relaxed text-destructive">
          {verification.error ?? "Lookup failed."}
        </p>
      ) : null}

      {!hasMatches && !hasData && verification.status !== "error" ? (
        <p className="text-[11px] leading-relaxed text-amber-300/90">
          Unsupported — no existing fact-check and no official figure backs this up. Needs a human.
        </p>
      ) : null}
    </div>
  );
}

function DataRow({ data }: { data: DataEvidence }) {
  return (
    <p className="text-[11px] leading-relaxed">
      <a
        href={data.url}
        target="_blank"
        rel="noreferrer"
        className="underline-offset-4 hover:underline"
      >
        <span className="font-semibold text-foreground">
          {data.value.toLocaleString()} {data.unit}
        </span>
        <span className="text-muted-foreground">
          {" "}
          · {data.label} · {data.date} · FRED
        </span>
      </a>
    </p>
  );
}

function MatchRow({ match }: { match: FactCheckMatch }) {
  return (
    <li className="text-[11px] leading-relaxed">
      <a
        href={match.url}
        target="_blank"
        rel="noreferrer"
        className="underline-offset-4 hover:underline"
      >
        <span className={cn("font-semibold", ratingTone(match.rating))}>{match.rating}</span>
        <span className="text-muted-foreground">
          {" "}
          · {match.publisher}
          {match.reviewDate ? ` · ${match.reviewDate}` : ""}
        </span>
      </a>
      {match.claim ? (
        <p className="mt-0.5 text-muted-foreground/70">Checked: “{match.claim}”</p>
      ) : null}
    </li>
  );
}
