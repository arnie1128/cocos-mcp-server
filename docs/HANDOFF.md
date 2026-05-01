# Session Handoff

> 給下次接手的 session（含未來自己）。看完這份 + `docs/roadmap/README.md`
> 就能繼續做下去，不需要重看歷史對話。

## 🚀 NEXT SESSION ENTRY POINT（2026-05-01 P2 close + 死碼清掃 / v2.1.6）

當下版本：**v2.1.6**（origin/main HEAD = 死碼清掃 commit，已 push）。
本 session 兩件事，無 in-flight 任務、無未推 commit：

| SHA | 內容 | 行數 |
|---|---|---|
| `12c20c4` | docs(p2): close P2 tool-consolidation after token measurement | +494 -37 |
| `05d865e` | chore: prune dead code, bump 2.1.6 | +1 -3286 |

### 1. P2 量測 + close（commit `12c20c4`）

寫 `scripts/measure-tool-tokens.js` 量現況 vs 假想形態：

| 形態 | chars | tokens (≈chars/3.5) | vs current |
|---|---:|---:|---:|
| current 160 flat tools | 51,983 | 14,852 | — |
| router-A lossless oneOf | 71,278 | 20,365 | **+37.1%（更大）** |
| router-B lossy enum-only | 17,143 | 4,898 | -67.0%（丟 validation） |

按 ≥30% start / <15% close 門檻，lossless 是 **負 37%**，遠低於 close
線。lossy 形態雖 -67% 但代價是丟掉 per-action arg validation（對 Cocos
Creator UUID / dump path / propertyType 等容易打錯的領域不划算）。
上游 v1.5.0「-50% tokens」被量測證實只在 lossy 形態成立，是行銷數字。

落檔：`docs/adr/0001-skip-v1.5.0-spec.md`（補註）、
`docs/roadmap/03-tool-consolidation.md`（❌ CLOSED）、
`docs/roadmap/README.md` 對照表 sync。`scripts/measure-tool-tokens.js`
**保留**（ADR 補註直接引用、且可隨時重跑做 regression 比對）。

### 2. 死碼清掃 + bump 2.1.6（commit `05d865e`）

專案結構盤點完，砍 1300+ 行 dead path：

- `source/test/*.ts` (4 檔, 699 行) — 從沒被任何 npm script 跑過；
  其中 `mcp-tool-tester.ts` 還用 WebSocket（P1 換 SDK 後不適用）
- `source/panels/tool-manager/index.ts` + `static/template/default/tool-manager.html`
  (584 行) — 整支 panel 在 `package.json:panels` 沒註冊、對應的
  `openToolManager()` handler 也不存在於 `main.ts`（declaration ↔ runtime
  對不齊的 latent bug）。Tool 管理已搬去 default panel 內的
  `composables/use-tool-config.ts`（P4 T-P4-2）
- `dist/{test,examples,panels/tool-manager}/*` — 對應 source 的 orphan
  compiled output；`dist/examples/prefab-instantiation-example.js` 連對應
  source 都沒有，純粹是上游時代殘留
- `image/iamge2.png` + `image/image-20250717174157957.png` —
  上游殘留截圖、文件無人引用，連檔名 `iamge2` 都是上游 typo
- `package.json:contributions.messages.open-tool-manager` — 上述 dead
  panel 對應的 message 註冊

驗證：tsc clean / smoke 綠 / measure script 重跑數字不變 / generator
重產 tools.md 不變 / 工具數仍 **160 / 14 categories**。dist + package.json
已同步到 `D:/1_dev/cocos_cs/cocos_cs_349/extensions/cocos-mcp-server/`。

### Cocos Creator plugin 格式對齊

對齊 `@types/schema/package/index.json`（cocos 3.8 plugin 規範），
全合規：

| 欄位 | 狀態 |
|---|---|
| `package_version: 2`、`name`（小寫合法）、`editor`、`main`、`panels`、`contributions` | ✅ |
| `i18n/<locale>.js`（en / zh） | ✅ |
| `static/icon.png`（panel icon） | ✅ |
| `dist/` 為 commit artifact、`source/` 為原始碼 | ✅ |
| `$schema` reference | ✅ |

