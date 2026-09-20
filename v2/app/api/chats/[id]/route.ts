import { getChat, saveChat } from "@/lib/history";

export const runtime = "nodejs";

/** A chat blob is a conversation plus (optionally) a full transcript; cap what we accept. */
const MAX_BODY_BYTES = 25 * 1024 * 1024;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const session = await getChat(id);
    if (!session) {
      return Response.json({ error: "Conversation not found." }, { status: 404 });
    }
    return Response.json(session);
  } catch {
    return Response.json({ error: "Could not load that conversation." }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return Response.json({ error: "That conversation is too large to save." }, { status: 413 });
  }
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const summary = await saveChat({
      id,
      messages: (body.messages as never) ?? [],
      proposal: (body.proposal as never) ?? null,
      browserSessionId: (body.browserSessionId as string | null) ?? null,
      transcript: (body.transcript as never) ?? null,
      stats: (body.stats as never) ?? null,
      primarySpeaker: (body.primarySpeaker as string | null) ?? null,
    });
    return Response.json(summary);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to save chat." },
      { status: 400 },
    );
  }
}
