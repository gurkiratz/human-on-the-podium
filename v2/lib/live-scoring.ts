import { isThin } from "./chunker";
import { env } from "./env";
import { upstreamError } from "./errors";
import type { ClassProbs, Detection, LiveScoredSentence, Verdict } from "./types";

const ENDPOINT = "https://api.gptzero.me/v2/predict/text";

type RawSentence = {
  sentence?: string;
  generated_prob?: number;
  class_probabilities?: { ai?: number };
};

type RawDocument = {
  predicted_class?: string;
  class_probabilities?: { ai?: number; human?: number; mixed?: number };
  confidence_category?: string;
  completely_generated_prob?: number;
  subclass?: Record<string, unknown> | string | null;
  sentences?: RawSentence[];
};

function verdictOf(raw: string | undefined): Verdict {
  if (raw === "ai" || raw === "human" || raw === "mixed") return raw;
  return "human";
}

function confidenceOf(raw: string | undefined): Detection["confidence"] {
  if (raw === "high" || raw === "medium" || raw === "low") return raw;
  return "medium";
}

function probsOf(doc: RawDocument, verdict: Verdict): ClassProbs {
  const raw = doc.class_probabilities;
  if (raw) {
    return {
      ai: raw.ai ?? 0,
      human: raw.human ?? 0,
      mixed: raw.mixed ?? 0,
    };
  }
  const p = doc.completely_generated_prob ?? 0;
  if (verdict === "ai") return { ai: p || 1, human: 0, mixed: 0 };
  if (verdict === "mixed") return { ai: 0, human: 0, mixed: p || 1 };
  return { ai: 0, human: p || 1, mixed: 0 };
}

function subclassOf(subclass: RawDocument["subclass"]): string | undefined {
  if (typeof subclass === "string") return subclass;
  if (subclass && typeof subclass === "object") {
    const entries = Object.entries(subclass).filter(
      (entry): entry is [string, number] => typeof entry[1] === "number",
    );
    if (entries.length === 0) return undefined;
    entries.sort((a, b) => b[1] - a[1]);
    return entries[0][0];
  }
  return undefined;
}

/**
 * Scores one live chunk of transcript.
 *
 * Sentence heat-map uses generated_prob / sentence class_probabilities.ai
 * (highlight_sentence_for_ai is unreliable per GPT_ZERO_FINDINGS.md). This is
 * the streaming counterpart to `scoreTranscript`, which scores a finished,
 * diarized clip instead.
 */
export async function scoreChunk(
  text: string,
  index: number,
): Promise<Detection> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "x-api-key": env.gptzeroApiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "youtube-ai-ingest/1.0",
    },
    body: JSON.stringify({ document: text, multilingual: false }),
  });

  if (!res.ok) {
    throw upstreamError("GPTZero", res.status, await res.text());
  }

  const json = (await res.json()) as { documents?: RawDocument[] };
  const doc = json.documents?.[0];
  if (!doc) throw new Error("GPTZero returned no document");

  const verdict = verdictOf(doc.predicted_class);
  const probs = probsOf(doc, verdict);
  const probability = probs[verdict] || doc.completely_generated_prob || 0;

  const sentences: LiveScoredSentence[] = (doc.sentences ?? []).map((s) => ({
    sentence: s.sentence ?? "",
    ai: s.class_probabilities?.ai ?? s.generated_prob ?? 0,
  }));

  const words = text.trim().split(/\s+/).filter(Boolean).length;

  return {
    id: `${index}-${Date.now()}`,
    index,
    verdict,
    probability,
    probs,
    confidence: confidenceOf(doc.confidence_category),
    subclass: subclassOf(doc.subclass),
    sentences,
    words,
    thin: isThin(words),
    text,
    at: Date.now(),
  };
}
