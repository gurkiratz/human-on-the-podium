import { listProjects } from "@/lib/projects";

export const runtime = "nodejs";

export async function GET() {
  try {
    return Response.json({ items: await listProjects() });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to read projects." },
      { status: 500 },
    );
  }
}
