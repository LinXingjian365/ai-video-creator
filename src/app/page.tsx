"use client";

import { useEffect, useMemo, useState, Fragment } from "react";
import {
  BarChart3,
  CheckCircle2,
  Clock3,
  DownloadCloud,
  FileJson,
  Files,
  Flame,
  Gauge,
  Loader2,
  Megaphone,
  Network,
  Rocket,
  Scissors,
  Search,
  Sparkles,
  Target,
  UploadCloud,
  Wand2,
  XCircle
} from "lucide-react";
import type { IntelligenceReport } from "@/lib/trend/types";
import type { TikHubResearchReport } from "@/lib/trend/research";
import type { EvidenceReport } from "@/lib/trend/evidence";
import type { ScriptDraft } from "@/lib/script/generate";
import type { FullChainResult } from "@/lib/full-chain";
import type { PublishDryRunResult } from "@/lib/publish/dry-run";
import type { PublishAdapterStatus } from "@/lib/publish/adapters";
import type { PublishQueueItem } from "@/lib/publish/queue";
import type { PublishDispatchResult } from "@/lib/publish/dispatch";
import type { PublishPreflightReport } from "@/lib/publish/preflight";
import type { AnalyticsSnapshot } from "@/lib/analytics/ledger";
import type { N8nOrchestrationResult } from "@/lib/orchestration/n8n";
import type { SelfCheckReport, SelfCheckItem } from "@/lib/health/self-check";

type TaskStatus = "pending" | "processing" | "completed" | "failed";
type WorkflowStage = "trend" | "collect" | "analyze" | "script" | "edit" | "publish" | "review" | "predict" | "selfcheck";
type StageEndpoint = "trend-report" | "script-generate" | "integrations" | "auto-plan" | "auto-simulate" | "creator-suite" | "readiness" | "self-check";

interface TaskRecord {
  id: string;
  type: string;
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

interface Readiness {
  commands: Array<{ id: string; ok: boolean; output?: string; error?: string; stage: string }>;
  env: Array<{ name: string; ok: boolean; hint: string }>;
  llm?: { provider: string; keyName: string; ok: boolean; hint: string };
  nextSteps: string[];
}

type WorkspaceAssetKind =
  | "video"
  | "audio"
  | "image"
  | "subtitle"
  | "manifest"
  | "material-analysis"
  | "jianying-plan"
  | "auto-plan"
  | "task-state"
  | "other-json"
  | "other";

interface WorkspaceAsset {
  id: string;
  kind: WorkspaceAssetKind;
  role: "input" | "output" | "draft" | "workspace";
  fileName: string;
  relativePath: string;
  sizeBytes: number;
  updatedAt: string;
}

interface WorkspaceAssetIndex {
  total: number;
  counts: Record<WorkspaceAssetKind, number>;
  assets: WorkspaceAsset[];
}

interface PublishQueueResponse {
  queue: {
    items: PublishQueueItem[];
  };
  adapters: PublishAdapterStatus[];
}

interface AnalyticsLedgerResponse {
  ledger: {
    snapshots: AnalyticsSnapshot[];
  };
}

const capabilities: Array<{
  id: WorkflowStage;
  icon: typeof Flame;
  title: string;
  body: string;
  action: string;
  endpoint: StageEndpoint;
}> = [
  {
    id: "trend",
    icon: Flame,
    title: "热点趋势",
    body: "B站榜单 · 打分 · 解读",
    action: "生成热点情报",
    endpoint: "trend-report"
  },
  {
    id: "collect",
    icon: Network,
    title: "联网素材",
    body: "导入 · ASR · 场景信号",
    action: "查看工具目录",
    endpoint: "integrations"
  },
  {
    id: "analyze",
    icon: Search,
    title: "爆款拆解",
    body: "方法 → decision JSON",
    action: "生成拆解计划",
    endpoint: "auto-plan"
  },
  {
    id: "script",
    icon: Sparkles,
    title: "文案脚本",
    body: "钩子 · 分镜 · 字幕",
    action: "生成脚本方案",
    endpoint: "script-generate"
  },
  {
    id: "edit",
    icon: Scissors,
    title: "自动剪辑",
    body: "FFmpeg 裁剪合并 · 剪映",
    action: "立即模拟剪辑",
    endpoint: "auto-simulate"
  },
  {
    id: "publish",
    icon: UploadCloud,
    title: "发布矩阵",
    body: "多平台包 · dry-run",
    action: "生成发布包",
    endpoint: "creator-suite"
  },
  {
    id: "review",
    icon: BarChart3,
    title: "运营复盘",
    body: "命令 · Key · 网关体检",
    action: "检查环境",
    endpoint: "readiness"
  },
  {
    id: "predict",
    icon: Rocket,
    title: "爆火预测",
    body: "潜力分 · 置信度",
    action: "计算爆款指数",
    endpoint: "trend-report"
  },
  {
    id: "selfcheck",
    icon: Gauge,
    title: "全链路自检",
    body: "服务/依赖在线状态",
    action: "运行自检",
    endpoint: "self-check"
  }
];

const stageCopy: Record<WorkflowStage, { headline: string; description: string; proof: string[] }> = {
  trend: {
    headline: "B站真实热点情报",
    description: "抓 B站公开榜单，本地算潜力分与置信度；无 LLM Key 时只出榜单，不伪装 AI 分析。",
    proof: ["B站公开榜单", "确定性评分", "LLM 可选", "诚实降级"]
  },
  collect: {
    headline: "素材导入与信号分析",
    description: "把合法参考素材落到本地 workspace，再转成可剪辑信号:字幕/ASR、场景切点、静音段。",
    proof: ["yt-dlp", "faster-whisper", "PySceneDetect", "Auto-Editor"]
  },
  analyze: {
    headline: "爆款拆解到剪辑计划",
    description: "只拆方法不搬运:从参考标题/链接生成结构化 decision JSON，供粗剪与草稿复用。",
    proof: ["参考链接", "开头节奏", "decision JSON", "创作边界"]
  },
  script: {
    headline: "仿创作脚本工厂",
    description: "按赛道、人群、参考视频生成可执行脚本、钩子、字幕风格和素材清单。",
    proof: ["钩子", "脚本节拍", "素材需求", "转化结尾"]
  },
  edit: {
    headline: "本地 FFmpeg 自动剪辑",
    description: "真实生成测试素材、裁剪片段、合并 rough cut，并输出剪映 plan JSON。",
    proof: ["FFmpeg", "clip", "merge", "JianYing plan"]
  },
  publish: {
    headline: "多平台发布包",
    description: "生成标题、标签、比例和平台策略;真发前必须 dry-run，绝不静默上传。",
    proof: ["抖音", "快手", "B站", "dry-run"]
  },
  review: {
    headline: "全链路环境体检",
    description: "检查本机命令、API Key、LLM provider 与编排工具，缺什么直接显示。",
    proof: ["本地命令", "API Key", "LLM 网关", "下一步"]
  },
  predict: {
    headline: "用真实榜单做潜力判断",
    description: "潜力分来自互动率和播放速度，置信度看数据完整度;AI 只负责解释套路。",
    proof: ["潜力分", "置信度", "共性套路", "选题卡"]
  },
  selfcheck: {
    headline: "全链路自检",
    description: "一次性探测 TTD/n8n/Postiz 在线状态与 KSD/LLM/BGM/FFmpeg/yt-dlp 可用性,缺什么、怎么修一眼看到。",
    proof: ["在线探活", "四态诊断", "修复指引", "零计费"]
  }
};

const biliCategories = [
  { value: "all", label: "综合" },
  { value: "game", label: "游戏" },
  { value: "animation", label: "动画" },
  { value: "knowledge", label: "知识" },
  { value: "music", label: "音乐" },
  { value: "life", label: "生活" },
  { value: "tech", label: "科技" },
  { value: "dance", label: "舞蹈" },
  { value: "food", label: "美食" },
  { value: "movie", label: "影视" },
  { value: "entertainment", label: "快手-文娱" },
  { value: "society", label: "快手-社会" },
  { value: "useful", label: "快手-有用" },
  { value: "challenge", label: "快手-挑战" },
  { value: "search", label: "快手-搜索" }
];

const defaultForm = {
  niche: "本地生活/知识口播/好物带货",
  audience: "25-40岁想提升收入的普通人",
  persona: "懂 AI 工具的实战型创作者",
  keywords: "AI剪辑\n自媒体副业\n爆款视频\n抖音流量",
  references: "粘贴你下载的抖音/快手/B站爆款链接或标题",
  materialUrl: "https://www.bilibili.com/video/",
  materialCollection: "爆款参考素材",
  materialQuality: "720p",
  researchPlatform: "douyin",
  researchQuery: "AI剪辑",
  researchUrl: "",
  researchItemId: "",
  researchIncludeComments: true,
  evidenceProvider: "auto",
  materialAnalysisPath: "workspace/input/references",
  materialTranscriptionMode: "auto",
  whisperModel: "tiny",
  whisperLanguage: "zh",
  sceneBackend: "auto",
  autoEditorEnabled: true,
  roughCutAnalysisPath: "workspace/drafts",
  publishSourcePath: "workspace/output",
  publishDryRunPlatform: "douyin",
  publishDryRunTitle: "99%的人不知道的3个剪映神操作",
  publishManualConfirm: "CONFIRM_DRY_RUN_ONLY",
  analyticsPostId: "",
  analyticsPostUrl: "",
  analyticsWindow: "30m",
  analyticsViews: 1000,
  analyticsLikes: 80,
  analyticsComments: 12,
  analyticsShares: 8,
  analyticsFavorites: 20,
  analyticsFollowersDelta: 3,
  analyticsCompletionRate: 0.42,
  n8nManualConfirm: "",
  bgmPath: "",
  bgmVolume: 0.18,
  narrationVolume: 1,
  materialNeeds: "口播素材、屏幕录制、爆款参考、可商用 B-roll",
  campaignGoal: "涨粉、完播、引流、转化",
  competitorStyle: "高密度干货 + 前3秒强反差 + 大字幕",
  scriptTopic: "在AI里抛硬币，正面概率真的是50%吗？",
  webSearchEnabled: "true",
  narrated: true,
  ttsProvider: "edge",
  douyin: true,
  kuaishou: true,
  bilibili: true
};

type CreatorForm = typeof defaultForm;

export default function Home() {
  const [form, setForm] = useState<CreatorForm>(defaultForm);
  const [activeStage, setActiveStage] = useState<WorkflowStage>("trend");
  const [busy, setBusy] = useState(false);
  const [materialBusy, setMaterialBusy] = useState(false);
  const [analysisBusy, setAnalysisBusy] = useState(false);
  const [renderAnalysisBusy, setRenderAnalysisBusy] = useState(false);
  const [variantBusy, setVariantBusy] = useState(false);
  const [scriptPlanBusy, setScriptPlanBusy] = useState(false);
  const [remotionBusy, setRemotionBusy] = useState(false);
  const [fullChainBusy, setFullChainBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [result, setResult] = useState<unknown>(null);
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [workspaceAssets, setWorkspaceAssets] = useState<WorkspaceAssetIndex | null>(null);
  const [trendReport, setTrendReport] = useState<IntelligenceReport | null>(null);
  const [trendCategory, setTrendCategory] = useState("all");
  const [trendPlatform, setTrendPlatform] = useState("bilibili");
  const [topN, setTopN] = useState(20);
  const [scriptDraft, setScriptDraft] = useState<ScriptDraft | null>(null);
  const [fullChainResult, setFullChainResult] = useState<FullChainResult | null>(null);
  const [publishDryRunBusy, setPublishDryRunBusy] = useState(false);
  const [publishQueueBusy, setPublishQueueBusy] = useState(false);
  const [publishApproveBusy, setPublishApproveBusy] = useState(false);
  const [publishDispatchBusy, setPublishDispatchBusy] = useState(false);
  const [publishPreflightBusy, setPublishPreflightBusy] = useState(false);
  const [analyticsBusy, setAnalyticsBusy] = useState(false);
  const [n8nBusy, setN8nBusy] = useState(false);
  const [publishDryRunResult, setPublishDryRunResult] = useState<PublishDryRunResult | null>(null);
  const [publishDispatchResult, setPublishDispatchResult] = useState<PublishDispatchResult | null>(null);
  const [publishPreflightResult, setPublishPreflightResult] = useState<PublishPreflightReport | null>(null);
  const [n8nResult, setN8nResult] = useState<N8nOrchestrationResult | null>(null);
  const [publishQueue, setPublishQueue] = useState<PublishQueueItem[]>([]);
  const [publishAdapters, setPublishAdapters] = useState<PublishAdapterStatus[]>([]);
  const [analyticsSnapshots, setAnalyticsSnapshots] = useState<AnalyticsSnapshot[]>([]);
  const [researchBusy, setResearchBusy] = useState(false);
  const [researchReport, setResearchReport] = useState<TikHubResearchReport | null>(null);
  const [evidenceBusy, setEvidenceBusy] = useState(false);
  const [evidenceReport, setEvidenceReport] = useState<EvidenceReport | null>(null);
  const [bgmPickBusy, setBgmPickBusy] = useState(false);
  const [selfCheckBusy, setSelfCheckBusy] = useState(false);
  const [selfCheckReport, setSelfCheckReport] = useState<SelfCheckReport | null>(null);

  const activeCapability = useMemo(
    () => capabilities.find((item) => item.id === activeStage) ?? capabilities[0],
    [activeStage]
  );

  useEffect(() => {
    void refreshTasks();
    void refreshReadiness();
    void refreshWorkspaceAssets();
    void refreshPublishQueue();
    void refreshAnalyticsLedger();
    const timer = window.setInterval(refreshTasks, 1500);
    const assetTimer = window.setInterval(refreshWorkspaceAssets, 5000);
    return () => {
      window.clearInterval(timer);
      window.clearInterval(assetTimer);
    };
  }, []);

  function update<K extends keyof CreatorForm>(key: K, value: CreatorForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function refreshTasks() {
    const response = await fetch("/api/tasks", { cache: "no-store" });
    if (response.ok) {
      const data = await response.json();
      setTasks(data.tasks ?? []);
    }
  }

  async function refreshReadiness() {
    const response = await fetch("/api/creator/readiness", { cache: "no-store" });
    if (response.ok) {
      setReadiness(await response.json());
    }
  }

  async function refreshWorkspaceAssets() {
    const response = await fetch("/api/workspace/assets?limit=80", { cache: "no-store" });
    if (response.ok) {
      setWorkspaceAssets(await response.json());
    }
  }

  async function refreshPublishQueue() {
    const response = await fetch("/api/publish/queue", { cache: "no-store" });
    if (response.ok) {
      const data = await response.json() as PublishQueueResponse;
      setPublishQueue(data.queue?.items ?? []);
      setPublishAdapters(data.adapters ?? []);
    }
  }

  async function refreshAnalyticsLedger() {
    const response = await fetch("/api/analytics/import", { cache: "no-store" });
    if (response.ok) {
      const data = await response.json() as AnalyticsLedgerResponse;
      setAnalyticsSnapshots(data.ledger?.snapshots ?? []);
    }
  }

  async function runStageAction() {
    setBusy(true);
    setMessage("");
    setResult(null);

    try {
      if (activeCapability.endpoint === "trend-report") {
        await generateTrendReport();
      } else if (activeCapability.endpoint === "script-generate") {
        await generateScript();
      } else if (activeCapability.endpoint === "integrations") {
        await runGet("/api/integrations", "集成目录已加载");
      } else if (activeCapability.endpoint === "readiness") {
        const data = await runGet("/api/creator/readiness", "环境体检已完成");
        setReadiness(data as Readiness);
      } else if (activeCapability.endpoint === "auto-simulate") {
        await runPost("/api/auto/simulate", {
          projectTitle: "一键模拟自动剪辑",
          instructions: "生成 12 秒测试素材，保留强钩子、核心演示、结尾行动三段，输出 rough cut mp4 和剪映草稿计划。"
        }, "自动剪辑任务已启动，右侧任务面板会显示输出路径");
      } else if (activeCapability.endpoint === "auto-plan") {
        await runPost("/api/auto/plan", {
          projectTitle: "爆款拆解到初剪",
          materialDir: "workspace/input",
          instructions: `参考这些爆款，只拆方法不搬运内容：${form.references}\n目标：生成强钩子、核心演示、结尾转化三段 decision JSON。`
        }, "爆款拆解计划已生成");
      } else if (activeCapability.endpoint === "self-check") {
        await runSelfCheckAction();
      } else {
        await runPost("/api/creator/suite", creatorSuitePayload(form), `${activeCapability.title}已生成`);
      }

      await refreshTasks();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "请求失败");
    } finally {
      setBusy(false);
    }
  }

  async function runSelfCheckAction() {
    setSelfCheckBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/health/self-check", { cache: "no-store" });
      const data = (await response.json()) as SelfCheckReport;
      if (!response.ok) {
        throw new Error("自检请求失败");
      }
      setSelfCheckReport(data);
      setResult(data);
      setMessage(`自检完成:${data.summary.ok}/${data.summary.total} 项可用`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "自检失败");
    } finally {
      setSelfCheckBusy(false);
    }
  }

  async function runGet(url: string, okMessage: string) {
    const response = await fetch(url, { cache: "no-store" });
    const data = await response.json();
    setResult(data);
    if (!response.ok) {
      throw new Error(data.task?.error ?? data.error ?? "请求失败");
    }
    setMessage(okMessage);
    return data;
  }

  async function runPost(url: string, payload: unknown, okMessage: string) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    setResult(data);
    if (!response.ok) {
      throw new Error(data.task?.error ?? data.error ?? "请求失败");
    }
    setMessage(okMessage);
    return data;
  }

