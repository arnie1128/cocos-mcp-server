# T-P3-1 Resources — prior art notes

Source URLs read on 2026-05-02 (commit-pinned by `main` HEAD at fetch time):

- https://raw.githubusercontent.com/cocos/cocos-cli/main/src/mcp/resources.ts
- https://raw.githubusercontent.com/cocos/cocos-cli/main/src/mcp/mcp.middleware.ts
- https://raw.githubusercontent.com/FunplayAI/funplay-cocos-mcp/main/lib/resources.js

This is a one-shot research note. Purpose: lock URI scheme + dispatch
shape for our T-P3-1 implementation. Don't keep maintaining this file
after T-P3-1 ships — promote conclusions into
`docs/architecture/overview.md` and delete or archive this note.

## Three-way URI table

| Topic | cocos-cli (official) | FunplayAI (embedded ext) | This fork (planned) |
|---|---|---|---|
| URI prefix | `cli://` (local docs), `cocos://` (engine docs + assets) | `cocos://` (everything) | `cocos://` (everything) |
| MIME | `text/markdown` for docs, `application/json` for assets | `text/plain` (text envelope of JSON) | `application/json` (we already have JSON in hand) |
| Capabilities | `{ resources: { subscribe, listChanged, templates }, tools, logging }` | tools + resources + prompts (no subscribe) | `{ resources: { listChanged, subscribe: false }, tools }` (T-P3-3 flips subscribe later) |
| Static resources | docs files only | 8 entries | 5 entries (we don't ship a "selection" or "errors" view yet) |
| Templates | `cocos://assets/{ccType}` (asset query by type) | `cocos://scene/node/{path}`, `cocos://asset/path/{relative_path}`, `cocos://asset/info/{uuid_or_path}` | `cocos://assets{?folder}` (one template, query-string folder filter) |
| Dispatch shape | `server.resource(...)` per entry, decorator-driven for tools | `resolveResourceText()` switch + `startsWith()` prefix matches | `source/resources/registry.ts` URI → handler map (mirrors `tools/registry.ts`) |

## URI naming alignment check (FunplayAI ↔ ours)

FunplayAI is closest architecture (embedded extension calling
`Editor.Message`); we should align where reasonable to keep cross-ecosystem
client agents portable.

| Ours (planned) | FunplayAI equivalent | Decision |
|---|---|---|
| `cocos://scene/current` | `cocos://scene/current` (alias of `/active`) | ✅ exact match, keep |
| `cocos://scene/hierarchy` | `cocos://scene/active` returns hierarchy depth-3 | Keep `hierarchy` — explicit name, FunplayAI conflates "active scene metadata" and "hierarchy" which we want separated |
| `cocos://scene/list` | (no equivalent) | Keep, fills a gap |
| `cocos://prefabs` | (no equivalent) | Keep, fills a gap |
| `cocos://project/info` | `cocos://project/summary` (metadata) + `cocos://project/context` (live) | Keep `info` — matches our existing tool `project_get_project_info`. Future `cocos://project/context` style live view can be added separately |
| `cocos://assets{?folder}` | `cocos://asset/path/{relative_path}` + `cocos://asset/info/{uuid_or_path}` | Keep query-string `?folder` form — folder enumeration is what `project_get_assets` does. FunplayAI's `asset/info/{}` per-uuid pattern is a different use case (more like `get_asset_info` tool) — not in T-P3-1 scope |

## Things we deliberately skip (vs FunplayAI)

These are tempting but out of T-P3-1 scope; revisit after Notifications:

- `cocos://selection/current` — needs editor selection broadcast wiring, fits T-P3-3
- `cocos://selection/asset` — same
- `cocos://errors/scripts` — TS diagnostic surface; we don't have a project-side TS analyzer, would need new infra
- `cocos://mcp/interactions` — interaction history; we have logger but don't persist a session-level audit trail

## Things cocos-cli has that we don't need

- `cli://docs/*` and `cocos://docs/api` — cocos-cli ships engine docs as resources because it's a CLI that runs *outside* the editor. We're inside the editor; user already has the docs in the engine install.

## Final dispatch shape for our impl

```
source/resources/
  registry.ts          // createResourceRegistry(toolRegistry) -> ResourceRegistry
                       // exports: list(), listTemplates(), read(uri)
  static-resources.ts  // 5 static URIs -> { handler: (toolRegistry) => Promise<JSON> }
  template-resources.ts // 1 template URI -> { match(uri), handler(params) }

source/mcp-server-sdk.ts (extension):
  - capabilities += { resources: { listChanged: true, subscribe: false } }
  - setRequestHandler(ListResourcesRequestSchema, ...)
  - setRequestHandler(ListResourceTemplatesRequestSchema, ...)
  - setRequestHandler(ReadResourceRequestSchema, ...)
```

Each resource handler reuses the existing ToolExecutor for its underlying
operation — `cocos://scene/current` calls
`toolRegistry.scene.execute('get_current_scene', {})` and unwraps the
ToolResponse `data` field. This guarantees byte-identical behaviour
between resource read and tool call (the equivalence test in
`scripts/smoke-mcp-sdk.js` step 4 enforces it).

## MIME choice

We use `application/json` (vs FunplayAI's `text/plain`). Reasoning:

- Our handlers already produce JSON-shaped objects (ToolResponse `data`)
- `application/json` lets MCP-aware clients pretty-print or schema-validate
- Backwards-compatible: any client that just reads the `text` field still
  gets a parseable string
- FunplayAI's `text/plain` is a wrapper convention (`toText()` formats
  human-readable digest); we'd have to invent that formatter, more work
  for less type info

## Open questions (revisit during impl)

1. URI template syntax: MCP spec says RFC 6570. `cocos://assets{?folder}`
   is RFC-6570 form-style query expansion. Need to confirm SDK parses it
   correctly via `ListResourceTemplatesRequestSchema` response.
2. If folder is omitted (`cocos://assets`), do we return the root
   `db://assets` listing or 400? Default to root, consistent with the
   tool's default arg.
3. Resource read errors: SDK has no `isError` field in ReadResource
   response. Surface tool errors as JSON `{ error: "..." }` in the text
   field with HTTP-style status semantics, or throw to let SDK return
   JSON-RPC error?  → Throw; SDK returns -32602 JSON-RPC error to client,
   matches REST 400 short-circuit semantics.
