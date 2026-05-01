# Session Handoff

> 給下次接手的 session（含未來自己）。看完這份 + `docs/roadmap/README.md`
> 就能繼續做下去，不需要重看歷史對話。

## 🚀 NEXT SESSION ENTRY POINT（2026-05-01 v2.1.5 完工 + doc 重整 / P2 待開新 session）

當下版本：**v2.1.5**（origin/main HEAD = doc 重整 commit，已 push）。
P0/P1/P4/v2.1.1/v2.1.2/v2.1.2-audit/v2.1.3/v2.1.4 全部完工，**v2.1.5 5 條
live-test backlog 全清**。本 session 在 v2.1.5 之後又做了一輪 **doc 重整**：
歸檔上游 README/FEATURE_GUIDE、重寫 root README（zh-TW、fork-accurate）、
寫 `scripts/generate-tools-doc.js` + 自動產 `docs/tools.md`、清掉 dead
artifact `TestScript.js`。沒有 in-flight 程式碼任務。

**下一步是 P2 工具收斂評估**（ADR 0001 §4 的 conditional gate）—— **新開
session 處理**，不在本 backlog。動工順序見下方「P2 待辦」。

**`package.json:version` 已 bump 到 `2.1.5`**（patch bump：每條都是新增 opt-in
旗標 / 重寫 buggy implementation，沒有公共 tool name 增減；工具數仍 160）。

### 本 session 的 commit chain（已 push）

| SHA | 內容 | 行數 |
|---|---|---|
| `4e5e316` | feat(component-tools): preflight propertyType mismatch on reference fields（v2.1.5 batch 起點，bump 2.1.4→2.1.5） | source +109 -26 |
| `48bad45` | feat(node-tools): add layer arg + auto UI_2D under Canvas to create_node | source +92 |
| `cf2272a` | feat(scene-tools): add template scaffolding to create_scene（empty / 2d-ui / 3d-basic） | source +175 -38 |
| `9230234` | feat(component-tools): preserveContentSize flag for cc.Sprite.spriteFrame | source +34 -5 |
| `d36221e` | fix(scene-tools): make save_scene_as programmatic and dialog-free | source +89 -25 |

工具數仍 **160**。tsc + smoke 全綠。

### 各任務細節（v2.1.5 live-test backlog）

**1. set_component_property propertyType mismatch preflight**（commit `4e5e316`）：
`analyzeProperty` 多回傳 `metaType` + `metaExtends`（從 component dump 的
property descriptor 抓）。新加 `detectPropertyTypeMismatch` 在 Step 4 之前
比對：使用者傳 `propertyType: 'node'/'component'/'asset'` 時對齊 metadata
推得的 reference kind（cc.Node / extends cc.Component / extends cc.Asset），
mismatch 直接 reject 並回建議的正確 propertyType + value 範例。canonical case：
`cc.Canvas.cameraComponent` 用 `'node'` 會被擋下，error 指向
`'component' + node-uuid-hosting-cc.Camera`。實機 3/3 通（mismatch 抓到、
正路仍通、`cc.Sprite.color` / `cc.Button.target` 不誤判）。

**2. node_create_node 加 layer 參數 + Canvas auto UI_2D**（commit `48bad45`）：
schema 多 `layer: enum-string-or-number`（preset：DEFAULT / UI_2D / UI_3D /
SCENE_GIZMO / EDITOR / GIZMOS / IGNORE_RAYCAST / PROFILER）。createNode 後依優先序：
顯式 string→preset map / 顯式 number→pass-through / 未傳→
`ancestorHasComponent('cc.Canvas')` 走最多 64 hops，找到 → 自動 UI_2D。
透過 host-side `set-property` 寫 layer。response 多 `layer` + `layerSource:
'explicit' | 'auto-canvas' | 'default'`。實機 5/5 通（auto-canvas / 顯式
preset / 顯式 number / 不傳 → 不動 / 不存在 preset 名直接 zod reject）。

