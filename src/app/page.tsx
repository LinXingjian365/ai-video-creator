"use client";

import { useEffect, useState } from "react";
import {
  BarChart3,
  CheckCircle2,
  Clock3,
  DownloadCloud,
  FileJson,
  Files,
  Flame,
  Gauge,
  ListChecks,
  Loader2,
  Megaphone,
  Network,
  PlayCircle,
  Rocket,
  Scissors,
  Search,
  Settings2,
  Sparkles,
  Target,
  UploadCloud,
  Wand2,
  XCircle
} from "lucide-react";

type TaskStatus = "pending" | "processing" | "completed" | "failed";
type WorkflowStage = "trend" | "collect" | "analyze" | "script" | "edit" | "publish" | "review" | "predict";
type StageEndpoint = "suite" | "integrations" | "plan" | "simulate" | "readiness";

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
  nextSteps: string[];
}

const cn = (value: string) => decodeURIComponent(value);

const text = {
  app: cn("%E8%87%AA%E5%AA%92%E4%BD%93%E8%B6%85%E7%BA%A7%E5%8A%A9%E6%89%8B"),
  subtitle: cn("%E7%83%AD%E7%82%B9%E8%B6%8B%E5%8A%BF / %E7%B4%A0%E6%9D%90%E6%94%B6%E9%9B%86 / %E7%88%86%E6%AC%BE%E6%8B%86%E8%A7%A3 / AI%E5%89%AA%E8%BE%91 / %E5%8F%91%E5%B8%83%E5%A4%8D%E7%9B%98"),
  heroKicker: cn("%E6%8A%96%E9%9F%B3%E3%80%81%E5%BF%AB%E6%89%8B%E3%80%81B%E7%AB%99%E5%85%A8%E9%93%BE%E8%B7%AF%E5%B7%A5%E4%BD%9C%E5%8F%B0"),
  heroTitle: cn("AI%E6%8A%93%E7%83%AD%E7%82%B9%E8%B6%8B%E5%8A%BF%EF%BC%8C%E6%8B%86%E7%88%86%E6%AC%BE%E9%80%BB%E8%BE%91%EF%BC%8C%E7%94%9F%E6%88%90%E4%BB%8E%E9%80%89%E9%A2%98%E5%88%B0%E5%A4%8D%E7%9B%98%E7%9A%84%E5%AE%8C%E6%95%B4%E6%89%A7%E8%A1%8C%E6%96%B9%E6%A1%88"),
  heroText: cn("%E8%BE%93%E5%85%A5%E8%B4%A6%E5%8F%B7%E6%96%B9%E5%90%91%E3%80%81%E7%9B%AE%E6%A0%87%E4%BA%BA%E7%BE%A4%E3%80%81%E5%8F%82%E8%80%83%E7%88%86%E6%AC%BE%E5%92%8C%E7%B4%A0%E6%9D%90%E9%9C%80%E6%B1%82%EF%BC%8C%E7%B3%BB%E7%BB%9F%E4%BC%9A%E8%BE%93%E5%87%BA%E9%80%89%E9%A2%98%E6%B1%A0%E3%80%81%E8%A7%82%E4%BC%97%E9%92%A9%E5%AD%90%E3%80%81%E8%A7%86%E9%A2%91%E7%BB%93%E6%9E%84%E3%80%81%E7%B4%A0%E6%9D%90%E6%B8%85%E5%8D%95%E3%80%81%E4%BB%BF%E5%89%AA%E8%93%9D%E5%9B%BE%E3%80%81%E5%8F%91%E5%B8%83%E7%9F%A9%E9%98%B5%E5%92%8C%E7%88%86%E7%81%AB%E9%A2%84%E6%B5%8B%E3%80%82"),
  run: cn("%E7%94%9F%E6%88%90%E5%85%A8%E9%93%BE%E8%B7%AF%E6%96%B9%E6%A1%88"),
  refresh: cn("%E5%88%B7%E6%96%B0%E4%BB%BB%E5%8A%A1"),
  workspace: cn("%E5%B7%A5%E4%BD%9C%E5%8C%BA"),
  result: cn("%E6%9C%80%E6%96%B0%E7%BB%93%E6%9E%9C"),
  tasks: cn("%E4%BB%BB%E5%8A%A1%E7%9B%91%E6%8E%A7"),
  empty: cn("%E6%9A%82%E6%97%A0%E4%BB%BB%E5%8A%A1"),
  niche: cn("%E8%A1%8C%E4%B8%9A%E8%B5%9B%E9%81%93"),
  audience: cn("%E7%9B%AE%E6%A0%87%E4%BA%BA%E7%BE%A4"),
  persona: cn("%E6%A0%B8%E5%BF%83%E4%BA%BA%E8%AE%BE/%E4%BA%A7%E5%93%81"),
  platforms: cn("%E5%B9%B3%E5%8F%B0"),
  keywords: cn("%E7%83%AD%E7%82%B9%E5%85%B3%E9%94%AE%E8%AF%8D%EF%BC%88%E6%AF%8F%E8%A1%8C%E4%B8%80%E4%B8%AA%EF%BC%89"),
  references: cn("%E5%8F%82%E8%80%83%E7%88%86%E6%AC%BE%E9%93%BE%E6%8E%A5/%E6%A0%87%E9%A2%98%EF%BC%88%E6%AF%8F%E8%A1%8C%E4%B8%80%E4%B8%AA%EF%BC%89"),
  materials: cn("%E7%B4%A0%E6%9D%90%E9%9C%80%E6%B1%82"),
  goal: cn("%E8%BF%90%E8%90%A5%E7%9B%AE%E6%A0%87"),
  competitor: cn("%E6%83%B3%E6%A8%A1%E4%BB%BF%E7%9A%84%E7%88%86%E6%AC%BE%E9%A3%8E%E6%A0%BC"),
  web: cn("%E5%90%AF%E7%94%A8%E8%81%94%E7%BD%91%E6%90%9C%E7%B4%A2%E9%80%82%E9%85%8D%E5%99%A8"),
  created: cn("%E6%96%B9%E6%A1%88%E5%B7%B2%E7%94%9F%E6%88%90"),
  failed: cn("%E8%AF%B7%E6%B1%82%E5%A4%B1%E8%B4%A5")
};

