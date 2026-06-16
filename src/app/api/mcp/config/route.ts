import path from "node:path";
import { NextResponse } from "next/server";
import { validationErrorResponse } from "@/lib/api";
import { draftsRoot, outputRoot, resolveLocalPath } from "@/lib/paths";
import { mcpConfigSchema } from "@/lib/schemas";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const parsed = mcpConfigSchema.safeParse(await request.json());
  if (!parsed.success) {
    return validationErrorResponse(parsed.error);
  }

  const payload = parsed.data;
  const servers: Record<string, unknown> = {};

  if (payload.jianyingProjectPath) {
    const projectPath = resolveLocalPath(payload.jianyingProjectPath);
    servers["jianying-mcp"] = {
      command: "uv",
      args: [
        "--directory",
        path.join(projectPath, "jianyingdraft"),
        "run",
        "server.py"
      ],
      env: {
        SAVE_PATH: payload.savePath ? resolveLocalPath(payload.savePath) : draftsRoot,
        OUTPUT_PATH: payload.outputPath ? resolveLocalPath(payload.outputPath) : outputRoot
      }
    };
  }

  if (payload.includeVideoClip) {
    servers["video-clip"] = {
      command: "npx",
      args: [`@pickstar-2002/video-clip-mcp@${payload.videoClipVersion}`]
    };
  }

  return NextResponse.json({
    config: { mcpServers: servers },
    notes: [
      "Use absolute paths for JianYing MCP on Windows.",
      "If npx connection closes, try @latest, version 1.2.0, or clear the npx cache.",
      "This project has an internal FFmpeg core, so Video Clip MCP is optional."
    ]
  });
}
