import React from "react";
import { Composition } from "remotion";
import { ScriptPackage } from "./ScriptPackage";

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="ScriptPackageVertical"
      component={ScriptPackage}
      durationInFrames={45 * 30}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{}}
    />
    <Composition
      id="ScriptPackageWide"
      component={ScriptPackage}
      durationInFrames={45 * 30}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={{}}
    />
  </>
);
