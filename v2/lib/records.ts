import { jsonb, query } from "./db";

export type RecordVerdict = "ai" | "human" | "mixed";
export interface RecordProbs {
  ai: number;
  human: number;
  mixed: number;
}
export interface RecordSentence {
  sentence: string;
  ai: number;
}

/**
 * A single analyzed document or speech, with its cached map coordinates. This is the corpus the
 * map plots: `body` is the text that was scored, and the AI reading is the detector's result.
 */
export interface AnalyzedRecord {
  id: string;
  sourceType: string;
  sourceUrl: string | null;
  sourceId: string | null;
  title: string;
  body: string;
  aiShare: number | null;
  verdict: RecordVerdict;
  confidence: string;
  probs: RecordProbs | null;
  sentences: RecordSentence[] | null;
  words: number;
  publishedAt: number | null;
  point: { x: number; y: number } | null;
  point3: { x: number; y: number; z: number } | null;
  createdAt: string;
}

export interface RecordInput {
  id: string;
  sourceType: string;
  sourceUrl: string | null;
  sourceId: string | null;
  title: string;
  body: string;
  aiShare: number | null;
  verdict: RecordVerdict;
  confidence: string;
  probs: RecordProbs | null;
  sentences: RecordSentence[] | null;
  words: number;
  publishedAt: number | null;
  x: number | null;
  y: number | null;
  x3: number | null;
  y3: number | null;
  z3: number | null;
  createdAt: string;
}

type RecordRow = {
  id: string;
  source_type: string;
  source_url: string | null;
  source_id: string | null;
  title: string | null;
  body: string;
  ai_share: number | null;
  verdict: string | null;
  confidence: string | null;
  probs: RecordProbs | null;
  sentences: RecordSentence[] | null;
  words: number;
  published_at: string | number | null;
  x: number | null;
  y: number | null;
  x3: number | null;
  y3: number | null;
  z3: number | null;
  created_at: Date;
};

function toRecord(row: RecordRow): AnalyzedRecord {
  return {
    id: row.id,
    sourceType: row.source_type,
    sourceUrl: row.source_url,
    sourceId: row.source_id,
    title: row.title ?? row.source_id ?? "Untitled",
    body: row.body,
    aiShare: row.ai_share,
    verdict: row.verdict === "ai" || row.verdict === "mixed" ? row.verdict : "human",
    confidence: row.confidence ?? "medium",
    probs: row.probs,
    sentences: row.sentences,
    words: row.words,
    publishedAt: row.published_at === null ? null : Number(row.published_at),
    point: row.x !== null && row.y !== null ? { x: row.x, y: row.y } : null,
    point3:
      row.x3 !== null && row.y3 !== null && row.z3 !== null
        ? { x: row.x3, y: row.y3, z: row.z3 }
        : null,
    createdAt: row.created_at.toISOString(),
  };
}

export async function listRecords(limit = 5000): Promise<AnalyzedRecord[]> {
  const { rows } = await query<RecordRow>(
    `SELECT * FROM records ORDER BY created_at DESC LIMIT $1`,
    [limit],
  );
  return rows.map(toRecord);
}

/** Insert or refresh records — the import is re-runnable. */
export async function upsertRecords(rows: RecordInput[]): Promise<number> {
  for (const r of rows) {
    await query(
      `INSERT INTO records (
         id, source_type, source_url, source_id, title, body, ai_share, verdict,
         confidence, probs, sentences, words, published_at, x, y, x3, y3, z3, created_at
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       ON CONFLICT (id) DO UPDATE SET
         source_type = EXCLUDED.source_type,
         source_url  = EXCLUDED.source_url,
         source_id   = EXCLUDED.source_id,
         title       = EXCLUDED.title,
         body        = EXCLUDED.body,
         ai_share    = EXCLUDED.ai_share,
         verdict     = EXCLUDED.verdict,
         confidence  = EXCLUDED.confidence,
         probs       = EXCLUDED.probs,
         sentences   = EXCLUDED.sentences,
         words       = EXCLUDED.words,
         published_at = EXCLUDED.published_at,
         x           = EXCLUDED.x,
         y           = EXCLUDED.y,
         x3          = EXCLUDED.x3,
         y3          = EXCLUDED.y3,
         z3          = EXCLUDED.z3`,
      [
        r.id,
        r.sourceType,
        r.sourceUrl,
        r.sourceId,
        r.title,
        r.body,
        r.aiShare,
        r.verdict,
        r.confidence,
        jsonb(r.probs),
        jsonb(r.sentences),
        r.words,
        r.publishedAt,
        r.x,
        r.y,
        r.x3,
        r.y3,
        r.z3,
        r.createdAt,
      ],
    );
  }
  return rows.length;
}

/** A record and how near it sits to another on the map, for the neighbour panel. */
export interface Neighbour {
  recordId: string;
  title: string;
  aiShare: number;
  verdict: RecordVerdict;
  sourceType: string;
  score: number;
}

const MAX_MAP_DISTANCE = Math.SQRT2 * 2;

/**
 * Nearest records by map position. The coordinates are a UMAP projection of the record
 * embeddings, so neighbours here are the records that read alike — with the vectors gone
 * (they lived in Elasticsearch), this is the same signal without a second store.
 */
export async function nearestRecords(id: string, size = 6): Promise<Neighbour[]> {
  const records = (await listRecords()).filter((r) => r.point !== null);
  const self = records.find((r) => r.id === id);
  if (!self?.point) return [];

  return records
    .filter((r) => r.id !== id)
    .map((r) => ({
      record: r,
      distance: Math.hypot(r.point!.x - self.point!.x, r.point!.y - self.point!.y),
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, size)
    .map(({ record, distance }) => ({
      recordId: record.id,
      title: record.title,
      aiShare: record.aiShare ?? 0,
      verdict: record.verdict,
      sourceType: record.sourceType,
      score: Math.max(0, 1 - distance / MAX_MAP_DISTANCE),
    }));
}
