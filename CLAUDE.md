# CLAUDE.md — cocos-mcp-server (fork)

Project-level instructions for AI sessions working on this fork. User-facing
analysis and roadmap live in `docs/`.

## What this is

A Cocos Creator 3.8+ editor extension that exposes the editor over MCP
(Model Context Protocol) so AI assistants can drive the editor: scene/node/
component/prefab/asset operations, project build/run, debug logs, etc.

- Forked from `arnie1128/cocos-mcp-server` at v1.4.0 (commit `754adec`).
- Upstream is dormant; v1.5.0 is announced on Cocos Store but never landed on
  GitHub. We are not targeting upstream parity — we are doing an opinionated
  cleanup. See `docs/roadmap.md`.

## How to build / run

```bash
npm install        # uses preinstall.js (pre-validates env)
npm run build      # tsc → dist/
npm run watch      # tsc -w
```

The plugin lives under `<your-cocos-project>/extensions/cocos-mcp-server/`.
After build, restart Cocos Creator or reload extensions, then open
`Extensions → Cocos MCP Server`. The HTTP MCP endpoint is
`http://127.0.0.1:<port>/mcp` (default 3000).

## Architecture map

```
source/
├── main.ts                 # Editor extension entry; load/unload, IPC methods
├── mcp-server-sdk.ts       # SDK-backed HTTP MCP server (@modelcontextprotocol/sdk
│                           #   low-level Server + StreamableHTTPServerTransport)
├── lib/log.ts              # Global logger; debug gated by settings.enableDebugLog
├── lib/schema.ts           # zod helpers (toInputSchema, validateArgs, relaxJsonSchema)
├── lib/scene-bridge.ts     # runSceneMethod helper: typed wrapper around
│                           #   Editor.Message.request('scene','execute-scene-script',…)
├── settings.ts             # Server settings persistence (project settings/)
├── scene.ts                # Scene-context script run via Editor.Message 'execute-scene-script'
├── tools/                  # ToolExecutor implementations, one file per category
│   ├── scene-tools.ts             #   8 tools
│   ├── scene-advanced-tools.ts    #  23 tools
│   ├── scene-view-tools.ts        #  20 tools
│   ├── node-tools.ts              #  11 tools
│   ├── component-tools.ts         #  10 tools  (P4 T-P4-1 added add/remove/list_event_handler)
│   ├── prefab-tools.ts            #  13 tools  (P4 T-P4-3 added link/unlink/get_prefab_data)
│   ├── project-tools.ts           #  24 tools
│   ├── debug-tools.ts             #   9 tools  (v2.1.2 dropped placeholder get_console_logs)
│   ├── preferences-tools.ts       #   7 tools
│   ├── server-tools.ts            #   6 tools
│   ├── broadcast-tools.ts         #   5 tools
│   ├── reference-image-tools.ts   #  12 tools
│   ├── asset-advanced-tools.ts    #  11 tools
│   ├── validation-tools.ts        #   3 tools
│   └── tool-manager.ts            # Per-config enable/disable persistence
├── panels/                 # Vue 3 panel UI (default + tool-manager tabs)
│   └── default/
│       ├── index.ts                # Panel entry (80 lines after P4 T-P4-2)
│       └── composables/
│           ├── use-server-status.ts   # serverRunning / toggleServer / polling
│           ├── use-settings.ts        # settings + saveSettings + watch
│           └── use-tool-config.ts     # availableTools + per-tool toggles
└── types/index.ts          # Shared interfaces (ToolDefinition, ToolExecutor, …)
```

Tool wiring: `source/tools/registry.ts` `createToolRegistry()` instantiates
every category once at extension `load()`, and both `MCPServer` (in
`mcp-server-sdk.ts`) and `ToolManager` accept the same registry. Tools are
exposed as `${category}_${tool.name}` (e.g. `node_create_node`); the SDK
server registers a `setRequestHandler` for `tools/list` and `tools/call`,
filtering by `updateEnabledTools(...)` so the panel's tool-manager toggles
take effect immediately.

Total tool count today: 162 (v2.1.1 added 6 prefab/EventHandler tools;
v2.1.2 dropped 1 placeholder `get_console_logs`). Original author's v1.5.0
plan was to collapse to ~50 action-router tools. We are not committing to
that target until token cost is measured.

