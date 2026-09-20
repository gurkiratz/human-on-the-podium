import {
  deleteLiveSession,
  getLiveSession,
  saveLiveSession,
  type LiveThread,
} from "@/lib/live";
import { DEFAULT_PREFS, type LivePrefs } from "@/lib/live-prefs";

export const runtime = "nodejs";

/** A live session blob holds every thread and detection; cap what we accept. */
const MAX_BODY_BYTES = 25 * 1024 * 1024;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await getLiveSession(id);
  if (!session) {
    return Response.json({ error: "Session not found." }, { status: 404 });
  }
  return Response.json(session);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return Response.json({ error: "That session is too large to save." }, { status: 413 });
  }
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const threads = (body.threads as LiveThread[] | undefined) ?? [];
    const summary = await saveLiveSession({
      id,
      title: (body.title as string) || "Live session",
      status: body.status === "ended" ? "ended" : "active",
      voiceId: (body.voiceId as string | null) ?? null,
      prefs: (body.prefs as LivePrefs) ?? DEFAULT_PREFS,
      threads,
      endedAt: (body.endedAt as string | null) ?? null,
    });
    return Response.json(summary);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to save session." },
      { status: 400 },
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const removed = await deleteLiveSession(id);
  if (!removed) {
    return Response.json({ error: "Session not found." }, { status: 404 });
  }
  return Response.json({ ok: true });
}
