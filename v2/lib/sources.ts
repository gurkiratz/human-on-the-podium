import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { MAX_CLIP_JOBS } from "./constants";
import { env } from "./env";
import { canonicalWatchUrl, parseCpacId, parseYoutubeId } from "./recording-id";

export { parseCpacId, parseYoutubeId };

const SEGMENT_SEC = 60;
const TMP = path.join(process.cwd(), "data", "tmp");
/** Longest a single yt-dlp / ffmpeg invocation may run before it is killed. */
const RUN_TIMEOUT_MS = 150_000;
/** Cap on captured stdout/stderr, so a chatty source cannot grow the process unbounded. */
const MAX_OUTPUT_CHARS = 100_000;

/**
 * A process-wide cap on simultaneous clip extractions. `MAX_CLIP_JOBS` is enforced client
 * side too, but the endpoint is public, so the server must hold the line as well.
 */
let activeClipJobs = 0;
const clipJobWaiters: Array<() => void> = [];

async function acquireClipSlot(): Promise<void> {
  if (activeClipJobs < MAX_CLIP_JOBS) {
    activeClipJobs += 1;
    return;
  }
  await new Promise<void>((resolve) => clipJobWaiters.push(resolve));
  activeClipJobs += 1;
}

function releaseClipSlot(): void {
  activeClipJobs = Math.max(0, activeClipJobs - 1);
  clipJobWaiters.shift()?.();
}

function ytDlpBin(): string {
  const fromEnv = env.ytDlpPath;
  if (fromEnv) return fromEnv;
  const local = path.join(process.cwd(), "bin", "yt-dlp");
  if (fs.existsSync(local)) return local;
  return "yt-dlp";
}

/** Shared flags — Node solves YouTube's JS nsig challenge. */
function ytDlpBaseArgs(): string[] {
  return ["--no-playlist", "--js-runtimes", "node"];
}

function run(
  cmd: string,
  args: string[],
  timeoutMs = RUN_TIMEOUT_MS,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    // Drop inherited HTTP(S)_PROXY — sandbox/corporate proxies 403 YouTube.
    const envVars = { ...process.env };
    for (const key of [
      "HTTP_PROXY",
      "HTTPS_PROXY",
      "http_proxy",
      "https_proxy",
      "ALL_PROXY",
      "all_proxy",
    ]) {
      delete envVars[key];
    }

    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"], env: envVars });
    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const append = (current: string, chunk: Buffer) =>
      current.length >= MAX_OUTPUT_CHARS
        ? current
        : current + chunk.toString().slice(0, MAX_OUTPUT_CHARS - current.length);

    // A hung download or a source that never finishes must not pin the request forever.
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout = append(stdout, chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = append(stderr, chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(new Error(`${cmd} timed out after ${Math.round(timeoutMs / 1000)}s`));
        return;
      }
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      const tip = /not available on this app/i.test(stderr)
        ? " Your yt-dlp is too old for current YouTube. Run: brew upgrade yt-dlp   (or: yt-dlp --update-to nightly) then: rm -rf ~/.cache/yt-dlp/youtube-sts"
        : "";
      reject(new Error(`${cmd} exited ${code}: ${stderr.slice(-800)}${tip}`));
    });
  });
}

export type ExtractedClip = {
  audioPath: string;
  videoId: string;
  title: string;
  startSec: number;
  durationSec: number;
  /** When the source was aired or uploaded, in ms. Null when not published. */
  publishedAt: number | null;
  /** Full length of the source recording in seconds. Null when unknown. */
  sourceDurationSec: number | null;
};

/** What a source tells us about itself, before any audio is pulled. */
export type SourceMeta = {
  videoId: string;
  title: string;
  publishedAt: number | null;
  sourceDurationSec: number | null;
};

/** "00:14:53" / "14:53" -> seconds. */
function hmsToSec(raw: string): number | null {
  const parts = raw.trim().split(":").map(Number);
  if (parts.length === 0 || parts.some((n) => !Number.isFinite(n))) return null;
  const sec = parts.reduce((total, n) => total * 60 + n, 0);
  return sec > 0 ? Math.round(sec) : null;
}

/** yt-dlp prints upload_date as YYYYMMDD, or "NA". */
function uploadDateToMs(raw: string): number | null {
  const match = raw.trim().match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!match) return null;
  const ms = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isFinite(ms) ? ms : null;
}

