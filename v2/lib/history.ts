import { jsonb, query } from "./db";
import type {
  ChatMessage,
  Transcript,
  TranscriptStats,
  VideoProposal,
} from "./types";

export interface ChatSummary {
  id: string;
  title: string;
  updatedAt: string;
  messageCount: number;
}

export interface ChatSession extends ChatSummary {
  createdAt: string;
  messages: ChatMessage[];
  proposal: VideoProposal | null;
  browserSessionId: string | null;
  transcript: Transcript | null;
  stats: TranscriptStats | null;
  /** Diarized speaker the clip is mainly about, if one was picked. */
  primarySpeaker?: string | null;
}

const ID_PATTERN = /^[A-Za-z0-9._-]+$/;

type ChatRow = {
  id: string;
  title: string;
  created_at: Date;
  updated_at: Date;
  message_count: number;
  messages: ChatMessage[];
  proposal: VideoProposal | null;
  browser_session_id: string | null;
  transcript: Transcript | null;
  stats: TranscriptStats | null;
  primary_speaker: string | null;
};

function titleFrom(messages: ChatMessage[]): string {
  const firstUser = messages.find((message) => message.role === "user" && message.text.trim());
  const title = firstUser?.text.trim() || "New conversation";
  return title.length > 70 ? `${title.slice(0, 70)}…` : title;
}

export async function listChats(): Promise<ChatSummary[]> {
  const { rows } = await query<
    Pick<ChatRow, "id" | "title" | "updated_at" | "message_count">
  >(
    `SELECT id, title, updated_at, message_count
       FROM chats
      ORDER BY updated_at DESC`,
  );

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    updatedAt: row.updated_at.toISOString(),
    messageCount: row.message_count,
  }));
}

export async function getChat(id: string): Promise<ChatSession | null> {
  if (!ID_PATTERN.test(id)) return null;

  const { rows } = await query<ChatRow>(`SELECT * FROM chats WHERE id = $1`, [id]);
  const row = rows[0];
  if (!row) return null;

  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    messageCount: row.message_count,
    messages: row.messages ?? [],
    proposal: row.proposal,
    browserSessionId: row.browser_session_id,
    transcript: row.transcript,
    stats: row.stats,
    primarySpeaker: row.primary_speaker,
  };
}

export async function saveChat(input: {
  id: string;
  messages: ChatMessage[];
  proposal: VideoProposal | null;
  browserSessionId: string | null;
  transcript: Transcript | null;
  stats: TranscriptStats | null;
  primarySpeaker?: string | null;
}): Promise<ChatSummary> {
  if (!ID_PATTERN.test(input.id)) throw new Error("Invalid chat id.");

  const { rows } = await query<
    Pick<ChatRow, "id" | "title" | "updated_at" | "message_count">
  >(
    `INSERT INTO chats (
       id, title, message_count, messages, proposal,
       browser_session_id, transcript, stats, primary_speaker
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (id) DO UPDATE SET
       title              = EXCLUDED.title,
       updated_at         = now(),
       message_count      = EXCLUDED.message_count,
       messages           = EXCLUDED.messages,
       proposal           = EXCLUDED.proposal,
       browser_session_id = EXCLUDED.browser_session_id,
       transcript         = EXCLUDED.transcript,
       stats              = EXCLUDED.stats,
       primary_speaker    = EXCLUDED.primary_speaker
     RETURNING id, title, updated_at, message_count`,
    [
      input.id,
      titleFrom(input.messages),
      input.messages.length,
      jsonb(input.messages),
      jsonb(input.proposal),
      input.browserSessionId,
      jsonb(input.transcript),
      jsonb(input.stats),
      input.primarySpeaker ?? null,
    ],
  );

  const row = rows[0];
  return {
    id: row.id,
    title: row.title,
    updatedAt: row.updated_at.toISOString(),
    messageCount: row.message_count,
  };
}
