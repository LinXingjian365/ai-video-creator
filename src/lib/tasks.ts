import fs from "node:fs";
import path from "node:path";
import { workspaceRoot } from "@/lib/paths";

export type TaskType = "info" | "clip" | "merge" | "split" | "video-variants" | "jianying-plan" | "jianying-draft" | "auto-plan" | "auto-render" | "auto-simulate" | "creator-suite" | "trend-report" | "material-import" | "material-analysis";
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

const tasks = loadTasks();

function loadTasks(): Map<string, TaskRecord> {
  try {
    const raw = fs.readFileSync(STATE_FILE, "utf8");
    const records = JSON.parse(raw) as TaskRecord[];
    return new Map(records.map((record) => {
      if (record.status === "pending" || record.status === "processing") {
        const updated = new Date().toISOString();
        return [record.id, {
          ...record,
          status: "failed",
          updatedAt: updated,
          completedAt: updated,
          error: record.error ?? "Task was interrupted by a server restart."
        }];
      }

      return [record.id, record];
    }));
  } catch {
    return new Map();
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
  return [...tasks.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getTask(id: string) {
  return tasks.get(id);
}
