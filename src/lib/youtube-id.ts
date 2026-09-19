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
