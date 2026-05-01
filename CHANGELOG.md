# Changelog

## v2.4.0 — 2026-05-02

6-step architecture refactor + InstanceReference + TS class definition
generator. **No user-facing tool removed**; all v2.3.1 tools keep their
original schemas and behaviour. Net change: +4 tools, +3 lib helpers,
+1 decorator, +1 inspector category. See
`docs/roadmap/06-version-plan-v23-v27.md` §v2.4.0 for the spec.

### Step 1 — declarative ToolDef array

Collapsed the per-file three-layer pattern (`*Schemas` map +
`*ToolMeta` map + `class { execute() switch }`) into a single
declarative `ToolDef[]` per category. Adds `source/lib/define-tools.ts`
with `defineTools(defs)` and the per-tool `defineTool({...})` helper.
Migrated all 14 existing tool files; tool count and behaviour
unchanged. New tools are now a single object literal.

### Step 2 — `lib/resolve-node.ts` (nodeUuid | nodeName)

Tools opt-in to accepting `nodeName` as a fallback when `nodeUuid` is
omitted. `resolveOrToolError()` returns a `ToolResponse` so handlers
early-return cleanly. Applied to four high-traffic mutators
(set_node_property / set_node_transform / add_component /
set_component_property).

### Step 3 — `lib/batch-set.ts` + plural property tools

`batchSetProperties(uuid, [{path, value}])` runs `scene/set-property`
concurrently; partial failures reported per entry. New tools:

- `node_set_node_properties` — true single-round-trip multi-property
  write on a node (supports `__comps__.<idx>.<prop>` paths too).
- `component_set_component_properties` — multi-property write on the
  same component, sequential through `set_component_property` to
  share index resolution and sprite preserveContentSize handling.

### Step 4 — InstanceReference `{id, type}` (opt-in)

Adds `source/lib/instance-reference.ts` with `instanceReferenceSchema`
and `resolveReference()`. The same six tools now accept three input
forms in precedence order: `reference={id,type}` → `nodeUuid` →
`nodeName`. Existing 159 tools keep their bare-UUID schemas; wider
migration deferred to v2.5+ patches.

### Step 5 — `@mcpTool` decorator

Adds `source/lib/decorators.ts`. Stage-2 method decorator captures
metadata via `descriptor.value` (no reflect-metadata polyfill).
`defineToolsFromDecorators(this)` wires decorated methods into a
`defineTools`-compatible executor. tsconfig already had
`experimentalDecorators: true`.

### Step 6 — `inspector_get_instance_definition`

New `inspector` tool category (uses the @mcpTool decorator):

- `inspector_get_instance_definition`: walk `scene/query-node` dump
  for an InstanceReference and emit a TypeScript class declaration.
  AI reads this BEFORE writing properties — fixes the "AI guesses
  property names" failure mode. Recognises primitives, cc value types
  (Vec2/3/4, Color, Rect, Size, Quat, Mat3/4), arrays, and reference
  types (wrapped in `InstanceReference<T>`).
- `inspector_get_common_types_definition`: hardcoded TS for cc value
  types so the instance definition's references resolve.

Implementation is a basic walk per spec; enum/struct hoisting and
per-attribute decorators (min/max/unit) deferred to later patches.

### Tool count

15 categories / 167 tools (was 14 / 163). +4 new tools:
`node_set_node_properties`, `component_set_component_properties`,
`inspector_get_instance_definition`,
`inspector_get_common_types_definition`.

### Verification

- `npm run build` tsc clean
- `node scripts/smoke-mcp-sdk.js` ✅ 14 checks unchanged
- Tool count check: 15 categories / 167 tools

### Backward compatibility

All v2.3.1 tools accept the same arguments as before. New optional
`reference`/`nodeName` fields on the four migrated tools coexist with
the existing `uuid`/`nodeUuid` field. Existing AI clients with cached
schemas keep working.

---

