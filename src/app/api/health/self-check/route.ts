import { NextResponse } from "next/server";
import { runSelfCheck } from "@/lib/health/self-check";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const report = await runSelfCheck();
  return NextResponse.json(report);
}
