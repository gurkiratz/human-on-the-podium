import { createHash } from "node:crypto";
import { jsonb, query } from "./db";
import type { AiReport } from "./gptzero";
import { EMPTY_META, type SpeechMeta } from "./speech-meta";

/**
 * AI-o-meter results are scored on demand and, without this, forgotten — so there is nothing
 * to rank. One representative row per speech (the primary-speaker scope) feeds the leaderboard.
 */

export function reportId(transcriptText: string, speakerId: string | null): string {
  return createHash("sha256")
    .update(`ai:${speakerId ?? "all"}:${transcriptText}`)
    .digest("hex")
    .slice(0, 32);
}

interface Highlight {
  text: string;
  start: number;
  prob: number | null;
}

function pick(report: AiReport, direction: "max" | "min"): Highlight | null {
  const scored = report.sentences.filter((sentence) => sentence.generatedProb !== null);
  if (scored.length === 0) return null;
  const chosen = scored.reduce((a, b) =>
    direction === "max"
      ? (b.generatedProb ?? 0) > (a.generatedProb ?? 0)
        ? b
        : a
      : (b.generatedProb ?? 0) < (a.generatedProb ?? 0)
        ? b
        : a,
  );
  return { text: chosen.text.slice(0, 200), start: chosen.start, prob: chosen.generatedProb };
}

export async function saveAiReport(input: {
  transcriptText: string;
  speakerId: string | null;
  source: string;
  title: string;
  videoId: string | null;
  meta?: SpeechMeta;
  report: AiReport;
}): Promise<void> {
  const id = reportId(input.transcriptText, input.speakerId);
  const mostAi = pick(input.report, "max");
  const mostHuman = pick(input.report, "min");
  const meta = input.meta ?? EMPTY_META;

  await query(
    `INSERT INTO ai_reports (
       id, speaker_id, source, title, video_id, politician, party, topic,
       scorable, ai_probability, flagged_count, sentence_count, word_count, most_ai, most_human
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
     ON CONFLICT (id) DO UPDATE SET
       source         = EXCLUDED.source,
       title          = EXCLUDED.title,
       video_id       = EXCLUDED.video_id,
       politician     = EXCLUDED.politician,
       party          = EXCLUDED.party,
       topic          = EXCLUDED.topic,
       scorable       = EXCLUDED.scorable,
       ai_probability = EXCLUDED.ai_probability,
       flagged_count  = EXCLUDED.flagged_count,
       sentence_count = EXCLUDED.sentence_count,
       word_count     = EXCLUDED.word_count,
       most_ai        = EXCLUDED.most_ai,
       most_human     = EXCLUDED.most_human,
       updated_at     = now()`,
    [
      id,
      input.speakerId,
      input.source,
      input.title,
      input.videoId,
      meta.politician,
      meta.party,
      meta.topic,
      input.report.scorable,
      input.report.document?.completelyGeneratedProb ?? null,
      input.report.flaggedCount,
      input.report.sentences.length,
      input.report.wordCount,
      jsonb(mostAi),
      jsonb(mostHuman),
    ],
  );
}

/**
 * Fill in labels for a speech that was recorded before the ranking dimensions existed. Guarded
 * so it never overwrites labels that are already there.
 */
export async function saveSpeechMeta(id: string, meta: SpeechMeta): Promise<void> {
  await query(
    `UPDATE ai_reports
        SET politician = $2, party = $3, topic = $4
      WHERE id = $1
        AND politician IS NULL AND party IS NULL AND topic IS NULL`,
    [id, meta.politician, meta.party, meta.topic],
  );
}

/** Override the labels for a whole speech (every row sharing its key), from a human correction. */
export async function overrideSpeechMeta(key: string, meta: SpeechMeta): Promise<number> {
  const { rowCount } = await query(
    `UPDATE ai_reports
        SET politician = $2, party = $3, topic = $4
      WHERE coalesce(video_id, title) = $1`,
    [key, meta.politician, meta.party, meta.topic],
  );
  return rowCount ?? 0;
}

/** Reuse the labels already derived for this speech, so we only pay for them once. */
export async function getSpeechMeta(
  videoId: string | null,
  title: string,
): Promise<SpeechMeta | null> {
  const key = videoId?.trim() || title.trim();
  if (!key) return null;

  const { rows } = await query<{
    politician: string | null;
    party: string | null;
    topic: string | null;
  }>(
    `SELECT politician, party, topic
       FROM ai_reports
      WHERE coalesce(video_id, title) = $1
        AND (politician IS NOT NULL OR party IS NOT NULL OR topic IS NOT NULL)
      ORDER BY updated_at DESC
      LIMIT 1`,
    [key],
  );

  const row = rows[0];
  if (!row) return null;
  return { politician: row.politician, party: row.party, topic: row.topic };
}

