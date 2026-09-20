/**
 * Analyze a CSV of written appointment records and file them alongside the
 * speech excerpts. Same pipeline as a video: the `body` goes to GPTZero, and
 * the reading is stored with source_type 'doc'.
 *
 *   npx tsx scripts/ingest-appointments.mts --dry
 *   npx tsx scripts/ingest-appointments.mts --limit 3
 *   npx tsx scripts/ingest-appointments.mts
 *
 * Re-runnable: rows already filed under the same source id are skipped, so an
 * interrupted run can simply be repeated without double-billing GPTZero.
 */
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

process.loadEnvFile();

const { insertYoutubeScore, listYoutubeScores } = await import("../src/lib/db");
const { scoreChunk } = await import("../src/lib/gptzero");

const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(name);
const value = (name: string, fallback: string) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};

const dry = flag("--dry");
const limit = Number(value("--limit", "0")) || Infinity;
const concurrency = Math.max(1, Number(value("--concurrency", "2")) || 2);
const file = path.resolve(value("--file", "data/appointment_dataset.csv"));

/** RFC 4180: quoted fields may contain commas, newlines and "" escapes. */
function parseCsv(input: string): string[][] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") field += c;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/**
 * Some exports escape their line breaks, so the body arrives with the two
 * characters \ and n rather than a newline. Left alone they show up verbatim
 * in the UI and inside the embedding text.
 */
function unescapeBody(raw: string): string {
  return raw
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function utc(y: number, monthIndex: number, d: number): number | null {
  if (monthIndex < 0 || monthIndex > 11 || d < 1 || d > 31) return null;
  const ms = Date.UTC(y, monthIndex, d);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * The document's own date, in whichever form its export used.
 *
 * Federal PC orders carry a labelled `Date: YYYY-MM-DD`, which is
 * unambiguous, so it wins. Provincial Orders in Council instead open
 * "Order in Council ... <Month D, YYYY>" within the first 60 characters —
 * that search stays bounded, because dates further into those texts are
 * effective dates and term ends, not the date of the order.
 */
function orderDate(body: string): number | null {
  const iso = body.match(/\bDate:\s*(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) {
    const at = utc(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    if (at !== null) return at;
  }

  const prose = body.match(/\b([A-Z][a-z]+)\s+(\d{1,2}),\s*(\d{4})\b/);
  if (!prose || prose.index === undefined || prose.index > 200) return null;
  return utc(Number(prose[3]), MONTHS.indexOf(prose[1]), Number(prose[2]));
}

function sourceId(url: string, fallback: string): string {
  return url.match(/\/appointments\/([0-9a-f]{32})/i)?.[1] ?? fallback;
}

async function withRetry<T>(fn: () => Promise<T>, tries = 4): Promise<T> {
  for (let n = 1; ; n++) {
    try {
      return await fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const retriable =
        /\b(429|408|5\d\d)\b/.test(msg) ||
        /fetch failed|ECONN|ETIMEDOUT|socket hang up/i.test(msg);
      if (!retriable || n >= tries) throw err;
      const wait = 1500 * 2 ** (n - 1);
      console.log(`    retrying in ${wait}ms — ${msg.slice(0, 80)}`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

const BANDS: Array<[number, string]> = [
  [0.1, "Human hands"],
  [0.3, "Mostly human"],
  [0.55, "Ghostwriter?"],
  [0.8, "Leans machine"],
  [Infinity, "Reads like a bot"],
];
const bandLabel = (ai: number) =>
  BANDS.find(([max]) => ai < max)![1];

// ---------------------------------------------------------------------------

if (!fs.existsSync(file)) throw new Error(`No such file: ${file}`);
const table = parseCsv(fs.readFileSync(file, "utf8"));
const header = table[0].map((h) => h.trim());
const records: Array<Record<string, string>> = table
  .slice(1)
  .filter((r) => r.some((c) => c.trim() !== ""))
  .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));

for (const col of ["title", "source", "body"]) {
  if (!header.includes(col)) throw new Error(`CSV is missing a '${col}' column`);
}

const existing = new Set(listYoutubeScores(5000).map((r) => r.videoId));
const seen = new Set<string>();
type DocRow = { title: string; source: string; body: string; id: string };

const queue: DocRow[] = records
  .map((r) => ({
    title: r.title ?? "",
    source: r.source ?? "",
    body: unescapeBody(r.body ?? ""),
    id: sourceId(r.source ?? "", r.title ?? ""),
  }))
  .filter((r) => r.body.trim().length > 0)
  .filter((r) => {
    if (existing.has(r.id) || seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  })
  .slice(0, limit === Infinity ? undefined : limit);

console.log(
  `${records.length} rows in CSV · ${existing.size} already filed · ` +
    `${queue.length} to analyze${dry ? " (dry run)" : ""}\n`,
);

if (dry) {
  for (const r of queue.slice(0, 5)) {
    const d = orderDate(r.body);
    console.log(`  ${r.title.slice(0, 54)}`);
    console.log(
      `    id ${r.id.slice(0, 12)}… · ${r.body.split(/\s+/).length} words · ` +
        `dated ${d ? new Date(d).toISOString().slice(0, 10) : "unknown"}`,
    );
  }
  if (queue.length > 5) console.log(`  … and ${queue.length - 5} more`);
  process.exit(0);
}

let done = 0;
let failed = 0;
const tally = new Map<string, number>();

async function worker() {
  for (;;) {
    const row = queue.shift();
    if (!row) return;
    const label = row.title.slice(0, 48);
    try {
      const detection = await withRetry(() => scoreChunk(row.body, 0));
      insertYoutubeScore({
        id: randomUUID(),
        sourceType: "doc",
        youtubeUrl: row.source,
        videoId: row.id,
        title: row.title,
        // A document has no timeline: no offset, no runtime.
        startSec: 0,
        durationSec: 0,
        sourceDurationSec: null,
        publishedAt: orderDate(row.body),
        transcript: row.body,
        verdict: detection.verdict,
        probability: detection.probability,
        probs: detection.probs,
        confidence: detection.confidence,
        sentences: detection.sentences,
        words: detection.words,
      });
      const share = Math.round(detection.probs.ai * 100);
      const band = bandLabel(detection.probs.ai);
      tally.set(band, (tally.get(band) ?? 0) + 1);
      done++;
      console.log(
        `[${String(done + failed).padStart(3)}] ${String(share).padStart(3)}% AI  ` +
          `${band.padEnd(17)} ${label}`,
      );
    } catch (err) {
      failed++;
      console.log(`[${String(done + failed).padStart(3)}] FAILED          ${label}`);
      console.log(`      ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

await Promise.all(Array.from({ length: concurrency }, worker));

console.log(`\n${done} analyzed, ${failed} failed`);
for (const [, band] of BANDS) {
  const n = tally.get(band) ?? 0;
  if (n > 0) console.log(`  ${String(n).padStart(3)}  ${band}`);
}