**3. scene_create_scene 加 template**（commit `cf2272a`）：
schema 多 `template: 'empty' | '2d-ui' | '3d-basic'`，default 'empty'（保持
舊行為）。非 empty：寫盤後自動 `open-scene` 切到新場景，host-side 透過
`Editor.Message` 直接 build：'2d-ui' = Camera (cc.Camera, projection ORTHO)
+ Canvas (cc.UITransform 由 cc.Canvas 自動拉、layer UI_2D、cameraComponent
linked via reused `componentTools.execute('set_component_property', ...,
propertyType:'component')`)。'3d-basic' = Main Camera (perspective default)
+ Main Light (cc.DirectionalLight)。component 是分兩步走：先 `create-node`
再 loop `create-component`（`CreateNodeOptions.components` 在 typed API 是
unused param）。實機 3/3 通。

**4. preserveContentSize flag for cc.Sprite.spriteFrame**（commit `9230234`）：
`set_component_property` schema 多 opt-in `preserveContentSize: boolean`，
default false（保持 cocos TRIMMED auto-fit 行為）。true 時：在 spriteFrame
assign 之前送一次 `set-property` 把 `__comps__.${idx}.sizeMode` 設成 0
(CUSTOM)。flag 只在 `componentType === 'cc.Sprite' && property === 'spriteFrame'`
時生效。實機驗：對 200x100 contentSize 的 Sprite 指派 1024x1024 貼圖，
不傳 flag → contentSize 跳到 2000x2000；傳 true → contentSize 留 200x100，
sizeMode 自動切 0。

**5. save_scene_as 從 dialog 改為程式化**（commit `d36221e`）：原本呼叫
`scene/save-as-scene` 只會彈 native dialog 並 block 到 user 點 — 那就是
HANDOFF v2.1.4 中 timeout >15s 的 root cause（user 不在電腦前就掛）。
重寫為：`save-scene` flush → `asset-db: query-url(sceneUuid)` 抓 source URL
→ pre-check target uuid（沒做的話 collision 會被 cocos `copy-asset` 自己
彈 confirm dialog 蓋過 `overwrite: false` 旗標）→ `asset-db: copy-asset` →
opt-in `openAfter`. schema 多 `openAfter`（default true）+ `overwrite`
（default false）。實機 4/4 通：fresh path / collision (no overwrite) → 純
error 無 dialog / collision (overwrite) → silent 覆寫 / 都在 ~330ms。

### Doc 重整（v2.1.5 後續，本 session 第二段）

緊接 v2.1.5 之後做的 doc 全面盤整，commit chain 待寫入：

- **歸檔上游 doc**：`README.md` / `README.EN.md` / `FEATURE_GUIDE_CN.md` /
  `FEATURE_GUIDE_EN.md` 從根目錄移到 `docs/archive/upstream-docs/`。
  原內容是上游 v1.5.0 行銷話術（聲稱 50 工具收斂、token -50% 等等都未實作），
  保留歷史脈絡用，不再更新。
- **重寫 root README**：純 zh-TW、fork-accurate；明確聲明本 fork 不對齊
  v1.5.0 規劃、列實際工具數（160 / 14 categories）+ 安裝 + AI client 配置
  + 文件導覽。多語暫不規劃（user 指示：日後另開 session 處理，可能採
  `docs/i18n/` 布局）。
- **`docs/tools.md` 由 generator 產**：`scripts/generate-tools-doc.js` 跑
  `createToolRegistry()` → 為每個工具輸出 markdown（name + description +
  input schema 表）。手寫的 intro / category 描述放 generator 內當 const map。
  工具增減後 `npm run build && node scripts/generate-tools-doc.js` 重跑就同步。
- **清 dead artifact**：repo 根目錄的 `TestScript.js` 是上游 dev 殘留 cocos
  Component（編譯後 .js + sourcemap），無人 reference、cocos 不會從擴充套件
  根目錄載 component。直接刪除。
- **`docs/README.md` 索引同步**：加 `tools.md` + `archive/upstream-docs/`
  條目，加註 generator-managed 的維護規則。

### v1.4.0 / v1.5.0 落差現況（更新自 v2.1.5 + doc 重整）

