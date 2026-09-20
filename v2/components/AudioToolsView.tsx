"use client";

import { Languages, Music, SlidersHorizontal, Users, Waves } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Loader } from "@/components/ui/loader";
import { cn } from "@/lib/utils";
import type { TranscribeOptions } from "@/lib/transcribe";
import type { VideoProposal } from "@/lib/types";

const TARGET_LANGUAGES: Array<[string, string]> = [
  ["es", "Spanish"],
  ["fr", "French"],
  ["de", "German"],
  ["pt", "Portuguese"],
  ["it", "Italian"],
  ["hi", "Hindi"],
  ["ar", "Arabic"],
  ["zh", "Chinese"],
  ["ja", "Japanese"],
  ["ko", "Korean"],
  ["ru", "Russian"],
];

const POLL_INTERVAL_MS = 4000;
const POLL_LIMIT = 75;

function Card({
  icon,
  title,
  hint,
  children,
}: {
  icon: ReactNode;
  title: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <section className="glass flex flex-col gap-3 rounded-2xl border border-border/70 px-5 py-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl border border-border/70 bg-background/60 text-muted-foreground">
          {icon}
        </span>
        <div className="min-w-0">
          <h3 className="text-[13.5px] font-semibold tracking-tight">{title}</h3>
          <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">{hint}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

const inputClass =
  "min-w-0 flex-1 rounded-lg border border-border bg-background/70 px-3 py-1.5 text-xs text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring";

function AudioResult({ url, filename }: { url: string; filename: string }) {
  return (
    <div className="flex flex-col gap-2">
      <audio controls src={url} className="w-full" />
      <a
        href={url}
        download={filename}
        className="self-start text-[11px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        Download
      </a>
    </div>
  );
}

export function AudioToolsView({
  video,
  transcribeOptions,
  onTranscribeOptionsChange,
}: {
  video: VideoProposal | null;
  transcribeOptions: TranscribeOptions;
  onTranscribeOptionsChange: (options: TranscribeOptions) => void;
}) {
  return (
    <div className="scroll-quiet h-full overflow-y-auto px-4 py-5 sm:px-5 sm:py-6">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <div>
          <h2 className="text-[15px] font-semibold tracking-tight">Audio tools</h2>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            Extra ElevenLabs audio features beyond transcription. Isolate, translate or generate
            audio — each runs on demand and bills separately.
          </p>
        </div>

        <VoiceIsolator />
        <DubTool video={video} />
        <SoundEffectTool />
        <TranscriptionDefaults
          options={transcribeOptions}
          onChange={onTranscribeOptionsChange}
        />
      </div>
    </div>
  );
}

function VoiceIsolator() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [],
  );

  async function run() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("audio", file);
      const response = await fetch("/api/audio-tools/isolate", {
        method: "POST",
        body: form,
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? `Isolation failed (${response.status}).`);
      }
      const blob = await response.blob();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      const next = URL.createObjectURL(blob);
      urlRef.current = next;
      setUrl(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      icon={<Waves className="size-4" />}
      title="Voice isolator"
      hint="Strip background noise, music and room tone from a recording, leaving clean speech."
    >
      <input
        type="file"
        accept="audio/*,video/*"
        aria-label="Audio or video file to isolate"
        disabled={busy}
        onChange={(event) => {
          setFile(event.target.files?.[0] ?? null);
          setError(null);
        }}
        className="text-xs text-muted-foreground file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-muted file:px-2.5 file:py-1.5 file:text-xs file:text-foreground"
      />
      <div>
        <Button size="sm" onClick={() => void run()} disabled={busy || !file}>
          {busy ? "Isolating…" : "Isolate voice"}
        </Button>
      </div>
      {busy ? <Loader variant="dots" size="sm" /> : null}
      {error ? <p className="text-[11px] leading-relaxed text-destructive">{error}</p> : null}
      {url ? <AudioResult url={url} filename="isolated.mp3" /> : null}
    </Card>
  );
}

