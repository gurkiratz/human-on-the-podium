/**
 * Import the analyzed corpus from the old SQLite file (sloppy.db) into Postgres `records`, so
 * the map can plot it. Re-runnable: rows upsert by id.
 *
 *   npm run db:import-records                 # ~/Downloads/sloppy.db
 *   npm run db:import-records -- /path/to.db
 *
 * Reads through the `sqlite3` CLI so no extra driver is needed.
 */
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import type { RecordInput, RecordVerdict } from "../lib/records";

process.loadEnvFile();

// Imported after the env file loads: lib/db reads DATABASE_URL at module init.
const { upsertRecords } = await import("../lib/records");

const dbPath = process.argv[2] ?? path.join(os.homedir(), "Downloads", "sloppy.db");
const query = `SELECT id, source_type, youtube_url, video_id, title, transcript,
  verdict, probability, confidence, probs_json, sentences_json, words,
  published_at, embed_x, embed_y, embed_x3, embed_y3, embed_z3, created_at
  FROM youtube_scores`;

type LegacyRow = {
  id: string;
  source_type: string | null;
  youtube_url: string | null;
  video_id: string | null;
  title: string | null;
  transcript: string;
  verdict: string | null;
  probability: number | null;
  confidence: string | null;
  probs_json: string | null;
  sentences_json: string | null;
  words: number | null;
  published_at: number | null;
  embed_x: number | null;
  embed_y: number | null;
  embed_x3: number | null;
  embed_y3: number | null;
  embed_z3: number | null;
  created_at: number | null;
};

function parseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

const raw = execFileSync("sqlite3", ["-json", dbPath, query], {
  encoding: "utf8",
  maxBuffer: 256 * 1024 * 1024,
});
const legacy = (raw.trim() ? JSON.parse(raw) : []) as LegacyRow[];

const rows: RecordInput[] = legacy.map((r) => {
  const probs = parseJson<{ ai: number; human: number; mixed: number }>(r.probs_json);
  const sentences = parseJson<{ sentence: string; ai: number }[]>(r.sentences_json);
  const verdict: RecordVerdict =
    r.verdict === "ai" || r.verdict === "mixed" ? r.verdict : "human";

  return {
    id: r.id,
    sourceType: r.source_type ?? "doc",
    sourceUrl: r.youtube_url,
    sourceId: r.video_id,
    title: r.title ?? r.video_id ?? "Untitled",
    body: r.transcript,
    aiShare: typeof probs?.ai === "number" ? probs.ai : (r.probability ?? null),
    verdict,
    confidence: r.confidence ?? "medium",
    probs,
    sentences,
    words: r.words ?? 0,
    publishedAt: r.published_at ?? null,
    x: r.embed_x,
    y: r.embed_y,
    x3: r.embed_x3,
    y3: r.embed_y3,
    z3: r.embed_z3,
    createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
  };
});

const imported = await upsertRecords(rows);
const docs = rows.filter((r) => r.sourceType === "doc").length;
console.log(`imported ${imported} records (${docs} docs, ${imported - docs} videos) from ${dbPath}`);
process.exit(0);
