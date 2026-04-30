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
├── mcp-server.ts           # Hand-rolled HTTP MCP server (NO @modelcontextprotocol/sdk)
├── settings.ts             # Server settings persistence (project settings/)
├── scene.ts                # Scene-context script run via Editor.Message 'execute-scene-script'
├── tools/                  # ToolExecutor implementations, one file per category
│   ├── scene-tools.ts             #  10 tools
│   ├── scene-advanced-tools.ts    #  23 tools
│   ├── scene-view-tools.ts        #  20 tools
│   ├── node-tools.ts              #  15 tools
│   ├── component-tools.ts         #  11 tools  (1776 lines)
│   ├── prefab-tools.ts            #  12 tools  (2855 lines — biggest file)
│   ├── project-tools.ts           #  24 tools
│   ├── debug-tools.ts             #  11 tools
│   ├── preferences-tools.ts       #   7 tools
│   ├── server-tools.ts            #   6 tools
│   ├── broadcast-tools.ts         #   5 tools
│   ├── reference-image-tools.ts   #  12 tools
│   ├── asset-advanced-tools.ts    #  11 tools
│   ├── validation-tools.ts        #   3 tools
│   └── tool-manager.ts            # Per-config enable/disable persistence
├── panels/                 # Vue 3 panel UI (default + tool-manager tabs)
└── types/index.ts          # Shared interfaces (ToolDefinition, ToolExecutor, …)
```

Tool wiring: `mcp-server.ts:initializeTools()` instantiates every category and
exposes them as `${category}_${tool.name}` (e.g. `node_create_node`).
`tool-manager.ts` re-imports and re-instantiates the same classes — that is
intentional duplication we plan to remove (see roadmap P1).

Total tool count today: ~170. Original author's v1.5.0 plan was to collapse
to ~50 action-router tools. We are not committing to that target until token
cost is measured.

## Landmines (read before editing)

1. ~~**Hardcoded path `/Users/lizhiyong/NewProject_3`**~~ — fixed in P0
   (2026-04-30). `debug-tools.ts` now uses `resolveProjectLogPath()`;
   `prefab-tools.ts:readPrefabFile` uses `Editor.Project.path` directly.
   Both fail loudly when the editor context is unavailable.
2. ~~**`mcp-server.ts:fixCommonJsonIssues()`**~~ — removed in P0. Both
   `handleMCPRequest` and `handleSimpleAPIRequest` now return standard
   parse-error responses (`-32700` for MCP, 400 for REST) with the body
   truncated to 200 chars.
3. **Prefab API guesswork** in `prefab-tools.ts` — `establishPrefabConnection`
   tries `connect-prefab-instance`, `set-prefab-connection`,
   `apply-prefab-link` in sequence; `applyPrefabToNode` similarly tries
   `apply-prefab`, `set-prefab`, `load-prefab-to-node`. Several of these
   channels do not exist in current Cocos Editor. **Scheduled for cleanup
   in P1 T-P1-6** — verify against `@cocos/creator-types` before adding
   more.
4. ~~**`console.log` is not gated**~~ — fixed in P0 for the two noisiest
   files. `prefab-tools.ts` and `component-tools.ts` now route every
   `console.log` through `debugLog` from `source/lib/log.ts`, which only
   fires when `settings.enableDebugLog === true`. **Other tool files still
   carry raw `console.log`** — full Logger sweep is P1 T-P1-3.
5. **Double-instantiation**: every `ToolExecutor` is `new`'d twice — once
   in `MCPServer.initializeTools` and once in `ToolManager.initializeAvailableTools`.
   Constructors must stay side-effect free.
6. **Hardcoded MCP protocol version `2024-11-05`** in `mcp-server.ts:248`.
   No capability negotiation. No SSE, no streaming.
7. **No test runner wired up.** `source/test/*.ts` exists but is not
   invoked by any npm script.

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