const capabilities = [
  { id: "trend", icon: Flame, title: cn("%E7%83%AD%E7%82%B9%E8%B6%8B%E5%8A%BF"), body: cn("%E6%8A%8A%E8%A1%8C%E4%B8%9A%E8%AF%8D%E3%80%81%E4%BA%BA%E7%BE%A4%E3%80%81%E5%B9%B3%E5%8F%B0%E8%BD%AC%E6%88%90%E7%83%AD%E7%82%B9%E6%90%9C%E7%B4%A2%E8%AF%8D%E5%92%8C%E9%80%89%E9%A2%98%E8%A7%92%E5%BA%A6"), action: cn("%E7%94%9F%E6%88%90%E7%83%AD%E7%82%B9%E6%96%B9%E6%A1%88"), endpoint: "suite" },
  { id: "collect", icon: Network, title: cn("%E8%81%94%E7%BD%91%E7%B4%A0%E6%9D%90"), body: cn("%E7%94%9F%E6%88%90%E5%8F%AF%E6%8E%A5Exa/Tavily/Firecrawl/%E5%B9%B3%E5%8F%B0API%E7%9A%84%E6%90%9C%E7%B4%A2%E5%92%8C%E7%B4%A0%E6%9D%90%E7%9B%AE%E5%BD%95"), action: cn("%E6%9F%A5%E7%9C%8B%E9%9B%86%E6%88%90%E7%9B%AE%E5%BD%95"), endpoint: "integrations" },
  { id: "analyze", icon: Search, title: cn("%E7%88%86%E6%AC%BE%E6%8B%86%E8%A7%A3"), body: cn("%E6%8B%86%E5%89%8D3%E7%A7%92%E3%80%81%E8%8A%82%E5%A5%8F%E3%80%81%E5%AE%8C%E6%92%AD%E7%82%B9%E3%80%81%E8%AF%84%E8%AE%BA%E5%BC%95%E5%AF%BC%EF%BC%8C%E5%8F%AA%E5%AD%A6%E9%80%BB%E8%BE%91%E4%B8%8D%E6%90%AC%E8%BF%90"), action: cn("%E7%94%9F%E6%88%90%E6%8B%86%E8%A7%A3%E8%AE%A1%E5%88%92"), endpoint: "plan" },
  { id: "script", icon: Sparkles, title: cn("%E6%96%87%E6%A1%88%E8%84%9A%E6%9C%AC"), body: cn("%E7%94%9F%E6%88%90%E9%92%A9%E5%AD%90%E3%80%81%E8%84%9A%E6%9C%AC%E8%8A%82%E7%82%B9%E3%80%81%E5%AD%97%E5%B9%95%E6%A0%B7%E5%BC%8F%E5%92%8C%E7%BB%93%E5%B0%BE%E8%BD%AC%E5%8C%96"), action: cn("%E7%94%9F%E6%88%90%E8%84%9A%E6%9C%AC%E8%93%9D%E5%9B%BE"), endpoint: "suite" },
  { id: "edit", icon: Scissors, title: cn("%E8%87%AA%E5%8A%A8%E5%89%AA%E8%BE%91"), body: cn("%E7%9C%9F%E6%AD%A3%E8%B7%91FFmpeg%EF%BC%9A%E7%94%9F%E6%88%90%E7%B4%A0%E6%9D%90%E3%80%81%E8%A3%81%E5%89%AA%E4%B8%89%E6%AE%B5%E3%80%81%E5%90%88%E6%88%90rough cut%E3%80%81%E8%BE%93%E5%87%BA%E5%89%AA%E6%98%A0%E8%8D%89%E7%A8%BF"), action: cn("%E7%AB%8B%E5%8D%B3%E6%A8%A1%E6%8B%9F%E5%89%AA%E8%BE%91"), endpoint: "simulate" },
  { id: "publish", icon: UploadCloud, title: cn("%E5%8F%91%E5%B8%83%E7%9F%A9%E9%98%B5"), body: cn("%E7%94%9F%E6%88%90%E6%8A%96%E9%9F%B3%E3%80%81%E5%BF%AB%E6%89%8B%E3%80%81B%E7%AB%99%E7%9A%84%E6%A0%87%E9%A2%98%E3%80%81%E6%A0%87%E7%AD%BE%E3%80%81%E6%97%B6%E9%95%BF%E3%80%81%E5%8F%91%E5%B8%83%E5%8C%85"), action: cn("%E7%94%9F%E6%88%90%E5%8F%91%E5%B8%83%E5%8C%85"), endpoint: "suite" },
  { id: "review", icon: BarChart3, title: cn("%E8%BF%90%E8%90%A5%E5%A4%8D%E7%9B%98"), body: cn("%E5%AE%8C%E6%92%AD%E3%80%815%E7%A7%92%E7%95%99%E5%AD%98%E3%80%81%E7%82%B9%E8%B5%9E%E3%80%81%E8%AF%84%E8%AE%BA%E3%80%81%E6%B6%A8%E7%B2%89%E7%9A%84%E5%A4%8D%E7%9B%98%E5%86%B3%E7%AD%96"), action: cn("%E6%A3%80%E6%9F%A5%E7%8E%AF%E5%A2%83"), endpoint: "readiness" },
  { id: "predict", icon: Rocket, title: cn("%E7%88%86%E7%81%AB%E9%A2%84%E6%B5%8B"), body: cn("%E6%A0%B9%E6%8D%AE%E5%85%B3%E9%94%AE%E8%AF%8D%E3%80%81%E5%B9%B3%E5%8F%B0%E3%80%81%E5%8F%82%E8%80%83%E7%88%86%E6%AC%BE%E3%80%81%E7%B4%A0%E6%9D%90%E5%AE%8C%E6%95%B4%E5%BA%A6%E4%BC%B0%E7%AE%97%E6%88%90%E5%8A%9F%E6%A6%82%E7%8E%87"), action: cn("%E8%AE%A1%E7%AE%97%E7%88%86%E6%AC%BE%E6%8C%87%E6%95%B0"), endpoint: "suite" }
] satisfies Array<{ id: WorkflowStage; icon: typeof Flame; title: string; body: string; action: string; endpoint: StageEndpoint }>;

