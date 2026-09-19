"use client";

import { useEffect, useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import { VERDICT_COLOR, VERDICT_LABEL } from "@/components/VerdictBadge";
import { YoutubePreview } from "@/components/YoutubePreview";
import { ScoreReport } from "@/components/ScoreReport";
import { MAX_YOUTUBE_JOBS } from "@/lib/constants";
import type { YoutubeScore } from "@/lib/types";
import { parseYoutubeId } from "@/lib/youtube-id";
import { isThin } from "@/lib/chunker";

type Job = {
  key: string;
  url: string;
  startSec: number;
  status: "running" | "error";
  error?: string;
};

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

export default function YoutubePage() {
  const [url, setUrl] = useState("");
  const [startRaw, setStartRaw] = useState("0:00");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [results, setResults] = useState<YoutubeScore[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

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
          j.key === key ? { ...j, status: "error", error: message } : j,
        ),
      );
      setError(message);
    }
  };

  const active = results.find((r) => r.id === selected) ?? results[0] ?? null;
  const draftStart = parseStartInput(startRaw);
  const draftPreviewUrl =
    parseYoutubeId(url) && url.trim() ? url.trim() : null;
  const previewUrl = active?.youtubeUrl ?? draftPreviewUrl;
  const previewStart = active ? active.startSec : draftStart;

  return (
    <main className="min-h-dvh bg-[#111210] pt-14">
      <div className="mx-auto max-w-6xl px-5 pb-16 sm:px-8">
        <header className="border-b border-[var(--hairline)] py-10 sm:py-12">
          <p className="caps text-[10px] font-semibold text-[var(--faint)]">
            Speech analysis
          </p>
          <h1 className="display mt-3 text-[clamp(2.5rem,6vw,4.5rem)] font-semibold">
            Analyze an MP&apos;s speech
          </h1>
          <p className="mt-4 max-w-xl text-[15px] leading-6 text-[var(--muted)]">
            Choose a 60-second excerpt from a political speech or talk and
            inspect its verdict, confidence, transcript, and sentence-level
            evidence.
          </p>
        </header>

        <div className="grid gap-10 py-10 lg:grid-cols-[340px_1fr] lg:gap-12">
          <section className="space-y-7">
            <div>
              <p className="caps mb-4 text-[10px] font-semibold text-[var(--faint)]">
                New analysis
              </p>

              <div className="space-y-4">
                <label className="block">
                  <span className="caps mb-2 block text-[10px] font-semibold text-[var(--faint)]">
                    Speech link
                  </span>
                  <input
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="Paste the speech URL"
                    className="w-full border border-[var(--hairline)] bg-black/25 px-3.5 py-3 text-[13px] outline-none placeholder:text-[var(--faint)] focus-visible:border-white/55"
                  />
                </label>
                <label className="block">
                  <span className="caps mb-2 block text-[10px] font-semibold text-[var(--faint)]">
                    Start time
                  </span>
                  <input
                    value={startRaw}
                    onChange={(e) => setStartRaw(e.target.value)}
                    placeholder="0:00"
                    className="w-full border border-[var(--hairline)] bg-black/25 px-3.5 py-3 text-[13px] outline-none placeholder:text-[var(--faint)] focus-visible:border-white/55"
                  />
                </label>
                <button
                  type="button"
                  disabled={!canAdd}
                  onClick={() => void submit()}
                  className="w-full bg-[#e04420] py-3 text-[13px] font-semibold text-white transition-colors enabled:hover:bg-[#bd3517] enabled:active:bg-[#bd3517] disabled:opacity-40"
                >
                  {running > 0
                    ? `Analyze · ${running}/${MAX_YOUTUBE_JOBS} running`
                    : "Analyze minute"}
                </button>
                <p className="text-[11px] leading-5 text-[var(--faint)]">
                  Run up to {MAX_YOUTUBE_JOBS} analyses at once.
                </p>
              </div>
            </div>

          {jobs.length > 0 && (
            <ul className="space-y-2">
              {jobs.map((j) => (
                <li
                  key={j.key}
                  className="border border-[var(--hairline)] bg-white/4 px-3 py-2.5 text-[12px]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[var(--muted)]">{j.url}</span>
                    <span className="shrink-0 tabular-nums text-[var(--faint)]">
                      @{formatStart(j.startSec)}
                    </span>
                  </div>
                  <p
                    className={`mt-1 ${
                      j.status === "error"
                        ? "text-[var(--color-ai)]"
                        : "text-[var(--faint)]"
                    }`}
                  >
                    {j.status === "running"
                      ? "Extracting · transcribing · analyzing…"
                      : j.error}
                  </p>
                </li>
              ))}
            </ul>
          )}

          <div className="border-t border-[var(--hairline)] pt-6">
            <p className="caps mb-3 text-[10px] font-semibold text-[var(--faint)]">
              Saved
            </p>
            <ul className="max-h-[40vh] divide-y divide-white/8 overflow-y-auto border-y border-white/8 hide-scrollbar">
              {results.map((r) => {
                const on = active?.id === r.id;
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(r.id)}
                      className={`w-full border-l-2 px-3 py-3 text-left transition ${
                        on
                          ? "border-[#e04420] bg-white/8"
                          : "border-transparent hover:bg-white/4"
                      }`}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-[13px] font-medium">
                          {r.title ?? r.videoId}
                        </span>
                        <span
                          className="shrink-0 text-[12px] font-semibold"
                          style={{ color: VERDICT_COLOR[r.verdict] }}
                        >
                          {VERDICT_LABEL[r.verdict]}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-[var(--faint)]">
                        @{formatStart(r.startSec)} ·{" "}
                        {Math.round(r.probability * 100)}% · {r.confidence}
                      </p>
                    </button>
                  </li>
                );
              })}
              {results.length === 0 && (
                <li className="px-1 text-[13px] text-[var(--faint)]">
                  No analyses yet.
                </li>
              )}
            </ul>
          </div>
          </section>

          <section className="min-h-[60vh] border border-[var(--hairline)] bg-[var(--color-void)] p-5 sm:p-7">
          {!active ? (
            previewUrl ? (
              <div className="space-y-3">
                <p className="caps text-[10px] font-semibold text-[var(--faint)]">
                  Preview
                </p>
                <YoutubePreview url={previewUrl} startSec={previewStart} />
                <p className="text-[13px] text-[var(--faint)]">
                  Analyze an excerpt to see its verdict and transcript.
                </p>
              </div>
            ) : (
              <p className="text-[14px] text-[var(--faint)]">
                Paste a speech link to preview, then analyze a 60-second
                excerpt.
              </p>
            )
          ) : (
            <div className="space-y-6">
              <YoutubePreview
                url={active.youtubeUrl}
                startSec={active.startSec}
              />

              <div>
                <p className="text-[13px] text-[var(--muted)]">
                  {active.title} · start {formatStart(active.startSec)} · 60s
                </p>
                <a
                  href={active.youtubeUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-block text-[12px] text-[var(--faint)] underline-offset-2 hover:underline"
                >
                  Open source
                </a>
              </div>

              <ScoreReport
                verdict={active.verdict}
                probs={active.probs}
                confidence={active.confidence}
                sentences={active.sentences}
                transcript={active.transcript}
                words={active.words}
                thin={isThin(active.words)}
              />
            </div>
          )}
          </section>
        </div>
      </div>

      <AnimatePresence>
        {error && (
          <motion.p
            role="alert"
            className="material fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md px-4 py-3 text-center text-[13px] text-[var(--color-mixed)]"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            onAnimationComplete={() => {
              /* keep until next submit */
            }}
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </main>
  );
}