## Landmines (read before editing)

1. ~~**Hardcoded path `/Users/lizhiyong/NewProject_3`**~~ — fixed in P0
   (2026-04-30). `debug-tools.ts` now uses `resolveProjectLogPath()`;
   `prefab-tools.ts:readPrefabFile` uses `Editor.Project.path` directly.
   Both fail loudly when the editor context is unavailable.
2. ~~**`mcp-server.ts:fixCommonJsonIssues()`**~~ — removed in P0. Both
   `handleMCPRequest` and `handleSimpleAPIRequest` now return standard
   parse-error responses (`-32700` for MCP, 400 for REST) with the body
   truncated to 200 chars.
3. ~~**Prefab API guesswork**~~ — fixed in P1 T-P1-6 + extended in P4 T-P4-3.
   Verified against
   `node_modules/@cocos/creator-types/editor/packages/scene/@types/message.d.ts`:
   the only prefab-related channel that actually exists on the `scene` module
   is `restore-prefab`, taking `ResetComponentOptions = { uuid: string }`.
   Both fallback ladders (`establishPrefabConnection` and
   `applyPrefabToNode`) were dead code calling non-existent channels and have
   been removed; three live tools that called bogus channels
   (`load-asset` / `apply-prefab` / `revert-prefab`) have been rewritten or
   marked unsupported, and the two existing `restore-prefab` callers now pass
   the correct `{ uuid }` object instead of positional args.

   **P4 T-P4-3 (2026-05-01)**: the rest of the prefab surface lives on the
   scene facade (`scene-facade-interface.d.ts`) and is reachable only through
   `Editor.Message.request('scene', 'execute-scene-script', …)`. New
   facade-backed methods in `source/scene.ts`:
   `createPrefabFromNode` (now real, was a stub),
   `applyPrefab`, `linkPrefab`, `unlinkPrefab`, `getPrefabData`. The
   editor-side `prefab-tools.ts` now uses `runSceneMethodAsToolResponse`
   from `lib/scene-bridge.ts` for these. `update_prefab` no longer
   fail-loudly — it routes to `applyPrefab`. New MCP tools:
   `prefab_link_prefab`, `prefab_unlink_prefab`, `prefab_get_prefab_data`.

   **v2.1.3 cleanup**: the legacy hand-rolled JSON fallback path
   (`createPrefabWithAssetDB`, `createPrefabNative`, `createPrefabCustom` and
   the helpers under `createStandardPrefabContent` / `createCompleteNodeTree`,
   ~1000 lines) has been removed. The fallback was originally kept "in case
   the facade path fails on some build", but every prefab form tested in
   v2.1.1 / v2.1.2 went through the facade cleanly, and keeping a 1000-line
   shadow path that is never exercised is a maintenance trap (dead code that
   looks plausible). If the facade path turns out to fail on a specific build
   in the future, restore the legacy code from git history — see commit
   message of the removal commit for the exact pre-removal SHA.
4. ~~**`console.log` is not gated**~~ — fixed in P0 + P1 T-P1-3.
   `source/lib/log.ts` exposes `logger.{debug,info,warn,error}` plus a
   backwards-compat `debugLog` alias. All 14 tool files, `mcp-server-sdk.ts`,
   and `main.ts` now route through it; debug output gated by
   `settings.enableDebugLog`, warn/error always emit, startup banners use
   `logger.info`. Adding new logs in this codebase: prefer `logger.debug`
   for traces, `logger.info` only for startup/shutdown state.
   (P4 T-P4-2 [2026-05-01]: `source/panels/default/index.ts` was split into
   composables and now routes through `logger`; raw `console.log` is gone
   from the panel. The panel toggle for `enableDebugLog` also calls
   `setDebugLogEnabled` so panel-side debug honours the same gate as the
   host process.)
5. ~~**Double-instantiation**~~ — fixed in P1 T-P1-2. `source/tools/registry.ts`
   exposes `createToolRegistry()`; both `MCPServer` and `ToolManager`
   accept the registry through their constructors and read from the same
   ToolExecutor instances. Constructors should still stay side-effect
   free in case the registry is rebuilt in tests.
