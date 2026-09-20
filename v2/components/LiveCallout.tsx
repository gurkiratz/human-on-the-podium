"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { VERDICT_COLOR } from "./VerdictBadge";
import type { Callout as CalloutType } from "@/lib/useDetector";

const HEADLINE = {
  ai: "BUSTED",
  human: "CLEAN",
  mixed: "HALF AND HALF",
} as const;

/**
 * The scoreboard moment. It scales up from the bottom edge it came from, and
 * only the AI verdict gets overshoot — a bounce on gentle praise would read as
 * celebration the content does not earn.
 */
export function LiveCallout({
  callout,
  speaking,
}: {
  callout: CalloutType | null;
  speaking: boolean;
}) {
  const reduced = useReducedMotion();
  const visible = callout && speaking;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key={callout.id}
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-8"
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: 36, scale: 0.92 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.96 }}
          transition={{
            type: "spring",
            bounce: callout.verdict === "ai" ? 0.35 : 0,
            duration: 0.45,
          }}
          style={{ transformOrigin: "bottom center" }}
        >
          <div
            className="glass-strong max-w-[46ch] rounded-3xl px-6 py-5 text-center"
            style={{
              borderColor: VERDICT_COLOR[callout.verdict],
              boxShadow: `0 30px 90px -30px ${VERDICT_COLOR[callout.verdict]}`,
            }}
          >
            <p
              className="text-[clamp(28px,4vw,46px)] font-black uppercase tracking-[0.08em]"
              style={{ color: VERDICT_COLOR[callout.verdict] }}
            >
              {HEADLINE[callout.verdict]}
            </p>
            <p className="mt-2 text-[17px] font-medium tracking-tight text-foreground">
              {callout.caption}
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
