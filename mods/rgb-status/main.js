// Status bar for the RGB layout: the shipped status bar with its facts in
// chips, the owner of calm mode's key command, and of the focus frame's
// color cycle.
//
// A layout frame can't animate a color natively, so the frame's hue is
// stepped with `layout.set`, which rewrites the whole layout. To keep that
// cheap and safe it runs only while the focused pane's agent is working and
// the window is in front, one step every 1.2s, writing only when the color
// changes. And because a write could undo a layout change still on its way
// (a panel shown, the sidebar resized), it holds off for two steps whenever
// anything else in the layout has changed. Otherwise the frame rests on
// silver.

import { View, div, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { spaces, agents, theme, run, window, layout, shared, setShared, nextCommand } from "herdr";
import { hsl, calm, paneFrame } from "./rgb.js";

const STEP_MS = 1200;    // one hue step
const STEPS = 18;        // steps per full turn: 18 x 1.2 s ≈ 22 s
const QUIET = 2;         // steps to hold off after another layout change
const REST = "#b4b8cc";  // the frame while the focused agent isn't working

// The layout without the frame's color: what tells another change from ours.
function shape(tree) {
  return JSON.stringify(tree, (k, v) => (k === "focus" ? undefined : v));
}

export default class RgbStatus extends View {
  init(_props, cx) {
    this.step = 0;
    this.quiet = 0;
    this.shape = null;
    cx.timer.every(STEP_MS, () => this.tick());
    // `rgb-status.calm` (cmd-shift-g): effects on/off for every RGB mod.
    cx.spawn(async () => {
      for (;;) {
        const c = await nextCommand();
        if (c === "calm") setShared("rgb.calm", shared("rgb.calm") !== true);
      }
    });
  }

  tick() {
    const tree = layout();
    const frame = paneFrame(tree);
    if (!frame) return;
    const now = shape(tree);
    if (now !== this.shape) { this.shape = now; this.quiet = QUIET; }
    const busy = !calm() && window()?.active === true && agents().some(a => a.focused && a.status === "working");
    let color = REST;
    if (busy) {
      this.step = (this.step + 1) % STEPS;
      color = hsl((this.step * 360) / STEPS);
    }
    if (frame.focus?.color === color) return;
    if (this.quiet > 0) { this.quiet--; return; }
    frame.focus = { width: frame.focus?.width ?? 1.5, color };
    run("layout.set", { layout: tree });
  }

  render() {
    const t = theme();
    const space = spaces().find(s => s.active);
    const list = agents();
    const needs = list.filter(a => a.status === "blocked").length;
    const working = list.filter(a => a.status === "working").length;
    // Each fact sits in a small chip, so it reads at a glance against the bar.
    const chip = (id) => h_flex().id(id).h(20).px(8).gap(6).flex_none().items_center().rounded(6)
      .bg(t.raised).border(1).border_color(t.border).text_color(t.foreground);
    const icon = (name) => svg(`mods/workspace-chrome/${name}.svg`).size(13).flex_none().text_color(t.muted);
    const dot = div().size(6).flex_none().rounded(3).bg(working ? t.working : t.dim)
      .when(working > 0, el => el.loop("opacity", { from: 0.35, to: 1, period: 1600 }));
    return v_flex().id("root").size_full().bg(t.chrome)
      .child(div().flex_none().h(8))  // room under the pane cards
      .child(h_flex().flex_1().px(12).gap(8).items_center().text_size(12)
        .child(chip("machine").child(icon(space?.machine ? "server" : "monitor")).child(space?.machine ?? "This computer"))
        .when(Boolean(space?.branch), el => el.child(chip("branch").child(icon("branch")).child(space.branch)))
        .child(chip("agents").child(dot).child(`${list.length} ${list.length === 1 ? "agent" : "agents"}`)
          .when(working > 0, el => el.child(div().text_color(t.working).child(`· ${working} working`))))
        .when(needs > 0, el => el.child(chip("needs").bg(t.blocked + "26").border_color(t.blocked + "66").text_color(t.blocked)
          .child(div().loop("opacity", { from: 0.45, to: 1, period: 1400 }).child(`${needs} needs you`))))
        .child(div().flex_1())
        .child(div().id("palette").text_color(t.dim).on_click(() => run("app.palette")).child(`${window()?.platform === "macos" ? "⌘" : "Ctrl"} Shift P  commands`)));
  }
}