6. ~~**Hardcoded MCP protocol version `2024-11-05`**~~ — fixed in P1 T-P1-1.
   `source/mcp-server-sdk.ts` now drives the `/mcp` endpoint with the
   official `@modelcontextprotocol/sdk` low-level `Server` +
   `StreamableHTTPServerTransport` (stateful mode keyed by `mcp-session-id`).
   Protocol version is auto-negotiated; tested against `2025-06-18`.
   `tools/call` responses use structured content (T-P1-5): success →
   `structuredContent` + back-compat JSON text in `content`; failure →
   `isError: true` + error message in `content[].text`. The hand-rolled
   `mcp-server.ts` has been deleted; `source/main.ts` imports
   `./mcp-server-sdk` directly.

   Behavior change: callers must initialize before issuing other JSON-RPC
   methods on `/mcp` (per Streamable HTTP spec). The REST short-circuit
   `POST /api/{category}/{tool}` is unchanged for ad-hoc curl testing.
7. **`cce.SceneFacade.applyPrefab` returns `false` even on success**
   (verified in v2.1.1 against Cocos Creator 3.8.x). Treating its return
   as a success/failure signal is wrong; `update_prefab` now uses
   "no exception thrown" as success and surfaces the raw value as
   `data.facadeReturn` only. Same defensiveness should apply if you wrap
   any other facade methods whose return type is annotated as
   `Promise<boolean>` in `scene-facade-interface.d.ts`.
8. **`cce.Prefab.createPrefab` repurposes the source node** (verified in
   v2.1.1). The original node's UUID is invalidated; the new prefab
   instance gets a fresh UUID. `source/scene.ts:createPrefabFromNode`
   resolves it via `scene/query-nodes-by-asset-uuid` and returns it as
   `data.instanceNodeUuid`. Don't reuse the caller's `nodeUuid` after
   this call.
9. **`cc.Node.getChildByUuid` is shallow** — only direct children. Use
   `findNodeByUuidDeep` from `source/scene.ts` (depth-first walk,
   matches both `_id` and `uuid`) when looking up arbitrary scene
   nodes from scene-script context.
10. **No test runner wired up.** `source/test/*.ts` exists but is not
   invoked by any npm script. (`scripts/smoke-mcp-sdk.js` covers the SDK
   server endpoints with a stub registry — manual; runs via `node`.)
