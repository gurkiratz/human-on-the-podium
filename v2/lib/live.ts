import { jsonb, query } from "./db";
import { DEFAULT_PREFS, type LivePrefs } from "./live-prefs";
import { wordsIn, type LiveThread } from "./live-thread";

export { wordsIn };
export type { LiveThread };

export interface LiveSessionSummary {
  id: string;
  title: string;
  updatedAt: string;
  endedAt: string | null;
  status: "active" | "ended";
  threadCount: number;
  detectionCount: number;
  words: number;
  verdicts: { ai: number; human: number; mixed: number };
}

export interface LiveSession extends LiveSessionSummary {
  createdAt: string;
  voiceId: string | null;
  prefs: LivePrefs;
  threads: LiveThread[];
}

const ID_PATTERN = /^[A-Za-z0-9._-]+$/;

type SessionRow = {
  id: string;
  title: string;
  created_at: Date;
  updated_at: Date;
  ended_at: Date | null;
  status: "active" | "ended";
  voice_id: string | null;
  prefs: LivePrefs;
  threads: LiveThread[];
  thread_count: number;
  detection_count: number;
  word_count: number;
  ai_count: number;
  human_count: number;
  mixed_count: number;
};

/** Recompute the denormalized counters the history rail reads without parsing the blob. */
function aggregate(threads: LiveThread[]) {
  let detectionCount = 0;
  let words = 0;
  let ai = 0;
  let human = 0;
  let mixed = 0;

  for (const thread of threads) {
    words += wordsIn(thread);
    detectionCount += thread.detections.length;
    for (const detection of thread.detections) {
      if (detection.verdict === "ai") ai += 1;
      else if (detection.verdict === "mixed") mixed += 1;
      else human += 1;
    }
  }

  return {
    threadCount: threads.length,
    detectionCount,
    words,
    ai,
    human,
    mixed,
  };
}

function toSummary(row: Pick<SessionRow, "id" | "title" | "updated_at" | "ended_at" | "status" | "thread_count" | "detection_count" | "word_count" | "ai_count" | "human_count" | "mixed_count">): LiveSessionSummary {
  return {
    id: row.id,
    title: row.title,
    updatedAt: row.updated_at.toISOString(),
    endedAt: row.ended_at ? row.ended_at.toISOString() : null,
    status: row.status,
    threadCount: row.thread_count,
    detectionCount: row.detection_count,
    words: row.word_count,
    verdicts: { ai: row.ai_count, human: row.human_count, mixed: row.mixed_count },
  };
}

export async function listLiveSessions(): Promise<LiveSessionSummary[]> {
  const { rows } = await query<SessionRow>(
    `SELECT id, title, updated_at, ended_at, status,
            thread_count, detection_count, word_count,
            ai_count, human_count, mixed_count
       FROM live_sessions
      ORDER BY updated_at DESC`,
  );
  return rows.map(toSummary);
}

export async function getLiveSession(id: string): Promise<LiveSession | null> {
  if (!ID_PATTERN.test(id)) return null;

  const { rows } = await query<SessionRow>(`SELECT * FROM live_sessions WHERE id = $1`, [id]);
  const row = rows[0];
  if (!row) return null;

  return {
    ...toSummary(row),
    createdAt: row.created_at.toISOString(),
    voiceId: row.voice_id,
    prefs: row.prefs ?? DEFAULT_PREFS,
    threads: row.threads ?? [],
  };
}

export async function saveLiveSession(input: {
  id: string;
  title: string;
  status: "active" | "ended";
  voiceId: string | null;
  prefs: LivePrefs;
  threads: LiveThread[];
  endedAt: string | null;
}): Promise<LiveSessionSummary> {
  if (!ID_PATTERN.test(input.id)) throw new Error("Invalid session id.");
  if (input.threads.length === 0) throw new Error("A live session needs at least one thread.");

  const totals = aggregate(input.threads);

  const { rows } = await query<SessionRow>(
    `INSERT INTO live_sessions (
       id, title, status, voice_id, prefs, threads, ended_at,
       thread_count, detection_count, word_count, ai_count, human_count, mixed_count
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     ON CONFLICT (id) DO UPDATE SET
       title           = EXCLUDED.title,
       updated_at      = now(),
       status          = EXCLUDED.status,
       voice_id        = EXCLUDED.voice_id,
       prefs           = EXCLUDED.prefs,
       threads         = EXCLUDED.threads,
       ended_at        = EXCLUDED.ended_at,
       thread_count    = EXCLUDED.thread_count,
       detection_count = EXCLUDED.detection_count,
       word_count      = EXCLUDED.word_count,
       ai_count        = EXCLUDED.ai_count,
       human_count     = EXCLUDED.human_count,
       mixed_count     = EXCLUDED.mixed_count
     RETURNING id, title, updated_at, ended_at, status,
               thread_count, detection_count, word_count,
               ai_count, human_count, mixed_count`,
    [
      input.id,
      input.title,
      input.status,
      input.voiceId,
      jsonb(input.prefs),
      jsonb(input.threads),
      input.endedAt,
      totals.threadCount,
      totals.detectionCount,
      totals.words,
      totals.ai,
      totals.human,
      totals.mixed,
    ],
  );

  return toSummary(rows[0]);
}

export async function deleteLiveSession(id: string): Promise<boolean> {
  if (!ID_PATTERN.test(id)) return false;

  const { rows } = await query<{ id: string }>(
    `DELETE FROM live_sessions WHERE id = $1 RETURNING id`,
    [id],
  );
  return rows.length > 0;
}
