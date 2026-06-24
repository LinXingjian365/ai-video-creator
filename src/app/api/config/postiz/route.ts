import { NextRequest, NextResponse } from "next/server";
import { isAllowedLocalConfigReadRequest } from "@/lib/config/local-config";
import { probePostizIntegrations } from "@/lib/config/postiz";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isAllowedLocalConfigReadRequest({
    host: request.headers.get("host"),
    origin: request.headers.get("origin")
  })) {
    return NextResponse.json({ error: "Postiz 渠道探针仅允许本机控制台调用。" }, { status: 403 });
  }

  const result = await probePostizIntegrations();
  return NextResponse.json(result, { status: result.ok ? 200 : result.configured ? 502 : 200 });
}
