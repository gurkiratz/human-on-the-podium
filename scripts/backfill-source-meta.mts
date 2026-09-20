/**
 * Fill in published_at / source_duration_sec for records filed before we
 * captured them, and correct duration_sec where we recorded a flat 60s for a
 * clip that was actually shorter.
 *
 * Metadata only — no audio is downloaded and nothing is re-analyzed.
 *
 *   npx tsx scripts/backfill-source-meta.mts [--dry]
 */
import { listYoutubeScores, updateSourceMeta } from "../src/lib/db";
import { fetchSourceMeta } from "../src/lib/youtube";

const SEGMENT_SEC = 60;
const dry = process.argv.includes("--dry");

function clipLength(startSec: number, total: number | null) {
  if (total === null) return null;
  return Math.max(1, Math.min(SEGMENT_SEC, total - startSec));
}

const rows = listYoutubeScores(500);
const pending = rows.filter(
  (r) => r.publishedAt === null || r.sourceDurationSec === null,
);

console.log(`${rows.length} records, ${pending.length} missing metadata\n`);

let filled = 0;
let failed = 0;

for (const row of pending) {
  const label = (row.title ?? row.videoId).slice(0, 46);
  try {
    const meta = await fetchSourceMeta(row.youtubeUrl);
    const trueLength = clipLength(row.startSec, meta.sourceDurationSec);
    const patch = {
      publishedAt: meta.publishedAt,
      sourceDurationSec: meta.sourceDurationSec,
      ...(trueLength !== null && trueLength !== row.durationSec
        ? { durationSec: trueLength }
        : {}),
    };

    const date = meta.publishedAt
      ? new Date(meta.publishedAt).toISOString().slice(0, 10)
      : "no date published";
    const fix =
      "durationSec" in patch
        ? `  [duration_sec ${row.durationSec} -> ${patch.durationSec}]`
        : "";
    console.log(`${dry ? "would fill" : "filled"}  ${label}`);
    console.log(`          ${date} · source ${meta.sourceDurationSec ?? "?"}s${fix}`);

    if (!dry) updateSourceMeta(row.id, patch);
    filled++;
  } catch (err) {
    failed++;
    console.log(`FAILED    ${label}`);
    console.log(`          ${err instanceof Error ? err.message : String(err)}`);
  }
}

console.log(`\n${filled} filled, ${failed} failed`);
