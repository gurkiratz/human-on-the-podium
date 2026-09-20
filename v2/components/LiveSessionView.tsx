"use client";

import { ArrowLeft, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HeatmapSentence, heatTokens } from "./TranscriptHeatmap";
import { VERDICT_COLOR, VERDICT_LABEL, VerdictBadge } from "./VerdictBadge";
import { wordsIn, type LiveThread } from "@/lib/live-thread";
import { RELIABLE_WORDS } from "@/lib/chunker";
import type { LiveSession } from "@/lib/live";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatClock(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function threadDuration(thread: LiveThread): string {
  const end = thread.endedAt ?? thread.startedAt;
  const seconds = Math.max(0, Math.round((end - thread.startedAt) / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${(seconds % 60).toString().padStart(2, "0")}`;
}

export function LiveSessionView({
  session,
  onBack,
  onDelete,
}: {
  session: LiveSession;
  onBack: () => void;
  onDelete?: (id: string) => void;
}) {
  return (
    <div className="scroll-quiet h-full overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <Button
              variant="ghost"
              size="sm"
              className="-ml-2 mb-1 h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={onBack}
            >
              <ArrowLeft className="size-3.5" />
              Back to live
            </Button>
            <h2 className="truncate text-[17px] font-semibold tracking-tight">{session.title}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {formatDate(session.createdAt)} · {session.threadCount}{" "}
              {session.threadCount === 1 ? "thread" : "threads"} ·{" "}
              {session.words.toLocaleString()} words · {session.detectionCount} checks
              {session.status === "active" ? " · in progress" : ""}
            </p>
          </div>
          {onDelete ? (
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0 gap-1.5 text-muted-foreground hover:text-destructive"
              onClick={() => onDelete(session.id)}
            >
              <Trash2 className="size-3.5" />
              Delete
            </Button>
          ) : null}
        </div>

        <div className="mb-5 flex flex-wrap gap-2">
          {(["ai", "mixed", "human"] as const).map((verdict) => (
            <span
              key={verdict}
              className="rounded-full border px-2.5 py-1 text-[12px] font-semibold tabular-nums"
              style={{
                borderColor: session.verdicts[verdict] ? VERDICT_COLOR[verdict] : "var(--border)",
                color: session.verdicts[verdict] ? VERDICT_COLOR[verdict] : "var(--muted-foreground)",
              }}
            >
              {VERDICT_LABEL[verdict]} {session.verdicts[verdict]}
            </span>
          ))}
        </div>

        {session.threads.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border px-6 py-14 text-center text-sm text-muted-foreground">
            This session has no threads.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {session.threads.map((thread) => (
              <ThreadSection key={thread.id} thread={thread} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ThreadSection({ thread }: { thread: LiveThread }) {
  const tokens = heatTokens(thread.detections);
  const latest = thread.detections.length
    ? thread.detections[thread.detections.length - 1]
    : null;
  const words = wordsIn(thread);

  return (
    <section className="glass rounded-2xl p-4">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold">Thread {thread.index + 1}</span>
          {thread.endedAt === null ? (
            <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-destructive">
              Live
            </span>
          ) : null}
        </div>
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {formatClock(thread.startedAt)} · {threadDuration(thread)} · {words} words
        </span>
      </header>

      <div className="mt-3 border-t border-border/60 pt-3">
        <VerdictBadge detection={latest} />
      </div>

      {tokens.length > 0 ? (
        <p className="mt-3 text-[clamp(15px,1.4vw,18px)] font-medium leading-[1.5]">
          {tokens.map((token) => (
            <HeatmapSentence key={token.key} token={token} reduced={false} />
          ))}
        </p>
      ) : (
        <p className="mt-3 text-[13px] text-muted-foreground/60">
          Nothing was scored in this thread — under the {RELIABLE_WORDS}-word floor.
        </p>
      )}

      {thread.segments.length > 0 ? (
        <details className="mt-3 border-t border-border/60 pt-2">
          <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/60">
            Full transcript
          </summary>
          <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-muted-foreground">
            {thread.segments.join(" ")}
          </p>
        </details>
      ) : null}
    </section>
  );
}