const stageCopy: Record<WorkflowStage, {
  eyebrow: string;
  headline: string;
  description: string;
  output: string;
  proof: string[];
}> = {
  trend: {
    eyebrow: "趋势雷达",
    headline: "从账号方向反推出可拍的热点选题池",
    description: "这里不是剪辑表单，而是用赛道、人群、关键词和平台生成搜索角度、话题池、爆点假设和验证计划。",
    output: "输出：趋势关键词、选题池、搜索 query、爆点测试计划",
    proof: ["赛道词", "目标人群", "平台差异", "热点关键词"]
  },
  collect: {
    eyebrow: "素材采集",
    headline: "把参考链接、B-roll、口播素材整理成可执行素材清单",
    description: "这一屏关注素材来源和工具接入，展示 Exa、Firecrawl、yt-dlp、平台 API、Whisper 等成熟工具的接入位。",
    output: "输出：素材目录、采集工具清单、待配置 API/CLI 项",
    proof: ["Exa/Firecrawl", "yt-dlp", "素材目录", "授权检查"]
  },
  analyze: {
    eyebrow: "爆款拆解",
    headline: "只拆逻辑，不搬运内容：开头、节奏、完播点、评论钩子",
    description: "这一屏把参考爆款变成自动剪辑决策 JSON 的输入，适合接 PySceneDetect、Auto-Editor、OpenTimelineIO。",
    output: "输出：三段式剪辑计划、镜头用途、节奏和转化点",
    proof: ["前 3 秒", "节奏点", "完播点", "评论引导"]
  },
  script: {
    eyebrow: "脚本工厂",
    headline: "生成口播钩子、字幕节奏和结尾转化",
    description: "这一屏服务文案脚本，不再展示通用参数堆砌，而是围绕标题、钩子、脚本段落、字幕风格组织输入。",
    output: "输出：标题模板、开头钩子、脚本节拍、字幕样式",
    proof: ["钩子", "脚本节拍", "大字幕", "转化结尾"]
  },
  edit: {
    eyebrow: "自动剪辑",
    headline: "真实跑 FFmpeg，生成素材、裁三段、合成 rough cut",
    description: "这一屏是执行区：可以一键模拟真实剪辑，也可以后续接入用户素材、ASR、场景检测和 Remotion 包装。",
    output: "输出：rough cut MP4、decision JSON、JianYing plan JSON",
    proof: ["FFmpeg", "clip", "merge", "剪映计划"]
  },
  publish: {
    eyebrow: "发布矩阵",
    headline: "按抖音、快手、B站生成标题、标签、比例、发布时间",
    description: "这一屏关注发布包，不直接真发；生产化后先接 social-auto-upload、Postiz 和 n8n dry-run。",
    output: "输出：多平台发布包、标题、标签、封面要求、发布时间",
    proof: ["抖音", "快手", "B站", "dry-run"]
  },
  review: {
    eyebrow: "运营复盘",
    headline: "检查工具链健康度，并把数据回流成下一轮动作",
    description: "这一屏不是脚本生成，而是看 FFmpeg、API Key、发布工具、MCP 是否准备好，以及复盘指标怎么驱动下一轮。",
    output: "输出：环境体检、缺失项、复盘指标和下一步动作",
    proof: ["完播率", "5 秒留存", "互动率", "涨粉"]
  },
  predict: {
    eyebrow: "爆火预测",
    headline: "根据选题、人群、素材完整度估算爆款概率",
    description: "这一屏把关键词、参考爆款、平台和素材完整度变成风险评分，帮助先选题再开剪。",
    output: "输出：爆款指数、风险点、A/B 测试建议",
    proof: ["关键词强度", "素材完整度", "平台匹配", "测试计划"]
  }
};

