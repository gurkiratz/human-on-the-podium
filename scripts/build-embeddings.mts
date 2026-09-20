/**
 * Embed every record, index the vectors in Elasticsearch, then project them
 * to 2D and 3D and cache both sets of coordinates on the SQLite row.
 *
 *   npx tsx scripts/build-embeddings.mts            # embed new, reproject all
 *   npx tsx scripts/build-embeddings.mts --reembed  # re-embed everything
 *   npx tsx scripts/build-embeddings.mts --project  # reproject only, no API calls
 *
 * Projection is done once here rather than in the browser: UMAP is not cheap,
 * and a map whose layout shifts on every page load is not a map. The 2D and
 * 3D layouts are separate runs — asking UMAP for a third component rearranges
 * the other two, so the 3D map is not the 2D map with a depth added.
 */
import process from "node:process";
import { UMAP } from "umap-js";

process.loadEnvFile();

const { listYoutubeScores, setEmbedPoint, setEmbedPoint3 } =
  await import("../src/lib/db");
const { elastic, ensureIndex, embed, VECTOR_INDEX, EMBED_MODEL } =
  await import("../src/lib/elastic");

const argv = process.argv.slice(2);
const reembed = argv.includes("--reembed");
const projectOnly = argv.includes("--project");
const BATCH = 16;

const es = elastic();
const records = listYoutubeScores(5000);
console.log(`${records.length} records · model ${EMBED_MODEL}\n`);

await ensureIndex();

// --- 1. embed + index -------------------------------------------------------
let indexed = new Set<string>();
if (!reembed) {
  const existing = await es.search<{ recordId: string }>({
    index: VECTOR_INDEX,
    size: 10000,
    _source: ["recordId"],
    query: { match_all: {} },
  });
  indexed = new Set(existing.hits.hits.map((h) => h._id!));
}

const todo = projectOnly ? [] : records.filter((r) => !indexed.has(r.id));
console.log(
  projectOnly
    ? "skipping embedding (--project)"
    : `${indexed.size} already embedded · ${todo.length} to embed`,
);

for (let i = 0; i < todo.length; i += BATCH) {
  const slice = todo.slice(i, i + BATCH);
  // Title carries the person and the body they were appointed to, which the
  // body text does not always repeat. Both belong in the vector.
  const inputs = slice.map((r) => `${r.title ?? ""}\n\n${r.transcript}`.trim());
  const vectors = await embed(inputs);

  const operations = slice.flatMap((r, n) => [
    { index: { _index: VECTOR_INDEX, _id: r.id } },
    {
      recordId: r.id,
      sourceType: r.sourceType,
      title: r.title ?? r.videoId,
      body: r.transcript,
      aiShare: r.probs.ai,
      verdict: r.verdict,
      words: r.words,
      publishedAt: r.publishedAt,
      vector: vectors[n],
    },
  ]);
  const res = await es.bulk({ operations, refresh: false });
  if (res.errors) {
    const bad = res.items.find((it) => it.index?.error);
    throw new Error(`Bulk index failed: ${JSON.stringify(bad?.index?.error)}`);
  }
  console.log(`  embedded ${Math.min(i + BATCH, todo.length)}/${todo.length}`);
}

if (todo.length > 0) await es.indices.refresh({ index: VECTOR_INDEX });

// --- 2. project -------------------------------------------------------------
const all = await es.search<{ recordId: string; vector: number[] }>({
  index: VECTOR_INDEX,
  size: 10000,
  _source: ["recordId", "vector"],
  query: { match_all: {} },
});
const hits = all.hits.hits.filter((h) => h._source?.vector);

if (hits.length < 3) {
  console.log("\nnot enough vectors to project");
  process.exit(0);
}

const vectors = hits.map((h) => h._source!.vector);

/**
 * Project to `dims` and normalise each axis into [-1, 1], so the page never
 * has to know the arbitrary scale UMAP happened to land on. Seeded, because
 * an unseeded UMAP redraws the map differently every run, which destroys any
 * sense of place — and both runs get the same seed so the two layouts are
 * at least oriented from the same starting point.
 */
function project(dims: number): number[][] {
  let seed = 42;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };

  const umap = new UMAP({
    nComponents: dims,
    nNeighbors: Math.max(2, Math.min(15, vectors.length - 1)),
    minDist: 0.12,
    spread: 1.2,
    random,
  });
  const coords = umap.fit(vectors);

  const spans = Array.from({ length: dims }, (_, axis) => {
    const v = coords.map((c) => c[axis]);
    const lo = Math.min(...v);
    const hi = Math.max(...v);
    return { lo, range: hi - lo || 1 };
  });

  return coords.map((c) =>
    c.map((v, axis) => ((v - spans[axis].lo) / spans[axis].range) * 2 - 1),
  );
}

console.log(`\nprojecting ${hits.length} vectors to 2D…`);
const flat = project(2);
hits.forEach((h, i) => setEmbedPoint(h._source!.recordId, flat[i][0], flat[i][1]));

console.log(`projecting ${hits.length} vectors to 3D…`);
const deep = project(3);
hits.forEach((h, i) =>
  setEmbedPoint3(h._source!.recordId, deep[i][0], deep[i][1], deep[i][2]),
);

console.log(`wrote ${hits.length} points in each layout\n`);

const placed = listYoutubeScores(5000);
console.log(
  `${placed.filter((r) => r.point).length}/${records.length} records have a 2D position`,
);
console.log(
  `${placed.filter((r) => r.point3).length}/${records.length} records have a 3D position`,
);
