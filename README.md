# SPREAD

A personal vision map for Windows and the web, implemented from [the V1 product specification](docs/SPREAD-V1.md).

## Run

Use Node.js 22.13 or later on Windows.

```powershell
npm.cmd install
npm.cmd run dev
```

Open the local URL printed by the server. For a production build:

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run lint
npm.cmd run build
npm.cmd start
```

## Windows app

Open the hosted application in Edge or Chrome, then select **Install SPREAD** in the map menu when offered, or use the browser's install-app action. It runs in a standalone window. No native installer is required. Offline installation requires an initial successful online load of the production build.

## Interaction

- Double-click the canvas to add a node. Enter commits text; Escape cancels an empty creation.
- `+` on a normal node makes an outgoing PATH. On a Goal it adds an incoming contributor.
- Drag a node to move its downstream PATH. Ctrl+click or marquee explicitly selects exactly what moves.
- Drop onto another node to preview and change the branch attachment. Invalid drops do not commit.
- **More → Connect** connects existing objects. Select a line to reverse it, change PATH/RELATED, or delete it.
- Use **Details** for notes, width, image crop, full Imagination contents and seed editing.
- Drag a seed to the canvas, a node, or another box. Keyboard conversion is available in Details.
- `Ctrl+F` searches content; `F` focuses a selected node. Wheel or pinch zooms; Space+drag pans.
- `Ctrl+Z`, `Ctrl+Shift+Z`, `Ctrl+C/V/D` support history and selection duplication.

## Data and architecture

React/Vinext, TypeScript, SVG edges, DOM canvas objects, IndexedDB maps and image assets. Local storage maintains a synchronous text recovery copy. Graph operations are pure and undo transactions contain both layout and semantic state. Images are resized to thumbnails; originals are loaded in the viewer. The central anchor is independent of PATH semantics.

Data belongs to the current browser profile and origin. There is no cross-device server synchronization. Export a `.spread.json` backup from the map menu before changing browsers, devices, or clearing browser storage. Asset records remain available to undo and duplicate operations; they are not immediately hard-deleted.

## Validation and limits

Automated domain tests cover graph constraints, reconnect-on-delete, branch reparenting, copying, seed capacity and conversion. TypeScript, production compilation and source lint checks are included. Generated UI primitives are excluded from application lint rather than altered. Local thumbnails and the spatial canvas have documented lint exceptions.

Browser interaction, installability, offline reopen, and the 60 FPS target still require real-device acceptance testing. WebMCP is feature-detected; its runtime contract has not been verified in a supported browser context. Seed motion uses deterministic layout and a short gravity-like settle animation, rather than a general-purpose physics simulation.
