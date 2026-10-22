---
name: visualize
description: "Add a correct, minimal visual to a lesson — a diagram or geometric picture — that renders inline in the DSH chat and the lesson log. Use when an idea is genuinely clearer as a picture: a dependency graph, system/flow, sequence, state machine, tree, comparison, or a spatial/geometric thing (coordinate geometry, number line, vectors, a plot, a physical layout). Outsources authoring+rendering to a maker subagent that verifies the image by looking at it, then you embed the returned file."
---

# Visualize

A picture earns its place only when it shows something words can't — shape, structure, direction, relationship, geometry. This skill produces ONE such picture, guarantees it is **correct** (the maker renders it and looks at it before returning), and drops it into the lesson so it renders inline in the DSH chat and the lesson-log mirror.

You are the **creative director**. You decide the exact idea and distill it to its fewest carrying elements. A **maker subagent** does the authoring, rendering, visual verification, and saving, then returns a filename. You embed that filename in your reply.

## When to visualize (and when not to)

This teaching system builds a **dependency graph in the learner's head** — axioms at the root, derived facts hanging off them. A visual is powerful exactly when it makes that structure (or a geometry) visible. Reach for one when:

- The idea is a **structure or relationship**: dependencies, a system with parts and arrows, a flow/pipeline, a sequence of exchanges, a state machine, a tree/hierarchy, a comparison, a containment (what's inside vs outside).
- The idea is **spatial or geometric**: coordinate geometry, a number line, vectors, a function's shape, a physical arrangement.

Do NOT visualize when prose or a single equation already carries it. A decorative diagram that just restates the sentence next to it adds noise and a chance to be wrong. When in doubt, don't — a missing visual is cheaper than a false one.

## Choose the maker

Two makers, dispatched as subagents with the prompt templates in this skill's `references/` directory:

- **mermaid-maker** (`references/mermaid-maker.md`) — structural/relational visuals: dependency graphs, flowcharts, sequence/state/ER/class diagrams, trees, mindmaps, timelines. This is the default and fits the dependency-graph pedagogy directly.
- **svg-maker** (`references/svg-maker.md`) — spatial/geometric visuals Mermaid can't lay out: exact coordinates, geometry figures, number lines, vectors, plots, custom shapes.

Rule of thumb: if it's *nodes-and-edges / relationships*, use mermaid-maker. If it's *positions-and-shapes / geometry*, use svg-maker.

## Brief the maker well: one idea, fewest elements

The most common failure is **cramming** — every extra label makes the picture harder to read AND harder to lay out correctly. Before briefing, prune to the fewest elements that carry the idea, and for each ask: *"if I delete this, is the idea still clear?"* If yes, delete it.

Give the maker the concept AND the concrete elements you want — not a vague topic, and not a long checklist.

- BAD: "make a diagram about how TCP works"
- GOOD: "graph TD: a node 'packet' at the top; arrows down to 'ordering' and 'retransmit on loss'; both arrows down into 'reliable stream'. No title. Show that reliability is built FROM packets, not alongside them."

Keep the idea intact but trust the maker to compose; if your brief lists more than ~5–7 elements, cut it first.

## Invoke

DSH has no named agent registry. Dispatch a maker with the `subagent` tool: read the template file for the chosen maker, replace the placeholders listed below, and pass the completed prompt as the `prompt` argument with a short `description` (e.g. "Mermaid diagram: TCP dependency graph").

| Placeholder | Replace with | Applies to |
|---|---|---|
| `{BRIEF}` | Your minimal, concrete brief (see above) | both makers |
| `{WORKDIR}` | The project directory the `viz/` folder lives in (default: the session working directory) | both makers |
| `{MMDC_DIR}` | The installed plugin package root — the directory whose `node_modules/` vendors `mmdc` (see below) | mermaid-maker only |

Deriving `{MMDC_DIR}`: the plugin vendors the mermaid renderer (`@mermaid-js/mermaid-cli`) as an optional dependency, and the mermaid-maker template probes `{MMDC_DIR}/node_modules/.bin/mmdc` as its fallback level. Take the resource base you read the template from (the skill's directory inside the installed plugin package, i.e. `<plugin-root>/skills/visualize/`) and go up two levels to get `<plugin-root>`. If no resource base is available (e.g. you loaded the template by hand), fall back to deriving it from the template file's own path: strip the trailing `skills/visualize/references/mermaid-maker.md` and use the remainder as the plugin root. If neither derivation is possible, leave `{MMDC_DIR}` unreplaced — the maker treats the vendored copy as not found and falls back to PATH probing.

The maker authors the source, renders it to a PNG, **looks at the PNG and iterates until it is correct and clean** (using `bash` to render, `read_image` to inspect), publishes it into the project's `viz/` folder with a unique filename, and returns:

```
RESULT:
filename: viz-<slug>-<timestamp>.png
path: <cwd>/viz/viz-<slug>-<timestamp>.png
```

If it returns `RESULT: NONE`, it couldn't make a correct picture of the brief — simplify or rethink, or decide the visual isn't worth it. If it returns an `UNAVAILABLE` report, a render dependency is missing (see the plugin README for install instructions); don't retry the same maker until the dependency is installed. Never hand-author or fake a diagram yourself; correctness depends on the maker's render-and-inspect loop.

## Embed it in the lesson

Put the embed directly in your teaching reply, using standard markdown image syntax with the returned path relative to the project root:

```
![<short description>](viz/viz-<slug>-<timestamp>.png)
```

That's all. The DSH chat renders standard markdown images, and the lesson-log mirror carries the same reference into the linked `.md` file (the maker saves into the project's `viz/` folder), so it renders wherever the file is read from the project. Introduce the visual in a sentence, then let it carry the idea — don't narrate every element back in prose.

## Why this is reliable

- The maker never returns a picture it hasn't **looked at**, so "renders fine but says something false" is caught before it reaches the learner.
- PNG embed means **what the maker verified is pixel-identical to what the learner sees** — no re-render drift.
- Unique filenames keep embed resolution unambiguous.

> The mermaid renderer is vendored with the plugin (`@mermaid-js/mermaid-cli` as an optional dependency; the maker probes a user's global `mmdc` first, then the vendored copy) and drives a Chrome/Chromium — bundled when the install fetched one, otherwise the system browser. SVG renders via `rsvg-convert` (fallback `magick`), a system binary. Each maker checks its chain first (smoke render as the final arbiter) and reports clearly when it's missing — a missing renderer points at the plugin's dependency install, a missing browser at browser installation. You don't render anything yourself — you only brief the maker and embed the file it returns.
