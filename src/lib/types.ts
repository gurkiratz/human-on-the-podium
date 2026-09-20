export type Verdict = "ai" | "human" | "mixed";

/**
 * What kind of source a record came from. Everything today is a recording we
 * transcribe; `doc` is reserved for written sources, which are not supported
 * yet — nothing reads or writes it but the column itself.
 */
export type SourceType = "video" | "doc";

/** Document-level chance for each class (sums ~1). */
export type ClassProbs = {
  ai: number;
  human: number;
  mixed: number;
};

/** One sentence as GPTZero scored it. */
export type ScoredSentence = {
  sentence: string;
  /** 0..1, how much this sentence looks like AI text. */
  ai: number;
};

/** The result of scoring one chunk of transcript. */
export type Detection = {
  id: string;
  /** Monotonic index of the chunk within the session. */
  index: number;
  verdict: Verdict;
  /** Document-level probability of the predicted class, 0..1. */
  probability: number;
  /** Full class split from GPTZero. */
  probs: ClassProbs;
  confidence: "high" | "medium" | "low";
  /** `concatenated` or `polished` when the verdict is `mixed`. */
  subclass?: string;
  sentences: ScoredSentence[];
  words: number;
  /**
   * True when the chunk was below the 70-word floor from GPT_ZERO_FINDINGS.md.
   * A thin chunk can miss AI text, but it never invents it — so a thin `ai`
   * verdict is trustworthy and a thin `human` verdict is not.
   */
  thin: boolean;
  text: string;
  at: number;
};

export type ChunkReason = "full" | "pause" | "flush";

export type PendingChunk = {
  text: string;
  words: number;
  reason: ChunkReason;
};

/** Persisted YouTube 60s segment score. */
export type YoutubeScore = {
  id: string;
  sourceType: SourceType;
  youtubeUrl: string;
  videoId: string;
  title: string | null;
  startSec: number;
  /** Length of the excerpt we analyzed (always 60s today). */
  durationSec: number;
  /**
   * When the speech was recorded, in ms. CPAC gives an airdate, YouTube an
   * upload date. Null for rows filed before we captured it, and for sources
   * that do not publish one — never inferred from `createdAt`, which is only
   * when we ran the analysis.
   */
  publishedAt: number | null;
  /** Full length of the source recording in seconds; null when unknown. */
  sourceDurationSec: number | null;
  transcript: string;
  verdict: Verdict;
  probability: number;
  probs: ClassProbs;
  confidence: "high" | "medium" | "low";
  sentences: ScoredSentence[];
  words: number;
  createdAt: number;
  /**
   * Where this record sits on the 2D map. Projected from its embedding once
   * and cached, so the page never re-runs UMAP. Null until embeddings are
   * built for it.
   */
  point: { x: number; y: number } | null;
  /**
   * Where it sits in the 3D map. A separate UMAP run, not the 2D layout with
   * a depth bolted on: asking for a third component rearranges the other two,
   * so the two layouts are independent and both are cached.
   */
  point3: { x: number; y: number; z: number } | null;
};
