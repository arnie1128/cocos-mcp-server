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
│   ├── node-tools.ts              #  12 tools
│   ├── component-tools.ts         #  11 tools  (P4 T-P4-1 added add/remove/list_event_handler)
│   ├── prefab-tools.ts            #  11 tools  (v2.1.4: dropped dead duplicate_prefab; merged link_prefab+unlink_prefab → set_link)
│   ├── project-tools.ts           #  24 tools
│   ├── debug-tools.ts             #  24 tools  (v2.3.0 net +3: execute_javascript/screenshot/batch_screenshot — execute_script kept as compat alias not net-new; v2.4.8 +wait_compile/run_script_diagnostics/get_script_diagnostic_context; v2.6.0 +game_command/game_client_status; v2.7.0 +preview_url/query_devices/capture_preview_screenshot; v2.8.0 +preview_control; v2.8.3 +get_preview_mode; v2.9.0 +check_editor_health/+set_preview_mode)
│   ├── preferences-tools.ts       #   7 tools
│   ├── server-tools.ts            #   6 tools
│   ├── broadcast-tools.ts         #   5 tools
│   ├── reference-image-tools.ts   #   1 tool   (v2.9.x macro-routing collapse: 12 → 1, single op-router referenceImage_manage)
│   ├── asset-advanced-tools.ts    #  11 tools
│   ├── validation-tools.ts        #   3 tools
│   ├── inspector-tools.ts         #   2 tools  (v2.4.0 step 6 — get_instance_definition / get_common_types_definition)
│   ├── asset-meta-tools.ts        #   3 tools  (v2.4.3 — list_interpreters / get_properties / set_properties)
│   ├── animation-tools.ts         #   4 tools  (v2.4.8 A2)
│   ├── file-editor-tools.ts       #   4 tools  (v2.5.0 — insert_text / delete_lines / replace_text / query_text)
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

Total tool count today: 179 (v2.9.x collapsed 12 referenceImage_* tools
into 1 op-router `referenceImage_manage`; v2.9.0 added 2:
`debug_check_editor_health` + `debug_set_preview_mode`; v2.8.3 added 1:
`debug_get_preview_mode`; v2.8.0 added 1: `debug_preview_control`;
v2.7.0 added 3: `debug_preview_url` / `debug_query_devices` /
`debug_capture_preview_screenshot`; v2.6.0 added 2 debug tools —
`debug_game_command` and `debug_game_client_status`; v2.5.0 added
file-editor 4 tools; v2.4.8 added 7 across A1/A2 categories; v2.4.3
added 3 assetMeta; v2.4.0 added 4 inspector/setter; v2.1.1 added 6
prefab/EventHandler; net of two drops in v2.1.2 / v2.1.4). 18
categories. Original author's
v1.5.0 plan was to collapse to ~50 action-router tools; we are not
committing to that target until token cost is measured (P2 closed at
v2.1.6 after measure showed lossy-only gains).

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
10. **No test runner wired up.** `source/test/*.ts` was deleted in v2.1.6
   (4 files, 699 lines, never invoked by any npm script; `mcp-tool-tester.ts`
   even still used WebSocket which P1 retired). Smoke / live testing now
   lives in `scripts/`:
   - `scripts/smoke-mcp-sdk.js` — SDK server endpoints with a stub
     registry; manual `node` run; covers init / list / call success /
     call failure / REST short-circuit.
   - `scripts/live-test.js` — exercises representative tools per category
     against the live editor extension at `:3000`; wraps writes in
     try/finally so editor state restores on exit. Manual.
   - `scripts/measure-tool-tokens.js` — P2 token measurement; rerun for
     regression checks against current schema vs router-A/B simulations.
   When adding new test coverage, prefer scripts under `scripts/` over
   re-introducing `source/test/`.
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

   The `_componentName` workaround for cocos-engine #16517 was removed
   in v2.1.3 after a clean A/B test (2026-05-01): with the line
   `(eh as any)._componentName = componentName` deleted, a fresh
   `add_event_handler` → `save_scene` → preview-click flow on a
   `db://assets/test-mcp/a-test.scene` TestBtn still fired
   `onClickFromMcp` (project.log: `[PreviewInEditor] [EhTest]
   onClickFromMcp fired data=a-test`). The disk file never carried
   `_componentName` anyway (the editor's serialization model rejects
   it), so the in-memory assignment was always dropped on save+reload.
   Don't re-introduce it.

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

   **Scalar property writes do NOT need the nudge** (verified v2.1.5).
   `set-property` on `__comps__.<idx>.<scalar>` paths (e.g. `layer`,
   `sizeMode`, `cameraComponent`, simple primitive props) propagates to
   the serialization model immediately, no nudge required. The nudge
   pattern is specifically for **array-element insert / splice** done
   from scene-script. Don't blanket-apply `nudgeEditorModel` to every
   write — it's only required when the layer (a) mutation is an array
   length change that the editor's set-property channel didn't see.

