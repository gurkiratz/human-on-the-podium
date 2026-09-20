import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { scoreGptZeroDocument } from "./gptzeroService.js";

describe("scoreGptZeroDocument", () => {
  it("uses a flagged sentence when the internal average is 0", () => {
    const result = scoreGptZeroDocument({
      average_generated_prob: 0,
      sentences: [
        {
          sentence: "Here's a more natural flowing version of that section.",
          generated_prob: 0.76,
        },
      ],
    });

    assert.equal(result.aiScore, 76);
    assert.match(result.flaggedPhrase ?? "", /more natural flowing version/);
  });

  it("uses class probability instead of a zero internal average", () => {
    const result = scoreGptZeroDocument({
      average_generated_prob: 0,
      completely_generated_prob: 0.12,
      class_probabilities: { ai: 0.81, human: 0.19 },
      document_classification: "AI_ONLY",
      sentences: [
        { sentence: "Madam Speaker, this office will not have that authority.", generated_prob: 0.76 },
      ],
    });

    assert.equal(result.aiScore, 85);
    assert.match(result.flaggedPhrase ?? "", /Madam Speaker/);
  });

  it("treats MIXED classification as at least medium risk", () => {
    const result = scoreGptZeroDocument({
      average_generated_prob: 0,
      class_probabilities: { ai: 0.4, mixed: 0.5, human: 0.1 },
      predicted_class: "mixed",
      sentences: [{ sentence: "Research shows this is inevitable.", generated_prob: 0.4 }],
    });

    assert.equal(result.aiScore, 55);
  });
});
