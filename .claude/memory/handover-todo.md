---
name: handover-todo
description: "Open hand-over items for cocos-mcp-server — stale counts and trees in the user-facing docs, the CHANGELOG gap v2.10 to v2.14.0, the `input` category blurb missing from the tool reference generator, HANDOFF environment and rollback rows, the copied-install packaging gap, the wrong fork source in ADR 0001, and the absent gemini CLI on goldenf-MBP"
metadata:
  type: project
---

Open items carried between sessions. Remove an item once it is settled. Each
one was found while the guidance moved to `AGENTS.md` (v2.14.2) and left
because it was outside that change. Per-machine actions are in
[[pending-cross-machine-actions]].

## User-facing docs carry stale counts and trees

Source at v2.14.2 registers 19 categories and 197 tools (`npm run check:gemini`
prints the tool total; `docs/tools.md` is regenerated and current).

- `README.md`: the feature bullet says 160 tools in 14 categories, the
  `/health` sample shows `"tools":160`, and the "Category 一覽" table lists the
  old per-category counts.
- `docs/README.md` directory tree: describes `analysis/tool-inventory.md` as
  170 tools; lists `archive/handoff-history.md`, which does not exist; omits
  `releases/`, `research/`, `bugs.md`, `archive/handoff/`, `archive/research/`,
  `archive/landmines-resolved.md` and `archive/rollback-anchors.md`.
- `docs/analysis/tool-inventory.md` banner points to a `docs/HANDOFF.md`
  section 「進度快照」 that does not exist.
- `docs/architecture/overview.md` names `source/mcp-server.ts`; the server is
  `source/mcp-server-sdk.ts`.

**How to apply:** `docs/tools.md` is the single owner of the inventory. Remove
duplicated numbers and link it instead of refreshing each copy. These files are
Traditional Chinese, written for the maintainer; keep that language.

## CHANGELOG has no entries for v2.10 to v2.14.0

`CHANGELOG.md` goes from v2.9 to v2.14.1. `docs/releases/` holds per-minor
notes up to v2.10 and nothing for v2.11 to v2.14.

**How to apply:** a backfill is derived from `git log`, `docs/releases/v2.10.md`
and the version summary at the top of `docs/HANDOFF.md`, never from memory. It
is documentation only, so it needs no version bump. Do it on the owner's
instruction.

## Tool reference generator has no text for the `input` category

`scripts/generate-tools-doc.js` carries the hand-written category blurbs and
titles and has none for `input`, so `docs/tools.md` renders that category as
`_（無描述）_` in the index table and in its section.

**How to apply:** add the blurb and title in the generator, run `npm run build`,
then `node scripts/generate-tools-doc.js`. The build rewrites tracked `dist/`;
with no source change the `dist/` diff must be empty apart from
`build-hash.json`.

## HANDOFF live sections are incomplete

- 「環境快速確認」 records one machine only (the Windows checkout and its
  junction into a `cocos_cs_349` project). No macOS machine is recorded.
- 「回滾錨點」 stops at v2.14.0. The commit before the v2.14.1 change and the
  commit before the v2.14.2 change (`22e1e0a`) have no row.
- The header note says v2.13 and v2.14 have no full hand-over written; the
  body below it is the v2.12.1 cycle record.

**How to apply:** add rows and machine entries as facts are confirmed on that
machine. Do not rewrite the historical cycle records.

## Copied installs do not ship the docs resources

`cocos://docs/landmines`, `cocos://docs/tools` and `cocos://docs/handoff` read
`docs/landmines.md`, `docs/tools.md` and `docs/HANDOFF.md` under the extension
root. An install made by copying `dist/` and `package.json` answers them with
"Resource unavailable". `AGENTS.md` documents the limit and the manual remedy.

**How to apply:** a packaging change (copy script, bundled docs, or embedding
the text at build time) is a new design. Propose it and wait for the owner.

## ADR 0001 names the wrong fork source

`docs/adr/0001-skip-v1.5.0-spec.md` says the fork came from
`arnie1128/cocos-mcp-server`. That is this repository; `package.json` names
LiDaxian's cocos-mcp-server v1.4.0, and `AGENTS.md` states it correctly.

**How to apply:** ADRs are immutable records. A correction is the owner's
choice between an erratum note in that ADR and a new ADR; do not edit the text
silently.

## Three-way review cannot run in full on goldenf-MBP

The `gemini` CLI is not installed on goldenf-MBP. The review workflow in
`AGENTS.md` reports a missing reviewer as not run.

**How to apply:** state "Gemini: not run (CLI absent)" in the review report.
Installing a tool needs the owner's go.
