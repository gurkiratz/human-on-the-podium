"use client";

import { Play } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { Persona, type PersonaState } from "./ai-elements/persona";
import { cn } from "@/lib/utils";

type Props = {
  running: boolean;
  /** Drives the Persona orb's animation. */
  state: PersonaState;
  onToggle: () => void;
};

const SIZE = 100;

/**
 * The one control. At rest it is the red play button; once clicked it becomes
 * the obsidian Persona orb, which animates with the session state.
 */
export function LiveRecordButton({ running, state, onToggle }: Props) {
  const reduced = useReducedMotion();

  return (
    <div className="relative grid place-items-center" style={{ width: SIZE, height: SIZE }}>
      <motion.button
        type="button"
        onPointerDown={(e) => e.currentTarget.setPointerCapture(e.pointerId)}
        onClick={onToggle}
        aria-pressed={running}
        aria-label={running ? "Stop listening" : "Start listening"}
        whileTap={reduced ? undefined : { scale: 0.95 }}
        transition={{ type: "spring", bounce: 0, duration: 0.2 }}
        className={cn(
          "relative grid size-full place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring",
          !running && "border border-white/15",
        )}
        style={
          running
            ? undefined
            : {
                background:
                  "radial-gradient(120% 120% at 30% 20%, color-mix(in oklch, var(--destructive) 78%, white), var(--destructive))",
                boxShadow:
                  "0 14px 36px -18px color-mix(in oklch, var(--destructive) 60%, transparent), inset 0 1px 0 rgba(255,255,255,0.25)",
              }
        }
      >
        {running ? (
          <Persona state={state} variant="obsidian" className="size-full" />
        ) : (
          <Play className="size-7 translate-x-[1px] fill-white text-white" aria-hidden="true" />
        )}
      </motion.button>
    </div>
  );
}