12. **Asset-DB write channels can pop a confirmation dialog and ignore
   your `overwrite` flag** (verified v2.1.5 via `save_scene_as`). The
   `asset-db: copy-asset` / `move-asset` / `create-asset` channels each
   detect target collisions internally; on collision, cocos pops a
   *native confirm dialog* and **blocks the IPC reply until the user
   clicks**, regardless of whatever `overwrite: false / true` you passed.
   This was the root cause of the v2.1.4 `save_scene_as` >15s timeout
   (user not at the keyboard → never confirmed → tool hung).

   Mitigation pattern: **pre-check uuid collision from host side** before
   issuing the write. `save_scene_as` (commit `d36221e`) is the canonical
   example:

   ```ts
   const targetUuid = await Editor.Message.request('asset-db', 'query-uuid', targetUrl);
   if (targetUuid && !args.overwrite) return error('target exists');
   if (targetUuid && args.overwrite) await deleteAsset(targetUuid);
   await Editor.Message.request('asset-db', 'copy-asset', { src, target });
   ```

   Apply the same pre-check to any new tool that wraps `copy-asset` /
   `move-asset` / `create-asset`. Don't trust the channel's own
   `overwrite` parameter — it's a no-op against the dialog. Always
   explicit-delete-then-write or fail-fast on collision from your code.

13. **`debug_execute_javascript(context='editor')` opt-in has two distinct
   layers** (added v2.3.0 / hardened v2.3.1). Once `enableEditorContextEval`
   is opted in, AI-produced code runs through `(0, eval)` in the editor host
   process — same trust level as Cocos editor itself.

   - **Runtime flag layer** — `setEditorContextEvalEnabled` is a per-process
     module flag. v2.3.1 wired `updateSettings()` to re-apply it on every
     settings change, so the panel toggle takes effect immediately. Disable
     in panel = next eval call rejected. **Reversible at the runtime level.**
   - **Persisted state layer** — the eval'd code can `require('fs')` and
     write to `<project>/settings/mcp-server.json` while it's allowed to
     run. If it sets `enableEditorContextEval: true` there, the persisted
     value is what `readSettings()` will return on next launch / reload.
     User's later panel toggle disables runtime eval, but **the on-disk
     setting may have been edited and persists**. Auditing what the AI
     wrote requires opening the settings JSON manually. **Not automatically
     reversible at the persisted layer.**

   Other implications of the opt-in:

   - The eval'd code can `require('@cocos/creator-types')` etc. and call
     any `Editor.Message` channel — equivalent to having unsigned editor
     extension privileges.

   Rule of thumb: **only enable when the upstream prompt source is
   trusted for that whole session** (your own typing, not piped from
   issues / chat / web). Default `false` in `DEFAULT_SETTINGS`. Don't
   add tools that programmatically flip this flag — the opt-in is meant
   to be a deliberate human gesture in the panel UI.

