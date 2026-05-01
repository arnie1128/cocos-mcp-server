# Session Handoff

> 給下次接手的 session（含未來自己）。看完這份 + `docs/roadmap/README.md`
> 就能繼續做下去，不需要重看歷史對話。

## 🚀 NEXT SESSION ENTRY POINT（2026-05-01 v2.1.4 完工 / Solo backlog 全清）

當下版本：**v2.1.4**（origin/main HEAD = 本 session 末尾，待 push）。
P0/P1/P4/v2.1.1/v2.1.2/v2.1.2-audit/v2.1.3 全部完工。本 session 把 v2.1.4
backlog 中所有 Solo 項（不需 user 配合的）一次清掉：6 條清理 / 修補 +
1 條 /review 抓出的 regression 反修。沒有 in-flight 任務。**剩下的 v2.1.4
backlog 全部是 live-test 必要項**（Cocos Creator preview / disk 操作），
依 `feedback_notify_before_live_test.md` 規則，下次動工前先 ping user。

**`package.json:version` 已 bump 到 `2.1.4`**（patch bump：本 batch 雖然
新增了 `prefab_set_link` 一個 tool name，但同時砍掉了 `duplicate_prefab` +
`link_prefab` + `unlink_prefab`，整體公共介面是收斂而不是擴張，依 CLAUDE.md
§Conventions 視為清理而不是 minor 級別擴張）。

### 本 session 的 commit chain（待 push）

| SHA | 內容 | 行數 |
|---|---|---|
| `ca4c760` | refactor(prefab-tools): drop dead `duplicatePrefab` + 4 helpers + merge `link_prefab`/`unlink_prefab` → `set_link` | source -141 / dist 同比 |
| `8e1ff1e` | refactor(component-tools): dedup `setComponentProperty` load + cid-tolerant `addComponent` + trim event match | source +26 -22 |
| `dfdb335` | refactor(mcp-server): drop redundant `getFilteredTools` | source -13 |
| `85f3f5b` | fix(scene): tighten `removeEventHandler` trim guard against whitespace-only args（/review 抓出的 regression 反修） | source +8 -3 |

工具數 162 → **160**（-1 `duplicate_prefab`、-2 `link_prefab`/`unlink_prefab`、
+1 `set_link`，淨 -2）。`prefab-tools.ts` 從 608 → ~470 行。tsc + smoke 全綠
（160/14 categories）。

### 各任務細節

**1. `duplicatePrefab` 收尾**（commit `ca4c760`）：method 永遠 resolve
「暂时不可用」、但仍呼叫 `modifyPrefabForDuplication` / `createMetaData` /
`generateUUID` / `readPrefabContent` 後丟棄 result。整段砍掉（method + 4
helpers + `duplicate_prefab` schema/meta/switch entry）。`source/test/
prefab-tools-test.ts:testUUIDGeneration` 跟著移除（用 bracket-access 打到
`generateUUID`，TS 抓不到）。

**2. P2-lite CRUD 合併**（同 commit `ca4c760`）：`prefab_link_prefab` +
`prefab_unlink_prefab` 合併為 `prefab_set_link({mode: 'link'|'unlink',
nodeUuid, assetUuid?, removeNested?})`。底層 scene-bridge 呼叫一樣（mode='link'
→ `linkPrefab(nodeUuid, assetUuid)`；mode='unlink' → `unlinkPrefab(nodeUuid,
removeNested)`）。`scene.ts` 的 `linkPrefab`/`unlinkPrefab` 兩個 method 不
動（它們是 scene-script 端的 façade wrapper，被 set_link 內部 dispatch 用）。

**3. setComponentProperty load ladder dedup**（commit `8e1ff1e`）：原本
Step 5 又發一次 `Editor.Message.request('scene', 'query-node', nodeUuid)` +
loop `__comps__` 找 rawComponentIndex；其實 Step 2 的 `getComponents` 內部
已經 query-node 過、且 `__comps__.map(...)` 對齊 1:1。把 Step 2 loop 多抓
`targetComponentIndex = i`，Step 5 直接 `const rawComponentIndex =
targetComponentIndex;`。-30 行。fallback 路徑（`runSceneMethod('getNodeInfo')`）
回傳的 shape 是 `data: result.data.components`（直接是陣列），caller 拿
`componentsResponse.data.components` 會是 undefined，後續 `allComponents.length`
會 crash —— 早於 Step 5，所以 dedup 不影響 fallback 行為。

**4. `add_component` cid 顯示誤判修補**（同 commit `8e1ff1e`）：原本
post-create verification 用 strict `find(c => c.type === componentType)`，
custom script 在 `__comps__` 的 `type` 欄是 cid（如 `9b4a7ueT9xD6aRE+AlOusy1`）
不是 class name，所以 strict find 失敗、誤報 not-found。加 lenient
fallback：strict 沒中時，比較前後 components 集合，若 count 增長 → 把第一
個 new entry 當作剛加的，回傳 `registeredAs: <cid>`。pre-existence early-return
仍是 strict（caller 傳 class name 而 component 已以 cid 在的話，會走到
create-component 然後 fallback 偵測 + 回 success）。

**5. `remove_event_handler` trim 容錯**（commit `8e1ff1e` 寫入、`85f3f5b`
反修）：`scene.ts:removeEventHandler` 對 `targetUuid` / `handler` 加 trim
比對。`/review` 5-agent 跑出一條 80+ confidence regression：原本 outer
guard `if (targetUuid || handler)` 對 whitespace-only string（如 `'   '`）
為 truthy，trim 後變空字串再 `|| null` 為 null，predicate 退化成全真，
findIndex(0) → 靜默刪 arr[0]。改：trim 提到 guard 上方，guard 改判
`if (targetUuidNorm || handlerNorm)`，no-criteria case 正確留 `removeAt = -1`
回 `'No matching event handler'`。

**6. `MCPServer.getFilteredTools` 二次過濾移除**（commit `dfdb335`）：
`updateEnabledTools` 內部 `setupTools()` 已經依 `enabledTools` 過濾
`toolsList` 一次；`getFilteredTools(enabledTools)` 又 filter 一次同集合 →
no-op layer。直接砍 method，`main.ts:getFilteredToolsList` 改用
`getAvailableTools()`。

