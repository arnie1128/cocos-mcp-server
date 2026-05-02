# Changelog

Detailed per-minor release notes live in [docs/releases/](docs/releases/); this file is the flat release index.

Original work © LiDaxian (upstream `cocos-mcp-server` v1.4.0). Fork modifications
© 2026 shang. Both released under the project's existing license.

## v2.9 — 2026-05-02

- Added `debug_check_editor_health`, `debug_set_preview_mode`, MediaRecorder recording, and macro-tool consolidation for reference images.
- Closed cumulative review fixes across health probes, recording persistence, path/root safety, CORS/Vary behavior, diagnostics, and preview-mode guardrails.
- [詳見 docs/releases/v2.9.md](docs/releases/v2.9.md)

## v2.8 — 2026-05-02

- Spillover release for CORS hoist/Vary, shared capture-path realpath containment, and `debug_preview_control` through `changePreviewPlayState`.
- Added embedded/browser preview screenshot handling, mode-aware fallback hints, and documented the `softReloadScene` freeze race.
- [詳見 docs/releases/v2.8.md](docs/releases/v2.8.md)

## v2.7 — 2026-05-02

- Preview-QA and security hardening: reflect-metadata cleanup, scoped `/game/*` CORS, preview URL/device tools, and capture preview screenshot support.
- Three-way review follow-ups fixed CORS/doc drift, smoke preflight coverage, IPv6 localhost normalization, HANDOFF state, and architecture-map counts.
- [詳見 docs/releases/v2.7.md](docs/releases/v2.7.md)

## v2.6 — 2026-05-02

- Added the GameDebugClient bridge, host-side runtime command queue, screenshot/click/inspect commands, and UUID compatibility for sub-assets.
- Review patches hardened command single-flight semantics, request/result body caps, screenshot persistence, symlink handling, and stale documentation/version strings.
- [詳見 docs/releases/v2.6.md](docs/releases/v2.6.md)

## v2.5 — 2026-05-03

- Added the `fileEditor` category, broadcast probing helper, MCP resource notifications, and prompt templates.
- Review patch fixed SERVER_VERSION drift, notification rejection handling, unknown prompt errors, regex backreferences, containment, and generated-doc path issues.
- [詳見 docs/releases/v2.5.md](docs/releases/v2.5.md)

## v2.4 — 2026-05-02 to 2026-05-03

- Large tool-system expansion: declarative ToolDef arrays, node resolution helpers, batch set utilities, InstanceReference support, decorators, inspector, assetMeta, animation, and TS diagnostic tools.
- Stabilization patches covered live-test cleanup, Windows spawn behavior, diagnostics capture, path containment, symlink escapes, truncation accounting, and review-driven fixes.
- [詳見 docs/releases/v2.4.md](docs/releases/v2.4.md)

## v2.3 — 2026-05-02

- Added JavaScript/script execution helpers, screenshot tools, MCP resources, and settings-resource metadata.
- Follow-up review fixed script execution error reporting, timeout/race behavior, documentation drift, and verification coverage.
- [詳見 docs/releases/v2.3.md](docs/releases/v2.3.md)

## v2.2 — 2026-05-02

- Introduced MCP resource templates for project, scene, selection, asset, prefab, and extension state.
- Marked the backing read-only tools as deprecated pending broad client support for `resources/*`.
- [詳見 docs/releases/v2.2.md](docs/releases/v2.2.md)

## v2.1 — 2026-05-01 to 2026-05-02

- Delivered P4 partial upstream v1.5.0 parity with prefab facade operations, EventHandler binding, scene-bridge helpers, and panel composables.
- Fixed prefab verification findings, refreshed generated docs/metadata, and completed the B1 description sweep for the 160-tool registry.
- [詳見 docs/releases/v2.1.md](docs/releases/v2.1.md)

## v2.0 — 2026-05-01

- First major fork release: official MCP SDK transport, structured tool responses, zod schemas, shared registry instance, global logger, and verified prefab channels.
- Documented breaking initialization/protocol changes, server lifecycle hardening, panel checkbox fixes, and smoke/live-test tooling.
- [詳見 docs/releases/v2.0.md](docs/releases/v2.0.md)
