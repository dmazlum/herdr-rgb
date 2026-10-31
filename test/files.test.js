import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";

const root = new URL("../", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8");
const json = (p) => JSON.parse(read(p));
const layout = json("layouts/rgb.json");

function nodes(n, out = []) {
  out.push(n);
  for (const c of n.children ?? []) nodes(c, out);
  return out;
}

// Mods the layout uses that ship with Herdr rather than with this repo.
const SHIPPED = new Set(["workspace-chrome", "files", "changes"]);

test("the layout names only mods that exist", () => {
  const mods = [];
  for (const n of nodes(layout)) {
    if (n.content?.mod) mods.push(n.content.mod);
    if (n.content?.pane?.header?.content?.mod) mods.push(n.content.pane.header.content.mod);
  }
  assert.ok(mods.length > 0);
  for (const m of mods) {
    assert.ok(SHIPPED.has(m) || existsSync(new URL(`mods/${m}/main.js`, root)), `missing mod ${m}`);
  }
});

test("the layout's themes and preview are in the repo", () => {
  assert.deepEqual(layout.theme, { light: "rgb-light", dark: "rgb" });
  for (const name of Object.values(layout.theme)) assert.ok(existsSync(new URL(`themes/${name}.json`, root)), name);
  assert.equal(layout.preview, "layouts/rgb.svg");
  assert.ok(existsSync(new URL(layout.preview, root)));
});

test("the stored focus color is the silver the status bar rests on", () => {
  const frame = nodes(layout).find((n) => n.content?.tab)?.content.pane;
  const rest = read("mods/rgb-status/main.js").match(/const REST = "(#[0-9a-f]{6})"/)?.[1];
  assert.equal(rest, "#b4b8cc");
  assert.equal(frame.focus.color, rest);
});

test("only the status bar writes the layout", () => {
  for (const m of readdirSync(new URL("mods/", root))) {
    if (m === "rgb-status") continue;
    assert.doesNotMatch(read(`mods/${m}/main.js`), /run\(\s*["']layout\.set["']/, `${m} writes the layout`);
  }
});

test("both themes are all #rrggbb and name the same colors", () => {
  const hex = /^#[0-9a-f]{6}$/i;
  const dark = json("themes/rgb.json"), light = json("themes/rgb-light.json");
  for (const t of [dark, light]) {
    for (const k of ["background", "foreground", "selection", "cursor"]) assert.match(t[k], hex, k);
    assert.equal(t.ansi.length, 16);
    for (const c of [...t.ansi, ...Object.values(t.colors)]) assert.match(c, hex);
  }
  assert.deepEqual(Object.keys(light.colors).sort(), Object.keys(dark.colors).sort());
});

test("the key reaches a command the status bar handles", () => {
  const action = json("keys.json")["layout:rgb"]["cmd-shift-g"];
  assert.equal(action, "rgb-status.calm");
  assert.match(read("mods/rgb-status/main.js"), /c === "calm"/);
});

test("every own asset a mod draws is in its folder", () => {
  for (const m of readdirSync(new URL("mods/", root))) {
    const shared = existsSync(new URL(`mods/${m}/rgb.js`, root)) ? read(`mods/${m}/rgb.js`) : "";
    const src = read(`mods/${m}/main.js`) + shared;
    for (const [, mod, file] of src.matchAll(/mods\/(rgb-[a-z]+)\/([\w-]+\.svg)/g)) {
      assert.equal(mod, m, `${m} draws another mod's asset ${mod}/${file}`);
      assert.ok(existsSync(new URL(`mods/${mod}/${file}`, root)), `missing ${mod}/${file}`);
    }
    const own = read(`mods/${m}/main.js`);
    if (/\b(ring|outline)\(/.test(own)) {
      assert.match(own, new RegExp(`"${m}"`), `${m} passes another mod's name to ring/outline`);
      for (const k of ["tl", "tr"]) assert.ok(existsSync(new URL(`mods/${m}/corner-${k}.svg`, root)), `missing ${m}/corner-${k}.svg`);
    }
    if (/\bring\(/.test(own)) {
      for (const k of ["tl", "tr", "bl", "br"]) assert.ok(existsSync(new URL(`mods/${m}/corner-${k}.svg`, root)), `missing ${m}/corner-${k}.svg`);
    }
    json(`mods/${m}/mod.json`);
  }
});
