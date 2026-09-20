/**
 * The AI badge: a screen showing a "% AI" number and a ring of LEDs, reachable
 * over plain HTTP on the local network (see badge_docs.md). Nothing here is
 * allowed to break a recording — the badge is on event WiFi, it reboots, its
 * IP moves — so every call swallows its own failure and only logs.
 */

export type LedState =
  | "off"
  | "yellow"
  | "green"
  | "red"
  | "flash_red"
  | "flash_green";

/** At or above this percentage the chunk reads as machine-written. */
export const BADGE_AI_THRESHOLD = 50;

/** How long a verdict stays on the badge before it goes back to idle. */
export const BADGE_HOLD_MS = 5_000;

/** What the badge shows when it is waiting for the next chunk. */
const IDLE_SCORE = -1;
const IDLE_LED: LedState = "yellow";

/** Badge is on the LAN and may simply be gone; fail fast rather than hang. */
const TIMEOUT_MS = 2_000;

/**
 * The badge's address. Set `BADGE_URL` in .env when the IP moves — it is shown
 * at the bottom of the badge screen. A bare host or `host:port` is fine.
 */
function baseUrl(): string | null {
  const raw = process.env.BADGE_URL?.trim();
  if (!raw) return null;
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
  return withScheme.replace(/\/+$/, "");
}

async function post(path: string, body: Record<string, unknown>): Promise<void> {
  const base = baseUrl();
  // No BADGE_URL configured: the badge is simply not part of this run.
  if (!base) return;
  try {
    const res = await fetch(`${base}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) {
      console.warn(`badge ${path} ${res.status}: ${await res.text()}`);
    }
  } catch (err) {
    console.warn(`badge ${path} unreachable:`, err instanceof Error ? err.message : err);
  }
}

export function setScore(score: number): Promise<void> {
  return post("/api/score", { score });
}

export function setLed(state: LedState): Promise<void> {
  return post("/api/led", { state });
}

/**
 * Pending return-to-idle. Held at module scope so the next chunk cancels it:
 * without that, a chunk landing 4s after the last one would be wiped off the
 * screen a second later by the previous chunk's reset.
 */
let idleTimer: ReturnType<typeof setTimeout> | null = null;

/** Back to waiting: no number, yellow ring. */
export async function resetBadge(): Promise<void> {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  // Sequential, not parallel: the badge is a tiny embedded web server and
  // two sockets at once is a good way to make it stop answering.
  await setScore(IDLE_SCORE);
  await setLed(IDLE_LED);
}

/**
 * Show one chunk's verdict: the percentage on the screen, red flashing at 50%
 * or above and green flashing below it, then back to idle after the hold.
 *
 * Resolves once the badge has the verdict; the reset runs on its own timer so
 * the caller is not held for five seconds.
 */
export async function showChunk(aiPercent: number): Promise<void> {
  const score = Math.max(0, Math.min(100, Math.round(aiPercent)));
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  await setScore(score);
  await setLed(score >= BADGE_AI_THRESHOLD ? "flash_red" : "flash_green");
  idleTimer = setTimeout(() => {
    idleTimer = null;
    void resetBadge();
  }, BADGE_HOLD_MS);
}