## v2.3.1 — 2026-05-02

Three-way review fixes (codex / claude / gemini) on v2.3.0. No API surface
changes; all fixes are correctness / safety / backward-compat hardening.

### Must-fix

- **`updateSettings()` now re-applies `setEditorContextEvalEnabled`**. Previously
  the panel toggle for `enableEditorContextEval` only took effect on extension
  reload — disabling mid-session left host-side eval ON until reload. Both
  reviewers (codex + claude) flagged this as security-relevant. Fix at
  `source/mcp-server-sdk.ts:updateSettings`.
- **`execute_script` response shape preserved**. v2.3.0 changed the alias
  response from `{data: {result, message}}` to `{data: {context, result}}`.
  Existing callers reading `data.message` would break. Fixed by wrapping the
  alias path to restore the legacy shape; new `execute_javascript` keeps
  `{context, result}` form.
- **`batch_screenshot.delaysMs` capped at 20 elements**. Previously unbounded
  array length → potential disk fill / editor freeze on AI mistake. Added
  `.max(20)` to the zod schema.

### Worth-considering

- **`pickWindow` prefers non-Preview windows by default**. `getFocusedWindow()`
  could be a transient preview popup; default screenshots now target the main
  editor surface unless caller passes `windowTitle: 'Preview'` explicitly.
- **`readDocsSection` handles CRLF + UTF-8 BOM**. Markdown docs saved on
  Windows had `\r` residue at line ends; section header equality check would
  silently fail. Now splits on `\r?\n` and strips leading BOM.

### Documentation

- **CLAUDE.md landmine #13** — explicit threat-model entry for
  `execute_javascript(context='editor')`. Documents that opt-in is a one-way
  trust commitment per session (AI can persist `enableEditorContextEval=true`
  to settings file via `require('fs')`, defeating future panel toggles).

### Verification

- `npm run build` tsc clean
- `node scripts/smoke-mcp-sdk.js` ✅ 14 checks unchanged
- `node scripts/measure-tool-tokens.js` decision = CLOSE P2 unchanged
- `node scripts/generate-tools-doc.js` 14 cat / 163 tools unchanged

---

## v2.3.0 — 2026-05-02

AI workflow 強化：MCP 內最小 Code Mode + AI 視覺驗證閉環 + AI 自助查 docs。
參考 FunplayAI execute_javascript / harady debug_screenshot / cocos-cli
text/markdown docs resources。詳細規劃見
`docs/roadmap/06-version-plan-v23-v27.md` §v2.3.0。

### New tools (3)

- `debug_execute_javascript` — `[primary]` 統一 sandbox。`context: 'scene'|'editor'`。
  AI 做複合操作（讀 → 改 → 驗）一次完成，不用打 5-10 個 narrow tool。
  Editor context 預設 OFF，需在 panel 設定 `enableEditorContextEval: true`
  opt-in（避免 prompt-injection 風險）。
- `debug_screenshot` — Electron `webContents.capturePage()` → PNG。
  AI 改完 UI 自我驗證閉環。
- `debug_batch_screenshot` — 多時間點抓圖、間隔可控。

### Existing tools

- `debug_execute_script` 改成 `[compat]` 標籤，內部直接 alias 到
  `execute_javascript(code, 'scene')`——保持向下相容
- 所有 non-primary tool 在 `tools/list` 自動補 `[specialist]` prefix（在
  `mcp-server-sdk.ts:setupTools()` 統一加 1 行 prefix，不需逐 tool 改 source）

### New MCP resources (3)

- `cocos://docs/landmines` — `text/markdown`，從 CLAUDE.md 抽 §Landmines
- `cocos://docs/tools` — `text/markdown`，docs/tools.md 全文
- `cocos://docs/handoff` — `text/markdown`，docs/HANDOFF.md 全文

讀檔即時載入（不在 build time bake-in），user 改 CLAUDE.md 後立即反映。
AI 卡關時可自助查 landmine 紀錄。

