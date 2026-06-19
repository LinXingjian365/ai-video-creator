#!/usr/bin/env node
// 真实链路联调:trend(免费抖音 via TTD) → script(DeepSeek) → preflight(Postiz 探活)
// 使用:npm run smoke:live  (dev server 必须在 5182 上跑)

const BASE = process.env.APP_BASE_URL || "http://127.0.0.1:5182";
const NO_PROXY = { dispatcher: undefined }; // node 原生 fetch 不读 HTTP_PROXY

const log = (...a) => console.log("·", ...a);
const ok = (m) => console.log("\x1b[32m✔\x1b[0m", m);
const bad = (m) => console.log("\x1b[31m✘\x1b[0m", m);

async function post(path, body, timeoutMs = 90000) {
  const ctl = AbortSignal.timeout(timeoutMs);
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: ctl
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`${path} HTTP ${res.status}: ${txt.slice(0, 200)}`);
  return JSON.parse(txt);
}

async function get(path, timeoutMs = 30000) {
  const res = await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(timeoutMs) });
  const txt = await res.text();
  if (!res.ok) throw new Error(`${path} HTTP ${res.status}: ${txt.slice(0, 200)}`);
  return JSON.parse(txt);
}

async function main() {
  console.log(`\n▷ Live smoke @ ${BASE}\n`);

  log("Step 0 · self-check");
  const sc = await get("/api/health/self-check");
  console.log(`  ${sc.summary.ok}/${sc.summary.total} services ok` +
    (sc.summary.down ? `, ${sc.summary.down} down` : "") +
    (sc.summary.unconfigured ? `, ${sc.summary.unconfigured} unconfigured` : ""));
  const down = sc.items.filter((i) => i.status === "down");
  if (down.length) {
    bad(`down services: ${down.map((i) => i.id).join(", ")}`);
    for (const d of down) console.log(`    ${d.id}: ${d.hint || d.detail}`);
  }

  log("Step 1 · 抖音热榜(免费 TTD) → 3 条");
  const t0 = Date.now();
  const trend = await post("/api/trend/report", { platform: "douyin", category: "hot", topN: 3 });
  const tr = trend.task?.result;
  if (trend.task?.status !== "completed" || !tr?.items?.length) {
    throw new Error(`trend failed: ${trend.task?.error || "no items"}`);
  }
  ok(`trend ${trend.task.status} in ${Date.now() - t0}ms · aiStatus=${tr.aiStatus} · ${tr.items.length} items`);
  for (const it of tr.items.slice(0, 3)) {
    console.log(`    · ${it.title?.slice(0, 36)} ${it.viralLogic ? "(LLM ✓)" : ""}`);
  }

  log("Step 2 · script generation (DeepSeek) — 用首条话题");
  const top = tr.items[0];
  const t1 = Date.now();
  const script = await post("/api/script/generate", {
    topic: top.title,
    platform: "douyin",
    audience: "短视频普通用户",
    durationSec: 30,
    references: []
  });
  const draft = script.task?.result;
  if (script.task?.status !== "completed" || !draft) {
    throw new Error(`script failed: ${script.task?.error || "no draft"}`);
  }
  ok(`script ${script.task.status} in ${Date.now() - t1}ms · ${draft.beats?.length || 0} beats · ${draft.tags?.length || 0} tags`);
  console.log(`    hook: ${(draft.hook || "").slice(0, 60)}`);

  log("Step 3 · publish preflight (probe Postiz)");
  const pf = await get("/api/publish/preflight?probePostiz=true");
  const r = pf.report || pf;
  const p = r.postiz || {};
  console.log(`  postiz: configured=${p.configured} hasApiKey=${p.hasApiKey} probe=${p.probeStatus} integrations=${p.integrations?.length ?? 0}`);
  if (r.blockers?.length) {
    bad(`blockers (${r.blockers.length}):`);
    for (const b of r.blockers.slice(0, 3)) console.log(`    · ${b}`);
  } else {
    ok("ready to dispatch (no blockers)");
  }

  console.log("\n✓ live smoke done.");
  if (r.blockers?.length) {
    console.log("\n→ See docs/CONFIG_AND_LAUNCH.md for the remaining manual step (Postiz OAuth).");
  }
}

main().catch((e) => {
  bad(e.message);
  process.exit(1);
});
