import { env } from "./env";
import { upstreamError } from "./errors";
import { UNKNOWN_SPEAKER, type Transcript, type TranscriptWord } from "./types";

const GPTZERO_URL = "https://api.gptzero.me/v2/predict/text";

/** GPTZero needs roughly this much text before its scores mean anything. */
const MIN_CHARS = 250;

/** Keep sentences short enough that GPTZero's segmentation lines up with ours. */
const MAX_WORDS_PER_SENTENCE = 45;

export interface BuiltSentence {
  text: string;
  start: number;
  end: number;
  speakerId: string | null;
}

export interface ScoredSentence extends BuiltSentence {
  generatedProb: number | null;
  flagged: boolean;
}

export interface AiReport {
  /** Which speaker was scored; null means every speaker in the clip. */
  scopedTo: string | null;
  scorable: boolean;
  reason?: string;
  wordCount: number;
  flaggedCount: number;
  document: {
    completelyGeneratedProb: number | null;
    averageGeneratedProb: number | null;
    burstiness: number | null;
    classification: string | null;
    humanProb: number | null;
    aiProb: number | null;
    mixedProb: number | null;
  } | null;
  sentences: ScoredSentence[];
}

/**
 * Cut the transcript into sentences, optionally for one speaker only. Scoring the anchor's
 * scripted narration alongside the subject's speech ruins the reading, so callers scope this.
 */
export function buildSentences(
  transcript: Transcript,
  speakerId: string | null = null,
): BuiltSentence[] {
  const words = transcript.words.filter(
    (word) =>
      word.type === "word" &&
      (!speakerId || (word.speaker_id ?? UNKNOWN_SPEAKER) === speakerId),
  );

  const sentences: BuiltSentence[] = [];
  let buffer: TranscriptWord[] = [];

  const flush = () => {
    if (buffer.length === 0) return;
    sentences.push({
      text: buffer.map((word) => word.text).join(" "),
      start: buffer[0].start,
      end: buffer[buffer.length - 1].end,
      speakerId: buffer[0].speaker_id ?? null,
    });
    buffer = [];
  };

  for (const word of words) {
    buffer.push(word);
    const endsSentence = /[.!?]["')\]]?$/.test(word.text);
    if (endsSentence || buffer.length >= MAX_WORDS_PER_SENTENCE) flush();
  }
  flush();

  return sentences;
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * GPTZero re-segments text, so match its sentences back onto ours. Exact normalised matches
 * first; anything left over takes the next unused slot in order.
 */
function align(
  ours: BuiltSentence[],
  theirs: { sentence?: string; generated_prob?: number; highlight_sentence_for_ai?: boolean }[],
): ScoredSentence[] {
  const taken = new Set<number>();
  const scored: (ScoredSentence | null)[] = ours.map(() => null);

  theirs.forEach((theirsSentence, index) => {
    const wanted = normalize(theirsSentence.sentence ?? "");
    let slot = -1;

    if (wanted) {
      slot = ours.findIndex(
        (sentence, candidate) => !taken.has(candidate) && normalize(sentence.text) === wanted,
      );
    }
    if (slot === -1 && index < ours.length && !taken.has(index)) slot = index;
    if (slot === -1) {
      slot = ours.findIndex((_, candidate) => !taken.has(candidate));
    }
    if (slot === -1) return;

    taken.add(slot);
    scored[slot] = {
      ...ours[slot],
      generatedProb:
        typeof theirsSentence.generated_prob === "number" ? theirsSentence.generated_prob : null,
      flagged: theirsSentence.highlight_sentence_for_ai === true,
    };
  });

  return scored.map(
    (sentence, index) =>
      sentence ?? { ...ours[index], generatedProb: null, flagged: false },
  );
}

export async function scoreTranscript(
  transcript: Transcript,
  speakerId: string | null = null,
): Promise<AiReport> {
  const sentences = buildSentences(transcript, speakerId);
  const wordCount = sentences.reduce(
    (total, sentence) => total + sentence.text.split(/\s+/).length,
    0,
  );
  const document = sentences.map((sentence) => sentence.text).join("\n");

  const empty: AiReport = {
    scopedTo: speakerId,
    scorable: false,
    wordCount,
    flaggedCount: 0,
    document: null,
    sentences: sentences.map((sentence) => ({ ...sentence, generatedProb: null, flagged: false })),
  };

  if (document.trim().length < MIN_CHARS) {
    return { ...empty, reason: "Not enough speech to score — GPTZero needs a longer passage." };
  }

  const response = await fetch(GPTZERO_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.gptzeroApiKey,
    },
    body: JSON.stringify({ document }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw upstreamError("GPTZero", response.status, detail);
  }

  const payload = (await response.json()) as {
    documents?: Array<{
      completely_generated_prob?: number;
      average_generated_prob?: number;
      overall_burstiness?: number;
      document_classification?: string;
      predicted_class?: string;
      class_probabilities?: { human?: number; ai?: number; mixed?: number };
      sentences?: Array<{
        sentence?: string;
        generated_prob?: number;
        highlight_sentence_for_ai?: boolean;
      }>;
    }>;
  };

  const first = payload.documents?.[0];
  if (!first) {
    return { ...empty, reason: "GPTZero returned no document." };
  }

  const scored = align(sentences, first.sentences ?? []);

  return {
    scopedTo: speakerId,
    scorable: true,
    wordCount,
    flaggedCount: scored.filter((sentence) => sentence.flagged).length,
    document: {
      completelyGeneratedProb: first.completely_generated_prob ?? null,
      averageGeneratedProb: first.average_generated_prob ?? null,
      burstiness: first.overall_burstiness ?? null,
      classification: first.document_classification ?? first.predicted_class ?? null,
      humanProb: first.class_probabilities?.human ?? null,
      aiProb: first.class_probabilities?.ai ?? null,
      mixedProb: first.class_probabilities?.mixed ?? null,
    },
    sentences: scored,
  };
}


