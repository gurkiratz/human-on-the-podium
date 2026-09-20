"use client";

import { PanelLeftClose, Sparkles } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader } from "@/components/ui/loader";
import { MAX_CLIP_JOBS } from "@/lib/constants";
import type { ProjectEntry, ProjectItem } from "@/lib/projects";
import { formatDay, formatDuration, parseTimeInput } from "@/lib/time-format";
import { cn } from "@/lib/utils";

type Job = {
  key: string;
  url: string;
  startSec: number;
  status: "running" | "error";
  error?: string;
};

const INPUT_CLASS =
  "w-full rounded-lg border border-border bg-background/70 px-3 py-2 text-[13px] outline-none focus-visible:border-ring disabled:opacity-60";

function formatStart(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * New analysis form plus the project switcher, as a docked rail. Analyzing a clip creates a
 * project, so this list is the same set as the All projects page.
 */
export function ProjectRail({
  onHide,
  onSelectProject,
  activeId,
}: {
  onHide?: () => void;
  onSelectProject?: (id: string) => void;
  activeId?: string | null;
}) {
  const [url, setUrl] = useState("");
  const [startRaw, setStartRaw] = useState("0:00");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/projects", { cache: "no-store" });
      if (!response.ok) throw new Error(`Could not load projects (${response.status}).`);
      const data = (await response.json()) as { items: ProjectItem[] };
      setProjects(data.items);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const running = jobs.filter((job) => job.status === "running").length;
  const canAdd = running < MAX_CLIP_JOBS && url.trim().length > 0;
  const startSec = parseTimeInput(startRaw);

  async function submit() {
    if (!canAdd) return;
    const jobUrl = url.trim();
    const key = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setError(null);
    setJobs((prev) => [{ key, url: jobUrl, startSec, status: "running" }, ...prev]);

    try {
      const response = await fetch("/api/projects/from-clip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: jobUrl, startSec }),
      });
      const data = (await response.json()) as ProjectEntry & { error?: string };
      if (!response.ok) throw new Error(data.error ?? `Analysis failed (${response.status}).`);
      setJobs((prev) => prev.filter((job) => job.key !== key));
      setProjects((prev) => [data, ...prev]);
      onSelectProject?.(data.id);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setJobs((prev) =>
        prev.map((job) => (job.key === key ? { ...job, status: "error", error: message } : job)),
      );
      setError(message);
    }
  }

  return (
    <aside className="glass overflow-hidden rounded-2xl border border-border/70">
      <div className="p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            New analysis
          </p>
          {onHide ? (
            <button
              type="button"
              onClick={onHide}
              aria-label="Hide analysis"
              title="Hide analysis"
              className="-mr-1 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <PanelLeftClose className="size-4" />
            </button>
          ) : null}
        </div>

        <div className="mt-3 flex flex-col gap-3">
          <label className="block">
            <span className="mb-1.5 block text-[12px] text-muted-foreground">Source link</span>
            <input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="YouTube or CPAC URL"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              className={INPUT_CLASS}
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[12px] text-muted-foreground">Start time</span>
            <input
              value={startRaw}
              onChange={(event) => setStartRaw(event.target.value)}
              placeholder="0:00"
              inputMode="numeric"
              className={cn(INPUT_CLASS, "tabular-nums")}
            />
          </label>

          <Button className="w-full gap-1.5" disabled={!canAdd} onClick={() => void submit()}>
            <Sparkles className="size-4" />
            Analyze this minute
          </Button>
          <p className="text-[11px] leading-5 text-muted-foreground" aria-live="polite">
            {running > 0 ? `${running} of ${MAX_CLIP_JOBS} running.` : `Up to ${MAX_CLIP_JOBS} at once.`}
          </p>
        </div>
      </div>

      {jobs.length > 0 ? (
        <div className="border-t border-border/60 px-4 py-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            In progress
          </p>
          <ul className="mt-3 flex flex-col gap-3">
            {jobs.map((job) => (
              <li key={job.key} className="text-[12px]">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-muted-foreground">{job.url}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground/70">
                    @{formatStart(job.startSec)}
                  </span>
                </div>
                {job.status === "running" ? (
                  <div className="mt-2 flex items-center gap-2 text-muted-foreground/70">
                    <Loader variant="dots" size="sm" />
                    <span>Extracting, transcribing, analyzing…</span>
                  </div>
                ) : (
                  <p className="mt-1.5 text-destructive">{job.error}</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="border-t border-border/60 px-4 pb-2 pt-4">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Projects
        </p>
      </div>
      {projects.length === 0 ? (
        <p className="px-4 pb-5 text-[13px] text-muted-foreground/70">No projects yet.</p>
      ) : (
        <ul className="max-h-[46vh] overflow-y-auto pb-2">
          {projects.map((project) => {
            const active = activeId === project.id;
            return (
              <li key={project.id} className="border-t border-border/40 first:border-t-0">
                <button
                  type="button"
                  onClick={() => onSelectProject?.(project.id)}
                  aria-current={active ? "true" : undefined}
                  className={cn(
                    "flex w-full flex-col gap-0.5 border-l-2 px-4 py-3 text-left transition-colors",
                    active ? "border-primary bg-card/60" : "border-transparent hover:bg-card/40",
                  )}
                >
                  <span className="truncate text-[13px] font-medium">{project.name}</span>
                  <span className="truncate text-[11px] text-muted-foreground/70">
                    {formatDay(Date.parse(project.createdAt))} · {project.stats.words.toLocaleString()}{" "}
                    words · {formatDuration(project.stats.duration)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {error ? (
        <p className="border-t border-destructive/30 bg-destructive/5 px-4 py-2.5 text-[11px] leading-4 text-foreground">
          {error}
        </p>
      ) : null}
    </aside>
  );
}
