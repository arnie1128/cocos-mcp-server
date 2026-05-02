# GameDebugClient — runtime bridge for cocos-mcp-server

`cocos-mcp-client.ts` is a **runtime client** you copy into your cocos
project. It runs inside your game (Preview-in-Editor, browser preview,
or a built bundle) and lets `debug_game_command` from the MCP server
control the running game: take screenshots, click buttons, inspect
nodes, and dispatch project-specific commands you register.

## Installation

1. Copy `cocos-mcp-client.ts` into your project:
   ```
   <your-cocos-project>/assets/scripts/mcp/cocos-mcp-client.ts
   ```
2. Wire it into your top-level scene (or a global startup component):
   ```ts
   import { _decorator, Component } from 'cc';
   import { initMcpDebugClient } from './mcp/cocos-mcp-client';

   const { ccclass } = _decorator;

   @ccclass('Bootstrap')
   export class Bootstrap extends Component {
       start() {
           initMcpDebugClient({
               mcpBaseUrl: 'http://127.0.0.1:3000',
               pollIntervalMs: 500,
               // optional project-specific commands:
               customCommands: {
                   state: () => ({ success: true, data: this.dumpGameState() }),
                   navigate: async (args) => {
                       await this.router.go(args.page);
                       return { success: true };
                   },
               },
           });
       }
   }
   ```
3. Run your project (Preview-in-Editor, Build & Run, or browser
   preview).
4. Verify the client is reachable:
   ```
   curl http://127.0.0.1:3000/game/status
   # → {"connected":true,"lastPollAt":"2026-05-03T...","queued":false,"pendingCommandId":null}
   ```

## Built-in command types

| `type` | `args` | Returns |
|---|---|---|
| `screenshot` | `{}` | `{filePath, size, width, height}` (host writes PNG to `<project>/temp/mcp-captures/`) |
| `click` | `{name: string}` | `{}` after emitting `Button.EventType.CLICK` |
| `inspect` | `{name: string}` | `{position, scale, eulerAngles, contentSize?, anchorPoint?, layer, active, components, childCount}` |

## Custom commands

Pass a `customCommands` map. Each handler receives the raw `args`
object and returns `{success: boolean, data?: any, error?: string}`
(sync or Promise). Custom command results are forwarded to AI as
`{type: <yourType>, ...data}`.

## Production safety

- `silent: true` (default) catches all `fetch` errors so the client is
  inert when the MCP server is offline.
- Only initialize behind a build flag if you don't want the client in
  release builds:
  ```ts
  if (process.env.MCP_DEBUG === '1' || /* CC dev-build flag */) {
      initMcpDebugClient(...);
  }
  ```
- The client opens **outbound** HTTP polling to a fixed `127.0.0.1`
  endpoint by default. Don't point `mcpBaseUrl` at a public host
  unless you fully trust commands from that source — the receiver
  can read scene state and dispatch arbitrary `Button.CLICK` events.

## Limits

- **Single-flight**: the MCP queue holds one command at a time. If a
  custom handler is slow (>10s), bump `timeoutMs` on the
  `debug_game_command` tool call instead of issuing parallel calls.
- **Camera-dependent screenshot**: the built-in `screenshot` finds the
  first enabled `cc.Camera` via DFS. For a scene with multiple
  cameras (UI overlay + game world), register a custom
  `screenshot_world` / `screenshot_ui` command that targets the camera
  you want.

## Source

- v2.6.0+ ships this template alongside the MCP server.
- Originally derived from harady's
  [cocos-creator-mcp `McpDebugClient`](https://github.com/harady/cocos-creator-mcp)
  (MIT-licensed). Adjusted for cocos-mcp-server: stricter single-flight,
  no MediaRecorder dep, project-rooted screenshot save (host side).
