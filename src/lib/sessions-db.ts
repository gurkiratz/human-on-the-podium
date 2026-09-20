import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { sessionAiShare, verdictTally } from "./ai-share";
import type { Detection } from "./types";

/**
 * Live capture sessions get their own database file.
 *
 * `sloppy.db` is the investigation archive: analyzed speeches and documents,
 * embedded and mapped, meant to be kept and cited. What comes out of the live
 * detector is working material — a mic left running, half-finished takes, a
 * test of the room. Mixing the two would put scratch recordings into the
 * corpus the map and the archive table are built from, so they stay apart and
 * nothing here is ever embedded.
 */
const DB_PATH = path.join(process.cwd(), "data", "sessions.db");

/** Ids come from the browser; keep them to something safe to log and route. */
const ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

export type SessionSummary = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  /** Chunks analyzed so far. */
  chunks: number;
  /** Words spoken, analyzed and pending alike. */
  words: number;
  /** Words actually sent to GPTZero, for the billing line. */
  wordsSent: number;
  /** Sentence-weighted AI share across the whole session; null if nothing analyzed. */
  aiShare: number | null;
  verdicts: { ai: number; human: number; mixed: number };
};

export type Session = SessionSummary & {
  detections: Detection[];
  /** Words banked but under the floor when recording stopped. Resumes with them. */
  pendingText: string;
};

let db: DatabaseSync | null = null;

function getDb(): DatabaseSync {
  if (db) return db;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  db = new DatabaseSync(DB_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS live_sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      detections_json TEXT NOT NULL,
      pending_text TEXT NOT NULL DEFAULT '',
      chunks INTEGER NOT NULL,
      words INTEGER NOT NULL,
      words_sent INTEGER NOT NULL,
      ai_share REAL,
      ai_count INTEGER NOT NULL,
      human_count INTEGER NOT NULL,
      mixed_count INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_live_sessions_updated
      ON live_sessions(updated_at DESC);
  `);
  return db;
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * The rail shows a line of the speech itself rather than a timestamp, because
 * a list of times tells you nothing about which take you are looking for.
 */
export function titleFrom(detections: Detection[], pendingText: string): string {
  const opening = detections[0]?.text ?? pendingText;
  const words = opening.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "Empty session";
  const head = words.slice(0, 8).join(" ");
  return words.length > 8 ? `${head}…` : head;
}

type Row = {
  id: string;
  title: string;
  created_at: number;
  updated_at: number;
  detections_json: string;
  pending_text: string;
  chunks: number;
  words: number;
  words_sent: number;
  ai_share: number | null;
  ai_count: number;
  human_count: number;
  mixed_count: number;
};

const SUMMARY_COLUMNS = `id, title, created_at, updated_at, chunks, words,
  words_sent, ai_share, ai_count, human_count, mixed_count`;

function toSummary(row: Omit<Row, "detections_json" | "pending_text">): SessionSummary {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    chunks: row.chunks,
    words: row.words,
    wordsSent: row.words_sent,
    aiShare: row.ai_share,
    verdicts: { ai: row.ai_count, human: row.human_count, mixed: row.mixed_count },
  };
}

export function listSessions(limit = 60): SessionSummary[] {
  const rows = getDb()
    .prepare(
      `SELECT ${SUMMARY_COLUMNS}
         FROM live_sessions
        ORDER BY updated_at DESC
        LIMIT ?`,
    )
    .all(limit) as Array<Omit<Row, "detections_json" | "pending_text">>;
  return rows.map(toSummary);
}

export function getSession(id: string): Session | null {
  if (!ID_PATTERN.test(id)) return null;
  const row = getDb()
    .prepare(`SELECT * FROM live_sessions WHERE id = ?`)
    .get(id) as Row | undefined;
  if (!row) return null;

  let detections: Detection[] = [];
  try {
    detections = JSON.parse(row.detections_json) as Detection[];
  } catch {
    // A corrupt blob should cost the transcript, not the whole rail.
    detections = [];
  }
  return { ...toSummary(row), detections, pendingText: row.pending_text };
}

/**
 * Upsert. Counters are recomputed here rather than trusted from the client, so
 * the rail can sort and label without parsing every blob.
 */
export function saveSession(input: {
  id: string;
  detections: Detection[];
  pendingText: string;
  wordsSent: number;
  title?: string;
}): SessionSummary {
  if (!ID_PATTERN.test(input.id)) throw new Error("Invalid session id.");
  if (input.detections.length === 0 && !input.pendingText.trim()) {
    throw new Error("Nothing to save yet.");
  }

  const now = Date.now();
  const title = input.title?.trim() || titleFrom(input.detections, input.pendingText);
  const tally = verdictTally(input.detections);
  const words =
    input.detections.reduce((sum, d) => sum + d.words, 0) + countWords(input.pendingText);

  getDb()
    .prepare(
      `INSERT INTO live_sessions (
         id, title, created_at, updated_at, detections_json, pending_text,
         chunks, words, words_sent, ai_share, ai_count, human_count, mixed_count
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         title           = excluded.title,
         updated_at      = excluded.updated_at,
         detections_json = excluded.detections_json,
         pending_text    = excluded.pending_text,
         chunks          = excluded.chunks,
         words           = excluded.words,
         words_sent      = excluded.words_sent,
         ai_share        = excluded.ai_share,
         ai_count        = excluded.ai_count,
         human_count     = excluded.human_count,
         mixed_count     = excluded.mixed_count`,
    )
    .run(
      input.id,
      title,
      now,
      now,
      JSON.stringify(input.detections),
      input.pendingText,
      input.detections.length,
      words,
      input.wordsSent,
      sessionAiShare(input.detections),
      tally.ai,
      tally.human,
      tally.mixed,
    );

  const row = getDb()
    .prepare(`SELECT ${SUMMARY_COLUMNS} FROM live_sessions WHERE id = ?`)
    .get(input.id) as Omit<Row, "detections_json" | "pending_text">;
  return toSummary(row);
}

export function deleteSession(id: string): boolean {
  if (!ID_PATTERN.test(id)) return false;
  const res = getDb()
    .prepare(`DELETE FROM live_sessions WHERE id = ?`)
    .run(id) as { changes: number | bigint };
  return Number(res.changes) > 0;
}
