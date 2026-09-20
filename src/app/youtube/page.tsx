"use client";

import { useEffect, useState, useTransition } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { YoutubePreview } from "@/components/YoutubePreview";
import { ScoreReport } from "@/components/ScoreReport";
import { AiMeter, BandLegend } from "@/components/ai-scale";
import { MAX_YOUTUBE_JOBS } from "@/lib/constants";
import type { YoutubeScore } from "@/lib/types";
import {
  parseCpacId,
  parseRecordingId,
  parseYoutubeId,
} from "@/lib/youtube-id";
import { isThin } from "@/lib/chunker";
import { formatDay, formatDuration } from "@/lib/time-format";

type Job = {
  key: string;
  url: string;
  startSec: number;
  status: "running" | "error";
  error?: string;
};

const STEPS = [
  "Paste a link to a speech or talk — YouTube or CPAC.",
  "Set the minute you want read.",
  "We pull that audio, transcribe it, and check the words.",
];

function formatStart(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function parseStartInput(raw: string): number {
  const t = raw.trim();
  if (!t) return 0;
  if (t.includes(":")) {
    const [a, b] = t.split(":");
    return Math.max(0, (Number(a) || 0) * 60 + (Number(b) || 0));
  }
  return Math.max(0, Math.floor(Number(t) || 0));
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="rounded-[var(--r-sm)] border px-3 py-2.5 text-[12px] leading-5"
      style={{
        background: "var(--note-bg)",
        borderColor: "var(--note-line)",
        color: "var(--note-ink)",
      }}
    >
      {children}
    </p>
  );
}

function NoteAction({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="focus-ring rounded-[3px] font-semibold underline underline-offset-2"
    >
      {children}
    </button>
  );
}

