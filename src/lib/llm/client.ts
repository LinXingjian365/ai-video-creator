export interface LLMClient {
  complete(opts: { system?: string; prompt: string }): Promise<string>;
}

type Env = Record<string, string | undefined>;

function openAiClient(env: Env, fetchImpl: typeof fetch): LLMClient {
  const key = env.OPENAI_API_KEY;
  if (!key) throw new Error("缺少 OPENAI_API_KEY");
  const base = (env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "");
  const model = env.OPENAI_MODEL ?? "gpt-4o-mini";
  return {
    async complete({ system, prompt }) {
      const messages = [
        ...(system ? [{ role: "system", content: system }] : []),
        { role: "user", content: prompt },
      ];
      const res = await fetchImpl(`${base}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model, messages, temperature: 0.7 }),
      });
      if (!res.ok) throw new Error(`LLM HTTP ${res.status}`);
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error("LLM 返回为空");
      return content;
    },
  };
}

function anthropicClient(env: Env, fetchImpl: typeof fetch): LLMClient {
  const key = env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("缺少 ANTHROPIC_API_KEY");
  const base = (env.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com").replace(/\/$/, "");
  const model = env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";
  return {
    async complete({ system, prompt }) {
      const res = await fetchImpl(`${base}/v1/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model, max_tokens: 4096,
          ...(system ? { system } : {}),
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (!res.ok) throw new Error(`LLM HTTP ${res.status}`);
      const data = (await res.json()) as { content?: { text?: string }[] };
      const text = data.content?.[0]?.text;
      if (!text) throw new Error("LLM 返回为空");
      return text;
    },
  };
}

export function createLLMClient(env: Env = process.env, fetchImpl: typeof fetch = fetch): LLMClient {
  const provider = (env.LLM_PROVIDER ?? "openai").toLowerCase();
  return provider === "anthropic" ? anthropicClient(env, fetchImpl) : openAiClient(env, fetchImpl);
}

// 无可用配置时返回 null, 由上层降级
export function tryCreateLLMClient(env: Env = process.env): LLMClient | null {
  try {
    const provider = (env.LLM_PROVIDER ?? "openai").toLowerCase();
    if (provider === "anthropic" ? !env.ANTHROPIC_API_KEY : !env.OPENAI_API_KEY) return null;
    return createLLMClient(env);
  } catch {
    return null;
  }
}
