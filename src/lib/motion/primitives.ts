/**
 * The constrained motion DSL.
 *
 * Every generated animation composes from these primitives and nothing else.
 * They are pure functions of `frame` (or `index`), fully deterministic, and
 * return plain values ready to drop into inline styles / SVG attributes inside
 * a Remotion component. No side effects, no time, no randomness.
 *
 * Design rules:
 *  - `frame` is the current Remotion frame (see useCurrentFrame()).
 *  - Anything time-based takes an explicit `fps` (default 60) so tests and the
 *    renderer agree.
 *  - Durations are clamped to >= 1 frame so interpolate() never gets a
 *    zero-width input range.
 */
import { Easing, interpolate, spring } from "remotion";

/**
 * Re-exported for the preview runtime's `remotion` shim
 * (lib/motion/preview-runtime.tsx), which supplies the context-dependent APIs
 * itself but has no reason to reimplement these three — they are pure maths.
 *
 * Underscore-prefixed because generated code must never reach for them
 * directly: templates import from the DSL surface below, or from 'remotion'.
 */
export {
  Easing as __remotionEasing,
  interpolate as __remotionInterpolate,
  spring as __remotionSpring,
};

// ---------------------------------------------------------------------------
// Easing — generated code / params reference easings by name (JSON-safe).
// ---------------------------------------------------------------------------

export type EasingName =
  | "linear"
  | "ease"
  | "easeIn"
  | "easeOut"
  | "easeInOut"
  | "quadIn"
  | "quadOut"
  | "quadInOut"
  | "cubicIn"
  | "cubicOut"
  | "cubicInOut";

const EASINGS: Record<EasingName, (t: number) => number> = {
  linear: Easing.linear,
  ease: Easing.ease,
  easeIn: Easing.in(Easing.ease),
  easeOut: Easing.out(Easing.ease),
  easeInOut: Easing.inOut(Easing.ease),
  quadIn: Easing.in(Easing.quad),
  quadOut: Easing.out(Easing.quad),
  quadInOut: Easing.inOut(Easing.quad),
  cubicIn: Easing.in(Easing.cubic),
  cubicOut: Easing.out(Easing.cubic),
  cubicInOut: Easing.inOut(Easing.cubic),
};

export function resolveEasing(name?: EasingName): (t: number) => number {
  return (name && EASINGS[name]) || EASINGS.cubicOut;
}

