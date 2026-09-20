import { resetBadge, showChunk } from "@/lib/badge";

/**
 * Proxy to the AI badge on the local network. The browser cannot POST to it
 * directly — it is plain HTTP with no CORS headers — so the page hands us the
 * chunk's AI share and we talk to the badge from the server.
 *
 * Always answers 200: the badge is decoration, and a page mid-recording must
 * never see an error because a device on the WiFi went away.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      action?: "show" | "reset";
      /** 0..1, as the transcript panel shows it. */
      share?: number;
      /** 0..100, if the caller already has a percentage. */
      percent?: number;
    };

    if (body.action === "reset") {
      await resetBadge();
      return Response.json({ ok: true });
    }

    const percent =
      typeof body.percent === "number"
        ? body.percent
        : typeof body.share === "number"
          ? body.share * 100
          : null;
    if (percent === null || !Number.isFinite(percent)) {
      return Response.json({ ok: false, error: "Missing share" }, { status: 400 });
    }

    await showChunk(percent);
    return Response.json({ ok: true });
  } catch (err) {
    console.warn("badge route:", err instanceof Error ? err.message : err);
    return Response.json({ ok: true });
  }
}
