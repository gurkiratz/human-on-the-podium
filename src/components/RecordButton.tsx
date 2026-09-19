"use client";

import { motion, useReducedMotion } from "motion/react";

type Props = {
  running: boolean;
  level: number;
  muted: boolean;
  onToggle: () => void;
};

/**
 * The one big control. Feedback lands on pointer-down rather than on click,
 * and the ring tracks the live input level so the button reads as connected to
 * the microphone rather than merely toggled.
 */
export function RecordButton({ running, level, muted, onToggle }: Props) {
  const reduced = useReducedMotion();
  const ring = 1 + Math.min(level, 1) * 0.28;

  return (
    <div className="relative grid place-items-center">
      {running && !reduced && (
        <motion.span
          aria-hidden
          className="absolute rounded-full"
          style={{
            width: 132,
            height: 132,
            background: muted
              ? "rgba(255,214,10,0.18)"
              : "rgba(255,69,58,0.18)",
          }}
          animate={{ scale: muted ? 1 : ring }}
          transition={{ type: "spring", bounce: 0, duration: 0.24 }}
        />
      )}

      <motion.button
        type="button"
        onPointerDown={(e) => e.currentTarget.setPointerCapture(e.pointerId)}
        onClick={onToggle}
        aria-pressed={running}
        aria-label={running ? "Stop listening" : "Start listening"}
        className="relative grid h-[132px] w-[132px] place-items-center rounded-full border border-white/15 outline-none focus-visible:ring-2 focus-visible:ring-white/70"
        style={{
          background:
            "radial-gradient(120% 120% at 30% 20%, #ff6b60, #d0231a)",
          boxShadow: running
            ? "0 18px 60px -18px rgba(255,69,58,0.95), inset 0 1px 0 rgba(255,255,255,0.3)"
            : "0 18px 50px -22px rgba(255,69,58,0.6), inset 0 1px 0 rgba(255,255,255,0.25)",
        }}
        whileTap={reduced ? undefined : { scale: 0.95 }}
        transition={{ type: "spring", bounce: 0, duration: 0.2 }}
      >
        {/* Red at rest so it invites the press; a square once it is running,
            which is the universally understood "stop". */}
        <motion.span
          className="block bg-white"
          animate={
            running
              ? { width: 38, height: 38, borderRadius: 10 }
              : { width: 0, height: 0, borderRadius: 999 }
          }
          transition={{ type: "spring", bounce: 0, duration: 0.35 }}
        />
      </motion.button>
    </div>
  );
}
