import { scoreChunk } from "@/lib/gptzero";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { text?: string; index?: number };
    const text = body.text?.trim();
    if (!text) {
      return Response.json({ error: "Empty document" }, { status: 400 });
    }
    // The API rejects documents over 50000 characters.
    if (text.length > 50_000) {
      return Response.json({ error: "Document too long" }, { status: 400 });
    }
    const detection = await scoreChunk(text, body.index ?? 0);
    return Response.json(detection);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 502 },
    );
  }
}
