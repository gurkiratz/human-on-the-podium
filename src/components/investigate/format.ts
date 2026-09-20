import { DateTime } from "luxon";

export function formatClock(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function formatWhen(ms: number) {
  return DateTime.fromMillis(ms, { zone: "America/New_York" }).toFormat(
    "MM/dd/yy HH:mm",
  );
}

export function youtubeAt(url: string, startSec: number) {
  try {
    const u = new URL(url);
    u.searchParams.set("t", `${startSec}s`);
    return u.toString();
  } catch {
    return url;
  }
}

export function pct(n: number) {
  return Math.round(n * 100);
}
