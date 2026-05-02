# Changelog

## v2.9.3 — 2026-05-02

T-V29-6 RomaRogov macro-tool enum routing + preview-tools park gates.

### #1 — `referenceImage_manage` macro tool (T-V29-6)

12 flat reference-image tools collapsed into 1 op-router. **18
categories / 179 tools** (was 190).

**Removed**: `referenceImage_add_reference_image` /
`remove_reference_image` / `switch_reference_image` /
`set_reference_image_data` / `query_reference_image_config` /
`query_current_reference_image` / `refresh_reference_image` /
`set_reference_image_position` / `set_reference_image_scale` /
`set_reference_image_opacity` / `list_reference_images` /
`clear_all_reference_images`.

**Added**: `referenceImage_manage({ op, ... })` with 12 ops:
`add` / `remove` / `switch` / `set_data` / `query_config` /
`query_current` / `refresh` / `set_position` / `set_scale` /
`set_opacity` / `list` / `clear_all`. Per-op required fields
validated at dispatch (paths / path / key+value / x+y / sx+sy /
opacity).

Why flat optional schema vs `z.discriminatedUnion`: simpler for
every LLM tool-call parser, easier to extend, and the gemini-compat
regression script confirms all 179 schemas remain inline.

**Breaking change**: any caller addressing the old flat tool names
must migrate to `referenceImage_manage(op=…)`. Migration window is
v2.9.x; CHANGELOG / HANDOFF / CLAUDE.md documents the new shape.

Net effect: -11 tools / smaller `tools/list` payload (token cost
reduction was the original P2 motivation in 2026-04 spec — see ADR
0001 for the historical scope discussion).

### #2 — `debug_preview_control` park gate (acknowledgeFreezeRisk)

Following landmine #16 (cocos 3.8.7 softReloadScene race on
`changePreviewPlayState(true)` regardless of preview mode) and
v2.9.x parking decision, `debug_preview_control(op="start")` now
requires explicit `acknowledgeFreezeRisk: true` to actually fire.
Default `false` returns a structured error pointing at the safer
alternatives:
- `debug_capture_preview_screenshot(mode="embedded")` in EDIT mode
- `debug_game_command(type="screenshot")` via GameDebugClient on
  browser preview

`op="stop"` bypasses the gate (always safe and reliable for
recovering from a half-applied state). Tool description updated
to ⚠ PARKED. Pending v2.9 reference-project comparison to find a
working call path.

`debug_set_preview_mode` already has a `confirm` gate (v2.9.0) and
the description is already ⚠ EXPERIMENTAL after v2.9.1 retest
confirmed all 4 set-config shapes silently no-op on cocos 3.8.7.

### Tool registry status

`registry.ts` `referenceImage` category remains the same (same
`ReferenceImageTools` class, same constructor). MCP `tools/list`
clients should treat this as a v2.9.x major-revision migration
within the v2.x line.

## v2.9.2 — 2026-05-02

T-V29-3 polish batch — lands the 8 deferred single-reviewer 🟡
items from v2.8.1 round-2 (the ones never promoted because no
≥2-reviewer overlap).

### #1 — `Vary: Origin` on non-game CORS branch

`source/mcp-server-sdk.ts` now emits `Vary: Origin` uniformly on both
the `/game/*` (added v2.8.0) and the non-game branches. v2.8.x only
set Vary on `/game/*`. A future change introducing dynamic ACAO on
`/mcp` would have quietly resurfaced the cache-poisoning issue
T-V28-1 hardened against — Vary on all branches keeps the invariant
file-wide. (Claude r1 single-🟡 from v2.8.1 review.)

### #2 — `previewControl` failure-branch message symmetry

`source/tools/debug-tools.ts` `previewControl` failure branch now
attaches a default message so streaming AI clients see a consistent
envelope shape on both success and failure paths. (Claude r1.)

### #3 — `cce.SceneFacade` vs `SceneFacadeManager` comment unify

Comments in `source/scene.ts` referencing the prefab facade now use
`SceneFacadeManager` consistently — that is the canonical runtime
name; `cce.SceneFacade` is the type-doc alias. (Gemini r1.)

### #4 — `package.json` `contributions.scene.methods` alignment

The list now includes every method exported by
`source/scene.ts` `methods` (was missing `createNode`,
`getAnimationClips`, `playAnimation`, `queryAnimationSetTargets`,
`runWithCapture`, `stopAnimation`). Empirically the editor doesn't
strictly enforce the list (animation tools worked without being
listed since v2.4.8) but the declaration is self-documenting.
(Gemini r2.)

### #5 — `isPathWithinRoot` helper using `path.relative`