  async function generateTrendReport() {
    const response = await fetch("/api/trend/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform: trendPlatform, category: trendCategory, topN })
    });
    const data = await response.json();
    setResult(data);
    if (!response.ok) {
      throw new Error(data.task?.error ?? data.error ?? "热点情报请求失败");
    }

    const final = data.task?.status === "completed" || data.task?.status === "failed"
      ? data.task as TaskRecord
      : await pollTaskUntilDone(data.task.id);
    if (!final) {
      throw new Error("热点情报任务超时");
    }
    if (final.status === "failed") {
      throw new Error(final.error ?? "热点情报任务失败");
    }

    const report = final.result as IntelligenceReport;
    setTrendReport(report);
    setResult(report);
    setMessage(report.aiStatus === "ok"
      ? "热点情报已生成，包含 AI 爆火逻辑分析"
      : "热点情报已生成：LLM 未配置或分析失败，仅展示真实榜单和客观评分");
  }

  async function generateScript() {
    const platform = form.douyin ? "douyin" : form.kuaishou ? "kuaishou" : form.bilibili ? "bilibili" : "douyin";
    const references = form.references.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const evidence = (evidenceReport?.results ?? []).slice(0, 6).map((item) => ({
      title: item.title,
      url: item.url,
      snippet: item.snippet,
      publishedAt: item.publishedAt
    }));
    const response = await fetch("/api/script/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic: form.scriptTopic, platform, audience: form.audience, references, evidence })
    });
    const data = await response.json();
    setResult(data);
    if (!response.ok) {
      throw new Error(data.task?.error ?? data.error ?? "文案脚本请求失败");
    }

    const final = data.task?.status === "completed" || data.task?.status === "failed"
      ? data.task as TaskRecord
      : await pollTaskUntilDone(data.task.id);
    if (!final) {
      throw new Error("文案脚本任务超时");
    }
    if (final.status === "failed") {
      throw new Error(final.error ?? "文案脚本任务失败");
    }

    const draft = final.result as ScriptDraft;
    setScriptDraft(draft);
    setResult(draft);
    setMessage(`文案脚本已生成：${draft.titles[0] ?? form.scriptTopic}`);
  }

  async function createPlanFromScript() {
    if (!scriptDraft) {
      setMessage("先生成文案脚本，再转自动剪辑计划");
      return;
    }

    setScriptPlanBusy(true);
    setMessage("");
    try {
      const data = await runPost(
        "/api/auto/plan",
        scriptDraftToAutoPlanPayload(scriptDraft, form),
        "脚本已转成自动剪辑 decision JSON"
      );
      setResult(data.task?.result ?? data);
      await refreshTasks();
      await refreshWorkspaceAssets();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "脚本转剪辑计划失败");
    } finally {
      setScriptPlanBusy(false);
    }
  }

  async function renderScriptPackage() {
    if (!scriptDraft) {
      setMessage("先生成文案脚本，再渲染 Remotion 包装视频");
      return;
    }

    setRemotionBusy(true);
    setMessage("");
    try {
      const platform = form.douyin ? "douyin" : form.kuaishou ? "kuaishou" : form.bilibili ? "bilibili" : "douyin";
      const data = await runPost("/api/remotion/render", {
        title: scriptDraft.titles[0] ?? form.scriptTopic,
        hook: scriptDraft.hook,
        beats: scriptDraft.beats,
        tags: scriptDraft.tags,
        bgm: scriptDraft.bgm,
        ...(form.bgmPath.trim() ? { bgmPath: form.bgmPath.trim(), bgmVolume: form.bgmVolume } : {}),
        platform,
        aspectRatio: form.bilibili && !form.douyin && !form.kuaishou ? "16:9" : "9:16"
      }, "Remotion 包装视频已启动渲染");
      const final = data.task?.status === "completed" || data.task?.status === "failed"
        ? data.task as TaskRecord
        : await pollTaskUntilDone(data.task.id, 900000);
      if (!final) {
        throw new Error("Remotion 渲染任务超时");
      }
      if (final.status === "failed") {
        throw new Error(final.error ?? "Remotion 渲染失败");
      }
      setResult(final.result ?? data);
      setMessage("Remotion 包装视频已生成");
      await refreshTasks();
      await refreshWorkspaceAssets();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Remotion 渲染请求失败");
    } finally {
      setRemotionBusy(false);
    }
  }

  async function runFullChainAction() {
    if (!form.scriptTopic.trim()) {
      setMessage("先填写选题，再一键全链路");
      return;
    }

    setFullChainBusy(true);
    setMessage("");
    try {
      const platform = form.douyin ? "douyin" : form.kuaishou ? "kuaishou" : form.bilibili ? "bilibili" : "douyin";
      const variantTargets = (["douyin", "kuaishou", "bilibili"] as const).filter((id) => form[id]);
      const evidence = (evidenceReport?.results ?? []).slice(0, 6).map((item) => ({
        title: item.title,
        url: item.url,
        snippet: item.snippet,
        publishedAt: item.publishedAt
      }));
      const data = await runPost("/api/full-chain", {
        topic: form.scriptTopic,
        platform,
        audience: form.audience || undefined,
        references: form.references.split("\n").map((line) => line.trim()).filter(Boolean),
        evidence,
        aspectRatio: platform === "bilibili" ? "16:9" : "9:16",
        narrated: form.narrated,
        ...(form.narrated ? { ttsProvider: form.ttsProvider } : {}),
        ...(form.bgmPath.trim() ? {
          bgmPath: form.bgmPath.trim(),
          bgmVolume: form.bgmVolume,
          narrationVolume: form.narrationVolume
        } : {}),
        ...(variantTargets.length > 0 ? { variantTargets } : {})
      }, form.narrated
        ? "一键全链路已启动：脚本 → AI 配音成片 → 多平台变体"
        : "一键全链路已启动：脚本 → Remotion 成片 → 多平台变体");
      const final = data.task?.status === "completed" || data.task?.status === "failed"
        ? data.task as TaskRecord
        : await pollTaskUntilDone(data.task.id, 1_200_000);
      if (!final) {
        throw new Error("全链路任务超时");
      }
      if (final.status === "failed") {
        throw new Error(final.error ?? "全链路失败");
      }
      const chain = final.result as FullChainResult | undefined;
      if (chain?.draft) {
        setScriptDraft(chain.draft);
      }
      setFullChainResult(chain ?? null);
      setResult(final.result ?? data);
      setMessage(`一键全链路完成：${chain?.variants.variants.length ?? 0} 个平台成片已落盘`);
      await refreshTasks();
      await refreshWorkspaceAssets();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "全链路请求失败");
    } finally {
      setFullChainBusy(false);
    }
  }

  async function runPublishDryRun() {
    if (!form.publishSourcePath.trim() || !form.publishDryRunTitle.trim()) {
      setMessage("先填成片路径(选具体 MP4)和发布标题，再做 dry-run 校验");
      return;
    }

    setPublishDryRunBusy(true);
    setMessage("");
    try {
      const data = await runPost("/api/publish/dry-run", {
        platform: form.publishDryRunPlatform,
        videoPath: form.publishSourcePath,
        title: form.publishDryRunTitle,
        tags: scriptDraft?.tags ?? []
      }, "发布 dry-run 校验完成");
      const final = data.task?.status === "completed" || data.task?.status === "failed"
        ? data.task as TaskRecord
        : await pollTaskUntilDone(data.task.id);
      if (!final) {
        throw new Error("dry-run 任务超时");
      }
      if (final.status === "failed") {
        throw new Error(final.error ?? "dry-run 失败");
      }
      setPublishDryRunResult(final.result as PublishDryRunResult);
      setResult(final.result ?? data);
      await refreshTasks();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "dry-run 请求失败");
    } finally {
      setPublishDryRunBusy(false);
    }
  }

  async function createPublishQueue() {
    if (!form.publishSourcePath.trim() || !form.publishDryRunTitle.trim()) {
      setMessage("先填成片路径和发布标题，再加入待发布队列");
      return;
    }

    setPublishQueueBusy(true);
    setMessage("");
    try {
      const data = await runPost("/api/publish/queue", {
        platform: form.publishDryRunPlatform,
        videoPath: form.publishSourcePath,
        title: form.publishDryRunTitle,
        tags: scriptDraft?.tags ?? []
      }, "已创建待发布队列项");
      const final = data.task?.status === "completed" || data.task?.status === "failed"
        ? data.task as TaskRecord
        : await pollTaskUntilDone(data.task.id);
      if (!final) {
        throw new Error("创建发布队列任务超时");
      }
      if (final.status === "failed") {
        throw new Error(final.error ?? "创建发布队列失败");
      }
      setResult(final.result ?? data);
      await refreshPublishQueue();
      await refreshTasks();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "创建发布队列失败");
    } finally {
      setPublishQueueBusy(false);
    }
  }

  async function approvePublishQueue(id: string) {
    setPublishApproveBusy(true);
    setMessage("");
    try {
      const data = await runPost("/api/publish/approve", {
        id,
        manualConfirm: form.publishManualConfirm,
        note: "UI 人工确认：仅进入 approved 队列，不真发。"
      }, "发布队列项已人工批准");
      const final = data.task?.status === "completed" || data.task?.status === "failed"
        ? data.task as TaskRecord
        : await pollTaskUntilDone(data.task.id);
      if (!final) {
        throw new Error("人工批准任务超时");
      }
      if (final.status === "failed") {
        throw new Error(final.error ?? "人工批准失败");
      }
      setResult(final.result ?? data);
      await refreshPublishQueue();
      await refreshTasks();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "人工批准失败");
    } finally {
      setPublishApproveBusy(false);
    }
  }

  async function dispatchPublishQueue(id: string) {
    setPublishDispatchBusy(true);
    setMessage("");
    try {
      const data = await runPost("/api/publish/dispatch", {
        id,
        mode: "draft",
        manualConfirm: form.publishManualConfirm
      }, "发布 dispatch 已完成");
      const final = data.task?.status === "completed" || data.task?.status === "failed"
        ? data.task as TaskRecord
        : await pollTaskUntilDone(data.task.id);
      if (!final) {
        throw new Error("dispatch 任务超时");
      }
      if (final.status === "failed") {
        throw new Error(final.error ?? "dispatch 失败");
      }
      setPublishDispatchResult(final.result as PublishDispatchResult);
      setResult(final.result ?? data);
      await refreshPublishQueue();
      await refreshTasks();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "dispatch 失败");
    } finally {
      setPublishDispatchBusy(false);
    }
  }

  async function runPublishPreflight() {
    setPublishPreflightBusy(true);
    setMessage("");
    try {
      const platforms = (["douyin", "kuaishou", "bilibili"] as const).filter((id) => form[id]);
      const data = await runPost("/api/publish/preflight", {
        probePostiz: true,
        platforms
      }, "发布账号联调体检已完成");
      const final = data.task?.status === "completed" || data.task?.status === "failed"
        ? data.task as TaskRecord
        : await pollTaskUntilDone(data.task.id);
      if (!final) {
        throw new Error("发布账号联调体检任务超时");
      }
      if (final.status === "failed") {
        throw new Error(final.error ?? "发布账号联调体检失败");
      }
      setPublishPreflightResult(final.result as PublishPreflightReport);
      setResult(final.result ?? data);
      await refreshTasks();
      await refreshPublishQueue();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "发布账号联调体检请求失败");
    } finally {
      setPublishPreflightBusy(false);
    }
  }

  async function importAnalytics() {
    setAnalyticsBusy(true);
    setMessage("");
    try {
      const data = await runPost("/api/analytics/import", {
        platform: form.publishDryRunPlatform,
        postId: form.analyticsPostId.trim() || undefined,
        postUrl: form.analyticsPostUrl.trim() || undefined,
        title: form.publishDryRunTitle,
        window: form.analyticsWindow,
        metrics: {
          views: form.analyticsViews,
          likes: form.analyticsLikes,
          comments: form.analyticsComments,
          shares: form.analyticsShares,
          favorites: form.analyticsFavorites,
          followersDelta: form.analyticsFollowersDelta,
          completionRate: form.analyticsCompletionRate
        }
      }, "数据回流快照已导入");
      const final = data.task?.status === "completed" || data.task?.status === "failed"
        ? data.task as TaskRecord
        : await pollTaskUntilDone(data.task.id);
      if (!final) {
        throw new Error("数据回流任务超时");
      }
      if (final.status === "failed") {
        throw new Error(final.error ?? "数据回流失败");
      }
      setResult(final.result ?? data);
      await refreshAnalyticsLedger();
      await refreshTasks();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "数据回流失败");
    } finally {
      setAnalyticsBusy(false);
    }
  }

  async function triggerN8n(mode: "dry-run" | "webhook", exportWorkflow = false) {
    if (!form.scriptTopic.trim()) {
      setMessage("先填写选题，再生成 n8n 全链路编排。");
      return;
    }

    setN8nBusy(true);
    setMessage("");
    try {
      const approvedItem = publishQueue.find((item) => item.status === "approved");
      const data = await runPost("/api/orchestration/n8n", {
        topic: form.scriptTopic,
        platform: form.publishDryRunPlatform,
        mode,
        category: trendCategory,
        topN,
        audience: form.audience || undefined,
        durationSec: 45,
        references: form.references.split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
        videoPath: form.publishSourcePath.trim() || undefined,
        queueItemId: approvedItem?.id,
        analyticsWindow: form.analyticsWindow,
        manualConfirm: form.n8nManualConfirm || undefined,
        exportWorkflow
      }, exportWorkflow ? "n8n workflow JSON 已导出" : mode === "webhook" ? "n8n webhook 触发流程已完成" : "n8n 编排 payload 已生成");
      const final = data.task?.status === "completed" || data.task?.status === "failed"
        ? data.task as TaskRecord
        : await pollTaskUntilDone(data.task.id);
      if (!final) {
        throw new Error("n8n 编排任务超时");
      }
      if (final.status === "failed") {
        throw new Error(final.error ?? "n8n 编排失败");
      }
      setN8nResult(final.result as N8nOrchestrationResult);
      setResult(final.result ?? data);
      await refreshTasks();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "n8n 编排请求失败");
    } finally {
      setN8nBusy(false);
    }
  }

  async function importReferenceMaterial() {
    setMaterialBusy(true);
    setMessage("");
    setResult(null);

    try {
      const data = await runPost("/api/materials/import", {
        url: form.materialUrl,
        collectionName: form.materialCollection,
        quality: form.materialQuality,
        allowPlaylist: false,
        writeSubtitles: true,
        writeAutoSubtitles: true,
        subtitleLanguages: ["zh-Hans", "zh", "en"]
      }, "素材导入任务已启动，右侧任务面板会显示 yt-dlp 日志和 manifest 输出");
      setResult(data);
      await refreshTasks();
      await refreshWorkspaceAssets();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "素材导入请求失败");
    } finally {
      setMaterialBusy(false);
    }
  }

  async function runTikHubResearchAction() {
    setResearchBusy(true);
    setMessage("");
    setResult(null);

    try {
      const data = await runPost("/api/trend/research", {
        platform: form.researchPlatform,
        query: form.researchQuery.trim() || undefined,
        url: form.researchUrl.trim() || undefined,
        itemId: form.researchItemId.trim() || undefined,
        includeComments: form.researchIncludeComments,
        limit: 10
      }, "TikHub 爆款研究已完成");
      const final = data.task?.status === "completed" || data.task?.status === "failed"
        ? data.task as TaskRecord
        : await pollTaskUntilDone(data.task.id);
      if (!final) {
        throw new Error("TikHub 爆款研究任务超时");
      }
      if (final.status === "failed") {
        throw new Error(final.error ?? "TikHub 爆款研究失败");
      }

      const report = final.result as TikHubResearchReport;
      setResearchReport(report);
      if (report.materialCandidates[0]?.url) {
        update("materialUrl", report.materialCandidates[0].url);
      }
      if (report.materialCandidates.length) {
        update("references", report.materialCandidates.map((candidate) => candidate.title || candidate.url).join("\n"));
      }
      setResult(report);
      setMessage(`TikHub 研究完成：${report.searchItems.length} 个搜索结果、${report.comments.length} 条评论样本`);
      await refreshTasks();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "TikHub 爆款研究请求失败");
    } finally {
      setResearchBusy(false);
    }
  }

  async function runEvidenceSearchAction() {
    const query = form.researchQuery.trim();
    if (!query) {
      setMessage("先填关键词,再做证据搜索");
      return;
    }
    setEvidenceBusy(true);
    setMessage("");
    setResult(null);
    try {
      const data = await runPost("/api/trend/evidence", {
        query,
        provider: form.evidenceProvider,
        limit: 8,
        includeContents: true
      }, "证据搜索已完成");
      const final = data.task?.status === "completed" || data.task?.status === "failed"
        ? data.task as TaskRecord
        : await pollTaskUntilDone(data.task.id);
      if (!final) {
        throw new Error("证据搜索任务超时");
      }
      if (final.status === "failed") {
        throw new Error(final.error ?? "证据搜索失败");
      }
      const report = final.result as EvidenceReport;
      setEvidenceReport(report);
      setResult(report);
      setMessage(`证据搜索完成:${report.provider} 返回 ${report.results.length} 条事实参考`);
      await refreshTasks();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "证据搜索请求失败");
    } finally {
      setEvidenceBusy(false);
    }
  }

  async function autoPickBgm() {
    const mood = scriptDraft?.bgm?.trim() || form.scriptTopic.trim();
    if (!mood) {
      setMessage("先生成脚本(取 LLM 推荐的曲风)或填选题,再 AI 选曲");
      return;
    }
    setBgmPickBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/bgm/library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mood, fallbackFirst: true })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "BGM 选曲失败");
      }
      if (data.libraryCount === 0) {
        setMessage("BGM 库为空。把免费 mp3 放到 workspace/input/audio/<mood>/ 下(CC0 来源:pixabay.com/music、mixkit.co、freepd.com)");
        setResult(data);
        return;
      }
      if (data.pick?.relativePath) {
        update("bgmPath", data.pick.relativePath);
        setMessage(`AI 选曲:${data.pick.relativePath}(命中 ${data.score} 关键词:${data.matchedKeywords.join("/") || "fallback"})`);
        setResult(data);
      } else {
        setMessage(`无匹配 BGM。${data.nextActions?.[0] ?? ""}`);
        setResult(data);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "BGM 选曲请求失败");
    } finally {
      setBgmPickBusy(false);
    }
  }

  async function analyzeReferenceMaterial() {
    setAnalysisBusy(true);
    setMessage("");
    setResult(null);

    try {
      const analysisInput = materialAnalysisPayload(form.materialAnalysisPath);
      const data = await runPost("/api/materials/analyze", {
        ...analysisInput,
        transcriptionMode: form.materialTranscriptionMode,
        whisperModel: form.whisperModel,
        whisperLanguage: form.whisperLanguage || undefined,
        sceneBackend: form.sceneBackend,
        autoEditorEnabled: form.autoEditorEnabled,
        sceneThreshold: 0.3,
        maxScenes: 40,
        silenceNoiseDb: -35,
        silenceMinDurationSec: 0.8,
        minClipMs: 1500,
        targetClipMs: 6000
      }, "素材分析已启动，右侧任务面板会显示 ASR/场景/静音检测进度");
      const final = data.task?.status === "completed" || data.task?.status === "failed"
        ? data.task as TaskRecord
        : await pollTaskUntilDone(data.task.id, 900000);
      if (!final) {
        throw new Error("素材分析任务超时");
      }
      if (final.status === "failed") {
        throw new Error(final.error ?? "素材分析任务失败");
      }
      setResult(final.result ?? data);
      setMessage("素材分析已完成，已生成 transcript/scene/candidate clips JSON");
      await refreshTasks();
      await refreshWorkspaceAssets();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "素材分析请求失败");
    } finally {
      setAnalysisBusy(false);
    }
  }

  async function renderFromAnalysis() {
    setRenderAnalysisBusy(true);
    setMessage("");
    setResult(null);

    try {
      const data = await runPost("/api/auto/render", {
        projectTitle: "分析结果粗剪",
        analysisPath: form.roughCutAnalysisPath
      }, "分析结果粗剪已完成，输出 rough cut MP4 和 JianYing plan JSON");
      setResult(data.task?.result ?? data);
      await refreshTasks();
      await refreshWorkspaceAssets();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "分析结果粗剪请求失败");
    } finally {
      setRenderAnalysisBusy(false);
    }
  }

  async function generatePlatformVariants() {
    setVariantBusy(true);
    setMessage("");
    setResult(null);

    try {
      const targets = [
        form.douyin ? "douyin" : "",
        form.kuaishou ? "kuaishou" : "",
        form.bilibili ? "bilibili" : "",
        "square"
      ].filter(Boolean);
      const data = await runPost("/api/video/variants", {
        inputPath: form.publishSourcePath,
        title: "平台发布版本",
        targets,
        mode: "crop"
      }, "平台视频版本已生成，输出到 workspace/output/publish");
      setResult(data.task?.result ?? data);
      await refreshTasks();
      await refreshWorkspaceAssets();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "平台视频版本生成失败");
    } finally {
      setVariantBusy(false);
    }
  }

  return (
    <main className="console-shell creator-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><Wand2 size={20} /></div>
          <div>
            <strong>AI 视频增长控制台</strong>
            <span>热点情报 / 素材收集 / 仿创作 / 自动剪辑 / 发布复盘</span>
          </div>
        </div>

        <div className="feature-list">
          {capabilities.map((item, index) => {
            const Icon = item.icon;
            const pipeline = index < 6;
            return (
              <Fragment key={item.id}>
                {index === 0 ? <div className="nav-group">创作主线</div> : null}
                {index === 6 ? <div className="nav-group">辅助</div> : null}
                <button
                  aria-pressed={activeStage === item.id}
                  className={activeStage === item.id ? "feature-item active" : "feature-item"}
                  onClick={() => {
                    setActiveStage(item.id);
                    setMessage("");
                  }}
                  type="button"
                >
                  <span className="feature-index">{pipeline ? String(index + 1).padStart(2, "0") : "··"}</span>
                  <Icon size={18} />
                  <div>
                    <strong>{item.title}</strong>
                    <small>{item.body}</small>
                  </div>
                </button>
              </Fragment>
            );
          })}
        </div>

        <div className="workspace-box">
          <span>工作区</span>
          <code>workspace/input/references</code>
          <code>workspace/input/raw</code>
          <code>workspace/output/publish</code>
          <code>workspace/drafts</code>
        </div>
      </aside>

      <section className="workbench">
        <header className="topbar hero-bar">
          <div>
            <p>抖音 · 快手 · B站 创作控制台</p>
            <h1>真实热点驱动，AI 写 · 找 · 剪 · 发一条龙</h1>
            <span>B站真实榜单 + 确定性打分 + DeepSeek 解读；能力未接通时诚实降级，不伪装成功。</span>
          </div>
          <button className="icon-button" onClick={refreshTasks} title="刷新任务" type="button">
            <Clock3 size={18} />
          </button>
        </header>

        <form
          className={`operation-panel stage-${activeStage}`}
          onSubmit={(event) => {
            event.preventDefault();
            void runStageAction();
          }}
        >
          <StageWorkspace
            activeStage={activeStage}
            busy={busy}
            form={form}
            update={update}
            trendCategory={trendCategory}
            onTrendCategoryChange={setTrendCategory}
            trendPlatform={trendPlatform}
            onTrendPlatformChange={setTrendPlatform}
            topN={topN}
            onTopNChange={setTopN}
            trendReport={trendReport}
            scriptDraft={scriptDraft}
            readiness={readiness}
            workspaceAssets={workspaceAssets}
            materialBusy={materialBusy}
            analysisBusy={analysisBusy}
            renderAnalysisBusy={renderAnalysisBusy}
            scriptPlanBusy={scriptPlanBusy}
            remotionBusy={remotionBusy}
            fullChainBusy={fullChainBusy}
            fullChainResult={fullChainResult}
            variantBusy={variantBusy}
            onImportMaterial={importReferenceMaterial}
            researchBusy={researchBusy}
            researchReport={researchReport}
            onRunTikHubResearch={runTikHubResearchAction}
            evidenceBusy={evidenceBusy}
            evidenceReport={evidenceReport}
            onRunEvidenceSearch={runEvidenceSearchAction}
            onAnalyzeMaterial={analyzeReferenceMaterial}
            onCreatePlanFromScript={createPlanFromScript}
            onRenderScriptPackage={renderScriptPackage}
            onRunFullChain={runFullChainAction}
            onRenderFromAnalysis={renderFromAnalysis}
            onGeneratePlatformVariants={generatePlatformVariants}
            bgmPickBusy={bgmPickBusy}
            onAutoPickBgm={autoPickBgm}
            publishDryRunBusy={publishDryRunBusy}
            publishQueueBusy={publishQueueBusy}
            publishApproveBusy={publishApproveBusy}
            publishDispatchBusy={publishDispatchBusy}
            publishPreflightBusy={publishPreflightBusy}
            publishDryRunResult={publishDryRunResult}
            publishDispatchResult={publishDispatchResult}
            publishPreflightResult={publishPreflightResult}
            publishQueue={publishQueue}
            publishAdapters={publishAdapters}
            analyticsBusy={analyticsBusy}
            analyticsSnapshots={analyticsSnapshots}
            n8nBusy={n8nBusy}
            n8nResult={n8nResult}
            onPublishDryRun={runPublishDryRun}
            onCreatePublishQueue={createPublishQueue}
            onApprovePublishQueue={approvePublishQueue}
            onDispatchPublishQueue={dispatchPublishQueue}
            onRunPublishPreflight={runPublishPreflight}
            onImportAnalytics={importAnalytics}
            onTriggerN8n={triggerN8n}
            selfCheckBusy={selfCheckBusy}
            selfCheckReport={selfCheckReport}
            onRunSelfCheck={runSelfCheckAction}
          />

          <footer className="form-actions">
            <p>{message || "选择左侧模块开始。"}</p>
          </footer>
        </form>
      </section>

      <TaskPanel readiness={readiness} result={result} tasks={tasks} workspaceAssets={workspaceAssets} />
    </main>
  );
}

