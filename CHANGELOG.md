# Changelog

## v2.1.1 — 2026-05-01

Real-editor verification of v2.1.0 P4 work surfaced four issues; this
patch addresses them and applies a UX improvement to the panel.

### Bug fixes

- **scene-script deep node lookup** (commit `41b7d9b`): `cc.Node.getChildByUuid`
  is shallow, so `resolveComponentContext` could not find a Button created
  under Canvas. Added `findNodeByUuidDeep` (depth-first walk over
  `_children`/`children`, matches both `_id` and `uuid`) and routed all
  EventHandler tools and addEventHandler's targetNode lookup through it.
- **`update_prefab` no longer treats `applyPrefab` return as success
  signal**: the facade returns `false` even on successful disk writes
  (verified by reading the prefab file before/after apply); now the tool
  reports `success: true` whenever no exception is thrown and surfaces
  the raw return as `data.facadeReturn` metadata only.
- **`create_prefab` returns the new instance node UUID**: `cce.Prefab.createPrefab`
  repurposes the source node into a prefab instance with a fresh UUID, so
  the caller-supplied `nodeUuid` is no longer valid afterwards. The scene
  facade response now includes `prefabAssetUuid` (resolved from the call
  return) and `instanceNodeUuid` (looked up via
  `scene/query-nodes-by-asset-uuid`), so subsequent tool calls can
  target the instance without a separate scan.

### UX

- **Panel default size bumped** to 720×640 (was 600×500), `min-width`
  480 (was 400), `min-height` 400 (was 300). With 163 tools, the tool
  manager tab needs more vertical room and the long property
  descriptions need wider rows to avoid heavy line-wrapping. Server tab
  layout still fits comfortably at the new minimum.

### Verified end-to-end on Cocos Creator 3.8.x

The unverified items left in v2.1.0 are now confirmed against a live
editor:

- `cc.EventHandler` is reachable via `require('cc')` in scene-script
  context; `Editor.Message.send('scene', 'snapshot')` is sufficient
  to persist add/remove (no `save-scene` required for the runtime
  array, though a save is still needed to write the scene file).
- `cce.Prefab.createPrefab(uuid, url)` accepts the `db://...` form (the
  alternate verbatim path is no longer needed but is kept as fallback).
- `applyPrefab` writes to disk on its own; no `asset-db: refresh-asset`
  follow-up is required for the apply path. (The `create_prefab` flow
  still issues a refresh as a safety net.)
- The facade resolves on `cce.SceneFacadeManager` in this build (one of
  the three candidates probed by `getPrefabFacade()`).
- The cocos-engine#16517 `_componentName` workaround did not surface as
  a problem during the live add/remove test, but is kept defensively
  since a runtime onClick dispatch was not exercised.

---

## v2.1.0 — 2026-05-01

P4 partial parity with the announced upstream v1.5.0 spec, scoped to the
items that map cleanly to official Cocos editor APIs. Detailed feasibility
audit lives at `docs/analysis/v15-feasibility.md`.

### New tools (157 → 163)

- **Prefab facade** (T-P4-3): `prefab_link_prefab`, `prefab_unlink_prefab`,
  `prefab_get_prefab_data`. `prefab_update_prefab` (apply) no longer
  fail-loudly — it now routes through the scene facade
  (`cce.SceneFacade.applyPrefab`) via `execute-scene-script`.
  `prefab_create_prefab` tries `cce.Prefab.createPrefab` first and only
  falls back to the legacy hand-rolled JSON path if the facade is
  unavailable.
- **EventHandler binding** (T-P4-1): `component_add_event_handler`,
  `component_remove_event_handler`, `component_list_event_handlers`.
  Defaults tuned for `cc.Button.clickEvents` but
  `componentType` / `eventArrayProperty` are configurable for
  `cc.Toggle.checkEvents`, ScrollView, etc. Sets both `component` and
  `_componentName` on the EventHandler to dodge cocos-engine#16517.

### Internals

- New helper `source/lib/scene-bridge.ts` (`runSceneMethod` /
  `runSceneMethodAsToolResponse`) so any tool category can reach engine
  APIs through the scene-script bridge with a single typed call.
- `source/scene.ts`: 11 → 18 exposed methods; new methods registered in
  `package.json contributions.scene.methods` whitelist.
- `source/panels/default/index.ts` refactored into composables (T-P4-2):
  `useServerStatus`, `useSettings`, `useToolConfig`. Panel entry shrank
  from 384 → 80 lines and now routes log output through `logger` instead
  of raw `console.log`. Panel-side `setDebugLogEnabled` is wired so the
  panel toggle controls panel-process debug output.

### Documentation

