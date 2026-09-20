import { randomUUID } from "node:crypto";
import { jsonb, query } from "./db";
import type { Transcript, TranscriptStats, VideoSummary } from "./types";

export interface ProjectItem {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  status: "ready";
  video: VideoSummary;
  stats: TranscriptStats;
}

export interface ProjectEntry extends ProjectItem {
  transcript: Transcript;
}

/** A project plus the newest AI reading filed against its video, if it has been scored. */
export interface ProjectRecord {
  id: string;
  name: string;
  createdAt: string;
  video: VideoSummary;
  stats: TranscriptStats;
  transcript: string;
  aiProbability: number | null;
  flaggedCount: number;
  sentenceCount: number;
}

const ID_PATTERN = /^[A-Za-z0-9._-]+$/;

type ProjectRow = {
  id: string;
  name: string;
  created_at: Date;
  updated_at: Date;
  status: "ready";
  video: VideoSummary;
  stats: TranscriptStats;
  transcript: Transcript;
};

export async function createProject(input: {
  name?: string;
  video: VideoSummary;
  stats: TranscriptStats;
  transcript: Transcript;
}): Promise<ProjectEntry> {
  // The videoId is a validated id (or empty); the random suffix keeps two projects created
  // from the same video in the same millisecond from colliding on the primary key.
  const id = `${input.video.videoId || "clip"}-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const name = input.name?.trim() || input.video.title || "Untitled project";

  const { rows } = await query<ProjectRow>(
    `INSERT INTO projects (id, name, status, video, stats, transcript)
     VALUES ($1, $2, 'ready', $3, $4, $5)
     RETURNING *`,
    [id, name, jsonb(input.video), jsonb(input.stats), jsonb(input.transcript)],
  );

  return toEntry(rows[0]);
}

function toEntry(row: ProjectRow): ProjectEntry {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    status: row.status,
    video: row.video,
    stats: row.stats,
    transcript: row.transcript,
  };
}

function toItem(row: Pick<ProjectRow, "id" | "name" | "created_at" | "updated_at" | "status" | "video" | "stats">): ProjectItem {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    status: row.status,
    video: row.video,
    stats: row.stats,
  };
}

export async function listProjects(): Promise<ProjectItem[]> {
  const { rows } = await query<
    Pick<ProjectRow, "id" | "name" | "created_at" | "updated_at" | "status" | "video" | "stats">
  >(
    `SELECT id, name, created_at, updated_at, status, video, stats
       FROM projects
      ORDER BY updated_at DESC`,
  );

  return rows.map(toItem);
}

type ProjectRecordRow = {
  id: string;
  name: string;
  created_at: Date;
  video: VideoSummary;
  stats: TranscriptStats;
  transcript_text: string | null;
  ai_probability: number | null;
  flagged_count: number | null;
  sentence_count: number | null;
};

/**
 * Every project with its newest AI reading, for the Investigate archive. The reading is joined
 * by video (falling back to the title), so an unscored project still lists with a blank score.
 */
export async function listProjectRecords(): Promise<ProjectRecord[]> {
  const { rows } = await query<ProjectRecordRow>(
    `SELECT p.id, p.name, p.created_at, p.video, p.stats,
            p.transcript->>'text' AS transcript_text,
            r.ai_probability, r.flagged_count, r.sentence_count
       FROM projects p
       LEFT JOIN LATERAL (
         SELECT ai_probability, flagged_count, sentence_count
           FROM ai_reports
          WHERE coalesce(video_id, title) = coalesce(p.video->>'videoId', p.name)
          ORDER BY updated_at DESC
          LIMIT 1
       ) r ON true
      ORDER BY p.created_at DESC`,
  );

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    createdAt: row.created_at.toISOString(),
    video: row.video,
    stats: row.stats,
    transcript: row.transcript_text ?? "",
    aiProbability: row.ai_probability,
    flaggedCount: row.flagged_count ?? 0,
    sentenceCount: row.sentence_count ?? 0,
  }));
}

export async function getProject(id: string): Promise<ProjectEntry | null> {
  if (!ID_PATTERN.test(id)) return null;

  const { rows } = await query<ProjectRow>(`SELECT * FROM projects WHERE id = $1`, [id]);
  const row = rows[0];
  return row ? toEntry(row) : null;
}

export async function renameProject(id: string, name: string): Promise<ProjectEntry | null> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Project name cannot be empty.");
  if (!ID_PATTERN.test(id)) return null;

  const { rows } = await query<ProjectRow>(
    `UPDATE projects
        SET name = $2, updated_at = now()
      WHERE id = $1
      RETURNING *`,
    [id, trimmed],
  );

  const row = rows[0];
  return row ? toEntry(row) : null;
}

export async function deleteProject(id: string): Promise<boolean> {
  if (!ID_PATTERN.test(id)) return false;

  const { rows } = await query<{ id: string }>(
    `DELETE FROM projects WHERE id = $1 RETURNING id`,
    [id],
  );
  return rows.length > 0;
}
