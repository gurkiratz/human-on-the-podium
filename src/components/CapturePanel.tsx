"use client";

import { useEffect, useRef } from "react";
import { motion, useReducedMotion } from "motion/react";
import { RecordButton } from "./RecordButton";
import { Select } from "./Select";
import { useCamera, type DeviceOption } from "@/lib/useDevices";
import { VOICES } from "@/lib/voices";
import type { ScribeStatus } from "@/lib/scribe";

type Props = {
  running: boolean;
  status: ScribeStatus;
  speaking: boolean;
  level: number;
  videoOn: boolean;
  onVideoToggle: () => void;
  mics: DeviceOption[];
  cameras: DeviceOption[];
  micId: string;
  cameraId: string;
  onMicChange: (id: string) => void;
  onCameraChange: (id: string) => void;
  voiceId: string;
  onVoiceChange: (id: string) => void;
  onToggle: () => void;
  onPreviewVoice: () => void;
};

const STATUS_COPY: Record<ScribeStatus, string> = {
  idle: "Ready",
  connecting: "Connecting",
  listening: "Listening",
  muted: "Mic closed",
  error: "Disconnected",
};

export function CapturePanel(props: Props) {
  const reduced = useReducedMotion();
  const camera = useCamera(props.videoOn, props.cameraId);
  const { stream } = camera;
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
  const statusLabel = props.speaking
    ? "Roasting you"
    : STATUS_COPY[props.status];
  const dot = props.speaking
    ? "var(--color-ai)"
    : props.status === "listening"
    ? "var(--color-human)"
    : props.status === "muted"
    ? "var(--color-mixed)"
    : props.status === "error"
    ? "var(--color-ai)"
    : "var(--faint)";

  return (
    <div className="flex h-full min-h-0 flex-col gap-5 bg-[#111210] p-5 lg:p-7">
      <header className="flex items-center justify-between">
        <div>
          <p className="caps text-[10px] font-semibold text-[var(--faint)]">
            Real-time analysis
          </p>
          <h1 className="title mt-1 text-[26px] font-semibold">
            Live detector
          </h1>
        </div>
        <div className="flex items-center gap-2 border border-[var(--hairline)] px-3 py-2">
          <motion.span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: dot }}
            animate={
              reduced || !props.running
                ? { opacity: 1 }
                : { opacity: [1, 0.35, 1] }
            }
            transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
          />
          <span className="text-[11px] font-medium text-[var(--muted)]">
            {statusLabel}
          </span>
        </div>
      </header>

      {/* The video is absolutely positioned so it can stay mounted, which
          leaves this box with no intrinsic height — hence the explicit floor,
          so it cannot collapse when the panel is short. */}
      <div className="relative min-h-[200px] flex-1 overflow-hidden border border-[var(--hairline)] bg-black">
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
            className="h-full w-full scale-x-[-1] object-cover"
          />
        </motion.div>

        {!showVideo && (
          <motion.div
            className="absolute inset-0 grid place-items-center"
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <Waveform level={props.level} running={props.running} />
          </motion.div>
        )}

        {props.videoOn && camera.needsGesture && (
          <div className="absolute inset-0 grid place-items-center bg-black/55 px-6">
            <button
              type="button"
              onClick={() => void camera.open()}
              className="border border-white/25 bg-black/60 px-5 py-2.5 text-[13px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            >
              Enable camera
            </button>
          </div>
        )}

        {props.videoOn && camera.error && !camera.needsGesture && (
          <p className="absolute inset-x-4 bottom-4 border border-[var(--color-mixed)]/30 bg-black/80 px-3 py-2 text-[11px] text-[var(--color-mixed)]">
            {camera.error}
          </p>
        )}

        {props.speaking && (
          <motion.div
            className="pointer-events-none absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              background:
                "radial-gradient(120% 90% at 50% 100%, rgba(255,69,58,0.35), transparent 70%)",
            }}
          />
        )}
      </div>

      <div className="flex items-center justify-center gap-6">
        <IconToggle
          on={props.videoOn}
          onClick={() => {
            if (props.videoOn) {
              props.onVideoToggle();
              return;
            }
            // open() first so it arms the skip flag and treats the camera as
            // enabled before React re-renders — otherwise a racing effect can
            // discard the gesture-backed stream (LED on, blank preview).
            void camera.open();
            props.onVideoToggle();
          }}
          label={props.videoOn ? "Turn camera off" : "Turn camera on"}
        >
          {props.videoOn ? <CameraIcon /> : <CameraOffIcon />}
        </IconToggle>

        <RecordButton
          running={props.running}
          level={props.level}
          muted={props.status === "muted" || props.speaking}
          onToggle={props.onToggle}
        />

        {/* <IconToggle
          on={!props.running}
          onClick={props.onPreviewVoice}
          label="Hear the roast voice"
          disabled={props.running}
        >
          <SpeakerIcon />
        </IconToggle> */}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Select
          label="Microphone"
          value={props.micId}
          onChange={props.onMicChange}
          disabled={props.running}
          options={props.mics.map((m) => ({
            value: m.deviceId,
            label: m.label,
          }))}
        />
        <Select
          label="Camera"
          value={props.cameraId}
          onChange={props.onCameraChange}
          options={props.cameras.map((c) => ({
            value: c.deviceId,
            label: c.label,
          }))}
        />
        <Select
          label="Roast voice"
          value={props.voiceId}
          onChange={props.onVoiceChange}
          options={VOICES.map((v) => ({
            value: v.id,
            label: `${v.name} — ${v.blurb}`,
          }))}
        />
      </div>

      {props.running && (
        <p className="text-center text-[11px] text-[var(--faint)]">
          Mic closes automatically while the voice speaks.
        </p>
      )}
    </div>
  );
}

function Waveform({ level, running }: { level: number; running: boolean }) {
  const reduced = useReducedMotion();
  const bars = 28;
  return (
    <div className="flex h-32 items-center gap-1.5" aria-hidden>
      {Array.from({ length: bars }).map((_, i) => {
        // A soft bell across the bars so the middle reacts most, which reads
        // more like a voice than a flat block of equal-height bars.
        const weight = Math.sin((i / (bars - 1)) * Math.PI) ** 1.6;
        const height = running ? 6 + level * 118 * weight : 6;
        return (
          <motion.span
            key={i}
            className="w-1.5 rounded-full bg-white/70"
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
      className="grid h-11 w-11 place-items-center border border-[var(--hairline)] bg-white/4 text-[var(--color-chalk)] outline-none focus-visible:ring-2 focus-visible:ring-white/60 disabled:cursor-not-allowed"
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
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5 fill-none stroke-current"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 9.5h3l4.5-3.6v12.2L7 14.5H4z" />
      <path d="M16 9.2a4 4 0 0 1 0 5.6" />
      <path d="M18.6 6.6a7.6 7.6 0 0 1 0 10.8" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5 fill-none stroke-current"
      strokeWidth="1.7"
      strokeLinejoin="round"
    >
      <rect x="2.5" y="6.5" width="13" height="11" rx="3" />
      <path d="m15.5 11 6-3.2v8.4l-6-3.2z" />
    </svg>
  );
}

function CameraOffIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5 fill-none stroke-current"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2.5" y="6.5" width="13" height="11" rx="3" />
      <path d="m15.5 11 6-3.2v8.4l-6-3.2z" />
      <path d="M3 3l18 18" />
    </svg>
  );
}