function StageWorkspace({
  activeStage,
  busy,
  form,
  update,
  trendCategory,
  onTrendCategoryChange,
  trendPlatform,
  onTrendPlatformChange,
  topN,
  onTopNChange,
  trendReport,
  scriptDraft,
  readiness,
  workspaceAssets,
  materialBusy,
  analysisBusy,
  renderAnalysisBusy,
  scriptPlanBusy,
  remotionBusy,
  fullChainBusy,
  fullChainResult,
  variantBusy,
  onImportMaterial,
  researchBusy,
  researchReport,
  onRunTikHubResearch,
  evidenceBusy,
  evidenceReport,
  onRunEvidenceSearch,
  onAnalyzeMaterial,
  onCreatePlanFromScript,
  onRenderScriptPackage,
  onRunFullChain,
  onRenderFromAnalysis,
  onGeneratePlatformVariants,
  bgmPickBusy,
  onAutoPickBgm,
  publishDryRunBusy,
  publishQueueBusy,
  publishApproveBusy,
  publishDispatchBusy,
  publishPreflightBusy,
  publishDryRunResult,
  publishDispatchResult,
  publishPreflightResult,
  publishQueue,
  publishAdapters,
  analyticsBusy,
  analyticsSnapshots,
  n8nBusy,
  n8nResult,
  onPublishDryRun,
  onCreatePublishQueue,
  onApprovePublishQueue,
  onDispatchPublishQueue,
  onRunPublishPreflight,
  onImportAnalytics,
  onTriggerN8n,
  selfCheckBusy,
  selfCheckReport,
  onRunSelfCheck
}: {
  activeStage: WorkflowStage;
  busy: boolean;
  form: CreatorForm;
  update: <K extends keyof CreatorForm>(key: K, value: CreatorForm[K]) => void;
  trendCategory: string;
  onTrendCategoryChange: (value: string) => void;
  trendPlatform: string;
  onTrendPlatformChange: (value: string) => void;
  topN: number;
  onTopNChange: (value: number) => void;
  trendReport: IntelligenceReport | null;
  scriptDraft: ScriptDraft | null;
  readiness: Readiness | null;
  workspaceAssets: WorkspaceAssetIndex | null;
  materialBusy: boolean;
  analysisBusy: boolean;
  renderAnalysisBusy: boolean;
  scriptPlanBusy: boolean;
  remotionBusy: boolean;
  fullChainBusy: boolean;
  fullChainResult: FullChainResult | null;
  variantBusy: boolean;
  onImportMaterial: () => void;
  researchBusy: boolean;
  researchReport: TikHubResearchReport | null;
  onRunTikHubResearch: () => void;
  evidenceBusy: boolean;
  evidenceReport: EvidenceReport | null;
  onRunEvidenceSearch: () => void;
  onAnalyzeMaterial: () => void;
  onCreatePlanFromScript: () => void;
  onRenderScriptPackage: () => void;
  onRunFullChain: () => void;
  onRenderFromAnalysis: () => void;
  onGeneratePlatformVariants: () => void;
  bgmPickBusy: boolean;
  onAutoPickBgm: () => void;
  publishDryRunBusy: boolean;
  publishQueueBusy: boolean;
  publishApproveBusy: boolean;
  publishDispatchBusy: boolean;
  publishPreflightBusy: boolean;
  publishDryRunResult: PublishDryRunResult | null;
  publishDispatchResult: PublishDispatchResult | null;
  publishPreflightResult: PublishPreflightReport | null;
  publishQueue: PublishQueueItem[];
  publishAdapters: PublishAdapterStatus[];
  analyticsBusy: boolean;
  analyticsSnapshots: AnalyticsSnapshot[];
  n8nBusy: boolean;
  n8nResult: N8nOrchestrationResult | null;
  onPublishDryRun: () => void;
  onCreatePublishQueue: () => void;
  onApprovePublishQueue: (id: string) => void;
  onDispatchPublishQueue: (id: string) => void;
  onRunPublishPreflight: () => void;
  onImportAnalytics: () => void;
  onTriggerN8n: (mode: "dry-run" | "webhook", exportWorkflow?: boolean) => void;
  selfCheckBusy: boolean;
  selfCheckReport: SelfCheckReport | null;
  onRunSelfCheck: () => void;
}) {
  const copy = stageCopy[activeStage];
  const stage = capabilities.find((item) => item.id === activeStage) ?? capabilities[0];

  return (
    <section className="stage-workspace">
      <div className="stage-hero">
        <div>
          <p>{activeStage.toUpperCase()}</p>
          <h2>{copy.headline}</h2>
          <span>{copy.description}</span>
          <div className="stage-proof">
            {copy.proof.map((item) => <span key={item}>{item}</span>)}
          </div>
        </div>
        <div className="stage-action">
          <button className="primary-button" disabled={busy} type="submit">
            {busy ? <Loader2 className="spin" size={18} /> : <Rocket size={18} />}
            {stage.action}
          </button>
        </div>
      </div>

      {(activeStage === "trend" || activeStage === "predict") ? (
        <TrendIntelligencePanel
          category={trendCategory}
          onCategoryChange={onTrendCategoryChange}
          platform={trendPlatform}
          onPlatformChange={onTrendPlatformChange}
          topN={topN}
          onTopNChange={onTopNChange}
          report={trendReport}
        />
      ) : null}

      {activeStage === "collect" ? (
        <CollectPanel
          form={form}
          assets={workspaceAssets?.assets ?? []}
          analysisBusy={analysisBusy}
          materialBusy={materialBusy}
          researchBusy={researchBusy}
          researchReport={researchReport}
          evidenceBusy={evidenceBusy}
          evidenceReport={evidenceReport}
          onAnalyzeMaterial={onAnalyzeMaterial}
          onImportMaterial={onImportMaterial}
          onRunTikHubResearch={onRunTikHubResearch}
          onRunEvidenceSearch={onRunEvidenceSearch}
          update={update}
        />
      ) : null}
      {activeStage === "analyze" ? <AnalyzePanel form={form} update={update} /> : null}
      {activeStage === "script" ? (
        <ScriptPanel
          form={form}
          update={update}
          draft={scriptDraft}
          scriptPlanBusy={scriptPlanBusy}
          remotionBusy={remotionBusy}
          fullChainBusy={fullChainBusy}
          fullChainResult={fullChainResult}
          evidenceCount={evidenceReport?.results.length ?? 0}
          bgmPickBusy={bgmPickBusy}
          onCreatePlanFromScript={onCreatePlanFromScript}
          onRenderScriptPackage={onRenderScriptPackage}
          onRunFullChain={onRunFullChain}
          onAutoPickBgm={onAutoPickBgm}
        />
      ) : null}
      {activeStage === "edit" ? (
        <EditPanel
          form={form}
          assets={workspaceAssets?.assets ?? []}
          renderAnalysisBusy={renderAnalysisBusy}
          onRenderFromAnalysis={onRenderFromAnalysis}
          update={update}
        />
      ) : null}
      {activeStage === "publish" ? (
        <PublishPanel
          form={form}
          assets={workspaceAssets?.assets ?? []}
          variantBusy={variantBusy}
          onGeneratePlatformVariants={onGeneratePlatformVariants}
          publishDryRunBusy={publishDryRunBusy}
          publishQueueBusy={publishQueueBusy}
          publishApproveBusy={publishApproveBusy}
          publishDispatchBusy={publishDispatchBusy}
          publishPreflightBusy={publishPreflightBusy}
          publishDryRunResult={publishDryRunResult}
          publishDispatchResult={publishDispatchResult}
          publishPreflightResult={publishPreflightResult}
          publishQueue={publishQueue}
          publishAdapters={publishAdapters}
          onPublishDryRun={onPublishDryRun}
          onCreatePublishQueue={onCreatePublishQueue}
          onApprovePublishQueue={onApprovePublishQueue}
          onDispatchPublishQueue={onDispatchPublishQueue}
          onRunPublishPreflight={onRunPublishPreflight}
          update={update}
        />
      ) : null}
      {activeStage === "review" ? (
        <ReviewPanel
          analyticsBusy={analyticsBusy}
          analyticsSnapshots={analyticsSnapshots}
          form={form}
          n8nBusy={n8nBusy}
          n8nResult={n8nResult}
          onImportAnalytics={onImportAnalytics}
          onTriggerN8n={onTriggerN8n}
          readiness={readiness}
          update={update}
        />
      ) : null}
      {activeStage === "selfcheck" ? (
        <SelfCheckPanel busy={selfCheckBusy} report={selfCheckReport} onRun={onRunSelfCheck} />
      ) : null}
    </section>
  );
}

