import { v4 as uuid } from "uuid";
import type { TranscriptChunk, TranscriptSegment } from "@humanonthepodium/shared";

const MIN_WORDS = 12;
const MIN_DURATION_MS = 4000;
const MAX_DURATION_MS = 14000;

export class ChunkingBuffer {
  private pendingSegments: TranscriptSegment[] = [];
  private emittedChunkEndMs = 0;

  constructor(private sessionId: string) {}

  addSegment(
    segment: TranscriptSegment,
    options?: { force?: boolean },
  ): TranscriptChunk | null {
    this.pendingSegments.push(segment);
    return this.tryEmitChunk(Boolean(options?.force));
  }

  flush(): TranscriptChunk | null {
    if (this.pendingSegments.length === 0) return null;
    return this.emitChunk(true);
  }

  private tryEmitChunk(force = false): TranscriptChunk | null {
    if (this.pendingSegments.length === 0) return null;

    const startTimeMs = this.pendingSegments[0].startTimeMs;
    const endTimeMs = this.pendingSegments.at(-1)!.endTimeMs;
    const text = this.pendingSegments.map((s) => s.text).join(" ");
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    const duration = endTimeMs - startTimeMs;

    const enoughWords = wordCount >= MIN_WORDS;
    const enoughTime = duration >= MIN_DURATION_MS && wordCount >= 8;
    const forceEmit = force || duration >= MAX_DURATION_MS;

    if (!forceEmit && !enoughWords && !enoughTime) {
      return null;
    }

    return this.emitChunk(false);
  }

  private emitChunk(flush: boolean): TranscriptChunk | null {
    if (this.pendingSegments.length === 0) return null;

    const segments = flush
      ? [...this.pendingSegments]
      : [...this.pendingSegments];

    const startTimeMs = segments[0].startTimeMs;
    const endTimeMs = segments.at(-1)!.endTimeMs;

    if (endTimeMs <= this.emittedChunkEndMs && !flush) {
      return null;
    }

    const text = segments.map((s) => s.text).join(" ").trim();
    if (!text) {
      this.pendingSegments = [];
      return null;
    }

    const chunk: TranscriptChunk = {
      id: uuid(),
      sessionId: this.sessionId,
      startTimeMs,
      endTimeMs,
      text,
      wordCount: text.split(/\s+/).filter(Boolean).length,
      createdAt: new Date().toISOString(),
    };

    this.emittedChunkEndMs = endTimeMs;
    this.pendingSegments = [];
    return chunk;
  }
}
