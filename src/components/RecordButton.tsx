"use client";

import { motion, useReducedMotion } from "motion/react";

type Props = {
  running: boolean;
  level: number;
  muted: boolean;
  onToggle: () => void;
};

const SIZE = 100;

/**
 * iOS Camera shutter: a red disc invites the press; it collapses into a
 * rounded square once recording, which is the universally understood "stop".
 */
export function RecordButton({ running, level, muted, onToggle }: Props) {
  const reduced = useReducedMotion();
  const ring = 1 + Math.min(level, 1) * 0.22;

  return (
    <div className="relative grid place-items-center">
      {running && !reduced && (
        <motion.span
          aria-hidden
          className="absolute rounded-full"
          style={{
            width: SIZE,
            height: SIZE,
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
        className="relative grid place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-white/70"
        style={{ width: SIZE, height: SIZE, boxShadow: "inset 0 0 0 3.5px #fff" }}
        animate={{ background: running ? "#3a3a3c" : "#111210" }}
        whileTap={reduced ? undefined : { scale: 0.94 }}
        transition={{ type: "spring", bounce: 0, duration: 0.28 }}
      >
        <motion.span
          className="block"
          style={{ background: "#ff3b30" }}
          animate={
            running
              ? { width: 30, height: 30, borderRadius: 7 }
              : { width: 74, height: 74, borderRadius: 999 }
          }
          transition={{ type: "spring", bounce: 0, duration: 0.32 }}
        />
      </motion.button>
    </div>
  );
}
