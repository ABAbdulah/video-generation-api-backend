/**
 * The render-time equivalent of the frontend's preview sandbox (M11).
 *
 * This file is BROWSER-CONTEXT code: it executes inside Remotion's headless
 * Chrome during a render, never in the Node process. It compiles the scene
 * source shipped in inputProps with Babel and executes it against a module
 * map — the same contract as the preview sandbox, except `remotion` here is
 * the REAL package (we're inside a genuine Remotion composition, so
 * useCurrentFrame/useVideoConfig get their context from the renderer).
 *
 * TRUST MODEL: the code arriving here has already passed the validation gate
 * (import whitelist + forbidden-globals) when it was persisted, and rendering
 * is scoped to a throwaway headless browser owned by the worker. This is the
 * one place outside the user's own browser where generated code runs, and it
 * exists because producing a video file requires executing the animation.
 */
import React, { useMemo } from "react";
import * as Babel from "@babel/standalone";
import * as remotion from "remotion";
import { AbsoluteFill } from "remotion";
import * as primitives from "../../lib/motion/primitives";

const MODULES: Record<string, unknown> = {
  react: React,
  remotion,
  "@/lib/motion/primitives": primitives,
};

export interface DynamicSceneProps {
  code: string;
  params: Record<string, string | number>;
  /** Consumed by the Composition's calculateMetadata, not by the scene itself —
   *  carried here so the whole render pipeline shares one props type. */
  durationInFrames: number;
  fps: number;
  /** Remotion's Composition constrains props to an indexable record. */
  [key: string]: unknown;
}

type SceneComponent = (props: {
  params: Record<string, string | number>;
}) => React.ReactNode;

function compile(code: string): SceneComponent {
  const out = Babel.transform(code, {
    filename: "scene.tsx",
    presets: ["typescript", ["react", { runtime: "classic" }]],
    plugins: ["transform-modules-commonjs"],
  });
  if (!out.code) throw new Error("Compiler produced no output");

  const moduleObj: { exports: Record<string, unknown> } = { exports: {} };
  const req = (name: string): unknown => {
    const mod = MODULES[name];
    if (!mod) throw new Error(`Import not allowed in render: "${name}"`);
    return mod;
  };

  const factory = new Function("require", "module", "exports", "React", out.code);
  factory(req, moduleObj, moduleObj.exports, React);

  const Component = moduleObj.exports.default as SceneComponent | undefined;
  if (typeof Component !== "function") {
    throw new Error("Scene has no default-exported component");
  }
  return Component;
}

export const DynamicScene: React.FC<DynamicSceneProps> = ({ code, params }) => {
  const Component = useMemo(() => compile(code), [code]);
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <Component params={params} />
    </AbsoluteFill>
  );
};
