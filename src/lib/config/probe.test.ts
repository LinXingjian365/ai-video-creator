import { describe, expect, it, vi } from "vitest";
import { probeLlmConfiguration } from "./probe";

describe("probeLlmConfiguration", () => {
  it("performs a minimal completion and returns no secret material", async () => {
    const complete = vi.fn().mockResolvedValue("OK");
    const result = await probeLlmConfiguration(
      { LLM_PROVIDER: "deepseek", DEEPSEEK_API_KEY: "sk-private" },
      { createClient: () => ({ complete }) }
    );

    expect(result).toEqual({ ok: true, provider: "deepseek", detail: "模型连接与最小生成测试通过。" });
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({ prompt: expect.stringContaining("OK") }));
    expect(JSON.stringify(result)).not.toContain("sk-private");
  });

  it("returns a sanitized failure without leaking the upstream body", async () => {
    const result = await probeLlmConfiguration(
      { LLM_PROVIDER: "deepseek", DEEPSEEK_API_KEY: "sk-private" },
      { createClient: () => ({ complete: vi.fn().mockRejectedValue(new Error("LLM HTTP 401 sk-private")) }) }
    );

    expect(result).toEqual({ ok: false, provider: "deepseek", detail: "模型连接失败（HTTP 401）。请检查 Key、Base URL 与模型名。" });
    expect(JSON.stringify(result)).not.toContain("sk-private");
  });
});
