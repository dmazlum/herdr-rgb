import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { readFileSync } from "node:fs";

register("./stubs/hooks.mjs", import.meta.url);
const { hsl, calm, drift, ring, outline, rainbow, paneFrame, Sweeps } = await import("../mods/rgb-status/rgb.js");
const { store, state } = await import("./stubs/herdr.mjs");
const { default: RgbStatus } = await import("../mods/rgb-status/main.js");

const MODS = ["rgb-pane", "rgb-tabs", "rgb-spaces", "rgb-agents", "rgb-status"];

test("every mod carries the same rgb.js", () => {
  const ref = readFileSync(new URL("../mods/rgb-status/rgb.js", import.meta.url), "utf8");
  for (const m of MODS) {
    assert.equal(readFileSync(new URL(`../mods/${m}/rgb.js`, import.meta.url), "utf8"), ref, `${m}/rgb.js differs`);
  }
});

test("hsl gives #rrggbb with the expected dominant channel", () => {
  const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  for (const h of [0, 45, 90, 180, 270, 359]) assert.match(hsl(h), /^#[0-9a-f]{6}$/);
  const [r0, g0, b0] = rgb(hsl(0));
  assert.ok(r0 > g0 && r0 > b0, "0° is red");
  const [r1, g1, b1] = rgb(hsl(120));
  assert.ok(g1 > r1 && g1 > b1, "120° is green");
  const [r2, g2, b2] = rgb(hsl(240));
  assert.ok(b2 > r2 && b2 > g2, "240° is blue");
});

const now = () => Date.now();

test("a sweep starts only when work finishes, and only if it just did", () => {
  store.clear();
  const s = new Sweeps();
  assert.equal(s.finished("p", "working", now()), false);
  assert.equal(s.finished("p", "done", now()), true, "working → done");
  s.finished("p", "working", now());
  assert.equal(s.finished("p", "idle", now()), true, "working → idle");
  s.finished("p", "working", now());
  assert.equal(s.finished("p", "blocked", now()), false, "needing you is not finishing");
  assert.equal(s.finished("q", "done", now()), false, "nothing was seen working");
  s.finished("p", "working", now() - 60000);
  assert.equal(s.finished("p", "done", now() - 3600000), false, "a finish from an hour ago doesn't sweep");
  assert.equal(s.progress("p"), null);
});

test("closed tabs are forgotten", () => {
  const s = new Sweeps();
  s.finished("a", "working", now());
  s.finished("b", "working", now());
  s.keep(["a"]);
  assert.deepEqual([...s.prev.keys()], ["a"]);
});

test("a sweep runs its frames and ends cleanly when its view goes away", async () => {
  const s = new Sweeps();
  let notified = 0;
  let body;
  const cx = { spawn: (fn) => { body = fn; } };
  s.play("p", cx);
  assert.equal(s.progress("p"), 0);
  await body({ sleep: async () => {}, notify: () => { notified++; } });
  assert.equal(s.progress("p"), null, "cleared after the last frame");
  assert.ok(notified >= 34);

  s.play("p", cx);
  await body({ sleep: async () => { throw new Error("view closed"); }, notify: () => { throw new Error("view closed"); } });
  assert.equal(s.progress("p"), null, "a closed view leaves nothing behind");
});

test("paneFrame finds the tab block's pane frame", () => {
  const frame = { gap: 10 };
  const tree = { children: [{ content: { mod: "x" } }, { children: [{ content: { tab: "active", pane: frame } }] }] };
  assert.equal(paneFrame(tree), frame);
  assert.equal(paneFrame({ children: [] }), null);
  assert.equal(paneFrame(null), null);
});

test("calm mode stops sweeps and stills the rainbows", () => {
  store.clear();
  store.set("rgb.calm", true);
  assert.equal(calm(), true);
  const s = new Sweeps();
  s.finished("p", "working", now());
  assert.equal(s.finished("p", "done", now()), false);
  const names = (el) => el.calls.map((c) => c[0]);
  assert.ok(!names(rainbow("r", 100, 2)).includes("loop"), "the line doesn't sway");
  assert.ok(names(drift("d", 100)).includes("bg"), "the rainbow is a plain fill");
  assert.ok(!names(drift("d", 100)).includes("child"), "with no moving strip");
  store.clear();
  assert.ok(names(drift("d", 100)).includes("child"));
});

test("a ring uses its own mod's corner pieces", () => {
  store.clear();
  const el = ring("r", "rgb-agents", "x", { fill: "#000000", rowBg: "#111111" });
  const kinds = [];
  const walk = (e) => { if (Array.isArray(e)) return e.forEach(walk); if (e?.calls) { kinds.push(e.kind); for (const c of e.calls) for (const a of c.slice(1)) walk(a); } };
  walk(el);
  for (const k of ["tl", "tr", "bl", "br"]) assert.ok(kinds.includes(`svg:mods/rgb-agents/corner-${k}.svg`));
});

test("an outline open at the top side keeps only the top corners and reaches the bottom", () => {
  store.clear();
  const layers = outline("t", "rgb-tabs", { fill: "#000000", rowBg: "#111111", sides: "top", radius: 10 });
  const kinds = layers.map((l) => l.kind);
  assert.ok(kinds.includes("svg:mods/rgb-tabs/corner-tl.svg") && kinds.includes("svg:mods/rgb-tabs/corner-tr.svg"));
  assert.ok(!kinds.some((k) => /corner-b[lr]/.test(k)), "no bottom corners");
  const fill = layers.find((l) => l.calls.some((c) => c[0] === "bg" && c[1] === "#000000"));
  assert.ok(fill.calls.some((c) => c[0] === "bottom" && c[1] === 0), "the fill reaches the bottom edge");
  assert.ok(fill.calls.some((c) => c[0] === "rounded_t"), "only its top is rounded");
});

test("a plain ring keeps the fill's size and draws no ring", () => {
  store.clear();
  const layers = outline("p", "rgb-spaces", { fill: "#123456", rowBg: "#111111", ringW: 1.5, hairline: "#000000", plain: true });
  assert.equal(layers.length, 1, "just the fill");
  assert.ok(layers[0].calls.some((c) => c[0] === "top" && c[1] === 2.5), "inset by ring plus hairline");
});

test("the focus frame cycles only for the focused working agent, and never right after another layout change", () => {
  store.clear();
  const frame = () => state.tree.children[0].content.pane.focus.color;
  state.tree = { id: "root", children: [{ id: "main", content: { tab: "active", pane: { focus: { width: 1.5, color: "#b4b8cc" } } } }] };
  state.runs = [];
  state.active = true;
  state.agents = [{ focused: true, status: "working" }];
  const bar = new RgbStatus();
  bar.init({}, { timer: { every() {} }, spawn() {} });

  bar.tick(); bar.tick();
  assert.equal(state.runs.length, 0, "the first sight of the layout counts as a change: hold off two steps");
  bar.tick();
  assert.equal(state.runs.length, 1);
  assert.notEqual(frame(), "#b4b8cc", "a hue while the focused agent works");

  state.tree.children.push({ id: "panel", hidden: false });
  bar.tick(); bar.tick();
  assert.equal(state.runs.length, 1, "someone else changed the layout: hold off");
  bar.tick();
  assert.equal(state.runs.length, 2);
  assert.equal(state.tree.children[1].hidden, false, "and the other change is kept");

  state.agents = [{ focused: false, status: "working" }];
  bar.tick();
  assert.equal(frame(), "#b4b8cc", "an agent working elsewhere: rest on silver");
  const n = state.runs.length;
  bar.tick(); bar.tick();
  assert.equal(state.runs.length, n, "and then nothing is written");

  state.agents = [{ focused: true, status: "working" }];
  state.active = false;
  bar.tick();
  assert.equal(state.runs.length, n, "window in the background: no cycling");
});
