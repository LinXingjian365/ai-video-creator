import type { TrendSource } from "../types";

// 抖音没有官方公开的热榜 API。要拿真实数据需第三方数据服务(如 TikHub)。
// 当前未配置对应 key 时诚实降级,直接报错而不是返回伪造数据。
export const douyinSource: TrendSource = {
  platform: "douyin",
  async fetchTrends() {
    throw new Error(
      "抖音热榜没有官方公开 API,需要第三方数据服务(如 TikHub)。配置 TIKHUB_API_KEY 后可在此接入真实抓取;当前未配置,诚实降级,不返回假数据。"
    );
  }
};
