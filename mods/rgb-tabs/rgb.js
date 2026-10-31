// The RGB layout's shared pieces. Every rgb-* mod carries this same file (a
// mod can't import another's); the tests keep the copies identical.
import { div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { shared, theme } from "herdr";

// Calm mode (cmd-shift-g in the RGB layout): rainbows turn into quiet lines
// and the focus frame stops cycling. Attention signals stay.
export const calm = () => shared("rgb.calm") === true;

// Hue (0..360) to #rrggbb. Pastel-neon by default: reads as RGB without shouting.
export function hsl(h, s = 0.82, l = 0.66) {
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const x = (v) => Math.round(v * 255).toString(16).padStart(2, "0");
  return `#${x(f(0))}${x(f(8))}${x(f(4))}`;
}

// The layout's tab block's pane frame (`content.pane`), or null.
export function paneFrame(node) {
  if (!node || typeof node !== "object") return null;
  const c = node.content;
  if (c && typeof c === "object" && c.tab && c.pane) return c.pane;
  for (const ch of node.children || []) {
    const f = paneFrame(ch);
    if (f) return f;
  }
  return null;
}

// A strip that fills its (relative) parent while its colors drift along it,
// sideways; `span` is how many px one full hue turn takes (a short box shows
// one slowly changing hue, a long one a rainbow). `offset` (degrees) shifts
// every hue. Herdr's `loop` goes there and back, so the colors sway rather
// than flow. One-way motion (`spin`) can't be used: it turns only svg masks,
// and Herdr draws a turning element above everything else in its block, so
// no fill can sit in front of it. These are plain `div`s, which a later
// sibling covers normally. Native motion: no script redraws.
export function drift(id, span, { opacity = 1, period = 14000, offset = 0 } = {}) {
  const layer = div().id(id).absolute().top(0).left(0).right(0).bottom(0).overflow_hidden().opacity(opacity);
  if (calm()) return layer.bg(theme().border);
  const s = Math.max(1, Math.round(span));
  const turn = TURN.map((_, i) => hsl(((i * 360) / SLICES + offset) % 360));
  return layer.child(h_flex().absolute().top(0).left(0).h_full().w(s * 2)
    .loop("left", { from: 0, to: -s, period, easing: "linear" })
    .children([...turn, ...turn].map((c) => div().flex_1().h_full().bg(c))));
}

// The layers of a rounded rainbow outline, for a `relative()` parent to take
// as its first children (its own children then draw on top):
// - a rainbow drifting behind it (`drift`, `span` px per hue turn) or, with
//   `pulse`, that one color pulsing (a signal, so calm mode keeps it);
// - an optional `hairline` color just inside it;
// - the `fill`, inset by `ringW` (plus 1px of hairline), with `content`
//   centered on it;
// - corner pieces (`corner-*.svg`, a square minus a quarter circle) in
//   `rowBg`, the color behind the parent: `overflow_hidden` clips to a
//   rectangle, so these round the ring's corners off.
// `sides: "top"` is an outline open at the bottom (a tab sitting on its
// card): only the top corners are rounded and the fill reaches the bottom
// edge. `plain` keeps the fill's size and drops the ring.
export function outline(id, mod, {
  content = null, fill, rowBg, ringW = 1.5, radius = 6, hairline = null, sides = "all",
  span = 60, opacity = 1, period = 10000, offset = 0, pulse = null, plain = false,
}) {
  const inset = ringW + (hairline ? 1 : 0);
  const top = sides === "top";
  const place = (el, d) => el.absolute().top(d).left(d).right(d).bottom(top ? 0 : d);
  const round = (el, r) => (top ? el.rounded_t(r) : el.rounded(r));
  const layers = [];
  if (!plain) {
    layers.push(pulse
      ? div().id(`${id}-pulse`).absolute().top(0).left(0).right(0).bottom(0).bg(pulse).loop("opacity", { from: 0.3, to: 1, period: 1400 })
      : drift(`${id}-drift`, span, { opacity, period, offset }));
    if (hairline) layers.push(round(place(div(), ringW), radius - ringW).bg(hairline));
  }
  const inner = round(place(h_flex(), inset), radius - inset).bg(fill).items_center().justify_center();
  layers.push(content == null ? inner : inner.child(content));
  if (!plain) {
    const corner = (name, at) => at(svg(`mods/${mod}/corner-${name}.svg`).absolute().size(radius).text_color(rowBg));
    layers.push(corner("tl", (s) => s.top(0).left(0)), corner("tr", (s) => s.top(0).right(0)));
    if (!top) layers.push(corner("bl", (s) => s.bottom(0).left(0)), corner("br", (s) => s.bottom(0).right(0)));
  }
  return layers;
}

// `content` on `fill` in a `size` px rounded box with a rainbow outline
// (see `outline` for the options).
export function ring(id, mod, content, opts) {
  const size = opts.size ?? 22;
  return div().relative().size(size).flex_none().children(outline(id, mod, { ...opts, content }));
}

// One full hue turn in small solid slices (mods can't paint gradients).
const SLICES = 48;
const TURN = Array.from({ length: SLICES }, (_, i) => hsl((i * 360) / SLICES));

// A `height` px rainbow strip as wide as its parent (`width` px), twice as
// long as the box, swaying slowly sideways (Herdr's `loop` goes there and
// back). Native motion: no script redraws.
export function rainbow(id, width, height, { opacity = 1, period = 24000 } = {}) {
  if (calm()) return div().id(id).flex_none().w_full().h(height).bg(theme().border);
  const w = Math.max(1, Math.round(width || 0));
  const strip = h_flex()
    .absolute()
    .top(0)
    .left(0)
    .w(w * 2)
    .h(height)
    .loop("left", { from: 0, to: -w, period, easing: "ease-in-out" })
    .children([...TURN, ...TURN].map((c) => div().flex_1().h_full().bg(c)));
  return div().id(id).relative().overflow_hidden().flex_none().w_full().h(height).opacity(opacity).child(strip);
}

// A one-shot streak of light across its (relative, clipped) parent, `t`
// (0..1) of the way from `from` to `to`, eased. Its colors run through the
// rainbow and its ends fade out (each slice's opacity follows a sine), so
// it reads as a soft comet rather than a block. `height` null fills the
// parent's height; otherwise it sits on the bottom edge. `peak` is the
// opacity at its middle. Used when an agent finishes.
const STREAK = 32;
const STREAK_COLORS = Array.from({ length: STREAK }, (_, i) => hsl((i * 360) / STREAK));
export function sweep(id, { from, to, width, t, height = null, peak = 1 }) {
  const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  const band = h_flex().id(id).absolute().left(Math.round(from + (to - from) * e)).w(width);
  const placed = height == null ? band.top(0).bottom(0) : band.bottom(0).h(height);
  return placed.children(STREAK_COLORS.map((c, i) =>
    div().flex_1().h_full().bg(c).opacity(peak * Math.sin((Math.PI * (i + 0.5)) / STREAK))));
}

// Drives finish sweeps for one view.
// - `finished(key, status, changedAt)`: the status just went from working to
//   done or idle, and that happened in the last few seconds (`changedAt`, ms
//   since the epoch, from the tab), so a finish missed while the view wasn't
//   drawn never plays late.
// - `keep(keys)`: forget keys that are gone.
// - `play(key, cx)`: run it; `progress(key)` is then 0..1, else null.
// Native `transition` doesn't glide `left` here, so a short task steps it:
// ~34 redraws, only when an agent finishes.
const FRAME_MS = 33, FRAMES = 34, FRESH_MS = 4000;
export class Sweeps {
  constructor() { this.prev = new Map(); this.frame = new Map(); }
  finished(key, status, changedAt) {
    const was = this.prev.get(key);
    this.prev.set(key, status);
    const fresh = changedAt == null || Date.now() - changedAt < FRESH_MS;
    return was === "working" && (status === "done" || status === "idle") && fresh && !calm() && !this.frame.has(key);
  }
  keep(keys) {
    const live = new Set(keys);
    for (const k of this.prev.keys()) if (!live.has(k)) this.prev.delete(k);
  }
  progress(key) {
    const f = this.frame.get(key);
    return f == null ? null : Math.min(1, f / FRAMES);
  }
  // Counts frames rather than reading the clock. If the view closes
  // mid-sweep, its `cx` throws; the sweep just ends.
  play(key, cx) {
    this.frame.set(key, 0);
    cx.spawn(async (cx) => {
      try {
        for (let f = 1; f <= FRAMES; f++) {
          await cx.sleep(FRAME_MS);
          this.frame.set(key, f);
          cx.notify();
        }
      } catch {
        // The view is gone.
      } finally {
        this.frame.delete(key);
      }
      try { cx.notify(); } catch { /* gone */ }
    });
  }
}