export const BOARD_DIMENSIONS = ["source", "politician", "party", "topic"] as const;
export type BoardDimension = (typeof BOARD_DIMENSIONS)[number];

export function isBoardDimension(value: unknown): value is BoardDimension {
  return typeof value === "string" && (BOARD_DIMENSIONS as readonly string[]).includes(value);
}

const DIMENSION_COLUMN: Record<BoardDimension, string> = {
  source: "source",
  politician: "politician",
  party: "party",
  topic: "topic",
};

export interface LeaderboardGroup {
  label: string;
  speeches: number;
  avgAi: number;
  flagged: number;
  words: number;
  lastUpdated: string;
}

export interface TimelinePoint {
  /** Calendar day, YYYY-MM-DD. */
  date: string;
  avgAi: number;
  speeches: number;
}

export interface LeaderboardSpeech {
  id: string;
  source: string;
  title: string;
  videoId: string | null;
  politician: string | null;
  party: string | null;
  topic: string | null;
  aiProbability: number | null;
  flaggedCount: number;
  wordCount: number;
  updatedAt: string;
}

export interface Leaderboard {
  dimension: BoardDimension;
  groups: LeaderboardGroup[];
  timeline: TimelinePoint[];
  recent: LeaderboardSpeech[];
}

type GroupRow = {
  label: string;
  speeches: number;
  avg_ai: number;
  flagged: number;
  words: number;
  last_updated: Date;
};

type TimelineRow = { day: string; avg_ai: number; speeches: number };

type SpeechRow = {
  id: string;
  source: string;
  title: string;
  video_id: string | null;
  politician: string | null;
  party: string | null;
  topic: string | null;
  ai_probability: number | null;
  flagged_count: number;
  word_count: number;
  updated_at: Date;
};

/**
 * Dedupe to the newest row per speech, so re-scoring a clip does not double-count it. Shared by
 * every query below — keep it in one place so the board and the timeline can never disagree.
 */
const LATEST = `WITH latest AS (
  SELECT DISTINCT ON (coalesce(video_id, title)) *
    FROM ai_reports
   WHERE scorable = true AND ai_probability IS NOT NULL
   ORDER BY coalesce(video_id, title), updated_at DESC
)`;

export async function listLeaderboard(dimension: BoardDimension = "source"): Promise<Leaderboard> {
  // Column name is looked up in a whitelist, never interpolated from user input.
  const column = DIMENSION_COLUMN[dimension];

  const { rows: groups } = await query<GroupRow>(
    `${LATEST}
     SELECT coalesce(${column}, 'Unknown') AS label,
            count(*)::int              AS speeches,
            avg(ai_probability)::float8 AS avg_ai,
            sum(flagged_count)::int    AS flagged,
            sum(word_count)::int       AS words,
            max(updated_at)            AS last_updated
       FROM latest
      GROUP BY 1
      ORDER BY avg_ai DESC`,
  );

  const { rows: timeline } = await query<TimelineRow>(
    `${LATEST}
     SELECT to_char(date_trunc('day', updated_at), 'YYYY-MM-DD') AS day,
            avg(ai_probability)::float8 AS avg_ai,
            count(*)::int               AS speeches
       FROM latest
      GROUP BY 1
      ORDER BY 1`,
  );

  const { rows: recent } = await query<SpeechRow>(
    `${LATEST}
     SELECT id, source, title, video_id, politician, party, topic,
            ai_probability, flagged_count, word_count, updated_at
       FROM latest
      ORDER BY ai_probability DESC, updated_at DESC
      LIMIT 25`,
  );

  return {
    dimension,
    groups: groups.map((row) => ({
      label: row.label,
      speeches: row.speeches,
      avgAi: row.avg_ai,
      flagged: row.flagged,
      words: row.words,
      lastUpdated: row.last_updated.toISOString(),
    })),
    timeline: timeline.map((row) => ({
      date: row.day,
      avgAi: row.avg_ai,
      speeches: row.speeches,
    })),
    recent: recent.map((row) => ({
      id: row.id,
      source: row.source,
      title: row.title,
      videoId: row.video_id,
      politician: row.politician,
      party: row.party,
      topic: row.topic,
      aiProbability: row.ai_probability,
      flaggedCount: row.flagged_count,
      wordCount: row.word_count,
      updatedAt: row.updated_at.toISOString(),
    })),
  };
}
