// A pane's header, for layouts that frame their panes:
//   { "tab": "active", "pane": { "header": { "content": { "mod": "rgb-pane" } } } }
// Shows the program's icon (the app's program table), the agent's name or
// the terminal's title, the folder, and the agent's status; buttons split, zoom and close
// this pane. Props from the app: { pane, terminal }. Click: focus the pane.

import { View, div, svg, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { rainbow, sweep, Sweeps } from "./rgb.js";
import { panes, props, run, theme, home, spaces } from "herdr";

function icon(p, size, color) {
  if (!p?.icon) return null;
  return p.tint ? svg(p.icon).size(size).flex_none().text_color(color) : image(p.icon).w(size).h(size).flex_none();
}

function folder(cwd) {
  if (!cwd) return "";
  const h = home();
  return cwd === h ? "~" : cwd.startsWith(h + "/") ? "~" + cwd.slice(h.length) : cwd;
}

export default class Pane extends View {
  init() { this.hovered = false; this.width = 0; this.sweeps = new Sweeps(); }

  me() {
    return panes().find((p) => p.pane === props()?.pane);
  }

  button(t, id, icon, command, args) {
    return div()
      .id(id)
      .p(3)
      .rounded(4)
      .text_color(t.dim)
      .hover((s) => s.bg(t.hover).text_color(t.foreground))
      .on_click((_e, cx) => {
        cx.stop_propagation();
        run(command, args);
      })
      .child(svg(`mods/rgb-pane/${icon}.svg`).size(14));
  }

  render(cx) {
    const t = theme();
    const p = this.me();
    if (!p) return div();
    const name = ((p.program?.agent || p.program?.shell) && p.program.name) || p.title || p.program?.name || "shell";
    const pic = icon(p.program, 14, t.dim);
    const st = p.status;
    const pane = p.pane;
    // An agent that just finished: a band of rainbow light sweeps the header
    // once. Its tab's `changed_at` keeps a finish missed while this header
    // wasn't drawn from sweeping late.
    const changedAt = spaces().flatMap(s => s.tabs).find(x => x.id === p.tab)?.changed_at;
    if (this.sweeps.finished(pane, st, changedAt)) this.sweeps.play(pane, cx);
    const prog = this.sweeps.progress(pane);
    const band = Math.max(160, Math.round(this.width * 0.3));
    const row = h_flex()
      .id(`pane-head-${pane}`)
      .w_full()
      .flex_1()
      .px(10)
      .gap(8)
      .items_center()
      .bg(t.background)
      .text_size(12)
      .on_hover((hovered, cx) => { this.hovered = hovered; cx.notify(); })
      .on_click(() => run("pane.focus", { pane }))
      .when(Boolean(pic), (el) => el.child(pic))
      .child(div().flex_none().truncate().max_w(260).font_medium().text_color(t.foreground).child(name))
      .child(div().flex_1().truncate().text_color(t.dim).child(folder(p.cwd)))
      .when(st === "working", el => el.child(svg("mods/workspace-chrome/spinner.svg").size(12).flex_none().text_color(t.working).spin(900)))
      .when(st === "blocked", el => el.child(div().flex_none().px(6).h(18).flex().items_center().rounded(5).bg(t.blocked + "26").text_size(10.5).font_semibold().text_color(t.blocked).child("Needs you")))
      .when(st === "done", el => el.child(div().size(7).flex_none().rounded(4).bg(t.done)))
      .when(this.hovered, el => el
        .child(this.button(t, `ph-r-${pane}`, "split-right", "pane.split", { direction: "right", pane }))
        .child(this.button(t, `ph-d-${pane}`, "split-down", "pane.split", { direction: "down", pane }))
        .child(this.button(t, `ph-z-${pane}`, p.zoomed ? "unzoom" : "zoom", "pane.zoom", { pane }))
        .child(this.button(t, `ph-x-${pane}`, "close", "pane.close", { pane })));
    // The underline tells the agent's state: working sways through the
    // rainbow, "Needs you" pulses warm, done rests green, anything else is
    // the plain hairline. All native motion: no script redraws.
    const bar = (color) => div().flex_none().w_full().h(2).bg(color);
    const line =
      st === "working" ? rainbow(`pane-glow-${pane}`, this.width, 2, { opacity: p.focused ? 0.9 : 0.45, period: 9000 })
      : st === "blocked" ? bar(t.blocked).id(`pane-pulse-${pane}`).loop("opacity", { from: 0.25, to: 1, period: 1400 })
      : st === "done" ? bar(t.done).opacity(p.focused ? 0.85 : 0.5)
      : div().flex_none().w_full().h(1).bg(t.border).opacity(0.6);
    return v_flex()
      .id(`pane-wrap-${pane}`)
      .size_full()
      .bg(t.background)
      .on_size_change((size, cx) => { if (Math.round(size.width) !== this.width) { this.width = Math.round(size.width); cx.notify(); } })
      .relative()
      .overflow_hidden()
      .child(row)
      .child(line)
      // A soft streak runs along the underline, with a faint glow over the header.
      .when(prog != null, el => el
        .child(sweep(`pane-glow-sweep-${pane}`, { from: -band, to: this.width, width: band, t: prog, peak: 0.1 }))
        .child(sweep(`pane-sweep-${pane}`, { from: -band, to: this.width, width: band, t: prog, height: 2, peak: 1 })));
  }
}
