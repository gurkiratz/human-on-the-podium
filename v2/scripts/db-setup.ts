import "dotenv/config";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { jsonb, pool, query } from "../lib/db";
import type { ChatMessage, Transcript, TranscriptStats, VideoProposal, VideoSummary } from "../lib/types";

/**
 * Creates the Postgres tables (the schema also auto-applies on first query) and loads any
 * to migrate JSON under `out/` into them. Safe to re-run: existing rows are left untouched.
 */

type LibraryRun = {
  id: string;
  createdAt: string;
  video: VideoSummary;
  stats: TranscriptStats;
  transcript: Transcript;
  primarySpeaker?: string | null;
};

type ChatSession = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  messages: ChatMessage[];
  proposal: VideoProposal | null;
  browserSessionId: string | null;
  transcript: Transcript | null;
  stats: TranscriptStats | null;
  primarySpeaker?: string | null;
};

type Project = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  status: string;
  video: VideoSummary;
  stats: TranscriptStats;
  transcript: Transcript;
};

async function readJsonDir<T>(dir: string): Promise<T[]> {
  let files: string[];
  try {
    files = await readdir(dir);
  } catch {
    return [];
  }
  const out: T[] = [];
  for (const file of files.filter((name) => name.endsWith(".json"))) {
    try {
      out.push(JSON.parse(await readFile(path.join(dir, file), "utf8")) as T);
    } catch {
      console.warn(`  skipped unreadable ${file}`);
    }
  }
  return out;
}

async function importLibrary(): Promise<number> {
  const runs = await readJsonDir<LibraryRun>(path.resolve(process.cwd(), "out"));
  // The app keeps one run per video; keep the newest and drop older duplicates of it.
  const newest = new Map<string, LibraryRun>();
  for (const run of runs) {
    const key = run.video?.videoId || run.id;
    const current = newest.get(key);
    if (!current || run.createdAt > current.createdAt) newest.set(key, run);
  }

  let inserted = 0;
  for (const run of newest.values()) {
    const { rowCount } = await query(
      `INSERT INTO library_runs (id, video_id, created_at, video, stats, transcript, primary_speaker)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO NOTHING`,
      [
        run.id,
        run.video?.videoId || null,
        run.createdAt,
        jsonb(run.video),
        jsonb(run.stats),
        jsonb(run.transcript),
        run.primarySpeaker ?? null,
      ],
    );
    inserted += rowCount ?? 0;
  }
  return inserted;
}

async function importChats(): Promise<number> {
  const chats = await readJsonDir<ChatSession>(path.resolve(process.cwd(), "out", "chats"));
  let inserted = 0;
  for (const chat of chats) {
    const { rowCount } = await query(
      `INSERT INTO chats (
         id, title, created_at, updated_at, message_count, messages, proposal,
         browser_session_id, transcript, stats, primary_speaker
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (id) DO NOTHING`,
      [
        chat.id,
        chat.title || "New conversation",
        chat.createdAt,
        chat.updatedAt,
        chat.messageCount ?? chat.messages?.length ?? 0,
        jsonb(chat.messages ?? []),
        jsonb(chat.proposal),
        chat.browserSessionId ?? null,
        jsonb(chat.transcript),
        jsonb(chat.stats),
        chat.primarySpeaker ?? null,
      ],
    );
    inserted += rowCount ?? 0;
  }
  return inserted;
}

async function importProjects(): Promise<number> {
  const projects = await readJsonDir<Project>(path.resolve(process.cwd(), "out", "projects"));
  let inserted = 0;
  for (const project of projects) {
    const { rowCount } = await query(
      `INSERT INTO projects (id, name, created_at, updated_at, status, video, stats, transcript)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO NOTHING`,
      [
        project.id,
        project.name || project.video?.title || "Untitled project",
        project.createdAt,
        project.updatedAt,
        project.status || "ready",
        jsonb(project.video),
        jsonb(project.stats),
        jsonb(project.transcript),
      ],
    );
    inserted += rowCount ?? 0;
  }
  return inserted;
}

async function main(): Promise<void> {
  // Any query bootstraps the schema (CREATE TABLE IF NOT EXISTS …).
  const { rows: before } = await query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name IN ('chats', 'library_runs', 'projects', 'live_sessions', 'claim_sets', 'ai_reports', 'alerts')
      ORDER BY table_name`,
  );
  console.log(`schema ready: ${before.map((row) => row.table_name).join(", ")}`);

  const [library, chats, projects] = [
    await importLibrary(),
    await importChats(),
    await importProjects(),
  ];

  const { rows: counts } = await query<{ table_name: string; count: string }>(
    `SELECT 'chats' AS table_name, count(*)::text AS count FROM chats
     UNION ALL SELECT 'library_runs', count(*)::text FROM library_runs
     UNION ALL SELECT 'projects', count(*)::text FROM projects
     UNION ALL SELECT 'live_sessions', count(*)::text FROM live_sessions
     UNION ALL SELECT 'claim_sets', count(*)::text FROM claim_sets
     UNION ALL SELECT 'ai_reports', count(*)::text FROM ai_reports
     UNION ALL SELECT 'alerts', count(*)::text FROM alerts
     ORDER BY table_name`,
  );

  console.log(`imported new rows — library: ${library}, chats: ${chats}, projects: ${projects}`);
  for (const row of counts) console.log(`  ${row.table_name}: ${row.count} rows`);
}

main()
  .catch((error: unknown) => {
    console.error(`\nError: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