Replaces `realRoot + path.sep` prefix check at both
`resolveAutoCaptureFile` and `assertSavePathWithinProject` with a
shared helper that handles drive-root edges (`C:\`), prefix-collision
(`C:\foo` vs `C:\foobar`), and cross-volume paths (`D:\…` when root
is `C:\`). `path.relative` returns `'..\\foobar'` for the prefix-
collision case, correctly rejecting it. (Codex r2.)

### #6 — `previewControlInFlight` guard

Module-level `DebugTools.previewControlInFlight` flag rejects
overlapping `debug_preview_control` calls. The cocos engine race in
landmine #16 makes double-fire particularly dangerous — second call
hits a partially-initialised `PreviewSceneFacade`. Reject with a
clear "wait for previous to resolve" error. (Codex r1.)

### #7 — `getScriptDiagnosticContext` converges on shared helper

The bespoke realpath + `toLowerCase()` + `path.sep` containment
check in `getScriptDiagnosticContext` is functionally subsumed by
`assertSavePathWithinProject` (which itself uses the new
`isPathWithinRoot` helper). Replaces ~25 lines with a single call.
(Gemini r2.)

### #8 — TOCTOU acknowledgement comment

The race window between `realpathSync` containment check and
`writeFileSync` is documented as accepted residual risk in a comment
on `isPathWithinRoot`. Full mitigation needs `O_NOFOLLOW` which
Node's `fs` API doesn't expose; given this is a local dev tool with
microsecond attack windows, the risk is accepted. A future patch
could add `fs.openSync('wx')` for AUTO-named paths only (caller-
provided savePath needs overwrite semantics). (Codex r1 + Gemini r1.)

### Tool-count + landmines unchanged

Still 18 categories / 190 tools. Landmines #16 (preview_control freeze)
and #17 (set_preview_mode no-op) remain — both pending the v2.9
reference-project comparison phase.

## v2.9.1 — 2026-05-02

Setter live-test fix.

### 🔴 #1 — `debug_set_preview_mode` write was silently ignored

v2.9.0 setter passed `('preferences', 'set-config', 'preview',
'current.platform', value)` and got back a non-false result, then
returned success. Live retest showed the config dump still reported
`preview.current.platform = "browser"` after a `confirm=true` write
to `"gameView"` — the read-back didn't match. Restore-to-browser
also detected as no-op for the same reason.

cocos `set-config` doesn't appear to support dot-path keys the way
`query-config` does. Fix: probe four shapes in order and verify each
write with a fresh read-back before declaring success:
1. `('preview', 'current', { platform: value })` — nested object
2. `('preview', 'current.platform', value, 'global')` — explicit protocol
3. `('preview', 'current.platform', value, 'local')` — explicit protocol
4. `('preview', 'current.platform', value)` — original (kept as last resort)

The first strategy whose read-back matches the requested mode wins;
its `id` is returned in `data.strategy` plus a full `data.attempts`
breakdown for diagnostics. If all four strategies fail, the tool
returns `success: false` with the full attempts log so AI can
report back which shape works on whichever cocos version is in
play.

This is the kind of bug three-way review can't catch — reviewers
read only the type signature, not the runtime behaviour. Live
retest is the only mitigation.

## v2.9.0 — 2026-05-02

Opens with two PIE-related tools that close the v2.8.x retest gaps.
**18 categories / 190 tools** (debug 22 → 24).

Three-way review deferred per user direction until the v2.9 work is
fully landed; this CHANGELOG is appended incrementally as each
T-V29-* item ships, then the cumulative review covers the whole
v2.8.4 → v2.9.x range.

### #1 — `debug_check_editor_health` (T-V29-1)

New tool for detecting cocos editor scene-script freeze. Critical
companion for `debug_preview_control(start)` per landmine #16: the
cocos 3.8.7 softReloadScene race may freeze the scene-script
renderer (spinning indicator, Ctrl+R required). Without a way to
detect this, AI workflows would issue more scene-bound calls that
just hang.

Strategy: parallel probe with bounded timeout.
- **Host probe** — `Editor.Message.request('device', 'query')`.
  This goes to the editor main process, NOT the scene-script
  renderer, so it stays responsive even when the scene is wedged.
- **Scene probe** — `runSceneMethodAsToolResponse('getCurrentSceneInfo',
  [], { capture: false })` wrapped in `Promise.race` against a
  user-tunable timeout (default 1500ms). If the timeout fires, the
  scene renderer is considered frozen.

Returns `{ hostAlive, sceneAlive, sceneLatencyMs, sceneTimeoutMs,
hostError, sceneError, totalProbeMs }` plus a top-level message
that surfaces the appropriate recovery hint:
- both alive → "editor healthy"
- scene-only frozen → "press Ctrl+R in the cocos editor; do not
  issue more scene/* tool calls until recovered"
- host unresponsive → "verify cocos is running and the extension
  is loaded"

Recommended AI usage pattern:
```
preview_control(start) → check_editor_health(sceneTimeoutMs=2000)
  if !sceneAlive → stop, surface recovery hint to human
  else proceed with capture
```

### #2 — `debug_set_preview_mode` (T-V29-2)

Counterpart to v2.8.3's `debug_get_preview_mode`. Writes
`preview.current.platform` via the typed
`Editor.Message.request('preferences', 'set-config', 'preview',
'current.platform', value)` channel.

Args: `{ mode: 'browser' | 'gameView' | 'simulator', confirm?: boolean }`.

**Confirm gate** — `confirm` defaults to `false`, which makes the
tool a dry run that returns the current `previousMode` and the
suggested call shape. `confirm=true` actually writes. This protects
against AI exploring tool capabilities and accidentally rewriting
user preferences. The dry run also lets AI build a "save → switch
→ run → restore" workflow safely:
1. `set_preview_mode(mode='browser')` → returns `previousMode`
2. `set_preview_mode(mode='browser', confirm=true)` → switches
3. ... run capture / verification flow ...
4. `set_preview_mode(mode=<previousMode>, confirm=true)` → restore

No-op detection: when `previousMode === requestedMode` the tool
returns `{ noOp: true, confirmed: true }` without re-issuing the
write. Failure of the underlying `set-config` (cocos returns
`false` on key validation failure) is surfaced as `success: false`
with the suggestion to verify the key for this cocos version.

## v2.8.4 — 2026-05-02

Browser-mode reload retest exposed two issues missed in v2.8.3:

### 🔴 #1 — `softReloadScene` race fires in browser mode too

v2.8.3's landmine #16 documented the cocos 3.8.7 race condition as
embedded-mode-specific. Browser-mode retest hit identical symptoms:
`changePreviewPlayState` returns success, capturedLogs has "Failed to
refresh the current scene", PIE doesn't start, editor freezes
requiring Ctrl+R. **The race is inside `changePreviewPlayState` →
`softReloadScene` itself, not gated by preview destination.**

Fix:
- CLAUDE.md landmine #16 rewritten — "affects ALL preview modes
  (embedded / browser / simulator)"; treat as engine-wide bug.
- `debug_preview_control` description rewritten — drops
  embedded-specific phrasing, recommends alternatives universally,
  states "use only when start/stop side effect itself is the goal
  (and accept the freeze risk)".
- Captured-warning text upgraded — "not gated by preview mode
  (verified in both embedded and browser modes)".

### 🔴 #2 — `auto` fallback hint incorrectly assumed embedded

When `mode="auto"` finds no Preview-titled window, v2.8.3 fell back
to capturing the main editor BrowserWindow and labeled the result
`"embedded preview mode"`. **In browser-mode setups this is wrong**:
the actual gameview lives in the user's external browser (not in
the captured Electron window), and the hint misled callers into
thinking the image contained the preview.

Fix: the auto fallback path now probes
`preferences/query-config 'preview' → preview.current.platform`
internally and tailors the `data.note` per real config:
- `"browser"` → "captured the main editor window. NOTE: cocos
  preview is set to browser — actual preview content is in your
  external browser (NOT in this image)..."
- `"gameView"` → "captured the main editor window (cocos preview
  is set to gameView embedded — the editor gameview IS where
  preview renders, so this image is correct)."
- Other / unknown → neutral "could not determine cocos preview
  mode" hint with debug_get_preview_mode pointer.

### Versioning practice tightening

v2.8.3 cycle accumulated 5 code-level changes (#1–#5) under the
same package.json version, which left the cocos panel showing a
stale string and made it hard for the user to verify a reload
landed the new dist. From v2.8.4 onward, **bump version on every
discrete reload cycle** rather than batching across retests, so
the cocos panel version string is a reliable "did my reload
work?" signal.

## v2.8.3 — 2026-05-02

Embedded-mode PIE completion. v2.8.0–v2.8.2 shipped the typed
`changePreviewPlayState` route + reload-retest fixes, but the
`debug_capture_preview_screenshot` tool only matched separate
"Preview"-titled BrowserWindows — which works for cocos preview
config "window" / "simulator" but fails for "embedded" (gameview
renders inside the main editor BrowserWindow). The v2.8.0 CHANGELOG
promise "AI can now start PIE, wait for the preview window to
appear, and capture without a human clicking the toolbar" was
therefore not honored on the most common config.

**18 categories / 188 tools** (debug 21 → 22).

### #1 — `debug_capture_preview_screenshot` mode parameter (T-V283-1)

New `mode` arg with three options:
- `"window"` — original v2.7.0 behaviour: require a Preview-titled
  BrowserWindow, fail if none. Use when cocos preview config is
  "window" or "simulator".
- `"embedded"` — skip the Preview-window probe and capture the
  main editor BrowserWindow directly (where embedded gameview
  renders).
- `"auto"` (default) — try `"window"` first; if no Preview-titled
  window exists, fall back to `"embedded"` and surface a hint in
  the response message.

Response data now carries `mode: "window" | "embedded"` to disclose
which path was taken. When auto fell back, `data.note` and the
top-level `message` mention "fell back to capturing the main editor
window (embedded preview mode)" so the AI knows the capture targeted
the editor rather than a dedicated preview window.

The `windowTitle` arg still defaults to "Preview" but is ignored in
embedded mode (the main editor window is selected by the same
non-Preview / contains "Cocos Creator" heuristic that `pickWindow`
uses, plus a fallback that excludes DevTools / Worker / Blank).

### #2 — New tool `debug_get_preview_mode` (T-V283-2)

Reads cocos preview configuration via the typed
`Editor.Message.request('preferences', 'query-config', 'preview')`
channel (typed in
`@cocos/creator-types/.../preferences/@types/message.d.ts`). Returns:
- `data.interpreted` — normalized label `"browser" | "window" |
  "simulator" | "embedded" | "unknown"` derived from common keys
  (`open_preview_with` / `preview_with` / `open_with` / `mode`).
- `data.interpretedFromKey` — which key drove the interpretation.
- `data.raw` — the full preview config dump for AI inspection when
  the heuristic returns `unknown`.

Top-level `message` includes a hint about which `mode` to pass to
`capture_preview_screenshot`. Browser config maps the screenshot
recommendation to `"window"` because the browser process isn't
capturable through Electron — but `debug_preview_url(action="open")`
remains the right tool for that path.

### #3 — `debug_preview_control` warning surfacing (T-V283-3)

v2.8.2 reload retest observed cocos sometimes logging
`"Failed to refresh the current scene"` in scene-script captured
logs during `changePreviewPlayState` even when the call returns
without throwing. The root cause looks environmental
(cumulative scene-dirty state / embedded-mode timing race / initial
load), not a tool bug — but v2.8.2's bare success envelope hid the
warning inside `data.capturedLogs` where AI clients had to dig for
it.

v2.8.3 now scans `capturedLogs` after the facade call, lifts any
"Failed to refresh the current scene" error to a structured
`data.warnings` array, and prepends a ⚠ marker to the top-level
`message` with a workaround hint ("ensure the active scene is saved
via scene_save_scene before calling preview_control(start)"). Bare-
success path unchanged when no warning fires.

### #4 — `get_preview_mode` heuristic — find live cocos 3.8.7 key

Live retest dump showed cocos 3.8.7 actually stores the active mode
at `preview.current.platform` (value `"gameView"` for embedded), not
the legacy `open_preview_with` keys the original heuristic probed.
Updated probe order: `preview.current.platform` →
`current.platform` → legacy keys. classify() recognises
`"gameview"` / `"game_view"` as embedded. Added device-name
fallback (iPhone / iPad / HUAWEI / Xiaomi etc.) for simulator mode.
`interpretedFromKey` now reports `key=value` so AI can audit the
source.

Verified live: returns `{interpreted: "embedded",
interpretedFromKey: "preview.current.platform=gameView"}` against
the user's cocos 3.8.7 setup.

### #5 — Landmine #16 + sharper preview_control warning

v2.8.3 retest exposed that `changePreviewPlayState(true)` in
embedded mode triggers a race condition inside cocos 3.8.7's own
`softReloadScene` path. The full call chain (captured in
project.log):

```
preview_control(start)
 → cce.SceneFacadeManager.changePreviewPlayState
  → SceneFacadeFSM.issueCommand
   → PreviewSceneFacade.enter / .enterGameview
    → PreviewPlay.start
     → SceneFacadeManager.softReloadScene
      → PreviewSceneFacade.softReloadScene  ← throws
      → "Failed to refresh the current scene"
      → "[Scene] The json file of asset
            1777714366991.18521454594443276 is empty or missing"
```

The placeholder asset name `Date.now() + '.' + Math.random()` is
cocos's own format for temp serialization placeholders — cocos
serializes the in-memory dirty scene to a temp build artifact
under `<project>/build/preview/`, then `softReloadScene` reads it
back, but the writer hasn't finished, so the reader sees an empty
file. The user-visible effect: cocos editor freezes (spinning
indicator), Ctrl+R is required to recover the scene-script
renderer process.

This is a cocos engine bug we cannot fix from outside (`.ccc`
bundle code under `app.asar/builtin/scene/...`). v2.8.3 mitigates
by:
- New landmine #16 in CLAUDE.md documenting the trigger, recovery,
  and workarounds (use `mode="embedded"` capture in EDIT mode, or
  use `debug_game_command` via GameDebugClient + browser preview).
- `debug_preview_control` description now warns explicitly about
  the embedded-mode race + recommends checking
  `debug_get_preview_mode` first.
- The captured-warning hint upgraded with concrete recovery steps
  ("PIE has NOT actually started; cocos editor may freeze; do not
  retry — it will not help").

### Why the version stays at v2.8.x

v2.8.0 promised programmatic PIE start + capture; v2.8.0–v2.8.2 only
delivered it for "window"-mode cocos config. Bumping to v2.9.0 with
the embedded-mode gap unaddressed would mislabel the v2.8 cycle.
v2.8.3 closes the gap; v2.9.0 will start clean with MediaRecorder /
macro-tool routing on a fully-honoured PIE-capture baseline.

## v2.8.2 — 2026-05-02

Reload-retest fixes uncovered by live-testing v2.8.0/v2.8.1 against
cocos editor 3.8.7. Two bugs three-way review missed because all
reviewers stayed at the type/code-reading layer; only running the
binary against a real editor exercised them.

### 🔴 #1 — `cce.SceneFacade` runtime name mismatch

`source/scene.ts:changePreviewPlayState` dispatched against
`(globalThis as any).cce?.SceneFacade`, matching the type-doc name
in `@cocos/creator-types`. But cocos editor 3.8.7 exposes the
runtime singleton at `cce.SceneFacadeManager` (and
`.SceneFacadeManager.instance`), same convention as the prefab
path uses (`getPrefabFacade` already probes
`cce.SceneFacadeManager.instance` / `cce.SceneFacadeManager`).

Live test (commit 769151b → curl POST /api/debug/preview_control):

```
{"success":false,"error":"cce.SceneFacade is not available;
  this scene-script method must run inside the cocos editor scene process."}
```

Fix: probe all three candidates (cce.SceneFacade /
cce.SceneFacadeManager.instance / cce.SceneFacadeManager) and use
whichever exposes `changePreviewPlayState`. Mirrors getPrefabFacade
candidate-probe pattern. Also switched from `(globalThis as any).cce`
to the top-level `cce` declaration so resolution semantics match
the rest of `source/scene.ts`.

### 🔴 #2 — Relative `savePath` resolved against host cwd, not project root

`assertSavePathWithinProject` called `path.dirname(savePath)` directly.
For relative paths this collapses to '.' and `realpath('.')` returns
the host process cwd — typically `C:\Program Files (x86)\CocosDashboard\
Cocos Creator\3.8.7\resources` for the bundled cocos editor — not the
project root.

Live test (relative `out.png`):
```
{"error":"savePath resolved outside the project root: C:\\Program Files (x86)\\CocosDashboard not within D:\\1_dev\\cocos_cs\\cocos_cs_349..."}
```

The rejection was incidentally "safe" but the error message was
misleading and the AI client couldn't pass relative paths thinking
"relative to my project."

Fix: anchor relative paths against `Editor.Project.path` via
`path.resolve(projectPath, savePath)` before extracting `path.dirname`.
Helper now also returns `resolvedPath` so callers (screenshot /
capturePreviewScreenshot / batchScreenshot) write to the resolved
absolute path instead of the original relative string.

This was Codex round-2 single-reviewer 🟡 #1 — promoted to must-fix
after live-test confirmed real-world usability impact.

### Live-test snapshot

Tested against cocos editor 3.8.7 / project `cocos_cs_349`:
- ✅ `debug_preview_url` query → returned `http://192.168.2.4:7456`
- ✅ `debug_query_devices` → returned 20 device entries (iPhone /
  iPad / HUAWEI / 小米 / Sony etc.)
- ✅ `debug_capture_preview_screenshot` (no PIE) → expected failure
  with helpful "launch cocos preview first" message + visible-window
  list
- ✅ `debug_screenshot` (no savePath) → wrote 3652-byte PNG to
  `<project>/temp/mcp-captures/screenshot-<ts>.png`
- ✅ `debug_screenshot` (savePath outside project) → containment
  guard rejected `C:\Windows\Temp\...` with clear error
- ❌→✅ `debug_preview_control` → fixed in v2.8.2 (this entry)
- ❌→✅ `debug_screenshot` (relative savePath) → fixed in v2.8.2

## v2.8.1 — 2026-05-02

Three-way review patch round 1 on v2.8.0. Three reviewers (Claude /
Codex / Gemini) ran independently against commit `ddb6c77`. Codex
flagged 2 🔴, Gemini flagged 2 🔴, Claude flagged 4 🟡. Consolidated
fixes below — every ≥2-reviewer 🟡 promoted to must-fix per the
project's three-way review workflow.

### 🔴 #1 — `resolveAutoCaptureFile` containment check was tautological (Codex 🔴 + Claude 🟡)

The v2.8.0 helper realpath'd `dir` and `path.dirname(path.join(dir,
basename))` and required equality. With a fixed basename containing
no traversal characters, both expressions collapse to `dir` itself,
so the check passed for any `dir` — including a symlinked
`<project>/temp/mcp-captures` that resolved outside the project tree.
The CHANGELOG/commit-message claim "protects against the temp/mcp-
captures path being a symlink chain that escapes the project tree"
was therefore overstated.

Fix: anchor the check against `realpath(Editor.Project.path)` and
require the resolved capture dir to equal it or live under it
(`realDir.startsWith(realProjectRoot + sep)`). The intra-dir parent
== dir check is kept as cheap defense-in-depth in case a future
basename gets traversal characters threaded through. Error message
now names both the resolved capture dir and the resolved project
root so debugging is direct.

### 🔴 #2 — `SERVER_VERSION` constant stuck at `'2.7.3'` (Codex 🔴)

`source/mcp-server-sdk.ts:36` declared `SERVER_VERSION = '2.7.3'`
while `package.json` was already at `2.8.0`. The MCP `initialize`
handshake reports the SDK constant, so clients saw v2.7.3 even
though they were talking to a v2.8.0 build. Bumped to `'2.8.0'`.
v2.8.1 leaves it at `'2.8.0'` because the SDK constant tracks
behavior compatibility, not the patch tag.

### 🔴 #3 — Explicit `savePath` bypassed containment check (Gemini 🔴 + Codex 🟡)

`screenshot()` / `capturePreviewScreenshot()` / `batchScreenshot()`
all routed auto-named paths through the new helper but treated a
caller-provided `savePath` as opaque. AI-generated absolute paths
could write anywhere on the filesystem.

Fix: new helper `assertSavePathWithinProject(savePath)` that
realpath-resolves the savePath's parent dir and requires it to be
inside the project root (same anchor as #1). All three
screenshot tools now route the explicit-path branch through this
guard. Tool schema descriptions for `savePath` / `savePathPrefix`
updated to document the containment requirement.

### 🔴 #4 — `changePreviewPlayState` not in `contributions.scene.methods` (Gemini 🔴)

Gemini flagged that the new scene-script method wasn't declared in
`package.json` `contributions.scene.methods`. Although empirically
the cocos editor does not strictly enforce this list (existing
v2.4.8 animation methods like `getAnimationClips` work without
being listed), adding the new method is defensive and makes the
declaration self-documenting. Added.

### 🟡 #5 — Origin header array guard (Codex 🟡 + Gemini 🟡)

Node http allows duplicate `Origin` headers, which produces a
`string[]` on `req.headers.origin`. The v2.8.0
`resolveGameCorsOrigin(origin: string | undefined)` signature
silently accepted whatever was passed in; WHATWG URL would either
serialize the array to `"a,b"` (and throw) or mis-classify. Fixed
by widening the param type to `string | string[] | undefined` and
returning `null` (disallowed) when the value is an array — a
legitimate browser only sends one Origin.

### 🟡 #6 — HANDOFF commit table placeholder (Codex 🟡)

`docs/HANDOFF.md` commit table still showed `<v2.8.0>` as a
placeholder for the release commit. Updated to the actual SHA
`ddb6c77`.

### Single-reviewer 🟡 deferred

- TOCTOU between realpath check and writeFileSync (Codex + Gemini —
  both noted theoretical only for a local dev tool; not pursued)
- Vary header on non-game branches (Claude single-reviewer)
- previewControlInFlight guard against concurrent PIE start (Codex
  single-reviewer)
- Failure-branch message asymmetry on previewControl (Claude single)
- `cce.SceneFacade` vs `SceneFacadeManager` comment clarity (Gemini
  single — both names refer to the same singleton at runtime)

These are documented for v2.8.x → v2.9.0 spillover.

## v2.8.0 — 2026-05-02

Spillover release: pays down the three carryover items on the v2.7.0
single-reviewer 🟡 list and ships one new tool from the deferred PIE
control candidate. **18 categories / 187 tools** (debug 20 → 21).

### #1 — CORS hoist + Vary: Origin on deny branch (T-V28-1)

`source/mcp-server-sdk.ts` /game/* request handler:
- Hoists `resolveGameCorsOrigin(req.headers.origin)` to a single
  `gameAcao` classification at the top of the branch. The OPTIONS
  preflight, the response-header writer, and the post-CORS 403
  enforcement all reuse the same value instead of re-classifying twice
  per request.
- Emits `Vary: Origin` on BOTH the allow- and deny- branches. v2.7.0
  set Vary only when an ACAO header was actually emitted, leaving a
  window where a shared browser cache could serve a cached allowed-
  origin response to a later disallowed origin (or vice versa). Vary
  now keys cache uniformly regardless of outcome.

Carryover from v2.7.0 review Claude single-reviewer 🟡; no functional
change for legitimate browser flows.

### #2 — Realpath containment for all auto-named capture paths (T-V28-2)

`source/tools/debug-tools.ts`:
- New helper `resolveAutoCaptureFile(basename)` returning
  `{ ok, filePath, dir }` with the same realpath containment check
  v2.6.1 added to `persistGameScreenshot`.
- Applied at all 4 auto-named capture sites:
  - `screenshot()`              → `screenshot-<ts>.png`
  - `capturePreviewScreenshot()`→ `preview-<ts>.png`
  - `batchScreenshot()`         → `batch-<ts>` prefix
  - `persistGameScreenshot()`   → `game-<ts>.<ext>` (refactored to
    use the helper too — eliminates the inline copy)

Carryover from v2.7.0 Codex single-reviewer 🟡. Protects against
`<project>/temp/mcp-captures` resolving outside the project tree via
a symlink chain.

### #3 — debug_preview_control tool (T-V28-3)

New MCP tool: `debug_preview_control` with `op: 'start' | 'stop'`.
Programmatically enters or exits Preview-in-Editor (PIE) play mode —
equivalent to clicking the toolbar play button.

Implementation routes through `runSceneMethodAsToolResponse` to a new
scene-side method `changePreviewPlayState(state)` in `source/scene.ts`
which calls the typed `cce.SceneFacade.changePreviewPlayState` method
documented on `SceneFacadeManager` in
`@cocos/creator-types/.../scene-facade-manager.d.ts:250`.

The HANDOFF originally listed the undocumented Editor.Message channel
`scene/editor-preview-set-play` for this. During T-V28-3 reconnaissance
we found the typed facade method and went with that instead so the
callsite is type-checked and not subject to silent removal between
cocos versions.

Pairs with `debug_capture_preview_screenshot`: AI can now start PIE,
wait for the preview window to appear, and capture without a human
clicking the toolbar.

Tool count: 186 → 187. Gemini-compat smoke confirms all 187 schemas
remain inline (no $ref / $defs / definitions).

## v2.7.3 — 2026-05-02

Codex round-2 re-attendance patch (Codex was out-of-credits during the
v2.7.1 → v2.7.2 cycle; ran the cumulative review since v2.7.0 release
once credits returned). 2 🔴 + 2 🟡 caught — all addressed.

### 🔴 #1 — `HANDOFF.md` body version stale at v2.7.1

`docs/HANDOFF.md:10` body said "當下版本：v2.7.1" while the heading
already pointed to v2.7.2. v2.7.2 patched the heading but missed the
body line. v2.7.3 syncs body + heading to "v2.7.3".

### 🔴 #2 — v2.8.0 candidate list duplicates v2.7.0-shipped tools

`docs/HANDOFF.md:25-28` listed `capture_preview_screenshot` and
`debug_query_devices` as v2.8.0 spillover candidates, but both
shipped in v2.7.0 (#3, #4). Same for `debug_preview_url` family.
v2.7.3 prunes the candidate list to truly outstanding items
(MediaRecorder record, RomaRogov macro-tool routing,
PIE-internal preview start/stop, Vary/hoist polish, screenshot
realpath check).

### 🟡 #1 — Smoke step 21 no-Origin case didn't assert `ACAO: *`

`scripts/smoke-mcp-sdk.js:328` only checked the 200 status; a future
bug that dropped the wildcard echo would slip past. Added strict
`headers['access-control-allow-origin'] === '*'` assertion in
parallel with the other 5 sub-cases.

### 🟡 #2 — `CLAUDE.md:51` `debug-tools.ts` v2.3.0 math misleading

The comment listed v2.3.0 as adding 4 tools (including `execute_script`),
but `execute_script` is a compat alias for the older
`debug_execute_script` — not net-new. Reworded "v2.3.0 net +3" with
explicit alias note. Live count remains 20.

## v2.7.2 — 2026-05-02

Three-way review patch round 2 on v2.7.1 (Gemini r2 完整, Claude r2
stalled mid-output, Codex r2 out-of-credits — 1 reviewer fully landed
+ 1 partial). Doc-only fixes; no source changes beyond version stamps.

### 🔴 doc accuracy — `CLAUDE.md` architecture map drift

Gemini r2 caught three drift points in the per-file tool-count
comments at `CLAUDE.md:44-57`. Verified against the live registry via
`npm run check:gemini`:

- `debug-tools.ts` 17 → **20** (the v2.7.1 update under-counted by 3
  because v2.3.0's `execute_javascript`/`execute_script`/`screenshot`/
  `batch_screenshot` were never added to the comment after the
  baseline-9 line).
- `node-tools.ts` 11 → **12** (off-by-one drift; nobody noticed
  through 5+ minor versions).
- `component-tools.ts` 10 → **11** (same drift class).

Plus **four entries that were never in the architecture map**:

- `inspector-tools.ts` (2 tools, added v2.4.0 step 6)
- `asset-meta-tools.ts` (3 tools, added v2.4.3)
- `animation-tools.ts` (4 tools, added v2.4.8 A2)
- `file-editor-tools.ts` (4 tools, added v2.5.0)

Sum across all 18 files now reconciles to **186** ✓.

### 🟡 — `HANDOFF.md` next-session heading stale

Claude r2 (partial) noted the heading still said `next: v2.7.0` after
v2.7.0 already shipped + v2.7.1 patched. Heading rewritten to point at
v2.8.0 with a recommendation to live-reload-retest v2.7.x first.

### Round-2 reviewer attendance note

- Gemini r2 — full review, 3 🔴 + 2 🟡 + 6 🟢
- Claude r2 — stalled mid-stream after partial 🟡; the 🟡 (HANDOFF
  heading) was extracted and addressed
- Codex r2 — failed with out-of-usage (resets 16:00 Asia/Taipei);
  re-attendance not blocking because the actionable findings already
  came from Gemini and partial Claude

If Codex's re-run later surfaces additional issues, those will fold
into a v2.7.3 (or be deferred to v2.8.0 if cosmetic).

## v2.7.1 — 2026-05-02

Three-way review patch round 1 on v2.7.0 (Claude + Codex + Gemini).
**4 🔴** must-fix + **4 ≥2-reviewer 🟡** addressed. No new tools; tool
count stays at 18 categories / 186 tools. `SERVER_VERSION` bumped to
`'2.7.1'`.

### 🔴 #1 — `resolveGameCorsOrigin` JSDoc contradicted impl (Claude + Codex)

`source/mcp-server-sdk.ts:756-760` claimed the helper returns sentinel
`'null'` for no-Origin requests, but the code returns `'*'`. Code
behavior is correct (no-Origin = curl/Node = wildcard echo); JSDoc
rewritten to match.

### 🔴 #2 — CHANGELOG "public Editor.Message channels" inaccurate (3-reviewer)

`preview / query-preview-url` is declared under
`@types/protected/message.d.ts`, not the unprotected `index.d.ts`.
v2.7.0 CHANGELOG #3 lumped both new tools as "public" — only
`device/query` is. Per-tool wording corrected; the protected-type
caveat is now visible to anyone reading the release notes.

### 🔴 #3 — Smoke step 21 missing preflight + ACAO-absent assertions (Claude)

`scripts/smoke-mcp-sdk.js:288` previously verified disallowed-origin
GET returns 403 but didn't assert the response *omits* ACAO; a future
bug that emitted `ACAO: *` while still returning 403 would slip past
(browser would still block, but the contract regression would go
undetected). Also missing: OPTIONS preflight 403 path. Both added.

Bonus: defensive locks for `Origin: null` literal (file://) and
`localhost.evil.com` strict-rejection — these branches were already
correct but uncovered by smoke; the new assertions pin the
behavior.

### 🔴 #4 — IPv6 `[::1]` Node-version portability (Gemini 🔴 + Claude 🟡)

`source/mcp-server-sdk.ts:777` strict-matched `u.hostname === '[::1]'`.
On Node 22 (cocos 3.8.6 bundles this) the URL parser keeps brackets,
so the check works empirically — but older bundled Node builds may
strip them. Accept both forms (`'[::1]' || '::1'`) to insulate the
allowlist from cocos editor's runtime version drift.

### 🟡 — also addressed

- `client/cocos-mcp-client.ts capturePreviewScreenshot`: substring
  match `includes('Preview')` could falsely catch a Chinese / localized
  cocos editor whose main window title includes "Preview". When the
  caller stuck with the default `windowTitle='Preview'`, exclude any
  title that ALSO matches `/Cocos\s*Creator/i`. Caller-provided custom
  titles bypass the negative filter (explicit intent). Capture is now
  done from the matched window directly so the disambiguation can't
  drift through `pickWindow` (Claude + Codex).
- `source/tools/debug-tools.ts previewUrl`: `openExternal` resolves
  when the OS handler is invoked, not when the page renders. Reword
  `data.opened: true` → `data.launched: true`, top-level message says
  "Launched … (page render not awaited)" or "launch failed" when the
  shell call throws (Codex + Gemini).
- `CLAUDE.md` "Total tool count today" 183 → 186 + debug category
  count 9 → 12 (post-v2.7.0 tools); `docs/HANDOFF.md` next-entry
  blurb 183 → 186 (Codex flagged twice).
- v2.7.0 CHANGELOG #3 wording clarification (above) doubles as a
  paid-down "honesty about channel maturity" item per CLAUDE.md
  convention.

### Deferred to later patch

- `Vary: Origin` on disallowed-origin branch (Claude single-reviewer).
- Hoisting the double `resolveGameCorsOrigin` call into one variable
  (cosmetic; pure function so safe).
- Connection drop after 403 on `/game/result` (Codex; 32 MB body cap
  from v2.6.1 already protects the OOM path).
- Realpath check on `screenshot()` auto-named save path (Codex;
  pre-existing v2.6.x carry-over, not introduced by v2.7.0).
- Smoke coverage for `debug_preview_url`, `debug_query_devices`,
  `debug_capture_preview_screenshot` (Codex; need Electron mock or
  live editor).

## v2.7.0 — 2026-05-02

Preview-QA + security hardening minor. Four sub-tasks landed across
four commits; tool count 183 → 186 (+3: debug_preview_url,
debug_query_devices, debug_capture_preview_screenshot). 18 categories
unchanged. `SERVER_VERSION` bumped to `'2.7.0'`. Three-way review
pending.

### #1 — close `reflect-metadata` cleanup verification

v2.4.0 step 5 already adopted the descriptor-capture decorator pattern
without `reflect-metadata`; the v2.7.0 candidate listed this for a
follow-up cleanup, but verification confirms there is nothing to clean:
`emitDecoratorMetadata` was never set, `reflect-metadata` was never
installed, and `source/` has zero `Reflect.*` references.
`experimentalDecorators` stays — it is required by the stage-2
`@mcpTool` signature. Strike from spillover candidate list with
rationale inline (HANDOFF + roadmap 06).

### #2 — CORS scoping for `/game/*` endpoints (Claude W7 from v2.6.0 review)

`source/mcp-server-sdk.ts handleHttpRequest`: the wildcard ACAO that
the panel webview needs is no longer applied to `/game/*`. Instead a
per-request origin allowlist (`file:`, `devtools:`,
`http://localhost:*`, `http://127.0.0.1:*`, no-Origin) decides whether
to echo back the Origin or omit ACAO; preflight from disallowed
origins gets `403`, and the actual GET/POST also rejects 403 to defend
against simple-request CORS bypass. Mitigates the cross-tab race
attack against the single-flight queue (a malicious local browser tab
could time `/game/result` to free `_pending` mid-cycle in v2.6.x).

`/api/*`, `/mcp`, `/health` keep wildcard CORS — the panel webview is
still on the original trust footing. Smoke step 21 covers
disallowed-origin 403 + allowed-origin echo + no-Origin pass.

### #3 — `debug_preview_url` + `debug_query_devices` (+2 tools)

Backed by typed `Editor.Message` channels (NB: not all of them are
"public" — see per-tool note below):

- `preview / query-preview-url` (declared under
  `@cocos/creator-types/editor/packages/preview/@types/protected/`,
  semantically less public than the unprotected `device/query` channel
  but stable across cocos 3.8.x; we cast `as any` to acknowledge the
  protected type location). Returns the cocos browser-preview URL
  (e.g. `http://localhost:7456`). With `action='open'` we also
  `electron.shell.openExternal` it. Useful as a setup step before
  `debug_game_command` since the GameDebugClient must reach the
  preview.
- `device / query` (genuinely public, declared under the unprotected
  `device/@types/message.d.ts`). Returns configured `cc.IDeviceItem`
  entries (`{name, width, height, ratio}`); enables batch-screenshot
  pipelines targeting multiple resolutions.

Editor-side Preview-in-Editor play/stop is **NOT** shipped. The harady
route uses the undocumented `scene/editor-preview-set-play` channel
plus a toolbar-window `executeJavaScript` shim — both depend on
private state. CLAUDE.md convention is to avoid try-catch through
fallback paths on undocumented channels.

### #4 — `debug_capture_preview_screenshot` (+1 tool)

`source/tools/debug-tools.ts capturePreviewScreenshot`: thin wrapper
around the existing `screenshot` impl with `windowTitle='Preview'`
default, friendlier error when no PIE window exists (lists visible
window titles to aid AI diagnosis), and a project-rooted
`preview-<ts>.png` name so PIE captures don't collide with editor
screenshots in `<project>/temp/mcp-captures/`.

Pairs with `debug_screenshot` (editor window) and
`debug_game_command(type='screenshot')` (game canvas via RenderTexture
readback through GameDebugClient) to form the three-tier capture set:

| Tool | Surface |
|---|---|
| `debug_screenshot` | main editor window (focused or by title) |
| `debug_capture_preview_screenshot` | Preview-in-Editor window |
| `debug_game_command screenshot` | game canvas pixels (camera RT) |

## v2.6.2 — 2026-05-02

Three-way review patch round 2 on v2.6.1 (Claude + Codex + Gemini).
Round 2 converged with no behavior-level findings — single ≥2-reviewer
🟡 was a doc-string staleness in `CLAUDE.md` landmine #15 (still said
"181 v2.6.0" after the v2.6.0 bump moved tool count to 183). Fix is a
one-line update to "183 v2.6.1".

`SERVER_VERSION` bumped to `'2.6.2'` to keep the panel display in
sync with the on-disk version after extension reload.

Round 2 single-reviewer 🟡 deferred (rationale logged inline):

- Symlink check in `persistGameScreenshot` is technically a tautology
  given `path.dirname(path.join(dir, x)) === dir` (Claude). Comment
  overstates what the check accomplishes; the check is benign because
  the basename is fully server-controlled. Re-anchoring against
  `Editor.Project.path` is a future cleanup.
- 413-after-`req.destroy()` may write headers to a half-closed socket
  (Claude). Node silently no-ops; not a crash path.
- `getClientStatus().queued` semantic — after consume the slot is
  "in flight" not "queued", but we still report `queued: true` (Claude).
  Consider rename in a future cycle.
- `Math.ceil(b64Len * 3 / 4)` overestimates by ≤2 bytes when base64
  has padding (Codex). Off-by-one at the cap boundary; ≤2 bytes off
  on a 32 MB cap is meaningless.

## v2.6.1 — 2026-05-02

Three-way review patch round 1 on v2.6.0 (Claude + Codex + Gemini).
**5 🔴 must-fix** + **6 ≥1-reviewer 🟡** addressed. No new tools; tool
count stays at 18 categories / 183 tools. `SERVER_VERSION` bumped to
`'2.6.1'`.

### 🔴 must-fix #1 — `consumePendingCommand` re-delivery race (Codex)

`source/lib/game-command-queue.ts:60` — `consumePendingCommand()` returned
the pending slot without marking it claimed. Two GameDebugClient
instances (or a client that re-poll-loops faster than the host
processes results) could both see the same command and execute it
twice. Single-flight invariant was real for the host queue but leaked
into the client side.

Fix: wrap `_pending` in `{cmd, claimed}` and flip `claimed` on first
consume; subsequent consumes return null until either
`setCommandResult` resolves or `awaitCommandResult` times out.

### 🔴 must-fix #2 — `/game/result` body unbounded → DoS (Codex + Claude)

`source/mcp-server-sdk.ts:696` `readBody()` accumulated chunks with no
byte cap. With CORS wildcard, any local browser tab could POST
gigabytes and OOM the host. Pre-existing for `/mcp` and `/api/*` too.

Fix: hoist `readBody` to enforce a 32 MB cap and throw
`BodyTooLargeError`; the HTTP error handler maps it to `413`. Cap is
generous enough for legitimate 4k-canvas screenshot data URLs.

### 🔴 must-fix #3 — screenshot base64 size unbounded → disk fill (Codex)

`source/tools/debug-tools.ts persistGameScreenshot` decoded any base64
length the client sent and `writeFileSync`'d it. Combined with #2
this made it easy to fill disk via `/game/result`.

Fix: cap at 32 MB (matches request-body cap); approximate decoded byte
count from base64 length BEFORE allocating Buffer; double-check the
decoded buffer length post-decode.

### 🔴 must-fix #4 — `decodeUuid` false-positive on base64-shaped strings (Claude + Codex)

`source/lib/uuid-compat.ts` v2.6.0 predicate "decoded contains `@`"
hit an empirical 5-7% false-positive rate at length 20/24/28 because
random base64 occasionally decodes to bytes containing 0x40. Cocos
internal importer-generated keys or third-party UUIDs in those length
buckets would be silently mangled before reaching `query-asset-info`.

Fix: tighten the predicate to require the decoded value match a
canonical cocos sub-asset UUID shape
(`<8-4-4-4-12 hex>@<sub-key>`). Plain UUIDs and email-shaped base64
both pass through unchanged.

### 🔴 must-fix #5 — `persistGameScreenshot` symlink check broken (Claude + Codex + Gemini)

`source/tools/debug-tools.ts persistGameScreenshot` realpath'd
`dirResult.dir` but compared against `path.dirname(filePath)` raw.
Since `filePath = path.join(dir, basename)`, `path.dirname(filePath)`
collapses back to the original `dir` string, so the comparison really
asked "does `dir` contain a symlink anywhere?" — fail-rejecting
legitimate symlinked temp dirs (macOS `/var → /private/var`, custom
mounts).

Fix: realpath BOTH sides via `realpathSync.native ?? realpathSync`
(the v2.5.1 file-editor pattern). True containment check.

### 🟡 worth-considering — also addressed

- `source/mcp-server-sdk.ts /game/result` payload now requires
  `typeof success === 'boolean'`, not just an `id`. Prevents a
  buggy client posting `{id, error}` from sneaking past as success
  (Claude W2).
- `source/lib/game-command-queue.ts awaitCommandResult` clears the
  slot on timeout even if `_pending.id` no longer matches the
  awaiter — defensive against future reuse paths (Claude W3).
- `CLAUDE.md` tool count synced to 183 with version bump rule
  (Claude W4).
- `package.json` adds `npm run check:gemini` and `npm run smoke`
  scripts. Gemini guard is now a one-liner away from CI integration
  (Claude W5).
- `client/cocos-mcp-client.ts takeScreenshot` skips `!n.active`
  subtrees during camera DFS (Gemini).
- `client/cocos-mcp-client.ts takeScreenshot` row-flip uses
  `imageData.data.set(buffer.subarray(...))` instead of per-byte
  loop — meaningful for 4k canvases (Gemini).
- `client/cocos-mcp-client.ts inspectNode` reads `__cid__` /
  `Symbol.for('cc:cls:name')` before falling back to
  `constructor.name` so minified release builds still produce
  meaningful component types (Gemini).
- `source/lib/game-command-queue.ts POLL_TIMESTAMP_FRESH_MS` raised
  from 2000 → 5000 to tolerate remote-device debugging and laggy
  networks (Gemini).
- `package.json releaseDate` + `CHANGELOG` v2.6.0 header date
  corrected from `2026-05-04` (typo / wrong dateformat output) to
  the actual release day (Codex).
- `scripts/smoke-mcp-sdk.js` adds full queue round-trip (queue → poll
  → re-poll-rejected → result → status idle) and a 400 case for
  bad-shape `/game/result` (Codex).

### Deferred to later patch / docs

- CORS scoping for `/game/*` endpoints (Claude W7) — needs design
  before applying because the same wildcard is shared with
  `/api/*`/`/health` and serves the panel webview.
- `silent` flag wording mismatch in `client/README.md` (Claude W8) —
  cosmetic.
- `GameDebugClient` doc note for native (Android/iOS) builds where
  `document` is undefined (Claude W9) — docs only, will fold into
  the next docs commit.

## v2.6.0 — 2026-05-02

Cross-LLM compat + runtime QA milestone. Three deliverables, all derived
from the cross-repo survey:

- **Gemini-compat schema guard** (`scripts/check-gemini-compat.js`) —
  walks every tool's `inputSchema` and fails if any contains
  `$ref` / `$defs` / `definitions`. Verified: zod 4 +
  `target: 'draft-7'` already inlines reused subschemas (no patch
  needed unlike cocos-cli's middleware route). Guard exists to catch
  silent regression if zod, target, or hand-written schemas change.
  CLAUDE.md landmine #15 documents the contract.
- **`debug_game_command` + GameDebugClient** (T-V26-1, harady route) —
  three new HTTP endpoints (`/game/command` GET poll, `/game/result`
  POST writeback, `/game/status` GET liveness) backed by an in-memory
  single-flight queue (`source/lib/game-command-queue.ts`). Two new
  MCP tools (`debug_game_command`, `debug_game_client_status`) bring
  the count to **183 / 18 categories**. A drop-in client template
  (`client/cocos-mcp-client.ts`) ships next to the server; users
  import it from their game's startup. Built-in commands: screenshot
  (RenderTexture readback → host writes PNG to
  `<project>/temp/mcp-captures/`), click (Button.CLICK emit by node
  name), inspect (runtime node dump). Custom commands via the
  `customCommands` map. Single-flight is enforced at queue time
  (second `queueGameCommand` returns an error rather than silently
  overwriting), and result IDs are stamped so a stale slow client
  response can't bleed into the next command's await.
- **`decodeUuid` UUID compat layer** (RomaRogov route) — new
  `source/lib/uuid-compat.ts` exposes `decodeUuid` /  `encodeUuid`.
  Cocos sub-asset UUIDs use `<uuid>@<sub-key>`; clients that
  base64-encode `@`-containing strings to dodge wire mangling now
  work transparently. Decode is gated on the result containing `@`,
  so plain UUIDs and arbitrary base64 strings pass through unchanged.
  Applied at `assetMeta_*` tool entry points (the only place sub-asset
  UUIDs reach our API today); other tools opt in by importing the
  helper.

`SERVER_VERSION` bumped to `'2.6.0'`. Three-way review pending.

## v2.5.1 — 2026-05-03

Three-way review patch round 1 on v2.5.0 (Claude + Codex + Gemini).
4 🔴 must-fix + 5 ≥2-reviewer 🟡, all addressed.

### 🔴 must-fix #1 — `SERVER_VERSION` stale at '2.0.0' (Gemini)

`source/mcp-server-sdk.ts:25` was hardcoded as `'2.0.0'` since the
v2.0 era. MCP clients see this string during the initialize handshake;
drifted across all subsequent releases. Fix: bump to `'2.5.1'` and
add a comment to keep in sync on minor/major bumps.

### 🔴 must-fix #2 — `notifyResourceUpdated` dropped Promise rejections (Codex)

`session.sdkServer.notification(...)` returns a Promise; the v2.5.0
version called it without await/catch, so transport-level failures
became unhandled rejections (Node prints scary warnings; can exit on
`--unhandled-rejections=strict`). Fix: `void
session.sdkServer.notification(...).catch(err => logger.warn(...))`.
Bonus: snapshot the session list before iterating (claude 🟡) so a
session removed mid-fanout doesn't skew the dispatch count.

### 🔴 must-fix #3 — `prompts/get` unknown name returned success body (Codex 🔴 + Claude 🟡)

`prompts.get(name)` previously returned a `PromptContent` whose
`description` was literally "Prompt not found: X". Per MCP spec,
unknown prompt names must surface as JSON-RPC errors so clients can
distinguish "no such prompt" from a real prompt that contains
helpful text. Fix: `PromptRegistry.get` now returns `null` for
unknown names; the handler in `mcp-server-sdk.ts` throws an Error
with the available names so the SDK converts it to a proper
JSON-RPC error.

### 🔴 must-fix #4 — `replace_text` regex backreferences silently broken (Codex)

`source/tools/file-editor-tools.ts` `content.replace(regex, () =>
args.replace)` uses a function callback whose return value is the
literal `args.replace` string — `$1` / `$&` / `` $` `` / `$'`
backreferences NEVER expand because the function form bypasses
String.replace's substitution-string parsing. The tool description
explicitly promised backreference support. Fix: pass `args.replace`
as a string directly to `String.replace`; count matches separately
via a parallel `match()` pass since we no longer have the per-call
counter.

### 🟡 polish (≥2-reviewer agreement)

- **Empty `search` rejected at the schema layer** (Codex + Claude):
  `replaceAll('', x)` inserts `x` between every character; first-only
  inserts at byte 0. Both surprising. `search: z.string().min(1)`.
- **Regex DoS guard via per-mode size cap** (Codex + Claude + Gemini):
  regex mode now refuses files > `REGEX_MODE_BYTE_CAP` (1 MB);
  plain-string mode keeps `FILE_READ_BYTE_CAP` (5 MB). Catastrophic
  backtracking on a large file would otherwise hang the editor host.
- **CRLF preservation on file writes** (Claude): split via `/\r?\n/`
  + detect the dominant EOL in the first 4 KB + rejoin with detected
  EOL. Writes return `eol: "CRLF" | "LF"` in `data` for verification.
  Without this, every edit on a Windows project silently rewrote
  CRLF lines as LF.
- **`fs.realpathSync.native` fallback** (Codex 🟡): some cocos-bundled
  Node builds historically don't expose `.native`. Resolve once at
  module load: `fs.realpathSync.native ?? fs.realpathSync`.
- **probe-broadcast partial-cleanup safety** (Codex 🟡): if
  `addBroadcastListener` throws partway through registration, the
  v2.5.0 script left earlier listeners dangling past the probe's
  lifetime. Now wrapped in try/finally that unregisters every
  successfully-added handler.

### Test runs after fixes

- `tsc --noEmit`: clean.
- `scripts/smoke-mcp-sdk.js`: ✅ all smoke checks passed.
- Tool count unchanged: 18 categories / 181 tools.

## v2.5.0 — 2026-05-03

Multi-client breadth: file-editor + Notifications + Prompts. Targets
clients without native file ops (Claude Desktop / Cline / Continue) and
adds two MCP-spec capabilities (resources/subscribe, prompts) that
were previously stubbed. **18 categories / 181 tools** (was 17 / 177).

### T-V25-1 — file-editor 4 tools (new `fileEditor` category)

- `file_editor_insert_text(filePath, line, text)`
- `file_editor_delete_lines(filePath, startLine, endLine)`
- `file_editor_replace_text(filePath, search, replace, useRegex?, replaceAll?)`
- `file_editor_query_text(filePath, startLine?, endLine?)`

Description tagged `[claude-code-redundant]` so Claude Code's ranker
prefers the IDE's native Edit/Write. Other clients without native
file ops use this for source code edits.

Hardening over upstream Spaydo cocos-mcp-extension:
- Path safety via `fs.realpathSync.native` on BOTH target and project
  root (same v2.4.9 fix applied to debug_get_script_diagnostic_context).
  Plain `path.resolve+startsWith` Spaydo used is symlink-unsafe; a
  symlink inside the project pointing outside still passed.
- Asset-db refresh hook on writes for cocos-recognised extensions
  (.ts/.tsx/.js/.json/.scene/.prefab/.anim/.material/.effect/.fnt).
  Editor reimports automatically; failure non-fatal.
- 5MB read cap, case-insensitive containment compare on Windows,
  zod schema with describe(), defineTools declarative pattern.

### T-V25-2 — `scripts/probe-broadcast.js` (sampling helper)

Standalone Node CLI that drives a 30s editor-context sampling
expression via `/api/debug/execute_javascript`. Registers listeners
on `Editor.Message.__protected__.addBroadcastListener` for ~14
broadcast types likely to be noisy (scene mutations, asset-db,
build-worker), samples for `PROBE_SAMPLE_MS` (default 30 000), then
prints per-type `{count, eventsPerSec, firstAt, lastAt}` to stdout.

Used to inform the debounce window choice for T-V25-3 Notifications.
Requires `enableEditorContextEval = true` temporarily; turn off again
after sampling.

### T-V25-3 — Notifications T-P3-3 (resources/subscribe)

- New `source/lib/broadcast-bridge.ts`. `BROADCAST_TO_URIS` maps
  cocos broadcast type → list of cocos:// resource URIs to
  invalidate. `scene:change-node` touches scene/current +
  scene/hierarchy; `scene:save-asset` broadcasts to all scene
  resources + prefabs + assets;  `asset-db:asset-{add,change,delete}`
  touches assets + prefabs + scene/list. Per-URI debounce (default
  1s/URI; tunable via `setDebounceMs`).
- `BroadcastBridge.start(dispatch)` registers via
  `Editor.Message.__protected__.addBroadcastListener`. When a listener
  fires, schedules a single timer per URI that invokes
  `dispatch(uri)` once. `stop()` removes all listeners + clears
  pending timers. Graceful no-op fallback when `__protected__`
  isn't available (headless smoke).
- `mcp-server-sdk.ts`: capability `resources.subscribe: true` (was
  false). `SessionEntry.subscriptions: Set<string>` tracks URIs the
  session subscribed to; created at session-init time and shared by
  reference with the session's Subscribe/Unsubscribe handlers.
  `notifyResourceUpdated(uri)` iterates sessions and pushes
  `notifications/resources/updated` only to subscribers.
- Bridge lifecycle tied to MCPServer.start()/stop().

Debounce rationale: probe-broadcast.js exists for tuning but data
collection is user-side. 1s/URI is the conservative default; worst
case (drag-at-60fps) collapses to 1 push/sec/URI.

### T-V25-4 — Prompts T-P3-2 (4 templates)

- `source/prompts/registry.ts`. PromptRegistry with `list()` +
  `get(name)`. 4 templates ported from FunplayAI route:
  `fix_script_errors`, `create_playable_prototype`,
  `scene_validation`, `auto_wire_scene`.
- Each `get(name)` bakes `Target Cocos project: <name>` + `Project
  path: <path>` header into the rendered text (lazy resolver — Editor
  may not be ready at MCPServer construction but is at call time).
  Templates have no arguments; fully baked.
- Body text guides AI to default to `execute_javascript` and only
  switch to specialist tools when they are clearly the better
  primitive (TS diagnostics, screenshots, scene/asset resource
  reads, animation_set_clip with set-property propagation per
  Landmine #11).
- Capability `prompts.listChanged: false` (no hot-reload v2.5).
- `prompts/list` + `prompts/get` handlers registered per session.

### Tool count

18 categories / 181 tools.

## v2.4.12 — 2026-05-03

Live-retest patch on v2.4.11. Reload-tested A4 (templates handler),
A3 (capturedLogs envelope), A2 (animation_* full flow with
playOnLoad scalar set-property persistence). A1
`debug_run_script_diagnostics` failed in real cocos editor — Node
22+'s CVE-2024-27980 patch refuses to spawn .cmd / .bat files via
execFile without `shell: true`. The validation throws SYNCHRONOUSLY
inside the executor, before the callback can run, so the Promise
rejected and the caller's outer catch surfaced a generic
"spawn EINVAL" instead of our structured spawnFailed envelope.

### live-retest fix — A1 spawn EINVAL on Windows .cmd

`source/lib/ts-diagnostics.ts:execAsync`:

1. Detect `.cmd` / `.bat` on Windows; pass `shell: true` so the
   binary routes through cmd.exe (allowed under the CVE patch).
2. With `shell: true`, Node does NOT auto-quote args, so we
   manually wrap any arg containing whitespace or shell-special
   characters (`& < > | ^ "`) in double quotes, doubling internal
   `"` per cmd.exe escape rules. Only the file string and tsconfig
   path can have spaces in our usage; both go through `quoteForCmd`.
3. Wrap the `execFile` call in `try/catch` so synchronous validation
   throws (EINVAL etc.) still reach our `onResult` handler instead
   of rejecting the outer promise. The structured `spawnFailed:
   true` envelope is preserved.

### Live-retest summary (v2.4.11 reload, before this patch)

| 測項 | 結果 |
|---|---|
| `/health` reports 177 tools / 17 categories | ✅ |
| A4 `resources/templates/list` returns 2 templates | ✅ |
| A3 `capturedLogs` field present on scene-bridge tool results (`prefab_get_prefab_data`, `animation_*`) | ✅ |
| A2 `animation_list_clips` on cc.Animation node — empty clips, defaultClip null, playOnLoad false | ✅ |
| A2 `animation_play` without defaultClip → friendly error | ✅ |
| A2 `animation_set_clip {playOnLoad:true}` → set-property writes scalar | ✅ |
| A2 `animation_list_clips` re-read shows playOnLoad=true persisted | ✅ Landmine #11 scalar path verified |
| A2 `animation_stop` no-op when nothing playing | ✅ |
| A2 `nodeName` fallback resolves to same uuid | ✅ |
| A2 `set_clip` with both fields undefined → reject | ✅ |
| A1 `debug_run_script_diagnostics` | 🔴 spawn EINVAL — fix in this patch |

A1 will be retested after user reload to v2.4.12.

## v2.4.11 — 2026-05-03

Three-way review patch round 3 on v2.4.10. Codex elevated one round-3
🟡 to 🔴 (refcount leak if `_ensureConsoleHook` throws); Claude and
Gemini concurred at 🟡. Single line change.

### 🔴 must-fix — refcount leak path on hook-install failure (Codex 🔴; Claude+Gemini 🟡)

`source/scene.ts:runWithCapture` had:

```ts
_activeSlotCount += 1;
_ensureConsoleHook();         // outside the try
try { ... } finally { _activeSlotCount -= 1; ... }
```

If `_ensureConsoleHook()` ever threw (today it's pure property
assignments and won't, but defensive matters for future growth),
`_activeSlotCount` would remain incremented and `_maybeUnhookConsole`
would never run, leaving the console hook installed permanently.

Fix: move `_ensureConsoleHook()` INSIDE the `try` block so the
`finally` decrement guards both the increment and the hook install.
Increment stays outside `try` per the standard "increment then
guarded decrement" pattern, matching the slot lifecycle.

### Test runs after fix

- `tsc --noEmit`: clean.
- `scripts/smoke-mcp-sdk.js`: ✅ all smoke checks passed.
- Tool count unchanged: 17 categories / 177 tools.

## v2.4.10 — 2026-05-03

Three-way review patch round 2 on v2.4.9. Codex elevated one round-1
🟡 to 🔴 on round 2 (the `_topSlot()`-only model still misattributed
interleaved async logs); Claude and Gemini concurred at 🟡 severity.
One additional 🟡 raised by all three reviewers on round 2 also
addressed.

### 🔴 must-fix #1 — Async-interleaving log misattribution (Codex 🔴; Claude+Gemini 🟡)

`source/scene.ts:runWithCapture` v2.4.9 isolated cross-call leakage
via `_topSlot()` (only the current top-of-stack slot received entries
from the console hook), but that only worked for strictly LIFO-nested
calls. Two `runWithCapture` calls that interleave via `await` could
still misattribute: A pushes slot A, A awaits, B pushes slot B; A's
post-await `console.log` would route to slot B (now top-of-stack)
instead of slot A.

Fix: replace the manual stack with Node.js's built-in
`AsyncLocalStorage`:

- `_captureALS = new AsyncLocalStorage<CaptureSlot>()` at module head.
- `runWithCapture` does `await _captureALS.run(slot, async () => {...})`,
  which binds `slot` to the call's logical async chain.
- Console hook reads `_captureALS.getStore()` instead of stack top —
  the store is automatically scoped to the originating call's async
  context regardless of stack interleaving.
- Hook lifecycle: keep `_activeSlotCount` as a refcount so the hook
  uninstalls when no slot is active (ALS doesn't expose store count
  directly).

Available in Node.js ≥ 12.17, which the cocos editor's Electron host
satisfies.

### 🟡 worth-considering — Warnings-only runs reported as failure (Claude + Codex + Gemini)

`source/lib/ts-diagnostics.ts:runScriptDiagnostics` v2.4.9 now parses
warnings into `diagnostics[]` (severity field added in round-1 fix
#6). But `ok` was still `code === 0 && diagnostics.length === 0` —
so a project that compiled cleanly but had `warning` severity
diagnostics (typically from TypeScript plugins, since plain tsc
doesn't emit warnings) flipped `ok` to `false` and bubbled up as
`success: false` on the tool envelope. tsc itself exits 0 on
warnings-only runs (warnings are non-fatal); the boolean should
match.

Fix: count diagnostics by severity. `errCount = filter(severity ===
'error' || severity == null).length`. `ok = !spawnFailed && code ===
0 && errCount === 0`. Summary still names warning count for
visibility.

### 🟡 worth-considering — Truncation marker bytes uncounted (Codex + Claude)

`source/scene.ts:_appendBounded` v2.4.9 pushed the `[capture
truncated]` marker but didn't increment `slot.bytes`. Benign because
no further appends occur after `truncated=true`, but inconsistent —
the cap accounting silently undercounts the marker's ~64 byte
contribution.

Fix: count the marker against `slot.bytes` after the push so the
field stays monotonically accurate.

### Test runs after fixes

- `tsc --noEmit`: clean.
- `scripts/smoke-mcp-sdk.js`: ✅ all smoke checks passed.
- Tool count unchanged: 17 categories / 177 tools.

## v2.4.9 — 2026-05-03

Three-way review patch round 1 on v2.4.8 (Claude + Codex + Gemini).
Two 🔴 must-fix + four 🟡 worth-considering raised by ≥ 2 reviewers,
all addressed.

### 🔴 must-fix #1 — `runScriptDiagnostics` ENOENT silent (Claude + Codex)

`source/lib/ts-diagnostics.ts` `execAsync` previously coerced any
non-numeric `error.code` (e.g. `'ENOENT'` when the resolved tsc
binary doesn't exist) to `0`, so a missing tsc made the run report
`ok: true` with empty diagnostics — AI saw "no errors" when tsc
never ran.

Fix:
- `execAsync`: distinguish spawn failures (non-numeric error code)
  from non-zero exits (compile errors). Return `code: -1 +
  spawnFailed: true` on the former.
- `runScriptDiagnostics`: `ok` requires `!spawnFailed && code === 0
  && diagnostics.length === 0`. Summary explicitly names the spawn
  failure including the resolved binary path so AI sees "tsc binary
  failed to spawn (spawn ENOENT)" instead of "no errors".
- Tool result `data` carries explicit `spawnFailed` boolean and
  `systemError` string so the failure is structured, not buried in
  prose.

### 🔴 must-fix #2 — symlink escape on `get_script_diagnostic_context` (Codex)

`source/tools/debug-tools.ts` path-safety previously used
`path.resolve` + `startsWith(projectRoot + sep)`. `path.resolve`
does not follow symlinks, so a symlink inside the project pointing
outside would pass the check and `fs.readFileSync` would happily
read outside the project root.

Fix: use `fs.realpathSync.native` on both target and project root,
then case-insensitive compare on Windows. Refuse with explicit
"resolves outside the project root (symlink-aware check)" message.

### 🟡 worth-considering #3 — concurrent capture cross-contamination (Claude + Codex)

`source/scene.ts` v2.4.8 stack-based `runWithCapture` fanned every
console.log to ALL active capture arrays, so overlapping
`runSceneMethod` calls leaked logs across each other's results.

Fix: each call gets a `CaptureSlot {token: Symbol, entries, bytes,
truncated}` and the console hook now writes to `_topSlot()` only.
Cocos's IPC dispatcher is single-threaded per scene-script package
— concurrent calls only overlap at `await` boundaries and the slot
that was top-of-stack at hook-call time gets the entry. Refactor
`_captureSlots` array uses `findIndex(s => s.token === slot.token)`
on splice so removing a finished call doesn't accidentally take a
sibling's slot.

### 🟡 worth-considering #4 — unbounded capture (Claude + Codex)

A noisy scene-script could push unlimited entries into the capture
buffer, blowing memory and inflating the IPC envelope.

Fix: `CAPTURE_MAX_ENTRIES = 500` and `CAPTURE_MAX_BYTES = 64 KB`
caps. When either is exceeded, future appends are dropped and a
single `{ level: 'warn', message: '[capture truncated — exceeded
entry/byte cap]' }` marker is appended once to the slot.

### 🟡 worth-considering #5 — animation component-index lookup fragility (Claude + Codex)

`queryAnimationSetTargets` previously matched cc.Animation in
`__comps__` via metadata strings (`constructor.name === 'Animation'`
/ `__classname__ === 'cc.Animation'` / `_cid === 'cc.Animation'`).
Custom subclasses (e.g. `cc.SkeletalAnimation` or user-derived) and
cocos build variants where one of those keys is renamed would not
match.

Fix: resolve the component instance via `node.getComponent('cc.Animation')`
first (subclass-aware) then `components.indexOf(anim)` for the
slot — canonical reference-equality lookup, no metadata-string
fragility.

### 🟡 worth-considering #6 — TSC output regex completeness (Claude + Codex + Gemini)

The original regex matched only `^(.*)\((\d+),(\d+)\):\s+error\s+...`
which dropped:
- Warning / info severity lines
- Project-scope errors with no file:line:col (`error TS18003: No
  inputs were found...`)
- Multi-line message continuation (indented follow-on lines)

Fix:
- `TSC_LINE_RE` widened to `(error|warning|info)`; severity attached
  to the diagnostic.
- New `TSC_PROJECT_LINE_RE` for file-less project diagnostics
  (file/line/col stay empty).
- Indented continuation lines are appended to the previous
  diagnostic's `message` field with a newline separator.
- Summary distinguishes errors vs warnings when both are present.

### Test runs after fixes

- `tsc --noEmit`: clean.
- `scripts/smoke-mcp-sdk.js`: ✅ all smoke checks passed.
- Tool count unchanged: 17 categories / 177 tools.

## v2.4.8 — 2026-05-03

Recover four items the v2.4.0 plan listed under §同梱小項 but never
landed in the v2.4.0 commit. Audit at the end of the v2.4.7 cycle
surfaced the gap; scheduled as an explicit patch instead of folding
into v2.5.0 to keep the "fix leftover" review surface separate from
the upcoming v2.5.0 "add new feature" surface.

Total: **17 categories / 177 tools** (was 16 / 170 in v2.4.3 — v2.4.7
added no new tools, were patches only). +1 category (animation),
+7 tools (4 animation + 3 debug).

### A1 — TS diagnostics (3 new tools, debug category)

- `debug_wait_compile(timeoutMs?)` — block until cocos packer-driver
  logs `Target(editor) ends`. Returns immediately with `compiled=false`
  if no log growth observed within the 2s grace window (clean project,
  no recompile triggered). Adapted from harady/cocos-creator-mcp's
  `waitCompile`, dropped the electron-menu "clear code cache" path.
- `debug_run_script_diagnostics(tsconfigPath?)` — exec
  `tsc --noEmit -p <tsconfig> --pretty false` and parse stderr/stdout
  into structured `{file, line, column, code, message}` diagnostics.
  Binary discovery: project node_modules → editor bundled engine → npx
  fallback. tsconfig discovery: `tsconfig.json` or
  `temp/tsconfig.cocos.json` (cocos auto-generates the latter).
  Adapted from FunplayAI's `lib/diagnostics.js` with TS types added.
- `debug_get_script_diagnostic_context(file, line, contextLines?)` —
  read ±N source lines around a diagnostic location. Path-safety
  guard refuses paths outside `Editor.Project.path`. 5MB read cap.

Together these form an "edit .ts → wait → fetch errors → read
context → fix" workflow for AI clients.

### A2 — Animation tools (new `animation` category, 4 tools)

- `animation_list_clips({nodeUuid|nodeName})` — enumerate clips on a
  node's `cc.Animation`, returns name/uuid/duration/wrapMode + which
  is defaultClip + playOnLoad.
- `animation_play({nodeUuid|nodeName, clipName?})` — start a clip
  (default if name omitted). Validates clip name against the
  registered list to surface typos as errors instead of silent no-ops.
- `animation_stop({nodeUuid|nodeName})` — stop the active clip.
- `animation_set_clip({nodeUuid|nodeName, defaultClip?, playOnLoad?})`
  — persist via the editor `set-property` channel (Landmine #11
  scalar path), not direct runtime mutation, so `save_scene` picks
  it up reliably.

Ported from FunplayAI/Spaydo using the v2.4.0 declarative
`defineTools` pattern + `nodeUuid|nodeName` fallback
(`resolveOrToolError`). Scene-side methods in `source/scene.ts`:
`getAnimationClips` / `playAnimation` / `stopAnimation` /
`queryAnimationSetTargets` (lookup helper for set_clip's host-side
set-property writes).

### A3 — Scene-script log capture in scene-bridge (DX win)

`source/scene.ts:runWithCapture` is a new scene-script wrapper that
monkey-patches `console.{log,warn,error}` for the duration of an
inner method call. It uses a **stack** of capture arrays so concurrent
`runSceneMethod` calls each get an isolated buffer; the console hook
is installed once and fans out to every active capture, then removed
when the stack drains.

`source/lib/scene-bridge.ts` routes every `runSceneMethod` /
`runSceneMethodAsToolResponse` through `runWithCapture` by default
(opt-out via `{capture: false}`), gated by the global
`isSceneLogCaptureEnabled()` runtime flag.

Result: every tool response that hit a scene-script now carries
`capturedLogs: [{level, message, ts}]` so AI clients see the cocos
engine console output for the operation, in the same envelope.
Single IPC round-trip — no extra channels added.

Settings: `enableSceneLogCapture: true` by default. Re-applied on
every `updateSettings()` (mirroring the v2.3.1 `editorContextEval`
re-apply pattern).

Adapted from RomaRogov-cocos-mcp's `startCaptureSceneLogs` /
`getCapturedSceneLogs` pattern.

### A4 — `resources.templates: true` clarification (no code change)

Investigation found that the MCP spec's `ServerCapabilitiesSchema`
(`@modelcontextprotocol/sdk` types.d.ts:776–812) only defines
`subscribe` and `listChanged` flags under `resources`. cocos-cli's
`templates: true` is non-spec; SDK's `z.core.$strip` silently drops
unknown keys. Templates are already supported via the
`ListResourceTemplatesRequestSchema` handler we registered in v2.2.0
(`mcp-server-sdk.ts:101`); clients call `resources/templates/list`
regardless of capability flags.

Action: added a comment to the capabilities block explaining the
no-flag rationale so future reviewers don't flag this as missing.

## v2.4.7 — 2026-05-03

Live-test cleanup fixes + CLAUDE.md landmine #14 covering cocos's
non-clearable scene dirty flag. No `source/` change; bump exists so
`cocos_cs_349` plugin panel reflects the live-test fix and so future
audits can see the version that includes the dirty-flag landmine doc.

### Live-test cleanup bugs (commit `ebab029`, pre-bump)

Two bugs in `scripts/live-test.js` triggered cocos' "save unsaved
changes?" modal and left orphan / `(Missing Node)` residue in the
scene tree:

- **Pasted nodes never deleted** — read `paste.data.uuids` but the
  tool returns `data.newUuids`. Stale read meant the cleanup loop
  iterated an empty array; pasted node lingered + scene stayed
  dirty.
- **Prefab instance became Missing Node** — finally block deleted
  the prefab ASSET first, then tried to delete the in-scene node
  by the pre-createPrefab UUID. Per CLAUDE.md landmine #8
  `createPrefab` repurposes the source node and surfaces the new
  instance UUID as `data.instanceNodeUuid`; live-test never
  captured it. Asset deletion before instance deletion broke the
  prefab link → `(Missing Node)`.

Defense-in-depth: re-query `scene_dirty` immediately before the
scene-switch test (was only checked at startup) so write-flow
mutations that dirtied the scene mid-test trigger a skip with
clear message instead of the modal.

### CLAUDE.md landmine #14

Documents the cocos scene dirty flag's cumulative non-clearable
behaviour:

- Cocos tracks every set-property / create-node / remove-node /
  paste-node as a discrete op in its undo stack. A `create` →
  `remove` round-trip leaves the scene dirty even when net node
  count is unchanged.
- No `clear-dirty` / `discard` / `revert` channel exists in
  `scene/@types/message.d.ts` or `scene-facade-interface.d.ts`. The
  only paths to a clean state involve writing to disk OR a manual
  user action in the cocos modal.
- Tools that trigger the cocos modal (`scene_open_scene`,
  `scene_close_scene`, etc.) **block the IPC reply** until the user
  dismisses the modal — same blocking pattern as landmine #12
  (asset-db dialogs), different channel.
- AI workflows that "create scratch state then switch scenes" are
  inherently dialog-prone. Either save first or isolate scratch
  work to a throwaway scene.

### Verification

- `npm run build` tsc clean (no source change, version-only bump)
- `node scripts/live-test.js` 54 pass / 1 fail (pre-existing
  `get_console_logs` placeholder) / 1 skip (scene-switch dirty
  guard kicks in)
- Tool count unchanged: 16 categories / 170 tools

---

## v2.4.6 — 2026-05-03

Round-3 review fixes on v2.4.5. One 🔴 (Codex) + one consensus 🟡 in
the same `convertPropertyValue` Number/Float branch.

### Must-fix

- **`Number('')` no longer silently coerces to 0**. v2.4.5 switched
  from `parseFloat` to `Number()` for stricter trailing-garbage
  handling, but `Number('')` returns 0 (a JS gotcha), so an
  AI-supplied empty string for a numeric property silently wrote 0
  to the asset meta. Reject explicitly so the AI sees the error
  rather than corrupting a numeric setting. (Codex.) Fix at
  `source/asset-interpreters/base.ts:convertPropertyValue`.

### Worth-considering

- **Reject ±Infinity for Number/Float**. `Number('Infinity')` →
  `Infinity` passes a NaN check; cocos asset properties never want
  infinite values. Switched the Number/Float branch from
  `Number.isNaN` to `Number.isFinite`, mirroring the Integer branch
  that already had this guard. (Codex.)

### Verification

- `npm run build` tsc clean
- `node scripts/smoke-mcp-sdk.js` ✅ 14 checks unchanged
- Tool count: 16 categories / 170 tools (unchanged from v2.4.5)

---

## v2.4.5 — 2026-05-03

Round-2 three-way review polish on v2.4.4. No 🔴 from any reviewer
(consensus 🟢 ship-it on the must-fix items); seven 🟡 polish items
consolidated.

### Worth-considering

- **`PropertySetResult.warning?: string` declared on the interface**.
  v2.4.4 used `(r as any).warning = saveError` which bypassed
  TypeScript's contract — downstream consumers reading the result
  array couldn't see the field. Promoted to a real interface field;
  cast removed. (Claude + Codex consensus.)
- **Stricter `Number` / `Integer` coercion**. v2.4.4 used
  `parseFloat()` which silently accepted trailing garbage
  (`'1.2.3'` → `1.2`). Switched to `Number()` + NaN-check for
  Number/Float; added explicit `/^-?\\d+$/` regex check for
  Integer to reject `'123foo'`. (Gemini + Claude + Codex.)
- **`ImageInterpreter` sub-meta lookup also checks key**. v2.4.4
  matched only by sub-meta `name` field or `importer` tag. Image
  sub-metas in cocos are commonly keyed by literal name in the meta
  JSON, so a key-equality check is the most direct match. Falls
  back to name / importer otherwise. (Codex.)
- **`useAdvancedInspection` schema description corrected**. v2.4.4
  said "MaterialInterpreter uses it to surface defines and
  pass-level props" but the actual implementation is deferred.
  Description now states "reserved for v2.5+, no effect in v2.4.x".
  (Codex.)
- **Tool-name strings fixed: `asset_*` → `assetMeta_*`**. v2.4.3
  comments were updated in v2.4.4 but two runtime strings were
  missed (`list_interpreters` description and `UnknownInterpreter`
  error message). Clients following those would call missing names.
  (Codex.)
- **Removed unused `isPathSafe` import in `specialized.ts`**.
  v2.4.4 imported the helper but the inner ImageInterpreter walk
  inlined the check. Dropped the import; the inline check now uses
  a small local `FORBIDDEN_INNER_SEGMENTS` set with a comment
  pointing at the base.ts equivalent. (Claude.)
- **`Object.create(null)` claim removed from JSDoc**. v2.4.4
  comment said auto-created intermediate containers used
  `Object.create(null)` but the code uses `{}`. The
  forbidden-segment guard is what blocks pollution; the container
  shape is irrelevant for that protection. (Claude + Codex.)

### Verification

- `npm run build` tsc clean
- `node scripts/smoke-mcp-sdk.js` ✅ 14 checks unchanged
- Tool count: 16 categories / 170 tools (unchanged from v2.4.4)

---

## v2.4.4 — 2026-05-03

Three-way review fixes on v2.4.3 (round 1). Two 🔴 must-fix from
3-way consensus + five 🟡 polish items. No new tools, no API
removals.

### Must-fix

- **Prototype-pollution guard in `BaseAssetInterpreter.setProperty`**
  (Gemini + Claude + Codex 3-way consensus). v2.4.3's
  `VALID_META_PATTERNS` checked only the root prefix; paths like
  `userData.__proto__.polluted` passed validation and the walk
  descended through `Object.prototype`, producing process-wide
  pollution observable from every other tool. New `isPathSafe()`
  helper rejects `__proto__` / `constructor` / `prototype` segments
  anywhere in the path, plus empty segments (`userData..foo`).
  Same guard inlined into `ImageInterpreter.setProperty`'s sub-asset
  inner walk. Fix at `source/asset-interpreters/base.ts` +
  `specialized.ts`.
- **`ImageInterpreter` sub-asset routing**: v2.4.3 wrote into the
  FIRST `meta.subMetas` value found, ignoring whether the path
  mentioned `texture` or `spriteFrame`. Cocos image assets typically
  have BOTH sub-metas, so writes silently corrupted the wrong
  sub-asset. Now matches by either declared `name` field or by
  importer string (`texture` vs `sprite-frame`); errors clearly when
  no match. (Gemini + Claude + Codex 3-way consensus.) Fix at
  `source/asset-interpreters/specialized.ts:ImageInterpreter`.

### Worth-considering

- **Removed `importer` / `importerVersion` / `sourceUuid` /
  `isGroup` / `folder` from the writable allow-list**. Letting AI
  flip an asset's importer string asks asset-db to re-import as a
  different importer; best case the import fails, worst case the
  asset is corrupted. (Claude.)
- **`resolveAssetInfo` symmetric malformed-reference check**.
  `reference: {}` (no id) plus a valid `assetUuid` no longer falls
  through silently — explicit error matching the v2.4.1/v2.4.2
  `resolveReference` fix. (Gemini + Claude.)
- **Save vs refresh failure handling split**. v2.4.3 lumped both
  errors together which mislabelled state on disk: if save succeeded
  but refresh threw, every successful entry was flipped to failure
  even though the disk meta was updated. Now refresh failures
  attach a `warning` to each successful entry without reversing the
  success status. (Claude + Codex.)
- **Boolean / Number / Integer coercion validates input**.
  `Boolean("false")` would have returned `true` (truthy string);
  `parseFloat("foo")` would have written `NaN`. Now `"false"`,
  `"true"`, `"0"`, `"1"` are explicit branches; non-numeric strings
  for Number/Integer throw. (Codex.)
- **Tool descriptions / file JSDoc use correct prefixed names**.
  v2.4.3 referred to `asset_get_properties` etc., but the actual
  MCP names are `assetMeta_get_properties` (the `assetMeta`
  category prefix). Clients following the description would call a
  missing name. (Codex.)
- **`useAdvancedInspection` field documented as reserved**. The
  schema field exists but no interpreter currently acts on it; the
  description now explicitly says "v2.4.x has no effect" so AI
  doesn't expect material advanced inspection until v2.5+. (Codex.)

### Verification

- `npm run build` tsc clean
- `node scripts/smoke-mcp-sdk.js` ✅ 14 checks unchanged
- Tool count: 16 categories / 170 tools (unchanged from v2.4.3)

### Security note

The prototype-pollution issue is the highest-severity bug v2.4.x has
shipped to date (process-wide impact, AI-controllable input as
attack vector). The guard added in this patch is defensive at the
walker level so future asset-meta paths can't reintroduce it without
explicitly bypassing `isPathSafe()`. Adding this to CLAUDE.md
landmines is recommended next session.

---

## v2.4.3 — 2026-05-03

Asset interpreters system — fills the gap left by `set_component_property`
which only mutates scene nodes. AI can now read and write asset import
settings (texture compression, FBX animation extraction, SpriteFrame
trim mode, etc.) that live in `<asset>.meta` userData. Three new MCP
tools, one new tool category. Originally planned as v2.4.1; renumbered
to v2.4.3 because v2.4.1/v2.4.2 patch slots were consumed by three-way
review fixes on v2.4.0.

### New tool category: `assetMeta` (3 tools)

- **`assetMeta_list_interpreters`** — list importer types we have
  specialized interpreters for (image, texture, sprite-frame, fbx,
  material, effect, particle, plus `*` wildcard fallback). Plan
  asset_set_properties calls — the fallback rejects writes.
- **`assetMeta_get_properties`** — read meta + sub-meta userData via
  the importer-specific interpreter. Returns
  `{properties: {path: {type, value, tooltip?, enumList?}}, arrays}`.
  Use BEFORE asset_set_properties so AI sees real property names + types.
- **`assetMeta_set_properties`** — batch-write meta fields with path
  validation against an allow-list (userData.*, subMetas.*,
  platformSettings.*). Commits via `asset-db save-asset-meta` +
  `refresh-asset` so cocos re-imports with the new settings. Per-entry
  success/error reporting for partial failures.

All three accept InstanceReference (`{id: assetUuid, type?}`) for the
asset target plus a backward-compat bare `assetUuid` field. Built with
the v2.4.0 step-5 `@mcpTool` decorator.

### Architecture additions

- `source/asset-interpreters/interface.ts` — `IAssetInterpreter`,
  `AssetPropertiesDescription`, `PropertySetSpec`, `PropertySetResult`.
- `source/asset-interpreters/base.ts` — `BaseAssetInterpreter` with
  shared `getProperties` / `setProperties` / recursive userData
  extraction / `convertPropertyValue` / regex-validated `setProperty`.
- `source/asset-interpreters/manager.ts` — `AssetInterpreterManager`
  with Map<importerType, interpreter> lookup and wildcard fallback.
  Plain factory pattern (no `static {}` block) to keep cocos build
  pipeline unchanged.
- `source/asset-interpreters/specialized.ts` — eight importer-specific
  interpreters: ImageInterpreter (top-level vs sub-asset routing),
  TextureInterpreter, SpriteFrameInterpreter (rejects writes to
  computed read-only fields), FbxInterpreter, MaterialInterpreter
  (userData reads only; full editing deferred to v2.5+),
  EffectInterpreter, ParticleInterpreter, UnknownInterpreter
  (read-only fallback).

### Verification

- `npm run build` tsc clean
- `node scripts/smoke-mcp-sdk.js` ✅ 14 checks unchanged
- Tool count: 16 categories / 170 tools (+1 cat / +3 tools)

### Material editing scope note

MaterialInterpreter v2.4.3 only handles userData reads. RomaRogov's
full material editing path uses `scene/query-material` +
`scene/apply-material` + an asset-uuid preprocessing layer
(McpServerManager.decodeUuid) for cc.TextureBase property writes.
Porting that wholesale is deferred to v2.5+. AI needing to swap
effects, set technique passes, or write asset-typed material
properties should use `debug_execute_javascript` (context='scene')
which can call `cce.SceneFacade.applyMaterial` directly — that path
is already shipped (v2.3.0).

---

## v2.4.2 — 2026-05-02

Second-round three-way review fixes on v2.4.1. Two 🔴 from Codex + four
🟡 consensus polish items. No new tools, no API removals.

### Must-fix

- **`sanitizeTsName` guards digit-leading and empty results**. v2.4.1
  stripped non-identifier characters but produced invalid TS like
  `class 2dSprite` (digit-leading) or `class ` (empty after strip on
  UUID-shaped `__type__`). Now prefixes `_` for digit-leading and
  returns `_Unknown` for empty. (Codex.) Fix at
  `source/tools/inspector-tools.ts:sanitizeTsName`.
- **`reference.type` no longer overrides the dump's `__type__`**.
  v2.4.1 used `reference.type || dump.__type__` for the class name,
  so a caller passing `{id: nodeUuid, type: 'cc.Sprite'}` got a node
  dump rendered as `class Sprite`. Now the dump's `__type__` is
  authoritative; `reference.type` is diagnostic only — a mismatch
  surfaces as a `warning` in the response. (Codex.) Fix at
  `source/tools/inspector-tools.ts:getInstanceDefinition`.

### Worth-considering

- **`resolveReference` detects `refId` vs `nodeName` conflict
  symmetrically**. v2.4.1 caught `refId` vs `nodeUuid` but silently
  ignored a `nodeName` supplied alongside `reference`. (Claude.) Fix
  at `source/lib/instance-reference.ts`.
- **`enumCommentHint` reads `userData.enumList` / `userData.bitmaskList`
  fallback paths**. Cocos sometimes nests enum data under `userData`,
  sometimes at the top level — v2.4.1 only checked top level. Also
  removed the misleading `userData.enumList[0].name` fallback (that
  reads the *first enum value's* name, not the class name). (Claude
  + Codex.) Fix at `source/tools/inspector-tools.ts:enumCommentHint`.
- **`COMPONENT_INTERNAL_KEYS` removed (was dead code)**. The
  `isComponent` flag in `renderTsClass` is hardcoded `false` since
  v2.4.1's node-only narrowing; the deny-list went unused. Restore
  from git history when v2.5+ reintroduces component support. (Claude
  + Codex + Gemini consensus.)
- **`node_set_node_properties` description corrected**. v2.4.1 said
  "concurrent" / "single round-trip" but the implementation became
  serial-await. Description now matches reality. (Codex.) Fix at
  `source/tools/node-tools.ts`.
- **File-level JSDoc on `inspector-tools.ts` updated** — said "node or
  component reference" but the implementation is node-only. (Codex.)

### Verification

- `npm run build` tsc clean
- `node scripts/smoke-mcp-sdk.js` ✅ 14 checks unchanged
- Tool count: 15 categories / 167 tools (unchanged)

---

## v2.4.1 — 2026-05-02

Three-way review fixes (claude / codex / gemini) on v2.4.0. No new tools,
no API removals. All fixes are correctness, robustness, and doc honesty
hardening.

### Must-fix

- **`batch-set` is now sequential, not concurrent**. v2.4.0 used
  `Promise.allSettled` which fired every `scene/set-property` in
  parallel against the same node. Cocos scene IPC has no documented
  ordering guarantee for concurrent same-node writes, and overlapping
  paths (e.g. `position` and `position.x`) produced undefined final
  state. Now serial-await per entry; duplicate paths reject up-front;
  overlapping paths are warned in the response. (Gemini + Codex +
  Claude consensus.) Fix at `source/lib/batch-set.ts`.
- **`resolveReference` detects conflicting selectors instead of
  silently picking one**. v2.4.0 silently used `reference.id` when both
  `reference` and `nodeUuid` were provided with mismatching values.
  Now returns an explicit error so AI clients tiling tool calls catch
  the mistake immediately. Also surfaces a clear error when
  `reference` is provided but `reference.id` is missing. (Codex +
  Claude.) Fix at `source/lib/instance-reference.ts`.
- **`inspector_get_instance_definition` description narrowed to
  node-only**. v2.4.0 advertised "node or component" but only ever
  called `scene/query-node`. Tool description and error message now
  state node-only; component / asset support deferred to v2.5+ pending
  a verified Cocos `query-component` channel. (Codex.) Fix at
  `source/tools/inspector-tools.ts`.

### Worth-considering

- **Inspector deny-list expanded** to suppress prefab-instance / editor
  metadata fields (`uuid`, `_prefabInstance`, `removedComponents`,
  `mountedRoot`, `_components`, `__cid__`, `_componentName`, …). The
  v2.4.0 minimal list leaked these as user-facing properties. (Codex.)
- **`resolve-node` deep search is now iterative**. The recursive walk
  in v2.4.0 had no depth cap and could blow the call stack on very
  deep prefab forests. (Gemini.) Fix at `source/lib/resolve-node.ts`.
- **Inspector Enum/BitMask emits a hint comment** with enum class name
  + first 8 values. Previously emitted bare `number` losing all
  semantic info. (Gemini.) Fix at `source/tools/inspector-tools.ts`.
- **Inspector TS output is now sanitized**: tooltip / component-type
  strings have `\n` and `*/` stripped to avoid breaking the surrounding
  comment context; custom property names that aren't safe TS
  identifiers are JSON-quoted; custom type names like `My.Foo` are
  passed through `sanitizeTsName` before emission. (Claude.)
- **Removed unused `nodeReferenceShape` import** in
  `source/tools/node-tools.ts`. (Claude.)

### Documentation

- **CHANGELOG honesty**: v2.4.0 claimed "all v2.3.1 tools accept
  identical arguments". The six tools that adopted InstanceReference
  + nodeName (`set_node_property`, `set_node_transform`,
  `add_component`, `set_component_property`,
  `node_set_node_properties`, `set_component_properties`) actually
  relaxed their `nodeUuid` / `uuid` field from required to optional.
  Existing callers passing the field still work; strict-validating
  clients now get a runtime "provide nodeUuid or nodeName" error
  instead of a schema-time required-field error. (Claude.) Logged
  here so consumers running schema diffs see the change explicitly.

### Verification

- `npm run build` tsc clean
- `node scripts/smoke-mcp-sdk.js` ✅ 14 checks unchanged
- Tool count: 15 categories / 167 tools (unchanged from v2.4.0)

---

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
