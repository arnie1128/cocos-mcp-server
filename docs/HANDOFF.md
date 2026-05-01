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
「暫時不可用」、但仍呼叫 `modifyPrefabForDuplication` / `createMetaData` /
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

_（v2.1.0 ~ v2.1.4 詳細修補史、Phase 1-3 落地紀錄、T-P1-1/T-P1-5/T-P1-6
完成記錄、v2.1.2 backlog、code review 範圍提醒等歷史段已搬到
[`docs/archive/handoff-history.md`](archive/handoff-history.md)，HANDOFF
保持為「下次接手只看這份」的活檔。）_

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
