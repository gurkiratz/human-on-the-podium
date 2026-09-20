import { listAlerts } from "@/lib/alerts";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const limit = Number(new URL(request.url).searchParams.get("limit"));
  try {
    return Response.json({ items: await listAlerts(Number.isFinite(limit) ? limit : 20) });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to read alerts." },
      { status: 500 },
    );
  }
}
