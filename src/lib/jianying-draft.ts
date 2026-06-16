import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { projectRoot } from "@/lib/paths";

const SCRIPT_PATH = path.join(projectRoot, "scripts", "gen_jianying_draft.py");

export const jianyingPython =
  process.env.JIANYING_PYTHON ?? "C:/Users/Administrator/.conda/envs/py312/python.exe";
export const jianyingDraftsDir =
  process.env.JIANYING_DRAFTS_DIR ?? "D:/JianyingPro Drafts";

export interface JianyingDraftResult {
  draftName: string;
  draftPath: string;
}

export interface GenerateDraftOptions {
  plan: unknown;
  draftName: string;
  onLog?: (message: string) => void;
}

export async function generateJianyingDraft({
  plan,
  draftName,
  onLog
}: GenerateDraftOptions): Promise<JianyingDraftResult> {
  // 中文（草稿名、素材路径、字幕）全部写进 ASCII 临时路径的 UTF-8 文件，
  // 不经命令行 argv，规避 Windows 下 Node→Python argv 编码丢失。
  const configPath = path.join(os.tmpdir(), `jydraft-${process.pid}-${Date.now()}.json`);
  await fs.writeFile(
    configPath,
    JSON.stringify({ draftsDir: jianyingDraftsDir, draftName, plan }, null, 2),
    "utf8"
  );

  onLog?.(`调用 ${jianyingPython} 生成草稿到 ${jianyingDraftsDir}`);

  try {
    const { stdout, stderr, code } = await runPython([SCRIPT_PATH, configPath]);

    if (code !== 0) {
      throw new Error(`剪映草稿生成失败 (exit ${code}): ${stderr.trim() || stdout.trim()}`);
    }

    const lastLine = stdout.trim().split(/\r?\n/).pop() ?? "";
    let result: JianyingDraftResult;
    try {
      result = JSON.parse(lastLine);
    } catch {
      throw new Error(`无法解析生成脚本输出: ${stdout.trim()}`);
    }

    onLog?.(`草稿已生成: ${result.draftPath}`);
    return result;
  } finally {
    await fs.rm(configPath, { force: true });
  }
}

function runPython(args: string[]) {
  return new Promise<{ stdout: string; stderr: string; code: number }>((resolve, reject) => {
    const child = spawn(jianyingPython, args, {
      env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1" }
    });

    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) => resolve({ stdout, stderr, code: code ?? -1 }));
  });
}

