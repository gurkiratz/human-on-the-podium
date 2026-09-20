import { listChats } from "@/lib/history";

export const runtime = "nodejs";

export async function GET() {
  try {
    return Response.json({ items: await listChats() });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to read chats." },
      { status: 500 },
    );
  }
}