### /review 結果（5 agents 並行）

- Agent 1（CLAUDE.md 合規）：0 issue
- Agent 2（淺 bug scan）：1 條 score 85+（whitespace-only guard，已修
  `85f3f5b`）+ 1 條 race window false-positive
- Agent 3（git 歷史）：1 條 race window false-positive（同上）
- Agent 4（prior feedback）：1 條 stale CLAUDE.md tool count（已修）+ 1 條
  package.json 版本待 bump（已 bump 到 2.1.4）+ 1 條 setComponentProperty
  fallback path 風險 false-positive（fallback 早於 Step 5 即崩，不影響
  dedup）
- Agent 5（code-comment guidance）：2 條 comment 措辭精準度，<80 confidence
  不修

合計：1 條真正回歸已修；其餘高分 issue 均為文件 / 版本同步（已處理）。

### v2.1.4 backlog（剩下的 = 全部要 live-test）

下次動工前依 `feedback_notify_before_live_test.md` 先 ping user：

- **`scene_create_scene` 沒 2D/3D 預設範本**：建出來的場景是空 root，要自己
  手 build Camera+Canvas+UITransform+UI_2D layer 才能 preview。schema 加
  `template: 'empty' | '2d' | '3d'`，2d 預設組好 Canvas+Camera+UI_2D layer
  + cameraComponent ref。
- **`node_create_node` 沒 layer 參數**，預設 DEFAULT (`1073741824`)。Canvas
  子節點該 UI_2D (`33554432`) 才被 UI camera 看到。schema 加 `layer` enum
  字串或 number；parent 是 Canvas 後代時自動推 UI_2D。
- **`set_component_property` 對 component reference 的 propertyType 名稱
  不直觀**：`cameraComponent` 是 `cc.Camera` ref，要 `propertyType:
  'component'` + 「裝載該 component 的 node UUID」。第一次用
  `propertyType: 'node'` 失敗時錯誤訊息指向錯方向。建議偵測 +
  在描述加 example。
- **Sprite assign spriteFrame 後自動覆蓋 UITransform contentSize**：
  default `_sizeMode: 1 (TRIMMED)` → 自動取貼圖原生尺寸。修法：assign
  spriteFrame 前先設 `_sizeMode: 0 (CUSTOM)`、或 assign 之後重設
  contentSize。寫 helper / 工作流文件。
- **`save_scene_as` timed out（>15s）**：本 session 用 Boot.scene 為底
  save_as 時 timed out 跑 background 才完成；後續直接 save 都 <2s。需要查
  是 stale-cache 還是真實作問題；很可能跟 façade saving 大場景有關。

**不要動**：
- `nudgeEditorModel` 的 nested-vs-flat dump 雙路徑（CLAUDE.md Landmine #11
  尾段已記錄理由）
- `setComponentProperty` 已 dedup 過的 Step 5；index-correspondence 假設
  在 commit `8e1ff1e` 的 Step 2 註解內有說明，不要再加回 raw query

### 環境 / 同步

- MCP server 預設 port 3000；測試場景 `db://assets/test-mcp/p4-test.scene`
  含 TestBtn / TestToggle / ComplexRoot（v2.1.2 session 建立，本 session 未
  再實機）
- `D:/1_dev/cocos_cs/cocos_cs_349/extensions/cocos-mcp-server/` 待同步到
  v2.1.4 dist + package.json（task #10）

### 上一個 session（v2.1.3 partial）commit chain（已 push、留作回滾參考）

| SHA | 內容 | 行數 |
|---|---|---|
| `d0faebb` | refactor(tools): scene-bridge migration（10/12 callsite） | source -104 |
| `6fda9a4` | refactor(scene): drop 3 dead scene-script methods | source -126 |
| `547115b` | docs(CLAUDE.md): bump rule / dual dump shape / queue prefab fallback | docs +37/-7 |
| `87159bf` | refactor(prefab-tools): remove legacy fallback **stage 1**（entry + 3 direct method） | source -201 |
| `6bb971e` | refactor(prefab-tools): sweep unreachable helpers **stage 2**（45 method） | source -1734 |
| `9b7f1f7` | fix(scene): drop `_componentName` workaround for cocos-engine#16517 + v2.1.3 wrap | source -3 |

### scene-bridge migration（`d0faebb`）細節

10 個 fallback ladder 內部的 `Editor.Message.request('scene', 'execute-scene-script', options)`
換成 `runSceneMethod(method, args)` 1-liner（component-tools 4 + node-tools 4 +
scene-tools 2）。剩 2 處不可換：
- `debug-tools.ts:executeScript` — name 寫死 `'console'`（不是 cocos-mcp-server）
- `scene-advanced-tools.ts:executeSceneScript` — name 由 caller 給（公開 dispatch 工具）

### scene.ts 死 method 清理（`6fda9a4`）細節

`createNewScene` / `removeComponentFromNode` / scene-script 版 `setComponentProperty`
全砍（package.json `panels.scene.methods` 同步刪除）。grep + git log -S 確認無
caller。後兩者已被 host-side `scene/remove-component` 與 `scene/set-property`
channel 取代多時。

### prefab fallback 清理（`87159bf` + `6bb971e`）細節

**stage 1**（`87159bf`）：`createPrefab` 入口砍 fallback ladder，只走 façade。
直接 fallback method 砍：`createPrefabWithAssetDB` / `createPrefabNative` /
`createPrefabCustom`。保留 façade-only path。

**stage 2**（`6bb971e`）：sweep stage 1 留下的 ~45 個 unreachable helper（TS
不抓 unused private method）。Live caller graph 從 13 個 entry method 反向
追蹤，最終只剩 5 個 helper 還活著：
- `validatePrefabFormat`（被 `validatePrefab` 用）
- `generateUUID` / `createMetaData` / `readPrefabContent` /
  `modifyPrefabForDuplication`（全部被 `duplicatePrefab` 用）

