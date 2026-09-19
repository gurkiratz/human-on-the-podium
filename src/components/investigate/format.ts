export function formatClock(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export function formatWhen(ms: number) {
  const d = new Date(ms);
  const day = d.getUTCDate();
  const mo = MONTHS[d.getUTCMonth()];
  const year = d.getUTCFullYear();
  const hh = d.getUTCHours().toString().padStart(2, "0");
  const mm = d.getUTCMinutes().toString().padStart(2, "0");
  return `${day} ${mo} ${year} ${hh}:${mm} UTC`;
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
