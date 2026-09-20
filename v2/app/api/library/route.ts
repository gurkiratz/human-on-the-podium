import { listLibrary } from "@/lib/library";

export const runtime = "nodejs";

export async function GET() {
  try {
    return Response.json({ items: await listLibrary() });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to read library." },
      { status: 500 },
    );
  }
}
