import { jsonb, query } from "./db";
import type { Transcript, TranscriptStats, VideoSummary } from "./types";

export interface LibraryItem {
  id: string;
  createdAt: string;
  video: VideoSummary;
  stats: TranscriptStats;
}

export interface LibraryEntry extends LibraryItem {
  transcript: Transcript;
  /** Diarized speaker the clip is mainly about, if one was picked. */
  primarySpeaker?: string | null;
}

const ID_PATTERN = /^[A-Za-z0-9._-]+$/;

type LibraryRow = {
  id: string;
  video_id: string | null;
  created_at: Date;
  video: VideoSummary;
  stats: TranscriptStats;
  transcript: Transcript;
  primary_speaker: string | null;
};

/** Persist a finished transcription so it appears under Existing Content. */
export async function saveTranscriptRun(input: {
  video: VideoSummary;
  stats: TranscriptStats;
  transcript: Transcript;
  primarySpeaker?: string | null;
  /** When > 0, this run is a clip starting here — keyed separately from the full video. */
  startSec?: number;
}): Promise<{ id: string }> {
  const videoId = input.video.videoId;
  const startSec =
    typeof input.startSec === "number" && Number.isFinite(input.startSec)
      ? Math.max(0, Math.floor(input.startSec))
      : 0;
  // A full run is keyed on the video so re-transcribing replaces it; a clip is keyed on the
  // video *and* its start, so analyzing another minute never overwrites the first.
  const id = videoId
    ? startSec > 0
      ? `${videoId}-${startSec}`
      : videoId
    : `clip-${Date.now()}`;

  await query(
    `INSERT INTO library_runs (id, video_id, video, stats, transcript, primary_speaker)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (id) DO UPDATE SET
       video_id        = EXCLUDED.video_id,
       created_at      = now(),
       video           = EXCLUDED.video,
       stats           = EXCLUDED.stats,
       transcript      = EXCLUDED.transcript,
       primary_speaker = EXCLUDED.primary_speaker`,
    [
      id,
      videoId || null,
      jsonb(input.video),
      jsonb(input.stats),
      jsonb(input.transcript),
      input.primarySpeaker ?? null,
    ],
  );

  return { id };
}

export async function listLibrary(): Promise<LibraryItem[]> {
  const { rows } = await query<Pick<LibraryRow, "id" | "created_at" | "video" | "stats">>(
    `SELECT id, created_at, video, stats
       FROM library_runs
      ORDER BY created_at DESC`,
  );

  return rows.map((row) => ({
    id: row.id,
    createdAt: row.created_at.toISOString(),
    video: row.video,
    stats: row.stats,
  }));
}

export async function getLibraryEntry(id: string): Promise<LibraryEntry | null> {
  if (!ID_PATTERN.test(id)) return null;

  const { rows } = await query<LibraryRow>(`SELECT * FROM library_runs WHERE id = $1`, [id]);
  const row = rows[0];
  if (!row) return null;

  return {
    id: row.id,
    createdAt: row.created_at.toISOString(),
    video: row.video,
    stats: row.stats,
    transcript: row.transcript,
    primarySpeaker: row.primary_speaker,
  };
}
