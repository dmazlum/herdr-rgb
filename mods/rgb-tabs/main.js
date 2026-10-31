import { View, div, svg, image } from "gpui-kit";
import { h_flex } from "gpui-base";
import { outline, sweep, Sweeps, paneFrame } from "./rgb.js";
import { spaces, panes, run, openOverlay, theme, window, shared, layout, settings } from "herdr";

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

export default class Tabs extends View {
  init() {
    this.pressed = null;
    this.panels = JSON.parse(localStorage.getItem("panels") ?? "{}");
    this.barW = 0;
  }

  // The side panel is remembered per space: switching shows that space's choice
  // (closed if it never had one), and opening or closing it records it.
  syncPanel(space, panel, body, enabled) {
    if (!space || !panel) return;
    const now = panel.hidden ? null : body?.active ?? null;
    if (space.id !== this.space) {
      const first = this.space === undefined;
      this.space = space.id; this.pending = null;
      if (!(first && !(space.id in this.panels))) {
        const stored = this.panels[space.id] ?? null, want = enabled.includes(stored) ? stored : null;
        if (want !== now) {
          this.pending = { want, until: Date.now() + 1000 };
          if (want) { run("layout.select", { stack: "panel-body", child: want }); run("layout.show", { id: "panel" }); }
          else run("layout.hide", { id: "panel" });
          return;
        }
      }
    }
    // Until the restore lands (or something else won), the old state isn't a choice.
    if (this.pending) {
      if (this.pending.want !== now && Date.now() < this.pending.until) return;
      this.pending = null;
    }
    if (this.panels[space.id] === now) return;
    this.panels[space.id] = now;
    localStorage.setItem("panels", JSON.stringify(this.panels));
  }

