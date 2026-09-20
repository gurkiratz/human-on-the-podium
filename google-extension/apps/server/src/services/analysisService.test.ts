import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DetectionResult } from "@humanonthepodium/shared";
import { analyzeChunk, buildEnhancedSummary, earlyAiSignal } from "./analysisService.js";

function mockDetection(
  overrides: Partial<DetectionResult> & { chunkId: string; sessionId: string },
): DetectionResult {
  return {
    id: "det-1",
    provider: "mock",
    aiScore: 86,
    label: "high",
    rawResponse: {},
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("analyzeChunk", () => {
  it("flags AI slop with explanation and high label", () => {
    const text =
      "In today's rapidly evolving digital landscape, leveraging innovative solutions is essential.";
    const result = analyzeChunk({
      sessionId: "sess-1",
      chunkId: "chunk-1",
      text,
      detection: mockDetection({
        sessionId: "sess-1",
        chunkId: "chunk-1",
        aiScore: 86,
        label: "high",
        flaggedPhrase: "rapidly evolving digital landscape",
      }),
    });

    assert.equal(result.explanation.flaggedSentences.length > 0, true);
    assert.match(result.explanation.summary, /generic|AI-written|AI-generated/i);
    assert.equal(result.claims.length, 0);
  });

  it("extracts statistical claims with citation warning", () => {
    const text =
      "A 2025 Stanford study found that 87% of job candidates use AI to cheat in interviews.";
    const result = analyzeChunk({
      sessionId: "sess-1",
      chunkId: "chunk-2",
      text,
      detection: mockDetection({
        sessionId: "sess-1",
        chunkId: "chunk-2",
        aiScore: 62,
        label: "medium",
      }),
    });

    assert.ok(result.claims.length >= 1);
    assert.equal(result.claims[0].claimType, "statistical");
    assert.equal(result.claims[0].needsVerification, true);
    assert.equal(result.claimWarning, "Citation needed — unsupported claim risk");
  });
});

describe("earlyAiSignal", () => {
  it("raises immediately on spoken AI phrasing", () => {
    const result = earlyAiSignal(
      "Here's a more natural flowing version of that section that reads like a legislative speech.",
    );
    assert.equal(result.score >= 70, true);
    assert.ok(result.flaggedPhrase);
  });
});

describe("buildEnhancedSummary", () => {
  it("includes claim count in summary", () => {
    const summary = buildEnhancedSummary({
      chunkCount: 3,
      avg: 55,
      peak: 86,
      highCount: 1,
      claimCount: 2,
    });
    assert.match(summary, /3 transcript chunk/);
    assert.match(summary, /2 factual claim/);
    assert.match(summary, /not definitive/i);
  });
});
