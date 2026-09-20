import { listLiveSessions } from "@/lib/live";

export const runtime = "nodejs";

export async function GET() {
  try {
    return Response.json({ items: await listLiveSessions() });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to read live sessions." },
      { status: 500 },
    );
  }
}