/**
 * We ask for 60s, but a clip that starts near the end is shorter than that.
 * Record what was actually analyzed, not what was asked for.
 */
function clipLength(startSec: number, total: number | null) {
  if (total === null) return SEGMENT_SEC;
  return Math.max(1, Math.min(SEGMENT_SEC, total - startSec));
}

function formatHms(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
}

/**
 * Fail before the expensive download rather than deep inside ffmpeg, where a
 * start past the end surfaces as an opaque codec error.
 */
function assertStartInRange(startSec: number, total: number | null) {
  if (total !== null && startSec >= total) {
    throw new Error(
      `Start time ${formatHms(startSec)} is past the end of this recording (${formatHms(total)}).`,
    );
  }
}

function pageTitle(html: string, fallback: string) {
  const raw = html.match(/<title>([^<]+)/i)?.[1] ?? "";
  const cleaned = raw
    .replace(/\s*[–—|-]\s*CPAC\.ca\s*$/i, "")
    .replace(/\s*[–—|-]\s*Headline Politics\s*$/i, "")
    .trim();
  return cleaned || fallback;
}

/** Title, upload date and length from yt-dlp, with no download. */
export async function fetchYoutubeMeta(url: string): Promise<SourceMeta> {
  const videoId = parseYoutubeId(url);
  if (!videoId) throw new Error("Not a valid YouTube URL");

  // Always hand yt-dlp our own canonical URL, never the caller's raw string.
  const watchUrl = canonicalWatchUrl(videoId);
  const meta = await run(ytDlpBin(), [
    ...ytDlpBaseArgs(),
    "--print",
    "%(title)s",
    "--print",
    "%(upload_date)s",
    "--print",
    "%(duration)s",
    "--skip-download",
    watchUrl,
  ]);
  // Read the fixed fields off the end: a title can in principle wrap lines,
  // the two that follow it cannot.
  const lines = meta.stdout.trim().split("\n");
  const rawDuration = lines.length >= 3 ? lines[lines.length - 1] : "";
  const rawUploadDate = lines.length >= 3 ? lines[lines.length - 2] : "";
  const parsedDuration = Number(rawDuration);

  return {
    videoId,
    title: lines.slice(0, Math.max(1, lines.length - 2)).join(" ").trim() || videoId,
    publishedAt: uploadDateToMs(rawUploadDate),
    sourceDurationSec:
      Number.isFinite(parsedDuration) && parsedDuration > 0
        ? Math.round(parsedDuration)
        : null,
  };
}

/** CPAC episode page, parsed once for everything we need from it. */
async function fetchCpacPage(url: string) {
  const videoId = parseCpacId(url);
  if (!videoId) throw new Error("Not a valid CPAC URL");

  const page = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    redirect: "follow",
  });
  if (!page.ok) throw new Error(`CPAC page ${page.status}`);
  const html = await page.text();

  // The player element carries the airdate and the full episode length.
  const airedRaw = html.match(/data-livedatetime="([^"]+)"/)?.[1];
  const airedMs = airedRaw ? Date.parse(airedRaw) : NaN;
  const durationRaw = html.match(/data-videoduration="([^"]+)"/)?.[1];

  return {
    html,
    meta: {
      videoId,
      title: pageTitle(html, videoId),
      publishedAt: Number.isFinite(airedMs) ? airedMs : null,
      sourceDurationSec: durationRaw ? hmsToSec(durationRaw) : null,
    } satisfies SourceMeta,
  };
}

export async function fetchCpacMeta(url: string): Promise<SourceMeta> {
  return (await fetchCpacPage(url)).meta;
}

/** Metadata for any supported source, without pulling audio. */
export async function fetchSourceMeta(url: string): Promise<SourceMeta> {
  if (parseYoutubeId(url)) return fetchYoutubeMeta(url);
  if (parseCpacId(url)) return fetchCpacMeta(url);
  throw new Error("Unsupported source URL");
}

