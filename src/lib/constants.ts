/** Sentence-level AI threshold recommended in GPT_ZERO_FINDINGS.md §12. */
export const SENTENCE_AI_THRESHOLD = 0.65;

/** Below this → treat sentence as human-leaning for highlight bands. */
export const SENTENCE_HUMAN_MAX = 0.35;

/**
 * When false, GPTZero still scores chunks but ElevenLabs does not roast/praise.
 * Flip back on once detection feel is tuned.
 */
export const VOICE_FEEDBACK = false;

/** Max concurrent YouTube segment analyzes. */
export const MAX_YOUTUBE_JOBS = 4;
