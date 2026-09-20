import pg from "pg";
import { env } from "./env";

const { Pool } = pg;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS chats (
  id                 text PRIMARY KEY,
  title              text NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  message_count      integer NOT NULL DEFAULT 0,
  messages           jsonb NOT NULL DEFAULT '[]'::jsonb,
  proposal           jsonb,
  browser_session_id text,
  transcript         jsonb,
  stats              jsonb,
  primary_speaker    text
);
CREATE INDEX IF NOT EXISTS chats_updated_at_idx ON chats (updated_at DESC);

CREATE TABLE IF NOT EXISTS library_runs (
  id              text PRIMARY KEY,
  video_id        text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  video           jsonb NOT NULL,
  stats           jsonb NOT NULL,
  transcript      jsonb NOT NULL,
  primary_speaker text
);
CREATE INDEX IF NOT EXISTS library_runs_created_at_idx ON library_runs (created_at DESC);
CREATE INDEX IF NOT EXISTS library_runs_video_id_idx ON library_runs (video_id);

CREATE TABLE IF NOT EXISTS projects (
  id         text PRIMARY KEY,
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  status     text NOT NULL DEFAULT 'ready',
  video      jsonb NOT NULL,
  stats      jsonb NOT NULL,
  transcript jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS projects_updated_at_idx ON projects (updated_at DESC);

CREATE TABLE IF NOT EXISTS live_sessions (
  id              text PRIMARY KEY,
  title           text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  ended_at        timestamptz,
  status          text NOT NULL DEFAULT 'active',
  voice_id        text,
  prefs           jsonb NOT NULL DEFAULT '{}'::jsonb,
  threads         jsonb NOT NULL DEFAULT '[]'::jsonb,
  thread_count    integer NOT NULL DEFAULT 0,
  detection_count integer NOT NULL DEFAULT 0,
  word_count      integer NOT NULL DEFAULT 0,
  ai_count        integer NOT NULL DEFAULT 0,
  human_count     integer NOT NULL DEFAULT 0,
  mixed_count     integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS live_sessions_updated_at_idx ON live_sessions (updated_at DESC);

CREATE TABLE IF NOT EXISTS claim_sets (
  id              text PRIMARY KEY,
  speaker_id      text,
  scorable        boolean NOT NULL DEFAULT false,
  reason          text,
  word_count      integer NOT NULL DEFAULT 0,
  checkable_count integer NOT NULL DEFAULT 0,
  claims          jsonb NOT NULL DEFAULT '[]'::jsonb,
  verifications   jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS claim_sets_updated_at_idx ON claim_sets (updated_at DESC);
-- Added after the table shipped, so migrate it in place rather than recreating.
ALTER TABLE claim_sets ADD COLUMN IF NOT EXISTS reviews jsonb NOT NULL DEFAULT '{}'::jsonb;
-- Which speech a claim set belongs to, so alerts raised from it can name the speech.
ALTER TABLE claim_sets ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE claim_sets ADD COLUMN IF NOT EXISTS title text;

CREATE TABLE IF NOT EXISTS ai_reports (
  id              text PRIMARY KEY,
  speaker_id      text,
  source          text NOT NULL,
  title           text NOT NULL,
  video_id        text,
  scorable        boolean NOT NULL DEFAULT false,
  ai_probability  double precision,
  flagged_count   integer NOT NULL DEFAULT 0,
  sentence_count  integer NOT NULL DEFAULT 0,
  word_count      integer NOT NULL DEFAULT 0,
  most_ai         jsonb,
  most_human      jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_reports_source_idx ON ai_reports (source);
CREATE INDEX IF NOT EXISTS ai_reports_updated_at_idx ON ai_reports (updated_at DESC);
-- Ranking dimensions added after the table shipped.
ALTER TABLE ai_reports ADD COLUMN IF NOT EXISTS politician text;
ALTER TABLE ai_reports ADD COLUMN IF NOT EXISTS party text;
ALTER TABLE ai_reports ADD COLUMN IF NOT EXISTS topic text;

CREATE TABLE IF NOT EXISTS alerts (
  id         text PRIMARY KEY,
  kind       text NOT NULL,
  severity   text NOT NULL,
  title      text NOT NULL,
  detail     text NOT NULL,
  source     text,
  politician text,
  party      text,
  value      double precision,
  delivered  boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS alerts_created_at_idx ON alerts (created_at DESC);

CREATE TABLE IF NOT EXISTS records (
  id           text PRIMARY KEY,
  source_type  text NOT NULL DEFAULT 'doc',
  source_url   text,
  source_id    text,
  title        text,
  body         text NOT NULL,
  ai_share     double precision,
  verdict      text,
  confidence   text,
  probs        jsonb,
  sentences    jsonb,
  words        integer NOT NULL DEFAULT 0,
  published_at bigint,
  x            real,
  y            real,
  x3           real,
  y3           real,
  z3           real,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS records_created_at_idx ON records (created_at DESC);
`;

// Next.js reloads modules in dev; keep one pool across reloads instead of leaking one per edit.
const globalForDb = globalThis as unknown as { pgPool?: pg.Pool };

export const pool: pg.Pool =
  globalForDb.pgPool ?? new Pool({ connectionString: env.databaseUrl, max: 5 });

if (process.env.NODE_ENV !== "production") globalForDb.pgPool = pool;

let bootstrap: Promise<void> | undefined;

/** Create the tables the first time anything touches the database. */
function ensureSchema(): Promise<void> {
  if (!bootstrap) {
    bootstrap = pool
      .query(SCHEMA)
      .then(() => undefined)
      .catch((error: unknown) => {
        // Let a transient failure (e.g. database still starting) be retried.
        bootstrap = undefined;
        throw error;
      });
  }
  return bootstrap;
}

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<pg.QueryResult<T>> {
  await ensureSchema();
  return pool.query<T>(text, params);
}

/**
 * jsonb columns need a JSON string: node-postgres renders a plain array as a Postgres
 * array literal (`{"a","b"}`), which jsonb rejects, so stringify explicitly.
 */
export function jsonb(value: unknown): string | null {
  return value === null || value === undefined ? null : JSON.stringify(value);
}
