import { DateTime } from "luxon";

export function formatClock(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function formatWhen(ms: number) {
  return DateTime.fromMillis(ms, { zone: "America/New_York" }).toFormat("MM/dd/yy HH:mm");
}

/** Deep-link to the source, seeking to the excerpt start when it is a YouTube URL. */
export function sourceAt(url: string, startSec: number) {
  try {
    const parsed = new URL(url);
    if (!/(^|\.)youtube\.com$/i.test(parsed.hostname) && !/(^|\.)youtu\.be$/i.test(parsed.hostname)) {
      return url;
    }
    parsed.searchParams.set("t", `${startSec}s`);
    return parsed.toString();
  } catch {
    return url;
  }
}

export function pct(n: number) {
  return Math.round(n * 100);
}
