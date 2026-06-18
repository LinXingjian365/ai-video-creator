import React, { useMemo } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { activeCueIndex, buildCaptionCues, cuesFromTimings } from "./captions";

export interface ScriptPackageProps {
  title: string;
  hook: string;
  beats: Array<{
    time?: string;
    shot?: string;
    voiceover?: string;
    caption?: string;
  }>;
  tags?: string[];
  bgm?: string;
  platform?: string;
  durationSec?: number;
  subtitleCues?: Array<{ text: string; startSec: number; endSec: number }>;
}

const fallbackProps: ScriptPackageProps = {
  title: "AI 视频增长控制台",
  hook: "从热点到脚本，再到可执行剪辑计划。",
  beats: [
    { time: "0-3s", shot: "标题卡", voiceover: "先抓住痛点。", caption: "前 3 秒必须有钩子" },
    { time: "3-18s", shot: "步骤卡", voiceover: "给出清晰步骤。", caption: "结构要能直接剪" },
    { time: "18-35s", shot: "行动卡", voiceover: "最后给行动指令。", caption: "结尾要能复盘" }
  ],
  tags: ["AI剪辑", "爆款拆解"],
  platform: "douyin"
};

export const ScriptPackage: React.FC<Partial<ScriptPackageProps>> = (props) => {
  const merged = { ...fallbackProps, ...props };
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width, height } = useVideoConfig();
  const beats = merged.beats.length > 0 ? merged.beats : fallbackProps.beats;
  // beatCard 始终按脚本节拍切换;底部烧录字幕优先用配音真实时间轴(edge-tts),无则退化为节拍
  const beatCues = useMemo(() => buildCaptionCues(beats, durationInFrames), [beats, durationInFrames]);
  const beatIndex = activeCueIndex(beatCues, frame);
  const activeBeat = beats[Math.max(0, beatIndex)];
  const subtitleCues = useMemo(
    () =>
      merged.subtitleCues && merged.subtitleCues.length > 0
        ? cuesFromTimings(merged.subtitleCues, durationInFrames, fps)
        : beatCues,
    [merged.subtitleCues, beatCues, durationInFrames, fps]
  );
  const subtitleIndex = activeCueIndex(subtitleCues, frame);
  const activeCue = subtitleIndex >= 0 ? subtitleCues[subtitleIndex] : undefined;
  const progress = Math.min(1, frame / Math.max(1, durationInFrames - 1));
  const introOpacity = interpolate(frame, [0, fps * 0.4], [0, 1], { extrapolateRight: "clamp" });
  const isVertical = height >= width;
  const captionFade = activeCue
    ? interpolate(frame, [activeCue.fromFrame, activeCue.fromFrame + fps * 0.25], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp"
      })
    : 0;

  return (
    <AbsoluteFill style={styles.root}>
      <div style={styles.topBar}>
        <span style={styles.platform}>{merged.platform ?? "short-video"}</span>
        <span style={styles.time}>{Math.floor(frame / fps)}s</span>
      </div>

      <div style={{ ...styles.main, padding: isVertical ? 72 : 56, opacity: introOpacity }}>
        <div style={styles.label}>SCRIPT PACKAGE</div>
        <h1 style={{ ...styles.title, fontSize: isVertical ? 72 : 58 }}>{merged.title}</h1>
        <p style={{ ...styles.hook, fontSize: isVertical ? 38 : 32 }}>{merged.hook}</p>

        <section style={styles.beatCard}>
          <div style={styles.beatMeta}>
            <span>{activeBeat.time ?? `Beat ${beatIndex + 1}`}</span>
            <span>{beatIndex + 1}/{beats.length}</span>
          </div>
          <strong style={styles.caption}>{activeBeat.shot || "保留高信息密度镜头"}</strong>
          <p style={styles.voiceover}>{activeBeat.voiceover || activeBeat.shot}</p>
        </section>

        <div style={styles.tags}>
          {(merged.tags ?? []).slice(0, 5).map((tag) => (
            <span key={tag}>{tag.startsWith("#") ? tag : `#${tag}`}</span>
          ))}
        </div>
      </div>

      {activeCue && activeCue.caption ? (
        <div style={{ ...styles.subtitleLayer, bottom: isVertical ? 220 : 96 }}>
          <span style={{ ...styles.subtitle, fontSize: isVertical ? 54 : 42, opacity: captionFade }}>
            {activeCue.caption}
          </span>
        </div>
      ) : null}

      <div style={styles.progressTrack}>
        <div style={{ ...styles.progressFill, width: `${progress * 100}%` }} />
      </div>
    </AbsoluteFill>
  );
};

const styles: Record<string, React.CSSProperties> = {
  root: {
    background: "linear-gradient(135deg, #071b1f 0%, #0e3437 42%, #142527 100%)",
    color: "#f5fbf8",
    fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
    overflow: "hidden"
  },
  topBar: {
    position: "absolute",
    top: 34,
    left: 44,
    right: 44,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    color: "#b8dad2",
    fontSize: 24
  },
  platform: {
    textTransform: "uppercase",
    letterSpacing: 0,
    fontWeight: 700
  },
  time: {
    fontVariantNumeric: "tabular-nums"
  },
  main: {
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    gap: 28,
    height: "100%"
  },
  label: {
    color: "#79d3c7",
    fontSize: 24,
    fontWeight: 800
  },
  title: {
    margin: 0,
    lineHeight: 1.08,
    maxWidth: 1180,
    fontWeight: 900
  },
  hook: {
    margin: 0,
    maxWidth: 1080,
    color: "#d8e8e3",
    lineHeight: 1.35
  },
  beatCard: {
    marginTop: 22,
    padding: 34,
    border: "2px solid rgba(128, 211, 199, 0.55)",
    background: "rgba(5, 24, 27, 0.72)",
    borderRadius: 8
  },
  beatMeta: {
    display: "flex",
    justifyContent: "space-between",
    color: "#8ad8ce",
    fontSize: 22,
    marginBottom: 18
  },
  caption: {
    display: "block",
    fontSize: 40,
    lineHeight: 1.2
  },
  voiceover: {
    margin: "18px 0 0",
    color: "#c7dcd8",
    fontSize: 28,
    lineHeight: 1.35
  },
  tags: {
    display: "flex",
    flexWrap: "wrap",
    gap: 12,
    color: "#061719",
    fontWeight: 800,
    fontSize: 22
  },
  progressTrack: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 10,
    background: "rgba(255,255,255,0.16)"
  },
  subtitleLayer: {
    position: "absolute",
    left: 0,
    right: 0,
    display: "flex",
    justifyContent: "center",
    padding: "0 56px",
    pointerEvents: "none"
  },
  subtitle: {
    display: "inline-block",
    maxWidth: "92%",
    textAlign: "center",
    color: "#ffffff",
    fontWeight: 900,
    lineHeight: 1.25,
    padding: "12px 26px",
    borderRadius: 12,
    background: "rgba(4, 16, 18, 0.72)",
    border: "1px solid rgba(125, 224, 206, 0.35)",
    textShadow: "0 3px 14px rgba(0,0,0,0.8)"
  },
  progressFill: {
    height: "100%",
    background: "#7de0ce"
  }
};
