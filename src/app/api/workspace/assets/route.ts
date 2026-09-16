import { NextResponse } from "next/server";
import { listWorkspaceAssets } from "@/lib/workspace-assets";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Number(searchParams.get("limit") ?? 120);
  const index = await listWorkspaceAssets(Number.isFinite(limit) ? limit : 120);
  return NextResponse.json(index);
}
