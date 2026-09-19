import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import type { ClassProbs, ScoredSentence, YoutubeScore } from "./types";

export type { YoutubeScore };

const DB_PATH = path.join(process.cwd(), "data", "sloppy.db");

let db: DatabaseSync | null = null;

function getDb(): DatabaseSync {
  if (db) return db;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  db = new DatabaseSync(DB_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS youtube_scores (
      id TEXT PRIMARY KEY,
      youtube_url TEXT NOT NULL,
      video_id TEXT NOT NULL,
      title TEXT,
      start_sec INTEGER NOT NULL,
      duration_sec INTEGER NOT NULL,
      transcript TEXT NOT NULL,
      verdict TEXT NOT NULL,
      probability REAL NOT NULL,
      confidence TEXT NOT NULL,
      sentences_json TEXT NOT NULL,
      words INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      embedding BLOB,
      probs_json TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_youtube_scores_created
      ON youtube_scores(created_at DESC);
  `);
  // ponytail: add column on older DBs that predate probs_json
  try {
    db.exec(`ALTER TABLE youtube_scores ADD COLUMN probs_json TEXT`);
  } catch {
    /* already exists */
  }
  return db;
}

function probsFromLegacy(
  verdict: YoutubeScore["verdict"],
  probability: number,
): ClassProbs {
  const p = Math.min(1, Math.max(0, probability));
  const rest = 1 - p;
  // When we only stored the winning class, put the remainder on the
  // opposite pole (matches GPTZero's usual ai↔human split; mixed stays 0).
  if (verdict === "ai") return { ai: p, human: rest, mixed: 0 };
  if (verdict === "mixed") return { ai: rest / 2, human: rest / 2, mixed: p };
  return { ai: rest, human: p, mixed: 0 };
}

export function insertYoutubeScore(
  row: Omit<YoutubeScore, "createdAt"> & { createdAt?: number },
): YoutubeScore {
  const createdAt = row.createdAt ?? Date.now();
  getDb()
    .prepare(
      `INSERT INTO youtube_scores (
        id, youtube_url, video_id, title, start_sec, duration_sec,
        transcript, verdict, probability, confidence, sentences_json, words,
        created_at, probs_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      row.id,
      row.youtubeUrl,
      row.videoId,
      row.title,
      row.startSec,
      row.durationSec,
      row.transcript,
      row.verdict,
      row.probability,
      row.confidence,
      JSON.stringify(row.sentences),
      row.words,
      createdAt,
      JSON.stringify(row.probs),
    );
  return { ...row, createdAt };
}

export function listYoutubeScores(limit = 50): YoutubeScore[] {
  const rows = getDb()
    .prepare(
      `SELECT id, youtube_url, video_id, title, start_sec, duration_sec,
              transcript, verdict, probability, confidence, sentences_json,
              words, created_at, probs_json
       FROM youtube_scores
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .all(limit) as Array<{
    id: string;
    youtube_url: string;
    video_id: string;
    title: string | null;
    start_sec: number;
    duration_sec: number;
    transcript: string;
    verdict: YoutubeScore["verdict"];
    probability: number;
    confidence: YoutubeScore["confidence"];
    sentences_json: string;
    words: number;
    created_at: number;
    probs_json: string | null;
  }>;

  return rows.map((r) => {
    let probs: ClassProbs | null = null;
    if (r.probs_json) {
      try {
        probs = JSON.parse(r.probs_json) as ClassProbs;
      } catch {
        probs = null;
      }
    }
    return {
      id: r.id,
      youtubeUrl: r.youtube_url,
      videoId: r.video_id,
      title: r.title,
      startSec: r.start_sec,
      durationSec: r.duration_sec,
      transcript: r.transcript,
      verdict: r.verdict,
      probability: r.probability,
      probs: probs ?? probsFromLegacy(r.verdict, r.probability),
      confidence: r.confidence,
      sentences: JSON.parse(r.sentences_json) as ScoredSentence[],
      words: r.words,
      createdAt: r.created_at,
    };
  });
}