/** Normalized 0..1 progress across [start, start+duration], clamped at both ends. */
export function progress(
  frame: number,
  start: number,
  duration: number,
  easing?: EasingName,
): number {
  const dur = Math.max(1, duration);
  return interpolate(frame, [start, start + dur], [0, 1], {
    easing: resolveEasing(easing),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
}

// ---------------------------------------------------------------------------
// 1. springIn — spring from `from` to `to`.
// ---------------------------------------------------------------------------

export interface SpringInOpts {
  fps?: number;
  delay?: number;
  stiffness?: number;
  damping?: number;
  mass?: number;
  from?: number;
  to?: number;
  durationInFrames?: number;
}

export function springIn(frame: number, opts: SpringInOpts = {}): number {
  const {
    fps = 60,
    delay = 0,
    stiffness = 100,
    damping = 12,
    mass = 1,
    from = 0,
    to = 1,
    durationInFrames,
  } = opts;
  return spring({
    frame,
    fps,
    delay,
    from,
    to,
    durationInFrames,
    config: { stiffness, damping, mass },
  });
}

// ---------------------------------------------------------------------------
// 2. stagger — per-item start offset (in frames) for list/group animations.
// ---------------------------------------------------------------------------

export interface StaggerOpts {
  perItem: number;
  delay?: number;
}

export function stagger(index: number, opts: StaggerOpts): number {
  const { perItem, delay = 0 } = opts;
  return delay + index * perItem;
}

// ---------------------------------------------------------------------------
// 3. maskWipe — directional reveal via CSS inset() clip-path.
// ---------------------------------------------------------------------------

export type WipeDirection = "left" | "right" | "up" | "down";

export interface MaskWipeOpts {
  direction?: WipeDirection;
  start?: number;
  duration?: number;
  easing?: EasingName;
}

/** Returns a `clip-path` string revealing content in the given direction. */
export function maskWipe(frame: number, opts: MaskWipeOpts = {}): string {
  const { direction = "left", start = 0, duration = 20, easing } = opts;
  const p = progress(frame, start, duration, easing);
  const hidden = (1 - p) * 100; // percent of the box still masked
  switch (direction) {
    case "left": // reveal left -> right
      return `inset(0 ${hidden}% 0 0)`;
    case "right": // reveal right -> left
      return `inset(0 0 0 ${hidden}%)`;
    case "up": // reveal top -> bottom
      return `inset(0 0 ${hidden}% 0)`;
    case "down": // reveal bottom -> top
      return `inset(${hidden}% 0 0 0)`;
  }
}

// ---------------------------------------------------------------------------
// 4. pathDraw — stroke-dashoffset animation for "drawing" an SVG path.
// ---------------------------------------------------------------------------

export interface PathDrawOpts {
  start?: number;
  duration?: number;
  easing?: EasingName;
  pathLength?: number;
}

export interface PathDrawResult {
  strokeDasharray: number;
  strokeDashoffset: number;
}

/**
 * Set the returned values on the <path>. Use with `pathLength={pathLength}` so
 * dash units are normalized. At progress 0 the path is undrawn; at 1 fully drawn.
 */
export function pathDraw(frame: number, opts: PathDrawOpts = {}): PathDrawResult {
  const { start = 0, duration = 30, easing, pathLength = 1 } = opts;
  const p = progress(frame, start, duration, easing);
  return {
    strokeDasharray: pathLength,
    strokeDashoffset: pathLength * (1 - p),
  };
}

// ---------------------------------------------------------------------------
// 5. counter — animated number, formatted to a string.
// ---------------------------------------------------------------------------

export interface CounterFormat {
  decimals?: number;
  prefix?: string;
  suffix?: string;
  /** Group thousands with commas. */
  thousands?: boolean;
}

export interface CounterOpts {
  from?: number;
  to: number;
  start?: number;
  duration?: number;
  easing?: EasingName;
  format?: CounterFormat;
}

export interface CounterResult {
  value: number;
  text: string;
}

export function counter(frame: number, opts: CounterOpts): CounterResult {
  const { from = 0, to, start = 0, duration = 60, easing, format = {} } = opts;
  const p = progress(frame, start, duration, easing);
  const value = from + (to - from) * p;
  const { decimals = 0, prefix = "", suffix = "", thousands = false } = format;
  const fixed = value.toFixed(decimals);
  const text = thousands
    ? `${prefix}${addThousands(fixed)}${suffix}`
    : `${prefix}${fixed}${suffix}`;
  return { value, text };
}

function addThousands(numStr: string): string {
  const [intPart, decPart] = numStr.split(".");
  const sign = intPart.startsWith("-") ? "-" : "";
  const digits = sign ? intPart.slice(1) : intPart;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return decPart ? `${sign}${grouped}.${decPart}` : `${sign}${grouped}`;
}

// ---------------------------------------------------------------------------
// 6. morph — interpolate between two SVG path `d` strings.
//    Requires identical command structure (same commands, same point counts).
//    Returns the `from` path unchanged if the structures don't match, so a bad
//    template degrades to a static shape rather than throwing at render time.
// ---------------------------------------------------------------------------

export interface MorphOpts {
  fromPath: string;
  toPath: string;
  start?: number;
  duration?: number;
  easing?: EasingName;
}

const NUMBER_RE = /-?\d*\.?\d+(?:e[-+]?\d+)?/gi;

export function morphable(fromPath: string, toPath: string): boolean {
  const skeleton = (s: string) => s.replace(NUMBER_RE, "#");
  const fromNums = fromPath.match(NUMBER_RE)?.length ?? 0;
  const toNums = toPath.match(NUMBER_RE)?.length ?? 0;
  return skeleton(fromPath) === skeleton(toPath) && fromNums === toNums;
}

export function morph(frame: number, opts: MorphOpts): string {
  const { fromPath, toPath, start = 0, duration = 30, easing } = opts;
  if (!morphable(fromPath, toPath)) return fromPath;
  const p = progress(frame, start, duration, easing);
  const toNums = toPath.match(NUMBER_RE)!.map(Number);
  let i = 0;
  return fromPath.replace(NUMBER_RE, (m) => {
    const a = Number(m);
    const b = toNums[i++];
    return String(a + (b - a) * p);
  });
}

// ---------------------------------------------------------------------------
// 7. fadeSlide — fade in while sliding along one axis.
// ---------------------------------------------------------------------------

export interface FadeSlideOpts {
  axis?: "x" | "y";
  distance?: number;
  start?: number;
  duration?: number;
  easing?: EasingName;
}

export interface FadeSlideResult {
  opacity: number;
  transform: string;
}

export function fadeSlide(frame: number, opts: FadeSlideOpts = {}): FadeSlideResult {
  const { axis = "y", distance = 24, start = 0, duration = 20, easing } = opts;
  const p = progress(frame, start, duration, easing);
  const offset = (1 - p) * distance;
  const transform =
    axis === "x" ? `translateX(${offset}px)` : `translateY(${offset}px)`;
  return { opacity: p, transform };
}

// ---------------------------------------------------------------------------
// 8. pendulum — damped rotational oscillation (degrees).
// ---------------------------------------------------------------------------

export interface PendulumOpts {
  amplitude?: number; // peak angle in degrees
  frequency?: number; // oscillations per second
  decay?: number; // exponential damping per second
  start?: number;
  fps?: number;
}

export interface PendulumResult {
  angle: number;
  transform: string;
}

export function pendulum(frame: number, opts: PendulumOpts = {}): PendulumResult {
  const { amplitude = 15, frequency = 1, decay = 1.5, start = 0, fps = 60 } = opts;
  const t = Math.max(0, (frame - start) / fps); // seconds since start
  const angle =
    amplitude * Math.exp(-decay * t) * Math.cos(2 * Math.PI * frequency * t);
  return { angle, transform: `rotate(${angle}deg)` };
}

// ---------------------------------------------------------------------------
// 9. lightSweep — a moving specular highlight across an element.
// ---------------------------------------------------------------------------

export interface LightSweepOpts {
  angle?: number; // gradient angle in degrees
  start?: number;
  duration?: number;
  easing?: EasingName;
  color?: string; // highlight colour
  bandWidth?: number; // width of the shine band, in %
}

export interface LightSweepResult {
  /** 0..100 — the sweep centre position across the element, in %. */
  position: number;
  backgroundImage: string;
  backgroundSize: string;
  backgroundPosition: string;
}

export function lightSweep(
  frame: number,
  opts: LightSweepOpts = {},
): LightSweepResult {
  const {
    angle = 120,
    start = 0,
    duration = 30,
    easing,
    color = "rgba(255,255,255,0.6)",
    bandWidth = 20,
  } = opts;
  const p = progress(frame, start, duration, easing);
  // Travel from just off the left edge to just off the right edge.
  const position = interpolate(p, [0, 1], [-bandWidth, 100 + bandWidth]);
  const transparent = "rgba(255,255,255,0)";
  return {
    position,
    backgroundImage: `linear-gradient(${angle}deg, ${transparent} 0%, ${color} 50%, ${transparent} 100%)`,
    backgroundSize: `${bandWidth * 2}% 100%`,
    backgroundPosition: `${position}% 0`,
  };
}
