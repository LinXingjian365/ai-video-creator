import React from "react";
import { Composition } from "remotion";
import { ScriptPackage } from "./ScriptPackage";

const FPS = 30;
const DEFAULT_DURATION_SEC = 45;

function calculateMetadata({ props }: { props: Record<string, unknown> }) {
  const raw = typeof props.durationSec === "number" ? props.durationSec : 0;
  const durationSec = raw > 0 ? raw : DEFAULT_DURATION_SEC;
  return { durationInFrames: Math.max(1, Math.round(durationSec * FPS)) };
}

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="ScriptPackageVertical"
      component={ScriptPackage}
      durationInFrames={DEFAULT_DURATION_SEC * FPS}
      fps={FPS}
      width={1080}
      height={1920}
      defaultProps={{}}
      calculateMetadata={calculateMetadata}
    />
    <Composition
      id="ScriptPackageWide"
      component={ScriptPackage}
      durationInFrames={DEFAULT_DURATION_SEC * FPS}
      fps={FPS}
      width={1920}
      height={1080}
      defaultProps={{}}
      calculateMetadata={calculateMetadata}
    />
  </>
);
