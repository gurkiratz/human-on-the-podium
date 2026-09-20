import { getLibraryEntry } from "@/lib/library";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const entry = await getLibraryEntry(id);
    if (!entry) {
      return Response.json({ error: "Transcript not found." }, { status: 404 });
    }
    return Response.json(entry);
  } catch {
    return Response.json({ error: "Could not load that transcript." }, { status: 500 });
  }
}