唯一不合規的就是上面砍掉的 dead panel 鏈，已修。

---

## 📋 待動工 Backlog（依優先序）

### B-1：description 精簡 + tools.md 重生（獨立任務）

**現況**：v2.1.5 batch 只把 5 個 tool 改成精準的中文長 description
（`set_component_property` / `create_node` / `create_scene` /
`save_scene_as` / `preserveContentSize`）。其餘 ~155 個多半是上游英文
短描述（例如 `scene_get_current_scene → "Get current scene information"`、
`sceneAdvanced_reset_node_property → "Reset node property to default value"`），
無法從 description 看出 side effect / preflight 檢查 / 相似 tool 之間
差別，AI 用法準確率受影響。

**目標**：把全部 description 改成「使用者一看就懂 tool 的 side effect
與差異」。**不改 schema、不改 tool 行為**，純 metadata 改寫。

**範圍**：14 個 category、~155 個 tool 需要 review。每 tool 約 2-5 分鐘
review + 改寫，整體粗估 8-12 小時，分批做。

**步驟**：

1. 一次專注一個 category（建議從 tool 數最少的 `validation` /
   `broadcast` / `server` 開始，練手感）
2. Read 對應 `source/tools/<category>-tools.ts`，把 zod `.describe()`
   文字改成精準描述（中文 + 必要時帶 bullet 格式，跟 v2.1.5 五個修過
   的 tool 風格對齊）
3. 改完跑 `npm run build && node scripts/generate-tools-doc.js` 重生
   `docs/tools.md`
4. tsc clean → commit `docs(tools/<category>): rewrite descriptions`
5. 每 1-3 個 category 完成 patch bump（2.1.6 → 2.1.7 → …），sync 到
   `cocos_cs_349/extensions/cocos-mcp-server/`
6. 全部完成跑一次 `node scripts/measure-tool-tokens.js`，預期 schema
   略增（因為 description 變長），但這是合理代價

**完工標準**：

- [ ] 14 個 category 全部 review 完
- [ ] tools.md 重生且 spot-check 確認 description 訊息密度提升
- [ ] tsc clean、smoke 綠、measure script 跑得起來
- [ ] cocos-mcp-server 安裝路徑同步

**版本策略**：純 description 改寫沒對外行為變化，每批 patch bump 即可，
不需 minor。

### B-2：P3 排序計畫（roadmap 級別）

關注點是「清理架構 + 持續優化 + 穩定維護」，P3 三個 sub-task 排序：

| Sub-task | 動工順序 | 主要價值 | 預估工時 |
|---|---|---|---|
| **T-P3-1 Resources** | **先做** | read-only state 與 mutation tool 分離；新增工具方向明確；client 可選擇性載入大資源（hierarchy / asset list） | ~3-5 天 |
| **T-P3-3 Notifications** | 第二做 | 解 stale UUID retry 循環、長期可靠性債；需實機驗 cocos broadcast 行為 | ~3 天 |
| T-P3-2 Prompts | 有空再做 | UX feature（Claude Desktop slash command），無架構價值 | ~2 天 |
| T-P3-4 stdio | **跳過** | cocos editor 內跑 stdio 不自然；roadmap 自己標可選 | — |

**T-P3-1 範圍粗估**（動工時再細拆）：

- 設計 4-5 個 URI：`cocos://scene/current`、`cocos://scene/hierarchy`、
  `cocos://prefabs`、`cocos://project/info`、`cocos://assets/{path}`
- 註冊 `resources/list` + `resources/read` SDK handler（`@modelcontextprotocol/sdk`
  已內建支援）
- 把對應的 read-only tool 標 deprecated（保留 alias 不破現有 client）
- 量 schema 變化：把 ~10 個 read-only tool 從 `tools/list` 搬到
  `resources/list` 約省 ~3-5%，但這不是主要目標——架構清理才是

**T-P3-3 風險點**：cocos editor `Editor.Message.addBroadcastListener`
的事件密度、debounce 策略、stateful session 對應。需先寫一支
`scripts/probe-broadcast.js` 觀察 cocos 推什麼事件，再設計 mapping。

