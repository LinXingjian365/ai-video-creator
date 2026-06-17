import fs from "node:fs/promises";
import path from "node:path";
import { projectRoot, workspaceRoot } from "@/lib/paths";

export type WorkspaceAssetKind =
  | "video"
  | "audio"
  | "image"
  | "subtitle"
  | "manifest"
  | "material-analysis"
  | "jianying-plan"
  | "auto-plan"
  | "task-state"
  | "other-json"
  | "other";

export type WorkspaceAssetRole = "input" | "output" | "draft" | "workspace";

export interface WorkspaceAsset {
  id: string;
  kind: WorkspaceAssetKind;
  role: WorkspaceAssetRole;
  fileName: string;
  extension: string;
  relativePath: string;
  absolutePath: string;
  sizeBytes: number;
  updatedAt: string;
}

export interface WorkspaceAssetIndex {
  root: string;
  generatedAt: string;
  total: number;
  counts: Record<WorkspaceAssetKind, number>;
  assets: WorkspaceAsset[];
}

const videoExtensions = new Set([".mp4", ".mov", ".mkv", ".webm", ".avi", ".flv", ".wmv", ".m4v"]);
const audioExtensions = new Set([".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg"]);
const imageExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"]);
const subtitleExtensions = new Set([".srt", ".vtt", ".ass", ".ssa", ".ttml"]);
const defaultCounts: Record<WorkspaceAssetKind, number> = {
  video: 0,
  audio: 0,
  image: 0,
  subtitle: 0,
  manifest: 0,
  "material-analysis": 0,
  "jianying-plan": 0,
  "auto-plan": 0,
  "task-state": 0,
  "other-json": 0,
  other: 0
};

export async function listWorkspaceAssets(limit = 120): Promise<WorkspaceAssetIndex> {
  const assets: WorkspaceAsset[] = [];
  await walkWorkspace(workspaceRoot, assets);

  const sorted = assets
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, Math.max(1, Math.min(limit, 500)));
  const counts = { ...defaultCounts };
  for (const asset of assets) {
    counts[asset.kind] += 1;
  }

  return {
    root: workspaceRoot,
    generatedAt: new Date().toISOString(),
    total: assets.length,
    counts,
    assets: sorted
  };
}

export function classifyWorkspaceAsset(fileName: string): WorkspaceAssetKind {
  const extension = path.extname(fileName).toLowerCase();
  const lower = fileName.toLowerCase();

  if (lower === "manifest.json") {
    return "manifest";
  }
  if (/^material-analysis-.+\.json$/i.test(fileName)) {
    return "material-analysis";
  }
  if (/-jianying-plan\.json$/i.test(fileName)) {
    return "jianying-plan";
  }
  if (/-auto-plan\.json$/i.test(fileName)) {
    return "auto-plan";
  }
  if (lower === "tasks-state.json") {
    return "task-state";
  }
  if (videoExtensions.has(extension)) {
    return "video";
  }
  if (audioExtensions.has(extension)) {
    return "audio";
  }
  if (imageExtensions.has(extension)) {
    return "image";
  }
  if (subtitleExtensions.has(extension)) {
    return "subtitle";
  }
  if (extension === ".json") {
    return "other-json";
  }
  return "other";
}

function inferRole(relativePath: string): WorkspaceAssetRole {
  const normalized = relativePath.replace(/\\/g, "/");
  if (normalized.startsWith("workspace/input/")) {
    return "input";
  }
  if (normalized.startsWith("workspace/output/")) {
    return "output";
  }
  if (normalized.startsWith("workspace/drafts/")) {
    return "draft";
  }
  return "workspace";
}

async function walkWorkspace(dir: string, assets: WorkspaceAsset[]) {
  let entries: Array<import("node:fs").Dirent>;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const absolutePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") {
        continue;
      }
      await walkWorkspace(absolutePath, assets);
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }

    const stat = await fs.stat(absolutePath);
    const relativePath = path.relative(projectRoot, absolutePath).replace(/\\/g, "/");
    assets.push({
      id: relativePath,
      kind: classifyWorkspaceAsset(entry.name),
      role: inferRole(relativePath),
      fileName: entry.name,
      extension: path.extname(entry.name).toLowerCase(),
      relativePath,
      absolutePath,
      sizeBytes: stat.size,
      updatedAt: stat.mtime.toISOString()
    });
  }
}
