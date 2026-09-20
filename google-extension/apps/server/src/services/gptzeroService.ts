import { v4 as uuid } from "uuid";
import type { DetectionResult } from "@humanonthepodium/shared";
import { scoreToLabel } from "@humanonthepodium/shared";
import { config } from "../config.js";
import { detectMockScore } from "./transcriptionService.js";

interface GptZeroSentence {
  sentence?: string;
  generated_prob?: number;
  generatedProb?: number;
  highlight_sentence_for_ai?: boolean;
  highlightSentenceForAi?: boolean;
}

interface GptZeroDocument {
  average_generated_prob?: number;
  averageGeneratedProb?: number;
  completely_generated_prob?: number;
  completelyGeneratedProb?: number;
  predicted_class?: string;
  predictedClass?: string;
  document_classification?: string;
  documentClassification?: string;
  class_probabilities?: {
    ai?: number;
    AI?: number;
    human?: number;
    mixed?: number;
  };
  classProbabilities?: {
    ai?: number;
    AI?: number;
    human?: number;
    mixed?: number;
  };
  sentences?: GptZeroSentence[];
}

interface GptZeroResponse {
  documents?: GptZeroDocument[];
}

function asUnitProb(value: unknown): number | undefined {
  if (typeof value !== "number" || Number.isNaN(value)) return undefined;
  if (value < 0) return 0;
  if (value > 1) return Math.min(value / 100, 1);
  return value;
}

function sentenceProb(sentence: GptZeroSentence) {
  return asUnitProb(sentence.generated_prob ?? sentence.generatedProb) ?? 0;
}

export function scoreGptZeroDocument(doc: GptZeroDocument | undefined) {
  if (!doc) {
    return { aiScore: undefined as number | undefined, flaggedPhrase: undefined as string | undefined };
  }

  const classProb = doc.class_probabilities ?? doc.classProbabilities ?? {};
  const aiClass = asUnitProb(classProb.ai ?? classProb.AI);
  const mixedClass = asUnitProb(classProb.mixed);
  const complete = asUnitProb(doc.completely_generated_prob ?? doc.completelyGeneratedProb);
  const average = asUnitProb(doc.average_generated_prob ?? doc.averageGeneratedProb);
  const sentences = doc.sentences ?? [];
  const maxSentence = sentences.reduce((max, sentence) => Math.max(max, sentenceProb(sentence)), 0);

  const classification = String(
    doc.document_classification ?? doc.documentClassification ?? doc.predicted_class ?? doc.predictedClass ?? "",
  ).toUpperCase();

  // GPTZero's average_generated_prob is often 0 even when a sentence is flagged.
  let score01 = Math.max(aiClass ?? 0, mixedClass ?? 0, complete ?? 0, maxSentence);
  if (score01 === 0 && average) {
    score01 = average;
  }

  if (classification.includes("AI_ONLY") || classification === "AI") {
    score01 = Math.max(score01, 0.85);
  } else if (classification.includes("MIXED")) {
    score01 = Math.max(score01, 0.55);
  }

  const highlighted = [...sentences]
    .filter(
      (sentence) =>
        sentence.highlight_sentence_for_ai ||
        sentence.highlightSentenceForAi ||
        sentenceProb(sentence) >= 0.45,
    )
    .sort((a, b) => sentenceProb(b) - sentenceProb(a))[0];

  const strongest = [...sentences].sort((a, b) => sentenceProb(b) - sentenceProb(a))[0];
  const flaggedPhrase = (highlighted?.sentence ?? (maxSentence >= 0.35 ? strongest?.sentence : undefined))?.slice(
    0,
    160,
  );

  return {
    aiScore: Math.round(score01 * 100),
    flaggedPhrase,
  };
}

export async function scoreWithGptZero(params: {
  sessionId: string;
  chunkId: string;
  text: string;
}): Promise<DetectionResult> {
  const { sessionId, chunkId, text } = params;

  if (config.useMockGptZero || !config.gptzeroApiKey) {
    const mock = detectMockScore(text);
    return {
      id: uuid(),
      chunkId,
      sessionId,
      provider: "mock",
      aiScore: mock.score,
      label: scoreToLabel(mock.score),
      flaggedPhrase: mock.flaggedPhrase,
      rawResponse: { mock: true, text: text.slice(0, 200) },
      createdAt: new Date().toISOString(),
    };
  }

  const response = await fetch("https://api.gptzero.me/v2/predict/text", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.gptzeroApiKey,
    },
    body: JSON.stringify({
      document: text,
      multilingual: true,
    }),
  });

  if (!response.ok) {
    const fallback = detectMockScore(text);
    return {
      id: uuid(),
      chunkId,
      sessionId,
      provider: "mock",
      aiScore: fallback.score,
      label: scoreToLabel(fallback.score),
      flaggedPhrase: fallback.flaggedPhrase,
      rawResponse: { error: await response.text(), fallback: true },
      createdAt: new Date().toISOString(),
    };
  }

  const data = (await response.json()) as GptZeroResponse & GptZeroDocument;
  const parsed = scoreGptZeroDocument(data.documents?.[0] ?? data);
  const heuristic = detectMockScore(text);
  const aiScore = parsed.aiScore ?? heuristic.score;

  return {
    id: uuid(),
    chunkId,
    sessionId,
    provider: "gptzero",
    aiScore,
    label: scoreToLabel(aiScore),
    flaggedPhrase: parsed.flaggedPhrase ?? heuristic.flaggedPhrase,
    rawResponse: data,
    createdAt: new Date().toISOString(),
  };
}
