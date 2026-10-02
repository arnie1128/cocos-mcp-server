# Landmines

Editor and engine behaviours that break a straightforward implementation.
Read the entry for a subsystem before changing it. Numbers are stable
identifiers referenced from source comments, tool descriptions and other
documents: entries 1–6 are resolved and kept in
[archive/landmines-resolved.md](archive/landmines-resolved.md); a new entry
takes the next free number. MCP clients read this file as the
`cocos://docs/landmines` resource.

A Cocos Creator version next to an entry is the version the behaviour was
observed on. Re-verify on another version before relying on a workaround or
removing it.

<a id="landmine-7"></a>
## 7. Scene facade `applyPrefab` returns `false` even on success

Observed on Cocos Creator 3.8.x.

`applyPrefab` on the scene facade (`cce.SceneFacadeManager`; `cce.SceneFacade`
is the type-doc alias) resolves to `false` even when the apply writes the
prefab asset, so its return value is not a success signal. `update_prefab`
treats "no exception thrown" as success and surfaces the raw value only as
`data.facadeReturn`. Apply the same defensiveness when wrapping any other
facade method whose return type is annotated `Promise<boolean>` in
`scene-facade-interface.d.ts`.

<a id="landmine-8"></a>
## 8. `cce.Prefab.createPrefab` repurposes the source node

The original node's UUID is invalidated; the new prefab instance gets a fresh
UUID. `createPrefabFromNode` in `source/scene.ts` resolves it through
`scene/query-nodes-by-asset-uuid` and returns it as `data.instanceNodeUuid`.
Do not reuse the caller's `nodeUuid` after this call.

<a id="landmine-9"></a>
## 9. `cc.Node.getChildByUuid` is shallow

It searches direct children only. To look up an arbitrary scene node from
scene-script context, use `findNodeByUuidDeep` in `source/scene.ts`: a
depth-first walk that matches both `_id` and `uuid`.

<a id="landmine-10"></a>
## 10. No test runner

`package.json` defines no `test` script and there is no `source/test/` tree.
Checks live in `scripts/`:

- `scripts/smoke-mcp-sdk.js` (`npm run smoke`) — SDK server endpoints with a
  stub registry: initialize, list, call success, call failure, REST
  short-circuit. Reads `dist/`; no editor needed.