砍掉的 helper（45 個）：tryCreateNodeWithPrefab、getNodeData、getNodeWithChildren、
findNodeInTree、enhanceTreeWithMCPComponents、buildBasicNodeInfo、isValidNodeData、
extractChildUuid、getChildrenToProcess、createPrefabData、processNodeForPrefab、
processComponentForPrefab、generateFileId、savePrefabFiles、saveAssetFile、
createPrefabFromNode（host wrapper、無 caller）、create/Meta/reimport/update-AssetWithAssetDB×4、
createStandardPrefabContent、createCompleteNodeTree、uuidToCompressedId、
createComponentObject、processComponentProperty、createEngineStandardNode、
extractNodeUuid、createMinimalNode、createStandardMetaContent、convertNodeToPrefabInstance、
getNodeDataForPrefab、createStandardPrefabData、createNodeObject、extractComponentsFromNode、
createStandardComponentObject、addComponentSpecificProperties、addUITransformProperties、
addSpriteProperties、addLabelProperties、addButtonProperties、addGenericProperties、
createVec2Object、createVec3Object、createSizeObject、createColorObject、
shouldCopyComponentProperty、getComponentPropertyValue、extractValue、
createStandardMetaData、savePrefabWithMeta。也砍了
`source/test/prefab-tools-test.ts:testPrefabDataGeneration`（用 bracket-access
打到死 method，TS 抓到）。test 檔本來就無 npm script 跑。

**回滾錨點**：commit `547115b` 是 stage 1 之前的 SHA（fallback 程式碼還在）；
commit `87159bf` 是 stage 2 之前的 SHA（stage 1 已砍但 helper 還在）。

### 本 session 兩條決策（fork 平行分析後 user 確認）

1. **`debug_get_console_logs` 不重做**：v2.1.2 移除是對的決策。Cocos 沒公開
   console listen channel（`creator-types/editor/packages/console/@types/`
   只有 `pritate.d.ts` IMessageItem 結構，**沒 `message.d.ts`**）；
   `Editor.Message.__protected__.addBroadcastListener` 是 protected API、
   未文件化 channel 不穩；包 host `console.*` 成 ring buffer 覆蓋率差又有
   side-effect 風險。disk 端 `debug_get_project_logs` 已可用且有 PreviewInEditor
   runtime log（v2.1.1 實機驗過）。**不放進 backlog**。

2. **單一工具 + action router 不全面做**（保留 ADR 0001 決策）：discriminated
   union schema 必須展開所有 action 的 args，token 節省最多 ~10-15%（不是
   v1.5.0 宣稱的 -50%）；LLM 在 enum > 30 的 routing 明顯弱於 tool-name
   routing；fork 已有 zod + structured content + SDK Streamable HTTP，
   action router 解不到此層之上的問題。**有價值的折衷**：case-by-case
   CRUD 合併（如 `prefab_link_prefab` + `prefab_unlink_prefab` →
   `prefab_set_link({mode: 'link'|'unlink'})`），列入 v2.1.4 P2-lite。

_（v2.1.3 session 寫下的 v2.1.4 Solo backlog + 環境同步段落已搬到本檔
最頂的 v2.1.4 entry point，避免兩處版本飄移；live-test 項目也統一在頂段。
historical 細節仍保留在下方 v2.1.2 / v2.1.1 / 各 P 階段段落。）_

**v2.1.2 內容**（含修補史）：
- ✅ **P1 EventHandler 持久化**：scene-script `arr.push` 不動 editor
  序列化模型 → `save-scene` 寫不到 disk。修法：host 端在
  `component-tools.ts:nudgeEditorModel` 對 `set-property` 發
  `nodeUuid + __comps__.<idx>.enabled` 的 no-op 寫回，觸發 model 重 pull
  runtime。第一版（commit `92a613e`）試從 scene-script 內 nudge，失敗
  （scene-process IPC short-circuit）；第二版（commit `4d15563`）改 host-side
  通過。實機驗證：Button.clickEvents add/remove 都正確持久化（disk 4→6→5）；
  Toggle.checkEvents 也通（`__comps__.<idx>.enabled` 因 enabled 在
  cc.Component 基類，跨 component 通用）。
- ✅ **P2(b)**：拿掉 `debug_get_console_logs`（`setupConsoleCapture` 是
  placeholder、永遠回空陣列）。tools 163 → 162；debug 類 10 → 9。
  consumer 改用 `debug_get_project_logs` / `debug_search_project_logs`。
- ✅ **P3**：HANDOFF / CLAUDE.md 錯誤宣稱訂正，Test 1 runtime dispatch
  fired 結果寫入。

**剩餘低優先項**（不阻塞，下次想做就做）：
- v2.1.2 P4：`_componentName` workaround（issue #16517）的必要性 —— disk
  上沒這欄位仍 dispatch fired，可能冗餘。要做乾淨對照組（不設
  `_componentName` add → save → reload preview → click）才能真的拿掉。
- `add_component` verification by class name（顯示 cid 而非 class name 時
  誤判 not-found）—— 整 session 都遇到過，但 component 實際有加上、後續
  操作正常。屬 UX 修補，非 P1 等級。
- `remove_event_handler` 用 `(targetNodeUuid, handler)` 字串匹配（非
  index）的容錯（codex round-1 提過 trim 等級的 nit）。

**環境**：MCP server 預設 port 3000；測試場景
`db://assets/test-mcp/p4-test.scene` 含：
- TestBtn（cc.UITransform + cc.Button + EhTest + cc.Sprite，5 個 clickEvents
  指向 EhTest.onClickFromMcp）；位於 Canvas 下，可 preview 點擊
- TestToggle（cc.UITransform + cc.Sprite + cc.Toggle + EhTest，1 個
  checkEvents 指向 EhTest.onClickFromMcp[customEventData=toggle-check]）
- ComplexRoot（multi-child / multi-component prefab instance from
  Test 2，prefab asset uuid `e70a18bb-fdf2-44b0-b685-3e79838f3a3c`）

TS 測試元件 `D:/1_dev/cocos_cs/cocos_cs_349/assets/00_dev/test/EhTest.ts`
（純測試用，可隨時刪）。所有 commit 已 push origin/main，dist 已同步至
`D:/1_dev/cocos_cs/cocos_cs_349/extensions/cocos-mcp-server/`。

