import { reviewStats } from "@/lib/claims-store";
import { isBoardDimension, listLeaderboard } from "@/lib/reports";

export const runtime = "nodejs";

/**
 * Ranked groups for one dimension, plus the trend over time, the most AI-like speeches, and the
 * tally of how humans have ruled on the automated matches.
 */
export async function GET(request: Request) {
  const requested = new URL(request.url).searchParams.get("dimension");
  const dimension = isBoardDimension(requested) ? requested : "source";

  try {
    const [board, reviews] = await Promise.all([listLeaderboard(dimension), reviewStats()]);
    return Response.json({ ...board, reviews });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to read the leaderboard." },
      { status: 500 },
    );
  }
}
