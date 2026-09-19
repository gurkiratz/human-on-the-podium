import { listYoutubeScores } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  try {
    return Response.json({ results: listYoutubeScores(50) });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