## 進度快照（最後更新：2026-05-01 v2.1.4 完工）

```
P0 ✅ done
P1 ✅ done
P4 ✅ done（v2.1.1 程式碼 + v2.1.2 修補 EventHandler 持久化）
   ├── T-P4-3 Prefab façade 工具集    ✅ code done + 實機 5/5 通（含複雜節點）
   ├── T-P4-1 EventHandler 工具集     ✅ code done + 實機通（dispatch fired
   │                                  + add/remove 持久化 + Toggle.checkEvents）
   └── T-P4-2 Panel composable 拆分   ✅ done（直式 640×720 / min 480×640）
v2.1.2 ✅ done（P1 host-side nudge 4d15563 + P2(b) 拿 placeholder + P3 文件訂正）
v2.1.2-audit ✅ done（round-1 d5c97ef + project sweep e2ffa3d/ccb5d04）
v2.1.3 ✅ done
   ├── scene-bridge migration               ✅ d0faebb（10 callsite，-104 行）
   ├── scene.ts 死 method 清理              ✅ 6fda9a4（3 method，-126 行）
   ├── prefab fallback removal stage 1       ✅ 87159bf（entry + 3 method，-201 行）
   ├── prefab fallback removal stage 2       ✅ 6bb971e（45 helper，-1734 行）
   └── _componentName workaround 砍掉        ✅ 9b7f1f7（A/B 實機驗：preview-click fire OK）
v2.1.4 ✅ done（本 session，Solo backlog 全清 + /review 反修 1 條）
   ├── duplicatePrefab dead-code 清理        ✅ ca4c760
   ├── P2-lite link/unlink → set_link        ✅ ca4c760
   ├── setComponentProperty ladder dedup     ✅ 8e1ff1e
   ├── add_component cid 顯示誤判修補         ✅ 8e1ff1e
   ├── remove_event_handler trim 容錯        ✅ 8e1ff1e + 85f3f5b（review 反修）
   └── MCPServer.getFilteredTools 二次過濾   ✅ dfdb335
v2.1.5+ ⏳ live-test backlog（5 條 MCP workflow 缺塊，動工前須 ping user）
P2/P3 ⏳ pending（roadmap 級別，非 v2 patch）
```

**v2.1.1 內容**（commit `62f6e83`）：
- `findNodeByUuidDeep` 解 `cc.Node.getChildByUuid` 只搜直系子節點的 bug
  （EventHandler 工具實機觸發）
- `applyPrefab` 不再用 façade boolean 當 success 指標（façade 即使成功
  寫入 disk 也回 `false`；改成「沒拋例外 = success」，原值降級為
  `data.facadeReturn` metadata）
- `createPrefabFromNode` 用 `scene/query-nodes-by-asset-uuid` 解出新
  instance UUID，回傳 `data.instanceNodeUuid` + `data.prefabAssetUuid`
- panel 預設大小 → 720×640（後續 `0b60ad8` 改直式 640×720 / min 480×640）
- 所有 P4 ⚠️ 4 項翻為 ✅（cc.EventHandler 可 require / snapshot 持久化 /
  façade 解析鏈 / `db://` url 接受）—— 注意「snapshot 持久化」這條
  **2026-05-01 收尾 session 證實是錯的**，見 §Phase 2 實機驗證收尾段
  與下方 v2.1.2 P1 backlog

**v2.1.1 後新引入的程式碼變動**（code review 範圍）：
- `source/scene.ts`：`getPrefabFacade()` / `findNodeByUuidDeep()` /
  `resolveComponentContext()` / `serializeEventHandler()` 4 個 helper +
  7 個對外 method（applyPrefab / linkPrefab / unlinkPrefab /
  getPrefabData / addEventHandler / removeEventHandler / listEventHandlers）
- `source/lib/scene-bridge.ts`（新檔）：`runSceneMethod` /
  `runSceneMethodAsToolResponse` helper
- `source/tools/prefab-tools.ts`：`updatePrefab` / `createPrefab` 入口
  分支、3 個新工具（link_prefab / unlink_prefab / get_prefab_data）
- `source/tools/component-tools.ts`：3 個新工具（add_event_handler /
  remove_event_handler / list_event_handlers）
- `source/tools/tool-manager.ts`：`reconcileConfigurationsWithRegistry()`
  自動補新工具到舊 saved config
- `source/panels/default/index.ts` 384 → 80 行；新增三個 composables

**累積成果**：
- 14 tool 檔 / **160 tools**（v2.1.1 加 6 個：3 prefab façade + 3 EventHandler；
  v2.1.2 拿掉 1 個 placeholder `debug_get_console_logs`；v2.1.4 砍掉
  `duplicate_prefab`、合併 `link_prefab` + `unlink_prefab` → `set_link`，淨 -2）
  全部走 zod schema（手寫 JSON Schema 從 ~3200 行縮為 ~1100 行）；helper 在
  `source/lib/schema.ts` 抹平 zod 4 與手寫風格差異
  （`additionalProperties:false`、`.default()` 與 `required` 互動）
- `MCPServer` 與 `ToolManager` 共用 `createToolRegistry()` 出來的同一份
  ToolExecutor 實例（沒有重複 new）
- 全域 logger（`source/lib/log.ts`）：debug 受 `enableDebugLog` 設定 gating，
  warn/error 永遠輸出
- 預製體 channel 全部對齊 `@cocos/creator-types`，砍掉 ~250 行死代碼+
  bogus channel 呼叫
- `source/mcp-server-sdk.ts` 用官方 `@modelcontextprotocol/sdk` 的低階
  `Server` + `StreamableHTTPServerTransport`（stateful 模式，
  `mcp-session-id` 分流），取代手寫 HTTP+JSON-RPC 派遣；協議版本由 SDK
  自動協商（已測過協商到 `2025-06-18`）
- `tools/call` 回應改為結構化：成功路徑帶 `structuredContent`（同時保留
  `content[].text` 為 JSON.stringify 結果做向後相容），失敗路徑帶
  `isError: true` + 錯誤訊息文字
