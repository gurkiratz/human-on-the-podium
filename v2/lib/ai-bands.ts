/**
 * One AI-share scale, shared by the excerpt view and the archive table.
 *
 * A raw "HUMAN" verdict reads as a hard ruling even when the model is hedging,
 * so wherever a reading is surfaced we show the share of the excerpt that
 * GPTZero puts on the machine side, plus a phrase someone can act on without
 * knowing what GPTZero is.
 */
export const AI_BANDS = [
  { max: 0.1, label: "Human hands", v: "--band-1" },
  { max: 0.3, label: "Mostly human", v: "--band-2" },
  { max: 0.55, label: "Ghostwriter?", v: "--band-3" },
  { max: 0.8, label: "Leans machine", v: "--band-4" },
  { max: Infinity, label: "Reads like a bot", v: "--band-5" },
] as const;

export type AiBand = (typeof AI_BANDS)[number];

/** The band a 0..1 AI share falls into. */
export function aiShareBand(share: number): AiBand {
  return AI_BANDS.find((band) => share < band.max) ?? AI_BANDS[AI_BANDS.length - 1];
}

export function aiPct(share: number): number {
  return Math.round(share * 100);
}

/** Tone for a 0..1 share, collapsing the five bands onto the three UI tones. */
export function aiTone(share: number): "ai" | "mixed" | "human" {
  if (share >= 0.55) return "ai";
  if (share >= 0.1) return "mixed";
  return "human";
}
