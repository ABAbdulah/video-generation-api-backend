import type { TemplateDef } from "./types";

/**
 * The corpus expansion (spec target: 40–60 templates).
 *
 * Split out of seed.ts purely for readability — `SEED_TEMPLATES` concatenates
 * the two, and both halves obey the same contract:
 *
 *  - imports only react / remotion / @/lib/motion/primitives
 *  - reads EVERY declared param from `params` (validate.ts fails otherwise)
 *  - has a default export component
 *  - code is written with string concatenation, never template literals, so the
 *    whole source can sit inside a backtick string without escaping
 *
 * Why corpus size is the free tier's quality: the Mini tier retrieves the
 * nearest template and slot-fills it. Its ceiling is literally "how close is the
 * closest template", so breadth of *motion vocabulary* matters more than polish
 * on any single entry — hence the spread across every category, and the
 * deliberate variety of primitives used.
 */
export const EXTENDED_TEMPLATES: TemplateDef[] = [
  // ----------------------------------------------------------------- text ---
  {
    slug: "typewriter-reveal",
    title: "Typewriter Reveal",
    prompt: "Text typed out one character at a time with a blinking cursor",
    category: "text",
    durationInFrames: 180,
    fps: 60,
    params: [
      { key: "text", label: "Text", type: "text", default: "Built for motion." },
      { key: "textColor", label: "Text colour", type: "color", default: "#f8fafc" },
      { key: "cursorColor", label: "Cursor colour", type: "color", default: "#38bdf8" },
      { key: "bgColor", label: "Background", type: "color", default: "#0b0b0f" },
      { key: "fontSize", label: "Font size", type: "number", default: 72, min: 24, max: 200, step: 2 },
      { key: "typeDuration", label: "Type duration", type: "duration", default: 70, min: 10, max: 300, step: 1 },
    ],
    code: `
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { progress } from '@/lib/motion/primitives';

export default function TypewriterReveal({ params }) {
  const frame = useCurrentFrame();
  const { text, textColor, cursorColor, bgColor, fontSize, typeDuration } = params;
  const full = String(text);
  const p = progress(frame, 0, typeDuration, 'linear');
  const shown = full.slice(0, Math.round(p * full.length));
  const blink = Math.floor(frame / 15) % 2 === 0 ? 1 : 0.15;
  return (
    <AbsoluteFill style={{ backgroundColor: bgColor, justifyContent: 'center', alignItems: 'center', padding: 80 }}>
      <div style={{ color: textColor, fontSize, fontWeight: 700, fontFamily: 'ui-monospace, monospace', textAlign: 'center' }}>
        {shown}
        <span style={{ color: cursorColor, opacity: blink }}>|</span>
      </div>
    </AbsoluteFill>
  );
}
`.trim(),
  },
  {
    slug: "line-by-line-quote",
    title: "Line-by-Line Quote",
    prompt: "A multi-line quote where each line fades up in sequence",
    category: "text",
    durationInFrames: 180,
    fps: 60,
    params: [
      { key: "quote", label: "Quote (| separates lines)", type: "text", default: "Design is not|how it looks.|It is how it works." },
      { key: "attribution", label: "Attribution", type: "text", default: "— Steve Jobs" },
      { key: "textColor", label: "Text colour", type: "color", default: "#f8fafc" },
      { key: "accentColor", label: "Accent", type: "color", default: "#a78bfa" },
      { key: "bgColor", label: "Background", type: "color", default: "#0b0b0f" },
      { key: "perLine", label: "Frames per line", type: "duration", default: 14, min: 2, max: 90, step: 1 },
    ],
    code: `
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { fadeSlide, stagger } from '@/lib/motion/primitives';

export default function LineByLineQuote({ params }) {
  const frame = useCurrentFrame();
  const { quote, attribution, textColor, accentColor, bgColor, perLine } = params;
  const lines = String(quote).split('|');
  const attr = fadeSlide(frame, { axis: 'y', distance: 16, start: stagger(lines.length, { perItem: perLine }), duration: 20 });
  return (
    <AbsoluteFill style={{ backgroundColor: bgColor, justifyContent: 'center', alignItems: 'flex-start', padding: 120, gap: 10 }}>
      {lines.map((line, i) => {
        const f = fadeSlide(frame, { axis: 'y', distance: 28, start: stagger(i, { perItem: perLine }), duration: 22 });
        return (
          <div key={i} style={{ color: textColor, fontSize: 64, fontWeight: 700, lineHeight: 1.2, opacity: f.opacity, transform: f.transform }}>
            {line}
          </div>
        );
      })}
      <div style={{ color: accentColor, fontSize: 32, marginTop: 28, opacity: attr.opacity, transform: attr.transform }}>{attribution}</div>
    </AbsoluteFill>
  );
}
`.trim(),
  },
  {
    slug: "highlight-underline",
    title: "Highlight Underline",
    prompt: "A headline where one word gets a highlight bar swiping under it",
    category: "text",
    durationInFrames: 150,
    fps: 60,
    params: [
      { key: "before", label: "Text before", type: "text", default: "Ship" },
      { key: "highlighted", label: "Highlighted word", type: "text", default: "faster" },
      { key: "after", label: "Text after", type: "text", default: "today" },
      { key: "textColor", label: "Text colour", type: "color", default: "#0b0b0f" },
      { key: "highlightColor", label: "Highlight", type: "color", default: "#fde047" },
      { key: "bgColor", label: "Background", type: "color", default: "#ffffff" },
      { key: "swipeStart", label: "Swipe start", type: "number", default: 18, min: 0, max: 120, step: 1 },
    ],
    code: `
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { fadeSlide, maskWipe } from '@/lib/motion/primitives';

export default function HighlightUnderline({ params }) {
  const frame = useCurrentFrame();
  const { before, highlighted, after, textColor, highlightColor, bgColor, swipeStart } = params;
  const rise = fadeSlide(frame, { axis: 'y', distance: 30, duration: 20 });
  const clipPath = maskWipe(frame, { direction: 'left', start: swipeStart, duration: 22 });
  return (
    <AbsoluteFill style={{ backgroundColor: bgColor, justifyContent: 'center', alignItems: 'center', padding: 80 }}>
      <h1 style={{ color: textColor, fontSize: 96, fontWeight: 800, margin: 0, opacity: rise.opacity, transform: rise.transform }}>
        {before}{' '}
        <span style={{ position: 'relative', display: 'inline-block' }}>
          <span style={{ position: 'absolute', left: -8, right: -8, bottom: 6, height: 26, backgroundColor: highlightColor, clipPath }} />
          <span style={{ position: 'relative' }}>{highlighted}</span>
        </span>{' '}
        {after}
      </h1>
    </AbsoluteFill>
  );
}
`.trim(),
  },
  {
    slug: "number-headline",
    title: "Big Number Headline",
    prompt: "A large statistic counting up above a supporting caption",
    category: "text",
    durationInFrames: 150,
    fps: 60,
    params: [
      { key: "target", label: "Target number", type: "number", default: 87, min: 0, max: 100000, step: 1 },
      { key: "suffix", label: "Suffix", type: "text", default: "%" },
      { key: "caption", label: "Caption", type: "text", default: "faster time to first render" },
      { key: "numberColor", label: "Number colour", type: "color", default: "#22d3ee" },
      { key: "captionColor", label: "Caption colour", type: "color", default: "#94a3b8" },
      { key: "bgColor", label: "Background", type: "color", default: "#0b0b0f" },
      { key: "countDuration", label: "Count duration", type: "duration", default: 55, min: 10, max: 200, step: 1 },
    ],
    code: `
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { counter, fadeSlide } from '@/lib/motion/primitives';

export default function NumberHeadline({ params }) {
  const frame = useCurrentFrame();
  const { target, suffix, caption, numberColor, captionColor, bgColor, countDuration } = params;
  const c = counter(frame, { to: Number(target), duration: countDuration, format: { thousands: true, suffix: String(suffix) } });
  const cap = fadeSlide(frame, { axis: 'y', distance: 20, start: 20, duration: 24 });
  return (
    <AbsoluteFill style={{ backgroundColor: bgColor, justifyContent: 'center', alignItems: 'center', gap: 18 }}>
      <div style={{ color: numberColor, fontSize: 200, fontWeight: 900, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{c.text}</div>
      <div style={{ color: captionColor, fontSize: 34, opacity: cap.opacity, transform: cap.transform }}>{caption}</div>
    </AbsoluteFill>
  );
}
`.trim(),
  },

  // ------------------------------------------------------------- graphics ---
  {
    slug: "orbit-dots",
    title: "Orbiting Dots",
    prompt: "Dots orbiting a central circle at a steady speed",
    category: "graphics",
    durationInFrames: 180,
    fps: 60,
    params: [
      { key: "count", label: "Dot count", type: "number", default: 6, min: 2, max: 16, step: 1 },
      { key: "radius", label: "Orbit radius", type: "number", default: 160, min: 60, max: 320, step: 5 },
      { key: "dotColor", label: "Dot colour", type: "color", default: "#f472b6" },
      { key: "coreColor", label: "Core colour", type: "color", default: "#f8fafc" },
      { key: "bgColor", label: "Background", type: "color", default: "#0b0b0f" },
      { key: "revolutions", label: "Revolutions", type: "number", default: 1, min: 1, max: 6, step: 1 },
    ],
    code: `
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { progress, springIn } from '@/lib/motion/primitives';

export default function OrbitDots({ params }) {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const { count, radius, dotColor, coreColor, bgColor, revolutions } = params;
  const spin = progress(frame, 0, durationInFrames, 'linear') * Number(revolutions) * Math.PI * 2;
  const pop = springIn(frame, { fps, from: 0, to: 1 });
  const dots = Array.from({ length: Number(count) });
  return (
    <AbsoluteFill style={{ backgroundColor: bgColor, justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ position: 'relative', width: 2 * Number(radius), height: 2 * Number(radius), transform: 'scale(' + pop + ')' }}>
        <div style={{ position: 'absolute', left: '50%', top: '50%', width: 72, height: 72, marginLeft: -36, marginTop: -36, borderRadius: 999, backgroundColor: coreColor }} />
        {dots.map((_, i) => {
          const angle = spin + (i / Number(count)) * Math.PI * 2;
          const x = Math.cos(angle) * Number(radius);
          const y = Math.sin(angle) * Number(radius);
          return <div key={i} style={{ position: 'absolute', left: '50%', top: '50%', width: 28, height: 28, marginLeft: -14, marginTop: -14, borderRadius: 999, backgroundColor: dotColor, transform: 'translate(' + x + 'px, ' + y + 'px)' }} />;
        })}
      </div>
    </AbsoluteFill>
  );
}
`.trim(),
  },
  {
    slug: "wave-bars",
    title: "Wave Bars",
    prompt: "An audio-style row of bars rising and falling in a wave",
    category: "graphics",
    durationInFrames: 180,
    fps: 60,
    params: [
      { key: "bars", label: "Bar count", type: "number", default: 12, min: 3, max: 40, step: 1 },
      { key: "barColor", label: "Bar colour", type: "color", default: "#38bdf8" },
      { key: "bgColor", label: "Background", type: "color", default: "#0b0b0f" },
      { key: "maxHeight", label: "Max height", type: "number", default: 260, min: 60, max: 500, step: 10 },
      { key: "speed", label: "Speed", type: "number", default: 3, min: 1, max: 10, step: 1 },
    ],
    code: `
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { springIn } from '@/lib/motion/primitives';

export default function WaveBars({ params }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { bars, barColor, bgColor, maxHeight, speed } = params;
  const entry = springIn(frame, { fps, from: 0, to: 1 });
  const list = Array.from({ length: Number(bars) });
  return (
    <AbsoluteFill style={{ backgroundColor: bgColor, justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: Number(maxHeight) }}>
        {list.map((_, i) => {
          const phase = (frame / fps) * Number(speed) + i * 0.5;
          const amount = (Math.sin(phase) + 1) / 2;
          const h = (0.2 + amount * 0.8) * Number(maxHeight) * entry;
          return <div key={i} style={{ width: 26, height: h, borderRadius: 13, backgroundColor: barColor }} />;
        })}
      </div>
    </AbsoluteFill>
  );
}
`.trim(),
  },
  {
    slug: "ring-progress",
    title: "Ring Progress",
    prompt: "A circular progress ring filling to a percentage with a label",
    category: "graphics",
    durationInFrames: 150,
    fps: 60,
    params: [
      { key: "percent", label: "Percent", type: "number", default: 76, min: 0, max: 100, step: 1 },
      { key: "ringColor", label: "Ring colour", type: "color", default: "#34d399" },
      { key: "trackColor", label: "Track colour", type: "color", default: "#1f2937" },
      { key: "textColor", label: "Text colour", type: "color", default: "#f8fafc" },
      { key: "bgColor", label: "Background", type: "color", default: "#0b0b0f" },
      { key: "fillDuration", label: "Fill duration", type: "duration", default: 50, min: 10, max: 200, step: 1 },
    ],
    code: `
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { counter, pathDraw } from '@/lib/motion/primitives';

export default function RingProgress({ params }) {
  const frame = useCurrentFrame();
  const { percent, ringColor, trackColor, textColor, bgColor, fillDuration } = params;
  const target = Number(percent);
  const draw = pathDraw(frame, { start: 0, duration: fillDuration, pathLength: 100 });
  const c = counter(frame, { to: target, duration: fillDuration, format: { suffix: '%' } });
  return (
    <AbsoluteFill style={{ backgroundColor: bgColor, justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ position: 'relative', width: 420, height: 420 }}>
        <svg width={420} height={420} viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={50} cy={50} r={42} fill="none" stroke={trackColor} strokeWidth={9} />
          <circle cx={50} cy={50} r={42} fill="none" stroke={ringColor} strokeWidth={9} strokeLinecap="round" pathLength={100} strokeDasharray={(target / 100) * 100} strokeDashoffset={draw.strokeDashoffset} />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: textColor, fontSize: 72, fontWeight: 800 }}>
          {c.text}
        </div>
      </div>
    </AbsoluteFill>
  );
}
`.trim(),
  },
  {
    slug: "blob-pulse",
    title: "Blob Pulse",
    prompt: "A soft gradient blob that pulses and breathes behind a label",
    category: "graphics",
    durationInFrames: 180,
    fps: 60,
    params: [
      { key: "label", label: "Label", type: "text", default: "Listening" },
      { key: "fromColor", label: "Gradient start", type: "color", default: "#6366f1" },
      { key: "toColor", label: "Gradient end", type: "color", default: "#ec4899" },
      { key: "textColor", label: "Text colour", type: "color", default: "#ffffff" },
      { key: "bgColor", label: "Background", type: "color", default: "#0b0b0f" },
      { key: "pulseSpeed", label: "Pulse speed", type: "number", default: 2, min: 1, max: 8, step: 1 },
    ],
    code: `
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { springIn } from '@/lib/motion/primitives';

export default function BlobPulse({ params }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { label, fromColor, toColor, textColor, bgColor, pulseSpeed } = params;
  const entry = springIn(frame, { fps, from: 0, to: 1 });
  const breathe = 1 + Math.sin((frame / fps) * Number(pulseSpeed)) * 0.08;
  return (
    <AbsoluteFill style={{ backgroundColor: bgColor, justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ position: 'relative', width: 460, height: 460, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ position: 'absolute', inset: 0, borderRadius: '42% 58% 63% 37% / 41% 44% 56% 59%', backgroundImage: 'linear-gradient(135deg, ' + fromColor + ', ' + toColor + ')', transform: 'scale(' + entry * breathe + ')', filter: 'blur(2px)' }} />
        <span style={{ position: 'relative', color: textColor, fontSize: 56, fontWeight: 800 }}>{label}</span>
      </div>
    </AbsoluteFill>
  );
}
`.trim(),
  },

  // ------------------------------------------------------------- overlays ---
  {
    slug: "subtitle-pop",
    title: "Subtitle Pop",
    prompt: "Caption text that pops in at the bottom of the frame",
    category: "overlays",
    durationInFrames: 120,
    fps: 60,
    params: [
      { key: "caption", label: "Caption", type: "text", default: "This is the part people remember" },
      { key: "textColor", label: "Text colour", type: "color", default: "#ffffff" },
      { key: "boxColor", label: "Box colour", type: "color", default: "#0b0b0f" },
      { key: "fontSize", label: "Font size", type: "number", default: 44, min: 18, max: 120, step: 2 },
      { key: "popDelay", label: "Pop delay", type: "duration", default: 4, min: 0, max: 60, step: 1 },
    ],
    code: `
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { springIn } from '@/lib/motion/primitives';

export default function SubtitlePop({ params }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { caption, textColor, boxColor, fontSize, popDelay } = params;
  const s = springIn(frame, { fps, delay: popDelay, from: 0.7, to: 1, stiffness: 160 });
  const o = springIn(frame, { fps, delay: popDelay, from: 0, to: 1 });
  return (
    <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', padding: 90 }}>
      <div style={{ backgroundColor: boxColor, color: textColor, fontSize, fontWeight: 700, padding: '16px 28px', borderRadius: 12, opacity: o, transform: 'scale(' + s + ')', textAlign: 'center', maxWidth: '80%' }}>
        {caption}
      </div>
    </AbsoluteFill>
  );
}
`.trim(),
  },
  {
    slug: "corner-badge",
    title: "Corner Badge",
    prompt: "A small badge that slides into the top corner and stays",
    category: "overlays",
    durationInFrames: 150,
    fps: 60,
    params: [
      { key: "badgeText", label: "Badge text", type: "text", default: "LIVE" },
      { key: "badgeColor", label: "Badge colour", type: "color", default: "#ef4444" },
      { key: "textColor", label: "Text colour", type: "color", default: "#ffffff" },
      { key: "dotColor", label: "Dot colour", type: "color", default: "#ffffff" },
      { key: "slideDuration", label: "Slide duration", type: "duration", default: 18, min: 4, max: 90, step: 1 },
    ],
    code: `
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { fadeSlide } from '@/lib/motion/primitives';

export default function CornerBadge({ params }) {
  const frame = useCurrentFrame();
  const { badgeText, badgeColor, textColor, dotColor, slideDuration } = params;
  const slide = fadeSlide(frame, { axis: 'x', distance: -60, duration: slideDuration });
  const blink = Math.floor(frame / 20) % 2 === 0 ? 1 : 0.25;
  return (
    <AbsoluteFill style={{ justifyContent: 'flex-start', alignItems: 'flex-end', padding: 60 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, backgroundColor: badgeColor, padding: '12px 22px', borderRadius: 999, opacity: slide.opacity, transform: slide.transform }}>
        <span style={{ width: 14, height: 14, borderRadius: 999, backgroundColor: dotColor, opacity: blink }} />
        <span style={{ color: textColor, fontSize: 30, fontWeight: 800, letterSpacing: 2 }}>{badgeText}</span>
      </div>
    </AbsoluteFill>
  );
}
`.trim(),
  },
  {
    slug: "ticker-tape",
    title: "Ticker Tape",
    prompt: "A news-style ticker scrolling text across the bottom",
    category: "overlays",
    durationInFrames: 180,
    fps: 60,
    params: [
      { key: "items", label: "Items (comma separated)", type: "text", default: "Shipping now, 40% faster renders, New templates weekly" },
      { key: "barColor", label: "Bar colour", type: "color", default: "#111827" },
      { key: "textColor", label: "Text colour", type: "color", default: "#f8fafc" },
      { key: "accentColor", label: "Accent", type: "color", default: "#f59e0b" },
      { key: "scrollSpeed", label: "Scroll speed", type: "number", default: 60, min: 10, max: 300, step: 5 },
    ],
    code: `
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { fadeSlide } from '@/lib/motion/primitives';

export default function TickerTape({ params }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { items, barColor, textColor, accentColor, scrollSpeed } = params;
  const list = String(items).split(',');
  const offset = -((frame / fps) * Number(scrollSpeed));
  const bar = fadeSlide(frame, { axis: 'y', distance: 40, duration: 16 });
  return (
    <AbsoluteFill style={{ justifyContent: 'flex-end' }}>
      <div style={{ backgroundColor: barColor, padding: '18px 0', overflow: 'hidden', opacity: bar.opacity, transform: bar.transform }}>
        <div style={{ display: 'flex', gap: 60, whiteSpace: 'nowrap', transform: 'translateX(' + offset + 'px)' }}>
          {list.concat(list).map((item, i) => (
            <span key={i} style={{ color: textColor, fontSize: 34, fontWeight: 600 }}>
              <span style={{ color: accentColor, marginRight: 16 }}>•</span>
              {String(item).trim()}
            </span>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
}
`.trim(),
  },

  // ---------------------------------------------------------------- logos ---
  {
    slug: "logo-draw",
    title: "Logo Draw",
    prompt: "A monogram outline drawn stroke by stroke then filled",
    category: "logos",
    durationInFrames: 180,
    fps: 60,
    params: [
      { key: "monogram", label: "Monogram path", type: "text", default: "M20 80 L50 20 L80 80" },
      { key: "strokeColor", label: "Stroke colour", type: "color", default: "#f8fafc" },
      { key: "wordmark", label: "Wordmark", type: "text", default: "APEX" },
      { key: "bgColor", label: "Background", type: "color", default: "#0b0b0f" },
      { key: "drawDuration", label: "Draw duration", type: "duration", default: 50, min: 10, max: 200, step: 1 },
      { key: "strokeWidthPx", label: "Stroke width", type: "number", default: 6, min: 1, max: 20, step: 1 },
    ],
    code: `
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { fadeSlide, pathDraw } from '@/lib/motion/primitives';

export default function LogoDraw({ params }) {
  const frame = useCurrentFrame();
  const { monogram, strokeColor, wordmark, bgColor, drawDuration, strokeWidthPx } = params;
  const draw = pathDraw(frame, { start: 0, duration: drawDuration, pathLength: 100 });
  const word = fadeSlide(frame, { axis: 'y', distance: 20, start: drawDuration, duration: 24 });
  return (
    <AbsoluteFill style={{ backgroundColor: bgColor, justifyContent: 'center', alignItems: 'center', gap: 20 }}>
      <svg width={280} height={280} viewBox="0 0 100 100">
        <path d={monogram} fill="none" stroke={strokeColor} strokeWidth={strokeWidthPx} strokeLinecap="round" strokeLinejoin="round" pathLength={100} strokeDasharray={draw.strokeDasharray} strokeDashoffset={draw.strokeDashoffset} />
      </svg>
      <span style={{ color: strokeColor, fontSize: 56, fontWeight: 900, letterSpacing: 10, opacity: word.opacity, transform: word.transform }}>{wordmark}</span>
    </AbsoluteFill>
  );
}
`.trim(),
  },
  {
    slug: "logo-stack-build",
    title: "Logo Stack Build",
    prompt: "Stacked blocks that spring together to build a logo mark",
    category: "logos",
    durationInFrames: 150,
    fps: 60,
    params: [
      { key: "blocks", label: "Block count", type: "number", default: 4, min: 2, max: 8, step: 1 },
      { key: "blockColor", label: "Block colour", type: "color", default: "#6366f1" },
      { key: "accentColor", label: "Accent block", type: "color", default: "#f43f5e" },
      { key: "wordmark", label: "Wordmark", type: "text", default: "STACK" },
      { key: "textColor", label: "Text colour", type: "color", default: "#f8fafc" },
      { key: "bgColor", label: "Background", type: "color", default: "#0b0b0f" },
      { key: "perBlock", label: "Frames per block", type: "duration", default: 6, min: 1, max: 40, step: 1 },
    ],
    code: `
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { fadeSlide, springIn, stagger } from '@/lib/motion/primitives';

export default function LogoStackBuild({ params }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { blocks, blockColor, accentColor, wordmark, textColor, bgColor, perBlock } = params;
  const list = Array.from({ length: Number(blocks) });
  const word = fadeSlide(frame, { axis: 'y', distance: 18, start: stagger(Number(blocks), { perItem: perBlock }), duration: 22 });
  return (
    <AbsoluteFill style={{ backgroundColor: bgColor, justifyContent: 'center', alignItems: 'center', gap: 28 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {list.map((_, i) => {
          const s = springIn(frame, { fps, delay: stagger(i, { perItem: perBlock }), from: 0, to: 1 });
          const width = 260 - i * 30;
          return <div key={i} style={{ width, height: 40, borderRadius: 8, backgroundColor: i === 0 ? accentColor : blockColor, transform: 'scaleX(' + s + ')', transformOrigin: 'left center' }} />;
        })}
      </div>
      <span style={{ color: textColor, fontSize: 48, fontWeight: 900, letterSpacing: 8, opacity: word.opacity, transform: word.transform }}>{wordmark}</span>
    </AbsoluteFill>
  );
}
`.trim(),
  },
  {
    slug: "logo-mask-reveal",
    title: "Logo Mask Reveal",
    prompt: "A wordmark revealed by a vertical wipe over a coloured panel",
    category: "logos",
    durationInFrames: 150,
    fps: 60,
    params: [
      { key: "wordmark", label: "Wordmark", type: "text", default: "HORIZON" },
      { key: "panelColor", label: "Panel colour", type: "color", default: "#0ea5e9" },
      { key: "textColor", label: "Text colour", type: "color", default: "#ffffff" },
      { key: "bgColor", label: "Background", type: "color", default: "#0b0b0f" },
      { key: "wipeDuration", label: "Wipe duration", type: "duration", default: 28, min: 6, max: 120, step: 1 },
    ],
    code: `
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { maskWipe } from '@/lib/motion/primitives';

export default function LogoMaskReveal({ params }) {
  const frame = useCurrentFrame();
  const { wordmark, panelColor, textColor, bgColor, wipeDuration } = params;
  const panelClip = maskWipe(frame, { direction: 'up', start: 0, duration: wipeDuration });
  const textClip = maskWipe(frame, { direction: 'left', start: Math.round(Number(wipeDuration) * 0.6), duration: wipeDuration });
  return (
    <AbsoluteFill style={{ backgroundColor: bgColor, justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ position: 'relative', padding: '60px 90px' }}>
        <div style={{ position: 'absolute', inset: 0, backgroundColor: panelColor, borderRadius: 16, clipPath: panelClip }} />
        <span style={{ position: 'relative', color: textColor, fontSize: 88, fontWeight: 900, letterSpacing: 6, clipPath: textClip }}>{wordmark}</span>
      </div>
    </AbsoluteFill>
  );
}
`.trim(),
  },

  // --------------------------------------------------------------- social ---
  {
    slug: "follow-prompt",
    title: "Follow Prompt",
    prompt: "A profile row with a follow button that pops and pulses",
    category: "social",
    durationInFrames: 150,
    fps: 60,
    params: [
      { key: "handle", label: "Handle", type: "text", default: "@genvideo" },
      { key: "subtitle", label: "Subtitle", type: "text", default: "Motion, generated as code" },
      { key: "buttonText", label: "Button text", type: "text", default: "Follow" },
      { key: "accentColor", label: "Accent", type: "color", default: "#3b82f6" },
      { key: "textColor", label: "Text colour", type: "color", default: "#f8fafc" },
      { key: "bgColor", label: "Background", type: "color", default: "#0b0b0f" },
    ],
    code: `
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { fadeSlide, springIn } from '@/lib/motion/primitives';

export default function FollowPrompt({ params }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { handle, subtitle, buttonText, accentColor, textColor, bgColor } = params;
  const row = fadeSlide(frame, { axis: 'x', distance: 50, duration: 22 });
  const btn = springIn(frame, { fps, delay: 20, from: 0, to: 1, stiffness: 180 });
  const pulse = 1 + Math.sin((frame / fps) * 4) * 0.03;
  return (
    <AbsoluteFill style={{ backgroundColor: bgColor, justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 28, opacity: row.opacity, transform: row.transform }}>
        <div style={{ width: 110, height: 110, borderRadius: 999, backgroundColor: accentColor }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ color: textColor, fontSize: 46, fontWeight: 800 }}>{handle}</span>
          <span style={{ color: textColor, fontSize: 26, opacity: 0.6 }}>{subtitle}</span>
        </div>
        <div style={{ backgroundColor: accentColor, color: '#ffffff', fontSize: 30, fontWeight: 800, padding: '16px 34px', borderRadius: 999, transform: 'scale(' + btn * pulse + ')' }}>{buttonText}</div>
      </div>
    </AbsoluteFill>
  );
}
`.trim(),
  },
  {
    slug: "comment-bubble",
    title: "Comment Bubbles",
    prompt: "Chat comments stacking up one after another",
    category: "social",
    durationInFrames: 180,
    fps: 60,
    params: [
      { key: "comments", label: "Comments (| separated)", type: "text", default: "this is unreal|how is it this fast|wait, it's code?" },
      { key: "bubbleColor", label: "Bubble colour", type: "color", default: "#1f2937" },
      { key: "textColor", label: "Text colour", type: "color", default: "#f8fafc" },
      { key: "bgColor", label: "Background", type: "color", default: "#0b0b0f" },
      { key: "perComment", label: "Frames per comment", type: "duration", default: 22, min: 4, max: 90, step: 1 },
    ],
    code: `
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { springIn, stagger } from '@/lib/motion/primitives';

export default function CommentBubble({ params }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { comments, bubbleColor, textColor, bgColor, perComment } = params;
  const list = String(comments).split('|');
  return (
    <AbsoluteFill style={{ backgroundColor: bgColor, justifyContent: 'flex-end', alignItems: 'flex-start', padding: 80, gap: 18 }}>
      {list.map((c, i) => {
        const s = springIn(frame, { fps, delay: stagger(i, { perItem: perComment }), from: 0, to: 1 });
        return (
          <div key={i} style={{ backgroundColor: bubbleColor, color: textColor, fontSize: 34, padding: '18px 28px', borderRadius: 22, opacity: s, transform: 'translateY(' + (1 - s) * 30 + 'px) scale(' + (0.9 + s * 0.1) + ')' }}>
            {String(c).trim()}
          </div>
        );
      })}
    </AbsoluteFill>
  );
}
`.trim(),
  },
  {
    slug: "swipe-up-arrow",
    title: "Swipe Up Arrow",
    prompt: "An arrow bouncing upward with a swipe-up call to action",
    category: "social",
    durationInFrames: 150,
    fps: 60,
    params: [
      { key: "ctaText", label: "CTA text", type: "text", default: "Swipe up" },
      { key: "arrowColor", label: "Arrow colour", type: "color", default: "#fde047" },
      { key: "textColor", label: "Text colour", type: "color", default: "#ffffff" },
      { key: "bgColor", label: "Background", type: "color", default: "#111827" },
      { key: "bounceSpeed", label: "Bounce speed", type: "number", default: 3, min: 1, max: 10, step: 1 },
    ],
    code: `
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { fadeSlide } from '@/lib/motion/primitives';

export default function SwipeUpArrow({ params }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { ctaText, arrowColor, textColor, bgColor, bounceSpeed } = params;
  const bob = Math.sin((frame / fps) * Number(bounceSpeed) * Math.PI) * 22;
  const label = fadeSlide(frame, { axis: 'y', distance: 24, duration: 20 });
  return (
    <AbsoluteFill style={{ backgroundColor: bgColor, justifyContent: 'center', alignItems: 'center', gap: 30 }}>
      <svg width={160} height={160} viewBox="0 0 100 100" style={{ transform: 'translateY(' + bob + 'px)' }}>
        <path d="M50 20 L80 55 L62 55 L62 84 L38 84 L38 55 L20 55 Z" fill={arrowColor} />
      </svg>
      <span style={{ color: textColor, fontSize: 52, fontWeight: 800, opacity: label.opacity, transform: label.transform }}>{ctaText}</span>
    </AbsoluteFill>
  );
}
`.trim(),
  },
  {
    slug: "profile-stat-row",
    title: "Profile Stat Row",
    prompt: "Follower, likes and views counters ticking up side by side",
    category: "social",
    durationInFrames: 150,
    fps: 60,
    params: [
      { key: "labels", label: "Labels (comma separated)", type: "text", default: "Followers, Likes, Views" },
      { key: "values", label: "Values (comma separated)", type: "text", default: "12400, 89200, 1200000" },
      { key: "valueColor", label: "Value colour", type: "color", default: "#f8fafc" },
      { key: "labelColor", label: "Label colour", type: "color", default: "#94a3b8" },
      { key: "bgColor", label: "Background", type: "color", default: "#0b0b0f" },
      { key: "countDuration", label: "Count duration", type: "duration", default: 60, min: 10, max: 200, step: 1 },
    ],
    code: `
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { counter, fadeSlide, stagger } from '@/lib/motion/primitives';

export default function ProfileStatRow({ params }) {
  const frame = useCurrentFrame();
  const { labels, values, valueColor, labelColor, bgColor, countDuration } = params;
  const names = String(labels).split(',');
  const nums = String(values).split(',').map(function (v) { return Number(String(v).trim()) || 0; });
  return (
    <AbsoluteFill style={{ backgroundColor: bgColor, justifyContent: 'center', alignItems: 'center', flexDirection: 'row', gap: 90 }}>
      {names.map((name, i) => {
        const start = stagger(i, { perItem: 6 });
        const c = counter(frame, { to: nums[i] || 0, start, duration: countDuration, format: { thousands: true } });
        const f = fadeSlide(frame, { axis: 'y', distance: 20, start, duration: 22 });
        return (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, opacity: f.opacity, transform: f.transform }}>
            <span style={{ color: valueColor, fontSize: 76, fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>{c.text}</span>
            <span style={{ color: labelColor, fontSize: 28 }}>{String(name).trim()}</span>
          </div>
        );
      })}
    </AbsoluteFill>
  );
}
`.trim(),
  },

  // ---------------------------------------------------------- charts-data ---
  {
    slug: "line-chart-draw",
    title: "Line Chart Draw",
    prompt: "A line chart whose trend line draws itself left to right",
    category: "charts-data",
    durationInFrames: 180,
    fps: 60,
    params: [
      { key: "values", label: "Values (comma separated)", type: "text", default: "12, 28, 22, 46, 38, 64, 82" },
      { key: "lineColor", label: "Line colour", type: "color", default: "#22d3ee" },
      { key: "gridColor", label: "Grid colour", type: "color", default: "#1f2937" },
      { key: "bgColor", label: "Background", type: "color", default: "#0b0b0f" },
      { key: "drawDuration", label: "Draw duration", type: "duration", default: 60, min: 10, max: 240, step: 1 },
      { key: "strokeWidthPx", label: "Stroke width", type: "number", default: 3, min: 1, max: 12, step: 1 },
    ],
    code: `
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { pathDraw } from '@/lib/motion/primitives';

export default function LineChartDraw({ params }) {
  const frame = useCurrentFrame();
  const { values, lineColor, gridColor, bgColor, drawDuration, strokeWidthPx } = params;
  const nums = String(values).split(',').map(function (v) { return Number(String(v).trim()) || 0; });
  const max = Math.max.apply(null, nums.concat([1]));
  const step = nums.length > 1 ? 100 / (nums.length - 1) : 100;
  let d = '';
  for (let i = 0; i < nums.length; i++) {
    const x = i * step;
    const y = 100 - (nums[i] / max) * 90;
    d = d + (i === 0 ? 'M' : ' L') + x.toFixed(2) + ' ' + y.toFixed(2);
  }
  const draw = pathDraw(frame, { start: 0, duration: drawDuration, pathLength: 100 });
  const rows = [25, 50, 75];
  return (
    <AbsoluteFill style={{ backgroundColor: bgColor, justifyContent: 'center', alignItems: 'center' }}>
      <svg width={900} height={500} viewBox="0 0 100 100" preserveAspectRatio="none">
        {rows.map((y, i) => (
          <line key={i} x1={0} y1={y} x2={100} y2={y} stroke={gridColor} strokeWidth={0.4} />
        ))}
        <path d={d} fill="none" stroke={lineColor} strokeWidth={strokeWidthPx / 3} strokeLinecap="round" strokeLinejoin="round" pathLength={100} strokeDasharray={draw.strokeDasharray} strokeDashoffset={draw.strokeDashoffset} vectorEffect="non-scaling-stroke" />
      </svg>
    </AbsoluteFill>
  );
}
`.trim(),
  },
  {
    slug: "donut-chart",
    title: "Donut Chart",
    prompt: "A donut chart whose segments sweep in around the circle",
    category: "charts-data",
    durationInFrames: 180,
    fps: 60,
    params: [
      { key: "values", label: "Values (comma separated)", type: "text", default: "45, 30, 25" },
      { key: "colors", label: "Colours (comma separated)", type: "text", default: "#6366f1, #22d3ee, #f43f5e" },
      { key: "trackColor", label: "Track colour", type: "color", default: "#1f2937" },
      { key: "bgColor", label: "Background", type: "color", default: "#0b0b0f" },
      { key: "sweepDuration", label: "Sweep duration", type: "duration", default: 60, min: 10, max: 240, step: 1 },
    ],
    code: `
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { progress } from '@/lib/motion/primitives';

export default function DonutChart({ params }) {
  const frame = useCurrentFrame();
  const { values, colors, trackColor, bgColor, sweepDuration } = params;
  const nums = String(values).split(',').map(function (v) { return Number(String(v).trim()) || 0; });
  const palette = String(colors).split(',').map(function (c) { return String(c).trim(); });
  const total = nums.reduce(function (a, b) { return a + b; }, 0) || 1;
  const p = progress(frame, 0, sweepDuration);
  let acc = 0;
  const segments = nums.map(function (n, i) {
    const share = (n / total) * 100;
    const seg = { color: palette[i % palette.length], length: share * p, offset: acc };
    acc = acc + share;
    return seg;
  });
  return (
    <AbsoluteFill style={{ backgroundColor: bgColor, justifyContent: 'center', alignItems: 'center' }}>
      <svg width={460} height={460} viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={50} cy={50} r={40} fill="none" stroke={trackColor} strokeWidth={14} />
        {segments.map((s, i) => (
          <circle key={i} cx={50} cy={50} r={40} fill="none" stroke={s.color} strokeWidth={14} pathLength={100} strokeDasharray={s.length + ' ' + (100 - s.length)} strokeDashoffset={-s.offset} />
        ))}
      </svg>
    </AbsoluteFill>
  );
}
`.trim(),
  },
  {
    slug: "progress-bar-list",
    title: "Progress Bar List",
    prompt: "A list of labelled horizontal bars filling to their percentages",
    category: "charts-data",
    durationInFrames: 180,
    fps: 60,
    params: [
      { key: "labels", label: "Labels (comma separated)", type: "text", default: "Design, Engineering, Marketing, Support" },
      { key: "values", label: "Percentages (comma separated)", type: "text", default: "82, 64, 47, 91" },
      { key: "barColor", label: "Bar colour", type: "color", default: "#a78bfa" },
      { key: "trackColor", label: "Track colour", type: "color", default: "#1f2937" },
      { key: "textColor", label: "Text colour", type: "color", default: "#f8fafc" },
      { key: "bgColor", label: "Background", type: "color", default: "#0b0b0f" },
      { key: "fillDuration", label: "Fill duration", type: "duration", default: 45, min: 10, max: 200, step: 1 },
    ],
    code: `
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { counter, progress, stagger } from '@/lib/motion/primitives';

export default function ProgressBarList({ params }) {
  const frame = useCurrentFrame();
  const { labels, values, barColor, trackColor, textColor, bgColor, fillDuration } = params;
  const names = String(labels).split(',');
  const nums = String(values).split(',').map(function (v) { return Number(String(v).trim()) || 0; });
  return (
    <AbsoluteFill style={{ backgroundColor: bgColor, justifyContent: 'center', padding: 120, gap: 26 }}>
      {names.map((name, i) => {
        const start = stagger(i, { perItem: 8 });
        const pct = nums[i] || 0;
        const p = progress(frame, start, fillDuration);
        const c = counter(frame, { to: pct, start, duration: fillDuration, format: { suffix: '%' } });
        return (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: textColor, fontSize: 30, fontWeight: 600 }}>
              <span>{String(name).trim()}</span>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{c.text}</span>
            </div>
            <div style={{ height: 22, borderRadius: 11, backgroundColor: trackColor, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: (pct * p) + '%', borderRadius: 11, backgroundColor: barColor }} />
            </div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
}
`.trim(),
  },
  {
    slug: "stat-grid",
    title: "Stat Grid",
    prompt: "A grid of metric tiles that pop in and count up",
    category: "charts-data",
    durationInFrames: 180,
    fps: 60,
    params: [
      { key: "labels", label: "Labels (comma separated)", type: "text", default: "Uptime, Requests, Latency, Regions" },
      { key: "values", label: "Values (comma separated)", type: "text", default: "99, 480, 42, 12" },
      { key: "tileColor", label: "Tile colour", type: "color", default: "#111827" },
      { key: "valueColor", label: "Value colour", type: "color", default: "#34d399" },
      { key: "labelColor", label: "Label colour", type: "color", default: "#94a3b8" },
      { key: "bgColor", label: "Background", type: "color", default: "#0b0b0f" },
      { key: "perTile", label: "Frames per tile", type: "duration", default: 7, min: 1, max: 40, step: 1 },
    ],
    code: `
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { counter, springIn, stagger } from '@/lib/motion/primitives';

export default function StatGrid({ params }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { labels, values, tileColor, valueColor, labelColor, bgColor, perTile } = params;
  const names = String(labels).split(',');
  const nums = String(values).split(',').map(function (v) { return Number(String(v).trim()) || 0; });
  return (
    <AbsoluteFill style={{ backgroundColor: bgColor, justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 28 }}>
        {names.map((name, i) => {
          const delay = stagger(i, { perItem: perTile });
          const s = springIn(frame, { fps, delay, from: 0, to: 1 });
          const c = counter(frame, { to: nums[i] || 0, start: delay, duration: 45, format: { thousands: true } });
          return (
            <div key={i} style={{ backgroundColor: tileColor, borderRadius: 18, padding: '34px 56px', minWidth: 300, transform: 'scale(' + s + ')' }}>
              <div style={{ color: valueColor, fontSize: 76, fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>{c.text}</div>
              <div style={{ color: labelColor, fontSize: 26, marginTop: 4 }}>{String(name).trim()}</div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}
`.trim(),
  },

  // ---------------------------------------------------------------- money ---
  {
    slug: "revenue-counter",
    title: "Revenue Counter",
    prompt: "A currency figure counting up with a growth badge",
    category: "money",
    durationInFrames: 180,
    fps: 60,
    params: [
      { key: "amount", label: "Amount", type: "number", default: 128400, min: 0, max: 100000000, step: 100 },
      { key: "currency", label: "Currency symbol", type: "text", default: "$" },
      { key: "caption", label: "Caption", type: "text", default: "Annual recurring revenue" },
      { key: "growth", label: "Growth badge", type: "text", default: "+34% YoY" },
      { key: "amountColor", label: "Amount colour", type: "color", default: "#f8fafc" },
      { key: "badgeColor", label: "Badge colour", type: "color", default: "#34d399" },
      { key: "bgColor", label: "Background", type: "color", default: "#0b0b0f" },
      { key: "countDuration", label: "Count duration", type: "duration", default: 70, min: 10, max: 240, step: 1 },
    ],
    code: `
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { counter, springIn } from '@/lib/motion/primitives';

export default function RevenueCounter({ params }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { amount, currency, caption, growth, amountColor, badgeColor, bgColor, countDuration } = params;
  const c = counter(frame, { to: Number(amount), duration: countDuration, format: { thousands: true, prefix: String(currency) } });
  const badge = springIn(frame, { fps, delay: countDuration, from: 0, to: 1, stiffness: 200 });
  return (
    <AbsoluteFill style={{ backgroundColor: bgColor, justifyContent: 'center', alignItems: 'center', gap: 20 }}>
      <div style={{ color: amountColor, fontSize: 150, fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>{c.text}</div>
      <div style={{ color: amountColor, fontSize: 32, opacity: 0.6 }}>{caption}</div>
      <div style={{ backgroundColor: badgeColor, color: '#06281c', fontSize: 30, fontWeight: 800, padding: '12px 26px', borderRadius: 999, transform: 'scale(' + badge + ')' }}>{growth}</div>
    </AbsoluteFill>
  );
}
`.trim(),
  },
  {
    slug: "pricing-card",
    title: "Pricing Card",
    prompt: "A pricing card that springs in with features listing one by one",
    category: "money",
    durationInFrames: 180,
    fps: 60,
    params: [
      { key: "planName", label: "Plan name", type: "text", default: "Pro" },
      { key: "price", label: "Price", type: "text", default: "$29" },
      { key: "period", label: "Period", type: "text", default: "/month" },
      { key: "features", label: "Features (| separated)", type: "text", default: "Unlimited renders|4K exports|Priority queue" },
      { key: "cardColor", label: "Card colour", type: "color", default: "#111827" },
      { key: "accentColor", label: "Accent", type: "color", default: "#6366f1" },
      { key: "textColor", label: "Text colour", type: "color", default: "#f8fafc" },
      { key: "bgColor", label: "Background", type: "color", default: "#0b0b0f" },
    ],
    code: `
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { fadeSlide, springIn, stagger } from '@/lib/motion/primitives';

export default function PricingCard({ params }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { planName, price, period, features, cardColor, accentColor, textColor, bgColor } = params;
  const list = String(features).split('|');
  const card = springIn(frame, { fps, from: 0, to: 1 });
  return (
    <AbsoluteFill style={{ backgroundColor: bgColor, justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ backgroundColor: cardColor, borderRadius: 24, padding: 56, minWidth: 460, borderTop: '6px solid ' + accentColor, transform: 'scale(' + card + ')' }}>
        <div style={{ color: accentColor, fontSize: 32, fontWeight: 800, letterSpacing: 2 }}>{planName}</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 12 }}>
          <span style={{ color: textColor, fontSize: 96, fontWeight: 900 }}>{price}</span>
          <span style={{ color: textColor, fontSize: 30, opacity: 0.5 }}>{period}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 34 }}>
          {list.map((f, i) => {
            const item = fadeSlide(frame, { axis: 'x', distance: 24, start: stagger(i, { perItem: 8, delay: 18 }), duration: 20 });
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, color: textColor, fontSize: 28, opacity: item.opacity, transform: item.transform }}>
                <span style={{ width: 12, height: 12, borderRadius: 999, backgroundColor: accentColor }} />
                {String(f).trim()}
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
}
`.trim(),
  },
  {
    slug: "coin-drop",
    title: "Coin Drop",
    prompt: "Coins dropping into a stack with a total counting up",
    category: "money",
    durationInFrames: 180,
    fps: 60,
    params: [
      { key: "coins", label: "Coin count", type: "number", default: 6, min: 2, max: 14, step: 1 },
      { key: "total", label: "Total", type: "number", default: 2450, min: 0, max: 1000000, step: 10 },
      { key: "coinColor", label: "Coin colour", type: "color", default: "#fbbf24" },
      { key: "textColor", label: "Text colour", type: "color", default: "#f8fafc" },
      { key: "bgColor", label: "Background", type: "color", default: "#0b0b0f" },
      { key: "perCoin", label: "Frames per coin", type: "duration", default: 9, min: 1, max: 40, step: 1 },
    ],
    code: `
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { counter, springIn, stagger } from '@/lib/motion/primitives';

export default function CoinDrop({ params }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { coins, total, coinColor, textColor, bgColor, perCoin } = params;
  const list = Array.from({ length: Number(coins) });
  const c = counter(frame, { to: Number(total), duration: Number(perCoin) * Number(coins), format: { thousands: true, prefix: '$' } });
  return (
    <AbsoluteFill style={{ backgroundColor: bgColor, justifyContent: 'center', alignItems: 'center', gap: 40 }}>
      <div style={{ display: 'flex', flexDirection: 'column-reverse', alignItems: 'center' }}>
        {list.map((_, i) => {
          const delay = stagger(i, { perItem: perCoin });
          const s = springIn(frame, { fps, delay, from: 0, to: 1, damping: 9 });
          return <div key={i} style={{ width: 130, height: 26, borderRadius: 999, backgroundColor: coinColor, marginTop: -6, opacity: s, transform: 'translateY(' + (1 - s) * -140 + 'px)' }} />;
        })}
      </div>
      <div style={{ color: textColor, fontSize: 84, fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>{c.text}</div>
    </AbsoluteFill>
  );
}
`.trim(),
  },

  // ---------------------------------------------------------- app-website ---
  {
    slug: "phone-mockup-scroll",
    title: "Phone Mockup Scroll",
    prompt: "A phone frame with the screen content scrolling upward",
    category: "app-website",
    durationInFrames: 180,
    fps: 60,
    params: [
      { key: "screenColor", label: "Screen colour", type: "color", default: "#111827" },
      { key: "frameColor", label: "Frame colour", type: "color", default: "#f8fafc" },
      { key: "cardColor", label: "Card colour", type: "color", default: "#334155" },
      { key: "accentColor", label: "Accent", type: "color", default: "#38bdf8" },
      { key: "bgColor", label: "Background", type: "color", default: "#0b0b0f" },
      { key: "scrollSpeed", label: "Scroll speed", type: "number", default: 90, min: 10, max: 400, step: 10 },
    ],
    code: `
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { springIn } from '@/lib/motion/primitives';

export default function PhoneMockupScroll({ params }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { screenColor, frameColor, cardColor, accentColor, bgColor, scrollSpeed } = params;
  const enter = springIn(frame, { fps, from: 0, to: 1 });
  const offset = -((frame / fps) * Number(scrollSpeed)) % 400;
  const cards = Array.from({ length: 8 });
  return (
    <AbsoluteFill style={{ backgroundColor: bgColor, justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ width: 340, height: 680, borderRadius: 48, backgroundColor: frameColor, padding: 12, transform: 'scale(' + enter + ')' }}>
        <div style={{ width: '100%', height: '100%', borderRadius: 38, backgroundColor: screenColor, overflow: 'hidden', position: 'relative' }}>
          <div style={{ position: 'absolute', left: 0, right: 0, top: 0, display: 'flex', flexDirection: 'column', gap: 16, padding: 20, transform: 'translateY(' + offset + 'px)' }}>
            {cards.map((_, i) => (
              <div key={i} style={{ height: 84, borderRadius: 14, backgroundColor: i % 3 === 0 ? accentColor : cardColor }} />
            ))}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
}
`.trim(),
  },
  {
    slug: "notification-stack",
    title: "Notification Stack",
    prompt: "App notifications sliding in and stacking at the top",
    category: "app-website",
    durationInFrames: 180,
    fps: 60,
    params: [
      { key: "messages", label: "Messages (| separated)", type: "text", default: "New signup from Berlin|Payment received — $49|Render finished in 8s" },
      { key: "cardColor", label: "Card colour", type: "color", default: "#f8fafc" },
      { key: "textColor", label: "Text colour", type: "color", default: "#0b0b0f" },
      { key: "accentColor", label: "Accent", type: "color", default: "#6366f1" },
      { key: "bgColor", label: "Background", type: "color", default: "#1e1b4b" },
      { key: "perMessage", label: "Frames per message", type: "duration", default: 24, min: 4, max: 90, step: 1 },
    ],
    code: `
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { fadeSlide, stagger } from '@/lib/motion/primitives';

export default function NotificationStack({ params }) {
  const frame = useCurrentFrame();
  const { messages, cardColor, textColor, accentColor, bgColor, perMessage } = params;
  const list = String(messages).split('|');
  return (
    <AbsoluteFill style={{ backgroundColor: bgColor, justifyContent: 'flex-start', alignItems: 'center', padding: 70, gap: 18 }}>
      {list.map((m, i) => {
        const f = fadeSlide(frame, { axis: 'y', distance: -50, start: stagger(i, { perItem: perMessage }), duration: 22 });
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 18, backgroundColor: cardColor, borderRadius: 18, padding: '22px 30px', minWidth: 620, opacity: f.opacity, transform: f.transform }}>
            <span style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: accentColor }} />
            <span style={{ color: textColor, fontSize: 30, fontWeight: 600 }}>{String(m).trim()}</span>
          </div>
        );
      })}
    </AbsoluteFill>
  );
}
`.trim(),
  },
  {
    slug: "feature-grid-reveal",
    title: "Feature Grid Reveal",
    prompt: "A grid of feature tiles revealing in sequence with icons",
    category: "app-website",
    durationInFrames: 180,
    fps: 60,
    params: [
      { key: "features", label: "Features (| separated)", type: "text", default: "Fast|Editable|Exportable|Versioned|Branded|Cheap" },
      { key: "tileColor", label: "Tile colour", type: "color", default: "#111827" },
      { key: "iconColor", label: "Icon colour", type: "color", default: "#22d3ee" },
      { key: "textColor", label: "Text colour", type: "color", default: "#f8fafc" },
      { key: "bgColor", label: "Background", type: "color", default: "#0b0b0f" },
      { key: "perTile", label: "Frames per tile", type: "duration", default: 6, min: 1, max: 40, step: 1 },
    ],
    code: `
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { springIn, stagger } from '@/lib/motion/primitives';

export default function FeatureGridReveal({ params }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { features, tileColor, iconColor, textColor, bgColor, perTile } = params;
  const list = String(features).split('|');
  return (
    <AbsoluteFill style={{ backgroundColor: bgColor, justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}>
        {list.map((f, i) => {
          const s = springIn(frame, { fps, delay: stagger(i, { perItem: perTile }), from: 0, to: 1 });
          return (
            <div key={i} style={{ backgroundColor: tileColor, borderRadius: 18, padding: 34, width: 260, display: 'flex', flexDirection: 'column', gap: 16, opacity: s, transform: 'scale(' + (0.85 + s * 0.15) + ')' }}>
              <span style={{ width: 46, height: 46, borderRadius: 12, backgroundColor: iconColor }} />
              <span style={{ color: textColor, fontSize: 30, fontWeight: 700 }}>{String(f).trim()}</span>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}
`.trim(),
  },

  // ---------------------------------------------------------- ui-elements ---
  {
    slug: "toggle-switch",
    title: "Toggle Switch",
    prompt: "A settings toggle flipping from off to on",
    category: "ui-elements",
    durationInFrames: 120,
    fps: 60,
    params: [
      { key: "label", label: "Label", type: "text", default: "Auto-render" },
      { key: "offColor", label: "Off colour", type: "color", default: "#374151" },
      { key: "onColor", label: "On colour", type: "color", default: "#34d399" },
      { key: "knobColor", label: "Knob colour", type: "color", default: "#ffffff" },
      { key: "textColor", label: "Text colour", type: "color", default: "#f8fafc" },
      { key: "bgColor", label: "Background", type: "color", default: "#0b0b0f" },
      { key: "flipStart", label: "Flip start", type: "number", default: 24, min: 0, max: 100, step: 1 },
    ],
    code: `
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { springIn } from '@/lib/motion/primitives';

export default function ToggleSwitch({ params }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { label, offColor, onColor, knobColor, textColor, bgColor, flipStart } = params;
  const t = springIn(frame, { fps, delay: flipStart, from: 0, to: 1, stiffness: 200, damping: 16 });
  const travel = 90 * t;
  return (
    <AbsoluteFill style={{ backgroundColor: bgColor, justifyContent: 'center', alignItems: 'center', gap: 36 }}>
      <span style={{ color: textColor, fontSize: 44, fontWeight: 700 }}>{label}</span>
      <div style={{ position: 'relative', width: 200, height: 104, borderRadius: 999, backgroundColor: t > 0.5 ? onColor : offColor }}>
        <div style={{ position: 'absolute', top: 10, left: 10, width: 84, height: 84, borderRadius: 999, backgroundColor: knobColor, transform: 'translateX(' + travel + 'px)' }} />
      </div>
    </AbsoluteFill>
  );
}
`.trim(),
  },
  {
    slug: "loading-spinner",
    title: "Loading to Done",
    prompt: "A loading spinner that resolves into a success checkmark",
    category: "ui-elements",
    durationInFrames: 180,
    fps: 60,
    params: [
      { key: "spinnerColor", label: "Spinner colour", type: "color", default: "#6366f1" },
      { key: "successColor", label: "Success colour", type: "color", default: "#34d399" },
      { key: "trackColor", label: "Track colour", type: "color", default: "#1f2937" },
      { key: "bgColor", label: "Background", type: "color", default: "#0b0b0f" },
      { key: "spinFrames", label: "Spin frames", type: "duration", default: 90, min: 20, max: 300, step: 5 },
    ],
    code: `
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { pathDraw } from '@/lib/motion/primitives';

export default function LoadingSpinner({ params }) {
  const frame = useCurrentFrame();
  const { spinnerColor, successColor, trackColor, bgColor, spinFrames } = params;
  const done = frame >= Number(spinFrames);
  const angle = (frame * 6) % 360;
  const check = pathDraw(frame, { start: Number(spinFrames), duration: 26, pathLength: 100 });
  return (
    <AbsoluteFill style={{ backgroundColor: bgColor, justifyContent: 'center', alignItems: 'center' }}>
      <svg width={340} height={340} viewBox="0 0 100 100">
        <circle cx={50} cy={50} r={38} fill="none" stroke={trackColor} strokeWidth={8} />
        {done ? (
          <path d="M28 52 L44 68 L74 34" fill="none" stroke={successColor} strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" pathLength={100} strokeDasharray={check.strokeDasharray} strokeDashoffset={check.strokeDashoffset} />
        ) : (
          <circle cx={50} cy={50} r={38} fill="none" stroke={spinnerColor} strokeWidth={8} strokeLinecap="round" pathLength={100} strokeDasharray="25 75" style={{ transformOrigin: '50px 50px', transform: 'rotate(' + angle + 'deg)' }} />
        )}
      </svg>
    </AbsoluteFill>
  );
}
`.trim(),
  },
  {
    slug: "tab-switcher",
    title: "Tab Switcher",
    prompt: "Tabs with a pill indicator sliding between them",
    category: "ui-elements",
    durationInFrames: 180,
    fps: 60,
    params: [
      { key: "tabs", label: "Tabs (comma separated)", type: "text", default: "Preview, Code, Params" },
      { key: "barColor", label: "Bar colour", type: "color", default: "#111827" },
      { key: "pillColor", label: "Pill colour", type: "color", default: "#6366f1" },
      { key: "textColor", label: "Text colour", type: "color", default: "#f8fafc" },
      { key: "bgColor", label: "Background", type: "color", default: "#0b0b0f" },
      { key: "perTab", label: "Frames per tab", type: "duration", default: 45, min: 10, max: 200, step: 1 },
    ],
    code: `
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { springIn } from '@/lib/motion/primitives';

export default function TabSwitcher({ params }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { tabs, barColor, pillColor, textColor, bgColor, perTab } = params;
  const list = String(tabs).split(',');
  const tabWidth = 220;
  const index = Math.min(list.length - 1, Math.floor(frame / Number(perTab)));
  const local = springIn(frame, { fps, delay: index * Number(perTab), from: 0, to: 1, stiffness: 180 });
  const prev = Math.max(0, index - 1);
  const x = (prev + (index - prev) * local) * tabWidth;
  return (
    <AbsoluteFill style={{ backgroundColor: bgColor, justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ position: 'relative', display: 'flex', backgroundColor: barColor, borderRadius: 999, padding: 10 }}>
        <div style={{ position: 'absolute', top: 10, left: 10, width: tabWidth, height: 72, borderRadius: 999, backgroundColor: pillColor, transform: 'translateX(' + x + 'px)' }} />
        {list.map((t, i) => (
          <div key={i} style={{ position: 'relative', width: tabWidth, height: 72, display: 'flex', alignItems: 'center', justifyContent: 'center', color: textColor, fontSize: 30, fontWeight: 700 }}>
            {String(t).trim()}
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
}
`.trim(),
  },

  // -------------------------------------------------------- launch-videos ---
  {
    slug: "product-reveal",
    title: "Product Reveal",
    prompt: "A product panel that wipes in with a headline and a shine pass",
    category: "launch-videos",
    durationInFrames: 180,
    fps: 60,
    params: [
      { key: "headline", label: "Headline", type: "text", default: "Meet Horizon" },
      { key: "subtitle", label: "Subtitle", type: "text", default: "Motion design, generated" },
      { key: "panelColor", label: "Panel colour", type: "color", default: "#1e293b" },
      { key: "textColor", label: "Text colour", type: "color", default: "#f8fafc" },
      { key: "bgColor", label: "Background", type: "color", default: "#020617" },
      { key: "sweepStart", label: "Shine start", type: "number", default: 40, min: 0, max: 150, step: 1 },
    ],
    code: `
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { fadeSlide, lightSweep, maskWipe } from '@/lib/motion/primitives';

export default function ProductReveal({ params }) {
  const frame = useCurrentFrame();
  const { headline, subtitle, panelColor, textColor, bgColor, sweepStart } = params;
  const clipPath = maskWipe(frame, { direction: 'up', start: 0, duration: 30 });
  const shine = lightSweep(frame, { start: sweepStart, duration: 40 });
  const head = fadeSlide(frame, { axis: 'y', distance: 26, start: 24, duration: 24 });
  const sub = fadeSlide(frame, { axis: 'y', distance: 20, start: 36, duration: 24 });
  return (
    <AbsoluteFill style={{ backgroundColor: bgColor, justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ position: 'relative', overflow: 'hidden', width: 900, height: 420, borderRadius: 28, backgroundColor: panelColor, clipPath, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 14 }}>
        <span style={{ color: textColor, fontSize: 84, fontWeight: 900, opacity: head.opacity, transform: head.transform }}>{headline}</span>
        <span style={{ color: textColor, fontSize: 32, opacity: sub.opacity * 0.7, transform: sub.transform }}>{subtitle}</span>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: shine.backgroundImage, backgroundSize: shine.backgroundSize, backgroundPosition: shine.backgroundPosition, backgroundRepeat: 'no-repeat' }} />
      </div>
    </AbsoluteFill>
  );
}
`.trim(),
  },
  {
    slug: "before-after-split",
    title: "Before / After Split",
    prompt: "A split screen wiping from a before state to an after state",
    category: "launch-videos",
    durationInFrames: 180,
    fps: 60,
    params: [
      { key: "beforeLabel", label: "Before label", type: "text", default: "Before" },
      { key: "afterLabel", label: "After label", type: "text", default: "After" },
      { key: "beforeColor", label: "Before colour", type: "color", default: "#334155" },
      { key: "afterColor", label: "After colour", type: "color", default: "#6366f1" },
      { key: "textColor", label: "Text colour", type: "color", default: "#f8fafc" },
      { key: "wipeStart", label: "Wipe start", type: "number", default: 30, min: 0, max: 150, step: 1 },
      { key: "wipeDuration", label: "Wipe duration", type: "duration", default: 45, min: 6, max: 200, step: 1 },
    ],
    code: `
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { maskWipe } from '@/lib/motion/primitives';

export default function BeforeAfterSplit({ params }) {
  const frame = useCurrentFrame();
  const { beforeLabel, afterLabel, beforeColor, afterColor, textColor, wipeStart, wipeDuration } = params;
  const clipPath = maskWipe(frame, { direction: 'left', start: wipeStart, duration: wipeDuration });
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ backgroundColor: beforeColor, justifyContent: 'center', alignItems: 'center' }}>
        <span style={{ color: textColor, fontSize: 90, fontWeight: 900, letterSpacing: 4 }}>{beforeLabel}</span>
      </AbsoluteFill>
      <AbsoluteFill style={{ backgroundColor: afterColor, justifyContent: 'center', alignItems: 'center', clipPath }}>
        <span style={{ color: textColor, fontSize: 90, fontWeight: 900, letterSpacing: 4 }}>{afterLabel}</span>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
`.trim(),
  },
];
