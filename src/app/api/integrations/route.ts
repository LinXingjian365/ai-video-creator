import { NextResponse } from "next/server";
import { integrationCatalog } from "@/lib/integrations";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    integrations: integrationCatalog,
    recommendedNext: [
      "Keep FFmpeg Core as the default local renderer.",
      "Add Whisper transcript import before true automatic scoring.",
      "Use PySceneDetect and Auto-Editor as optional analyzers.",
      "Use Remotion for second-stage graphics and captions.",
      "Use JianYing MCP for editable draft export."
    ]
  });
}
