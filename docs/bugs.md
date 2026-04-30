# Known Bugs

User-reported issues that haven't been folded into the roadmap yet. Keep
entries terse — repro + impact + suspected fix; let the actual change live
in commits.

---

## B-001: Settings panel checkboxes (autoStart / debugLog) don't persist visually

**Reported:** 2026-05-01
**Fixed:** 2026-05-01 (same commit as P1 SDK migration)
**Affected file:** `static/template/vue/mcp-server-app.html` (lines 43, 47)
**Side issue also fixed:** `source/panels/default/index.ts` `saveSettings()` was sending `debugLog` but the backend expects `enableDebugLog`.

### Repro

1. Open the `Cocos MCP Server` panel.
2. Tick **自动启动** (auto start) under 服务器设置.
3. The checkbox visually unticks itself (or never shows ticked at all) — no
   way to confirm the value was committed.
4. Click **保存设置**, close the panel, reopen it. Checkbox still appears
   unticked even though the underlying setting was written.

The same bug affects **调试日志** (debug log).

### Root cause

`<ui-checkbox>` is a Cocos Creator custom element. Its public API is:

- property: `value: boolean`
- event: `change` (with `event.target.checked`)

Vue's `v-model` on a generic custom element compiles to `:value` + `@input`.
The element never fires `input`, so writes from the user are lost; and Vue
doesn't update the element when the model changes either, because the
custom element's `value` property is being assigned but the element doesn't
react to property reassignment after mount the way Vue assumes.

Lines 43 and 47 use the broken pattern:

```html
<ui-checkbox slot="content" v-model="settings.autoStart"></ui-checkbox>
<ui-checkbox slot="content" v-model="settings.debugLog"></ui-checkbox>
```

The same template gets the binding right at lines 107–110 for the per-tool
checkbox:

```html
<ui-checkbox
    :value="tool.enabled"
    @change="(event) => updateToolStatus(category, tool.name, event.target.checked)"
></ui-checkbox>
```

### Suggested fix

Replace the two `v-model` usages with the explicit `:value` + `@change`
pair, matching the working pattern. Sketch:

```html
<ui-checkbox slot="content"
    :value="settings.autoStart"
    @change="(e) => settings.autoStart = e.target.checked"></ui-checkbox>
<ui-checkbox slot="content"
    :value="settings.debugLog"
    @change="(e) => settings.debugLog = e.target.checked"></ui-checkbox>
```

The `watch(settings, ...)` already flips `settingsChanged.value = true` when
either field updates, so the **保存设置** button will enable correctly.

### Side issue (verify when fixing)

`saveSettings()` in `source/panels/default/index.ts` sends
`debugLog: settings.value.debugLog` to the backend, but the backend
`MCPServerSettings` interface expects `enableDebugLog`. The `toggleServer`
path translates correctly (`enableDebugLog: settings.value.debugLog`) but
`saveSettings` doesn't — the debug-log setting is silently dropped on
plain-save. Worth fixing in the same PR as B-001.