- 五代理 code review（`/code-review:code-review`）跑完一輪後修了兩條
  ≥80 信心議題（`f327815`）：(1) `main.ts:updateSettings` 補
  `updateEnabledTools()` 復原 panel「保存設定」流程（之前每次按下都會
  重新暴露全部 157 工具）；(2) `CLAUDE.md` 架構地圖把已刪的
  `mcp-server.ts` 換成 `mcp-server-sdk.ts` 並補 `lib/log.ts` /
  `lib/schema.ts`。隨後 `code-simplifier:code-simplifier` subagent
  再做一輪內部精簡：抽 `jsonRpcError()` helper、去除 `start()` 多餘
  外層 try/catch、`executeToolCall` 用 destructuring + early return
  等，public surface 不變、smoke / live test 仍 59/59 全綠

## 工作流規則（**動工前先讀**）

### 先 commit + push 再動高風險改動

source: `~/.claude/projects/D--1-dev-cocos-mcp-server/memory/feedback_commit_before_risky_changes.md`

動以下任何一種改動前，務必：
1. `git status` 確認工作樹乾淨
2. `git log -1` 確認 origin/main 已 sync 到 HEAD
3. **不滿足** → 先把現有改動 commit + push 上去再開工

適用情境：
- 刪檔、刪 method（即使 grep 過確認沒人呼叫）
- 跨 5+ 檔的 bulk edit
- 換 SDK / 換 transport / 換協議
- mass schema 替換

理由：用戶要「`git reset --hard origin/main` 永遠是有效回滾」當保險。
本地 commit 不算數，必須 push 到遠端。

### 等價性驗證（非破壞性改動仍適用）

每改一檔工具的 schema → `npm run build` → 用：
```bash
node -e "const {Cls} = require('./dist/tools/X.js');
new Cls().getTools().forEach(t => console.log(t.name, JSON.stringify(t.inputSchema, null, 2)));"
```
跟 git history 上一版做 diff。已知 zod 4 vs 手寫差異列表見
`source/lib/schema.ts` 的 `relaxJsonSchema` 註解。

## T-P1-1 / T-P1-5 完成記錄

### 架構

`source/mcp-server-sdk.ts` 用低階 `Server`（不是高階 `McpServer`）+
`StreamableHTTPServerTransport` stateful 模式：

```
http.Server (port: settings.port)
├── /mcp              → handleMcpRequest
│   ├── POST 帶現存 mcp-session-id  → 路由到對應 SessionEntry
│   ├── POST initialize 無 session   → 建新 Server+Transport，登錄 sessions Map
│   └── GET / DELETE                  → 路由到對應 SessionEntry（沒有回 404）
├── /health            → JSON {status:'ok', tools:N}
├── /api/tools         → JSON 工具清單 + curl 範例
└── /api/{cat}/{tool}  → REST 短路，繞過 MCP 直接 dispatch
```

每個 session = 一個 `Server` + 一個 `StreamableHTTPServerTransport`，
keyed by sessionId（透過 `onsessioninitialized` callback 寫入 Map，
`onsessionclosed` 與 `transport.onclose` 兩個地方做清理）。

`updateEnabledTools(...)` 重新計算 `toolsList`，之後對所有 live sessions
廣播 `sendToolListChanged()`。

### 對外契約（驗證過保留）

| 端點 / 行為 | 狀態 |
|---|---|
| `POST http://127.0.0.1:<port>/mcp` | ✅（現由 SDK 處理 session 與協議協商） |
| `GET /health` 回 `{status:"ok",tools:N}` | ✅ |
| `POST /api/{category}/{tool}` REST 短路 | ✅ |
| `GET /api/tools` 回工具清單 | ✅ |
| `updateEnabledTools(...)` 過濾 tools/list | ✅（過濾在 ListToolsRequest handler 內） |

煙霧測試腳本：`scripts/smoke-mcp-sdk.js`，跑流程
init → tools/list → tools/call (成功) → tools/call (失敗) → REST 一輪。
要重跑：

```bash
npm run build
node scripts/smoke-mcp-sdk.js
```

### 已知限制 / 後續可改

1. **session 閒置 TTL 已加（30 分鐘預設，每 60 秒掃一次），但仍無 LRU 上限**。
   詳見 `source/mcp-server-sdk.ts` 的 `SESSION_IDLE_TIMEOUT_MS` 與
   `sweepIdleSessions()`。若日後上多 client 並發長駐情境，要再補
   max-sessions 上限以防超量同時開啟造成記憶體成長。
2. **行為變更**：以前可以直接 POST `/mcp` 帶 `tools/list` 不需先 initialize，
   現在會 400「No valid session ID」。Streamable HTTP spec 本來就要求
   先 initialize；任何不照 spec 走的 client 要改。`/api/{cat}/{tool}`
   REST 短路保持原樣，可以繼續直接打。
3. **協議版本**自動協商（測過協商到 `2025-06-18`）；`2024-11-05` 寫死沒了。

### Panel bug B-001 一併修了

`<ui-checkbox>` 是 Cocos 自訂元素、事件是 `change`+`event.target.checked`，
不吃 Vue v-model 的 `value`+`input`。原本 `自動啟動` / `調試日誌` 兩個
checkbox 用 `v-model` 綁，所以勾選不持久化視覺。改用同檔工具勾選框那種
`:value` + `@change` 的寫法。順便修了 `saveSettings()` 把 `debugLog`
直接送後端的問題（後端欄位是 `enableDebugLog`），原本 debug log 設定會
靜默丟失。詳見 `docs/bugs.md` B-001。

## T-P1-6 驗證結果（保留為 reference）

下次任何 prefab 相關工作要記得：

**`@cocos/creator-types/editor/packages/scene/@types/message.d.ts` 中
prefab 相關 channel 只有一個：`restore-prefab`**，簽章
`{ uuid: string }`（`ResetComponentOptions`）。

不存在的 channel（不要再寫）：
- `connect-prefab-instance` / `set-prefab-connection` / `apply-prefab-link`
- `apply-prefab` / `set-prefab` / `load-prefab-to-node`
- `revert-prefab` / `load-asset`

