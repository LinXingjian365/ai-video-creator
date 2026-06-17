"use client";

import { useEffect, useMemo, useState } from "react";
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
import type { ScriptDraft } from "@/lib/script/generate";

type TaskStatus = "pending" | "processing" | "completed" | "failed";
type WorkflowStage = "trend" | "collect" | "analyze" | "script" | "edit" | "publish" | "review" | "predict";
type StageEndpoint = "trend-report" | "script-generate" | "integrations" | "auto-plan" | "auto-simulate" | "creator-suite" | "readiness";

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
    body: "真实抓取 B站分区排行榜，按互动和速度打分，LLM 只解释不编数据",
    action: "生成热点情报",
    endpoint: "trend-report"
  },
  {
    id: "collect",
    icon: Network,
    title: "联网素材",
    body: "导入公开视频参考素材，并用 ASR、场景检测、静音检测生成素材信号",
    action: "查看工具目录",
    endpoint: "integrations"
  },
  {
    id: "analyze",
    icon: Search,
    title: "爆款拆解",
    body: "只拆爆款方法：开头、节奏、评论引导、留存结构，输出剪辑 decision JSON",
    action: "生成拆解计划",
    endpoint: "auto-plan"
  },
  {
    id: "script",
    icon: Sparkles,
    title: "文案脚本",
    body: "根据赛道、人群、参考视频生成钩子、脚本节拍和字幕风格",
    action: "生成脚本方案",
    endpoint: "script-generate"
  },
  {
    id: "edit",
    icon: Scissors,
    title: "自动剪辑",
    body: "读取分析 JSON 或模拟素材，真实调用 FFmpeg 裁剪、合并并输出剪映计划",
    action: "立即模拟剪辑",
    endpoint: "auto-simulate"
  },
  {
    id: "publish",
    icon: UploadCloud,
    title: "发布矩阵",
    body: "生成抖音、快手、B站发布包，真发前只做 dry-run 和人工确认",
    action: "生成发布包",
    endpoint: "creator-suite"
  },
  {
    id: "review",
    icon: BarChart3,
    title: "运营复盘",
    body: "检查本地命令、API Key、LLM 网关、剪映和发布工具是否就绪",
    action: "检查环境",
    endpoint: "readiness"
  },
  {
    id: "predict",
    icon: Rocket,
    title: "爆火预测",
    body: "基于真实榜单和确定性评分估算潜力，避免凭空给概率",
    action: "计算爆款指数",
    endpoint: "trend-report"
  }
];

