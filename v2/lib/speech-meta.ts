import OpenAI from "openai";
import { z } from "zod/v4";
import { env } from "./env";

/**
 * Label a speech so the leaderboard can rank by politician, party and topic rather than by
 * whatever channel happened to publish it. Derived once per speech and reused after that.
 */

export interface SpeechMeta {
  politician: string | null;
  party: string | null;
  topic: string | null;
}

export const EMPTY_META: SpeechMeta = { politician: null, party: null, topic: null };

const MetaSchema = z.object({
  politician: z.unknown().optional(),
  party: z.unknown().optional(),
  topic: z.unknown().optional(),
});

const SYSTEM_PROMPT = `You label a political speech for a dashboard. Return JSON only, no prose.

Given the video title, the channel and a transcript excerpt, return:
{"politician": "", "party": "", "topic": ""}

- "politician": the full name of the person the speech is by or about, e.g. "Donald Trump". Use null when no single person is clear.
- "party": "Republican", "Democrat", or null when it is not clear (do not guess).
- "topic": 1-3 words for the main subject, lower case — one of: economy, immigration, crime, healthcare, foreign policy, election, education, energy, defense, other.

Never invent a name that is not in the input. When unsure, use null.`;

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^(null|unknown|none|n\/a|undefined)$/i.test(trimmed)) return null;
  return trimmed;
}

function normalizeParty(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (lower.includes("republican") || lower.includes("gop")) return "Republican";
  if (lower.includes("democrat")) return "Democrat";
  return "Other";
}

/** Clean a set of labels, whether they came from the model or a person editing them. */
export function normalizeMeta(input: {
  politician?: unknown;
  party?: unknown;
  topic?: unknown;
}): SpeechMeta {
  return {
    politician: text(input.politician),
    party: normalizeParty(input.party),
    topic: text(input.topic)?.toLowerCase() ?? null,
  };
}

export async function deriveSpeechMeta(input: {
  title: string;
  channel: string;
  excerpt: string;
}): Promise<SpeechMeta> {
  try {
    const client = new OpenAI({ apiKey: env.openaiApiKey });
    const completion = await client.chat.completions.create({
      model: env.openaiModel,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Title: ${input.title}\nChannel: ${input.channel}\n\nExcerpt:\n${input.excerpt.slice(0, 4000)}`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = MetaSchema.parse(JSON.parse(raw));
    return normalizeMeta(parsed);
  } catch {
    return EMPTY_META;
  }
}