const defaultForm = {
  niche: cn("%E6%9C%AC%E5%9C%B0%E7%94%9F%E6%B4%BB/%E7%9F%A5%E8%AF%86%E5%8F%A3%E6%92%AD/%E5%A5%BD%E7%89%A9%E5%B8%A6%E8%B4%A7"),
  audience: cn("25-40%E5%B2%81%E6%83%B3%E6%8F%90%E5%8D%87%E6%94%B6%E5%85%A5%E7%9A%84%E6%99%AE%E9%80%9A%E4%BA%BA"),
  persona: cn("%E6%87%82AI%E5%B7%A5%E5%85%B7%E7%9A%84%E5%AE%9E%E6%88%98%E5%9E%8B%E5%88%9B%E4%BD%9C%E8%80%85"),
  keywords: cn("AI%E5%89%AA%E8%BE%91\n%E8%87%AA%E5%AA%92%E4%BD%93%E5%89%AF%E4%B8%9A\n%E7%88%86%E6%AC%BE%E8%A7%86%E9%A2%91\n%E6%8A%96%E9%9F%B3%E6%B5%81%E9%87%8F"),
  references: cn("%E7%B2%98%E8%B4%B4%E4%BD%A0%E4%B8%8B%E8%BD%BD%E7%9A%84%E6%8A%96%E9%9F%B3/%E5%BF%AB%E6%89%8B/B%E7%AB%99%E7%88%86%E6%AC%BE%E9%93%BE%E6%8E%A5%E6%88%96%E6%A0%87%E9%A2%98"),
  materialNeeds: cn("%E5%8F%A3%E6%92%AD%E7%B4%A0%E6%9D%90%E3%80%81%E5%B1%8F%E5%B9%95%E5%BD%95%E5%88%B6%E3%80%81%E7%88%86%E6%AC%BE%E5%8F%82%E8%80%83%E3%80%81%E5%8F%AF%E5%95%86%E7%94%A8B-roll"),
  campaignGoal: cn("%E6%B6%A8%E7%B2%89%E3%80%81%E5%AE%8C%E6%92%AD%E3%80%81%E5%BC%95%E6%B5%81%E3%80%81%E8%BD%AC%E5%8C%96"),
  competitorStyle: cn("%E9%AB%98%E5%AF%86%E5%BA%A6%E5%B9%B2%E8%B4%A7+%E5%89%8D3%E7%A7%92%E5%BC%BA%E5%8F%8D%E5%B7%AE+%E5%A4%A7%E5%AD%97%E5%B9%95"),
  webSearchEnabled: "true",
  douyin: true,
  kuaishou: true,
  bilibili: true
};

type CreatorForm = typeof defaultForm;

