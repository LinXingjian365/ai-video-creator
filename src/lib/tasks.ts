import fs from "node:fs";
import path from "node:path";
import { workspaceRoot } from "@/lib/paths";

export type TaskType = "info" | "clip" | "merge" | "split" | "video-variants" | "jianying-plan" | "jianying-draft" | "auto-plan" | "auto-render" | "auto-simulate" | "creator-suite" | "trend-report" | "script-generate" | "material-import" | "material-analysis" | "remotion-render" | "narrated-render" | "full-chain" | "publish-dry-run" | "publish-queue" | "publish-approve" | "publish-dispatch" | "analytics-import" | "n8n-orchestration";
export type TaskStatus = "pending" | "processing" | "completed" | "failed";

export interface TaskRecord {
  id: string;
  type: TaskType;
  status: TaskStatus;
  progress: number;
  label: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  logs: string[];
  result?: unknown;
  error?: string;
}

const STATE_FILE = path.join(workspaceRoot, "tasks-state.json");
const MAX_PERSISTED = 200;
const DEFAULT_INTERRUPTED_TASK_STALE_MS = 10 * 60 * 1000;

const tasks = loadTasks();

function interruptedTaskStaleMs() {
  const value = Number(process.env.TASK_INTERRUPT_AFTER_MS ?? DEFAULT_INTERRUPTED_TASK_STALE_MS);
  return Number.isFinite(value) && value >= 0 ? value : DEFAULT_INTERRUPTED_TASK_STALE_MS;
}

export function normalizeLoadedTask(
  record: TaskRecord,
  nowIso = new Date().toISOString(),
  staleMs = interruptedTaskStaleMs()
): TaskRecord {
  if (record.status !== "pending" && record.status !== "processing") {
    return record;
  }

  const updatedAtMs = Date.parse(record.updatedAt || record.createdAt);
  const nowMs = Date.parse(nowIso);
  if (Number.isFinite(updatedAtMs) && Number.isFinite(nowMs) && nowMs - updatedAtMs < staleMs) {
    return record;
  }

  return {
    ...record,
    status: "failed",
    updatedAt: nowIso,
    completedAt: nowIso,
    error: record.error ?? "Task was interrupted by a server restart."
  };
}

function loadTasks(): Map<string, TaskRecord> {
  try {
    const records = readPersistedRecords();
    return new Map(records.map((record) => [record.id, normalizeLoadedTask(record)]));
  } catch {
    return new Map();
  }
}

function readPersistedRecords(): TaskRecord[] {
  const raw = fs.readFileSync(STATE_FILE, "utf8");
  return JSON.parse(raw) as TaskRecord[];
}

function mergePersistedTasks() {
  let records: TaskRecord[];
  try {
    records = readPersistedRecords();
  } catch {
    return;
  }

  for (const record of records) {
    const normalized = normalizeLoadedTask(record);
    const current = tasks.get(record.id);
    if (!current || normalized.updatedAt > current.updatedAt) {
      tasks.set(record.id, normalized);
    }
  }
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;

function schedulePersist() {
  if (persistTimer) {
    return;
  }
  persistTimer = setTimeout(() => {
    persistTimer = null;
    const records = [...tasks.values()]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, MAX_PERSISTED);
    try {
      fs.mkdirSync(workspaceRoot, { recursive: true });
      fs.writeFileSync(STATE_FILE, JSON.stringify(records, null, 2), "utf8");
    } catch {
      // Persistence is best-effort; in-memory state stays authoritative.
    }
  }, 400);
}

function now() {
  return new Date().toISOString();
}

export function createTask(type: TaskType, label: string) {
  const id = crypto.randomUUID();
  const task: TaskRecord = {
    id,
    type,
    status: "pending",
    progress: 0,
    label,
    createdAt: now(),
    updatedAt: now(),
    logs: []
  };
  tasks.set(id, task);
  schedulePersist();
  return task;
}

export function updateTask(id: string, patch: Partial<Omit<TaskRecord, "id" | "createdAt">>) {
  const current = tasks.get(id);
  if (!current) {
    throw new Error(`Task not found: ${id}`);
  }

  const next = {
    ...current,
    ...patch,
    updatedAt: now()
  };

  tasks.set(id, next);
  schedulePersist();
  return next;
}

export function appendTaskLog(id: string, message: string) {
  const current = tasks.get(id);
  if (!current) {
    return;
  }

  updateTask(id, {
    logs: [...current.logs, `[${new Date().toLocaleTimeString()}] ${message}`].slice(-80)
  });
}

export function completeTask(id: string, result: unknown) {
  return updateTask(id, {
    status: "completed",
    progress: 100,
    completedAt: now(),
    result
  });
}

export function failTask(id: string, error: unknown) {
  return updateTask(id, {
    status: "failed",
    completedAt: now(),
    error: error instanceof Error ? error.message : String(error)
  });
}

export function listTasks() {
  mergePersistedTasks();
  return [...tasks.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getTask(id: string) {
  mergePersistedTasks();
  return tasks.get(id);
}
