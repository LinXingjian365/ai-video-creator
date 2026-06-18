import { describe, expect, it, vi } from "vitest";
import {
  computeAnalyticsSignals,
  importAnalyticsSnapshot,
  recommendNextActions,
  type AnalyticsLedger
} from "@/lib/analytics/ledger";

describe("analytics ledger", () => {
  it("computes engagement and conversion signals", () => {
    expect(computeAnalyticsSignals({
      views: 1000,
      likes: 80,
      comments: 10,
      shares: 20,
      favorites: 15,
      followersDelta: 5
    })).toEqual({
      engagementRate: 0.125,
      shareRate: 0.02,
      commentRate: 0.01,
      followerConversionRate: 0.005
    });
  });

  it("recommends title or cover changes when 30m views are low", () => {
    const signals = computeAnalyticsSignals({ views: 120, likes: 2, comments: 0, shares: 0 });
    expect(recommendNextActions({ window: "30m", metrics: { views: 120, likes: 2, comments: 0, shares: 0 }, signals })[0])
      .toContain("前30分钟曝光偏低");
  });

  it("imports snapshots into the ledger", async () => {
    let ledger: AnalyticsLedger = { schema: "ai-video-assistant.analytics-ledger.v1", updatedAt: "", snapshots: [] };
    const snapshot = await importAnalyticsSnapshot(
      {
        platform: "douyin",
        postId: "p1",
        title: "标题",
        window: "24h",
        metrics: { views: 2000, likes: 120, comments: 30, shares: 25, followersDelta: 12, completionRate: 0.5 }
      },
      {
        now: () => new Date("2026-06-18T00:00:00.000Z"),
        readAnalyticsLedger: vi.fn(async () => ledger),
        writeAnalyticsLedger: vi.fn(async (next) => {
          ledger = next;
          return next;
        })
      }
    );

    expect(snapshot.signals.engagementRate).toBeGreaterThan(0);
    expect(snapshot.nextActions.length).toBeGreaterThan(0);
    expect(ledger.snapshots[0].id).toBe(snapshot.id);
  });
});
