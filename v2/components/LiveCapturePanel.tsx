"use client";

import { useEffect, useRef } from "react";
import { Plus } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { LiveRecordButton } from "./LiveRecordButton";
import { LiveSettingsDialog, type LivePrefs } from "./LiveSettingsDialog";
import { Button } from "@/components/ui/button";
import type { PersonaState } from "./ai-elements/persona";
import { cn } from "@/lib/utils";
import type { CameraState, DeviceOption } from "@/lib/useDevices";

type Props = {
  running: boolean;
  speaking: boolean;
  level: number;
  videoOn: boolean;
  onCameraToggle: () => void;
  camera: CameraState;
  mics: DeviceOption[];
  cameras: DeviceOption[];
  micId: string;
  cameraId: string;
  onMicChange: (id: string) => void;
  onCameraChange: (id: string) => void;
  voiceId: string;
  onVoiceChange: (id: string) => void;
  onToggle: () => void;
  /** Closes the current session and starts a fresh one. */
  onNewSession: () => void;
  onPreviewVoice: () => void;
  /** The tail of the live transcript, shown over the video like subtitles. */
  caption: string;
  prefs: LivePrefs;
  onPrefsChange: (prefs: LivePrefs) => void;
  /** Which state the record orb animates in. */
  personaState: PersonaState;
};

export function LiveCapturePanel(props: Props) {
  const reduced = useReducedMotion();
  const { stream } = props.camera;
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Bind the stream with an effect + plain <video>. Callback refs on
  // motion.video can miss updates, which leaves the camera LED on with a
  // blank frame.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (el.srcObject !== stream) el.srcObject = stream;
    if (stream) void el.play().catch(() => {});
  }, [stream]);

  const showVideo = props.videoOn && !!stream;
  const showWave = !showVideo;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-3 sm:gap-4 sm:p-4 lg:p-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[18px] font-semibold tracking-tight">Live capture</h2>
          <p className="text-[12px] text-muted-foreground">
            Record a speech and score it as it is spoken
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground hover:text-foreground"
            onClick={props.onNewSession}
            disabled={props.running}
            title="Close this session and start a new one"
          >
            <Plus className="size-3.5" />
            New session
          </Button>
          <LiveSettingsDialog
            mics={props.mics}
            cameras={props.cameras}
            micId={props.micId}
            cameraId={props.cameraId}
            onMicChange={props.onMicChange}
            onCameraChange={props.onCameraChange}
            voiceId={props.voiceId}
            onVoiceChange={props.onVoiceChange}
            prefs={props.prefs}
            onPrefsChange={props.onPrefsChange}
            running={props.running}
          />
        </div>
      </header>

      {/* Portrait frame that grows to fill whatever height the column has, so
          it is as large as the space allows. The video is absolutely
          positioned so it stays mounted while overlays frame it. */}
      <div className="glass relative min-h-0 w-full flex-1 overflow-hidden rounded-2xl">
        <motion.div
          className="absolute inset-0"
          animate={{ opacity: showVideo ? 1 : 0 }}
          transition={{ type: "spring", bounce: 0, duration: 0.4 }}
        >
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            aria-hidden={!showVideo}
            className={cn(
              "h-full w-full object-cover",
              props.prefs.mirror && "scale-x-[-1]",
            )}
          />
        </motion.div>

        {showWave && (
          <motion.div
            className="absolute inset-0 grid place-items-center"
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <Waveform level={props.level} running={props.running} />
          </motion.div>
        )}

        {props.videoOn && props.camera.needsGesture && (
          <div className="absolute inset-0 grid place-items-center bg-black/55 px-6">
            <button
              type="button"
              onClick={() => void props.camera.open()}
              className="glass rounded-full px-5 py-2.5 text-[13px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Enable camera
            </button>
          </div>
        )}

        {props.videoOn && props.camera.error && !props.camera.needsGesture && (
          <p className="absolute inset-x-3 top-3 rounded-xl bg-black/70 px-3 py-2 text-[11px] text-warning">
            {props.camera.error}
          </p>
        )}

        {props.running && props.caption ? (
          <div className="pointer-events-none absolute inset-x-2 bottom-2 flex justify-center">
            <p className="line-clamp-3 max-w-full rounded-lg bg-black/72 px-3 py-1.5 text-center text-[13px] font-medium leading-snug text-white shadow-lg backdrop-blur-sm">
              {props.caption}
            </p>
          </div>
        ) : !props.videoOn ? (
          <span className="absolute inset-x-0 bottom-3 text-center text-[11px] text-muted-foreground/60">
            Camera off
          </span>
        ) : null}

        <AnimatePresence>
          {props.speaking && (
            <motion.div
              className="pointer-events-none absolute inset-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{
                background:
                  "radial-gradient(120% 90% at 50% 100%, color-mix(in oklch, var(--destructive) 35%, transparent), transparent 70%)",
              }}
            />
          )}
        </AnimatePresence>
      </div>

      <div className="flex items-center justify-center gap-6">
        <IconToggle
          on={props.videoOn}
          onClick={props.onCameraToggle}
          label={props.videoOn ? "Turn camera off" : "Turn camera on"}
        >
          {props.videoOn ? <CameraIcon /> : <CameraOffIcon />}
        </IconToggle>

        <LiveRecordButton
          running={props.running}
          state={props.personaState}
          onToggle={props.onToggle}
        />

        <IconToggle
          on={!props.running}
          onClick={props.onPreviewVoice}
          label="Hear the roast voice"
          disabled={props.running}
        >
          <SpeakerIcon />
        </IconToggle>
      </div>

      <p className="text-center text-[11px] text-muted-foreground/60">
        {props.running
          ? "Mic closes automatically while the voice speaks."
          : "Devices and voice live in capture settings."}
      </p>
    </div>
  );
}

