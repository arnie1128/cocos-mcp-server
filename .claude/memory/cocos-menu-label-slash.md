---
name: cocos-menu-label-slash
description: Cocos extension menu labels treat a half-width slash as a submenu separator; use full-width ／ (U+FF0F) or rephrase
metadata:
  type: project
---

In Cocos Creator 3.8.x, both the `path` and the `label` fields of a
`contributions.menu` entry are parsed for `/` as a hierarchy separator.
A label like `"啟動 / 停止 MCP Server"` renders as a submenu titled `啟動`
that contains one entry `停止 MCP Server`, not as a single flat item.

**Why:** v2.13.9 added a Start/Stop toggle menu item with the label
`啟動 / 停止 MCP Server`. The menu rendered it inside an unwanted `啟動`
submenu instead of flat next to the `打開 MCP 面板` entry: the `/` in the
label triggered Cocos's hierarchy parser. v2.13.10 replaced the half-width
`/` with full-width `／` (U+FF0F) and the menu rendered as a single item.
The Cocos contributions schema does not document this behaviour.

**How to apply:**
- For a menu label that conveys a slash-style choice (start/stop, on/off,
  true/false), use full-width `／` (U+FF0F), a middle dot `·`, an em dash
  `—`, or rephrase without the slash (for example `Toggle MCP Server`).
  Never use a half-width `/`.
- The `path` field very likely behaves the same way. The existing
  `path: "i18n:menu.extension/Cocos MCP Server"` works because it is meant
  to be a path; a leaf segment that must contain a literal slash needs the
  full-width form too.
- Verify any menu change by reloading the extension and checking the
  rendered menu shape, not only the label string.