function SelfCheckPanel({
  busy,
  report,
  onRun
}: {
  busy: boolean;
  report: SelfCheckReport | null;
  onRun: () => void;
}) {
  useEffect(() => {
    if (!report) {
      void onRun();
    }
    // 仅在面板首次打开时自动跑一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const statusLabel: Record<string, string> = {
    ok: "可用",
    down: "已断",
    degraded: "未接线",
    unconfigured: "未配置"
  };
  const pillClass: Record<string, string> = {
    ok: "ok",
    down: "down",
    degraded: "missing",
    unconfigured: "unconfigured"
  };
  const services = report?.items.filter((item) => item.category === "service") ?? [];
  const localCaps = report?.items.filter((item) => item.category === "capability") ?? [];

  return (
    <div className="material-import">
      <div className="material-import-actions">
        <button className="primary-button" disabled={busy} onClick={onRun} type="button">
          {busy ? <Loader2 className="spin" size={18} /> : <Gauge size={18} />}
          {busy ? "自检中…" : "重新自检"}
        </button>
        {report ? (
          <span className="hint-pill">
            {report.summary.ok}/{report.summary.total} 可用
            {report.summary.down ? ` · ${report.summary.down} 断` : ""}
            {report.summary.degraded ? ` · ${report.summary.degraded} 未接线` : ""}
            {report.summary.unconfigured ? ` · ${report.summary.unconfigured} 未配置` : ""}
          </span>
        ) : null}
      </div>

      {report ? (
        <>
          <SelfCheckGroup title="在线服务" items={services} statusLabel={statusLabel} pillClass={pillClass} />
          <SelfCheckGroup title="本地能力" items={localCaps} statusLabel={statusLabel} pillClass={pillClass} />
          <p className="check-detail" style={{ marginTop: 12 }}>
            检查时间 {new Date(report.checkedAt).toLocaleString()}
          </p>
        </>
      ) : (
        <p className="check-detail">{busy ? "正在探测各服务…" : "点击运行自检。"}</p>
      )}
    </div>
  );
}

function SelfCheckGroup({
  title,
  items,
  statusLabel,
  pillClass
}: {
  title: string;
  items: SelfCheckItem[];
  statusLabel: Record<string, string>;
  pillClass: Record<string, string>;
}) {
  if (items.length === 0) {
    return null;
  }
  return (
    <div className="selfcheck-group">
      <h4>{title}</h4>
      {items.map((item) => (
        <div key={item.id} className={`selfcheck-row status-${item.status}`}>
          <div className="selfcheck-row-head">
            <span className={`pill ${pillClass[item.status] ?? "missing"}`}>
              {statusLabel[item.status] ?? item.status}
            </span>
            <strong>{item.label}</strong>
          </div>
          <small>{item.detail}</small>
          {item.hint ? <code>{item.hint}</code> : null}
        </div>
      ))}
    </div>
  );
}

function TrendIntelligencePanel({
  category,
  onCategoryChange,
  platform,
  onPlatformChange,
  topN,
  onTopNChange,
  report
}: {
  category: string;
  onCategoryChange: (value: string) => void;
  platform: string;
  onPlatformChange: (value: string) => void;
  topN: number;
  onTopNChange: (value: number) => void;
  report: IntelligenceReport | null;
}) {
  return (
    <div className="stage-layout trend-layout">
      <section className="trend-controls">
        <label className="field">
          <span>平台</span>
          <select value={platform} onChange={(event) => onPlatformChange(event.target.value)}>
            <option value="bilibili">B站（真实榜单）</option>
            <option value="kuaishou">快手（TikHub 热榜）</option>
            <option value="youtube">YouTube（需 YOUTUBE_API_KEY）</option>
            <option value="douyin">抖音（TikHub 热榜）</option>
          </select>
        </label>
        <label className="field">
          <span>分类 / 榜单类型</span>
          <select value={category} onChange={(event) => onCategoryChange(event.target.value)}>
            {biliCategories.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>抓取数量</span>
          <input
            min={1}
            max={50}
            type="number"
            value={topN}
            onChange={(event) => onTopNChange(Number(event.target.value))}
          />
        </label>
        <small>潜力分 = 互动率 × 播放速度，置信度 = 数据支撑强度;不承诺“必火”。</small>
      </section>

      {!report ? (
        <section className="trend-empty">
          <Flame size={28} />
          <span>点击“生成热点情报”后，这里会展示真实榜单、潜力分、置信度和 AI 分析状态。</span>
        </section>
      ) : (
        <TrendReport report={report} />
      )}
    </div>
  );
}

function TrendReport({ report }: { report: IntelligenceReport }) {
  return (
    <section className="trend-report">
      {report.aiStatus === "failed" ? (
        <p className="trend-degraded">AI 分析未启用或失败：以下仅展示真实榜单和客观评分。配置 DEEPSEEK_API_KEY 后可生成爆火逻辑和可模仿选题卡。</p>
      ) : null}

      <ol className="trend-list">
        {report.items.map((item, index) => (
          <li className="trend-item" key={item.id}>
            <div className="trend-rank">{index + 1}</div>
            <div className="trend-main">
              <a href={item.url} target="_blank" rel="noreferrer"><strong>{item.title}</strong></a>
              <small>{item.author} / {item.category || report.category}</small>
              <div className="trend-metrics">
                <span><Gauge size={14} /> 潜力 {item.potentialScore}</span>
                <span><Target size={14} /> 置信 {item.confidence}</span>
                <span>播放 {formatCount(item.metrics.views)}</span>
                <span>赞 {formatCount(item.metrics.likes)}</span>
                <span>互动率 {(item.signals.engagementRate * 100).toFixed(1)}%</span>
              </div>
              {item.viralLogic ? <p className="trend-logic">{item.viralLogic}</p> : null}
            </div>
          </li>
        ))}
      </ol>

      {report.patterns.length > 0 ? (
        <div className="trend-patterns">
          <strong>共性套路</strong>
          <ul>{report.patterns.map((pattern) => <li key={pattern}>{pattern}</li>)}</ul>
        </div>
      ) : null}

      {report.topicCards.length > 0 ? (
        <div className="trend-cards">
          <strong>可模仿选题卡</strong>
          {report.topicCards.map((card) => (
            <article className="topic-card" key={card.angle + card.hook}>
              <strong>{card.angle}</strong>
              <p>钩子：{card.hook}</p>
              <p>结构：{card.structure}</p>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function CollectPanel({
  form,
  update,
  assets,
  materialBusy,
  analysisBusy,
  researchBusy,
  researchReport,
  evidenceBusy,
  evidenceReport,
  onImportMaterial,
  onAnalyzeMaterial,
  onRunTikHubResearch,
  onRunEvidenceSearch
}: FormPanelProps & {
  assets: WorkspaceAsset[];
  materialBusy: boolean;
  analysisBusy: boolean;
  researchBusy: boolean;
  researchReport: TikHubResearchReport | null;
  evidenceBusy: boolean;
  evidenceReport: EvidenceReport | null;
  onImportMaterial: () => void;
  onAnalyzeMaterial: () => void;
  onRunTikHubResearch: () => void;
  onRunEvidenceSearch: () => void;
}) {
  const analyzableAssets = assets
    .filter((asset) => asset.role === "input" && (asset.kind === "manifest" || asset.kind === "video"))
    .slice(0, 5);

  return (
    <div className="stage-layout collect-layout">
      <section className="tool-grid">
        <StageCard icon={Search} title="搜索与热点" body="Exa、Firecrawl、TikHub/KSD 找热点、标题、参考链接。" />
        <StageCard icon={DownloadCloud} title="视频素材导入" body="yt-dlp 把可合法使用的视频、字幕、元数据入库。" />
        <StageCard icon={FileJson} title="素材目录" body="统一落盘 references / raw / broll / audio。" />
      </section>

      <section className="stage-form-card material-import-card research-card">
        <div className="form-card-title">
          <strong>TikHub / KSD 爆款研究</strong>
          <span>关键词搜索走 TikHub；快手单视频详情可走本地 KS-Downloader 免费路径。</span>
        </div>
        <div className="form-grid">
          <label className="field">
            <span>平台</span>
            <select value={form.researchPlatform} onChange={(event) => update("researchPlatform", event.target.value)}>
              <option value="douyin">抖音</option>
              <option value="kuaishou">快手</option>
            </select>
          </label>
          <Field label="关键词" value={form.researchQuery} onChange={(value) => update("researchQuery", value)} />
          <Field label="爆款链接 / 分享文本" value={form.researchUrl} onChange={(value) => update("researchUrl", value)} />
          <Field label="视频 ID" value={form.researchItemId} onChange={(value) => update("researchItemId", value)} />
        </div>
        <label className="toggle-row">
          <input checked={form.researchIncludeComments} onChange={(event) => update("researchIncludeComments", event.target.checked)} type="checkbox" />
          <span>抓取评论样本</span>
        </label>
        <div className="material-import-actions">
          <button className="primary-button" disabled={researchBusy} onClick={onRunTikHubResearch} type="button">
            {researchBusy ? <Loader2 className="spin" size={18} /> : <Search size={18} />}
            研究爆款信号
          </button>
          <small>关键词/评论需要 TIKHUB_API_KEY；快手详情可配置 KSD_BASE_URL。结果只用于结构参考和合规素材选择。</small>
        </div>
        {researchReport ? (
          <div className="research-result">
            <div className="research-stats">
              <span>{researchReport.searchItems.length} 搜索结果</span>
              <span>{researchReport.detail ? "1 个详情" : "无详情"}</span>
              <span>{researchReport.comments.length} 评论样本</span>
            </div>
            {researchReport.materialCandidates.length ? (
              <div className="research-candidates">
                {researchReport.materialCandidates.slice(0, 5).map((candidate) => (
                  <article className="research-candidate" key={`${candidate.source}-${candidate.url}`}>
                    <strong>{candidate.title}</strong>
                    <small>{candidate.source} / {candidate.reason}</small>
                    <button className="secondary-button" onClick={() => update("materialUrl", candidate.url)} type="button">
                      填入导入链接
                    </button>
                  </article>
                ))}
              </div>
            ) : null}
            {researchReport.nextActions.length ? (
              <ul className="research-actions">
                {researchReport.nextActions.map((action) => <li key={action}>{action}</li>)}
              </ul>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="stage-form-card material-import-card research-card">
        <div className="form-card-title">
          <strong>网页事实证据搜索</strong>
          <span>Exa / Firecrawl 真实搜索;只用于脚本的事实背书,不抓视频画面。</span>
        </div>
        <div className="form-grid">
          <Field label="关键词(复用上面的研究关键词)" value={form.researchQuery} onChange={(value) => update("researchQuery", value)} />
          <label className="field">
            <span>证据源</span>
            <select value={form.evidenceProvider} onChange={(event) => update("evidenceProvider", event.target.value)}>
              <option value="auto">自动(有谁用谁)</option>
              <option value="exa">Exa(需 EXA_API_KEY)</option>
              <option value="firecrawl">Firecrawl(需 FIRECRAWL_API_KEY)</option>
            </select>
          </label>
        </div>
        <div className="material-import-actions">
          <button className="primary-button" disabled={evidenceBusy} onClick={onRunEvidenceSearch} type="button">
            {evidenceBusy ? <Loader2 className="spin" size={18} /> : <Search size={18} />}
            搜索事实证据
          </button>
          <small>需要 EXA_API_KEY 或 FIRECRAWL_API_KEY;未配置会明确报错,不返回伪造结果。</small>
        </div>
        {evidenceReport ? (
          <div className="research-result">
            <div className="research-stats">
              <span>{evidenceReport.provider}</span>
              <span>{evidenceReport.results.length} 条结果</span>
            </div>
            {evidenceReport.results.length ? (
              <div className="research-candidates">
                {evidenceReport.results.slice(0, 5).map((item) => (
                  <article className="research-candidate" key={item.url}>
                    <strong>{item.title}</strong>
                    <small>
                      <a href={item.url} target="_blank" rel="noreferrer">{item.url}</a>
                      {item.publishedAt ? ` · ${item.publishedAt.slice(0, 10)}` : ""}
                    </small>
                    {item.snippet ? <p className="evidence-snippet">{item.snippet}</p> : null}
                  </article>
                ))}
              </div>
            ) : null}
            {evidenceReport.nextActions.length ? (
              <ul className="research-actions">
                {evidenceReport.nextActions.map((action) => <li key={action}>{action}</li>)}
              </ul>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="stage-form-card material-import-card">
        <div className="form-card-title">
          <strong>导入参考素材</strong>
          <span>保存视频/音频、封面、字幕、info.json 和 manifest.json</span>
        </div>
        <Field label="公开视频链接" value={form.materialUrl} onChange={(value) => update("materialUrl", value)} />
        <Field label="素材集合名" value={form.materialCollection} onChange={(value) => update("materialCollection", value)} />
        <label className="field">
          <span>导入质量</span>
          <select value={form.materialQuality} onChange={(event) => update("materialQuality", event.target.value)}>
            <option value="720p">720p 推荐</option>
            <option value="1080p">1080p</option>
            <option value="480p">480p</option>
            <option value="best">最佳质量</option>
            <option value="audio">仅音频 MP3</option>
            <option value="metadata">仅元数据</option>
          </select>
        </label>
        <div className="material-import-actions">
          <button className="primary-button" disabled={materialBusy} onClick={onImportMaterial} type="button">
            {materialBusy ? <Loader2 className="spin" size={18} /> : <DownloadCloud size={18} />}
            导入参考素材
          </button>
          <small>只导入你有权使用的内容;登录态平台可配 YTDLP_COOKIES_PATH。</small>
        </div>
      </section>

      <section className="stage-form-card material-import-card">
        <div className="form-card-title">
          <strong>分析素材信号</strong>
          <span>读取最新 manifest 或本地视频，输出字幕片段、场景变化和候选切点 analysis JSON</span>
        </div>
        <Field label="素材目录 / manifest / 视频路径" value={form.materialAnalysisPath} onChange={(value) => update("materialAnalysisPath", value)} />
        <div className="form-grid">
          <label className="field">
            <span>转写模式</span>
            <select value={form.materialTranscriptionMode} onChange={(event) => update("materialTranscriptionMode", event.target.value)}>
              <option value="auto">字幕优先，缺字幕用 faster-whisper</option>
              <option value="subtitle-only">只读字幕文件</option>
              <option value="faster-whisper">强制 faster-whisper</option>
            </select>
          </label>
          <label className="field">
            <span>Whisper 模型</span>
            <select value={form.whisperModel} onChange={(event) => update("whisperModel", event.target.value)}>
              <option value="tiny">tiny 快速验证</option>
              <option value="base">base</option>
              <option value="small">small</option>
              <option value="medium">medium</option>
            </select>
          </label>
          <Field label="语言" value={form.whisperLanguage} onChange={(value) => update("whisperLanguage", value)} />
          <label className="field">
            <span>场景检测</span>
            <select value={form.sceneBackend} onChange={(event) => update("sceneBackend", event.target.value)}>
              <option value="auto">PySceneDetect 优先，失败回退 FFmpeg</option>
              <option value="pyscenedetect">强制 PySceneDetect</option>
              <option value="ffmpeg">FFmpeg scene 基线</option>
            </select>
          </label>
        </div>
        <label className="toggle-row">
          <input checked={form.autoEditorEnabled} onChange={(event) => update("autoEditorEnabled", event.target.checked)} type="checkbox" />
          <span>运行 Auto-Editor 预览信号</span>
        </label>
        <div className="material-import-actions">
          <button className="primary-button" disabled={analysisBusy} onClick={onAnalyzeMaterial} type="button">
            {analysisBusy ? <Loader2 className="spin" size={18} /> : <FileJson size={18} />}
            分析素材
          </button>
          <small>字幕优先，缺字幕走本地 faster-whisper ASR;场景检测 + 跳剪预览。</small>
        </div>
      </section>
      <AssetQuickList
        actionLabel="填入分析路径"
        assets={analyzableAssets}
        empty="还没有可分析的 manifest 或视频。先导入素材，或把本地视频放进 workspace/input。"
        onUse={(asset) => update("materialAnalysisPath", asset.relativePath)}
        title="最近可分析素材"
      />
    </div>
  );
}

function AnalyzePanel({ form, update }: FormPanelProps) {
  return (
    <div className="stage-layout analyze-layout">
      <section className="stage-form-card">
        <Field label="参考爆款链接/标题" multiline value={form.references} onChange={(value) => update("references", value)} />
        <Field label="想模仿的爆款风格" multiline value={form.competitorStyle} onChange={(value) => update("competitorStyle", value)} />
      </section>
      <section className="analysis-strip">
        <StageCard icon={Search} title="只拆方法" body="拆开头、节奏、评论引导和留存结构，不搬运画面和原文案。" />
        <StageCard icon={Scissors} title="剪辑信号" body="后续接 ASR、PySceneDetect、Auto-Editor 后，用真实信号选择片段。" />
        <StageCard icon={FileJson} title="decision JSON" body="当前按钮生成自动剪辑计划，作为后续 rough cut 的输入。" />
      </section>
    </div>
  );
}

function ScriptPanel({
  form,
  update,
  draft,
  scriptPlanBusy,
  remotionBusy,
  fullChainBusy,
  fullChainResult,
  evidenceCount,
  bgmPickBusy,
  onCreatePlanFromScript,
  onRenderScriptPackage,
  onRunFullChain,
  onAutoPickBgm
}: FormPanelProps & {
  draft: ScriptDraft | null;
  scriptPlanBusy: boolean;
  remotionBusy: boolean;
  fullChainBusy: boolean;
  fullChainResult: FullChainResult | null;
  evidenceCount: number;
  bgmPickBusy: boolean;
  onCreatePlanFromScript: () => void;
  onRenderScriptPackage: () => void;
  onRunFullChain: () => void;
  onAutoPickBgm: () => void;
}) {
  return (
    <div className="stage-layout script-layout">
      <section className="stage-form-card">
        <Field label="选题（来自热点选题卡或自己写）" multiline value={form.scriptTopic} onChange={(value) => update("scriptTopic", value)} />
        <Field label="目标人群" value={form.audience} onChange={(value) => update("audience", value)} />
        <Field label="参考爆款（只借鉴方法，每行一个）" multiline value={form.references} onChange={(value) => update("references", value)} />
        <small className="hint">
          LLM 产出可直接开拍的分镜脚本;未配 key 会明确报错，不出假模板。
          {evidenceCount > 0 ? (
            <span className="hint-pill"> · 已挂载 {evidenceCount} 条网页事实证据,会自动喂给 LLM 引用</span>
          ) : null}
        </small>
        <div className="full-chain-config">
          <label className="toggle-row">
            <input checked={form.narrated} onChange={(event) => update("narrated", event.target.checked)} type="checkbox" />
            <span>AI 配音口播（TTS 合成 + 成片按配音时长动态对齐）</span>
          </label>
          {form.narrated ? (
            <label className="field">
              <span>配音引擎</span>
              <select value={form.ttsProvider} onChange={(event) => update("ttsProvider", event.target.value)}>
                <option value="edge">edge-tts（neural 中文，音质好，需联网）</option>
                <option value="sapi">SAPI（本地保底，零依赖）</option>
              </select>
            </label>
          ) : null}
          <Field label="BGM 音频路径（可选，本地 mp3/wav/m4a）" value={form.bgmPath} onChange={(value) => update("bgmPath", value)} />
          <div className="material-import-actions">
            <button className="secondary-button" disabled={bgmPickBusy} onClick={onAutoPickBgm} type="button">
              {bgmPickBusy ? <Loader2 className="spin" size={16} /> : <Sparkles size={16} />}
              AI 选曲(读 workspace/input/audio)
            </button>
            <small>按脚本 LLM 推荐曲风扫本地库匹配;库空时引导你下 CC0 mp3 到该目录。</small>
          </div>
          <div className="form-grid">
            <label className="field">
              <span>BGM 音量</span>
              <input
                max={1}
                min={0}
                step={0.01}
                type="number"
                value={form.bgmVolume}
                onChange={(event) => update("bgmVolume", Number(event.target.value))}
              />
            </label>
            <label className="field">
              <span>口播音量</span>
              <input
                disabled={!form.narrated}
                max={2}
                min={0}
                step={0.05}
                type="number"
                value={form.narrationVolume}
                onChange={(event) => update("narrationVolume", Number(event.target.value))}
              />
            </label>
          </div>
        </div>
        <div className="material-import-actions full-chain-action">
          <button className="primary-button" disabled={fullChainBusy} onClick={onRunFullChain} type="button">
            {fullChainBusy ? <Loader2 className="spin" size={18} /> : <Rocket size={18} />}
            {form.narrated ? "一键全链路：选题 → AI 配音成片 → 多平台" : "一键全链路：选题 → 成片 → 多平台"}
          </button>
          <small>脚本 →{form.narrated ? " AI 配音 +" : ""} Remotion 成片{form.bgmPath.trim() ? " + BGM混音" : ""} → 抖音/快手/B站多平台变体，一步到位(约 2-4 分钟{form.narrated ? "，配音版略长" : ""})。</small>
        </div>
        {fullChainResult ? (
          <div className="full-chain-result">
            <strong>全链路产出：{fullChainResult.draft.titles[0] ?? fullChainResult.topic}</strong>
            <p className="hint">成片：{fullChainResult.packageVideoPath}</p>
            {fullChainResult.narration ? (
              <p className="hint">配音：{fullChainResult.narration.provider}/{fullChainResult.narration.voice} · {fullChainResult.narration.durationSec.toFixed(1)}s</p>
            ) : null}
            {fullChainResult.bgm ? (
              <p className="hint">BGM：{fullChainResult.bgm.audioPath} · 音量 {fullChainResult.bgm.volume}</p>
            ) : null}
            <ul>
              {fullChainResult.variants.variants.map((variant) => (
                <li key={variant.id}>{variant.label} · {variant.width}×{variant.height}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>
      {draft ? (
        <section className="script-result">
          <div className="script-titles">
            <strong>候选标题</strong>
            <ul>{draft.titles.map((title) => <li key={title}>{title}</li>)}</ul>
          </div>
          <p className="script-hook"><strong>开场钩子：</strong>{draft.hook}</p>
          <ol className="script-beats">
            {draft.beats.map((beat, index) => (
              <li key={index} className="script-beat">
                <span className="beat-time">{beat.time}</span>
                <div className="beat-body">
                  <p><strong>画面：</strong>{beat.shot}</p>
                  <p><strong>口播：</strong>{beat.voiceover}</p>
                  <p><strong>字幕：</strong>{beat.caption}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="script-bgm"><strong>配乐：</strong>{draft.bgm}</p>
          <p className="script-tags">{draft.tags.map((tag) => <span key={tag}>{tag.startsWith("#") ? tag : `#${tag}`}</span>)}</p>
          {draft.platformTips ? <p className="script-tips"><strong>平台适配：</strong>{draft.platformTips}</p> : null}
          {draft.citedSources && draft.citedSources.length > 0 ? (
            <div className="script-cited">
              <strong>事实引用</strong>
              <ul>
                {draft.citedSources.map((source) => (
                  <li key={source.url}>
                    <a href={source.url} target="_blank" rel="noreferrer">{source.url}</a>
                    {source.used ? <span> — {source.used}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="material-import-actions">
            <button className="primary-button" disabled={scriptPlanBusy} onClick={onCreatePlanFromScript} type="button">
              {scriptPlanBusy ? <Loader2 className="spin" size={18} /> : <FileJson size={18} />}
              转自动剪辑计划
            </button>
            <small>按分镜生成 decision JSON，落到 workspace/drafts。</small>
          </div>
          <div className="material-import-actions">
            <button className="primary-button" disabled={remotionBusy} onClick={onRenderScriptPackage} type="button">
              {remotionBusy ? <Loader2 className="spin" size={18} /> : <Sparkles size={18} />}
              渲染包装视频
            </button>
            <small>Remotion 渲染带字幕和进度条的成片 MP4。</small>
          </div>
        </section>
      ) : (
        <section className="script-preview">
          <strong>真实输出（点“生成脚本方案”后显示）</strong>
          <ol>
            <li>候选标题和前 3 秒钩子。</li>
            <li>分镜节拍：时间 / 画面 / 口播 / 字幕。</li>
            <li>配乐建议和话题标签。</li>
            <li>平台适配建议。</li>
          </ol>
        </section>
      )}
    </div>
  );
}

function EditPanel({ form, update, assets, renderAnalysisBusy, onRenderFromAnalysis }: FormPanelProps & {
  assets: WorkspaceAsset[];
  renderAnalysisBusy: boolean;
  onRenderFromAnalysis: () => void;
}) {
  const analysisAssets = assets.filter((asset) => asset.kind === "material-analysis").slice(0, 5);

  return (
    <div className="stage-layout edit-layout">
      <section className="edit-pipeline">
        <StageCard icon={Scissors} title="1. 生成测试素材" body="当前可真实生成本地测试视频，证明链路能跑。" />
        <StageCard icon={Scissors} title="2. 裁剪三段" body="FFmpeg clip 输出 hook、demo、ending 三段。" />
        <StageCard icon={Files} title="3. 合成 rough cut" body="FFmpeg merge 生成 MP4。" />
        <StageCard icon={FileJson} title="4. 剪映计划" body="输出 JianYing plan JSON，后续接真实 MCP 草稿。" />
      </section>
      <section className="stage-form-card compact">
        <div className="form-card-title">
          <strong>用素材分析结果粗剪</strong>
          <span>读取 material-analysis JSON 的 candidate clips，真实调用 FFmpeg 裁片、合并，并输出 JianYing plan</span>
        </div>
        <Field label="分析 JSON / drafts 目录" value={form.roughCutAnalysisPath} onChange={(value) => update("roughCutAnalysisPath", value)} />
        <div className="material-import-actions">
          <button className="primary-button" disabled={renderAnalysisBusy} onClick={onRenderFromAnalysis} type="button">
            {renderAnalysisBusy ? <Loader2 className="spin" size={18} /> : <Scissors size={18} />}
            用分析结果粗剪
          </button>
          <small>默认读最新 material-analysis JSON，也可填具体路径。</small>
        </div>
      </section>
      <section className="stage-form-card compact">
        <Field label="素材需求" multiline value={form.materialNeeds} onChange={(value) => update("materialNeeds", value)} />
      </section>
      <AssetQuickList
        actionLabel="用于粗剪"
        assets={analysisAssets}
        empty="还没有素材分析 JSON。先到“联网素材”里分析一个视频或 manifest。"
        onUse={(asset) => update("roughCutAnalysisPath", asset.relativePath)}
        title="最近分析结果"
      />
    </div>
  );
}

function PublishPanel({
  form,
  update,
  assets,
  variantBusy,
  onGeneratePlatformVariants,
  publishDryRunBusy,
  publishQueueBusy,
  publishApproveBusy,
  publishDispatchBusy,
  publishPreflightBusy,
  publishDryRunResult,
  publishDispatchResult,
  publishPreflightResult,
  publishQueue,
  publishAdapters,
  onPublishDryRun,
  onCreatePublishQueue,
  onApprovePublishQueue,
  onDispatchPublishQueue,
  onRunPublishPreflight
}: FormPanelProps & {
  assets: WorkspaceAsset[];
  variantBusy: boolean;
  onGeneratePlatformVariants: () => void;
  publishDryRunBusy: boolean;
  publishQueueBusy: boolean;
  publishApproveBusy: boolean;
  publishDispatchBusy: boolean;
  publishPreflightBusy: boolean;
  publishDryRunResult: PublishDryRunResult | null;
  publishDispatchResult: PublishDispatchResult | null;
  publishPreflightResult: PublishPreflightReport | null;
  publishQueue: PublishQueueItem[];
  publishAdapters: PublishAdapterStatus[];
  onPublishDryRun: () => void;
  onCreatePublishQueue: () => void;
  onApprovePublishQueue: (id: string) => void;
  onDispatchPublishQueue: (id: string) => void;
  onRunPublishPreflight: () => void;
}) {
  const outputVideos = assets
    .filter((asset) => asset.kind === "video" && asset.role === "output")
    .slice(0, 6);

  return (
    <div className="stage-layout publish-layout">
      <section className="stage-form-card">
        <Field label="运营目标" value={form.campaignGoal} onChange={(value) => update("campaignGoal", value)} />
        <Field label="发布参考风格" multiline value={form.competitorStyle} onChange={(value) => update("competitorStyle", value)} />
        <PlatformSelector form={form} update={update} />
      </section>
      <section className="stage-form-card compact">
        <div className="form-card-title">
          <strong>生成平台视频版本</strong>
          <span>把粗剪 MP4 转成抖音/快手 9:16、B站 16:9 和 1:1 方版，输出到 workspace/output/publish。</span>
        </div>
        <Field label="源视频 / output 目录" value={form.publishSourcePath} onChange={(value) => update("publishSourcePath", value)} />
        <div className="material-import-actions">
          <button className="primary-button" disabled={variantBusy} onClick={onGeneratePlatformVariants} type="button">
            {variantBusy ? <Loader2 className="spin" size={18} /> : <UploadCloud size={18} />}
            生成平台版本
          </button>
          <small>可填具体 MP4 或 output 目录(自动取最新)。</small>
        </div>
      </section>
      <AssetQuickList
        actionLabel="作为源视频"
        assets={outputVideos}
        empty="还没有输出视频。先在“自动剪辑”里生成 rough cut。"
        onUse={(asset) => update("publishSourcePath", asset.relativePath)}
        title="最近输出视频"
      />
      <section className="stage-form-card compact">
        <div className="form-card-title">
          <strong>发布前 dry-run 校验</strong>
          <span>对成片做本地校验：文件 / 视频流 / 标题长度 / 标签数 / 画幅 / 时长，并预览发布载荷。不真发。</span>
        </div>
        <label className="field">
          <span>目标平台</span>
          <select value={form.publishDryRunPlatform} onChange={(event) => update("publishDryRunPlatform", event.target.value)}>
            <option value="douyin">抖音</option>
            <option value="kuaishou">快手</option>
            <option value="bilibili">B站</option>
          </select>
        </label>
        <Field label="成片路径（选具体 MP4，可用上方“作为源视频”填入）" value={form.publishSourcePath} onChange={(value) => update("publishSourcePath", value)} />
        <Field label="发布标题" value={form.publishDryRunTitle} onChange={(value) => update("publishDryRunTitle", value)} />
        <div className="material-import-actions">
          <button className="primary-button" disabled={publishDryRunBusy} onClick={onPublishDryRun} type="button">
            {publishDryRunBusy ? <Loader2 className="spin" size={18} /> : <CheckCircle2 size={18} />}
            dry-run 校验
          </button>
          <button className="secondary-button" disabled={publishQueueBusy} onClick={onCreatePublishQueue} type="button">
            {publishQueueBusy ? <Loader2 className="spin" size={16} /> : <UploadCloud size={16} />}
            加入待发布队列
          </button>
          <small>标签取自最近草稿；队列只保存待发布载荷和人工确认状态，当前版本不会真发。</small>
        </div>
        {publishDryRunResult ? (
          <div className={`publish-dryrun-result ${publishDryRunResult.willPublish ? "ok" : "blocked"}`}>
            <strong>{publishDryRunResult.platformLabel} · {publishDryRunResult.willPublish ? "可发布" : "有阻断项，先修复"}</strong>
            <ul>
              {publishDryRunResult.checks.map((check) => (
                <li key={check.label} className={`check-${check.status}`}>
                  <span className="check-label">{check.label}</span>
                  <span className="check-detail">{check.detail}</span>
                </li>
              ))}
            </ul>
            <small>{publishDryRunResult.note}</small>
          </div>
        ) : null}
      </section>
      <section className="stage-form-card compact publish-queue-card">
        <div className="material-import-actions">
          <button className="secondary-button" disabled={publishPreflightBusy} onClick={onRunPublishPreflight} type="button">
            {publishPreflightBusy ? <Loader2 className="spin" size={16} /> : <CheckCircle2 size={16} />}
            发布账号联调体检
          </button>
          <small>检查 Postiz API、integration id、social-auto-upload 登录态目录；不会上传或发布。</small>
        </div>
        {publishPreflightResult ? (
          <div className={`publish-dispatch-result ${publishPreflightResult.blockers.length === 0 ? "ok" : "blocked"}`}>
            <strong>preflight · {publishPreflightResult.blockers.length === 0 ? "ready" : `${publishPreflightResult.blockers.length} blockers`}</strong>
            <small>Postiz {publishPreflightResult.postiz.probeStatus} / integrations {publishPreflightResult.postiz.integrations.length}</small>
            <small>social-auto-upload {publishPreflightResult.socialAutoUpload.configured ? "configured" : "missing"}</small>
            {publishPreflightResult.blockers.slice(0, 3).map((blocker) => <code key={blocker}>{blocker}</code>)}
            {publishPreflightResult.nextActions.slice(0, 2).map((action) => <small key={action}>{action}</small>)}
          </div>
        ) : null}
        <div className="form-card-title">
          <strong>平台 adapter 与人工确认闸门</strong>
          <span>真实发布前必须 dry-run 通过，再输入确认口令进入 approved 队列；上传 adapter 仍保持关闭。</span>
        </div>
        <div className="adapter-grid">
          {publishAdapters.map((adapter) => (
            <article className="adapter-card" key={adapter.platform}>
              <strong>{adapter.platformLabel}</strong>
              <span className={adapter.configured ? "pill ok" : "pill missing"}>
                {adapter.adapter} / {adapter.configured ? "已配置" : "未配置"}
              </span>
              <small>{adapter.dryRunOnly ? "dry-run only · 不真发" : "可发布"}</small>
            </article>
          ))}
        </div>
        <Field label="人工确认口令" value={form.publishManualConfirm} onChange={(value) => update("publishManualConfirm", value)} />
        <div className="publish-queue-list">
          {publishQueue.length === 0 ? (
            <small>暂无待发布队列。先选择成片并点击“加入待发布队列”。</small>
          ) : publishQueue.slice(0, 6).map((item) => (
            <article className={`publish-queue-item status-${item.status}`} key={item.id}>
              <div>
                <strong>{item.dryRun.platformLabel} · {item.input.title}</strong>
                <small>{item.status} / {item.input.videoPath}</small>
              </div>
              {item.status === "ready" ? (
                <button
                  className="secondary-button"
                  disabled={publishApproveBusy}
                  onClick={() => onApprovePublishQueue(item.id)}
                  type="button"
                >
                  {publishApproveBusy ? <Loader2 className="spin" size={16} /> : <CheckCircle2 size={16} />}
                  人工批准
                </button>
              ) : item.status === "approved" ? (
                <button
                  className="secondary-button"
                  disabled={publishDispatchBusy}
                  onClick={() => onDispatchPublishQueue(item.id)}
                  type="button"
                >
                  {publishDispatchBusy ? <Loader2 className="spin" size={16} /> : <Rocket size={16} />}
                  dispatch 草稿
                </button>
              ) : (
                <span className="pill missing">{item.status}</span>
              )}
            </article>
          ))}
        </div>
        {publishDispatchResult ? (
          <div className="publish-dispatch-result">
            <strong>{publishDispatchResult.adapter} · {publishDispatchResult.status}</strong>
            <small>{publishDispatchResult.message}</small>
            {publishDispatchResult.endpoint ? <code>{publishDispatchResult.endpoint}</code> : null}
          </div>
        ) : null}
      </section>
      <section className="publish-board">
        <StageCard icon={Megaphone} title="抖音" body="9:16、强开头、标题短、评论引导。" />
        <StageCard icon={Megaphone} title="快手" body="9:16、人设强、真实生活场景。" />
        <StageCard icon={Megaphone} title="B站" body="16:9、结构完整、信息密度更高。" />
      </section>
    </div>
  );
}

function ReviewPanel({
  analyticsBusy,
  analyticsSnapshots,
  form,
  n8nBusy,
  n8nResult,
  onImportAnalytics,
  onTriggerN8n,
  readiness,
  update
}: {
  analyticsBusy: boolean;
  analyticsSnapshots: AnalyticsSnapshot[];
  form: CreatorForm;
  n8nBusy: boolean;
  n8nResult: N8nOrchestrationResult | null;
  onImportAnalytics: () => void;
  onTriggerN8n: (mode: "dry-run" | "webhook", exportWorkflow?: boolean) => void;
  readiness: Readiness | null;
  update: <K extends keyof CreatorForm>(key: K, value: CreatorForm[K]) => void;
}) {
  return (
    <div className="stage-layout review-layout">
      <section className="tool-grid">
        <StageCard icon={CheckCircle2} title="本机命令" body="node/npm/python/uv/yt-dlp/ffmpeg/n8n。" />
        <StageCard icon={BarChart3} title="数据复盘" body="导入播放、完播、点赞、评论、涨粉指标，生成下一步动作。" />
        <StageCard icon={Rocket} title="下一轮动作" body="根据复盘决定追更、重剪、换标题或换选题。" />
      </section>
      <section className="stage-form-card compact n8n-card">
        <div className="form-card-title">
          <strong>n8n 全链路编排</strong>
          <span>把热点、脚本、成片、发布队列、dispatch 草稿和复盘导入串成 webhook 工作流。</span>
        </div>
        <div className="form-grid">
          <Field label="n8n webhook 确认口令" value={form.n8nManualConfirm} onChange={(value) => update("n8nManualConfirm", value)} />
          <Field label="成片路径 / 可选" value={form.publishSourcePath} onChange={(value) => update("publishSourcePath", value)} />
        </div>
        <div className="material-import-actions">
          <button className="primary-button" disabled={n8nBusy} onClick={() => onTriggerN8n("dry-run")} type="button">
            {n8nBusy ? <Loader2 className="spin" size={18} /> : <Network size={18} />}
            生成编排 payload
          </button>
          <button className="secondary-button" disabled={n8nBusy} onClick={() => onTriggerN8n("webhook")} type="button">
            {n8nBusy ? <Loader2 className="spin" size={16} /> : <Rocket size={16} />}
            触发 n8n webhook
          </button>
          <button className="secondary-button" disabled={n8nBusy} onClick={() => onTriggerN8n("dry-run", true)} type="button">
            {n8nBusy ? <Loader2 className="spin" size={16} /> : <FileJson size={16} />}
            导出 workflow JSON
          </button>
          <small>触发 webhook 需要填写 CONFIRM_N8N_WEBHOOK；payload 不包含任何 API key。</small>
        </div>
        {n8nResult ? (
          <div className={`publish-dispatch-result ${n8nResult.sent ? "ok" : "blocked"}`}>
            <strong>{n8nResult.status} · {n8nResult.sent ? "webhook 已发送" : "预览/拦截"}</strong>
            <small>{n8nResult.message}</small>
            {n8nResult.endpoint ? <code>{n8nResult.endpoint}</code> : null}
            {n8nResult.workflowExport ? <code>{n8nResult.workflowExport.workflowPath}</code> : null}
            <small>{n8nResult.payload.steps.length} steps / run {n8nResult.payload.runId.slice(0, 8)}</small>
          </div>
        ) : null}
      </section>
      <section className="stage-form-card compact analytics-card">
        <div className="form-card-title">
          <strong>导入平台数据快照</strong>
          <span>先支持手动/脚本导入，后续再接 TikHub/Postiz/平台 analytics 自动同步。</span>
        </div>
        <div className="form-grid">
          <label className="field">
            <span>复盘窗口</span>
            <select value={form.analyticsWindow} onChange={(event) => update("analyticsWindow", event.target.value)}>
              <option value="30m">30分钟</option>
              <option value="24h">24小时</option>
              <option value="7d">7天</option>
              <option value="custom">自定义</option>
            </select>
          </label>
          <Field label="Post ID" value={form.analyticsPostId} onChange={(value) => update("analyticsPostId", value)} />
          <Field label="Post URL" value={form.analyticsPostUrl} onChange={(value) => update("analyticsPostUrl", value)} />
        </div>
        <div className="form-grid analytics-metrics-grid">
          <NumberField label="播放" value={form.analyticsViews} onChange={(value) => update("analyticsViews", value)} />
          <NumberField label="点赞" value={form.analyticsLikes} onChange={(value) => update("analyticsLikes", value)} />
          <NumberField label="评论" value={form.analyticsComments} onChange={(value) => update("analyticsComments", value)} />
          <NumberField label="分享" value={form.analyticsShares} onChange={(value) => update("analyticsShares", value)} />
          <NumberField label="收藏" value={form.analyticsFavorites} onChange={(value) => update("analyticsFavorites", value)} />
          <NumberField label="涨粉" value={form.analyticsFollowersDelta} onChange={(value) => update("analyticsFollowersDelta", value)} />
          <NumberField label="完播率" max={1} min={0} step={0.01} value={form.analyticsCompletionRate} onChange={(value) => update("analyticsCompletionRate", value)} />
        </div>
        <div className="material-import-actions">
          <button className="primary-button" disabled={analyticsBusy} onClick={onImportAnalytics} type="button">
            {analyticsBusy ? <Loader2 className="spin" size={18} /> : <BarChart3 size={18} />}
            导入复盘快照
          </button>
          <small>会写入 workspace/drafts/analytics-ledger.json，并给出追更/重剪/换标题建议。</small>
        </div>
        <div className="analytics-snapshot-list">
          {analyticsSnapshots.length === 0 ? (
            <small>暂无复盘快照。</small>
          ) : analyticsSnapshots.slice(0, 5).map((snapshot) => (
            <article className="analytics-snapshot" key={snapshot.id}>
              <strong>{snapshot.platform} · {snapshot.window} · {snapshot.metrics.views} 播放</strong>
              <small>互动率 {(snapshot.signals.engagementRate * 100).toFixed(2)}% / 分享率 {(snapshot.signals.shareRate * 100).toFixed(2)}%</small>
              <ul>{snapshot.nextActions.slice(0, 2).map((action) => <li key={action}>{action}</li>)}</ul>
            </article>
          ))}
        </div>
      </section>
      {readiness?.llm ? (
        <section className="stage-form-card compact">
          <strong>LLM 体检</strong>
          <span className={readiness.llm.ok ? "pill ok" : "pill missing"}>
            {readiness.llm.ok ? "OK" : "KEY"} {readiness.llm.provider} / {readiness.llm.keyName}
          </span>
          <small>{readiness.llm.hint}</small>
        </section>
      ) : null}
    </div>
  );
}

interface FormPanelProps {
  form: CreatorForm;
  update: <K extends keyof CreatorForm>(key: K, value: CreatorForm[K]) => void;
}

function PlatformSelector({ form, update }: FormPanelProps) {
  return (
    <section className="selector-box">
      <strong>平台</strong>
      <label><input checked={form.douyin} onChange={(event) => update("douyin", event.target.checked)} type="checkbox" /> 抖音</label>
      <label><input checked={form.kuaishou} onChange={(event) => update("kuaishou", event.target.checked)} type="checkbox" /> 快手</label>
      <label><input checked={form.bilibili} onChange={(event) => update("bilibili", event.target.checked)} type="checkbox" /> B站</label>
    </section>
  );
}

function AssetQuickList({
  actionLabel,
  assets,
  empty,
  onUse,
  title
}: {
  actionLabel: string;
  assets: WorkspaceAsset[];
  empty: string;
  onUse: (asset: WorkspaceAsset) => void;
  title: string;
}) {
  return (
    <section className="stage-form-card asset-quick-list">
      <div className="form-card-title">
        <strong>{title}</strong>
        <span>workspace 真实文件，点击填入路径。</span>
      </div>
      {assets.length === 0 ? (
        <small>{empty}</small>
      ) : (
        <div className="asset-list">
          {assets.map((asset) => (
            <article className="asset-row" key={asset.id}>
              <FileJson size={16} />
              <div>
                <strong>{asset.fileName}</strong>
                <small>{asset.kind} / {formatBytes(asset.sizeBytes)} / {asset.relativePath}</small>
              </div>
              <button className="secondary-button" onClick={() => onUse(asset)} type="button">
                {actionLabel}
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function StageCard({
  icon: Icon,
  title,
  body
}: {
  icon: typeof Flame;
  title: string;
  body: string;
}) {
  return (
    <article className="stage-card">
      <Icon size={18} />
      <div>
        <strong>{title}</strong>
        <p>{body}</p>
      </div>
    </article>
  );
}

function Field({
  label,
  value,
  onChange,
  multiline = false
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
}) {
  return (
    <label className={multiline ? "field field-wide" : "field"}>
      <span>{label}</span>
      {multiline ? (
        <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={5} />
      ) : (
        <input value={value} onChange={(event) => onChange(event.target.value)} />
      )}
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min = 0,
  max,
  step = 1
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        max={max}
        min={min}
        step={step}
        type="number"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function TaskPanel({
  tasks,
  result,
  readiness,
  workspaceAssets
}: {
  tasks: TaskRecord[];
  result: unknown;
  readiness: Readiness | null;
  workspaceAssets: WorkspaceAssetIndex | null;
}) {
  const recentAssets = workspaceAssets?.assets
    .filter((asset) => ["video", "material-analysis", "jianying-plan", "manifest"].includes(asset.kind))
    .slice(0, 5) ?? [];

  return (
    <aside className="task-panel">
      <div className="panel-title">
        <div>
          <p>任务监控</p>
          <h2>{tasks.length}</h2>
        </div>
        <Files size={20} />
      </div>

      {readiness ? (
        <details className="panel-fold readiness-box">
          <summary>
            环境就绪
            <span className="fold-count">
              {[...readiness.commands, ...readiness.env, ...(readiness.llm ? [readiness.llm] : [])].filter((c) => c.ok).length}
              /{readiness.commands.length + readiness.env.length + (readiness.llm ? 1 : 0)}
            </span>
          </summary>
          <div className="readiness-grid">
            {readiness.commands.map((item) => (
              <span className={item.ok ? "pill ok" : "pill missing"} key={item.id}>
                {item.ok ? "OK" : "MISS"} {item.id}
              </span>
            ))}
            {readiness.env.map((item) => (
              <span className={item.ok ? "pill ok" : "pill missing"} key={item.name}>
                {item.ok ? "OK" : "KEY"} {item.name}
              </span>
            ))}
            {readiness.llm ? (
              <span className={readiness.llm.ok ? "pill ok" : "pill missing"}>
                {readiness.llm.ok ? "OK" : "KEY"} {readiness.llm.keyName}
              </span>
            ) : null}
          </div>
        </details>
      ) : null}

      {result ? (
        <details className="panel-fold">
          <summary>最新结果 JSON</summary>
          <pre>{JSON.stringify(result, null, 2)}</pre>
        </details>
      ) : null}

      <section className="result-box asset-summary">
        <strong>工作区资产</strong>
        <div className="asset-counts">
          <span>全部 {workspaceAssets?.total ?? 0}</span>
          <span>视频 {workspaceAssets?.counts.video ?? 0}</span>
          <span>分析 {workspaceAssets?.counts["material-analysis"] ?? 0}</span>
          <span>剪映计划 {workspaceAssets?.counts["jianying-plan"] ?? 0}</span>
        </div>
        {recentAssets.length === 0 ? (
          <small>暂无素材、分析或输出文件。</small>
        ) : (
          <div className="mini-asset-list">
            {recentAssets.map((asset) => (
              <div className="mini-asset" key={asset.id}>
                <span>{asset.kind}</span>
                <strong>{asset.fileName}</strong>
                <small>{formatBytes(asset.sizeBytes)}</small>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="task-list">
        {tasks.length > 0 ? (
          <div className="task-list-head">
            <span>最近任务</span>
            <small>共 {tasks.length} 条</small>
          </div>
        ) : null}
        {tasks.length === 0 ? (
          <div className="empty-state">
            <FileJson size={28} />
            <span>暂无任务</span>
          </div>
        ) : tasks.slice(0, 6).map((task) => (
          <article className="task-card" key={task.id}>
            <div className="task-head">
              <StatusIcon status={task.status} />
              <div>
                <strong>{task.label}</strong>
                <small>{task.type} / {new Date(task.updatedAt).toLocaleTimeString()}</small>
              </div>
            </div>
            <div className="progress-track">
              <span style={{ width: `${task.progress}%` }} />
            </div>
            <div className="task-meta">
              <span>{task.status}</span>
              <span>{task.progress}%</span>
            </div>
            {task.error ? <p className="task-error">{task.error}</p> : null}
          </article>
        ))}
      </div>
    </aside>
  );
}

function StatusIcon({ status }: { status: TaskStatus }) {
  if (status === "completed") {
    return <CheckCircle2 className="status completed" size={20} />;
  }
  if (status === "failed") {
    return <XCircle className="status failed" size={20} />;
  }
  if (status === "processing") {
    return <Loader2 className="status processing spin" size={20} />;
  }
  return <Clock3 className="status pending" size={20} />;
}

function creatorSuitePayload(form: CreatorForm) {
  return {
    niche: form.niche,
    audience: form.audience,
    persona: form.persona,
    platforms: [
      form.douyin ? "douyin" : "",
      form.kuaishou ? "kuaishou" : "",
      form.bilibili ? "bilibili" : ""
    ].filter(Boolean),
    keywords: splitLines(form.keywords),
    references: splitLines(form.references),
    materialNeeds: form.materialNeeds,
    campaignGoal: form.campaignGoal,
    competitorStyle: form.competitorStyle,
    webSearchEnabled: form.webSearchEnabled === "true",
    riskTolerance: "medium"
  };
}

function materialAnalysisPayload(value: string) {
  const trimmed = value.trim();
  if (/manifest\.json$/i.test(trimmed)) {
    return { manifestPath: trimmed };
  }
  if (/\.(mp4|mov|mkv|webm|avi|m4v)$/i.test(trimmed)) {
    return { videoPath: trimmed };
  }
  return { materialDir: trimmed };
}

function scriptDraftToAutoPlanPayload(draft: ScriptDraft, form: CreatorForm) {
  const title = draft.titles[0] ?? form.scriptTopic;
  const script = [
    `开场钩子：${draft.hook}`,
    ...draft.beats.map((beat) => `${beat.time} 画面:${beat.shot} 口播:${beat.voiceover} 字幕:${beat.caption}`),
    `配乐：${draft.bgm}`,
    `平台适配：${draft.platformTips}`
  ].filter(Boolean).join("\n");

  return {
    projectTitle: title,
    script,
    materialDir: "workspace/input",
    instructions: [
      "把文案分镜转成可执行自动剪辑 decision JSON。",
      "按每个 beat 寻找匹配素材，优先保留强钩子、清晰演示、结尾行动号召。",
      `目标人群：${form.audience}`,
      `素材需求：${form.materialNeeds}`,
      `话题标签：${draft.tags.join(" ")}`
    ].join("\n"),
    scenes: draft.beats.map((beat, index) => ({
      id: `beat-${String(index + 1).padStart(2, "0")}`,
      title: `${beat.time} ${beat.caption || beat.shot}`.slice(0, 48),
      keywords: sceneKeywords(beat),
      targetDurationMs: beatDurationMs(beat.time)
    })),
    style: {
      cutPace: "tight",
      colorLook: "clean high-retention social video",
      subtitleStyle: "large high-contrast captions",
      aspectRatio: form.bilibili && !form.douyin && !form.kuaishou ? "16:9" : "9:16"
    }
  };
}

function beatDurationMs(time: string) {
  const match = time.match(/(\d+(?:\.\d+)?)\s*[-~至到]\s*(\d+(?:\.\d+)?)/);
  if (!match) {
    return 6000;
  }
  const start = Number(match[1]);
  const end = Number(match[2]);
  const duration = Math.max(1, end - start);
  return Math.round(duration * 1000);
}

function sceneKeywords(beat: ScriptDraft["beats"][number]) {
  const text = `${beat.shot} ${beat.voiceover} ${beat.caption}`;
  const words = text
    .split(/[^\u4e00-\u9fa5a-zA-Z0-9]+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 2);
  return [...new Set(words)].slice(0, 8);
}

function splitLines(value: string) {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

async function pollTaskUntilDone(id: string, timeoutMs = 90000): Promise<TaskRecord | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const response = await fetch(`/api/tasks?id=${id}`, { cache: "no-store" });
    if (response.ok) {
      const { task } = await response.json();
      if (task && (task.status === "completed" || task.status === "failed")) {
        return task as TaskRecord;
      }
    }
  }
  return null;
}

function formatCount(value: number): string {
  if (value >= 10000) {
    return `${(value / 10000).toFixed(1)}万`;
  }
  return String(value);
}

function formatBytes(value: number): string {
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}
