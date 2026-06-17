export interface LLMClient {
  complete(opts: { system?: string; prompt: string }): Promise<string>;
}

type Env = Record<string, string | undefined>;
type OpenAICompatibleProvider = "openai" | "deepseek" | "doubao-ark" | "gpt-gateway";

function requestTimeout(env: Env) {
  return Number(env.LLM_TIMEOUT_MS ?? 45000);
}

function openAiCompatibleClient(
  env: Env,
  fetchImpl: typeof fetch,
  config: {
    provider: OpenAICompatibleProvider;
    keyName: string;
    baseUrlName: string;
    modelName: string;
    defaultBaseUrl: string;
    defaultModel: string;
  }
): LLMClient {
  const key = env[config.keyName];
  if (!key) {
    throw new Error(`Missing ${config.keyName}`);
  }

  const base = (env[config.baseUrlName] ?? config.defaultBaseUrl).replace(/\/$/, "");
  const model = env[config.modelName] ?? config.defaultModel;

  return {
    async complete({ system, prompt }) {
      const messages = [
        ...(system ? [{ role: "system", content: system }] : []),
        { role: "user", content: prompt }
      ];
      const response = await fetchImpl(`${base}/chat/completions`, {
        method: "POST",
        signal: AbortSignal.timeout(requestTimeout(env)),
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.7,
          ...(config.provider === "deepseek" && env.DEEPSEEK_THINKING === "enabled"
            ? { thinking: { type: "enabled" }, reasoning_effort: env.DEEPSEEK_REASONING_EFFORT ?? "medium" }
            : {})
        })
      });

      if (!response.ok) {
        throw new Error(`LLM HTTP ${response.status}`);
      }

      const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error("LLM returned empty content");
      }

      return content;
    }
  };
}

function openAiClient(env: Env, fetchImpl: typeof fetch): LLMClient {
  return openAiCompatibleClient(env, fetchImpl, {
    provider: "openai",
    keyName: "OPENAI_API_KEY",
    baseUrlName: "OPENAI_BASE_URL",
    modelName: "OPENAI_MODEL",
    defaultBaseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini"
  });
}

function deepSeekClient(env: Env, fetchImpl: typeof fetch): LLMClient {
  return openAiCompatibleClient(env, fetchImpl, {
    provider: "deepseek",
    keyName: "DEEPSEEK_API_KEY",
    baseUrlName: "DEEPSEEK_BASE_URL",
    modelName: "DEEPSEEK_MODEL",
    defaultBaseUrl: "https://api.deepseek.com",
    defaultModel: "deepseek-v4-flash"
  });
}

function doubaoArkClient(env: Env, fetchImpl: typeof fetch): LLMClient {
  return openAiCompatibleClient(env, fetchImpl, {
    provider: "doubao-ark",
    keyName: "ARK_API_KEY",
    baseUrlName: "ARK_BASE_URL",
    modelName: "ARK_MODEL",
    defaultBaseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    defaultModel: "doubao-seed-1-6"
  });
}

function gptGatewayClient(env: Env, fetchImpl: typeof fetch): LLMClient {
  return openAiCompatibleClient(env, fetchImpl, {
    provider: "gpt-gateway",
    keyName: "GPT_GATEWAY_API_KEY",
    baseUrlName: "GPT_GATEWAY_BASE_URL",
    modelName: "GPT_GATEWAY_MODEL",
    defaultBaseUrl: env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
    defaultModel: env.OPENAI_MODEL ?? "gpt-4o-mini"
  });
}

function anthropicClient(env: Env, fetchImpl: typeof fetch): LLMClient {
  const key = env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error("Missing ANTHROPIC_API_KEY");
  }

  const base = (env.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com").replace(/\/$/, "");
  const model = env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

  return {
    async complete({ system, prompt }) {
      const response = await fetchImpl(`${base}/v1/messages`, {
        method: "POST",
        signal: AbortSignal.timeout(requestTimeout(env)),
        headers: {
          "Content-Type": "application/json",
          "x-api-key": key,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model,
          max_tokens: 4096,
          ...(system ? { system } : {}),
          messages: [{ role: "user", content: prompt }]
        })
      });

      if (!response.ok) {
        throw new Error(`LLM HTTP ${response.status}`);
      }

      const data = (await response.json()) as { content?: { text?: string }[] };
      const text = data.content?.[0]?.text;
      if (!text) {
        throw new Error("LLM returned empty content");
      }

      return text;
    }
  };
}

export function createLLMClient(env: Env = process.env, fetchImpl: typeof fetch = fetch): LLMClient {
  const provider = (env.LLM_PROVIDER ?? "deepseek").toLowerCase();
  if (provider === "deepseek") {
    return deepSeekClient(env, fetchImpl);
  }
  if (provider === "anthropic" || provider === "claude-gateway") {
    return anthropicClient(env, fetchImpl);
  }
  if (provider === "doubao-ark" || provider === "ark") {
    return doubaoArkClient(env, fetchImpl);
  }
  if (provider === "gpt-gateway") {
    return gptGatewayClient(env, fetchImpl);
  }
  return openAiClient(env, fetchImpl);
}

export function tryCreateLLMClient(env: Env = process.env): LLMClient | null {
  try {
    return createLLMClient(env);
  } catch {
    return null;
  }
}