### B-3：Prefab byte-level 比對（觸發再做）

v1.4.0 #1 — code path 全 façade（v2.1.3 砍 ~1700 行手刻 JSON），
但缺 byte-level diff 驗證。等有人回報不一致或主動配「乾淨 fixture
專案」session 比對時再做。

---

## ✅ 上一個 session（v2.1.5 完工 + doc 重整）入口（保留作歷史備查）

> 此段是 v2.1.5 + doc reorg session 結束時寫的 entry point，已被本 session
> 的新 entry point 取代。仍保留是因為下面有「v2.1.5 五條 live-test backlog
> 的詳細修復筆記」、Doc 重整步驟、v1.5.0 落差表這些**長期參考價值**的
> 內容，砍掉會丟資訊。從這行起到「v1.4.0 / v1.5.0 落差現況」表為止
> 都當歷史段讀。

當時版本：**v2.1.5**（HEAD = `18810a0` doc 重整 commit）。
P0/P1/P4/v2.1.1/v2.1.2/v2.1.2-audit/v2.1.3/v2.1.4 全部完工，v2.1.5 五條
live-test backlog 全清。v2.1.5 之後又做了一輪 **doc 重整**：歸檔上游
README/FEATURE_GUIDE、重寫 root README（zh-TW、fork-accurate）、
寫 `scripts/generate-tools-doc.js` + 自動產 `docs/tools.md`、清掉 dead
artifact `TestScript.js`。

當時 `package.json:version` 為 `2.1.5`（patch bump：v2.1.5 五條都是新增
opt-in 旗標 / 重寫 buggy implementation，沒有公共 tool name 增減；工具數
仍 160）。本 session 已 bump 到 2.1.6。

### v2.1.5 commit chain（已 push）

| SHA | 內容 | 行數 |
|---|---|---|
| `4e5e316` | feat(component-tools): preflight propertyType mismatch on reference fields（v2.1.5 batch 起點，bump 2.1.4→2.1.5） | source +109 -26 |
| `48bad45` | feat(node-tools): add layer arg + auto UI_2D under Canvas to create_node | source +92 |
| `cf2272a` | feat(scene-tools): add template scaffolding to create_scene（empty / 2d-ui / 3d-basic） | source +175 -38 |
| `9230234` | feat(component-tools): preserveContentSize flag for cc.Sprite.spriteFrame | source +34 -5 |
| `d36221e` | fix(scene-tools): make save_scene_as programmatic and dialog-free | source +89 -25 |
| `49959ac` | docs: record v2.1.5 wrap | docs |
| `18810a0` | docs(reorg): archive upstream README/FEATURE_GUIDE, rewrite root README, add tools.md generator | docs +tooling |

v2.1.5 工具數仍 **160**。tsc + smoke 全綠。

### v2.1.5 各任務細節（live-test backlog）

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
| v1.5.0 #1 工具收斂為 50 個 | ❌ **closed**（量測後否決，2026-05-01） | 不再做（lossless 反而 +37%；lossy 達 -67% 但丟 arg validation） |
| v1.5.0 #2 token -50% | ❌ **closed**（量測證實是 lossy-only 行銷數字） | 不再做；後續若要降 prompt 走 P3 Resources/Prompts |
| v1.5.0 #3 Prefab 完整 API | ✅ done（P4 T-P4-3 + v2.1.4 set_link 合併） | — |
| v1.5.0 #4 事件綁定 | ✅ done（P4 T-P4-1 + v2.1.2 持久化修補） | — |
| v1.5.0 #5 介面參數更清晰 | 🟡 v2.1.5 batch 已改 5 個工具的描述、其餘 ~155 個多半還是上游英文短描述 | **已列為獨立 backlog**：見上方 §B-1 description 精簡 + tools.md 重生 |
| v1.5.0 #6 面板 UI 簡潔 | ✅ done（P4 T-P4-2，縮小範圍只拆 composable） | — |
| v1.5.0 #7 整體架構效率 | ❌ 跳過（無可測指標，ADR 0001） | — |

### ~~P2 待辦~~ → 已完成評估並 close

P2 評估與量測結果見頂部 §P2 量測 + close 段。當時規劃 → 對應落實：