實際在用的 prefab 流程（host 進程，Editor.Message）：
- 實例化 → `scene/create-node` 帶 `assetUuid`（會自動建立 prefab linkage）
- 還原 / revert → `scene/restore-prefab` 帶 `{ uuid: nodeUuid }`
- Apply（把實例改動推回資產）→ host 沒有；要走 scene-script + façade
  `applyPrefab(nodeUuid)`（見下節）

## 2026-05-01：P4 規劃就位 + Phase 1 done（程式碼層）

詳細可行性分析：[`docs/analysis/v15-feasibility.md`](analysis/v15-feasibility.md)
任務分解：[`docs/roadmap/05-v15-spec-parity.md`](roadmap/05-v15-spec-parity.md)

**Phase 1 已落地**（commit `a5cc858`）—— T-P4-3 Prefab façade 工具集：

完整 prefab API 在 **scene façade**（`scene-facade-interface.d.ts`），只能透過
`Editor.Message.request('scene', 'execute-scene-script', { name, method, args })`
進入 scene 進程後呼叫：

| 動作 | 路徑 |
|---|---|
| 建立 prefab 資產 | scene-script `cce.Prefab.createPrefab(uuid, url)` |
| Apply（推回資產） | scene-script façade `applyPrefab(nodeUuid)` |
| Link（連到 prefab 資產） | scene-script façade `linkPrefab(nodeUuid, assetUuid)` |
| Unlink（解除連接） | scene-script façade `unlinkPrefab(nodeUuid, removeNested)` |
| 讀 prefab dump | scene-script façade `getPrefabData(nodeUuid)` |

**Phase 1 落地清單**（已完成）：

1. ✅ `source/scene.ts`：補 5 個方法（createPrefabFromNode 重寫、applyPrefab、
   linkPrefab、unlinkPrefab、getPrefabData），加 `getPrefabFacade()` 在
   `cce.Prefab` / `cce.SceneFacadeManager` 之間找可用 façade。
2. ✅ `source/lib/scene-bridge.ts`（新檔）：抽 `runSceneMethod()` /
   `runSceneMethodAsToolResponse()` helper。
3. ✅ `source/tools/prefab-tools.ts`：
   - `updatePrefab` 改走 scene-bridge → applyPrefab，不再 fail loudly。
   - 新增三個 MCP 工具：`link_prefab` / `unlink_prefab` / `get_prefab_data`
     （走 zod schema、走 scene-bridge）。
   - `createPrefab` 入口先試 scene-script `cce.Prefab.createPrefab`，
     成功時 fire-and-forget `asset-db: refresh-asset` 補保險；失敗
     fallback 自寫 JSON。
4. ✅ `tsc --noEmit` 通過、`node scripts/smoke-mcp-sdk.js` 全綠
   （tools count 157 → 160）。
5. ✅ CLAUDE.md Landmines 加註：`updatePrefab` 已走 façade。

**Phase 1 實機驗證結果**（v2.1.1 / 2026-05-01）：
- ✅ `cce.Prefab.createPrefab(uuid, url)` 接 `db://...` form。雙寫 try
  仍保留作 fallback。
- ✅ `applyPrefab` 直接寫入 disk，不需 `asset-db: refresh-asset`。
  `update_prefab` 不另外 refresh；`create_prefab` 仍 refresh 補保險。
- ✅ façade 從 `cce.SceneFacadeManager` 解出（三個 candidate 之一，
  `getPrefabFacade()` 偵測順序保留）。
- ⚠️ **`applyPrefab` 回傳 boolean 不可信**：實測即使成功寫入 disk
  也回 `false`。v2.1.1 改為「沒拋例外 = success」，raw 回傳值
  以 `data.facadeReturn` 暴露作 metadata。
- ⚠️ **`createPrefab` 副作用**：原 source node 被重命名為 prefab name +
  換新 UUID。v2.1.1 用 `scene/query-nodes-by-asset-uuid` 解出
  `instanceNodeUuid` 一併回傳。

**Phase 2 已落地**（commit `951c051`）—— T-P4-1 EventHandler 工具：

- `source/scene.ts`：補三個方法（addEventHandler / removeEventHandler /
  listEventHandlers）、加 `resolveComponentContext()` helper、加
  `serializeEventHandler()` helper。實作走「scene-script + new
  cc.EventHandler」路徑（v15-feasibility 路徑 B），並同時設 `component`
  + `_componentName` 規避 cocos-engine#16517。
- `source/tools/component-tools.ts`：新增三個 MCP 工具
  `add_event_handler` / `remove_event_handler` / `list_event_handlers`，
  入參用 zod schema，預設 `componentType=cc.Button`、
  `eventArrayProperty=clickEvents`，支援 Toggle / ScrollView 等其他
  EventHandler 屬性。
- 工具總數 160 → 163；tsc + smoke 通過。
- ✅ **實機驗證**（v2.1.1 / 2026-05-01，2026-05-01 收尾再補）：
  - `cc.EventHandler` 透過 `require('cc')` 在 scene-script 取得。
  - ⚠️ **`Editor.Message.send('scene', 'snapshot')` 不持久化 EventHandler
    到 disk** —— 之前「snapshot 足以持久化」的 HANDOFF 宣稱是錯的。
    snapshot 只進 undo 層；editor 的「scene 序列化模型」只有透過
    `scene/set-property` 等正規 channel 才會更新，因此 scene-script 直接
    `arr.push` 出來的 EventHandler 不在 model 內，`save_scene` 序列化時
    寫出空 clickEvents（disk 仍空但 dump 顯示有，三層不一致）。
    今天用「改 Button transition」當 nudge 才意外讓 model 同步 runtime →
    自動存 → disk 有 clickEvents → preview 載到 → dispatch fired。
    v2.1.2 P1 要把 `addEventHandler` / `removeEventHandler` 改走
    `scene/insert-array-element` / `remove-array-element` 正規 channel。
  - deep node lookup 修補後（`findNodeByUuidDeep`），nested 節點下的
    component 都能解出。
  - **runtime onClick dispatch 已實證**：點擊後 `[PreviewInEditor]
    [EhTest] onClickFromMcp fired EventTouch {…}` 出現在 project.log
    （line 40786），所以 dispatch 路徑可信。
    **`_componentName` workaround 看似不必要**：disk 上的
    `cc.ClickEvent` 只有 `component`/`handler`/`customEventData`，
    沒有 `_componentName` 欄位（line 603–610），preview 重載仍 dispatch 成功。
    但 HANDOFF 已決保留為防禦性，這 session 不動，留待下次 inspector-build
    比對時再評估。