11. **Scene-script `arr.push` / `arr.splice` is NOT auto-persistent through
   `save_scene`** (verified 2026-05-01). The editor maintains two state
   layers: (a) the *runtime* cc.Node graph that scene-script mutates via
   `Editor.Message.request('scene', 'execute-scene-script', …)`, and (b)
   the *editor serialization model* that `Editor.Message.request('scene',
   'save-scene')` writes to disk. Scene-script mutations like
   `cc.Button.clickEvents.push(eh)` only update layer (a); layer (b) is
   only updated when changes flow through the editor's "set property"
   channels (`scene/set-property`, `scene/move-array-element`,
   `scene/remove-array-element`). The `Editor.Message.send('scene',
   'snapshot')` call only writes to the undo stack — **it does not
   promote runtime mutations into the serialization model**.

   The Cocos scene message API has no `insert-array-element` channel
   (only move / remove); the official way to add an array entry is
   `set-property` with the entire new array as the dump value. That
   would require constructing the IProperty dump shape from host side.

   **v2.1.2 fix (live-verified 2026-05-01)**: nudge has to run from
   **host side**, NOT inside scene-script. Calling `set-property` from
   inside scene-script doesn't propagate the model sync — the
   scene-process IPC seems to short-circuit and skip whatever bookkeeping
   is needed. The working pattern is implemented in
   `source/tools/component-tools.ts:nudgeEditorModel(nodeUuid, componentType)`:

   - keep scene-script `arr.push` / `arr.splice` (runtime instant change)
   - after `runSceneMethodAsToolResponse` resolves, host issues
     `Editor.Message.request('scene', 'set-property', { uuid: nodeUuid,
     path: '__comps__.<idx>.enabled', dump: { value: <current> } })`
   - that no-op set-property triggers layer (b) to re-pull the component
     dump from layer (a)

   Note the path shape: component property writes are addressed as
   `nodeUuid + __comps__.<idx>.<prop>`, **not** as `componentUuid +
   <prop>`. Earlier prototype passed the cc.Component's runtime UUID as
   the set-property target — that does NOT propagate. See how
   `setComponentProperty` resolves `rawComponentIndex` for the canonical
   pattern.

   Verified empirically: disk goes from 4 → 6 cc.ClickEvent entries
   after add+save (runtime had 6 because of an earlier orphaned
   mutation; save caught both up). Without the nudge, save writes the
   stale model state.

   The `_componentName` workaround (issue #16517) becomes informational
   on disk too — the scene file does NOT contain `_componentName`, yet
   runtime dispatch still finds the callback (verified 2026-05-01 with
   project.log line 40786: `[PreviewInEditor] [EhTest] onClickFromMcp
   fired EventTouch {…}`). The workaround is kept defensively pending
   more builds tested.

   Rule of thumb when adding tools that mutate component runtime state:
   mutate from scene-script then nudge from **host side** via
   `set-property` on `__comps__.<idx>.<some-prop>`. Don't try to nudge
   from scene-script (won't propagate). Don't trust `snapshot` alone for
   persistence.

   **`enabled` dump shape: keep the nested+flat dual read** (audit round-1
   fix `d5c97ef`). The dump returned by `scene/query-node` for component
   `enabled` shows up in two shapes — nested `{ enabled: { value: true } }`
   on some builds / components, flat `{ enabled: true }` on others. Both
   are real; we have hit each in real-editor testing. `nudgeEditorModel`
   reads nested first, falls back to flat. Do NOT "simplify" this to a
   single read — past simplifier suggestions to collapse the two paths
   would re-introduce the bug where disabled components get nudged back
   to `enabled: true` because the flat shape silently fell through to
   the nested-shape default.

## Conventions

- TypeScript strict; `tsc --noEmit` must pass before commit.
- Tool definitions stay in `getTools()`; execution dispatches in `execute()`.
- Scene-side code (runs inside Cocos runtime via `execute-scene-script`)
  belongs in `source/scene.ts`. Editor-host code (Node.js context) belongs
  in `source/tools/*`.
- When in doubt about an `Editor.Message` channel, check `@cocos/creator-types`
  rather than try-catch through fallback paths.
- Do not edit files in `dist/` — that is `tsc` output. The repo currently
  tracks `dist/` from the original author; treat it as build artifact, not
  source of truth.
- **Bump `package.json` `version` after every code-level change** (anything
  touching `source/`). Patch bump (`2.1.1 → 2.1.2`) for fixes / cleanup /
  refactor / single-backlog landing. Minor bump (`2.1.x → 2.2.0`) when
  adding new MCP tools or expanding public surface. Major only when asked.
  Pure docs / HANDOFF / CHANGELOG updates do **not** require a bump. If a
  session lands several code commits as a coordinated batch, bump once at
  the end of the batch — not per-commit. The reason: Cocos Creator reads
  this `version` to display the plugin version in its panel; without
  bumping, reload shows a stale string and the user can't tell whether
  the plugin actually picked up the change. After bumping, also sync
  `dist/` + `package.json` to the user's installed plugin path (the
  current path is in `docs/HANDOFF.md` §環境快速確認 — it is per-machine,
  not constant, so don't hard-code it elsewhere).

## Where to look next

`docs/` is structured into four sections:

- `docs/architecture/` — how things work today (overview, tool system).
- `docs/analysis/` — what we found wrong (code quality, upstream gap, tool inventory).
- `docs/roadmap/` — phased plan: P0 baseline fixes → P1 architecture → P2 tool consolidation → P3 protocol extensions.
- `docs/adr/` — decision records. Start with `0001-skip-v1.5.0-spec.md` for why this fork is not chasing upstream v1.5.0.

Entry point: `docs/README.md` has the full navigation tree.

## Resuming work

If you are picking this up mid-stream, **read `docs/HANDOFF.md` first**. It
records the current pause point (P1 partial), what is next, the per-file plan
for the in-flight task, and how to verify equivalence after schema changes.
The handoff is updated whenever a session ends with P-level work in progress.
