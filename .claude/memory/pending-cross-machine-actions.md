---
name: pending-cross-machine-actions
description: Actions a machine still owes after the move to AGENTS.md (v2.14.2); check them at session start and remove each when it is done
metadata:
  type: project
---

Pending actions per machine after the guidance layout change (v2.14.2).
goldenf-MBP has done the first one and owes nothing for the second. Remove
an item in the commit that completes it; when the list is empty, delete this
file and its line in `MEMORY.md`.

- Every machine that works on this repo: `.claude/settings.local.json` (not
  tracked) must set `autoMemoryDirectory` to the absolute path of this repo's
  `.claude/memory`. Without it Claude Code does not load this folder.
  **Remove when:** personal-MBP and personal-DESKTOP each have the setting,
  or do not work on this repo.
- The machine that committed `f1ca1a1` (the CodeGraph ignore block):
  `.claude/CLAUDE.md`, `.claude/settings.json` and `.mcp.json` are no longer
  ignored and show as untracked after the pull. Review each for absolute
  paths, personal permissions and credentials before tracking it; the
  un-ignore is not approval to commit the existing contents.
  **Remove when:** that machine has tracked or deleted the three files.
- Every machine with the extension installed: after pulling v2.14.2, reload
  the extension in Cocos Creator (linked install), or copy `dist/`,
  `package.json` and the three docs resource files (copied install), then
  read `cocos://docs/landmines` once and confirm it returns
  `docs/landmines.md`. That resource change was verified statically only; no
  machine has checked it in an editor.
  **Remove when:** one machine has confirmed it in the editor.

**Why:** the first item is per-machine state git cannot carry, the second
depends on files that exist on one machine only, and the third needs a
running editor.
**How to apply:** at session start, act on or mention the items this machine
still owes.
