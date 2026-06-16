import { NextResponse } from "next/server";
import { getTask, listTasks } from "@/lib/tasks";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (id) {
    const task = getTask(id);
    if (!task) {
      return NextResponse.json({ error: "Task not found." }, { status: 404 });
    }
    return NextResponse.json({ task });
  }

  return NextResponse.json({ tasks: listTasks() });
}