export default function Home() {
  const [form, setForm] = useState<CreatorForm>(defaultForm);
  const [activeStage, setActiveStage] = useState<WorkflowStage>("edit");
  const [submitting, setSubmitting] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [generatingDraft, setGeneratingDraft] = useState(false);
  const [message, setMessage] = useState("");
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [result, setResult] = useState<unknown>(null);
  const [readiness, setReadiness] = useState<Readiness | null>(null);

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

  useEffect(() => {
    void refreshTasks();
    void refreshReadiness();
    const timer = window.setInterval(refreshTasks, 1500);
    return () => window.clearInterval(timer);
  }, []);

  function update<K extends keyof CreatorForm>(key: K, value: CreatorForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submitSuite() {
    setSubmitting(true);
    setMessage("");
    setResult(null);

    const platforms = [
      form.douyin ? "douyin" : "",
      form.kuaishou ? "kuaishou" : "",
      form.bilibili ? "bilibili" : ""
    ].filter(Boolean);

    try {
      const response = await fetch("/api/creator/suite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          niche: form.niche,
          audience: form.audience,
          persona: form.persona,
          platforms,
          keywords: splitLines(form.keywords),
          references: splitLines(form.references),
          materialNeeds: form.materialNeeds,
          campaignGoal: form.campaignGoal,
          competitorStyle: form.competitorStyle,
          webSearchEnabled: form.webSearchEnabled === "true",
          riskTolerance: "medium"
        })
      });
      const data = await response.json();
      if (!response.ok) {
        setMessage(data.error ?? text.failed);
        setResult(data);
        return;
      }
      setMessage(text.created);
      setResult(data);
      await refreshTasks();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : text.failed);
    } finally {
      setSubmitting(false);
    }
  }

  async function runSimulation() {
    setSimulating(true);
    setMessage("");
    setResult(null);

    try {
      const response = await fetch("/api/auto/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectTitle: cn("%E4%B8%80%E9%94%AE%E6%A8%A1%E6%8B%9F%E8%87%AA%E5%8A%A8%E5%89%AA%E8%BE%91"),
          instructions: cn("%E7%94%9F%E6%88%9012%E7%A7%92%E6%B5%8B%E8%AF%95%E7%B4%A0%E6%9D%90%EF%BC%8C%E4%BF%9D%E7%95%99%E5%BC%BA%E9%92%A9%E5%AD%90%E3%80%81%E6%A0%B8%E5%BF%83%E6%BC%94%E7%A4%BA%E3%80%81%E7%BB%93%E5%B0%BE%E8%A1%8C%E5%8A%A8%E4%B8%89%E6%AE%B5%EF%BC%8C%E8%BE%93%E5%87%BArough cut mp4%E5%92%8C%E5%89%AA%E6%98%A0%E8%8D%89%E7%A8%BF%E8%AE%A1%E5%88%92%E3%80%82")
        })
      });
      const data = await response.json();

      if (!response.ok) {
        setMessage(data.error ?? text.failed);
        setResult(data);
        return;
      }

      setMessage(cn("%E6%A8%A1%E6%8B%9F%E5%89%AA%E8%BE%91%E4%BB%BB%E5%8A%A1%E5%B7%B2%E5%90%AF%E5%8A%A8%EF%BC%8C%E5%8F%B3%E4%BE%A7%E4%BC%9A%E6%98%BE%E7%A4%BA%E8%BE%93%E5%87%BA%E8%A7%86%E9%A2%91%E5%92%8C%E8%8D%89%E7%A8%BF%E8%B7%AF%E5%BE%84%E3%80%82"));
      setResult(data);
      await refreshTasks();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : text.failed);
    } finally {
      setSimulating(false);
    }
  }

  async function generateDraft() {
    const planPath = latestDraftPlanPath(tasks);
    if (!planPath) {
      setMessage("请先用「一键真实模拟剪辑」生成剪辑计划，再生成剪映草稿。");
      return;
    }

    setGeneratingDraft(true);
    setMessage("");

    try {
      const response = await fetch("/api/jianying/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planPath, draftName: `AI助手草稿-${Date.now()}` })
      });
      const data = await response.json();
      if (!response.ok) {
        setMessage(data.error ?? text.failed);
        setResult(data);
        return;
      }
      setMessage("剪映草稿已生成，打开剪映即可在草稿列表看到并继续编辑。");
      setResult(data);
      await refreshTasks();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : text.failed);
    } finally {
      setGeneratingDraft(false);
    }
  }

  async function runStageAction() {
    const stage = capabilities.find((item) => item.id === activeStage) ?? capabilities[0];
    if (stage.endpoint === "simulate") {
      await runSimulation();
      return;
    }

    setSubmitting(true);
    setMessage("");
    setResult(null);

    try {
      const response = await fetch(stageEndpoint(stage.endpoint), {
        method: stage.endpoint === "integrations" || stage.endpoint === "readiness" ? "GET" : "POST",
        headers: { "Content-Type": "application/json" },
        body: stage.endpoint === "integrations" || stage.endpoint === "readiness" ? undefined : JSON.stringify(stagePayload(stage.endpoint, form))
      });
      const data = await response.json();
      if (!response.ok) {
        setMessage(data.error ?? text.failed);
      } else {
        setMessage(`${stage.title}：${cn("%E5%B7%B2%E6%89%A7%E8%A1%8C")}`);
        setMessage(`${stage.title}：${cn("%E5%B7%B2%E6%89%A7%E8%A1%8C")}`);
        if (stage.endpoint === "readiness") {
          setReadiness(data);
        }
        await refreshTasks();
      }
      setResult(data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : text.failed);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="console-shell creator-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><Wand2 size={20} /></div>
          <div>
            <strong>{text.app}</strong>
            <span>{text.subtitle}</span>
          </div>
        </div>

        <div className="feature-list">
          {capabilities.map((item) => {
            const Icon = item.icon;
            return (
              <button
                className={activeStage === item.id ? "feature-item active" : "feature-item"}
                key={item.title}
                onClick={() => setActiveStage(item.id)}
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
          <span>{text.workspace}</span>
          <code>workspace/input/references</code>
          <code>workspace/input/raw</code>
          <code>workspace/output/publish</code>
        </div>
      </aside>

      <section className="workbench">
        <header className="topbar hero-bar">
          <div>
            <p>{text.heroKicker}</p>
            <h1>{text.heroTitle}</h1>
            <span>{text.heroText}</span>
          </div>
          <button className="icon-button" onClick={refreshTasks} title={text.refresh} type="button">
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
          <WorkflowActionPanel
            activeStage={activeStage}
            busy={submitting || simulating}
            onRun={runStageAction}
          />

          <StageWorkspace activeStage={activeStage} form={form} update={update} />

          <footer className="form-actions">
            <p>{message || cn("%E5%A1%AB%E5%A5%BD%E8%B4%A6%E5%8F%B7%E6%96%B9%E5%90%91%E5%92%8C%E5%8F%82%E8%80%83%E7%88%86%E6%AC%BE%EF%BC%8C%E7%94%9F%E6%88%90%E5%8F%AF%E6%89%A7%E8%A1%8C%E7%9A%84%E5%85%A8%E9%93%BE%E8%B7%AF%E6%96%B9%E6%A1%88%E3%80%82")}</p>
            <div className="action-buttons">
              <button className="secondary-button" disabled={simulating} onClick={runSimulation} type="button">
                {simulating ? <Loader2 className="spin" size={18} /> : <Scissors size={18} />}
                {cn("%E4%B8%80%E9%94%AE%E7%9C%9F%E5%AE%9E%E6%A8%A1%E6%8B%9F%E5%89%AA%E8%BE%91")}
              </button>
              <button className="secondary-button" disabled={generatingDraft} onClick={generateDraft} type="button">
                {generatingDraft ? <Loader2 className="spin" size={18} /> : <FileJson size={18} />}
                生成真实剪映草稿
              </button>
              <button className="primary-button" disabled={submitting} onClick={submitSuite} type="button">
                {submitting ? <Loader2 className="spin" size={18} /> : <Rocket size={18} />}
                {text.run}
              </button>
            </div>
          </footer>
        </form>
      </section>

      <TaskPanel readiness={readiness} result={result} tasks={tasks} />
    </main>
  );
}

function latestDraftPlanPath(tasks: TaskRecord[]): string | null {
  for (const task of tasks) {
    if (task.status !== "completed" || !task.result || typeof task.result !== "object") {
      continue;
    }
    const result = task.result as Record<string, unknown>;
    if (task.type === "auto-simulate") {
      const render = result.render as Record<string, unknown> | undefined;
      if (render && typeof render.draftPlanPath === "string") {
        return render.draftPlanPath;
      }
    }
    if (task.type === "auto-render" && typeof result.draftPlanPath === "string") {
      return result.draftPlanPath;
    }
    if (task.type === "jianying-plan" && typeof result.outputPath === "string") {
      return result.outputPath;
    }
  }
  return null;
}

function stageEndpoint(endpoint: StageEndpoint) {
  const endpoints = {
    suite: "/api/creator/suite",
    integrations: "/api/integrations",
    plan: "/api/auto/plan",
    simulate: "/api/auto/simulate",
    readiness: "/api/creator/readiness"
  };
  return endpoints[endpoint];
}

function stagePayload(endpoint: StageEndpoint, form: CreatorForm) {
  if (endpoint === "plan") {
    return {
      projectTitle: cn("%E7%88%86%E6%AC%BE%E6%8B%86%E8%A7%A3%E5%88%B0%E5%88%9D%E5%89%AA"),
      materialDir: "workspace/input",
      instructions: cn("%E6%A0%B9%E6%8D%AE%E7%88%86%E6%AC%BE%E5%8F%82%E8%80%83%E6%8B%86%E5%87%BA%E5%BC%BA%E9%92%A9%E5%AD%90%E3%80%81%E6%A0%B8%E5%BF%83%E6%BC%94%E7%A4%BA%E3%80%81%E7%BB%93%E5%B0%BE%E8%BD%AC%E5%8C%96%E4%B8%89%E4%B8%AA%E7%89%87%E6%AE%B5%EF%BC%8C%E7%94%9F%E6%88%90%E8%87%AA%E5%8A%A8%E5%89%AA%E8%BE%91decision JSON%E3%80%82")
    };
  }

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
  update
}: {
  activeStage: WorkflowStage;
  form: CreatorForm;
  update: <K extends keyof CreatorForm>(key: K, value: CreatorForm[K]) => void;
}) {
  const copy = stageCopy[activeStage];

  return (
    <section className="stage-workspace">
      <div className="stage-hero">
        <div>
          <p>{copy.eyebrow}</p>
          <h2>{copy.headline}</h2>
          <span>{copy.description}</span>
        </div>
        <div className="stage-proof">
          {copy.proof.map((item) => <span key={item}>{item}</span>)}
        </div>
      </div>

      {activeStage === "trend" ? (
        <div className="stage-layout trend-layout">
          <section className="stage-form-card">
            <Field label={text.niche} value={form.niche} onChange={(value) => update("niche", value)} />
            <Field label={text.audience} value={form.audience} onChange={(value) => update("audience", value)} />
            <Field label={text.keywords} multiline value={form.keywords} onChange={(value) => update("keywords", value)} />
          </section>
          <section className="stage-side-card">
            <StageCard icon={Target} title="输出目标" body={copy.output} />
            <PlatformSelector form={form} update={update} />
            <WebSearchSelector form={form} update={update} />
          </section>
        </div>
      ) : null}

      {activeStage === "collect" ? (
        <div className="stage-layout collect-layout">
          <section className="stage-form-card">
            <Field label={text.references} multiline value={form.references} onChange={(value) => update("references", value)} />
            <Field label={text.materials} multiline value={form.materialNeeds} onChange={(value) => update("materialNeeds", value)} />
          </section>
          <section className="tool-grid">
            <StageCard icon={Search} title="联网搜索" body="Exa / Firecrawl / TikHub 用来找标题、评论、热点和参考素材。" />
            <StageCard icon={DownloadCloud} title="素材导入" body="yt-dlp 负责导入公开视频、封面、字幕和元数据，先 dry-run 再落盘。" />
            <StageCard icon={FileJson} title="素材目录" body="workspace/input/references、raw、broll、audio 作为统一入口。" />
          </section>
        </div>
      ) : null}

      {activeStage === "analyze" ? (
        <div className="stage-layout analyze-layout">
          <section className="stage-form-card">
            <Field label={text.references} multiline value={form.references} onChange={(value) => update("references", value)} />
            <Field label={text.competitor} multiline value={form.competitorStyle} onChange={(value) => update("competitorStyle", value)} />
          </section>
          <section className="analysis-strip">
            <StageCard icon={PlayCircle} title="前 3 秒" body="拆冲突、结果前置、反差句，形成 hook 候选。" />
            <StageCard icon={Scissors} title="剪辑节奏" body="接 PySceneDetect / Auto-Editor，输出候选切点。" />
            <StageCard icon={ListChecks} title="决策 JSON" body="生成 scenes、targetDurationMs、字幕风格和镜头用途。" />
          </section>
        </div>
      ) : null}

      {activeStage === "script" ? (
        <div className="stage-layout script-layout">
          <section className="stage-form-card">
            <Field label={text.persona} value={form.persona} onChange={(value) => update("persona", value)} />
            <Field label={text.goal} value={form.campaignGoal} onChange={(value) => update("campaignGoal", value)} />
            <Field label={text.keywords} multiline value={form.keywords} onChange={(value) => update("keywords", value)} />
          </section>
          <section className="script-preview">
            <strong>脚本结构预览</strong>
            <ol>
              <li>3 秒钩子：先给反差或结果。</li>
              <li>中段方法：每 2-4 秒一个信息点。</li>
              <li>画面要求：口播、屏录、B-roll 交替。</li>
              <li>结尾转化：评论问题或收藏理由。</li>
            </ol>
          </section>
        </div>
      ) : null}

      {activeStage === "edit" ? (
        <div className="stage-layout edit-layout">
          <section className="edit-pipeline">
            <StageCard icon={Settings2} title="1. 生成测试素材" body="创建本地 12 秒测试视频，证明链路不是空按钮。" />
            <StageCard icon={Scissors} title="2. 裁剪三段" body="FFmpeg clip 输出 hook、demo、ending 三个片段。" />
            <StageCard icon={Files} title="3. 合成粗剪" body="FFmpeg merge 输出 rough cut MP4。" />
            <StageCard icon={FileJson} title="4. 剪映计划" body="写入 JianYing plan JSON，下一步映射 MCP。" />
          </section>
          <section className="stage-form-card compact">
            <Field label={text.materials} multiline value={form.materialNeeds} onChange={(value) => update("materialNeeds", value)} />
            <StageCard icon={PlayCircle} title="当前动作" body="点击上方“立即模拟剪辑”会真实生成视频文件和草稿计划。" />
          </section>
        </div>
      ) : null}

      {activeStage === "publish" ? (
        <div className="stage-layout publish-layout">
          <section className="stage-form-card">
            <Field label={text.goal} value={form.campaignGoal} onChange={(value) => update("campaignGoal", value)} />
            <Field label={text.competitor} multiline value={form.competitorStyle} onChange={(value) => update("competitorStyle", value)} />
            <PlatformSelector form={form} update={update} />
          </section>
          <section className="publish-board">
            <StageCard icon={Megaphone} title="抖音" body="9:16、18-45 秒、强钩子、标题短、评论引导。" />
            <StageCard icon={Megaphone} title="快手" body="9:16、真实感、人设强、生活场景优先。" />
            <StageCard icon={Megaphone} title="B站" body="16:9、结构完整、标题信息密度更高。" />
          </section>
        </div>
      ) : null}

      {activeStage === "review" ? (
        <div className="stage-layout review-layout">
          <section className="tool-grid">
            <StageCard icon={CheckCircle2} title="环境体检" body="检查 FFmpeg、外部工具、API Key 和 MCP 路径。" />
            <StageCard icon={BarChart3} title="30 分钟复盘" body="看 5 秒留存、完播、点赞、评论密度。" />
            <StageCard icon={Rocket} title="下一轮动作" body="根据数据决定重剪、追更、换标题或换选题。" />
          </section>
          <section className="stage-form-card compact">
            <Field label={text.goal} value={form.campaignGoal} onChange={(value) => update("campaignGoal", value)} />
            <WebSearchSelector form={form} update={update} />
          </section>
        </div>
      ) : null}

      {activeStage === "predict" ? (
        <div className="stage-layout predict-layout">
          <section className="score-board">
            <StageCard icon={Gauge} title="关键词强度" body={`${splitLines(form.keywords).length} 个关键词参与评分。`} />
            <StageCard icon={Files} title="参考完整度" body={`${splitLines(form.references).length} 条参考链接或标题。`} />
            <StageCard icon={Target} title="平台匹配" body="平台越明确，发布包和剪辑比例越可控。" />
          </section>
          <section className="stage-form-card">
            <Field label={text.keywords} multiline value={form.keywords} onChange={(value) => update("keywords", value)} />
            <Field label={text.references} multiline value={form.references} onChange={(value) => update("references", value)} />
            <Field label={text.materials} multiline value={form.materialNeeds} onChange={(value) => update("materialNeeds", value)} />
          </section>
        </div>
      ) : null}
    </section>
  );
}

function PlatformSelector({
  form,
  update
}: {
  form: CreatorForm;
  update: <K extends keyof CreatorForm>(key: K, value: CreatorForm[K]) => void;
}) {
  return (
    <section className="selector-box">
      <strong>{text.platforms}</strong>
      <label><input checked={form.douyin} onChange={(event) => update("douyin", event.target.checked)} type="checkbox" /> {cn("%E6%8A%96%E9%9F%B3")}</label>
      <label><input checked={form.kuaishou} onChange={(event) => update("kuaishou", event.target.checked)} type="checkbox" /> {cn("%E5%BF%AB%E6%89%8B")}</label>
      <label><input checked={form.bilibili} onChange={(event) => update("bilibili", event.target.checked)} type="checkbox" /> {cn("B%E7%AB%99")}</label>
    </section>
  );
}

function WebSearchSelector({
  form,
  update
}: {
  form: CreatorForm;
  update: <K extends keyof CreatorForm>(key: K, value: CreatorForm[K]) => void;
}) {
  return (
    <section className="selector-box">
      <strong>{text.web}</strong>
      <select value={form.webSearchEnabled} onChange={(event) => update("webSearchEnabled", event.target.value)}>
        <option value="true">ON</option>
        <option value="false">OFF</option>
      </select>
      <small>{cn("%E9%85%8D%E7%BD%AEExa/Firecrawl/TikHub%E5%90%8E%EF%BC%8C%E8%BF%99%E9%87%8C%E7%9A%84%E6%90%9C%E7%B4%A2%E8%AF%8D%E5%B0%B1%E8%83%BD%E8%BD%AC%E6%88%90%E7%9C%9F%E5%AE%9E%E9%87%87%E9%9B%86%E4%BB%BB%E5%8A%A1%E3%80%82")}</small>
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

function splitLines(value: string) {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
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

function TaskPanel({ tasks, result, readiness }: { tasks: TaskRecord[]; result: unknown; readiness: Readiness | null }) {
  return (
    <aside className="task-panel">
      <div className="panel-title">
        <div>
          <p>{text.tasks}</p>
          <h2>{tasks.length}</h2>
        </div>
        <Files size={20} />
      </div>

      {result ? (
        <section className="result-box">
          <strong>{text.result}</strong>
          <pre>{JSON.stringify(result, null, 2)}</pre>
        </section>
      ) : null}

      {readiness ? (
        <section className="result-box readiness-box">
          <strong>{cn("%E5%85%A8%E9%93%BE%E8%B7%AF%E9%85%8D%E7%BD%AE%E4%BD%93%E6%A3%80")}</strong>
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
          </div>
        </section>
      ) : null}

      <div className="task-list">
        {tasks.length === 0 ? (
          <div className="empty-state">
            <FileJson size={28} />
            <span>{text.empty}</span>
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
            {task.result ? <pre>{JSON.stringify(task.result, null, 2)}</pre> : null}
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
