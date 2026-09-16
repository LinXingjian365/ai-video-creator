import { describe, expect, it, vi } from "vitest";
import { explainFetchError, fetchWithTarget } from "./fetch-target";

describe("fetchWithTarget", () => {
  it("正常响应时原样返回,不改变调用方行为", async () => {
    const okResponse = new Response("{}", { status: 200 });
    const fetchMock = vi.fn(async () => okResponse);
    const result = await fetchWithTarget(
      { service: "Demo", url: "http://x/y", fetchImpl: fetchMock as unknown as typeof fetch },
      { method: "POST" }
    );
    expect(result).toBe(okResponse);
    expect(fetchMock).toHaveBeenCalledWith("http://x/y", { method: "POST" });
  });

  it("连接失败时带上服务名、目标地址与 cause 里的真实原因", async () => {
    const cause = new Error("connect ECONNREFUSED 127.0.0.1:5555");
    const fetchMock = vi.fn(async () => {
      throw new TypeError("fetch failed", { cause });
    });
    await expect(
      fetchWithTarget(
        { service: "TikTokDownloader", url: "http://127.0.0.1:5555/douyin/hot", fetchImpl: fetchMock as unknown as typeof fetch }
      )
    ).rejects.toThrow(/无法连接 TikTokDownloader\(http:\/\/127\.0\.0\.1:5555\/douyin\/hot\)/);
    await expect(
      fetchWithTarget(
        { service: "TikTokDownloader", url: "http://127.0.0.1:5555/douyin/hot", fetchImpl: fetchMock as unknown as typeof fetch }
      )
    ).rejects.toThrow(/ECONNREFUSED/);
  });

  it("超时错误标注超时与毫秒数", async () => {
    const fetchMock = vi.fn(async () => {
      const error = new Error("aborted");
      error.name = "TimeoutError";
      throw error;
    });
    await expect(
      fetchWithTarget(
        { service: "Demo", url: "http://x", timeoutMs: 4321, fetchImpl: fetchMock as unknown as typeof fetch }
      )
    ).rejects.toThrow(/请求超时\(4321ms\)/);
  });

  it("附加调用方给的修复提示", async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(
      fetchWithTarget(
        {
          service: "TikHub",
          url: "http://x",
          hint: "请检查 TIKHUB_API_KEY。",
          fetchImpl: fetchMock as unknown as typeof fetch
        }
      )
    ).rejects.toThrow(/请检查 TIKHUB_API_KEY。/);
  });

  it("HTTP 非 2xx 不算网络失败,原样返回交给调用方处理", async () => {
    const notFound = new Response("nope", { status: 500 });
    const fetchMock = vi.fn(async () => notFound);
    const result = await fetchWithTarget(
      { service: "Demo", url: "http://x", fetchImpl: fetchMock as unknown as typeof fetch }
    );
    expect(result.status).toBe(500);
  });
});

describe("explainFetchError", () => {
  it("没有 cause 时退回 error.message", () => {
    const error = explainFetchError(new Error("boom"), { service: "S", url: "http://u" });
    expect(error.message).toContain("boom");
    expect(error.message).toContain("无法连接 S(http://u)");
  });

  it("非 Error 入参也能安全处理", () => {
    const error = explainFetchError("string failure", { service: "S", url: "http://u" });
    expect(error.message).toContain("string failure");
  });
});
