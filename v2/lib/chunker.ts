import type { ChunkReason, PendingChunk } from "./types";

/**
 * Decides when a run of live transcript is worth spending GPTZero quota on.
 *
 * The thresholds come from GPT_ZERO_FINDINGS.md:
 *  - casual speech needs ~70 words before the API reliably reports `ai`;
 *  - below that the API errs toward `human`, never toward a false `ai`.
 * So we send at 80 words normally, and settle for less only when the speaker
 * has paused (40) or hit stop (25) and the words would otherwise sit unscored.
 *
 * Chunks do not overlap: each word is billed exactly once.
 */
export const CHUNK_TARGET_WORDS = 80;
export const RELIABLE_WORDS = 70;
export const PAUSE_FLUSH_WORDS = 40;
/** Minimum pending words to score when the user hits stop. */
export const STOP_FLUSH_WORDS = 25;
export const PAUSE_MS = 2500;

export class TranscriptChunker {
  private pending: string[] = [];
  private lastWordAt = 0;

  /** Words waiting to be scored. */
  get pendingWords(): number {
    return this.pending.length;
  }

  get pendingText(): string {
    return this.pending.join(" ");
  }

  /**
   * Add newly committed transcript text.
   * Returns a chunk when the buffer has reached the target size.
   */
  push(text: string, now = Date.now()): PendingChunk | null {
    const words = text.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return null;
    this.pending.push(...words);
    this.lastWordAt = now;
    if (this.pending.length >= CHUNK_TARGET_WORDS) return this.take("full");
    return null;
  }

  /**
   * Call on a timer. Returns a chunk when the speaker has gone quiet long
   * enough and there is enough text pending to be worth scoring.
   */
  onTick(now = Date.now()): PendingChunk | null {
    if (this.pending.length < PAUSE_FLUSH_WORDS) return null;
    if (now - this.lastWordAt < PAUSE_MS) return null;
    return this.take("pause");
  }

  /**
   * Force out whatever is pending, e.g. when the session stops.
   * `minWords` defaults to the mid-session pause floor; stop uses a lower one.
   */
  flush(minWords = PAUSE_FLUSH_WORDS): PendingChunk | null {
    if (this.pending.length < minWords) return null;
    return this.take("flush");
  }

  reset() {
    this.pending = [];
    this.lastWordAt = 0;
  }

  private take(reason: ChunkReason): PendingChunk {
    const words = this.pending;
    this.pending = [];
    return { text: words.join(" "), words: words.length, reason };
  }
}

export function isThin(words: number): boolean {
  return words < RELIABLE_WORDS;
}
