import { describe, expect, it } from "vitest";
import { normalizeLoadedTask, type TaskRecord } from "./tasks";

function taskRecord(patch: Partial<TaskRecord>): TaskRecord {
  return {
    id: "task-1",
    type: "script-generate",
    status: "processing",
    progress: 20,
    label: "test",
    createdAt: "2026-06-17T00:00:00.000Z",
    updatedAt: "2026-06-17T00:00:00.000Z",
    logs: [],
    ...patch
  };
}

describe("normalizeLoadedTask", () => {
  it("keeps fresh active tasks alive across dev route module reloads", () => {
    const record = taskRecord({ updatedAt: "2026-06-17T00:00:00.000Z" });
    const normalized = normalizeLoadedTask(record, "2026-06-17T00:01:00.000Z", 10 * 60 * 1000);

    expect(normalized.status).toBe("processing");
    expect(normalized).not.toHaveProperty("error");
  });

  it("marks stale active tasks as interrupted", () => {
    const record = taskRecord({ updatedAt: "2026-06-17T00:00:00.000Z" });

    expect(normalizeLoadedTask(record, "2026-06-17T00:11:00.000Z", 10 * 60 * 1000)).toMatchObject({
      status: "failed",
      error: "Task was interrupted by a server restart."
    });
  });
});