export default function AnalyzePage() {
  const [url, setUrl] = useState("");
  const [startRaw, setStartRaw] = useState("0:00");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [results, setResults] = useState<YoutubeScore[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const reduced = useReducedMotion();

  const load = () => {
    startTransition(async () => {
      const res = await fetch("/api/youtube/results");
      const json = (await res.json()) as {
        results?: YoutubeScore[];
        error?: string;
      };
      if (json.results) setResults(json.results);
    });
  };

  useEffect(() => {
    load();
  }, []);

  // The toast is a status message, not a dialog — it should clear itself.
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 7000);
    return () => clearTimeout(t);
  }, [error]);

  const running = jobs.filter((j) => j.status === "running").length;
  const canAdd = running < MAX_YOUTUBE_JOBS && url.trim().length > 0;

  const submit = async () => {
    if (!canAdd) return;
    const startSec = parseStartInput(startRaw);
    const key = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const jobUrl = url.trim();
    setError(null);
    setJobs((prev) => [
      { key, url: jobUrl, startSec, status: "running" },
      ...prev,
    ]);

    try {
      const res = await fetch("/api/youtube/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: jobUrl, startSec }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      const row = json as YoutubeScore;
      setJobs((prev) => prev.filter((j) => j.key !== key));
      setResults((prev) => [row, ...prev]);
      setSelected(row.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed";
      setJobs((prev) =>
        prev.map((j) =>
          j.key === key ? { ...j, status: "error", error: message } : j
        )
      );
      setError(message);
    }
  };

  const active = results.find((r) => r.id === selected) ?? results[0] ?? null;
  const draftStart = parseStartInput(startRaw);

  // An excerpt is a recording *and* a minute. Matching on the link alone would
  // flag every later minute of the same speech as a duplicate.
  const draftId = parseRecordingId(url);
  // CPAC files episodes under a UUID, which can come back in either case.
  const loose = !!parseCpacId(url);
  const sameRecording = draftId
    ? results.filter((r) =>
        loose
          ? r.videoId.toLowerCase() === draftId.toLowerCase()
          : r.videoId === draftId
      )
    : [];
  const alreadyDone = sameRecording.find((r) => r.startSec === draftStart);
  const otherMinutes = sameRecording
    .filter((r) => r.startSec !== draftStart)
    .sort((a, b) => a.startSec - b.startSec);

  const open = (id: string) => {
    setSelected(id);
    document.getElementById("result")?.scrollIntoView({
      behavior: reduced ? "auto" : "smooth",
      block: "start",
    });
  };

  const sourceUrl = active?.youtubeUrl ?? url.trim();
  const previewUrl = parseYoutubeId(sourceUrl) ? sourceUrl : null;
  const previewStart = active ? active.startSec : draftStart;

  return (
    <main className="pt-14">
      <div className="mx-auto max-w-6xl px-5 pb-20 sm:px-8">
        <header className="-mx-5 mb-6 bg-[#2b2c29] px-5 py-9 text-white [--faint-ink:rgba(255,255,255,0.48)] [--muted-ink:rgba(255,255,255,0.7)] sm:-mx-8 sm:px-8 sm:py-12">
          {/* <p className="paper-label">Speech analysis</p> */}
          <h1 className="paper-display mt-3.5 text-[clamp(2rem,4vw,3rem)]">
            Analyze a video, audio, or document
          </h1>
          <p className="mt-4 max-w-2xl text-[16px] leading-7 text-[var(--muted-ink)]">
            Extract and transcribe audio with 11Labs, then check for
            AI-generated text with GPTZero. Storing the results in a vectorized
            database with Elastic.co
          </p>
          <BandLegend className="mt-5" />
        </header>

        <div className="-mx-5 grid items-start gap-0 sm:-mx-8 lg:grid-cols-[330px_1fr]">
          <section className="overflow-hidden border border-[var(--line)] bg-[var(--card)]">
            <div className="p-4 sm:p-5">
              <p className="paper-label">New analysis</p>

              <div className="mt-4 space-y-3.5">
                <label className="block">
                  <span className="mb-1.5 block text-[12px] text-[var(--muted-ink)]">
                    Source link
                  </span>
                  <input
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="YouTube or CPAC URL"
                    inputMode="url"
                    autoComplete="off"
                    spellCheck={false}
                    className="field px-3 py-2.5 text-[13px]"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[12px] text-[var(--muted-ink)]">
                    Start time
                  </span>
                  <input
                    value={startRaw}
                    onChange={(e) => setStartRaw(e.target.value)}
                    placeholder="0:00"
                    inputMode="numeric"
                    className="field px-3 py-2.5 text-[13px] tabular-nums"
                  />
                </label>
                {alreadyDone ? (
                  <Note>
                    <strong className="font-semibold">Already analyzed.</strong>{" "}
                    This minute is on file.{" "}
                    <NoteAction onClick={() => open(alreadyDone.id)}>
                      Open it
                    </NoteAction>
                  </Note>
                ) : otherMinutes.length > 0 ? (
                  <Note>
                    This recording is already on file at{" "}
                    {otherMinutes.map((r, i) => (
                      <span key={r.id}>
                        {i > 0 && ", "}
                        <NoteAction onClick={() => open(r.id)}>
                          {formatStart(r.startSec)}
                        </NoteAction>
                      </span>
                    ))}
                    . This minute is new.
                  </Note>
                ) : null}

                <button
                  type="button"
                  disabled={!canAdd}
                  onClick={() => void submit()}
                  className="press focus-ring w-full rounded-[var(--r-sm)] bg-[var(--accent)] py-2.5 text-[13px] font-semibold text-white enabled:hover:bg-[var(--accent-press)] disabled:cursor-not-allowed disabled:opacity-35"
                >
                  {alreadyDone ? "Analyze it again" : "Analyze this minute"}
                </button>
                <p
                  className="text-[11px] leading-5 text-[var(--faint-ink)]"
                  aria-live="polite"
                >
                  {running > 0
                    ? `${running} of ${MAX_YOUTUBE_JOBS} running.`
                    : `Up to ${MAX_YOUTUBE_JOBS} at once.`}
                </p>
              </div>
            </div>

            {jobs.length > 0 && (
              <div className="paper-divider px-4 py-4 sm:px-5">
                <p className="paper-label">In progress</p>
                <ul className="mt-3 space-y-3">
                  {jobs.map((j) => (
                    <li key={j.key} className="text-[12px]">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-[var(--muted-ink)]">
                          {j.url}
                        </span>
                        <span className="shrink-0 tabular-nums text-[var(--faint-ink)]">
                          @{formatStart(j.startSec)}
                        </span>
                      </div>
                      {j.status === "running" ? (
                        <>
                          <div className="working mt-2 h-[3px] w-full" />
                          <p className="mt-1.5 text-[var(--faint-ink)]">
                            Extracting, transcribing, analyzing…
                          </p>
                        </>
                      ) : (
                        <p className="mt-1.5 text-[var(--stamp-ai)]">
                          {j.error}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="paper-divider px-4 pb-2 pt-4 sm:px-5">
              <p className="paper-label">Saved</p>
            </div>
            {results.length === 0 ? (
              <p className="px-4 pb-5 text-[13px] text-[var(--faint-ink)] sm:px-5">
                Nothing analyzed yet.
              </p>
            ) : (
              <ul className="max-h-[46vh] overflow-y-auto pb-2">
                {results.map((r) => {
                  const on = active?.id === r.id;
                  return (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => setSelected(r.id)}
                        aria-current={on ? "true" : undefined}
                        className={`press focus-ring flex w-full items-start gap-3 border-l-2 px-4 py-3 text-left sm:px-5 ${
                          on
                            ? "border-[var(--accent)] bg-[var(--paper-deep)]/60"
                            : "border-transparent hover:bg-[var(--paper-deep)]/40"
                        }`}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium">
                            {r.title ?? r.videoId}
                          </span>
                          <span className="mt-0.5 block truncate text-[11px] text-[var(--faint-ink)]">
                            {r.publishedAt !== null
                              ? `${formatDay(r.publishedAt)} · @${formatStart(
                                  r.startSec
                                )}`
                              : `@${formatStart(r.startSec)} · ${
                                  r.words
                                } words`}
                          </span>
                        </span>
                        <AiMeter
                          ai={r.probs.ai}
                          showLabel={false}
                          className="w-[62px] shrink-0"
                        />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section
            id="result"
            className="scroll-mt-20 border border-t-0 border-[var(--line)] bg-[var(--card)] p-5 sm:p-7 lg:border-l-0 lg:border-t"
          >
            {!active ? (
              <div className="space-y-6">
                {previewUrl ? (
                  <div className="paper-stage">
                    <YoutubePreview url={previewUrl} startSec={previewStart} />
                  </div>
                ) : null}
                <div className={previewUrl ? "" : "py-6"}>
                  <h2 className="paper-heading text-[22px]">
                    {previewUrl
                      ? "Ready when you are"
                      : "Start with a recording"}
                  </h2>
                  <ol className="mt-4 max-w-md space-y-3">
                    {STEPS.map((step, i) => (
                      <li
                        key={step}
                        className="flex gap-3 text-[14px] leading-6 text-[var(--muted-ink)]"
                      >
                        <span
                          aria-hidden
                          className="mt-[3px] grid size-[18px] shrink-0 place-items-center rounded-full bg-[var(--paper-deep)] text-[10px] font-semibold tabular-nums text-[var(--muted-ink)]"
                        >
                          {i + 1}
                        </span>
                        {step}
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            ) : (
              <motion.div
                key={active.id}
                initial={reduced ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: "spring", bounce: 0, duration: 0.35 }}
                className="space-y-6"
              >
                {parseYoutubeId(active.youtubeUrl) && (
                  <div className="paper-stage">
                    <YoutubePreview
                      url={active.youtubeUrl}
                      startSec={active.startSec}
                    />
                  </div>
                )}

                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <h2 className="paper-heading min-w-0 text-[20px]">
                    {active.title ?? active.videoId}
                  </h2>
                  <a
                    href={active.youtubeUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="focus-ring shrink-0 rounded-[4px] text-[13px] font-medium text-[var(--accent)] underline-offset-2 underline"
                  >
                    Source
                  </a>
                </div>
                <p className="-mt-4 text-[13px] text-[var(--faint-ink)]">
                  Sixty seconds from {formatStart(active.startSec)}
                  {active.sourceDurationSec !== null &&
                    ` of ${formatDuration(active.sourceDurationSec)}`}
                  {active.publishedAt !== null
                    ? ` · Recorded ${formatDay(active.publishedAt)}`
                    : " · Recording date not published"}
                </p>

                <ScoreReport
                  verdict={active.verdict}
                  probs={active.probs}
                  confidence={active.confidence}
                  sentences={active.sentences}
                  transcript={active.transcript}
                  words={active.words}
                  thin={isThin(active.words)}
                />
              </motion.div>
            )}
          </section>
        </div>
      </div>

      <AnimatePresence>
        {error && (
          <motion.div
            role="status"
            className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md rounded-[var(--r-md)] bg-[#17181a] px-4 py-3 text-center text-[13px] text-white shadow-[0_12px_40px_-12px_rgba(0,0,0,0.5)]"
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: 12 }}
            transition={{ type: "spring", bounce: 0, duration: 0.3 }}
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