**Phase 3 已落地**（commit `fd9011f`）—— T-P4-2 Panel composable：

- `source/panels/default/composables/`：新增三檔
  `use-server-status.ts` / `use-settings.ts` / `use-tool-config.ts`，各自
  封裝相關 reactive state、computed、IPC handler。
- `source/panels/default/index.ts`：384 → 80 行；setup() 內僅 `activeTab`
  與三個 composable 組合 + 生命週期 hook。
- 27 個 `console.log/warn/error` 全部換 `logger.{debug,error}`；面板的
  `enableDebugLog` 切換現在會呼叫 `setDebugLogEnabled()`，讓面板與 host
  共用同一個 debug gate。
- 不動 `static/template/vue/mcp-server-app.html` 與 CSS（範圍縮小決策，
  詳見 v15-feasibility 與 roadmap/05）。
- tsc + smoke 通過。

**v2.1.1 後仍未驗的實機項目** —— 全部驗完（2026-05-01 收尾 session）：
- ✅ runtime onClick dispatch 已實證可 fire（見 §Phase 2 實機驗證收尾段）；
  順便發現 EventHandler 持久化 bug（→ v2.1.2 P1）+ `_componentName`
  workaround 看似冗餘。
- ✅ 複雜節點 createPrefab：測試了 ComplexRoot（Sprite+UITransform）下
  3 child（Header/Body/Footer）+ 1 grandchild（Body/Icon），共 7 個
  components（UITransform×4、Sprite×4、Label、Button），`prefab_create_prefab`
  走 `method: scene-facade` 成功，dump 完整、`cc.PrefabInfo` linkage 正確、
  instance UUID 重新解出（`88Q9mL8dZDBJvU2X4hK+z1`）。façade 路徑對
  複雜節點 OK。
- ✅ 連續 apply / link / unlink：modify→apply→apply(no-diff)→unlink→
  re-link→modify→apply 全 success。發現：`linkPrefab` 回 `undefined`
  （同 `applyPrefab false` façade 怪癖，新觀察）；`getPrefabData` 在 unlink
  後仍回完整 dump（façade 從 asset 讀，不受 node `_prefab` 連結變化影響）；
  apply 不 mark scene dirty 也不 auto-save；需另呼叫 `save_scene`。

**v2.1.2 backlog**（按優先序）：
- ✅ **P1 EventHandler 持久化 bug**（fix landed 2026-05-01；
  scene-side 嘗試失敗、改 host-side 後實機驗證通過）：
  - 第一版（scene.ts 內 nudge，commit `92a613e`）— 失敗。從 scene-script
    內呼叫 `Editor.Message.request('scene', 'set-property', ...)` 不會
    propagate model sync，scene-process IPC 看似 short-circuit 自己。
  - **第二版**（host-side nudge，本次 commit）— 成功。`source/tools/
    component-tools.ts` 新加 helper `nudgeEditorModel(nodeUuid,
    componentType)`：在 `add_event_handler` / `remove_event_handler`
    case 拿到 scene-script response 之後，host 自己發 `set-property`：
    ```
    Editor.Message.request('scene', 'set-property', {
      uuid: nodeUuid,
      path: `__comps__.${idx}.enabled`,
      dump: { value: <current enabled> },
    })
    ```
    **重點**：path 走 `nodeUuid + __comps__.<idx>.<prop>`，**不是**
    `componentUuid + <prop>` —— 後者不會 propagate（早先試過用
    runtime cc.Component.uuid 當 target，無效）。idx 透過
    `Editor.Message scene/query-node` 拿 `__comps__` 陣列、按 type 比對
    解出。實機驗證：add+save 後 disk 從 4 → 6 cc.ClickEvent（runtime 之前
    有 6 但 disk 只有 4，nudge 觸發 save 一次補上兩筆）。
  - scene.ts 的 `addEventHandler` / `removeEventHandler` 已改回 sync，
    保留新加的 `componentUuid` / `componentEnabled` 欄位在 `data` 裡（給
    debug / 將來其他 nudge 路徑備用，host-side 目前不用這兩欄、自己 query）。
  - **後續補測（2026-05-01）**：
    - `remove_event_handler` 持久化也通：Button.clickEvents disk 6→5，
      `hello-from-mcp` 從 disk 移除、runtime 同步。
    - 跨元件 `cc.Toggle.checkEvents` 也通：建 TestToggle 節點 +
      `add_event_handler` 走 `eventArrayProperty: checkEvents`，disk
      寫出 `"checkEvents": [...{customEventData: "toggle-check"}...]`。
      `__comps__.<idx>.enabled` path 因 `enabled` 是 cc.Component 基類
      欄位，對任何 component 都通用（不限 Button / Toggle）。
- ✅ **P2(b) `debug_get_console_logs` 拿掉**（fix landed 2026-05-01）：
  原本 `setupConsoleCapture()` 是 placeholder（只 `debugLog` 一句、沒掛
  任何 listener），`consoleMessages` 永遠空陣列；tool 永遠回 `[]` 騙
  caller。本次直接從 schema / meta / switch 拿掉 `get_console_logs` 入口，
  順便把 dead 的 `consoleMessages` field、`setupConsoleCapture`、
  `addConsoleMessage` 一起刪。`clear_console` 保留（仍透過
  `Editor.Message.send('console', 'clear')` 工作正常）。Console 內容查詢
  改指向已可用的 `debug_get_project_logs` 與 `debug_search_project_logs`
  （讀 `temp/logs/project.log`，包含 PreviewInEditor 的 runtime log）。
  總工具數 163 → 162；debug 類 10 → 9。
