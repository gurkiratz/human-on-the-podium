"use client";

import { Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SpeakerSummary } from "@/lib/types";

const SPEAKER_COLORS = [
  "bg-sky-400",
  "bg-violet-400",
  "bg-emerald-400",
  "bg-amber-400",
  "bg-rose-400",
  "bg-cyan-400",
];

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return `${minutes}:${rest.toString().padStart(2, "0")}`;
}

function Chip({
  active,
  label,
  hint,
  onClick,
}: {
  active: boolean;
  label: string;
  hint?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-xs transition-colors",
        active
          ? "border-transparent bg-primary text-primary-foreground"
          : "border-border/70 text-muted-foreground hover:border-border hover:text-foreground",
      )}
    >
      {label}
      {hint ? (
        <span className={cn("text-[10px]", active ? "text-primary-foreground/70" : "opacity-70")}>
          {hint}
        </span>
      ) : null}
    </button>
  );
}

export function SpeakerPicker({
  speakers,
  selected,
  primary,
  reason,
  onSelect,
}: {
  speakers: SpeakerSummary[];
  selected: string | null;
  primary?: string | null;
  reason?: string | null;
  onSelect: (speakerId: string | null) => void;
}) {
  if (speakers.length === 0) return null;

  const activeSpeaker = speakers.find((speaker) => speaker.id === selected) ?? null;
  const primaryIndex = speakers.findIndex((speaker) => speaker.id === primary);
  const hasPrimary = primaryIndex >= 0;

  const totalSeconds = speakers.reduce((total, speaker) => total + speaker.seconds, 0);
  const talkShare = (speaker: SpeakerSummary) =>
    totalSeconds > 0 ? (speaker.seconds / totalSeconds) * 100 : speaker.share * 100;

  return (
    <div className="glass flex flex-col gap-2.5 rounded-2xl border border-border/70 px-4 py-3">
      <div
        className="flex h-1.5 overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={`Talk time: ${speakers
          .map((speaker, index) => `Speaker ${index + 1} ${Math.round(talkShare(speaker))}%`)
          .join(", ")}`}
      >
        {speakers.map((speaker, index) => (
          <span
            key={speaker.id}
            className={cn(
              "h-full transition-opacity",
              SPEAKER_COLORS[index % SPEAKER_COLORS.length],
              selected !== null && selected !== speaker.id && "opacity-30",
            )}
            style={{ width: `${talkShare(speaker)}%` }}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          <Users className="size-3.5" />
          Speaker
        </span>

        <Chip
          active={selected === null}
          label="All"
          hint={`${speakers.length}`}
          onClick={() => onSelect(null)}
        />

        {speakers.map((speaker, index) => (
          <Chip
            key={speaker.id}
            active={selected === speaker.id}
            label={`Speaker ${index + 1}`}
            hint={`${Math.round(speaker.share * 100)}%${speaker.id === primary ? " · main" : ""}`}
            onClick={() => onSelect(speaker.id)}
          />
        ))}
      </div>

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        {activeSpeaker
          ? `${formatTime(activeSpeaker.seconds)} of speech · “${activeSpeaker.sample}…”`
          : hasPrimary
            ? `Auto-picked Speaker ${primaryIndex + 1}${reason ? `: ${reason}` : "."} Pick another to read only their words.`
            : "Pick a speaker to read only their words."}
      </p>
    </div>
  );
}