14. **Cocos scene dirty flag is cumulative and not programmatically
    clearable** (verified v2.4.7 / 2026-05-03). The cocos editor
    tracks every `set-property` / `create-node` / `remove-node` /
    `paste-node` etc. as a discrete operation in its undo stack. The
    "scene dirty" state is the union of all those ops since last
    save — it does NOT diff against on-disk state, so a strict
    `create-node` → `remove-node` round-trip leaves the scene marked
    dirty even though net node count is unchanged.

    **No discard channel exists**. `scene/@types/message.d.ts` only
    exposes `query-dirty`; there is no `clear-dirty`, `discard`,
    `revert`, or equivalent. `scene-facade-interface.d.ts` only
    exposes `querySceneDirty`. The only paths back to a clean state:

    - `save_scene` (writes to disk; changes file mtime + may rewrite
      cocos's serialization variance even when content is unchanged)
    - User clicks "Discard changes" in the cocos modal (manual)
    - Close + reopen the project (manual)
    - `open-scene` to a different scene + accept the modal (manual)

    Implications for AI tool design:

    - `scene_open_scene`, `scene_close_scene`, and any other tool
      that triggers cocos's "save unsaved changes?" modal will
      **block the IPC reply until the user dismisses the modal**
      whenever the current scene has cumulative dirty state. This is
      the same blocking pattern as landmine #12 (asset-db dialogs),
      different channel.
    - AI workflows that "create scratch state, then switch scenes"
      are inherently dialog-prone. Either save first explicitly, or
      isolate scratch work to a throwaway scene that you opened
      first.
    - Test harnesses (`scripts/live-test.js`) should query dirty
      RIGHT BEFORE any scene-switch step, not once at startup, so
      they can skip / save / discard before tripping the modal. The
      v2.4.7 live-test fix (`ebab029` + this entry) does this; copy
      the pattern for any future write-flow + scene-switch test.
    - There is no clean automated "flush dirty without writing to
      disk" path. If a future need arises, the only known
      workaround is `cce.SceneFacade` low-level reload via
      `execute-scene-script`, but that's both unverified and a
      sledgehammer.

15. **Gemini-compat: keep zod 4 + `target: 'draft-7'` for inline
    schemas** (verified v2.6.0 / 2026-05-03). Gemini's tool-call parser
    rejects JSON Schema `$ref` / `$defs` / `definitions` — Claude /
    OpenAI accept them, so the bug is silent until a Gemini client
    issues `tools/list`.

    cocos-cli (270+ stars, official) hits this exact problem and
    works around it via `mcp.middleware.ts:218` middleware that
    re-converts zod schemas to inline JSON Schema 7. They use the
    older `zod-to-json-schema` package which produces `$ref` for
    reused subschemas by default.

    **We don't need that middleware** because `source/lib/schema.ts`
    `toInputSchema()` calls **zod 4's built-in**
    `z.toJSONSchema(schema, { target: 'draft-7' })`, which inlines
    reused subschemas (verified empirically: same `vec3` instance used
    3× in `position`/`rotation`/`scale` produces three full inline
    copies, no `$ref`). All 179 v2.9.x tool schemas are confirmed
    inline.

    Regression guard: `node scripts/check-gemini-compat.js` walks
    every tool's `inputSchema` and fails if any contains `$ref` /
    `$defs` / `definitions`. Run after `npm run build` whenever
    touching `lib/schema.ts`, the zod dep, or any hand-rolled
    `inputSchema`. Adding this to CI would catch silent regressions.

    What would re-introduce the bug:
    - Downgrading zod to v3 (different `toJSONSchema` semantics).
    - Switching from `target: 'draft-7'` to `target: 'draft-2020-12'`
      (the default for some zod versions emits `$defs`).
    - Hand-writing `inputSchema` literals that contain `$ref` (e.g.
      copying schemas from external doc tools).
    - Adopting the `zod-to-json-schema` npm package (different from
      zod's built-in `toJSONSchema`).

16. **`changePreviewPlayState(true)` triggers cocos's own
    `softReloadScene` race in cocos 3.8.7, freezing the editor —
    affects ALL preview modes (embedded / browser / simulator)**
    (verified v2.8.4 / 2026-05-02 against cocos 3.8.7).

    Originally identified in embedded mode during v2.8.3 retest;
    v2.8.4 retest confirmed the same race fires in **browser
    mode** too — same call stack, same "Failed to refresh"
    warning, same Ctrl+R recovery requirement. The race is
    inside `changePreviewPlayState` → `softReloadScene` itself,
    not gated by preview destination. Treat as cocos-engine-wide
    bug applicable to any `preview_control(start)` call.

    Reproduced live during v2.8.3 retest (embedded mode) and
    v2.8.4 retest (browser mode), both with identical stack:
    ```
    SceneFacadeManager.changePreviewPlayState
     → SceneFacadeFSM.issueCommand
      → PreviewSceneFacade.enter
       → PreviewSceneFacade.enterGameview
        → PreviewPlay.start
         → SceneFacadeManager.softReloadScene (THROWS)
         → "Failed to refresh the current scene"
    ```

    Immediately followed by:
    ```
    [Scene] The json file of asset 1777714366991.18521454594443276
            is empty or missing.
    ```

    The placeholder asset name `Date.now() + '.' + Math.random()` is
    cocos's own format for temporary serialization placeholders.
    What appears to be happening: when in **embedded preview** mode
    (`preview.current.platform === 'gameView'`), `enterGameview`
    serializes the in-memory scene to a temp build artifact under
    `<project>/build/preview/`, then `softReloadScene` reads it back —
    but the writer hasn't finished, so the reader sees an empty file.
    Race condition inside cocos's own preview pipeline.

    Symptoms the user sees:
    - `debug_preview_control(start)` returns `success: true` but
      `data.warnings[]` carries the "Failed to refresh" entry
    - `PIE` window does not actually start
    - cocos editor freezes (spinning indicator), no UI response
    - Cascading errors when user clicks anything (e.g.
      `Node with UUID … is not exist!` from camera focus)
    - **Recovery requires Ctrl+R** in the cocos editor to restart
      the scene-script renderer process

    What the tool layer does (v2.8.3):
    - `debug_preview_control` scans capturedLogs for the warning,
      lifts it to `data.warnings[]` and prepends ⚠ + recovery hint
      ("Common workaround: ensure scene is saved via
      `scene_save_scene` before calling preview_control(start);
      if cocos editor freezes after this call, press Ctrl+R in the
      editor to recover").
    - The tool description points users at `debug_get_preview_mode`
      so AI can detect embedded mode and weigh the freeze risk.

    What we cannot fix from outside cocos:
    - The race itself lives in `.ccc` bundle code under
      `app.asar/builtin/scene/dist/script/3d/...` — closed-source
      cocos engine code.
    - There is no documented "wait for preview build settle" channel.
    - `Editor.Message.send('scene', 'reload')` etc. don't exist.

    Practical guidance for AI workflows:
    - Saving the scene (`scene_save_scene`) before calling
      `preview_control(start)` lowers but does NOT eliminate the
      risk. The freeze observed in v2.8.3 retest happened despite
      a save executing 3 seconds prior.
    - For visual verification under embedded mode, prefer:
      `debug_capture_preview_screenshot(mode='embedded')` while in
      EDIT mode (no PIE start needed) — the gameview shows scene
      content for many cases.
    - For runtime / play-state visual verification, prefer the
      `debug_game_command(type='screenshot')` route through a
      `GameDebugClient` running in a browser preview
      (`debug_preview_url(action='open')`) — that path uses the
      runtime canvas directly and avoids the editor-side
      softReloadScene race entirely.
    - If `preview_control(start)` is required and the editor
      freezes, document the recovery (Ctrl+R) for the human user;
      do NOT add automatic Ctrl+R-equivalent IPC calls — there is
      no clean editor-side equivalent and forcing a renderer
      reload from outside risks losing unsaved state worse than
      the freeze itself.
    - **`debug_check_editor_health` does NOT reliably detect this
      freeze** (verified v2.9.1 retest). The `getCurrentSceneInfo`
      probe inside `runSceneMethodAsToolResponse` returned
      `sceneAlive: true` with 1ms latency even when the user
      reported the cocos editor was visibly frozen and required
      Ctrl+R to recover. Hypothesis: `getCurrentSceneInfo` reads
      cached `director.getScene()` state without going through
      the wedged code path, so it doesn't probe deep enough.
      The probe needs a different path that exercises whichever
      part of scene-script is actually hung. Pending reference-
      project comparison to identify a more sensitive probe.

17. **`preferences/set-config 'preview' …'current.platform'`
    silently no-ops on cocos 3.8.7** (verified v2.9.1 retest /
    2026-05-02).

    `query-config 'preview'` returns the active mode at
    `preview.current.platform` (e.g. "browser" / "gameView" /
    "simulator"). The symmetric write through
    `Editor.Message.request('preferences', 'set-config', 'preview',
    <key>, <value>, [protocol])` returns truthy but does not
    actually persist the value — read-back after the write still
    shows the old mode.

    v2.9.1 `debug_set_preview_mode` probes four shapes and
    verifies each with a fresh read-back; all four fail on
    cocos 3.8.7:

    | Strategy | setResult | observedMode |
    |---|---|---|
    | `('preview','current',{platform:value})` | `true` | unchanged |
    | `('preview','current.platform',v,'global')` | `true` | unchanged |
    | `('preview','current.platform',v,'local')` | `true` | unchanged |
    | `('preview','current.platform',v)` | `true` | unchanged |

    Hypotheses for why none works:
    - cocos may treat `preview` as a readonly preference category
      that only the cocos UI dropdown can write
    - `current.platform` may be a runtime-derived field, not a
      stored pref — the actual selector lives elsewhere (project
      profile? open-preview-with action?)
    - set-config requires a non-typed protocol parameter we
      haven't found

    Practical guidance:
    - The setter currently surfaces all 4 attempt results in
      `data.attempts` for diagnostics — it doesn't lie about
      success.
    - For AI workflows that need to switch preview mode, route
      the user to the cocos preview dropdown manually until a
      working shape is found.
    - v2.9 spillover candidate: compare against reference projects
      (harady / RomaRogov / cocos-cli / FunplayAI / Spaydo /
      cocos-code-mode) to see if any of them ship a working
      preview-mode setter.

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
- **`releaseDate` format**: ISO 8601 datetime with UTC+8 offset
  (e.g. `"2026-05-02T02:03:21+08:00"`). The cocos plugin schema does not
  validate this field — it is a free-form string shown in the cocos panel.
  Bump it together with `version`. Date-only `"YYYY-MM-DD"` (the upstream
  convention) loses ordering info when multiple bumps land same day.
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

### Three-way review workflow for large changes

Project-level extension of global §Post-Development Review. Triggers
**three-way parallel review + patch loop** when a single commit (or
coordinated batch) meets any of:

- New MCP tool, resource, or capability (touches public protocol surface)
- Refactor that migrates ≥ 5 tool files / ≥ 200 LOC of `source/`
- New host-side `eval` / fs write / IPC injection path
- Anything that requires a **minor** version bump

Skip for: typo fixes, single-line bugs, comment edits, pure docs.

**Procedure** (canonical reference: 2026-05-02 v2.3.0 → v2.3.1 cycle):

1. Land the main commit (with version bump + dist sync) and push to
   origin/main.
2. Dispatch three reviewers **in parallel**, each in isolated context
   so opinions are independent:
   - Claude — `Agent` tool with `general-purpose` subagent type
   - Codex — `Agent` tool with `codex:codex-rescue` subagent type
   - Gemini — `Bash` tool piping `git show <sha>` into `gemini -p "..."`
   Each reviewer gets: commit SHA, the focus areas (security /
   correctness / regression / edge cases), and instructions to group
   findings as 🔴 must-fix / 🟡 worth-considering / 🟢 looks good with
   file:line + concrete fix.
3. Consolidate findings. If any 🔴 must-fix or any 🟡 worth-considering
   that ≥ 2 reviewers raised → fix.
4. Apply fixes in a separate **patch bump commit** (e.g. `v2.3.1`).
   Do not amend the main commit — keeping the patch commit isolated
   makes the review trail auditable and gives a clean rollback anchor.
5. Re-run all three reviewers against the patch commit. Each must
   verify (a) every original finding is correctly addressed and (b) no
   new bugs introduced.
6. Loop if reviewers find new issues. Each loop iteration = another
   patch bump (`v2.3.1` → `v2.3.2` → …).
7. Push only when all three reviewers return 🟢 ship-it on the latest
   commit.
8. Update HANDOFF §三方 review 紀錄 with the issue list (consensus
   findings + which reviewers caught what) so the audit trail is
   discoverable in the next session.

**Why this workflow exists**: codex / claude / gemini have
non-overlapping blind spots. v2.3.0 review demonstrated this — codex
caught the `updateSettings()` flag-not-reapplied gap that gemini
missed, gemini caught the CRLF/BOM issue that claude initially missed,
claude caught the missing landmine doc and array-length cap. No
single reviewer would have produced the consolidated issue list.

**Cost discipline**: don't run this for every commit. Three-way review
takes ~2-5 minutes per round + cost. For routine changes the global
§Post-Development Review (single external pass) is enough.

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
