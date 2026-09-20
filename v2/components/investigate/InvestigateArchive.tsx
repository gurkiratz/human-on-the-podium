"use client";

import { useMemo, useState } from "react";
import type { ProjectRecord } from "@/lib/projects";
import { ScoreTable } from "./ScoreTable";

const EXAMPLES = ["starmer", "trump", "speech"] as const;

export function InvestigateArchive({ results }: { results: ProjectRecord[] }) {
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");

  const stats = useMemo(() => {
    const total = results.length;
    const scored = results.filter((r) => r.aiProbability !== null);
    const ai = scored.filter((r) => (r.aiProbability ?? 0) >= 0.5).length;
    const words = results.reduce((n, r) => n + r.stats.words, 0);
    return { total, scored: scored.length, ai, words };
  }, [results]);

  const applySearch = (next = draft) => {
    setQuery(next);
    document.getElementById("records")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="pb-8">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Detection archive
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
          Speech Trail
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          When AI-written text is read aloud, it can be hard to spot by ear. Every speech you
          analyze is filed here — the AI reading, the source, and the sentence-level evidence —
          so one search shows the full result.
        </p>

        <form
          className="mt-6 w-full max-w-2xl"
          onSubmit={(event) => {
            event.preventDefault();
            applySearch();
          }}
        >
          <div className="flex gap-2">
            <label className="min-w-0 flex-1">
              <span className="sr-only">Search documents</span>
              <input
                name="q"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Search transcripts, titles, or channels"
                className="h-11 w-full rounded-lg border border-border bg-background/70 px-3 text-sm outline-none focus-visible:border-ring"
              />
            </label>
            <button
              type="submit"
              className="flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <SearchIcon />
              Search
            </button>
          </div>
          <p className="mt-2.5 text-xs text-muted-foreground">
            Try{" "}
            {EXAMPLES.map((ex, i) => (
              <span key={ex}>
                {i > 0 && ", "}
                <button
                  type="button"
                  className="underline underline-offset-2 hover:text-foreground"
                  onClick={() => {
                    setDraft(ex);
                    applySearch(ex);
                  }}
                >
                  {ex}
                </button>
              </span>
            ))}
          </p>
        </form>

        <dl className="mt-7 flex w-full max-w-xl flex-wrap gap-x-10 gap-y-4 border-t border-border/70 pt-5">
          <Stat label="Speeches" value={stats.total} />
          <Stat label="Scored" value={stats.scored} />
          <Stat label="Read as AI" value={stats.ai} />
          <Stat label="Words" value={stats.words} />
        </dl>
      </header>

      <section>
        <div id="records" className="scroll-mt-20">
          <h2 className="text-xl font-semibold tracking-tight">The records</h2>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Select a record to inspect its transcript and AI reading.
          </p>
          <div className="mt-6">
            <ScoreTable data={results} query={query} />
          </div>
        </div>

        <div className="py-12">
          <h2 className="text-xl font-semibold tracking-tight">About the project</h2>
          <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p>
              Every row is a speech you analyzed — the audio was pulled, transcribed, and the
              words sent to GPTZero. The reading, source, and transcript are filed here.
            </p>
            <p>
              Live microphone detection is never stored. The archive only keeps the source,
              transcript, and analysis.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 text-2xl font-medium tabular-nums tracking-tight">{value}</dd>
    </div>
  );
}

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-4 fill-none stroke-current"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden
    >
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16.5 20 20.5" />
    </svg>
  );
}