1. ~~寫 token 量測 script~~ → `scripts/measure-tool-tokens.js`
2. ~~按 ≥30% / <15% 門檻決策~~ → lossless **+37%**（負收益），按門檻 close
3. ~~分批切~~ → 不適用（P2 已關）

非 P2 的 roadmap-level backlog 都已搬到頂部 §待動工 Backlog（B-1 / B-2 /
B-3），這裡不重複列。

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
- `D:/1_dev/cocos_cs/cocos_cs_349/extensions/cocos-mcp-server/` 在 v2.1.6
  cleanup 後已重新同步（dist + package.json）。doc-only 的 commit 不需 sync
  安裝路徑（cocos 不讀 .md）；只要動 source / package.json / static 才
  需要 sync。

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

## 進度快照（最後更新：2026-05-01 P2 close + cleanup / v2.1.6）

```
P0 ✅ done
P1 ✅ done
P4 ✅ done（v2.1.1 程式碼 + v2.1.2 修補 EventHandler 持久化）
v2.1.2 ✅ done（P1 host-side nudge 4d15563 + P2(b) 拿 placeholder + P3 文件訂正）
v2.1.2-audit ✅ done（round-1 d5c97ef + project sweep e2ffa3d/ccb5d04）
v2.1.3 ✅ done（scene-bridge migration + prefab fallback 大清掃 + _componentName 修補）
v2.1.4 ✅ done（Solo backlog 6 條 + /review 反修 1 條）
v2.1.5 ✅ done（live-test backlog 5 條全清，每條 user-driven 實機驗證）
v2.1.6 ✅ done（本 session：P2 量測 close + 死碼清掃 -3286 行）
   ├── P2 量測 + close                                          ✅ 12c20c4
   └── chore cleanup（test/panel/image/dist orphans）           ✅ 05d865e
P2 ❌ closed（量測後否決：lossless +37% / lossy -67% 但丟 validation）

待動工（依優先序，詳見 §待動工 Backlog）：
B-1 ⏳ description 精簡 + tools.md 重生（~155 個 tool review，分批做）
B-2 ⏳ P3 Resources/Notifications/Prompts（架構清理；T-P3-1 先做）
B-3 ⏳ Prefab byte-level 比對（觸發再做）
```

## 環境快速確認

```bash
cd D:/1_dev/cocos-mcp-server
git status                    # 應為乾淨
git log --oneline -6          # 最頂為 05d865e（chore cleanup + bump 2.1.6）

# tsc + smoke + 工具數
npm run build                 # 預期 tsc 無輸出
node scripts/smoke-mcp-sdk.js # 預期 ✅ all smoke checks passed
node -e "const {createToolRegistry} = require('./dist/tools/registry.js');
const r = createToolRegistry();
let total = 0;
for (const c of Object.keys(r)) total += r[c].getTools().length;
console.log('categories:', Object.keys(r).length, 'tools:', total);"
# 預期：categories: 14 tools: 160

# P2 量測重跑（任何時候都可重跑、輸出穩定，可拿來做 regression 比對）
node scripts/measure-tool-tokens.js
# 預期：current 51,983 chars / router-A +37.1% / router-B -67% / decision: CLOSE P2

# tools.md 重產（B-1 description sweep 每批改完都要跑）
node scripts/generate-tools-doc.js
# 預期：wrote .../docs/tools.md (14 categories, 160 tools)

# 歷史 landmine 檢查（應全無輸出）
grep -rE "lizhiyong|fixCommonJsonIssues" source/   # P0
grep -rE "'apply-prefab'|'revert-prefab'|'load-asset'|'connect-prefab-instance'" source/   # T-P1-6
grep -rE "openToolManager|panels/tool-manager" source/ package.json   # v2.1.6 cleanup（dead panel）

# v2.1.6 同步檢查（應全相等）
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
| v2.1.6 死碼清掃前（保留 P2 close 的 doc 改動） | `git reset --hard 12c20c4` 然後 `git push --force-with-lease` |
| v2.1.6 全部改動前（P2 close 也退） | `git reset --hard 18810a0` 然後 `git push --force-with-lease` |
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
