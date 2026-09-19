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
    <main className="min-h-dvh bg-[var(--color-ink)] pt-16">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 pb-16 lg:grid-cols-[340px_1fr]">
        <section className="space-y-5">
          <header>
            <p className="caps text-[10px] font-semibold text-[var(--faint)]">
              Segment scorer
            </p>
            <h1 className="title mt-1 text-[28px] font-bold tracking-tight">
              YouTube → 60s
            </h1>
            <p className="mt-2 text-[13px] leading-relaxed text-[var(--muted)]">
              Paste a link, pick a start time, score one minute. Up to{" "}
              {MAX_YOUTUBE_JOBS} videos at once.
            </p>
          </header>

          <div className="space-y-3">
            <label className="block">
              <span className="caps mb-1.5 block text-[10px] font-semibold text-[var(--faint)]">
                YouTube URL
              </span>
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=…"
                className="material w-full rounded-xl px-3 py-2.5 text-[13px] outline-none placeholder:text-[var(--faint)] focus-visible:ring-2 focus-visible:ring-white/60"
              />
            </label>
            <label className="block">
              <span className="caps mb-1.5 block text-[10px] font-semibold text-[var(--faint)]">
                Start (m:ss)
              </span>
              <input
                value={startRaw}
                onChange={(e) => setStartRaw(e.target.value)}
                placeholder="0:00"
                className="material w-full rounded-xl px-3 py-2.5 text-[13px] outline-none placeholder:text-[var(--faint)] focus-visible:ring-2 focus-visible:ring-white/60"
              />
            </label>
            <button
              type="button"
              disabled={!canAdd}
              onClick={() => void submit()}
              className="w-full rounded-full bg-[var(--color-chalk)] py-3 text-[14px] font-semibold text-[var(--color-ink)] transition enabled:active:scale-[0.98] disabled:opacity-40"
            >
              {running > 0
                ? `Score · ${running}/${MAX_YOUTUBE_JOBS} running`
                : "Score minute"}
            </button>
          </div>

          {jobs.length > 0 && (
            <ul className="space-y-2">
              {jobs.map((j) => (
                <li
                  key={j.key}
                  className="material rounded-2xl px-3 py-2.5 text-[12px]"
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
                      ? "Extracting · transcribing · scoring…"
                      : j.error}
                  </p>
                </li>
              ))}
            </ul>
          )}

          <div>
            <p className="caps mb-2 text-[10px] font-semibold text-[var(--faint)]">
              Saved
            </p>
            <ul className="max-h-[40vh] space-y-1 overflow-y-auto hide-scrollbar">
              {results.map((r) => {
                const on = active?.id === r.id;
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(r.id)}
                      className={`w-full rounded-xl px-3 py-2.5 text-left transition ${
                        on ? "bg-white/10" : "hover:bg-white/5"
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
                  No scores yet.
                </li>
              )}
            </ul>
          </div>
        </section>

        <section className="min-h-[60vh] rounded-[28px] border border-[var(--hairline)] bg-[var(--color-void)] p-5 sm:p-7">
          {!active ? (
            previewUrl ? (
              <div className="space-y-3">
                <p className="caps text-[10px] font-semibold text-[var(--faint)]">
                  Preview
                </p>
                <YoutubePreview url={previewUrl} startSec={previewStart} />
                <p className="text-[13px] text-[var(--faint)]">
                  Score a segment to see verdict and transcript.
                </p>
              </div>
            ) : (
              <p className="text-[14px] text-[var(--faint)]">
                Paste a YouTube link to preview, then score a 60s segment.
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
                  Open on YouTube
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

      <AnimatePresence>
        {error && (
          <motion.p
            role="alert"
            className="material fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md rounded-2xl px-4 py-3 text-center text-[13px] text-[var(--color-mixed)]"
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
