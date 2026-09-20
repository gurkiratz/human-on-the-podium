"use client";

import { motion } from "motion/react";
import { SENTENCE_AI_THRESHOLD, SENTENCE_HUMAN_MAX } from "@/lib/constants";
import type { Detection } from "@/lib/types";

export type HeatToken = {
  key: string;
  text: string;
  ai: number;
};

function bandFor(ai: number): "ai" | "mixed" | "human" {
  if (ai >= SENTENCE_AI_THRESHOLD) return "ai";
  if (ai >= SENTENCE_HUMAN_MAX) return "mixed";
  return "human";
}

/** Flatten analyzed detections into the coloured sentence tokens the heat-map renders. */
export function heatTokens(detections: Detection[]): HeatToken[] {
  const out: HeatToken[] = [];
  for (const detection of detections) {
    detection.sentences.forEach((sentence, i) => {
      if (!sentence.sentence.trim()) return;
      out.push({ key: `${detection.id}-${i}`, text: sentence.sentence, ai: sentence.ai });
    });
  }
  return out;
}

/**
 * One sentence, tinted by how much of it reads like a machine. The fill is kept
 * low-alpha so a wall of flagged text stays readable rather than turning solid.
 */
export function HeatmapSentence({
  token,
  reduced,
}: {
  token: HeatToken;
  reduced: boolean;
}) {
  const band = bandFor(token.ai);

  const style =
    band === "ai"
      ? { background: "rgba(255,159,10,0.28)", color: "#ffe8cc" }
      : band === "mixed"
        ? {
            background: "rgba(255,214,10,0.18)",
            color: "rgba(255,214,10,0.95)",
          }
        : {
            background: "rgba(48,209,88,0.16)",
            color: "rgba(245,245,247,0.92)",
          };

  return (
    <motion.span
      initial={reduced ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
      title={`AI ${Math.round(token.ai * 100)}%`}
      className="mr-[0.3em] box-decoration-clone rounded-[4px] px-[0.15em] py-[0.05em]"
      style={style}
    >
      {token.text}
    </motion.span>
  );
}
