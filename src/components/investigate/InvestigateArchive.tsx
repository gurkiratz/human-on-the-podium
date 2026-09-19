"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import type { Verdict, YoutubeScore } from "@/lib/types";
import { ScoreTable } from "./ScoreTable";

const EXAMPLES = ["debate", "parliament", "speech"] as const;

type VerdictFilter = "all" | Verdict;

export function InvestigateArchive({ results }: { results: YoutubeScore[] }) {
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [verdict, setVerdict] = useState<VerdictFilter>("all");

  const stats = useMemo(() => {
    const total = results.length;
    const ai = results.filter((r) => r.verdict === "ai").length;
    const human = results.filter((r) => r.verdict === "human").length;
    const mixed = results.filter((r) => r.verdict === "mixed").length;
    const words = results.reduce((n, r) => n + r.words, 0);
    return { total, ai, human, mixed, words };
  }, [results]);

  const applySearch = (next = draft) => {
    setQuery(next);
    document.getElementById("records")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <main>
      <header className="relative isolate min-h-[560px] overflow-hidden pt-14 text-white sm:min-h-[600px]">
        <Image
          src="/investigate/hero.jpg"
          alt="Lowell Lecture Hall, a stone building with tall arched windows"
          fill
          priority
          className="investigate-hero-photo object-cover object-[center_38%]"
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(8,9,7,.9)_0%,rgba(8,9,7,.7)_48%,rgba(8,9,7,.3)_100%)]" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-black/25" />
        <div className="investigate-grain absolute inset-0" />

        <div className="relative z-10 mx-auto flex min-h-[504px] max-w-6xl flex-col px-5 sm:min-h-[544px] sm:px-8">
          <div className="flex flex-1 flex-col justify-center py-10 sm:py-12">
            <p className="investigate-stamp text-[11px] text-white/65">
              Detection archive
            </p>
            <h1 className="investigate-title mt-4 max-w-[8ch] text-6xl ">
              Speech Trail
            </h1>
            <p className="mt-5 max-w-xl text-[16px] leading-7 text-white/75 sm:text-[18px]">
              When AI-written text is read aloud, it can be hard to spot by ear.
              We transcribe one-minute excerpts from speeches and talks by MPs,
              analyze them with GPTZero, and bring the verdict and
              sentence-level evidence together so one search shows the full
              result.
            </p>

            <form
              className="mt-8 w-full max-w-3xl"
              onSubmit={(e) => {
                e.preventDefault();
                applySearch();
              }}
            >
              <div className="grid gap-px bg-white/25 p-px shadow-[0_16px_50px_rgba(0,0,0,0.3)] sm:grid-cols-[1fr_180px_auto]">
                <label>
                  <span className="sr-only">Search documents</span>
                  <input
                    name="q"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Search transcripts, titles, or IDs"
                    className="investigate-field h-14 w-full px-4 text-[15px]"
                  />
                </label>
                <label className="relative">
                  <span className="sr-only">Filter by verdict</span>
                  <select
                    name="verdict"
                    value={verdict}
                    onChange={(e) =>
                      setVerdict(e.target.value as VerdictFilter)
                    }
                    className="investigate-field h-14 w-full appearance-none px-4 pr-10 text-[14px]"
                  >
                    <option value="all">All recordings</option>
                    <option value="ai">AI</option>
                    <option value="human">Human</option>
                    <option value="mixed">Mixed</option>
                  </select>
                  <span
                    aria-hidden
                    className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[var(--faint-ink)]"
                  >
                    ▾
                  </span>
                </label>
                <button
                  type="submit"
                  className="flex h-14 items-center justify-center gap-2 bg-[var(--blood)] px-6 text-[14px] font-semibold text-white transition-colors hover:bg-[var(--blood-press)] active:bg-[var(--blood-press)]"
                >
                  <SearchIcon />
                  Search
                </button>
              </div>
              <p className="mt-3 text-[12px] leading-5 text-white/55">
                Try{" "}
                {EXAMPLES.map((ex, i) => (
                  <span key={ex}>
                    {i > 0 && ", "}
                    <button
                      type="button"
                      className="border-b border-white/30 text-white/75 hover:border-white hover:text-white"
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

            <dl className="mt-8 flex w-full max-w-xl flex-wrap gap-x-10 gap-y-4 border-t border-white/25 pt-5">
              <Stat label="Excerpts" value={stats.total} />
              <Stat label="AI" value={stats.ai} />
              <Stat label="Human" value={stats.human} />
              <Stat label="Words" value={stats.words} />
            </dl>
          </div>

          <p className="absolute bottom-4 right-5 text-[10px] text-white/35 sm:right-8">
            Lowell Lecture Hall, Harvard · Daderot
          </p>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-16">
        {/* <p className="border-y border-[var(--line)] py-4 text-[13px] leading-5 text-[var(--muted-ink)]">
          <span className="mr-2 font-semibold text-[var(--ink)]">Note</span>
          These are machine-generated assessments, not proof of authorship.
        </p> */}

        <div id="records" className=" scroll-mt-8">
          <h2 className="investigate-punch text-[clamp(2.2rem,5vw,3.4rem)]">
            The records
          </h2>
          <p className="mt-3 max-w-2xl text-[15px] leading-6 text-[var(--muted-ink)]">
            Select a record to inspect its transcript and sentence-level AI
            probability.
          </p>
          <div className="mt-8">
            <ScoreTable data={results} query={query} verdict={verdict} />
          </div>
        </div>

        <div className="grid gap-10 py-14 md:grid-cols-[1fr_1fr] md:gap-20">
          <div>
            <p className="investigate-stamp text-[10px] text-[var(--faint-ink)]">
              Methodology
            </p>
            <h2 className="investigate-punch mt-3 text-[clamp(2.2rem,5vw,3.4rem)]">
              About the project
            </h2>
          </div>
          <div>
            <div className="space-y-4 text-[16px] leading-7 text-[var(--muted-ink)]">
              <p>
                Every row is a sixty-second excerpt from a speech or talk by an
                MP. We pull the audio, transcribe it, and send the words to
                GPTZero. The verdict, class split, and sentence heat are filed
                here.
              </p>
              <p>
                Live microphone detection is never stored. The archive only
                keeps the source URL, start time, transcript, and analysis.
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="investigate-stamp text-[10px] text-white/55">{label}</dt>
      <dd className="mt-1 text-[30px] font-medium tracking-[-0.035em] text-white tabular-nums">
        {value}
      </dd>
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