| 項目 | 狀態 | 何時做 |
|---|---|---|
| v1.4.0 Prefab 100% 對齊（fileId / `__id__` 全鏈路） | 🟡 code path 全 façade（v2.1.3 砍 ~1700 行手刻 JSON），缺 byte-level diff 驗證 | **觸發再做**：有人回報 byte-level 不一致時、或主動配「乾淨 fixture 專案」session 比對 |
| v1.5.0 #1 工具收斂為 50 個 | ❌ 未做 | **下一個 session 啟動 P2 評估**（先量測 token） |
| v1.5.0 #2 token -50% | ❌ 未量測 | 同 P2 評估 |
| v1.5.0 #3 Prefab 完整 API | ✅ done（P4 T-P4-3 + v2.1.4 set_link 合併） | — |
| v1.5.0 #4 事件綁定 | ✅ done（P4 T-P4-1 + v2.1.2 持久化修補） | — |
| v1.5.0 #5 介面參數更清晰 | 🟡 v2.1.5 batch 已改 5 個工具的描述、其餘 ~155 個多半還是上游英文短描述 | **不獨立排**：未來改某工具時順便修；或下次重跑 generator 時順手 review |
| v1.5.0 #6 面板 UI 簡潔 | ✅ done（P4 T-P4-2，縮小範圍只拆 composable） | — |
| v1.5.0 #7 整體架構效率 | ❌ 跳過（無可測指標，ADR 0001） | — |

### P2 待辦（下次 session 啟動點）

依 ADR 0001 §4：「token 量測撐得起才做收斂；撐不起就直接 close P2」。
**啟動 P2 必走步驟**：

1. **寫 token 量測 script**（`scripts/measure-tokens.js` 之類）：
   - mock 一個 MCP client，跑 `tools/list` → 用 anthropic 或 tiktoken 算
     全 160 工具 schema 文字的 prompt token cost
   - 對選定的 ~10 個常用工具跑 `tools/call`（含 args + structured response）→
     算 round-trip token
   - 對照「假想 P2 後的 50 個 action router」估算合併 schema 的 token
   - 不需要乾淨 fixture 專案；對 `cocos_cs_349` + `a-test.scene` 跑就行
2. **比對結果**：差距 ≥30% → 啟動 P2；< 15% → 直接 close P2、補進 ADR 0001
3. P2 真要動工的話，**分批切**（不要一次重寫 14 個 tool 檔），每批一個
   category、跑 schema diff 確認等價、再合併

P2 之外的 backlog（roadmap 級別）：
- **P3 MCP 進階能力**（Resources / Prompts / Notifications）：與 P2 互不相依，
  順序視當下需求；見 `docs/roadmap/04-protocol-extensions.md`
- **Prefab byte-level 比對**：上面表格的 v1.4.0 #1，乾淨 fixture 專案 session

### 觀察 / 提醒

- 上一條 dialog-blocks-IPC 的問題還可能出現在其它 asset-db channel：任何
  `copy-asset` / `move-asset` / `create-asset`（target collision）若沒 pre-check，
  cocos 都會自己彈 dialog 並 ignore 我們傳的 `overwrite`。下次寫類似工具
  記得先 query-uuid。
- `set-property` 對 layer / sizeMode 等 node/component scalar 屬性可直接
  寫，不需要 nudge。`__comps__.${idx}.<scalar>` 路徑就會持久化（vs Landmine
  #11 描述的 `arr.push` 問題只發生在 array element insert）。
- v2.1.5 batch 共觸發了 4 次 plugin reload + 約 12 次 user-driven Cocos
  操作，每條都按 `feedback_notify_before_live_test.md` 先 ping user。

### 環境 / 同步

- MCP server 預設 port 3000；測試場景 `db://assets/test-mcp/a-test.scene`
  含 TestBtn (cc.Sprite + cc.Button + script) + Camera + Canvas，是本
  session v2.1.5 主要驗證場域。
