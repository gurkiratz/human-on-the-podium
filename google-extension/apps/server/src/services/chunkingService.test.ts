import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TranscriptSegment } from "@humanonthepodium/shared";
import { ChunkingBuffer } from "./chunkingService.js";

function segment(
  startTimeMs: number,
  endTimeMs: number,
  text: string,
): TranscriptSegment {
  return {
    id: `seg-${startTimeMs}`,
    sessionId: "sess-1",
    startTimeMs,
    endTimeMs,
    text,
    createdAt: new Date().toISOString(),
  };
}

describe("ChunkingBuffer", () => {
  it("emits chunk when word and time thresholds are met", () => {
    const buffer = new ChunkingBuffer("sess-1");
    const words = Array.from({ length: 12 }, (_, i) => `word${i}`).join(" ");
    const chunk = buffer.addSegment(segment(0, 1000, words));
    assert.ok(chunk);
    assert.equal(chunk!.wordCount >= 12, true);
    assert.equal(chunk!.sessionId, "sess-1");
  });

  it("does not emit chunk when thresholds are not met", () => {
    const buffer = new ChunkingBuffer("sess-1");
    const chunk = buffer.addSegment(segment(0, 2000, "short text"));
    assert.equal(chunk, null);
  });

  it("flush emits remaining segments", () => {
    const buffer = new ChunkingBuffer("sess-1");
    buffer.addSegment(segment(0, 2000, "leftover segment text here"));
    const chunk = buffer.flush();
    assert.ok(chunk);
    assert.match(chunk!.text, /leftover/);
  });
});
