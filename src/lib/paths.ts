import fs from "node:fs";
import path from "node:path";

export const projectRoot = process.cwd();
export const workspaceRoot = path.join(projectRoot, "workspace");
export const inputRoot = path.join(workspaceRoot, "input");
export const outputRoot = path.join(workspaceRoot, "output");
export const draftsRoot = path.join(workspaceRoot, "drafts");

export class PathValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PathValidationError";
  }
}

export function resolveLocalPath(value: string) {
  if (!value.trim()) {
    throw new PathValidationError("Path is required.");
  }

  return path.isAbsolute(value) ? path.normalize(value) : path.join(projectRoot, value);
}

export function assertInputFile(absolutePath: string) {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(absolutePath);
  } catch {
    throw new PathValidationError(`Input file not found: ${absolutePath}`);
  }
  if (!stat.isFile()) {
    throw new PathValidationError(`Input path is not a file: ${absolutePath}`);
  }
}

export function ensureOutputDir(absoluteFilePath: string) {
  fs.mkdirSync(path.dirname(absoluteFilePath), { recursive: true });
}

export function ensureDir(absoluteDirPath: string) {
  fs.mkdirSync(absoluteDirPath, { recursive: true });
}

export function defaultOutputPath(fileName: string) {
  return path.join(outputRoot, fileName);
}

export function defaultDraftPath(fileName: string) {
  return path.join(draftsRoot, fileName);
}
