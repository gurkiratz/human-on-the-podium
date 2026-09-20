import { Client } from "@elastic/elasticsearch";

/**
 * Where record embeddings live. Elasticsearch is the vector store and the
 * neighbour index; SQLite stays the source of truth for the records
 * themselves, so this index can be dropped and rebuilt at any time.
 */
export const VECTOR_INDEX = "podium-records";

/**
 * Elastic-hosted inference, so there is no second provider key. Dense on
 * purpose: ELSER is sparse and produces term expansions, which cannot be
 * projected onto a 2D canvas. Swap the id and the dims together.
 */
export const EMBED_MODEL = ".jina-embeddings-v5-text-small";
export const EMBED_DIMS = 1024;

export function elasticUrl(): string {
  const url = process.env.ELASTIC_URL ?? process.env.ELASTIC_ENDPOINT;
  if (!url) throw new Error("Missing ELASTIC_URL in .env");
  return url.replace(/\/+$/, "");
}

export function elasticKey(): string {
  const key = process.env.ELASTIC_API_KEY;
  if (!key) throw new Error("Missing ELASTIC_API_KEY in .env");
  return key;
}

let client: Client | null = null;

export function elastic(): Client {
  if (client) return client;
  client = new Client({ node: elasticUrl(), auth: { apiKey: elasticKey() } });
  return client;
}

export type VectorDoc = {
  recordId: string;
  sourceType: string;
  title: string;
  aiShare: number;
  verdict: string;
  words: number;
  publishedAt: number | null;
  body: string;
};

export async function ensureIndex(): Promise<void> {
  const es = elastic();
  if (await es.indices.exists({ index: VECTOR_INDEX })) return;
  await es.indices.create({
    index: VECTOR_INDEX,
    mappings: {
      properties: {
        recordId: { type: "keyword" },
        sourceType: { type: "keyword" },
        verdict: { type: "keyword" },
        title: { type: "text" },
        // Indexed as text too, so a hybrid query can run keyword and vector
        // search in one request later.
        body: { type: "text" },
        aiShare: { type: "float" },
        words: { type: "integer" },
        publishedAt: { type: "date" },
        vector: {
          type: "dense_vector",
          dims: EMBED_DIMS,
          index: true,
          similarity: "cosine",
        },
      },
    },
  });
}

/** Embed a batch of texts with the Elastic-hosted model. */
export async function embed(inputs: string[]): Promise<number[][]> {
  const res = await elastic().inference.inference({
    inference_id: EMBED_MODEL,
    input: inputs,
  });
  const out = (res as { text_embedding?: Array<{ embedding: number[] }> })
    .text_embedding;
  if (!out || out.length !== inputs.length) {
    throw new Error(
      `Embedding returned ${out?.length ?? 0} vectors for ${inputs.length} inputs`,
    );
  }
  return out.map((e) => e.embedding);
}

export type Neighbour = {
  recordId: string;
  title: string;
  aiShare: number;
  verdict: string;
  sourceType: string;
  score: number;
};

/**
 * Nearest records by meaning. Used when a dot is clicked: the neighbours are
 * what make a verdict disagreement legible — near-identical text that the
 * detector read differently.
 */
export async function neighbours(
  recordId: string,
  size = 6,
): Promise<Neighbour[]> {
  const es = elastic();

  // Elasticsearch 9 keeps dense_vector out of _source unless asked, so a plain
  // get returns the document without its vector and kNN silently finds nothing.
  const self = await es.search<{ vector: number[] }>({
    index: VECTOR_INDEX,
    size: 1,
    query: { ids: { values: [recordId] } },
    _source: { exclude_vectors: false },
  } as never);
  const vector = self.hits.hits[0]?._source?.vector;
  if (!vector) return [];

  const res = await es.search<VectorDoc>({
    index: VECTOR_INDEX,
    knn: {
      field: "vector",
      query_vector: vector,
      k: size + 1,
      num_candidates: Math.max(50, (size + 1) * 10),
    },
    _source: ["recordId", "title", "aiShare", "verdict", "sourceType"],
  });

  return res.hits.hits
    .filter((h) => h._id !== recordId)
    .slice(0, size)
    .map((h) => ({
      recordId: h._source!.recordId,
      title: h._source!.title,
      aiShare: h._source!.aiShare,
      verdict: h._source!.verdict,
      sourceType: h._source!.sourceType,
      score: h._score ?? 0,
    }));
}
