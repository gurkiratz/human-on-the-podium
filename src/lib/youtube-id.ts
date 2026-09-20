const CPAC_ID = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;

/** Client-safe YouTube ID parse (no Node deps). */
export function parseYoutubeId(url: string): string | null {
  try {
    const u = new URL(url.trim());
    if (u.hostname === "youtu.be") {
      return u.pathname.slice(1).split("/")[0] || null;
    }
    if (u.hostname.includes("youtube.com")) {
      const v = u.searchParams.get("v");
      if (v) return v;
      const parts = u.pathname.split("/").filter(Boolean);
      if (
        parts[0] === "shorts" ||
        parts[0] === "live" ||
        parts[0] === "embed"
      ) {
        return parts[1] ?? null;
      }
    }
  } catch {
    return null;
  }
  return null;
}

/** CPAC episode UUID from `?id=`. */
export function parseCpacId(url: string): string | null {
  try {
    const u = new URL(url.trim());
    if (!/(^|\.)cpac\.ca$/i.test(u.hostname)) return null;
    const id = u.searchParams.get("id");
    return id && CPAC_ID.test(id) ? id : null;
  } catch {
    return null;
  }
}

/** The id a recording is filed under, whichever source it came from. */
export function parseRecordingId(url: string): string | null {
  return parseYoutubeId(url) ?? parseCpacId(url);
}
