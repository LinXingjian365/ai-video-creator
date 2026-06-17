import fs from "node:fs";

export const DEFAULT_VIDEO_TOOLS_PYTHON = "C:/Users/Administrator/.conda/envs/py312/python.exe";

export function getVideoToolsPython(env: Record<string, string | undefined> = process.env): string {
  const configured = env.VIDEO_TOOLS_PYTHON || env.JIANYING_PYTHON;
  if (configured) {
    return configured;
  }

  return fs.existsSync(DEFAULT_VIDEO_TOOLS_PYTHON) ? DEFAULT_VIDEO_TOOLS_PYTHON : "python";
}

export function pythonModuleInvocation(
  moduleName: string,
  args: string[] = [],
  env: Record<string, string | undefined> = process.env
) {
  return {
    command: getVideoToolsPython(env),
    args: ["-m", moduleName, ...args],
    label: `${getVideoToolsPython(env)} -m ${moduleName}`
  };
}
