// The slice of the `herdr` module the mods use, with state a test can set.
export const store = new Map();
export const state = { agents: [], active: true, tree: null, runs: [] };
export const shared = (key) => store.get(key);
export const setShared = (key, value) => { store.set(key, value); };
export const theme = () => ({ border: "#22242e" });
export const agents = () => state.agents;
export const spaces = () => [];
export const window = () => ({ active: state.active, platform: "macos" });
export const layout = () => structuredClone(state.tree);
export const run = (name, args) => { state.runs.push([name, args]); if (name === "layout.set") state.tree = structuredClone(args.layout); };
export const nextCommand = () => new Promise(() => {});
