import type { Detection, ScoredSentence } from "./types";

/**
 * The share of a passage that reads like a machine: sentence-level AI numbers
 * averaged, weighted by how long each sentence is.
 *
 * Deliberately not the document-level class probability. That answers "was
 * this written by AI?", which collapses a half-and-half passage onto one side
 * — a chunk where two sentences were pasted in and six were spoken comes back
 * as a flat `ai`. Weighting sentences keeps a half-and-half chunk reading as
 * half. Returns null when there is nothing to average.
 */
export function sentenceAiShare(sentences: ScoredSentence[]): number | null {
  let words = 0;
  let weighted = 0;
  for (const s of sentences) {
    const n = s.sentence.trim().split(/\s+/).filter(Boolean).length;
    if (n === 0) continue;
    words += n;
    weighted += s.ai * n;
  }
  return words === 0 ? null : weighted / words;
}

/** One chunk's share, falling back to the document probability if unscored. */
export function chunkAiShare(detection: Detection): number {
  return sentenceAiShare(detection.sentences) ?? detection.probs?.ai ?? 0;
}

/**
 * The whole session's share, pooling every sentence across chunks so a long
 * chunk counts for more than a short one.
 */
export function sessionAiShare(detections: Detection[]): number | null {
  if (detections.length === 0) return null;
  const pooled = sentenceAiShare(detections.flatMap((d) => d.sentences));
  if (pooled !== null) return pooled;

  // No chunk had per-sentence numbers: fall back to word-weighted document
  // probabilities rather than reporting nothing.
  let words = 0;
  let weighted = 0;
  for (const d of detections) {
    words += d.words;
    weighted += (d.probs?.ai ?? 0) * d.words;
  }
  return words === 0 ? null : weighted / words;
}

/** How many chunks landed on each verdict. */
export function verdictTally(detections: Detection[]) {
  const tally = { ai: 0, mixed: 0, human: 0 };
  for (const d of detections) tally[d.verdict] += 1;
  return tally;
}