function DubTool({ video }: { video: VideoProposal | null }) {
  const [sourceUrl, setSourceUrl] = useState(video?.url ?? "");
  const [targetLang, setTargetLang] = useState("es");
  const [job, setJob] = useState<{ projectId: string; languageId: string | null } | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (video?.url) setSourceUrl((current) => current || video.url);
  }, [video?.url]);

  useEffect(() => {
    if (!job) return;
    let cancelled = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout>;

    async function tick() {
      if (cancelled) return;
      try {
        const query = new URLSearchParams({ projectId: job!.projectId });
        if (job!.languageId) query.set("languageId", job!.languageId);
        const response = await fetch(`/api/audio-tools/dub?${query}`, { cache: "no-store" });
        const data = (await response.json()) as {
          status?: string;
          audioUrl?: string;
          languageId?: string;
          error?: string;
        };
        if (cancelled) return;

        if (!response.ok || data.status === "failed") {
          setError(data.error ?? `Dubbing failed (${response.status}).`);
          setJob(null);
          return;
        }
        if (data.status === "completed" && data.audioUrl) {
          setUrl(data.audioUrl);
          setStatus(null);
          setJob(null);
          return;
        }

        setStatus(data.status ?? "processing");
        attempts += 1;
        if (attempts > POLL_LIMIT) {
          setError("Dubbing is taking longer than expected. Try again in a moment.");
          setJob(null);
          return;
        }
        timer = setTimeout(tick, POLL_INTERVAL_MS);
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : String(caught));
          setJob(null);
        }
      }
    }

    timer = setTimeout(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [job]);

  async function start() {
    if (!sourceUrl.trim()) return;
    setStatus("starting");
    setError(null);
    setUrl(null);
    try {
      const response = await fetch("/api/audio-tools/dub", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceUrl: sourceUrl.trim(), targetLang }),
      });
      const data = (await response.json()) as {
        projectId?: string;
        languageId?: string | null;
        status?: string;
        error?: string;
      };
      if (!response.ok || !data.projectId) {
        throw new Error(data.error ?? `Dubbing failed (${response.status}).`);
      }
      setJob({ projectId: data.projectId, languageId: data.languageId ?? null });
      setStatus(data.status ?? "queued");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setStatus(null);
    }
  }

  const running = job !== null;

  return (
    <Card
      icon={<Languages className="size-4" />}
      title="Dub this speech"
      hint="Re-voice a video in another language, keeping each speaker's tone and timing. Takes a few minutes."
    >
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={sourceUrl}
          disabled={running}
          onChange={(event) => setSourceUrl(event.target.value)}
          placeholder="https://www.youtube.com/watch?v=…"
          aria-label="Video URL to dub"
          className={inputClass}
        />
        <select
          value={targetLang}
          disabled={running}
          onChange={(event) => setTargetLang(event.target.value)}
          className="rounded-lg border border-border bg-background/70 px-2.5 py-1.5 text-xs text-foreground outline-none focus-visible:border-ring"
        >
          {TARGET_LANGUAGES.map(([code, label]) => (
            <option key={code} value={code}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-3">
        <Button size="sm" onClick={() => void start()} disabled={running || !sourceUrl.trim()}>
          {running ? "Dubbing…" : "Start dubbing"}
        </Button>
        {running && status ? (
          <span className="inline-flex items-center gap-2 text-[11px] text-muted-foreground">
            <Loader variant="pulse-dot" size="sm" />
            {status === "ready" ? "generating audio…" : status}
          </span>
        ) : null}
      </div>
      {error ? <p className="text-[11px] leading-relaxed text-destructive">{error}</p> : null}
      {url ? <AudioResult url={url} filename={`dub-${targetLang}.mp3`} /> : null}
    </Card>
  );
}

function SoundEffectTool() {
  const [text, setText] = useState("");
  const [duration, setDuration] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [],
  );

  async function run() {
    if (!text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/audio-tools/sound-effect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim(), durationSeconds: duration || undefined }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? `Sound effect failed (${response.status}).`);
      }
      const blob = await response.blob();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      const next = URL.createObjectURL(blob);
      urlRef.current = next;
      setUrl(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      icon={<Music className="size-4" />}
      title="Sound effect"
      hint="Describe any sound in words and generate a clip — stings, ambience, Foley."
    >
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={text}
          disabled={busy}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void run();
          }}
          placeholder="Spacious braam for a high-impact trailer moment"
          aria-label="Sound effect description"
          className={inputClass}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
          Duration
          <input
            type="range"
            min={0.5}
            max={30}
            step={0.5}
            value={duration || 0.5}
            disabled={busy}
            onChange={(event) => setDuration(Number(event.target.value))}
            className="accent-primary"
          />
          <span className="w-10 tabular-nums text-foreground">
            {duration ? `${duration}s` : "auto"}
          </span>
        </label>
        <Button size="sm" onClick={() => void run()} disabled={busy || !text.trim()}>
          {busy ? "Generating…" : "Generate"}
        </Button>
      </div>
      {error ? <p className="text-[11px] leading-relaxed text-destructive">{error}</p> : null}
      {url ? <AudioResult url={url} filename="sound-effect.mp3" /> : null}
    </Card>
  );
}

function TranscriptionDefaults({
  options,
  onChange,
}: {
  options: TranscribeOptions;
  onChange: (options: TranscribeOptions) => void;
}) {
  const [keytermsText, setKeytermsText] = useState((options.keyterms ?? []).join(", "));

  return (
    <Card
      icon={<SlidersHorizontal className="size-4" />}
      title="Transcription defaults"
      hint="Applied to Direct-link transcriptions. Keyterms and entity detection add a surcharge."
    >
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 rounded-lg border border-border bg-background/70 px-3 py-1.5 text-xs text-muted-foreground">
          <Users className="size-3.5" />
          Speakers
          <input
            type="number"
            min={1}
            max={32}
            value={options.numSpeakers ?? ""}
            placeholder="auto"
            onChange={(event) => {
              const value = event.target.value.trim();
              onChange({
                ...options,
                numSpeakers: value ? Math.min(Math.max(Number(value), 1), 32) : undefined,
              });
            }}
            className="w-16 bg-transparent text-right tabular-nums text-foreground outline-none placeholder:text-muted-foreground"
          />
        </label>

        <input
          value={keytermsText}
          onChange={(event) => {
            const value = event.target.value;
            setKeytermsText(value);
            onChange({
              ...options,
              keyterms: value
                .split(",")
                .map((term) => term.trim())
                .filter(Boolean),
            });
          }}
          placeholder="Keyterms, comma-separated (names, jargon)"
          aria-label="Keyterms, comma-separated"
          className={inputClass}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Toggle
          active={options.detectEntities ?? false}
          label="Entity detection"
          onClick={() => onChange({ ...options, detectEntities: !(options.detectEntities ?? false) })}
        />
        <Toggle
          active={options.noVerbatim ?? false}
          label="No verbatim"
          onClick={() => onChange({ ...options, noVerbatim: !(options.noVerbatim ?? false) })}
        />
      </div>
    </Card>
  );
}

function Toggle({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
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
    </button>
  );
}
