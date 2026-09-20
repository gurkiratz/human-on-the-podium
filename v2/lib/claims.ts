import OpenAI from "openai";
import { z } from "zod/v4";
import { env } from "./env";
import { buildSentences } from "./gptzero";
import { UNKNOWN_SPEAKER, type Transcript, type TranscriptWord } from "./types";

/**
 * Claim triage, not fact-checking. We extract the assertions a speech makes, say which
 * ones are falsifiable (a source could confirm or refute them), and leave the rest labelled
 * as rhetoric. No external verification happens here — that is a later step.
 */

export const CLAIM_TYPES = [
  "statistic",
  "causal",
  "predictive",
  "definitional",
  "value",
  "anecdote",
  "attribution",
] as const;

export type ClaimType = (typeof CLAIM_TYPES)[number];

export interface Claim {
  id: string;
  /** The assertion restated as a standalone sentence. */
  text: string;
  /** The words actually spoken, used to place the claim on the timeline. */
  quote: string;
  type: ClaimType;
  /**
   * True when the claim is specific and falsifiable, so a source could confirm or refute it.
   * Not a judgement that it is false — most checkable claims will turn out to be true.
   */
  checkable: boolean;
  /** 0-1 confidence that this is a genuine, correctly-typed claim. */
  confidence: number;
  /** Short justification for the checkable call. */
  rationale: string;
  /** Seconds into the clip, or null when the quote could not be located. */
  start: number | null;
  end: number | null;
}

export interface ClaimReport {
  /** Which speaker was read; null means every speaker in the clip. */
  scopedTo: string | null;
  scorable: boolean;
  reason?: string;
  wordCount: number;
  checkableCount: number;
  claims: Claim[];
}

const ClaimSchema = z.object({
  text: z.string(),
  quote: z.string(),
  type: z.enum(CLAIM_TYPES),
  checkable: z.boolean(),
  confidence: z.number().min(0).max(1),
  rationale: z.string(),
});

const ReportSchema = z.object({ claims: z.array(ClaimSchema) });

const SYSTEM_PROMPT = `You are analysing a political speech for a claim-triage tool.

Extract the ASSERTIONS the speaker makes, each as one atomic claim. Do not extract questions, greetings, procedural remarks, or pure filler.

For every claim, return:
- "text": the claim restated as a neutral standalone sentence. Do not add facts or soften it.
- "quote": a short exact substring copied verbatim from the transcript, enough to locate the claim.
- "type": one of statistic | causal | predictive | definitional | value | anecdote | attribution.
- "checkable": true only when the claim is specific AND falsifiable — a source could in principle confirm or refute it (a named number, date, event, comparison, or attribution like "studies show"). Set false for opinion, values, vague promises, and unfalsifiable rhetoric ("we will make this country great again").
- "rationale": at most 12 words explaining the checkable call.
- "confidence": 0-1, how sure you are this is a real, correctly-typed claim.

Rules:
- Most political speech is NOT checkable. Do not inflate the checkable set.
- "checkable" is not a judgement that the claim is false. Never rate truth.
- A claim typed "statistic" is always checkable — if it is not checkable, do not type it statistic.
- Split compound sentences into separate claims.
- Quote must be exact text that appears in the transcript.
- Return at most 25 claims, the most consequential first. If there is nothing claim-like, return an empty array.
- Reply with JSON only: {"claims":[{"text":"","quote":"","type":"","checkable":true,"confidence":0.9,"rationale":""}]}`;

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Find where a quote sits in the transcript so the claim can be timestamped.
 *
 * Only word tokens carry timings, so we match on the alphanumeric skeleton: concatenate the
 * speaker's words, search for the quote's opening characters, then walk back to word bounds.
 */
function locate(
  words: TranscriptWord[],
  quote: string,
): { start: number; end: number } | null {
  const parts = words.map((word) => ({ norm: normalize(word.text), word }));
  const target = normalize(quote);
  if (!target) return null;

  let full = "";
  const offsets: number[] = [];
  for (const part of parts) {
    offsets.push(full.length);
    full += part.norm;
  }

  // Anchor on a prefix rather than the whole quote, so a trailing ellipsis or a dropped
  // word in the model's copy does not defeat the match.
  const anchor = target.slice(0, Math.min(target.length, 24));
  const hit = full.indexOf(anchor);
  if (hit === -1) return null;

  let first = -1;
  let last = -1;
  for (let i = 0; i < parts.length; i++) {
    const from = offsets[i];
    const to = from + parts[i].norm.length;
    if (to <= hit) continue;
    if (from >= hit + target.length) break;
    if (first === -1) first = i;
    last = i;
  }
  if (first === -1) return null;

  return { start: parts[first].word.start, end: parts[last].word.end };
}

export async function extractClaims(
  transcript: Transcript,
  speakerId: string | null = null,
): Promise<ClaimReport> {
  const sentences = buildSentences(transcript, speakerId);
  const wordCount = sentences.reduce(
    (total, sentence) => total + sentence.text.split(/\s+/).length,
    0,
  );
  const document = sentences.map((sentence) => sentence.text).join("\n");

  const empty: ClaimReport = {
    scopedTo: speakerId,
    scorable: false,
    wordCount,
    checkableCount: 0,
    claims: [],
  };

  if (wordCount < 40) {
    return { ...empty, reason: "Not enough speech to find claims in yet." };
  }

  const client = new OpenAI({ apiKey: env.openaiApiKey });
  const completion = await client.chat.completions.create({
    model: env.openaiModel,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `Transcript:\n\n${document}` },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  let parsed: z.infer<typeof ReportSchema>;
  try {
    parsed = ReportSchema.parse(JSON.parse(raw));
  } catch {
    return { ...empty, reason: "The model did not return usable claims." };
  }

  const words = transcript.words.filter(
    (word) =>
      word.type === "word" &&
      (!speakerId || (word.speaker_id ?? UNKNOWN_SPEAKER) === speakerId),
  );

  const claims: Claim[] = parsed.claims.map((claim, index) => {
    const at = locate(words, claim.quote);
    return {
      id: `${index}-${normalize(claim.quote).slice(0, 16)}`,
      text: claim.text.trim(),
      quote: claim.quote.trim(),
      type: claim.type,
      checkable: claim.checkable,
      confidence: claim.confidence,
      rationale: claim.rationale.trim(),
      start: at?.start ?? null,
      end: at?.end ?? null,
    };
  });

  // Chronological reads better than the model's importance order, and unplaced claims sink.
  claims.sort((a, b) => (a.start ?? Infinity) - (b.start ?? Infinity));

  return {
    scopedTo: speakerId,
    scorable: true,
    wordCount,
    checkableCount: claims.filter((claim) => claim.checkable).length,
    claims,
  };
}