  render(cx) {
    this.sweeps ??= new Sweeps();
    this.widths ??= new Map();
    const t = theme();
    const space = spaces().find(p => p.active);
    const shown = space?.tabs ?? [];
    const stop = (_e, cx) => cx.stop_propagation();
    const button = (id, label, action) => div().id(id).size(28).mb(6).flex_none().flex().items_center().justify_center().rounded(7)
      .bg(t.raised).border(1).border_color(t.border).text_color(t.foreground).hover(s => s.bg(t.selected))
      .on_mouse_down("left", stop).on_click(action).child(label);
    // The active tab's outline: a faint rainbow turning around it, as thick
    // as the pane frame. Native motion only.
    const edgeW = paneFrame(layout())?.focus?.width ?? 1.5;
    // Follow every tab's status, in every space, so a finish that happened
    // while its space wasn't shown never sweeps late; only a background tab
    // of the shown space sweeps.
    const all = spaces().flatMap(s => s.tabs);
    this.sweeps.keep(all.map(c => c.id));
    for (const id of this.widths.keys()) if (!all.some(c => c.id === id)) this.widths.delete(id);
    for (const c of all) {
      if (this.sweeps.finished(c.id, c.status, c.changed_at) && !c.active && shown.some(x => x.id === c.id)) this.sweeps.play(c.id, cx);
    }
    const item = (c, i) => {
      const program = panes().find(p => p.tab === c.id && p.program?.agent)?.program ?? panes().find(p => p.tab === c.id)?.program;
      const name = /^tb\d+$/.test(c.name) ? program?.name ?? "Terminal" : c.name;
      const prog = this.sweeps.progress(c.id);
      // The finish streak runs the tab's measured width, inside its rounded
      // corners (8px in from each side), since clipping is rectangular.
      const inner = Math.max(1, (this.widths.get(c.id) ?? 120) - 16);
      const band = Math.min(120, Math.max(40, Math.round(inner * 0.6)));
      return h_flex().id(`tab-${c.id}`).h(36).px(14).gap(8).items_center().flex_none().text_size(13.6)
        .on_size_change((size, cx) => {
          const w = Math.round(size.width);
          if (this.widths.get(c.id) !== w) { this.widths.set(c.id, w); cx.notify(); }
        })
        // The active tab's outline: a faint rainbow turning around it, open at
        // the bottom where it joins its card, as thick as the pane frame.
        .when(c.active, el => el.relative().text_color(t.foreground)
          .children(outline(`tab-edge-${c.id}`, "rgb-tabs", {
            fill: t.background, rowBg: t.chrome, ringW: edgeW, radius: 10, sides: "top",
            span: 320, opacity: 0.45, period: 14000,
          })))
        .when(!c.active, el => el.mb(4).h(32).rounded(8).bg(t.surface).text_color(t.muted).hover(s => s.bg(t.selected).text_color(t.foreground)))
        .when(prog != null, el => el.relative().child(
          div().absolute().top(0).bottom(0).left(8).right(8).overflow_hidden()
            .child(sweep(`tab-glow-sweep-${c.id}`, { from: -band, to: inner, width: band, t: prog, peak: 0.1 }))
            .child(sweep(`tab-sweep-${c.id}`, { from: -band, to: inner, width: band, t: prog, height: 2, peak: 1 }))))
        // A background tab whose agent needs you glows warm until you look.
        .when(!c.active && c.status === "blocked", el => el.relative().child(
          div().id(`tab-alert-${c.id}`).absolute().top(0).left(0).right(0).bottom(0).rounded(8).bg(t.blocked)
            .loop("opacity", { from: 0.06, to: 0.3, period: 1400 })))
        .on_mouse_down("left", (e, cx) => { cx.stop_propagation(); this.pressed = i; if (e.click_count === 2) run("tab.rename", { id: c.id }); })
        .on_mouse_up("left", () => {
          const from = this.pressed; this.pressed = null;
          if (from !== null && from !== i) run("tab.move", { id: shown[from].id, index: space.tabs.findIndex(x => x.id === c.id) + 1 });
          else run("tab.select", { id: c.id });
        })
        .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); openOverlay({ mod: "menu", kind: "popup", width: 200, props: { tab: "tab", target: { id: c.id, space: space.id } } }); })
        .when(Boolean(program?.icon), el => el.child(program.tint ? svg(program.icon).size(16).text_color(t.muted) : image(program.icon).size(16)))
        .child(div().max_w(220).truncate().child(c.zoomed ? `${name} Z` : name))
        .when(c.status === "working", el => el.child(svg("mods/workspace-chrome/spinner.svg").size(12).flex_none().text_color(t.working).spin(900)))
        .when(c.status === "blocked" || c.status === "done", el => el.child(div().size(6).rounded(3).bg(t[c.status])))
        .when(c.active, el => el.child(div().id(`close-${c.id}`).text_color(t.dim).on_mouse_down("left", stop).on_click((_e, cx) => { cx.stop_propagation(); run("tab.close", { id: c.id }); }).child(svg("mods/pane/close.svg").size(13))));
    };
    const root = layout(), sidebar = find(root, "sidebar"), w = window();
    // Old saved rails and a dragged-narrow sidebar can be smaller than the window buttons.
    const lightsPadding = w?.platform === "macos" && w.titlebar === "none" && !w.fullscreen && root?.traffic_lights
      ? Math.max(10, (root.traffic_lights[0] + 64) / settings().zoom - (sidebar?.hidden ? 0 : sidebar?.size?.px ?? 0))
      : 10;
    const panel = find(root, "panel"), body = find(root, "panel-body");
    const enabled = shared("workspace.panels") ?? ["files", "changes"];
    this.syncPanel(space, panel, body, enabled);
    const panelButton = (id, label, icon) => {
      const on = panel && !panel.hidden && body?.active === id;
      return h_flex().id(`panel-${id}`).h(28).mb(6).px(10).gap(6).flex_none().items_center().rounded(7)
        .text_size(12.5).border(1).text_color(t.foreground)
        .bg(on ? t.selected : t.raised).border_color(on ? t.accent : t.border)
        .hover(s => s.bg(t.selected)).on_mouse_down("left", stop)
        .on_click(() => {
          if (on) run("layout.hide", { id: "panel" });
          else { run("layout.select", { stack: "panel-body", child: id }); run("layout.show", { id: "panel" }); }
        }).child(svg(icon).size(14)).child(label);
    };
    // A search button in the middle of the bar: a click opens Herdr's command
    // palette, which then has the keyboard at once. (Typing into a box here
    // didn't work well: a palette opened from a text input's change event
    // can't take the keyboard for a while, and passing keys on through
    // shared state redrew every mod on each key.)
    const SEARCH_W = 300;
    const searchLeft = Math.max(lightsPadding, Math.round((this.barW - SEARCH_W) / 2));
    const search = h_flex().id("tab-search").absolute().top(12).left(searchLeft).w(SEARCH_W).h(30).px(10).gap(8).items_center()
      .rounded(8).bg(t.background).border(1).border_color(t.border).text_size(12.5).text_color(t.dim)
      .cursor_pointer().hover(s => s.border_color(t.dim).text_color(t.muted))
      .on_mouse_down("left", stop)
      .on_click(() => run("app.palette"))
      .child(svg("mods/workspace-chrome/search.svg").size(14).flex_none())
      .child(div().flex_1().child("Search commands"))
      .child(div().flex_none().text_size(11).child(`${w?.platform === "macos" ? "⌘" : "Ctrl"}⇧P`));
    return h_flex().id("tab-bar").relative().size_full().min_w(0).px(10).pl(lightsPadding).gap(4).items_end().bg(t.chrome)
      .on_size_change((size, cx) => { const bw = Math.round(size.width); if (bw !== this.barW) { this.barW = bw; cx.notify(); } })
      .on_mouse_up("left", () => { this.pressed = null; })
      .on_scroll_wheel(e => { if (Math.abs(e.delta.y) >= 1) run(e.delta.y > 0 ? "tab.prev" : "tab.next"); })
      .child(h_flex().id("tab-scroll").flex_1().min_w(0).when(this.barW > 0, el => el.max_w(Math.max(80, searchLeft - lightsPadding - 12))).h_full().items_end().gap(4).overflow_x_scrollbar().children(shown.map(item)))
      .child(div().flex_1())
      .when(this.barW > 0, el => el.child(search))
      .child(button("tab-new", "+", () => openOverlay({ mod: "new-menu", kind: "popup", width: 250, height: 512 })))
      .when(enabled.includes("files"), el => el.child(panelButton("files", "Files", "mods/files/file.svg")))
      .when(enabled.includes("changes"), el => el.child(panelButton("changes", "Changes", "mods/changes/changes.svg")))
      .when(w?.buttons, el => el.child(button("minimize", w.platform === "windows" ? svg("mods/rgb-tabs/win-min.svg").size(16) : "−", () => run("window.minimize")))
        .child(button("maximize", w.platform === "windows" ? svg(`mods/rgb-tabs/${w.maximized ? "win-restore" : "win-max"}.svg`).size(16) : "□", () => run("window.maximize")))
        .child(button("close-window", w.platform === "windows" ? svg("mods/rgb-tabs/win-close.svg").size(16) : svg("mods/pane/close.svg").size(13), () => run("window.close"))));
  }
}