### Settings

- 新增 `enableEditorContextEval: boolean`（默認 false）。控制
  `execute_javascript` 的 `context='editor'` 是否可用。對應 runtime flag 在
  `source/lib/runtime-flags.ts`。

### Files added

- `source/lib/runtime-flags.ts`

### Files modified

- `source/types/index.ts` — `MCPServerSettings` 加 `enableEditorContextEval?`
- `source/settings.ts` — DEFAULT_SETTINGS 補 `enableEditorContextEval: false`
- `source/mcp-server-sdk.ts` — wire settings → runtime-flag、setupTools 加
  `[specialist]` prefix
- `source/tools/debug-tools.ts` — 加 `execute_javascript` / `screenshot` /
  `batch_screenshot`，`execute_script` 改走 alias
- `source/resources/registry.ts` — 加 3 個 markdown docs resource、handler
  改成 per-resource MIME
- `scripts/smoke-mcp-sdk.js` — 加 docs/handoff round-trip + [specialist]
  prefix check (現 14 條)

### Verification

- `npm run build` tsc clean
- `node scripts/smoke-mcp-sdk.js` ✅ 14 checks
- `node scripts/measure-tool-tokens.js` decision = CLOSE P2 不變
- `node scripts/generate-tools-doc.js` 14 categories / **163 tools** (+3)

---

## v2.2.0 — 2026-05-02

T-P3-1 Resources surface (read-only state via MCP `resources/*` capability).

### New capability

- `MCPServer` now declares `resources: { listChanged: true, subscribe: false }`
  in addition to `tools`. Subscribe stays off until T-P3-3 wires Cocos
  broadcast events.
- Static resources (6): `cocos://scene/current`, `cocos://scene/hierarchy`,
  `cocos://scene/list`, `cocos://prefabs`, `cocos://project/info`,
  `cocos://assets`.
- Resource templates (RFC 6570): `cocos://prefabs{?folder}` and
  `cocos://assets{?type,folder}` for parameterized reads.
- Each resource handler routes through the existing `ToolExecutor` so
  resource read and the corresponding `tools/call` return byte-identical
  data.
- URI scheme aligned with cocos-cli (official) and FunplayAI (closest
  embedded-extension prior art); see `docs/research/t-p3-1-prior-art.md`.

### Deprecated (still works, will be removed in v3.0.0)

The 6 read-only tools backing the resources gain a deprecation hint in
their descriptions. Removal conditions:

- All target MCP clients (Claude Desktop, Claude Code, Cline, Continue,
  etc.) confirmed to support `resources/*`
- Internal `live-test.js` and ad-hoc REST `/api/*` callers migrated for at
  least one minor version

Both must hold before tools are dropped in a major bump.

### Files added

- `source/resources/registry.ts`
- `docs/research/t-p3-1-prior-art.md`

### Verification

- `npm run build`
- `node scripts/smoke-mcp-sdk.js` (12 checks; 5 new for resources/list,
  resources/templates/list, resources/read static + template + unknown)
- `node scripts/measure-tool-tokens.js` (decision: CLOSE P2 unchanged)
- `node scripts/generate-tools-doc.js` (160 tools / 14 categories unchanged)

---

## v2.1.7 — 2026-05-02

B1 description sweep for the full 160-tool registry.

### Documentation / metadata

- Rewrote tool and parameter descriptions across all 14 categories to make
  side effects, unsupported placeholders, preflight lookups, and similar-tool
  differences clearer.
- Regenerated `docs/tools.md` from the built registry.
- Kept the sweep schema-only: no tool names, zod shapes, defaults, or runtime
  behavior changed.

### Verification

- `npm.cmd run build`
- `node scripts/generate-tools-doc.js`
- `node scripts/smoke-mcp-sdk.js`
- `node scripts/measure-tool-tokens.js`

---

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
