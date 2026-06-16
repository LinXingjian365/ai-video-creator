import fs from "node:fs/promises";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import ffprobeInstaller from "@ffprobe-installer/ffprobe";
import { NextResponse } from "next/server";
import { draftsRoot, inputRoot, outputRoot } from "@/lib/paths";

export const runtime = "nodejs";

export async function GET() {
  const checks = await Promise.all([
    fileExists("FFmpeg binary", ffmpegInstaller.path),
    fileExists("FFprobe binary", ffprobeInstaller.path),
    directoryAccess("workspace/input readable", inputRoot, "read"),
    directoryAccess("workspace/output writable", outputRoot, "write"),
    directoryAccess("workspace/drafts writable", draftsRoot, "write")
  ]);

  return NextResponse.json({
    nodeVersion: process.version,
    platform: process.platform,
    cwd: process.cwd(),
    checks,
    help: [
      "Prefer absolute paths. On Windows, use forward slashes or escaped double backslashes.",
      "Input files must be readable and output directories must be writable.",
      "For large files, lower quality, split into segments, or use an SSD workspace.",
      "The bundled FFmpeg is installed through @ffmpeg-installer/ffmpeg."
    ]
  });
}

async function fileExists(label: string, targetPath: string) {
  try {
    await fs.access(targetPath);
    return { label, ok: true, path: targetPath };
  } catch (error) {
    return { label, ok: false, path: targetPath, error: error instanceof Error ? error.message : String(error) };
  }
}

async function directoryAccess(label: string, targetPath: string, mode: "read" | "write") {
  try {
    await fs.mkdir(targetPath, { recursive: true });
    if (mode === "write") {
      const probe = `${targetPath}/.write-test`;
      await fs.writeFile(probe, "ok", "utf8");
      await fs.unlink(probe);
    } else {
      await fs.readdir(targetPath);
    }
    return { label, ok: true, path: targetPath };
  } catch (error) {
    return { label, ok: false, path: targetPath, error: error instanceof Error ? error.message : String(error) };
  }
}