- `docs/analysis/v15-feasibility.md` (new): per-promise mapping of v1.5.0
  README items to their authoritative cocos-docs / `@cocos/creator-types`
  paths. Pre-records pending real-editor verification items so future
  sessions don't re-investigate.
- `docs/roadmap/05-v15-spec-parity.md` rewritten with T-P4-3 added and
  T-P4-2 narrowed.
- `docs/HANDOFF.md`, `docs/analysis/upstream-status.md`,
  `docs/roadmap/README.md`, `docs/README.md`, `CLAUDE.md` synced.

### Pending real-editor verification

The new code compiles and the offline smoke test passes, but several
behaviours need a Cocos Creator instance to confirm. They are not blockers
for the release but should be ticked off when convenient:

- `cce.Prefab.createPrefab` url shape (`db://...` vs absolute path).
- Whether `applyPrefab` triggers asset-db re-import on its own.
- Which of `cce.Prefab` / `cce.SceneFacadeManager.instance` /
  `cce.SceneFacadeManager` resolves the facade on the user's editor build.
- `cc.EventHandler` import on the scene-script side.
- `Editor.Message.send('scene', 'snapshot')` vs `save-scene` for
  EventHandler persistence.
- Whether the `_componentName` workaround for cocos-engine#16517 is
  actually needed on the user's editor build.

---

## v2.0.0 — 2026-05-01

First major release of this fork. Diverges from upstream LiDaxian/cocos-mcp-server@v1.4.0
(commit `754adec`). Upstream's announced v1.5.0 was never published; this fork is on a
separate track per ADR 0001.

### Highlights

- **Switched to the official `@modelcontextprotocol/sdk`** (low-level `Server` +
  `StreamableHTTPServerTransport` in stateful mode). Hand-rolled HTTP+JSON-RPC dispatch
  is gone; protocol version is now negotiated by the SDK (verified at `2025-06-18`).
- **Structured tool responses** (T-P1-5). `tools/call` results now branch on
  `ToolResponse.success`: success → `structuredContent` plus a JSON-stringified text
  for back-compat; failure → `isError: true` with the error message in text content.
- **All 157 tools migrated to zod** (T-P1-4). Schema definitions dropped from ~3200
  lines to ~1100; schemas double as runtime arg validators. `relaxJsonSchema` helper
  in `source/lib/schema.ts` smooths over zod 4 vs hand-written conventions
  (`additionalProperties: false`, `.default()` vs `required`).
- **Single tool registry instance** (T-P1-2). `MCPServer` and `ToolManager` share the
  same `createToolRegistry()` output instead of double-instantiating every tool class.
- **Global logger** (T-P1-3). `source/lib/log.ts` exposes
  `logger.{debug,info,warn,error}` plus a back-compat `debugLog` alias. Debug
  output is gated by `settings.enableDebugLog`; warn/error always emit.
- **Prefab Editor.Message channels verified** (T-P1-6). Two fallback ladders that
  called non-existent channels (`apply-prefab`, `revert-prefab`, `connect-prefab-instance`,
  etc.) were dead code; replaced with the single channel that actually exists
  (`scene/restore-prefab` taking `{ uuid }`). Removed ~250 lines of guessed-API code.
- **Server lifecycle hardening**. Idle session sweep (30 min default),
  `httpServer.closeAllConnections()` on stop, `updateSettings()` reentry guard.
- **Panel checkbox fix** (B-001). `<ui-checkbox v-model>` doesn't bind to Cocos
  custom elements; replaced with `:value` + `@change` for the autoStart and
  debugLog toggles. Side-fixed a field-name mismatch where `saveSettings()` was
  silently dropping the debug-log setting.

### Breaking changes

- **Clients must `initialize` before other JSON-RPC methods on `/mcp`**, per Streamable
  HTTP spec. The previous hand-rolled server accepted bare `tools/list` calls; the new
  one returns `400 Bad Request: No valid session ID provided`. Modern MCP clients
  (Claude Desktop, Cursor, Cline) already do this. The REST short-circuit
  `POST /api/{category}/{tool}` is unchanged for ad-hoc curl testing.
- **Hardcoded `protocolVersion: '2024-11-05'` is gone**. Protocol version is now
  negotiated; clients receive whatever is mutually supported.

### Tooling

- `scripts/smoke-mcp-sdk.js` — offline smoke test (stub registry, 2 tools).
- `scripts/live-test.js` — 59-check live test against a running editor (read across
  14 categories, write flows for nodes/components/sceneAdvanced/sceneView/prefab,
  scene-switch with restore guard).

### Code review

This release went through a three-way review (Codex / Gemini / self) with two
iterations. Findings and fixes are documented in commit `63d5b9e`.

---

Original work © LiDaxian (upstream `cocos-mcp-server` v1.4.0). Fork modifications
© 2026 shang. Both released under the project's existing license.
