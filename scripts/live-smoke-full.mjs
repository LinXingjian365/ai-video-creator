#!/usr/bin/env node
// 完整真实链路联调:含 Remotion 渲染 + 多平台变体。耗时约 5-10 分钟。
// 使用:npm run smoke:live:full  (dev server 必须在 5182)

const BASE = process.env.APP_BASE_URL || "http://127.0.0.1:5182";
const log = (...a) => console.log("·", ...a);
const ok = (m) => console.log("\x1b[32m✔\x1b[0m", m);
const bad = (m) => console.log("\x1b[31m✘\x1b[0m", m);

async function post(path, body, timeoutMs = 30000) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs)
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`${path} HTTP ${res.status}: ${txt.slice(0, 200)}`);
  return JSON.parse(txt);
}

async function getTask(id) {
  const res = await fetch(`${BASE}/api/tasks`, { signal: AbortSignal.timeout(10000) });
  const d = await res.json();
  return (d.tasks || []).find((t) => t.id === id);
}

async function pollUntilDone(id, label, maxSec = 900) {
  const t0 = Date.now();
  let lastLog = "";
  while ((Date.now() - t0) / 1000 < maxSec) {
    const t = await getTask(id);
    if (!t) throw new Error(`task ${id} not found`);
    const cur = t.logs?.slice(-1)?.[0] || "";
    if (cur !== lastLog) {
      console.log(`  [${Math.round((Date.now() - t0) / 1000)}s] ${t.progress || 0}% · ${cur.slice(-90)}`);
      lastLog = cur;
    }
    if (t.status === "completed") return t;
    if (t.status === "failed") throw new Error(`${label} failed: ${t.error || "(no error msg)"}`);
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error(`${label} timed out after ${maxSec}s`);
}

async function main() {
  console.log(`\n▷ Live FULL smoke @ ${BASE}  (含渲染,~5-10 分钟)\n`);

  log("Step 1 · 全链路 trend → script → render → variants");
  const kickoff = await post("/api/full-chain", {
    topic: "端午节美食测评",
    platform: "douyin",
    durationSec: 20,
    narrated: false
  });
  const id = kickoff.task.id;
  console.log(`  task: ${id}`);

  const final = await pollUntilDone(id, "full-chain");
  const r = final.result || {};
  ok(`full-chain ${final.status} · package=${r.packageVideoPath ? "ok" : "MISSING"}`);
  if (r.draft) {
    console.log(`  title: ${r.draft.titles?.[0] || "(no title)"}`);
    console.log(`  hook : ${(r.draft.hook || "").slice(0, 60)}`);
  }
  const variantCount = (final.logs || []).filter((l) => /Rendering .* to /.test(l)).length;
  console.log(`  variants rendered: ${variantCount}`);

  console.log("\n✓ Full smoke done. Check workspace/output/publish/* for real mp4 files.");
}

main().catch((e) => { bad(e.message); process.exit(1); });
