"use client";

import { Bell, Check, Pencil, RefreshCw, TrendingUp, Trophy, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader } from "@/components/ui/loader";
import { cn } from "@/lib/utils";
import { aiTone } from "@/lib/ai-bands";
import type { Alert } from "@/lib/alerts";
import type { ReviewStats } from "@/lib/claims-store";
import type {
  BoardDimension,
  Leaderboard,
  LeaderboardGroup,
  LeaderboardSpeech,
  TimelinePoint,
} from "@/lib/reports";

type Board = Leaderboard & { reviews: ReviewStats };

const EMPTY_REVIEWS: ReviewStats = {
  confirmed: 0,
  rejected: 0,
  flagged: 0,
  reviewed: 0,
  precision: null,
};

const DIMENSIONS: Array<{ id: BoardDimension; label: string }> = [
  { id: "source", label: "Source" },
  { id: "politician", label: "Politician" },
  { id: "party", label: "Party" },
  { id: "topic", label: "Topic" },
];

function percent(value: number | null): string {
  return value === null ? "–" : `${Math.round(value * 100)}%`;
}

function relativeTime(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

const TONE = {
  ai: { text: "text-red-300", bar: "bg-red-400" },
  mixed: { text: "text-amber-300", bar: "bg-amber-400" },
  human: { text: "text-emerald-300", bar: "bg-emerald-400" },
} as const;

/** Same bands as the AI-o-meter, so the board reads consistently with the panels. */
function tone(probability: number | null) {
  if (probability === null) return { text: "text-muted-foreground", bar: "bg-muted-foreground/40" };
  return TONE[aiTone(probability)];
}

export function LeaderboardView() {
  const [dimension, setDimension] = useState<BoardDimension>("source");
  const [data, setData] = useState<Board | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (dim: BoardDimension) => {
    setError(null);
    try {
      const [boardRes, alertRes] = await Promise.all([
        fetch(`/api/leaderboard?dimension=${dim}`, { cache: "no-store" }),
        fetch("/api/alerts?limit=8", { cache: "no-store" }),
      ]);
      if (!boardRes.ok) throw new Error(`Could not load the leaderboard (${boardRes.status}).`);
      setData((await boardRes.json()) as Board);
      setAlerts(alertRes.ok ? ((await alertRes.json()) as { items: Alert[] }).items : []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setData({ dimension: dim, groups: [], timeline: [], recent: [], reviews: EMPTY_REVIEWS });
    }
  }, []);

  useEffect(() => {
    void load(dimension);
  }, [load, dimension]);

  return (
    <div className="scroll-quiet h-full overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold tracking-tight">Leaderboard</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Average AI-likelihood across every speech scored.
            </p>
          </div>
          <Button variant="ghost" size="sm" className="shrink-0" onClick={() => void load(dimension)}>
            <RefreshCw className="size-4" />
            Refresh
          </Button>
        </div>

        <div className="mb-4 inline-flex flex-wrap rounded-full border border-border/70 bg-card/50 p-0.5">
          {DIMENSIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={dimension === option.id}
              onClick={() => setDimension(option.id)}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-[12px] font-medium transition-colors",
                dimension === option.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        {error ? (
          <p className="mb-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-foreground">
            {error}
          </p>
        ) : null}

        {data === null ? (
          <div className="flex justify-center py-16">
            <Loader variant="dots" />
          </div>
        ) : data.groups.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border px-6 py-14 text-center">
            <Trophy className="mx-auto size-5 text-muted-foreground" />
            <p className="mt-2 text-sm font-medium">Nothing scored yet</p>
            <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
              Open a speech — in Projects, the Library, or a chat result — and its reading lands
              here, ranked. Already-saved speeches can be filled in with{" "}
              <code className="text-foreground">npm run backfill:reports</code>.
            </p>
          </div>
        ) : (
          <>
            <TrendChart points={data.timeline} />
            <AlertList alerts={alerts} />
            <MatchQuality stats={data.reviews} />

            <ol className="flex flex-col gap-2">
              {data.groups.map((group, index) => (
                <GroupRow key={group.label} group={group} rank={index + 1} />
              ))}
            </ol>

            <div className="mt-6">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/60">
                Most AI-like speeches
              </p>
              <ul className="flex flex-col gap-1">
                {data.recent.map((speech) => (
                  <SpeechRow
                    key={speech.id}
                    speech={speech}
                    onSaved={() => void load(dimension)}
                  />
                ))}
              </ul>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function MatchQuality({ stats }: { stats: ReviewStats }) {
  if (stats.reviewed === 0) return null;
  const upheld = stats.precision === null ? "–" : `${Math.round(stats.precision * 100)}%`;

  return (
    <div className="glass mb-5 rounded-2xl border border-border/70 px-4 py-3">
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/60">
        Match quality
      </p>
      <p className="text-[13px] text-muted-foreground">
        <span className="text-[17px] font-semibold tabular-nums text-foreground">{upheld}</span>{" "}
        of reviewed matches upheld by a human
      </p>
      <p className="mt-1 text-[11px] tabular-nums text-muted-foreground">
        {stats.confirmed} confirmed · {stats.rejected} rejected · {stats.flagged} follow-up
      </p>
    </div>
  );
}

function TrendChart({ points }: { points: TimelinePoint[] }) {
  if (points.length < 2) return null;
  const first = points[0].date.slice(5);
  const last = points[points.length - 1].date.slice(5);

  return (
    <div className="glass mb-5 rounded-2xl border border-border/70 px-4 py-3">
      <p className="mb-2 inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/60">
        <TrendingUp className="size-3.5" />
        Trend · average AI score per day
      </p>
      <div className="flex h-24 items-end gap-1">
        {points.map((point) => (
          <div
            key={point.date}
            className="relative h-full flex-1"
            title={`${point.date}: ${percent(point.avgAi)} across ${point.speeches} ${point.speeches === 1 ? "speech" : "speeches"}`}
          >
            <div
              className={cn("absolute bottom-0 w-full rounded-t", tone(point.avgAi).bar)}
              style={{ height: `${Math.max(3, point.avgAi * 100)}%` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] tabular-nums text-muted-foreground/60">
        <span>{first}</span>
        <span>{last}</span>
      </div>
    </div>
  );
}

function AlertList({ alerts }: { alerts: Alert[] }) {
  if (alerts.length === 0) return null;
  return (
    <div className="glass mb-5 rounded-2xl border border-border/70 px-4 py-3">
      <p className="mb-2 inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/60">
        <Bell className="size-3.5" />
        Alerts
      </p>
      <ul className="flex flex-col gap-1.5">
        {alerts.map((alert) => (
          <li key={alert.id} className="flex items-start gap-2 text-[11px] leading-relaxed">
            <span
              className={cn(
                "mt-1 size-1.5 shrink-0 rounded-full",
                alert.severity === "high" ? "bg-destructive" : "bg-amber-400",
              )}
            />
            <span className="min-w-0 flex-1">
              <span className="text-foreground">{alert.title}</span>
              <span className="text-muted-foreground"> — {alert.detail}</span>
            </span>
            <span className="shrink-0 tabular-nums text-muted-foreground/60">
              {relativeTime(alert.createdAt)}
              {alert.delivered ? "" : " · local"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function GroupRow({ group, rank }: { group: LeaderboardGroup; rank: number }) {
  const score = tone(group.avgAi);
  return (
    <li className="glass flex items-center gap-4 rounded-2xl border border-border/70 px-4 py-3">
      <span className="w-6 shrink-0 text-center text-[13px] font-semibold tabular-nums text-muted-foreground">
        {rank}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-3">
          <span className="truncate text-[13.5px] font-medium capitalize">{group.label}</span>
          <span className={cn("shrink-0 text-[15px] font-semibold tabular-nums", score.text)}>
            {percent(group.avgAi)}
          </span>
        </span>
        <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-muted">
          <span
            className={cn("block h-full rounded-full", score.bar)}
            style={{ width: `${Math.round(group.avgAi * 100)}%` }}
          />
        </span>
        <span className="mt-1.5 block text-[11px] text-muted-foreground">
          {group.speeches} {group.speeches === 1 ? "speech" : "speeches"} · {group.flagged} sentences
          flagged · {group.words.toLocaleString()} words
        </span>
      </span>
    </li>
  );
}

function SpeechRow({ speech, onSaved }: { speech: LeaderboardSpeech; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [politician, setPolitician] = useState(speech.politician ?? "");
  const [party, setParty] = useState(speech.party ?? "");
  const [topic, setTopic] = useState(speech.topic ?? "");
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const score = tone(speech.aiProbability);
  const context = [speech.politician, speech.party, speech.topic].filter(Boolean).join(" · ");
  const key = speech.videoId?.trim() || speech.title;

  function startEditing() {
    setPolitician(speech.politician ?? "");
    setParty(speech.party ?? "");
    setTopic(speech.topic ?? "");
    setEditError(null);
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    setEditError(null);
    try {
      const response = await fetch("/api/reports", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, politician, party, topic }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `Could not save the labels (${response.status}).`);
      }
      setEditing(false);
      onSaved();
    } catch (caught) {
      setEditError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <li className="glass rounded-xl border border-border/70 px-3 py-3">
        <p className="mb-2 truncate text-[12px] font-medium">{speech.title}</p>
        <div className="flex flex-col gap-1.5">
          <LabelInput label="Politician" value={politician} onChange={setPolitician} disabled={saving} />
          <LabelInput label="Party" value={party} onChange={setParty} disabled={saving} />
          <LabelInput label="Topic" value={topic} onChange={setTopic} disabled={saving} />
        </div>
        {editError ? <p className="mt-1.5 text-[11px] text-destructive">{editError}</p> : null}
        <div className="mt-2 flex gap-2">
          <Button size="sm" className="gap-1.5" onClick={() => void save()} disabled={saving}>
            <Check className="size-3.5" />
            {saving ? "Saving…" : "Save labels"}
          </Button>
          <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => setEditing(false)} disabled={saving}>
            <X className="size-3.5" />
            Cancel
          </Button>
        </div>
      </li>
    );
  }

  const label = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium">{speech.title}</span>
        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
          {context || speech.source} · {speech.flaggedCount} flagged ·{" "}
          {speech.wordCount.toLocaleString()} words
        </span>
      </span>
      <span className={cn("shrink-0 text-[13px] font-semibold tabular-nums", score.text)}>
        {percent(speech.aiProbability)}
      </span>
    </>
  );

  const rowClass =
    "flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left transition-colors hover:border-border/70 hover:bg-card/50";

  return (
    <li className="flex items-center gap-1">
      {speech.videoId ? (
        <a
          className={rowClass}
          href={`https://www.youtube.com/watch?v=${speech.videoId}`}
          target="_blank"
          rel="noreferrer"
        >
          {label}
        </a>
      ) : (
        <div className={rowClass}>{label}</div>
      )}
      <button
        type="button"
        onClick={startEditing}
        aria-label={`Edit labels for ${speech.title}`}
        title="Correct the politician, party or topic"
        className="shrink-0 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Pencil className="size-3.5" />
      </button>
    </li>
  );
}

function LabelInput({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  return (
    <label className="flex items-center gap-2">
      <span className="w-20 shrink-0 text-[11px] text-muted-foreground">{label}</span>
      <input
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        placeholder={label}
        className="min-w-0 flex-1 rounded-lg border border-border bg-background/70 px-2 py-1 text-[12px] outline-none focus-visible:border-ring"
      />
    </label>
  );
}
