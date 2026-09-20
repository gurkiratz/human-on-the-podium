import { DateTime } from "luxon";

/**
 * Recording dates are calendar dates, not instants: CPAC reports an airdate at
 * midnight UTC and yt-dlp reports a bare YYYYMMDD. Rendering either in a local
 * zone west of UTC would show the day before, so these stay in UTC.
 */
export function formatDay(ms: number) {
  return DateTime.fromMillis(ms, { zone: "utc" }).toFormat("LLL d, yyyy");
}

/** Seconds -> 14:53, or 1:02:03 once it passes an hour. */
export function formatDuration(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
}

/**
 * Parse a start-time field. Accepts plain seconds ("90"), "M:SS" ("1:30") and "H:MM:SS"
 * ("1:02:03"). Anything unparseable becomes 0 rather than NaN.
 */
export function parseTimeInput(raw: string): number {
  const text = raw.trim();
  if (!text) return 0;
  const parts = text.split(":").map((part) => Number(part.trim()));
  if (parts.length === 0 || parts.some((n) => !Number.isFinite(n) || n < 0)) return 0;
  return Math.max(0, Math.floor(parts.reduce((total, n) => total * 60 + n, 0)));
}
