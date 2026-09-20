import { listYoutubeScores } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  try {
    // High enough that the sidebar and the already-analyzed check see the
    // whole archive; a bulk doc import pushed the videos past the old 50.
    return Response.json({ results: listYoutubeScores(500) });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
