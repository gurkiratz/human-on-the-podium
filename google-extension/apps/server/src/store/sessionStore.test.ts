import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SessionStore } from "./sessionStore.js";

describe("SessionStore.buildReport", () => {
  it("builds report with claims and explanations", () => {
    const store = new SessionStore();
    const session = store.createSession({
      sourceType: "youtube",
      title: "Test Session",
    });

    store.addChunk({
      id: "chunk-1",
      sessionId: session.id,
      startTimeMs: 0,
      endTimeMs: 10000,
      text: "Sample chunk text for testing report output.",
      wordCount: 8,
      createdAt: new Date().toISOString(),
    });

    store.addDetection({
      id: "det-1",
      chunkId: "chunk-1",
      sessionId: session.id,
      provider: "mock",
      aiScore: 86,
      label: "high",
      flaggedPhrase: "sample phrase",
      rawResponse: {},
      createdAt: new Date().toISOString(),
    });

    store.addExplanation({
      id: "exp-1",
      chunkId: "chunk-1",
      sessionId: session.id,
      provider: "mock",
      summary: "Test explanation.",
      flaggedSentences: ["sample phrase"],
      createdAt: new Date().toISOString(),
    });

    store.addClaim({
      id: "claim-1",
      chunkId: "chunk-1",
      sessionId: session.id,
      text: "87% of users prefer this feature.",
      claimType: "statistical",
      needsVerification: true,
      supportStatus: "not_checked",
      createdAt: new Date().toISOString(),
    });

    const report = store.buildReport(session.id);
    assert.ok(report);
    assert.equal(report!.explanations.length, 1);
    assert.equal(report!.claims.length, 1);
    assert.equal(report!.topRiskMoments.length, 1);
    assert.match(report!.summary, /not definitive/i);
  });
});
