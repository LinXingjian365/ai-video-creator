import { describe, expect, it } from "vitest";
import {
  buildConfigSnapshot,
  isAllowedLocalConfigReadRequest,
  isAllowedLocalConfigRequest,
  updateDotEnvContent
} from "./local-config";

describe("local config", () => {
  it("never exposes secret values in the snapshot", () => {
    const snapshot = buildConfigSnapshot({
      LLM_PROVIDER: "deepseek",
      DEEPSEEK_API_KEY: "sk-super-secret",
      DEEPSEEK_MODEL: "deepseek-chat"
    });

    const key = snapshot.groups.flatMap((group) => group.fields).find((field) => field.key === "DEEPSEEK_API_KEY");
    const model = snapshot.groups.flatMap((group) => group.fields).find((field) => field.key === "DEEPSEEK_MODEL");

    expect(key).toMatchObject({ configured: true, secret: true });
    expect(key).not.toHaveProperty("value");
    expect(model).toMatchObject({ configured: true, value: "deepseek-chat" });
    expect(JSON.stringify(snapshot)).not.toContain("sk-super-secret");
  });

  it("updates known keys, preserves comments and quotes dotenv values safely", () => {
    const original = "# local settings\nLLM_PROVIDER=openai\nUNRELATED=keep-me\n";
    const result = updateDotEnvContent(original, {
      LLM_PROVIDER: "deepseek",
      DEEPSEEK_MODEL: "model with spaces #1"
    });

    expect(result).toContain("# local settings");
    expect(result).toContain("LLM_PROVIDER=deepseek");
    expect(result).toContain("UNRELATED=keep-me");
    expect(result).toContain('DEEPSEEK_MODEL="model with spaces #1"');
  });

  it("escapes dollar signs so Next dotenv expansion cannot alter a saved value", () => {
    const result = updateDotEnvContent("", { DEEPSEEK_API_KEY: "price$token" });
    expect(result).toContain('DEEPSEEK_API_KEY="price\\$token"');
  });

  it("rejects non-loopback or cross-origin config writes", () => {
    expect(isAllowedLocalConfigRequest({ host: "127.0.0.1:5182", origin: "http://127.0.0.1:5182" })).toBe(true);
    expect(isAllowedLocalConfigRequest({ host: "localhost:5182", origin: "http://localhost:5182" })).toBe(true);
    expect(isAllowedLocalConfigRequest({ host: "192.168.1.20:5182", origin: "http://192.168.1.20:5182" })).toBe(false);
    expect(isAllowedLocalConfigRequest({ host: "127.0.0.1:5182", origin: "https://evil.example" })).toBe(false);
  });

  it("allows loopback read probes without an origin header", () => {
    expect(isAllowedLocalConfigReadRequest({ host: "127.0.0.1:5182", origin: null })).toBe(true);
    expect(isAllowedLocalConfigReadRequest({ host: "localhost:5182", origin: "http://localhost:5182" })).toBe(true);
    expect(isAllowedLocalConfigReadRequest({ host: "192.168.1.20:5182", origin: null })).toBe(false);
    expect(isAllowedLocalConfigReadRequest({ host: "127.0.0.1:5182", origin: "https://evil.example" })).toBe(false);
  });
});
