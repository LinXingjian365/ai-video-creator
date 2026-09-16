import { createLLMClient, type LLMClient } from "@/lib/llm/client";

type Env = Record<string, string | undefined>;

export interface ConfigProbeResult {
  ok: boolean;
  provider: string;
  detail: string;
}

export async function probeLlmConfiguration(
  env: Env = process.env,
  deps: { createClient?: (env: Env) => LLMClient } = {}
): Promise<ConfigProbeResult> {
  const provider = (env.LLM_PROVIDER ?? "deepseek").toLowerCase();
  try {
    const client = (deps.createClient ?? ((current) => createLLMClient(current)))(env);
    const answer = await client.complete({
      system: "You are a connectivity probe. Follow the user instruction exactly.",
      prompt: "Reply with only OK."
    });
    if (!answer.trim()) throw new Error("empty");
    return { ok: true, provider, detail: "模型连接与最小生成测试通过。" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const status = message.match(/HTTP\s+(\d{3})/i)?.[1];
    return {
      ok: false,
      provider,
      detail: status
        ? `模型连接失败（HTTP ${status}）。请检查 Key、Base URL 与模型名。`
        : "模型连接失败。请检查当前提供方所需的 Key、Base URL 与模型名。"
    };
  }
}
