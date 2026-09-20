import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { parseCpacId, parseYoutubeId } from "./youtube-id";

export { parseCpacId, parseYoutubeId };

const SEGMENT_SEC = 60;
const TMP = path.join(process.cwd(), "data", "tmp");

function ytDlpBin(): string {
  const fromEnv = process.env.YT_DLP_PATH;
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
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    // Drop inherited HTTP(S)_PROXY — sandbox/corporate proxies 403 YouTube.
    const env = { ...process.env };
    for (const k of [
      "HTTP_PROXY",
      "HTTPS_PROXY",
      "http_proxy",
      "https_proxy",
      "ALL_PROXY",
      "all_proxy",
    ]) {
      delete env[k];
    }

    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"], env });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d: Buffer) => {
      stderr += d.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else {
        const tip =
          /not available on this app/i.test(stderr)
            ? " Your yt-dlp is too old for current YouTube. Run: brew upgrade yt-dlp   (or: yt-dlp --update-to nightly) then: rm -rf ~/.cache/yt-dlp/youtube-sts"
            : "";
        reject(new Error(`${cmd} exited ${code}: ${stderr.slice(-800)}${tip}`));
      }
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
  const m = raw.trim().match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isFinite(ms) ? ms : null;
}

/**
 * We ask for 60s, but a clip that starts near the end is shorter than that.
 * Record what we actually analyzed, not what we asked for.
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

/** Title, upload date and length from yt-dlp, with no download. */
export async function fetchYoutubeMeta(url: string): Promise<SourceMeta> {
  const videoId = parseYoutubeId(url);
  if (!videoId) throw new Error("Not a valid YouTube URL");

  const meta = await run(ytDlpBin(), [
    ...ytDlpBaseArgs(),
    "--print",
    "%(title)s",
    "--print",
    "%(upload_date)s",
    "--print",
    "%(duration)s",
    "--skip-download",
    url,
  ]);
  // Read the fixed fields off the end: a title can in principle wrap lines,
  // the two that follow it cannot.
  const lines = meta.stdout.trim().split("\n");
  const rawDuration = lines.length >= 3 ? lines[lines.length - 1] : "";
  const rawUploadDate = lines.length >= 3 ? lines[lines.length - 2] : "";
  const parsedDuration = Number(rawDuration);

  return {
    videoId,
    title:
      lines.slice(0, Math.max(1, lines.length - 2)).join(" ").trim() || videoId,
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
export async function extractMinuteClip(
  url: string,
  startSec = 0,
): Promise<ExtractedClip> {
  const videoId = parseYoutubeId(url);
  if (!videoId) throw new Error("Not a valid YouTube URL");
  if (startSec < 0 || !Number.isFinite(startSec)) {
    throw new Error("startSec must be >= 0");
  }

  fs.mkdirSync(TMP, { recursive: true });
  const endSec = startSec + SEGMENT_SEC;
  const outBase = path.join(TMP, `${videoId}-${startSec}-${randomUUID()}`);
  const outPath = `${outBase}.mp3`;

  const { title, publishedAt, sourceDurationSec } =
    await fetchYoutubeMeta(url);

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
    url,
  ]);

  const siblings = fs
    .readdirSync(TMP)
    .filter((f) => f.startsWith(path.basename(outBase)));
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
}

function pageTitle(html: string, fallback: string) {
  const raw = html.match(/<title>([^<]+)/i)?.[1] ?? "";
  const cleaned = raw
    .replace(/\s*[–—|-]\s*CPAC\.ca\s*$/i, "")
    .replace(/\s*[–—|-]\s*Headline Politics\s*$/i, "")
    .trim();
  return cleaned || fallback;
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
  const outPath = path.join(TMP, `${videoId}-${startSec}-${randomUUID()}.mp3`);
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
}

export function cleanupClip(audioPath: string) {
  try {
    fs.unlinkSync(audioPath);
  } catch {
    /* ignore */
  }
}
