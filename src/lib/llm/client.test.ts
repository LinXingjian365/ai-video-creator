import { describe, it, expect, vi } from "vitest";
import { createLLMClient } from "./client";

function fakeFetch(body: unknown) {
  return vi.fn(async (..._args: Parameters<typeof fetch>) => ({ ok: true, status: 200, json: async () => body } as Response));
}

describe("createLLMClient (openai)", () => {
  it("默认 provider=openai, 调 {base}/chat/completions, 取 choices[0].message.content", async () => {
    const fetchMock = fakeFetch({ choices: [{ message: { content: "结果文本" } }] });
    const client = createLLMClient(
      { LLM_PROVIDER: "openai", OPENAI_API_KEY: "k", OPENAI_BASE_URL: "https://gw.test/v1", OPENAI_MODEL: "gpt-5.5" },
      fetchMock as unknown as typeof fetch
    );
    const out = await client.complete({ system: "s", prompt: "p" });
    expect(out).toBe("结果文本");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://gw.test/v1/chat/completions");
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer k" });
  });
  it("缺 key 抛错", () => {
    expect(() => createLLMClient({ LLM_PROVIDER: "openai" }, fetch)).toThrow();
  });
});

describe("createLLMClient (deepseek)", () => {
  it("provider=deepseek 调 DeepSeek OpenAI-compatible chat completions", async () => {
    const fetchMock = fakeFetch({ choices: [{ message: { content: "deepseek结果" } }] });
    const client = createLLMClient(
      {
        LLM_PROVIDER: "deepseek",
        DEEPSEEK_API_KEY: "k",
        DEEPSEEK_BASE_URL: "https://api.deepseek.com",
        DEEPSEEK_MODEL: "deepseek-v4-pro",
        DEEPSEEK_THINKING: "enabled",
        DEEPSEEK_REASONING_EFFORT: "high"
      },
      fetchMock as unknown as typeof fetch
    );
    const out = await client.complete({ system: "s", prompt: "p" });
    expect(out).toBe("deepseek结果");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.deepseek.com/chat/completions");
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body).toMatchObject({
      model: "deepseek-v4-pro",
      thinking: { type: "enabled" },
      reasoning_effort: "high"
    });
  });
});

describe("createLLMClient (future gateways)", () => {
  it("provider=doubao-ark uses Ark OpenAI-compatible env names", async () => {
    const fetchMock = fakeFetch({ choices: [{ message: { content: "ark结果" } }] });
    const client = createLLMClient(
      { LLM_PROVIDER: "doubao-ark", ARK_API_KEY: "k", ARK_BASE_URL: "https://ark.test/api/v3", ARK_MODEL: "doubao-x" },
      fetchMock as unknown as typeof fetch
    );
    await client.complete({ prompt: "p" });
    expect(fetchMock.mock.calls[0][0]).toBe("https://ark.test/api/v3/chat/completions");
  });

  it("provider=gpt-gateway uses named gateway env names", async () => {
    const fetchMock = fakeFetch({ choices: [{ message: { content: "gateway结果" } }] });
    const client = createLLMClient(
      { LLM_PROVIDER: "gpt-gateway", GPT_GATEWAY_API_KEY: "k", GPT_GATEWAY_BASE_URL: "https://gw.test/v1", GPT_GATEWAY_MODEL: "gpt-x" },
      fetchMock as unknown as typeof fetch
    );
    await client.complete({ prompt: "p" });
    expect(fetchMock.mock.calls[0][0]).toBe("https://gw.test/v1/chat/completions");
  });
});

describe("createLLMClient (anthropic)", () => {
  it("provider=anthropic 调 {base}/v1/messages 取 content[0].text", async () => {
    const fetchMock = fakeFetch({ content: [{ text: "claude文本" }] });
    const client = createLLMClient(
      { LLM_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "k", ANTHROPIC_BASE_URL: "https://anthropic.test", ANTHROPIC_MODEL: "claude-x" },
      fetchMock as unknown as typeof fetch
    );
    const out = await client.complete({ system: "s", prompt: "p" });
    expect(out).toBe("claude文本");
    expect(fetchMock.mock.calls[0][0]).toBe("https://anthropic.test/v1/messages");
  });
});