- `D:/1_dev/cocos_cs/cocos_cs_349/extensions/cocos-mcp-server/` 已同步到
  v2.1.5 dist + package.json（每條 commit 後都 cp 過）。doc-only 的 commit
  不需 sync 安裝路徑（cocos 不讀 .md）。

### 上一個 session（v2.1.4）commit chain（已 push、留作回滾參考）

| SHA | 內容 | 行數 |
|---|---|---|
| `ca4c760` | refactor(prefab-tools): drop dead `duplicatePrefab` + 4 helpers + merge `link_prefab`/`unlink_prefab` → `set_link` | source -141 / dist 同比 |
| `8e1ff1e` | refactor(component-tools): dedup `setComponentProperty` load + cid-tolerant `addComponent` + trim event match | source +26 -22 |
| `dfdb335` | refactor(mcp-server): drop redundant `getFilteredTools` | source -13 |
| `85f3f5b` | fix(scene): tighten `removeEventHandler` trim guard against whitespace-only args | source +8 -3 |
| `2f11e7f` | docs: record v2.1.4 wrap + bump version to 2.1.4 | docs |
| `6cc295f` | docs+i18n: archive HANDOFF history + sweep simplified→traditional Chinese | docs |

_（v2.1.0 ~ v2.1.4 詳細修補史、Phase 1-3 落地紀錄、T-P1-1/T-P1-5/T-P1-6
完成記錄、v2.1.2 backlog、code review 範圍提醒等歷史段已搬到
[`docs/archive/handoff-history.md`](archive/handoff-history.md)，HANDOFF
保持為「下次接手只看這份」的活檔。）_

## 進度快照（最後更新：2026-05-01 v2.1.5 完工）

```
P0 ✅ done
P1 ✅ done
P4 ✅ done（v2.1.1 程式碼 + v2.1.2 修補 EventHandler 持久化）
v2.1.2 ✅ done（P1 host-side nudge 4d15563 + P2(b) 拿 placeholder + P3 文件訂正）
v2.1.2-audit ✅ done（round-1 d5c97ef + project sweep e2ffa3d/ccb5d04）
v2.1.3 ✅ done（scene-bridge migration + prefab fallback 大清掃 + _componentName 修補）
v2.1.4 ✅ done（Solo backlog 6 條 + /review 反修 1 條）
v2.1.5 ✅ done（本 session，live-test backlog 5 條全清，每條 user-driven 實機驗證）
   ├── set_component_property propertyType mismatch preflight  ✅ 4e5e316
   ├── node_create_node layer 參數 + Canvas auto UI_2D         ✅ 48bad45
   ├── scene_create_scene template (empty/2d-ui/3d-basic)       ✅ cf2272a
   ├── preserveContentSize flag for cc.Sprite.spriteFrame      ✅ 9230234
   └── save_scene_as 從 dialog 改為程式化（pre-check + copy）   ✅ d36221e
P2/P3 ⏳ pending（roadmap 級別，非 v2 patch）
```

## 環境快速確認

```bash
cd D:/1_dev/cocos-mcp-server
git status                    # 應為乾淨
git log --oneline -6          # 最頂為 d36221e（v2.1.5 wrap）
npm run build                 # 預期 tsc 無輸出
node -e "const {createToolRegistry} = require('./dist/tools/registry.js');
const r = createToolRegistry();
let total = 0;
for (const c of Object.keys(r)) total += r[c].getTools().length;
console.log('categories:', Object.keys(r).length, 'tools:', total);"
# 預期：categories: 14 tools: 160

grep -rE "lizhiyong|fixCommonJsonIssues" source/   # 應無輸出（P0）
grep -rE "'apply-prefab'|'revert-prefab'|'load-asset'|'connect-prefab-instance'" source/   # 應無輸出（T-P1-6）

# v2.1.5 同步檢查（應全相等）
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
| v2.1.5 改動前（v2.1.4 release 點） | `git reset --hard 6cc295f` 然後 `git push --force-with-lease` |
| v2.1.5 batch 中段（#3 scene template 後、#4 preserveContentSize 前） | `git reset --hard cf2272a` 然後 `git push --force-with-lease` |
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
