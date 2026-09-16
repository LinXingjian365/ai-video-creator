// 统一的「带目标说明」的 fetch 包装。
//
// 背景:Node 的 fetch 在连不上时只抛一句 "fetch failed"(TypeError),
// 真实原因藏在 error.cause 里。直接冒泡到任务日志/UI 就成了没头没尾的
// "fetch failed",排查时看不出连的是谁、为什么、该怎么办。
//
// 这个包装把目标地址、真实原因、超时信息和调用方给的修复提示拼成一句
// 可直接行动的错误,供所有外部数据源复用。

export interface FetchTargetOptions {
  /** 目标服务名,如 "TikTokDownloader" / "TikHub" / "KS-Downloader" */
  service: string;
  /** 请求 URL(会进错误信息,便于照抄排查) */
  url: string;
  /** 超时毫秒数,用于超时文案 */
  timeoutMs?: number;
  /** 修复提示,例如启动命令或退路 */
  hint?: string;
  /** 自定义 fetch(测试注入) */
  fetchImpl?: typeof fetch;
}

export function explainFetchError(error: unknown, options: Pick<FetchTargetOptions, "service" | "url" | "timeoutMs">): Error {
  const detail =
    error instanceof Error
      ? ((error.cause as { message?: string } | undefined)?.message ?? error.message)
      : String(error);
  const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
  const timeoutPart =
    timedOut && options.timeoutMs ? `,请求超时(${options.timeoutMs}ms)` : timedOut ? ",请求超时" : "";
  return new Error(`无法连接 ${options.service}(${options.url})${timeoutPart}:${detail}。`);
}

/**
 * 发起请求;网络层失败时抛出带目标地址与原因的 Error。
 * HTTP 非 2xx 不算网络失败,由调用方按自己的格式处理(保留各源原有文案)。
 */
export async function fetchWithTarget(
  options: FetchTargetOptions,
  init?: RequestInit
): Promise<Response> {
  const doFetch = options.fetchImpl ?? fetch;
  try {
    return await doFetch(options.url, init);
  } catch (error) {
    const explained = explainFetchError(error, options);
    if (options.hint) {
      explained.message += ` ${options.hint}`;
    }
    throw explained;
  }
}
