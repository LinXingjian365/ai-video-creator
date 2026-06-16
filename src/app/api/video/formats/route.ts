import { NextResponse } from "next/server";
import { supportedFormats } from "@/lib/formats";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ formats: supportedFormats });
}
