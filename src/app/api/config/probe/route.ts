import { NextRequest, NextResponse } from "next/server";
import { isAllowedLocalConfigRequest } from "@/lib/config/local-config";
import { probeLlmConfiguration } from "@/lib/config/probe";

const PROBE_CONFIRM_TEXT = "CONFIRM_PROVIDER_PROBE";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isAllowedLocalConfigRequest({
    host: request.headers.get("host"),
    origin: request.headers.get("origin")
  })) {
    return NextResponse.json({ error: "连接探针仅允许本机同源页面调用。" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({})) as { target?: string; confirm?: string };
  if (body.target !== "llm" || body.confirm !== PROBE_CONFIRM_TEXT) {
    return NextResponse.json({ error: "探针参数或确认口令无效。" }, { status: 400 });
  }

  const result = await probeLlmConfiguration();
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
