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
