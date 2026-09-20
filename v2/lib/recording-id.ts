import { canonicalWatchUrl, parseVideoId } from "./youtube";

export { canonicalWatchUrl };

const CPAC_ID = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;

/** Client-safe YouTube id parse (no Node deps). */
export function parseYoutubeId(url: string): string | null {
  return parseVideoId(url);
}

/** CPAC episode UUID from `?id=`. */
export function parseCpacId(url: string): string | null {
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    if (!/(^|\.)cpac\.ca$/i.test(parsed.hostname)) return null;
    const id = parsed.searchParams.get("id");
    return id && CPAC_ID.test(id) ? id : null;
  } catch {
    return null;
  }
}

/** The id a recording is filed under, whichever source it came from. */
export function parseRecordingId(url: string): string | null {
  return parseYoutubeId(url) ?? parseCpacId(url);
}
