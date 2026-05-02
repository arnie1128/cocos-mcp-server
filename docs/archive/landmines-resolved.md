# Resolved Landmines Archive

P0-P1 resolved the first six historical landmines. The entries below are preserved verbatim from CLAUDE.md before slimming.

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