- **P4 #16517 workaround 評估**：實機 disk 上沒 `_componentName` 欄位
  仍 dispatch 成功（project.log line 40786 已實證），workaround 可能冗餘。
  P1 修補完後（EventHandler 真正持久化），可再做一次「不設 _componentName
  的 add → preview 點擊」對照組實證；通過則可考慮移除 workaround。

**v2.1.1 已修的項**（程式碼變更已在 dist 同步）：
- scene.ts `findNodeByUuidDeep` deep node lookup（commit `41b7d9b`）
- `applyPrefab` 不再把 façade boolean 當 success 指標（在 `62f6e83`）
- `createPrefabFromNode` 用 `query-nodes-by-asset-uuid` 解出新 instance
  UUID（在 `62f6e83`）；實機驗證回傳 `instanceNodeUuid: a41l9zaspMz6WsEivzHZP4`
- panel `package.json panels.default.size`：先 720×640 横式（`62f6e83`），
  user feedback 後改 640×720 直式 / min 480×640（commit `0b60ad8`）

**Code review 範圍提醒**（next session 跑完測試後做）：
diff against tag `v2.1.0` (commit `ac1248e`) 即可拿到所有 v2.1.1 改動。
建議用 `/code-review:code-review` 對 `ac1248e..HEAD` 跑。重點審查：
- `source/scene.ts`：getPrefabFacade 的 façade 偵測順序、findNodeByUuidDeep
  的 `_id` vs `uuid` 雙寫、addEventHandler 的 #16517 workaround 是否該保留
- `source/lib/scene-bridge.ts`：runSceneMethodAsToolResponse 對非 envelope
  回傳的 wrap-in-success 行為是否合理
- `source/tools/prefab-tools.ts`：createPrefab 三層 fallback（façade →
  asset-db → custom JSON）是否會在某條失敗路徑下產生半完成 prefab
- `source/tools/tool-manager.ts`：reconcileConfigurationsWithRegistry 對
  「user 之前明確 disable 的工具改名後出現新名稱」的行為（會被誤加為 enabled）

## 環境快速確認

```bash
cd D:/1_dev/cocos-mcp-server
git status                    # 應為乾淨
git log --oneline -3          # 最頂為 v2.1.4 wrap commit（待 push 後固定 SHA）
npm run build                 # 預期 tsc 無輸出
node -e "const {createToolRegistry} = require('./dist/tools/registry.js');
const r = createToolRegistry();
let total = 0;
for (const c of Object.keys(r)) total += r[c].getTools().length;
console.log('categories:', Object.keys(r).length, 'tools:', total);"
# 預期：categories: 14 tools: 160

grep -rE "lizhiyong|fixCommonJsonIssues" source/   # 應無輸出（P0）
grep -rE "'apply-prefab'|'revert-prefab'|'load-asset'|'connect-prefab-instance'" source/   # 應無輸出（T-P1-6）

# v2.1.4 同步檢查（應全相等，僅 .git / node_modules / source / docs / scripts 不在）
diff -rq D:/1_dev/cocos-mcp-server/dist D:/1_dev/cocos_cs/cocos_cs_349/extensions/cocos-mcp-server/dist
diff D:/1_dev/cocos-mcp-server/package.json D:/1_dev/cocos_cs/cocos_cs_349/extensions/cocos-mcp-server/package.json

# MCP server 健康檢查（cocos editor 已開 plugin）
curl -s http://127.0.0.1:3000/health   # 預期：{"status":"ok","tools":160}
```

**測試場景**：`db://assets/test-mcp/p4-test.scene`（含 TestBtn instance + TestBtn.prefab）。
要清就：
```bash
curl -s -X POST http://127.0.0.1:3000/api/project/delete_asset -H "Content-Type: application/json" -d '{"url":"db://assets/test-mcp"}'
```

## 文件入口

- 整體 roadmap：`docs/roadmap/README.md`
- P1 詳細任務 + 進度：`docs/roadmap/02-architecture.md`
- P4 詳細任務 + 進度：`docs/roadmap/05-v15-spec-parity.md`
- **v1.5.0 可行性分析（P4 落地依據）**：`docs/analysis/v15-feasibility.md`
- 程式碼地雷清單：`CLAUDE.md` §Landmines（P0 + T-P1-6 已修的標 ✅）
- ADR 0001（不追 v1.5.0 spec 的決策）：`docs/adr/0001-skip-v1.5.0-spec.md`
- 上游差異分析：`docs/analysis/upstream-status.md`

## 回滾錨點

| 退到哪個狀態 | 指令 |
|---|---|
| v2.1.4 改動前（v2.1.3 release 點） | `git reset --hard 9b7f1f7` 然後 `git push --force-with-lease` |
| v2.1.4 prefab cleanup 後、component-tools dedup 前 | `git reset --hard ca4c760` 然後 `git push --force-with-lease` |
| v2.1.4 review 反修前（成功合進但 trim regression 還在） | `git reset --hard dfdb335` 然後 `git push --force-with-lease` |
| Panel 直式改動前（v2.1.1 release 點） | `git reset --hard 62f6e83` 然後 `git push --force-with-lease` |
| v2.1.1 改動前（v2.1.0 release 點） | `git reset --hard ac1248e` 然後 `git push --force-with-lease` |
| P4 開工前（只留 P1 done） | `git reset --hard afc4753` 然後 `git push --force-with-lease` |
| T-P1-1 改動前（保留 T-P1-2~6） | `git reset --hard d5b0484` 然後 `git push --force-with-lease` |
| T-P1-6 改動前（保留 zod 全部） | `git reset --hard 1035407` 然後 `git push --force-with-lease` |
| T-P1-4 全部改動前（只留 P0 + logger/registry） | `git reset --hard c411a9b` 然後 `git push --force-with-lease` |
| P1 全部改動前（只留 P0） | `git reset --hard 7fb416c` 然後 `git push --force-with-lease` |
| Fork 起點 | `git reset --hard 754adec` 然後 `git push --force-with-lease`（會丟掉所有本 fork commit）|

`--force-with-lease` 比 `--force` 安全，會檢查遠端沒被別人推過。
