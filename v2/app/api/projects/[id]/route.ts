import { deleteProject, getProject, renameProject } from "@/lib/projects";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const project = await getProject(id);
    if (!project) {
      return Response.json({ error: "Project not found." }, { status: 404 });
    }
    return Response.json(project);
  } catch {
    return Response.json({ error: "Could not load that project." }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const body = (await request.json()) as { name?: string };
    const project = await renameProject(id, body.name ?? "");
    if (!project) {
      return Response.json({ error: "Project not found." }, { status: 404 });
    }
    return Response.json(project);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to rename project." },
      { status: 400 },
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const removed = await deleteProject(id);
    if (!removed) {
      return Response.json({ error: "Project not found." }, { status: 404 });
    }
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Could not delete that project." }, { status: 500 });
  }
}
