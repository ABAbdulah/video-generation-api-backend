/**
 * Remotion root for M11 exports. One composition, "scene", whose duration and
 * fps come from inputProps via calculateMetadata — every export renders the
 * exact timing the scene was generated with.
 */
import React from "react";
import { Composition, type CalculateMetadataFunction } from "remotion";
import { DynamicScene, type DynamicSceneProps } from "./DynamicScene";

const DEFAULTS: DynamicSceneProps = {
  code: "export default function Empty() { return null; }",
  params: {},
  durationInFrames: 120,
  fps: 60,
};

const calculateMetadata: CalculateMetadataFunction<DynamicSceneProps> = ({
  props,
}) => ({
  durationInFrames: props.durationInFrames,
  fps: props.fps,
  props,
});

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="scene"
      component={DynamicScene}
      width={1920}
      height={1080}
      durationInFrames={DEFAULTS.durationInFrames}
      fps={DEFAULTS.fps}
      defaultProps={DEFAULTS}
      calculateMetadata={calculateMetadata}
    />
  );
};
