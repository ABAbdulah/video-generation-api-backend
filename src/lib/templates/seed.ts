import type { TemplateDef } from "./types";
import { EXTENDED_TEMPLATES } from "./seed-extended";

/**
 * The built-in template corpus.
 *
 * Every template:
 *  - imports only from react / remotion / @/lib/motion/primitives
 *  - reads every tunable value from `params` (nothing hardcoded)
 *  - has a default export component
 *  - passes lib/templates/validate.ts
 *
 * Component code is authored with string concatenation (not template literals)
 * so the whole source can live inside a backtick string here without escaping.
 *
 * This file holds the original core set; the rest of the corpus lives in
 * ./seed-extended.ts purely to keep both files readable. `SEED_TEMPLATES` is
 * the concatenation and remains the single source every consumer imports —
 * seeding, embedding and retrieval all read it and nothing else.
 */
const CORE_TEMPLATES: TemplateDef[] = [
  // ---------------------------------------------------------------- text ---
  {
    slug: "kinetic-headline",
    title: "Kinetic Headline",
    prompt: "A bold headline that rises and fades into view",
    category: "text",
    durationInFrames: 120,
    fps: 60,
    params: [
      { key: "headline", label: "Headline", type: "text", default: "Ship it." },
      { key: "textColor", label: "Text colour", type: "color", default: "#ffffff" },
      { key: "bgColor", label: "Background", type: "color", default: "#0b0b0f" },
      { key: "fontSize", label: "Font size", type: "number", default: 96, min: 24, max: 240, step: 2 },
      { key: "riseDistance", label: "Rise distance", type: "number", default: 40, min: 0, max: 200, step: 2 },
      { key: "riseDuration", label: "Rise duration", type: "duration", default: 18, min: 4, max: 120, step: 1 },
    ],
    code: `
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { fadeSlide } from '@/lib/motion/primitives';

export default function KineticHeadline({ params }) {
  const frame = useCurrentFrame();
  const { headline, textColor, bgColor, fontSize, riseDistance, riseDuration } = params;
  const rise = fadeSlide(frame, { axis: 'y', distance: riseDistance, duration: riseDuration });
  return (
    <AbsoluteFill style={{ backgroundColor: bgColor, justifyContent: 'center', alignItems: 'center' }}>
      <h1 style={{ color: textColor, fontSize, fontWeight: 800, margin: 0, textAlign: 'center', opacity: rise.opacity, transform: rise.transform }}>
        {headline}
      </h1>
    </AbsoluteFill>
  );
}
`.trim(),
  },
  {
    slug: "word-stagger",
    title: "Word Stagger",
    prompt: "Words that spring in one after another",
    category: "text",
    durationInFrames: 120,
    fps: 60,
    params: [
      { key: "words", label: "Words", type: "text", default: "make motion move" },
      { key: "textColor", label: "Text colour", type: "color", default: "#ffffff" },
      { key: "bgColor", label: "Background", type: "color", default: "#111827" },
      { key: "fontSize", label: "Font size", type: "number", default: 72, min: 24, max: 200, step: 2 },
      { key: "perWord", label: "Frames per word", type: "duration", default: 5, min: 1, max: 30, step: 1 },
    ],
    code: `
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { springIn, stagger } from '@/lib/motion/primitives';

export default function WordStagger({ params }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { words, textColor, bgColor, fontSize, perWord } = params;
  const list = String(words).split(' ');
  return (
    <AbsoluteFill style={{ backgroundColor: bgColor, flexDirection: 'row', flexWrap: 'wrap', gap: 16, justifyContent: 'center', alignItems: 'center' }}>
      {list.map((word, i) => {
        const o = springIn(frame, { fps, delay: stagger(i, { perItem: perWord }), from: 0, to: 1 });
        return (
          <span key={i} style={{ color: textColor, fontSize, fontWeight: 700, opacity: o, transform: 'translateY(' + (1 - o) * 20 + 'px)' }}>
            {word}
          </span>
        );
      })}
    </AbsoluteFill>
  );
}
`.trim(),
  },
  {
    slug: "gradient-word-wipe",
    title: "Gradient Word Wipe",
    prompt: "A single word revealed by a wipe over a gradient fill",
    category: "text",
    durationInFrames: 120,
    fps: 60,
    params: [
      { key: "word", label: "Word", type: "text", default: "LAUNCH" },
      { key: "fromColor", label: "Gradient start", type: "color", default: "#6366f1" },
      { key: "toColor", label: "Gradient end", type: "color", default: "#ec4899" },
      { key: "bgColor", label: "Background", type: "color", default: "#0b0b0f" },
      { key: "wipeDuration", label: "Wipe duration", type: "duration", default: 24, min: 4, max: 120, step: 1 },
    ],
    code: `
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { maskWipe } from '@/lib/motion/primitives';

export default function GradientWordWipe({ params }) {
  const frame = useCurrentFrame();
  const { word, fromColor, toColor, bgColor, wipeDuration } = params;
  const clipPath = maskWipe(frame, { direction: 'left', start: 0, duration: wipeDuration });
  return (
    <AbsoluteFill style={{ backgroundColor: bgColor, justifyContent: 'center', alignItems: 'center' }}>
      <span style={{ fontSize: 160, fontWeight: 900, clipPath, color: 'transparent', backgroundImage: 'linear-gradient(90deg, ' + fromColor + ', ' + toColor + ')', WebkitBackgroundClip: 'text', backgroundClip: 'text' }}>
        {word}
      </span>
    </AbsoluteFill>
  );
}
`.trim(),
  },
  // ------------------------------------------------------------ graphics ---
  {
    slug: "grid-pop",
    title: "Grid Pop",
    prompt: "A grid of dots that pop in with a spring, staggered",
    category: "graphics",
    durationInFrames: 120,
    fps: 60,
    params: [
      { key: "rows", label: "Rows", type: "number", default: 3, min: 1, max: 10, step: 1 },
      { key: "cols", label: "Columns", type: "number", default: 5, min: 1, max: 12, step: 1 },
      { key: "dotColor", label: "Dot colour", type: "color", default: "#22d3ee" },
      { key: "bgColor", label: "Background", type: "color", default: "#0b0b0f" },
      { key: "perDot", label: "Frames per dot", type: "duration", default: 3, min: 0, max: 20, step: 1 },
    ],
    code: `
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { springIn, stagger } from '@/lib/motion/primitives';

export default function GridPop({ params }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { rows, cols, dotColor, bgColor, perDot } = params;
  const cells = Array.from({ length: rows * cols });
  return (
    <AbsoluteFill style={{ backgroundColor: bgColor, justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(' + cols + ', 1fr)', gap: 24 }}>
        {cells.map((_, i) => {
          const s = springIn(frame, { fps, delay: stagger(i, { perItem: perDot }), from: 0, to: 1 });
          return <div key={i} style={{ width: 40, height: 40, borderRadius: 999, backgroundColor: dotColor, transform: 'scale(' + s + ')' }} />;
        })}
      </div>
    </AbsoluteFill>
  );
}
`.trim(),
  },
  {
    slug: "morph-shape",
    title: "Morphing Shape",
    prompt: "A shape that morphs from a square into a diamond",
    category: "graphics",
    durationInFrames: 150,
    fps: 60,
    params: [
      { key: "fromPath", label: "From path", type: "text", default: "M25 25 L75 25 L75 75 L25 75 Z" },
      { key: "toPath", label: "To path", type: "text", default: "M50 15 L85 50 L50 85 L15 50 Z" },
      { key: "shapeColor", label: "Shape colour", type: "color", default: "#f59e0b" },
      { key: "bgColor", label: "Background", type: "color", default: "#0b0b0f" },
      { key: "morphDuration", label: "Morph duration", type: "duration", default: 40, min: 6, max: 200, step: 1 },
    ],
    code: `
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { morph } from '@/lib/motion/primitives';

export default function MorphShape({ params }) {
  const frame = useCurrentFrame();
  const { fromPath, toPath, shapeColor, bgColor, morphDuration } = params;
  const d = morph(frame, { fromPath, toPath, start: 0, duration: morphDuration });
  return (
    <AbsoluteFill style={{ backgroundColor: bgColor, justifyContent: 'center', alignItems: 'center' }}>
      <svg width={480} height={480} viewBox="0 0 100 100">
        <path d={d} fill={shapeColor} />
      </svg>
    </AbsoluteFill>
  );
}
`.trim(),
  },
  // ------------------------------------------------------------ overlays ---
  {
    slug: "lower-third",
    title: "Lower Third",
    prompt: "A broadcast-style lower third that wipes in with a title and subtitle",
    category: "overlays",
    durationInFrames: 150,
    fps: 60,
    params: [
      { key: "title", label: "Title", type: "text", default: "Jane Doe" },
      { key: "subtitle", label: "Subtitle", type: "text", default: "Head of Motion" },
      { key: "barColor", label: "Bar colour", type: "color", default: "#6366f1" },
      { key: "textColor", label: "Text colour", type: "color", default: "#ffffff" },
      { key: "revealDuration", label: "Reveal duration", type: "duration", default: 16, min: 4, max: 90, step: 1 },
    ],
    code: `
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { fadeSlide, maskWipe } from '@/lib/motion/primitives';

export default function LowerThird({ params }) {
  const frame = useCurrentFrame();
  const { title, subtitle, barColor, textColor, revealDuration } = params;
  const clipPath = maskWipe(frame, { direction: 'left', start: 0, duration: revealDuration });
  const sub = fadeSlide(frame, { axis: 'x', distance: 30, start: 8, duration: revealDuration });
  return (
    <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'flex-start', padding: 80 }}>
      <div style={{ backgroundColor: barColor, padding: '18px 28px', borderRadius: 10, clipPath }}>
        <div style={{ color: textColor, fontSize: 44, fontWeight: 800 }}>{title}</div>
        <div style={{ color: textColor, fontSize: 26, opacity: sub.opacity, transform: sub.transform }}>{subtitle}</div>
      </div>
    </AbsoluteFill>
  );
}
`.trim(),
  },
  // --------------------------------------------------------------- logos ---
  {
    slug: "logo-shine",
    title: "Logo Shine",
    prompt: "A wordmark that springs in and catches a light sweep",
    category: "logos",
    durationInFrames: 150,
    fps: 60,
    params: [
      { key: "logoText", label: "Logo text", type: "text", default: "NOVA" },
      { key: "boxColor", label: "Box colour", type: "color", default: "#111827" },
      { key: "textColor", label: "Text colour", type: "color", default: "#ffffff" },
      { key: "bgColor", label: "Background", type: "color", default: "#0b0b0f" },
      { key: "sweepStart", label: "Sweep start", type: "number", default: 20, min: 0, max: 120, step: 1 },
      { key: "sweepDuration", label: "Sweep duration", type: "duration", default: 30, min: 6, max: 120, step: 1 },
    ],
    code: `
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { springIn, lightSweep } from '@/lib/motion/primitives';

export default function LogoShine({ params }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { logoText, boxColor, textColor, bgColor, sweepStart, sweepDuration } = params;
  const s = springIn(frame, { fps, from: 0, to: 1 });
  const shine = lightSweep(frame, { start: sweepStart, duration: sweepDuration });
  return (
    <AbsoluteFill style={{ backgroundColor: bgColor, justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ position: 'relative', overflow: 'hidden', backgroundColor: boxColor, padding: '40px 64px', borderRadius: 20, transform: 'scale(' + s + ')' }}>
        <span style={{ color: textColor, fontSize: 72, fontWeight: 900, letterSpacing: 4 }}>{logoText}</span>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: shine.backgroundImage, backgroundSize: shine.backgroundSize, backgroundPosition: shine.backgroundPosition, backgroundRepeat: 'no-repeat' }} />
      </div>
    </AbsoluteFill>
  );
}
`.trim(),
  },
  // -------------------------------------------------------------- social ---
  {
    slug: "story-cta",
    title: "Story CTA",
    prompt: "A vertical story message with a swinging call-to-action button",
    category: "social",
    durationInFrames: 150,
    fps: 60,
    params: [
      { key: "message", label: "Message", type: "text", default: "Link in bio" },
      { key: "ctaText", label: "Button text", type: "text", default: "Tap here" },
      { key: "bgColor", label: "Background", type: "color", default: "#7c3aed" },
      { key: "accentColor", label: "Accent", type: "color", default: "#fde047" },
      { key: "textColor", label: "Text colour", type: "color", default: "#ffffff" },
    ],
    code: `
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { fadeSlide, pendulum } from '@/lib/motion/primitives';

export default function StoryCTA({ params }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { message, ctaText, bgColor, accentColor, textColor } = params;
  const m = fadeSlide(frame, { axis: 'y', distance: 40, start: 0, duration: 20 });
  const swing = pendulum(frame, { amplitude: 8, decay: 0.8, start: 24, fps });
  return (
    <AbsoluteFill style={{ backgroundColor: bgColor, justifyContent: 'center', alignItems: 'center', padding: 60, gap: 48 }}>
      <h1 style={{ color: textColor, fontSize: 80, fontWeight: 800, textAlign: 'center', margin: 0, opacity: m.opacity, transform: m.transform }}>{message}</h1>
      <div style={{ backgroundColor: accentColor, color: bgColor, fontSize: 42, fontWeight: 800, padding: '24px 48px', borderRadius: 999, transform: swing.transform }}>{ctaText}</div>
    </AbsoluteFill>
  );
}
`.trim(),
  },
  // --------------------------------------------------------- charts-data ---
  {
    slug: "bar-chart",
    title: "Animated Bar Chart",
    prompt: "Bars that grow to their values with counting labels",
    category: "charts-data",
    durationInFrames: 150,
    fps: 60,
    params: [
      { key: "values", label: "Values (comma separated)", type: "text", default: "40, 72, 55, 90, 63" },
      { key: "barColor", label: "Bar colour", type: "color", default: "#34d399" },
      { key: "bgColor", label: "Background", type: "color", default: "#0b0b0f" },
      { key: "labelColor", label: "Label colour", type: "color", default: "#e5e7eb" },
      { key: "growDuration", label: "Grow duration", type: "duration", default: 30, min: 6, max: 120, step: 1 },
    ],
    code: `
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { springIn, counter, stagger } from '@/lib/motion/primitives';

export default function BarChart({ params }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { values, barColor, bgColor, labelColor, growDuration } = params;
  const nums = String(values).split(',').map((v) => Number(v.trim()));
  const max = Math.max.apply(null, nums.concat([1]));
  return (
    <AbsoluteFill style={{ backgroundColor: bgColor, flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-end', gap: 32, padding: 120 }}>
      {nums.map((n, i) => {
        const delay = stagger(i, { perItem: 6 });
        const grow = springIn(frame, { fps, delay, from: 0, to: 1 });
        const label = counter(frame, { to: n, start: delay, duration: growDuration });
        return (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <span style={{ color: labelColor, fontSize: 28, fontWeight: 700 }}>{label.text}</span>
            <div style={{ width: 80, height: (n / max) * 400 * grow, backgroundColor: barColor, borderRadius: 8 }} />
          </div>
        );
      })}
    </AbsoluteFill>
  );
}
`.trim(),
  },
  {
    slug: "kpi-stat-card",
    title: "KPI Stat Card",
    prompt: "A card that slides up while a big stat counts to its value",
    category: "charts-data",
    durationInFrames: 150,
    fps: 60,
    params: [
      { key: "statValue", label: "Stat value", type: "number", default: 12500, min: 0, max: 10000000, step: 1 },
      { key: "statLabel", label: "Stat label", type: "text", default: "Monthly active users" },
      { key: "cardColor", label: "Card colour", type: "color", default: "#111827" },
      { key: "accentColor", label: "Accent", type: "color", default: "#38bdf8" },
      { key: "bgColor", label: "Background", type: "color", default: "#0b0b0f" },
      { key: "countDuration", label: "Count duration", type: "duration", default: 60, min: 10, max: 180, step: 1 },
    ],
    code: `
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { counter, fadeSlide } from '@/lib/motion/primitives';

export default function KpiStatCard({ params }) {
  const frame = useCurrentFrame();
  const { statValue, statLabel, cardColor, accentColor, bgColor, countDuration } = params;
  const enter = fadeSlide(frame, { axis: 'y', distance: 40, start: 0, duration: 18 });
  const c = counter(frame, { to: statValue, start: 6, duration: countDuration, format: { thousands: true } });
  return (
    <AbsoluteFill style={{ backgroundColor: bgColor, justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ backgroundColor: cardColor, borderRadius: 24, padding: '56px 80px', textAlign: 'center', opacity: enter.opacity, transform: enter.transform }}>
        <div style={{ color: accentColor, fontSize: 120, fontWeight: 900 }}>{c.text}</div>
        <div style={{ color: accentColor, fontSize: 34, fontWeight: 600, opacity: 0.8 }}>{statLabel}</div>
      </div>
    </AbsoluteFill>
  );
}
`.trim(),
  },
  // --------------------------------------------------------------- money ---
  {
    slug: "price-counter",
    title: "Price Counter",
    prompt: "A price that counts up in a currency and catches a shine",
    category: "money",
    durationInFrames: 150,
    fps: 60,
    params: [
      { key: "targetPrice", label: "Target price", type: "number", default: 1299.99, min: 0, max: 1000000, step: 0.01 },
      { key: "currencySymbol", label: "Currency symbol", type: "text", default: "$" },
      { key: "bgColor", label: "Background", type: "color", default: "#052e16" },
      { key: "textColor", label: "Text colour", type: "color", default: "#bbf7d0" },
      { key: "countDuration", label: "Count duration", type: "duration", default: 60, min: 10, max: 180, step: 1 },
    ],
    code: `
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { counter, lightSweep } from '@/lib/motion/primitives';

export default function PriceCounter({ params }) {
  const frame = useCurrentFrame();
  const { targetPrice, currencySymbol, bgColor, textColor, countDuration } = params;
  const c = counter(frame, { to: targetPrice, start: 0, duration: countDuration, format: { thousands: true, decimals: 2, prefix: currencySymbol } });
  const shine = lightSweep(frame, { start: countDuration, duration: 24 });
  return (
    <AbsoluteFill style={{ backgroundColor: bgColor, justifyContent: 'center', alignItems: 'center' }}>
      <span style={{ color: textColor, fontSize: 140, fontWeight: 900, backgroundImage: shine.backgroundImage, backgroundSize: shine.backgroundSize, backgroundPosition: shine.backgroundPosition, backgroundRepeat: 'no-repeat' }}>{c.text}</span>
    </AbsoluteFill>
  );
}
`.trim(),
  },
  // --------------------------------------------------------- app-website ---
  {
    slug: "feature-callouts",
    title: "Feature Callouts",
    prompt: "Feature pills that slide in one after another",
    category: "app-website",
    durationInFrames: 150,
    fps: 60,
    params: [
      { key: "features", label: "Features (comma separated)", type: "text", default: "Fast, Secure, Delightful" },
      { key: "cardColor", label: "Card colour", type: "color", default: "#1e293b" },
      { key: "textColor", label: "Text colour", type: "color", default: "#f8fafc" },
      { key: "bgColor", label: "Background", type: "color", default: "#0b0b0f" },
      { key: "perCard", label: "Frames per card", type: "duration", default: 8, min: 1, max: 40, step: 1 },
    ],
    code: `
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { fadeSlide, stagger } from '@/lib/motion/primitives';

export default function FeatureCallouts({ params }) {
  const frame = useCurrentFrame();
  const { features, cardColor, textColor, bgColor, perCard } = params;
  const items = String(features).split(',').map((f) => f.trim());
  return (
    <AbsoluteFill style={{ backgroundColor: bgColor, justifyContent: 'center', alignItems: 'center', gap: 20 }}>
      {items.map((f, i) => {
        const a = fadeSlide(frame, { axis: 'x', distance: 60, start: stagger(i, { perItem: perCard }), duration: 18 });
        return (
          <div key={i} style={{ backgroundColor: cardColor, color: textColor, fontSize: 36, fontWeight: 700, padding: '20px 40px', borderRadius: 14, minWidth: 480, textAlign: 'center', opacity: a.opacity, transform: a.transform }}>
            {f}
          </div>
        );
      })}
    </AbsoluteFill>
  );
}
`.trim(),
  },
  // --------------------------------------------------------- ui-elements ---
  {
    slug: "checkmark-draw",
    title: "Checkmark Draw",
    prompt: "A checkmark that draws itself on with a stroke animation",
    category: "ui-elements",
    durationInFrames: 120,
    fps: 60,
    params: [
      { key: "strokeColor", label: "Stroke colour", type: "color", default: "#22c55e" },
      { key: "bgColor", label: "Background", type: "color", default: "#0b0b0f" },
      { key: "drawStart", label: "Draw start", type: "number", default: 8, min: 0, max: 90, step: 1 },
      { key: "drawDuration", label: "Draw duration", type: "duration", default: 40, min: 6, max: 120, step: 1 },
      { key: "strokeWidthPx", label: "Stroke width", type: "number", default: 8, min: 1, max: 24, step: 1 },
    ],
    code: `
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { pathDraw } from '@/lib/motion/primitives';

export default function CheckmarkDraw({ params }) {
  const frame = useCurrentFrame();
  const { strokeColor, bgColor, drawStart, drawDuration, strokeWidthPx } = params;
  const draw = pathDraw(frame, { start: drawStart, duration: drawDuration, pathLength: 100 });
  return (
    <AbsoluteFill style={{ backgroundColor: bgColor, justifyContent: 'center', alignItems: 'center' }}>
      <svg width={400} height={400} viewBox="0 0 100 100">
        <path d="M20 52 L44 76 L82 26" fill="none" stroke={strokeColor} strokeWidth={strokeWidthPx} strokeLinecap="round" strokeLinejoin="round" pathLength={100} strokeDasharray={draw.strokeDasharray} strokeDashoffset={draw.strokeDashoffset} />
      </svg>
    </AbsoluteFill>
  );
}
`.trim(),
  },
  // ------------------------------------------------------- launch-videos ---
  {
    slug: "launch-countdown",
    title: "Launch Countdown",
    prompt: "A big number counting down to launch with a subtle wobble",
    category: "launch-videos",
    durationInFrames: 180,
    fps: 60,
    params: [
      { key: "startNumber", label: "Start number", type: "number", default: 5, min: 1, max: 10, step: 1 },
      { key: "bgColor", label: "Background", type: "color", default: "#0b0b0f" },
      { key: "textColor", label: "Text colour", type: "color", default: "#ffffff" },
      { key: "accentColor", label: "Accent", type: "color", default: "#f43f5e" },
      { key: "perTick", label: "Frames per count", type: "duration", default: 30, min: 6, max: 120, step: 1 },
    ],
    code: `
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { counter, pendulum } from '@/lib/motion/primitives';

export default function LaunchCountdown({ params }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { startNumber, bgColor, textColor, accentColor, perTick } = params;
  const c = counter(frame, { from: startNumber, to: 0, start: 0, duration: startNumber * perTick });
  const swing = pendulum(frame, { amplitude: 6, decay: 0.6, start: 0, fps });
  return (
    <AbsoluteFill style={{ backgroundColor: bgColor, justifyContent: 'center', alignItems: 'center', gap: 8 }}>
      <div style={{ color: accentColor, fontSize: 40, fontWeight: 700, letterSpacing: 6 }}>LAUNCHING IN</div>
      <div style={{ color: textColor, fontSize: 260, fontWeight: 900, transform: swing.transform }}>{c.text}</div>
    </AbsoluteFill>
  );
}
`.trim(),
  },
];

/** The full built-in corpus. Import this — never the halves. */
export const SEED_TEMPLATES: TemplateDef[] = [
  ...CORE_TEMPLATES,
  ...EXTENDED_TEMPLATES,
];
