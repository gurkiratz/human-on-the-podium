import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { parseYoutubeId } from "./youtube-id";

export { parseYoutubeId };

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
};

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

  const meta = await run(ytDlpBin(), [
    ...ytDlpBaseArgs(),
    "--print",
    "%(title)s",
    "--skip-download",
    url,
  ]);
  const title = meta.stdout.trim().split("\n")[0] || videoId;

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
    durationSec: SEGMENT_SEC,
  };
}

export function cleanupClip(audioPath: string) {
  try {
    fs.unlinkSync(audioPath);
  } catch {
    /* ignore */
  }
}