- `scripts/check-gemini-compat.js` (`npm run check:gemini`) — schema guard
  described in [landmine 15](#landmine-15).
- `scripts/live-test.js` — exercises representative tools per category
  against a running editor extension (default port 3000). Write flows sit in
  `try/finally` blocks so editor state is restored on exit. Manual only.
- `scripts/measure-tool-tokens.js` — measures the `tools/list` payload
  against action-router simulations; rerun for regression comparisons.

When adding test coverage, add a script under `scripts/` rather than
reintroducing `source/test/`.

<a id="landmine-11"></a>
## 11. Scene-script array mutations do not persist through `save_scene`

The editor keeps two state layers:

- (a) the runtime `cc.Node` graph that scene-script mutates through
  `Editor.Message.request('scene', 'execute-scene-script', …)`;
- (b) the editor serialization model that
  `Editor.Message.request('scene', 'save-scene')` writes to disk.

Scene-script mutations such as `cc.Button.clickEvents.push(eh)` update only
layer (a). Layer (b) changes only through the editor's set-property channels
(`scene/set-property`, `scene/move-array-element`,
`scene/remove-array-element`). `Editor.Message.send('scene', 'snapshot')`
writes only to the undo stack; it does not promote runtime mutations into the
serialization model.

The scene message API has no `insert-array-element` channel (only move and
remove). The official way to add an array entry is `set-property` with the
whole new array as the dump value, which would require building the
`IProperty` dump shape on the host side.

Core rule: mutate component array state from scene-script, then nudge from
the host side via `scene/set-property`. Do not nudge from scene-script (it
does not propagate) and do not trust `snapshot` alone for persistence.

Path shape: component property writes are addressed as
`nodeUuid` + `__comps__.<idx>.<prop>`, not as `componentUuid` + `<prop>`.
Passing the component's runtime UUID as the set-property target does not
propagate. `setComponentProperty` in `source/tools/component-tools.ts` shows
how `rawComponentIndex` is resolved.

`enabled` dump shape: keep the nested-and-flat dual read in
`nudgeEditorModel` (`source/tools/component-tools.ts`). The component dump
from `scene/query-node` carries `enabled` either nested
(`comp.value.enabled.value`) or flat (`comp.enabled`), depending on the build
and the component; both occur. The nudge reads nested first and falls back to
flat. Do not collapse this into a single read: when the flat shape falls
through to the nested-shape default, a disabled component is nudged back to
`enabled: true`. `dumpUnwrap` (`source/lib/dump-unwrap.ts`) handles ordinary
dual-shape reads; this read stays bespoke.

Scalar property writes do not need the nudge. `set-property` on
`__comps__.<idx>.<scalar>` paths (for example `layer`, `sizeMode`,
`cameraComponent`, simple primitive properties) reaches the serialization
model immediately. The nudge is only for array-element insert or splice done
from scene-script; do not apply `nudgeEditorModel` to every write.

<a id="landmine-12"></a>
## 12. Asset-DB writes can block on a native confirmation dialog

The `asset-db` channels `copy-asset`, `move-asset` and `create-asset` detect
target collisions internally. On a collision the editor pops a native confirm
dialog and blocks the IPC reply until a person clicks, so a tool call hangs
when nobody is at the keyboard. Do not rely on the channel's `overwrite`
option to avoid the dialog.

Mitigation: check for a collision from the host side before the write, and
either fail fast or remove the target explicitly. `save_scene_as`
(`saveSceneAsImpl` in `source/tools/scene-tools.ts`) is the reference
implementation: it pre-checks with `query-uuid` when `overwrite` is false and
passes `{ overwrite: true }` through to `copy-asset` otherwise, which replaced
the target without a dialog when that tool was verified. For `move-asset`,
`create-asset` or any path where `overwrite: true` has not been verified,
delete the target explicitly before the write:

```ts
const targetUuid = await Editor.Message.request('asset-db', 'query-uuid', targetUrl);
if (targetUuid && !args.overwrite) return fail(`Target '${targetUrl}' already exists.`);
if (targetUuid && args.overwrite) await Editor.Message.request('asset-db', 'delete-asset', targetUrl);
await Editor.Message.request('asset-db', 'copy-asset', sourceUrl, targetUrl);
```

Apply the same pre-check to any new tool that wraps these channels.

<a id="landmine-13"></a>
## 13. `debug_execute_javascript(context='editor')` opt-in: what disabling undoes

Once `enableEditorContextEval` is on, AI-produced code runs through
`(0, eval)` in the editor host process, at the same trust level as the editor
itself. It can `require('fs')`, `require('@cocos/creator-types')` and call any
`Editor.Message` channel, which is equivalent to unsigned editor-extension
privileges.

Turning it off has three distinct states:

- Unsaved panel state — the panel checkbox changes only the panel's local
  settings model. Until the panel's save button is pressed, nothing is
  written and eval stays enabled.
- Saved disable — saving sends `update-settings`. The host writes the whole
  settings object, with `enableEditorContextEval: false`, to
  `<project>/settings/mcp-server.json` and recreates the server, which applies
  the per-process flag (`setEditorContextEvalEnabled`). The persisted setting
  and the runtime permission both change, and the next eval call is rejected.
- Earlier side effects — disabling does not roll back anything the evaluated
  code did while it was allowed to run: files it wrote, editor state it
  changed, messages it sent. That includes a settings file the code itself
  rewrote if no disable is saved afterwards; `readSettings()` returns the
  on-disk value on the next launch or reload. Auditing those effects is
  manual.

Rule: enable it only when the prompt source is trusted for the whole session
(your own typing, not content piped from issues, chat or the web). The
default in `DEFAULT_SETTINGS` is `false`. Do not add tools that flip this flag
programmatically; the opt-in is a deliberate human action in the panel.

<a id="landmine-14"></a>
## 14. The scene dirty flag is cumulative and cannot be cleared programmatically

The editor records every `set-property`, `create-node`, `remove-node`,
`paste-node` and similar operation in its undo stack. Scene dirty state is the
union of those operations since the last save; it does not diff against the
file on disk, so a `create-node` → `remove-node` round trip leaves the scene
dirty even though the node count is unchanged.

No discard channel exists. `scene/@types/message.d.ts` exposes only
`query-dirty` (no `clear-dirty`, `discard` or `revert`), and
`scene-facade-interface.d.ts` exposes only `querySceneDirty`. The only ways
back to a clean state:

- `save_scene` (writes to disk; changes the file mtime and may rewrite the
  editor's serialization variance even when the content is unchanged);
- the person clicks "Discard changes" in the editor's modal;
- close and reopen the project;
- `open-scene` to a different scene and accept the modal.

Implications for tool design:

- `scene_open_scene`, `scene_close_scene` and any other tool that triggers
  the "save unsaved changes?" modal block the IPC reply until the modal is
  dismissed whenever the scene is dirty — the same blocking pattern as
  [landmine 12](#landmine-12) on a different channel.
- Workflows that create scratch state and then switch scenes are
  dialog-prone. Save first explicitly, or do scratch work in a throwaway
  scene opened beforehand.
- Test harnesses query dirty state immediately before any scene switch, not
  once at startup, so they can skip, save or discard before the modal fires.
  `scripts/live-test.js` does this; copy that pattern for new write-flow plus
  scene-switch tests.
- There is no clean way to flush dirty state without writing to disk. The only
  known candidate is a low-level `cce.SceneFacade` reload through
  `execute-scene-script`, which is unverified and heavy-handed.

<a id="landmine-15"></a>
## 15. Gemini compatibility: keep zod 4 with `target: 'draft-7'` for inline schemas

Gemini's tool-call parser rejects JSON Schema `$ref`, `$defs` and
`definitions`. Claude and OpenAI clients accept them, so a regression stays
silent until a Gemini client issues `tools/list`.

cocos-cli works around the same problem with a middleware
(`mcp.middleware.ts`) that re-converts zod schemas to inline JSON Schema 7,
because the `zod-to-json-schema` package it uses emits `$ref` for reused
subschemas by default. This project needs no such middleware:
`toInputSchema()` in `source/lib/schema.ts` calls zod 4's built-in
`z.toJSONSchema(schema, { target: 'draft-7' })`, which inlines reused
subschemas (the same `vec3` instance used for `position`, `rotation` and
`scale` produces three full inline copies, no `$ref`).

Regression guard: `npm run check:gemini` (`scripts/check-gemini-compat.js`)
walks every registered tool's `inputSchema` and fails on `$ref`, `$defs` or
`definitions`. It reads `dist/`, so run it after `npm run build` whenever
touching `source/lib/schema.ts`, the zod dependency or any hand-written
`inputSchema`. There is no CI; run it manually.

What would reintroduce the problem:

- downgrading zod to v3 (different `toJSONSchema` semantics);
- switching from `target: 'draft-7'` to `target: 'draft-2020-12'` (the
  default for some zod versions emits `$defs`);
- hand-written `inputSchema` literals that contain `$ref` (for example schemas
  copied from external documentation tools);
- adopting the `zod-to-json-schema` package instead of zod's built-in
  `toJSONSchema`.

<a id="landmine-16"></a>
## 16. `changePreviewPlayState(true)` can freeze the editor in every preview mode

Observed on Cocos Creator 3.8.7, in embedded, browser and simulator preview
modes.

Starting Preview-in-Editor triggers a race in the editor's own
`softReloadScene`. What the person sees:

- `debug_preview_control(start)` returns `success: true`, but
  `data.warnings[]` carries a "Failed to refresh" entry;
- the PIE window does not actually start;
- the editor freezes (spinning indicator, no UI response);
- clicking anything cascades errors (for example
  `Node with UUID … is not exist!` from camera focus);
- recovery requires Ctrl+R in the editor to restart the scene-script
  renderer process.

What cannot be fixed from outside the editor:

- the race lives in closed-source engine bundle code under
  `app.asar/builtin/scene/dist/script/3d/...`;
- there is no documented "wait for preview build to settle" channel;
- channels such as `Editor.Message.send('scene', 'reload')` do not exist.

Current guard: `debug_preview_control(op="start")` refuses unless
`acknowledgeFreezeRisk: true` is passed, rejects a second call while one is in
flight, and its description and error messages direct callers to the
alternatives below. `op="stop"` is reliable.

Guidance for AI workflows:

- Saving the scene (`scene_save_scene`) before `preview_control(start)`
  lowers the risk but does not remove it; a freeze has occurred with a save a
  few seconds earlier.
- For visual checks in embedded mode, prefer
  `debug_capture_preview_screenshot(mode='embedded')` while in edit mode; no
  PIE start is needed and the game view shows scene content in many cases.
- For runtime or play-state checks, prefer
  `debug_game_command(type='screenshot')` through a `GameDebugClient` running
  in a browser preview (`debug_preview_url(action='open')`). That path uses
  the runtime canvas and avoids the editor-side race entirely.
- If `preview_control(start)` is required and the editor freezes, tell the
  person to press Ctrl+R. Do not add an automatic Ctrl+R-equivalent IPC call:
  there is no clean editor-side equivalent, and forcing a renderer reload
  from outside risks losing unsaved state, which is worse than the freeze.
- Do not treat `debug_check_editor_health` as a reliable freeze detector. It
  declares the scene alive only when both `scene/query-is-ready` and
  `scene/query-node-tree` answer within their timeouts. An earlier probe that
  read cached `director.getScene()` state reported the scene alive while the
  editor was visibly frozen, and no recorded retest confirms the deeper probe
  against a reproduced freeze. None of the surveyed peer projects ships a more
  sensitive probe; treat this as a known Cocos Creator 3.8.7 limit and use the
  alternative paths above.

<a id="landmine-17"></a>
## 17. `preferences/set-config 'preview' … 'current.platform'` silently does nothing

Observed on Cocos Creator 3.8.7.

`query-config 'preview'` returns the active preview mode at
`preview.current.platform` (for example `browser`, `gameView`, `simulator`).
The symmetric write through
`Editor.Message.request('preferences', 'set-config', 'preview', <key>, <value>, [protocol])`
returns a truthy value but does not persist: a read-back after the write still
shows the old mode. Every shape tried fails:

| Strategy | setResult | observedMode |
|---|---|---|
| `('preview','current',{platform:value})` | `true` | unchanged |
| `('preview','current.platform',v,'global')` | `true` | unchanged |
| `('preview','current.platform',v,'local')` | `true` | unchanged |
| `('preview','current.platform',v)` | `true` | unchanged |

Hypotheses:

- the editor may treat `preview` as a read-only preference category that only
  its own UI dropdown can write;
- `current.platform` may be a runtime-derived field rather than a stored
  preference, with the real selector elsewhere (project profile, an
  open-preview action);
- `set-config` may need a protocol parameter not yet identified.

Guidance:

- None of the six surveyed peer projects (harady, Spaydo, RomaRogov,
  cocos-code-mode, FunplayAI, cocos-cli) ships a working preview-mode setter;
  see the "Preview landmine" section of
  [cross-repo-survey-v2.10.md](archive/research/cross-repo-survey-v2.10.md).
  Treat the field as read-only to third-party extensions.
- `debug_set_preview_mode` fails by default with NOT_SUPPORTED and points to
  the editor's preview dropdown. The four-strategy diagnostic probe runs only
  with `attemptAnyway: true` and reports every attempt in `data.attempts`, so
  a newer Cocos build can be re-checked quickly.
- When a workflow needs a different preview mode, ask the person to switch it
  in the preview dropdown. The setter itself does not freeze the editor; only
  `preview_control(start)` triggers [landmine 16](#landmine-16).

<a id="landmine-18"></a>
## 18. The HTTP server requires a loopback Host header on every route except `/health`

The server binds to `127.0.0.1`, but a public DNS name resolving to
`127.0.0.1` (DNS rebinding) lets a victim's browser tab reach it while sending
`Host: attacker.com`. `handleHttpRequest` in `source/mcp-server-sdk.ts`
rejects any non-loopback Host with 403 before tool dispatch. The check
(`isLoopbackHost` in `source/lib/cors.ts`) accepts only `127.0.0.1`,
`localhost` or `[::1]`, with an optional port.

`/health` is the only exempt route, so monitoring probes from the editor
itself still work when the Host header is unusual.

Implications:

- Test rigs and curl scripts must send `Host: 127.0.0.1:<port>` or
  `Host: localhost:<port>` (the HTTP/1.1 default for a loopback target).
  `scripts/smoke-mcp-sdk.js` and `scripts/live-test.js` work unchanged.
- Do not widen the allowlist with further "localhost variants" without
  checking whether the new entry can be a DNS-rebinding target.
- The `/game/*` Origin allowlist still applies on top; the loopback Host
  check is independent (Host and Origin are separate headers).
