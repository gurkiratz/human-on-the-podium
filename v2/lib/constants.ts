/** Sentence-level AI threshold recommended in GPT_ZERO_FINDINGS.md §12. */
export const SENTENCE_AI_THRESHOLD = 0.65;

/** Below this → treat sentence as human-leaning for highlight bands. */
export const SENTENCE_HUMAN_MAX = 0.35;

/** Max concurrent excerpt clips (yt-dlp + ffmpeg) running at once. */
export const MAX_CLIP_JOBS = 4;