const stageCopy: Record<WorkflowStage, { headline: string; description: string; proof: string[] }> = {
  trend: {
    headline: "B站真实热点情报",
    description: "选择分区后调用 `/api/trend/report`，先抓 B站公开排行榜，再用本地 scorer 计算潜力分和置信度。没有 LLM Key 时会明确降级为仅榜单，不伪装成 AI 成功。",
    proof: ["B站公开排行榜", "确定性评分", "LLM 可选", "诚实降级"]
  },
  collect: {
    headline: "联网素材导入与信号分析",
    description: "这个阶段负责把合法参考素材落到本地 workspace，并把视频转成可剪辑信号：字幕/ASR、场景切点、静音/有声段、Auto-Editor 预览。工具目录按钮会显示后续 Exa、Firecrawl、TikHub 的配置位。",
    proof: ["yt-dlp", "faster-whisper", "PySceneDetect", "Auto-Editor"]
  },
  analyze: {
    headline: "爆款拆解到剪辑计划",
    description: "这里只拆方法，不搬运内容。根据参考标题/链接和风格要求生成结构化 decision JSON，后续粗剪、剪映草稿和 Remotion 包装都可以接这个计划。",
    proof: ["参考链接", "开头节奏", "decision JSON", "创作边界"]
  },
  script: {
    headline: "仿创作脚本工厂",
    description: "根据赛道、人群、参考视频和运营目标生成可执行脚本、钩子、字幕风格和素材清单。这里是创作指导，不直接搬运原视频。",
    proof: ["钩子", "脚本节拍", "素材需求", "转化结尾"]
  },
  edit: {
    headline: "本地 FFmpeg 自动剪辑闭环",
    description: "现在已经能真实生成测试素材、裁剪片段、合并 rough cut，并输出 JianYing plan JSON。真实素材入库后复用同一条渲染链。",
    proof: ["FFmpeg", "clip", "merge", "JianYing plan"]
  },
  publish: {
    headline: "多平台发布包",
    description: "生成标题、标签、比例、发布时间和平台差异策略。真正上传要等 social-auto-upload/Postiz/n8n 配置完成，并且必须先 dry-run。",
    proof: ["抖音", "快手", "B站", "dry-run"]
  },
  review: {
    headline: "全链路环境体检",
    description: "检查本机命令、API Key、LLM provider、发布和编排工具。缺什么直接显示，不用假装已经接通。",
    proof: ["本地命令", "API Key", "LLM 网关", "下一步"]
  },
  predict: {
    headline: "用真实榜单做爆款潜力判断",
    description: "这不是玄学概率。潜力分来自互动率和播放速度，置信度来自数据完整度和新鲜度。AI 只负责解释共性套路和生成可模仿选题卡。",
    proof: ["潜力分", "置信度", "共性套路", "选题卡"]
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
  { value: "movie", label: "影视" }
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
  materialAnalysisPath: "workspace/input/references",
  materialTranscriptionMode: "auto",
  whisperModel: "tiny",
  whisperLanguage: "zh",
  sceneBackend: "auto",
  autoEditorEnabled: true,
  roughCutAnalysisPath: "workspace/drafts",
  publishSourcePath: "workspace/output",
  materialNeeds: "口播素材、屏幕录制、爆款参考、可商用 B-roll",
  campaignGoal: "涨粉、完播、引流、转化",
  competitorStyle: "高密度干货 + 前3秒强反差 + 大字幕",
  scriptTopic: "在AI里抛硬币，正面概率真的是50%吗？",
  webSearchEnabled: "true",
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
  const [message, setMessage] = useState("");
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [result, setResult] = useState<unknown>(null);
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [workspaceAssets, setWorkspaceAssets] = useState<WorkspaceAssetIndex | null>(null);
  const [trendReport, setTrendReport] = useState<IntelligenceReport | null>(null);
  const [trendCategory, setTrendCategory] = useState("all");
  const [topN, setTopN] = useState(20);
  const [scriptDraft, setScriptDraft] = useState<ScriptDraft | null>(null);

  const activeCapability = useMemo(
    () => capabilities.find((item) => item.id === activeStage) ?? capabilities[0],
    [activeStage]
  );

  useEffect(() => {
    void refreshTasks();
    void refreshReadiness();
    void refreshWorkspaceAssets();
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
      body: JSON.stringify({ platform: "bilibili", category: trendCategory, topN })
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
    const response = await fetch("/api/script/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic: form.scriptTopic, platform, audience: form.audience, references })
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
          {capabilities.map((item) => {
            const Icon = item.icon;
            return (
              <button
                aria-pressed={activeStage === item.id}
                className={activeStage === item.id ? "feature-item active" : "feature-item"}
                key={item.id}
                onClick={() => {
                  setActiveStage(item.id);
                  setMessage("");
                }}
                type="button"
              >
                <Icon size={18} />
                <div>
                  <strong>{item.title}</strong>
                  <small>{item.body}</small>
                </div>
              </button>
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
            <p>抖音、快手、B站全链路工作台</p>
            <h1>先用真实热点和流量信号做判断，再让 AI 写、找、剪、发</h1>
            <span>当前第一优先级是 S1 Trend Intelligence：B站真实排行榜 + 确定性打分 + DeepSeek 可选分析。后续保留豆包 Ark、Claude 中转站、GPT 中转站接入位，不把未接通能力伪装成已完成。</span>
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
          <WorkflowActionPanel activeStage={activeStage} busy={busy} onRun={runStageAction} />

          <StageWorkspace
            activeStage={activeStage}
            form={form}
            update={update}
            trendCategory={trendCategory}
            onTrendCategoryChange={setTrendCategory}
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
            variantBusy={variantBusy}
            onImportMaterial={importReferenceMaterial}
            onAnalyzeMaterial={analyzeReferenceMaterial}
            onCreatePlanFromScript={createPlanFromScript}
            onRenderScriptPackage={renderScriptPackage}
            onRenderFromAnalysis={renderFromAnalysis}
            onGeneratePlatformVariants={generatePlatformVariants}
          />

          <footer className="form-actions">
            <p>{message || "选择左侧模块，当前按钮会执行对应真实 API 或配置检查。"}</p>
            <div className="action-buttons">
              <button className="primary-button" disabled={busy} type="submit">
                {busy ? <Loader2 className="spin" size={18} /> : <Rocket size={18} />}
                {activeCapability.action}
              </button>
            </div>
          </footer>
        </form>
      </section>

      <TaskPanel readiness={readiness} result={result} tasks={tasks} workspaceAssets={workspaceAssets} />
    </main>
  );
}

function WorkflowActionPanel({
  activeStage,
  busy,
  onRun
}: {
  activeStage: WorkflowStage;
  busy: boolean;
  onRun: () => void;
}) {
  const stage = capabilities.find((item) => item.id === activeStage) ?? capabilities[0];
  const Icon = stage.icon;

  return (
    <section className="workflow-action-panel">
      <Icon size={22} />
      <div>
        <strong>{stage.title}</strong>
        <p>{stage.body}</p>
      </div>
      <button className="primary-button" disabled={busy} onClick={onRun} type="button">
        {busy ? <Loader2 className="spin" size={18} /> : <Rocket size={18} />}
        {stage.action}
      </button>
    </section>
  );
}

function StageWorkspace({
  activeStage,
  form,
  update,
  trendCategory,
  onTrendCategoryChange,
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
  variantBusy,
  onImportMaterial,
  onAnalyzeMaterial,
  onCreatePlanFromScript,
  onRenderScriptPackage,
  onRenderFromAnalysis,
  onGeneratePlatformVariants
}: {
  activeStage: WorkflowStage;
  form: CreatorForm;
  update: <K extends keyof CreatorForm>(key: K, value: CreatorForm[K]) => void;
  trendCategory: string;
  onTrendCategoryChange: (value: string) => void;
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
  variantBusy: boolean;
  onImportMaterial: () => void;
  onAnalyzeMaterial: () => void;
  onCreatePlanFromScript: () => void;
  onRenderScriptPackage: () => void;
  onRenderFromAnalysis: () => void;
  onGeneratePlatformVariants: () => void;
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
          <strong className="stage-command">当前主动作：{stage.action}</strong>
        </div>
        <div className="stage-proof">
          {copy.proof.map((item) => <span key={item}>{item}</span>)}
        </div>
      </div>

      {(activeStage === "trend" || activeStage === "predict") ? (
        <TrendIntelligencePanel
          category={trendCategory}
          onCategoryChange={onTrendCategoryChange}
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
          onAnalyzeMaterial={onAnalyzeMaterial}
          onImportMaterial={onImportMaterial}
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
          onCreatePlanFromScript={onCreatePlanFromScript}
          onRenderScriptPackage={onRenderScriptPackage}
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
          update={update}
        />
      ) : null}
      {activeStage === "review" ? <ReviewPanel readiness={readiness} /> : null}
    </section>
  );
}

function TrendIntelligencePanel({
  category,
  onCategoryChange,
  topN,
  onTopNChange,
  report
}: {
  category: string;
  onCategoryChange: (value: string) => void;
  topN: number;
  onTopNChange: (value: number) => void;
  report: IntelligenceReport | null;
}) {
  return (
    <div className="stage-layout trend-layout">
      <section className="trend-controls">
        <label className="field">
          <span>B站分区</span>
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
        <small>真实数据来自 B站公开排行榜。潜力分由互动率和播放速度计算，置信度表示数据支撑强度，不是凭空承诺“必火”。</small>
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

function CollectPanel({ form, update, assets, materialBusy, analysisBusy, onImportMaterial, onAnalyzeMaterial }: FormPanelProps & {
  assets: WorkspaceAsset[];
  materialBusy: boolean;
  analysisBusy: boolean;
  onImportMaterial: () => void;
  onAnalyzeMaterial: () => void;
}) {
  const analyzableAssets = assets
    .filter((asset) => asset.role === "input" && (asset.kind === "manifest" || asset.kind === "video"))
    .slice(0, 5);

  return (
    <div className="stage-layout collect-layout">
      <section className="tool-grid">
        <StageCard icon={Search} title="搜索与热点" body="Exa、Firecrawl、TikHub 负责找热点、标题、评论、参考链接。当前按钮会返回集成目录。" />
        <StageCard icon={DownloadCloud} title="视频素材导入" body="已接 /api/materials/import：用 yt-dlp 把可合法使用的视频、封面、字幕和元数据入库到 workspace/input/references。" />
        <StageCard icon={FileJson} title="素材目录" body="统一落盘到 references、raw、broll、audio，后续转写和剪辑都从这里读取。" />
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
          <small>只导入你有权下载或分析的内容。需要登录态的平台可在 .env.local 配置 YTDLP_COOKIES_PATH。</small>
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
          <small>当前链路：字幕文件优先；缺字幕时可用 py312 faster-whisper 本地 ASR；PySceneDetect/FFmpeg 做场景检测，Auto-Editor 预览跳剪潜力。</small>
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
  onCreatePlanFromScript,
  onRenderScriptPackage
}: FormPanelProps & {
  draft: ScriptDraft | null;
  scriptPlanBusy: boolean;
  remotionBusy: boolean;
  onCreatePlanFromScript: () => void;
  onRenderScriptPackage: () => void;
}) {
  return (
    <div className="stage-layout script-layout">
      <section className="stage-form-card">
        <Field label="选题（来自热点选题卡或自己写）" multiline value={form.scriptTopic} onChange={(value) => update("scriptTopic", value)} />
        <Field label="目标人群" value={form.audience} onChange={(value) => update("audience", value)} />
        <Field label="参考爆款（只借鉴方法，每行一个）" multiline value={form.references} onChange={(value) => update("references", value)} />
        <small className="hint">点上方“生成脚本方案”调用 /api/script/generate，由 LLM 产出可直接开拍的分镜脚本。未配置 LLM key 时会明确报错，不出假模板。</small>
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
          <div className="material-import-actions">
            <button className="primary-button" disabled={scriptPlanBusy} onClick={onCreatePlanFromScript} type="button">
              {scriptPlanBusy ? <Loader2 className="spin" size={18} /> : <FileJson size={18} />}
              转自动剪辑计划
            </button>
            <small>按分镜节拍生成 /api/auto/plan 的 scenes 和 decision JSON，落到 workspace/drafts。</small>
          </div>
          <div className="material-import-actions">
            <button className="primary-button" disabled={remotionBusy} onClick={onRenderScriptPackage} type="button">
              {remotionBusy ? <Loader2 className="spin" size={18} /> : <Sparkles size={18} />}
              渲染包装视频
            </button>
            <small>调用 Remotion 生成带标题、钩子、分镜字幕和进度条的 MP4，输出到 workspace/output/remotion。</small>
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
          <small>默认读取 workspace/drafts 里最新的 material-analysis-*.json；也可以填具体 JSON 路径。</small>
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

function PublishPanel({ form, update, assets, variantBusy, onGeneratePlatformVariants }: FormPanelProps & {
  assets: WorkspaceAsset[];
  variantBusy: boolean;
  onGeneratePlatformVariants: () => void;
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
          <small>源路径可填具体 MP4，也可填 workspace/output 目录，系统会自动取最新视频。</small>
        </div>
      </section>
      <AssetQuickList
        actionLabel="作为源视频"
        assets={outputVideos}
        empty="还没有输出视频。先在“自动剪辑”里生成 rough cut。"
        onUse={(asset) => update("publishSourcePath", asset.relativePath)}
        title="最近输出视频"
      />
      <section className="publish-board">
        <StageCard icon={Megaphone} title="抖音" body="9:16、强开头、标题短、评论引导。" />
        <StageCard icon={Megaphone} title="快手" body="9:16、人设强、真实生活场景。" />
        <StageCard icon={Megaphone} title="B站" body="16:9、结构完整、信息密度更高。" />
      </section>
    </div>
  );
}

function ReviewPanel({ readiness }: { readiness: Readiness | null }) {
  return (
    <div className="stage-layout review-layout">
      <section className="tool-grid">
        <StageCard icon={CheckCircle2} title="本机命令" body="node/npm/python/uv/yt-dlp/ffmpeg/n8n。" />
        <StageCard icon={BarChart3} title="数据复盘" body="后续接播放、完播、点赞、评论、涨粉指标。" />
        <StageCard icon={Rocket} title="下一轮动作" body="根据复盘决定追更、重剪、换标题或换选题。" />
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
        <span>来自 workspace 的真实文件，点击后会填入对应路径。</span>
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
    .slice(0, 8) ?? [];

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
        <section className="result-box readiness-box">
          <strong>全链路配置体检</strong>
          <div className="readiness-grid">
            {readiness.commands.map((item) => (
              <span className={item.ok ? "pill ok" : "pill missing"} key={item.id}>
                {item.ok ? "OK" : "MISS"} {item.id}
              </span>
            ))}
          </div>
          <div className="readiness-grid">
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
        </section>
      ) : null}

      {result ? (
        <section className="result-box">
          <strong>最新结果</strong>
          <pre>{JSON.stringify(result, null, 2)}</pre>
        </section>
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
        {tasks.length === 0 ? (
          <div className="empty-state">
            <FileJson size={28} />
            <span>暂无任务</span>
          </div>
        ) : tasks.map((task) => (
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
