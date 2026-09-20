import type { VideoSummary } from "./types";

export function canonicalWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

/** YouTube ids are exactly 11 characters from [A-Za-z0-9_-]. */
export const VIDEO_ID_PATTERN = /^[\w-]{11}$/;
const YOUTUBE_HOST = /(^|\.)(youtube\.com|youtube-nocookie\.com|youtu\.be)$/i;

/**
 * Accept a full YouTube URL or a bare 11-character video id.
 *
 * Only YouTube hosts are honoured and the id must be exactly 11 characters. The id is used
 * to build filesystem paths and to feed yt-dlp, so an arbitrary `?v=` value from some other
 * host must never pass through — otherwise it becomes an SSRF / path-traversal vector.
 */
export function parseVideoId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (VIDEO_ID_PATTERN.test(trimmed)) return trimmed;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (!YOUTUBE_HOST.test(url.hostname)) return null;

  const paramId = url.searchParams.get("v");
  if (paramId && VIDEO_ID_PATTERN.test(paramId)) return paramId;

  if (url.hostname === "youtu.be" || url.hostname.endsWith(".youtu.be")) {
    return url.pathname.match(/^\/([\w-]{11})(?:[/?#]|$)/)?.[1] ?? null;
  }
  return url.pathname.match(/^\/(?:shorts|embed|live|v)\/([\w-]{11})(?:[/?#]|$)/)?.[1] ?? null;
}

/** Public oEmbed lookup, so a pasted link gets real title/channel/thumbnail without a browser. */
export async function fetchOEmbed(videoId: string): Promise<{
  title: string;
  channel: string;
  thumbnail: string;
}> {
  const fallback = {
    title: `YouTube video ${videoId}`,
    channel: "",
    thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
  };

  try {
    const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(
      canonicalWatchUrl(videoId),
    )}&format=json`;
    const response = await fetch(endpoint);
    if (!response.ok) return fallback;
    const data = (await response.json()) as {
      title: string;
      author_name: string;
      thumbnail_url?: string;
    };
    return {
      title: data.title,
      channel: data.author_name,
      thumbnail: data.thumbnail_url ?? fallback.thumbnail,
    };
  } catch {
    return fallback;
  }
}

export function videoSummaryFromOEmbed(
  videoId: string,
  meta: { title: string; channel: string; thumbnail: string },
): VideoSummary {
  return {
    title: meta.title,
    channel: meta.channel,
    url: canonicalWatchUrl(videoId),
    videoId,
    thumbnail: meta.thumbnail,
  };
}

/** Best-effort video length from the public watch page, used to catch truncated transcripts. */
export async function fetchYoutubeDurationSeconds(videoId: string): Promise<number | null> {
  try {
    const response = await fetch(canonicalWatchUrl(videoId), {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;
    const html = await response.text();
    const seconds = Number(html.match(/"lengthSeconds":"(\d+)"/)?.[1]);
    return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
  } catch {
    return null;
  }
}
