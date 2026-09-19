export type Verdict = "ai" | "human" | "mixed";

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
  youtubeUrl: string;
  videoId: string;
  title: string | null;
  startSec: number;
  durationSec: number;
  transcript: string;
  verdict: Verdict;
  probability: number;
  probs: ClassProbs;
  confidence: "high" | "medium" | "low";
  sentences: ScoredSentence[];
  words: number;
  createdAt: number;
};