/** Pull a 60s audio clip from a YouTube URL via yt-dlp + ffmpeg. */
export async function extractMinuteClip(url: string, startSec = 0): Promise<ExtractedClip> {
  const videoId = parseYoutubeId(url);
  if (!videoId) throw new Error("Not a valid YouTube URL");
  if (startSec < 0 || !Number.isFinite(startSec)) {
    throw new Error("startSec must be >= 0");
  }

  await acquireClipSlot();
  try {
    fs.mkdirSync(TMP, { recursive: true });
    const endSec = startSec + SEGMENT_SEC;
    // `videoId` is a validated 11-character id, but build the path from it explicitly so no
    // caller-controlled string can reach the filesystem.
    const outBase = path.join(TMP, `${videoId}-${Math.floor(startSec)}-${randomUUID()}`);
    const outPath = `${outBase}.mp3`;
    const watchUrl = canonicalWatchUrl(videoId);

    const { title, publishedAt, sourceDurationSec } = await fetchYoutubeMeta(watchUrl);

    assertStartInRange(startSec, sourceDurationSec);

    // Prefer HLS audio (234/233). Progressive https (140/251) often 403s now.
    await run(ytDlpBin(), [
      ...ytDlpBaseArgs(),
      "-f",
      "234/233/bestaudio",
      "--download-sections",
      `*${startSec}-${endSec}`,
      "--force-keyframes-at-cuts",
      "-o",
      `${outBase}.%(ext)s`,
      watchUrl,
    ]);

    const siblings = fs
      .readdirSync(TMP)
      .filter((file) => file.startsWith(path.basename(outBase)));
    const raw = siblings[0];
    if (!raw) throw new Error("yt-dlp produced no audio file");
    const rawPath = path.join(TMP, raw);

    let audioPath = rawPath;
    if (!raw.endsWith(".mp3")) {
      await run("ffmpeg", [
        "-y",
        "-i",
        rawPath,
        "-vn",
        "-acodec",
        "libmp3lame",
        "-q:a",
        "5",
        outPath,
      ]);
      cleanupClip(rawPath);
      audioPath = outPath;
    }

    return {
      audioPath,
      videoId,
      title,
      startSec,
      durationSec: clipLength(startSec, sourceDurationSec),
      publishedAt,
      sourceDurationSec,
    };
  } finally {
    releaseClipSlot();
  }
}

/** Pull a 60s audio clip from a CPAC episode page (HLS + ffmpeg). */
export async function extractCpacMinuteClip(
  url: string,
  startSec = 0,
): Promise<ExtractedClip> {
  const videoId = parseCpacId(url);
  if (!videoId) throw new Error("Not a valid CPAC URL");
  if (startSec < 0 || !Number.isFinite(startSec)) {
    throw new Error("startSec must be >= 0");
  }

  await acquireClipSlot();
  try {
    const { html, meta } = await fetchCpacPage(url);
    const { title, publishedAt, sourceDurationSec } = meta;
    const master = html.match(/https?:\/\/[^"'<\s]+\.m3u8[^"'<\s]*/)?.[0];
    if (!master) throw new Error("No CPAC stream on that page");

    assertStartInRange(startSec, sourceDurationSec);

    const playlistRes = await fetch(master, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        Referer: "https://www.cpac.ca/",
      },
    });
    if (!playlistRes.ok) throw new Error(`CPAC playlist ${playlistRes.status}`);
    const playlist = await playlistRes.text();
    const audioRel = playlist.match(/TYPE=AUDIO[^\n]*URI="([^"]+)"/)?.[1];
    const audioUrl = audioRel ? new URL(audioRel, master).href : master;

    fs.mkdirSync(TMP, { recursive: true });
    const outPath = path.join(TMP, `${videoId}-${Math.floor(startSec)}-${randomUUID()}.mp3`);
    await run("ffmpeg", [
      "-y",
      "-user_agent",
      "Mozilla/5.0",
      "-referer",
      "https://www.cpac.ca/",
      "-ss",
      String(startSec),
      "-t",
      String(SEGMENT_SEC),
      "-i",
      audioUrl,
      "-vn",
      "-acodec",
      "libmp3lame",
      "-q:a",
      "5",
      outPath,
    ]);

    return {
      audioPath: outPath,
      videoId,
      title,
      startSec,
      durationSec: clipLength(startSec, sourceDurationSec),
      publishedAt,
      sourceDurationSec,
    };
  } finally {
    releaseClipSlot();
  }
}

export function cleanupClip(audioPath: string) {
  try {
    fs.unlinkSync(audioPath);
  } catch {
    /* ignore */
  }
}
