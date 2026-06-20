import { NextRequest, NextResponse } from "next/server";
import {
  buildConfigSnapshot,
  isAllowedLocalConfigRequest,
  LOCAL_CONFIG_CONFIRM_TEXT,
  validateConfigUpdates,
  writeLocalConfig
} from "@/lib/config/local-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(buildConfigSnapshot());
}

export async function POST(request: NextRequest) {
  if (!isAllowedLocalConfigRequest({
    host: request.headers.get("host"),
    origin: request.headers.get("origin")
  })) {
    return NextResponse.json({ error: "配置写入仅允许本机同源页面调用。" }, { status: 403 });
  }

  let updates: Record<string, string>;
  try {
    const body = await request.json() as { confirm?: string; values?: unknown };
    if (body.confirm !== LOCAL_CONFIG_CONFIRM_TEXT) {
      return NextResponse.json({ error: "缺少本机配置写入确认。" }, { status: 400 });
    }
    updates = validateConfigUpdates(body.values);
  } catch (error) {
    const message = error instanceof Error ? error.message : "配置请求无效。";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    await writeLocalConfig(updates);
    return NextResponse.json({
      success: true,
      updatedKeys: Object.keys(updates),
      snapshot: buildConfigSnapshot()
    });
  } catch {
    return NextResponse.json({ error: "配置文件写入失败，请检查 .env.local 的文件权限。" }, { status: 500 });
  }
}
