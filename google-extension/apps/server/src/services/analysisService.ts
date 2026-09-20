import { v4 as uuid } from "uuid";
import type { Claim, ClaimType, DetectionResult, Explanation } from "@humanonthepodium/shared";
import { labelToRiskText } from "@humanonthepodium/shared";

const AI_SLOP_PATTERNS = [
  /rapidly evolving digital landscape/i,
  /leveraging innovative solutions/i,
  /seamless collaboration/i,
  /maximizing productivity/i,
  /in today's digital/i,
];

const EARLY_AI_PATTERNS: Array<{ re: RegExp; score: number; phrase: string }> = [
  { re: /here'?s a more natural flowing version/i, score: 82, phrase: "Here's a more natural flowing version" },
  { re: /rapidly evolving digital landscape/i, score: 86, phrase: "rapidly evolving digital landscape" },
  { re: /leveraging innovative solutions/i, score: 84, phrase: "leveraging innovative solutions" },
  { re: /seamless collaboration/i, score: 80, phrase: "seamless collaboration" },
  { re: /it is important to note/i, score: 64, phrase: "it is important to note" },
  { re: /delve into/i, score: 68, phrase: "delve into" },
  { re: /as we navigate/i, score: 66, phrase: "as we navigate" },
  { re: /underscores the importance/i, score: 72, phrase: "underscores the importance" },
  { re: /in today's \w+ (?:landscape|world|era)/i, score: 74, phrase: "in today's landscape" },
  { re: /play a (?:vital|crucial) role/i, score: 62, phrase: "play a crucial role" },
  { re: /not only .+ but also/i, score: 58, phrase: "not only... but also" },
  { re: /\b(?:furthermore|moreover),/i, score: 56, phrase: "furthermore" },
  { re: /a testament to/i, score: 60, phrase: "a testament to" },
];

export function earlyAiSignal(text: string): { score: number; flaggedPhrase?: string } {
  for (const pattern of EARLY_AI_PATTERNS) {
    if (pattern.re.test(text)) {
      return { score: pattern.score, flaggedPhrase: pattern.phrase };
    }
  }
  if (AI_SLOP_PATTERNS.some((pattern) => pattern.test(text))) {
    return { score: 78, flaggedPhrase: text.slice(0, 120) };
  }
  return { score: 0 };
}

const STATISTICAL_PATTERNS = [
  /\d+(?:\.\d+)?% of .+/i,
  /study found that/i,
  /research shows/i,
  /according to .+ report/i,
];

const SCIENTIFIC_PATTERNS = [
  /scientists (?:have |)(?:found|discovered|proved)/i,
  /clinical trial/i,
];

function extractFlaggedSentences(text: string): string[] {
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  return sentences.filter((s) =>
    AI_SLOP_PATTERNS.some((p) => p.test(s)),
  );
}

function classifyClaim(text: string): ClaimType {
  if (STATISTICAL_PATTERNS.some((p) => p.test(text))) return "statistical";
  if (SCIENTIFIC_PATTERNS.some((p) => p.test(text))) return "scientific";
  if (/\$[\d,]+|\d+ (?:million|billion)/i.test(text)) return "financial";
  if (/\d{4}|century|historically/i.test(text)) return "historical";
  return "other";
}

function extractClaims(
  sessionId: string,
  chunkId: string,
  text: string,
): Claim[] {
  const claims: Claim[] = [];
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);

  for (const sentence of sentences) {
    const isStatistical = STATISTICAL_PATTERNS.some((p) => p.test(sentence));
    const isScientific = SCIENTIFIC_PATTERNS.some((p) => p.test(sentence));
    const hasNumber = /\d+/.test(sentence);

    if (!isStatistical && !isScientific && !hasNumber) continue;
    if (sentence.length < 20) continue;

    claims.push({
      id: uuid(),
      chunkId,
      sessionId,
      text: sentence.trim(),
      claimType: classifyClaim(sentence),
      needsVerification: true,
      supportStatus: "not_checked",
      createdAt: new Date().toISOString(),
    });
  }

  return claims;
}

function buildExplanation(
  sessionId: string,
  chunkId: string,
  text: string,
  detection: DetectionResult,
): Explanation {
  const flaggedSentences = extractFlaggedSentences(text);
  if (detection.flaggedPhrase && !flaggedSentences.includes(detection.flaggedPhrase)) {
    flaggedSentences.unshift(detection.flaggedPhrase);
  }

  let summary: string;
  let recommendedFollowUp: string | undefined;

  if (detection.label === "high") {
    summary =
      "This segment uses broad, generic language with little personal detail. Patterns match commonly AI-generated phrasing.";
    recommendedFollowUp =
      "Ask the speaker for a concrete example, source, or personal context.";
  } else if (detection.label === "medium") {
    summary =
      "Mixed signals detected. Some phrasing appears formal or generic; review recommended before drawing conclusions.";
    recommendedFollowUp =
      "Request clarification on specific claims or ask for supporting evidence.";
  } else {
    summary =
      "Speech patterns appear conversational and specific. Low AI-written likelihood for this segment.";
  }

  return {
    id: uuid(),
    chunkId,
    sessionId,
    provider: "mock",
    summary,
    flaggedSentences: flaggedSentences.slice(0, 3),
    recommendedFollowUp,
    createdAt: new Date().toISOString(),
  };
}

export interface ChunkAnalysis {
  explanation: Explanation;
  claims: Claim[];
  claimWarning?: string;
}

export function analyzeChunk(params: {
  sessionId: string;
  chunkId: string;
  text: string;
  detection: DetectionResult;
}): ChunkAnalysis {
  const { sessionId, chunkId, text, detection } = params;
  const explanation = buildExplanation(sessionId, chunkId, text, detection);
  const claims = extractClaims(sessionId, chunkId, text);

  let claimWarning: string | undefined;
  if (claims.some((c) => c.needsVerification)) {
    claimWarning = "Citation needed — unsupported claim risk";
  }

  if (detection.label === "high" && !claimWarning) {
    claimWarning = undefined;
  }

  return { explanation, claims, claimWarning };
}

export function buildEnhancedSummary(params: {
  chunkCount: number;
  avg: number;
  peak: number;
  highCount: number;
  claimCount: number;
}): string {
  const { chunkCount, avg, peak, highCount, claimCount } = params;
  let summary = `Session analyzed ${chunkCount} transcript chunk(s). `;
  summary += `Average AI-written likelihood: ${Math.round(avg)}%. `;
  summary += `Peak: ${Math.round(peak)}%. `;
  if (highCount > 0) {
    summary += `${highCount} segment(s) flagged for high AI-written likelihood. `;
  }
  if (claimCount > 0) {
    summary += `${claimCount} factual claim(s) flagged for verification. `;
  }
  summary += "This is not definitive.";
  return summary;
}

export { labelToRiskText };
