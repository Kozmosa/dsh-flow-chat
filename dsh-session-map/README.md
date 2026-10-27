# Session Map

A DSH Web UI bundle that draws every Session as a mind map. Sessions are nodes,
lineage is edges, and every leaf is a **blind end** you can revisit.

## What it adds

- A **Session map** entry in the sidebar panel list (`sidebar.panellist`), which
  opens a main-column canvas (`main` keyed by `session-map`).
- One node per Session, grouped into a band per Workspace. The layout runs left
  to right, oldest-first among siblings, so appending work does not reshuffle
  the map.
- Solid edges for `fork` lineage (`parentSession`) and dashed edges for
  delegation (`origin: 'subagent'`).
- **Any node can start a branch.** Every node carries a `+` control in its
  top-right corner (bright on hover or focus) that opens its branch menu: open
  the Session, or **Fork from tail** (`fork()`, the same call the turn-tail
  Branch action makes). A blind end additionally opens that menu from the node
  body itself.
- A leaf is a blind end: it gets an end cap and a `Blind end` badge. The branch
  menu of a leaf offers:
  - **Continue this session** — open it and append to the inherited trajectory;
  - **Fork from tail** — copy the full path and create a new blind end.
- Live state: a pulsing dot for running Sessions, a ring and badge for the
  Session currently retained by the main view, and a pulsing-free idle style.
- Canvas: drag to pan, wheel to zoom, drag a node to nudge it, minimap with a
  viewport rectangle, double-click empty space to start a Session in that
  Workspace's band, filter field, fit-to-view, and an optional archived view.
- Locale-aware copy (English and Simplified Chinese) and theme-token-only
  styling.

## Where the data comes from

Nothing new is stored. The Client session store already publishes each
`SessionSummary` with `parentSessionId`, `origin`, `running`, `updatedAt`,
`cwd`, and projection values; the Workspace store publishes manual
`sessionIds` order and archived ids. This bundle only projects those snapshots.

Contrary to the original idea brief's inventory, the installed Harness
(`0.2.1-rc.3`) **already writes `parentSession` in `fork()`**
(`packages/api/session-controller/src/commands.ts`, the `agents.create` meta),
so no Host change is required for lineage.

## Deliberate deviations from the brief

- **Panel placement**: the map is a main-column page reached from a sidebar
  icon, not a column inside the sidebar. The sidebar slot system has no canvas
  seat with usable height; a main panel gets the whole column and host-style
  chrome without shadowing shipped UI.
- **No `@xyflow/react`**: pan, zoom, drag, edges, and the minimap are a small
  in-file canvas. This avoids a third-party bundle dependency and keeps the
  artifact one plain JavaScript file.
- **Fork target**: the `+` branch control exists on every node, so any Session
  can start a new branch from its latest completed turn. Selecting an arbitrary
  middle `seq` stays with the shipped turn-tail Branch button, as the brief
  scoped it.
- **Archived Sessions** are hidden by default (matching the sidebar) and can be
  shown with the archive toggle; when shown they carry an `Archived` badge.

## Install

From the DSH profile, install the package directory as a bundle:

```
plugin_manager install_bundle C:\Users\27866\code\dsh-flow-chat\dsh-session-map
```

The bundle patch inserts the `session-map` row; the Client half loads with the
Web page (`dsh.client.platform: web`, `immediately: true`). A page reload picks
up a changed `client.js`.

## Rendering notes

- The world is a plain 2D CSS transform and deliberately avoids
  `will-change: transform` / `translateZ(0)`. A promoted layer is rasterized
  once and then bitmap-scaled by Chromium when zoom changes, which made
  zoomed-in text look soft on HIDPI displays. A non-promoted transform is
  re-rasterized at the new scale; pan translation is rounded to whole CSS
  pixels so glyphs do not sit on half pixels.
- Canvas drags disable text selection (`user-select: none`) so panning never
  starts a selection in the node labels.

## Tests

`node test/graph.test.mjs` exercises the pure graph model and layout: lineage
edges, leaf classification, archived filtering, cycle degradation, workspace
inheritance, band stacking, node overlap, and locale key parity.