function Waveform({ level, running }: { level: number; running: boolean }) {
  const reduced = useReducedMotion();
  const bars = 20;
  return (
    <div className="flex h-40 items-center gap-1.5" aria-hidden>
      {Array.from({ length: bars }).map((_, i) => {
        // A soft bell across the bars so the middle reacts most, which reads
        // more like a voice than a flat block of equal-height bars.
        const weight = Math.sin((i / (bars - 1)) * Math.PI) ** 1.6;
        const height = running ? 6 + level * 130 * weight : 6;
        return (
          <motion.span
            key={i}
            className="w-1.5 rounded-full bg-foreground/70"
            animate={{ height: reduced ? 6 : Math.max(6, height) }}
            transition={{ type: "spring", bounce: 0, duration: 0.22 }}
          />
        );
      })}
    </div>
  );
}

function IconToggle({
  on,
  onClick,
  label,
  disabled,
  children,
}: {
  on: boolean;
  onClick: () => void;
  label: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
      aria-label={label}
      title={label}
      className="glass grid h-10 w-10 place-items-center rounded-full text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed"
      style={{ opacity: on ? 1 : 0.4 }}
      whileTap={reduced || disabled ? undefined : { scale: 0.92 }}
      transition={{ type: "spring", bounce: 0, duration: 0.18 }}
    >
      {children}
    </motion.button>
  );
}

function SpeakerIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4.5 w-4.5 fill-none stroke-current" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 9.5h3l4.5-3.6v12.2L7 14.5H4z" />
      <path d="M16 9.2a4 4 0 0 1 0 5.6" />
      <path d="M18.6 6.6a7.6 7.6 0 0 1 0 10.8" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4.5 w-4.5 fill-none stroke-current" strokeWidth="1.7" strokeLinejoin="round">
      <rect x="2.5" y="6.5" width="13" height="11" rx="3" />
      <path d="m15.5 11 6-3.2v8.4l-6-3.2z" />
    </svg>
  );
}

function CameraOffIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4.5 w-4.5 fill-none stroke-current" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2.5" y="6.5" width="13" height="11" rx="3" />
      <path d="m15.5 11 6-3.2v8.4l-6-3.2z" />
      <path d="M3 3l18 18" />
    </svg>
  );
}
