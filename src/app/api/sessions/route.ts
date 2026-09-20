import { listSessions, saveSession } from "@/lib/sessions-db";
import type { Detection } from "@/lib/types";

export const runtime = "nodejs";

/** A session blob carries every analyzed chunk with its sentences; cap it. */
const MAX_BODY_BYTES = 8 * 1024 * 1024;

export async function GET() {
  try {
    return Response.json({ sessions: listSessions() });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const length = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) {
    return Response.json({ error: "That session is too large to save." }, { status: 413 });
  }
  try {
    const body = (await request.json()) as {
      id?: string;
      title?: string;
      detections?: Detection[];
      pendingText?: string;
      wordsSent?: number;
    };
    if (!body.id) {
      return Response.json({ error: "Missing session id" }, { status: 400 });
    }
    const summary = saveSession({
      id: body.id,
      title: body.title,
      detections: body.detections ?? [],
      pendingText: body.pendingText ?? "",
      wordsSent: body.wordsSent ?? 0,
    });
    return Response.json(summary);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Could not save session" },
      { status: 400 },
    );
  }
}
