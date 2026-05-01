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

## 📊 v1.4.0 / v1.5.0 落差現況

判斷新需求對不對齊時的快查表。**這份表是 HANDOFF 的常駐內容，逐 session
更新**；過去各 session 的詳細修補史搬到
[`archive/handoff-history.md`](archive/handoff-history.md)。

| 項目 | 狀態 | 何時做 |
|---|---|---|
| v1.4.0 Prefab 100% 對齊（fileId / `__id__` 全鏈路） | 🟡 code path 全 façade（v2.1.3 砍 ~1700 行手刻 JSON），缺 byte-level diff 驗證 | **B-3 觸發再做**：有人回報 byte-level 不一致時、或主動配「乾淨 fixture 專案」session 比對 |
| v1.5.0 #1 工具收斂為 50 個 | ❌ **closed**（量測後否決，2026-05-01） | 不再做（lossless 反而 +37%；lossy 達 -67% 但丟 arg validation；見 ADR 0001 補註） |
| v1.5.0 #2 token -50% | ❌ **closed**（量測證實是 lossy-only 行銷數字） | 不再做；後續若要降 prompt 走 P3 Resources/Prompts |
| v1.5.0 #3 Prefab 完整 API | ✅ done（P4 T-P4-3 + v2.1.4 set_link 合併） | — |
| v1.5.0 #4 事件綁定 | ✅ done（P4 T-P4-1 + v2.1.2 持久化修補） | — |
| v1.5.0 #5 介面參數更清晰 | 🟡 v2.1.5 batch 已改 5 個工具，其餘 ~155 個還是上游英文短描述 | **B-1 active backlog**：見上方 §B-1 description 精簡 |
| v1.5.0 #6 面板 UI 簡潔 | ✅ done（P4 T-P4-2，縮小範圍只拆 composable） | — |
| v1.5.0 #7 整體架構效率 | ❌ 跳過（無可測指標，ADR 0001） | — |

---

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
- P3 規劃（Resources/Prompts/Notifications）：`docs/roadmap/04-protocol-extensions.md`
- P4 詳細任務 + 進度：`docs/roadmap/05-v15-spec-parity.md`
- **v1.5.0 可行性分析（P4 落地依據）**：`docs/analysis/v15-feasibility.md`
- 程式碼地雷清單：`CLAUDE.md` §Landmines（P0 + T-P1-6 已修的標 ✅；v2.1.6 補 #10/#11/#12）
- ADR 0001（不追 v1.5.0 spec 的決策 + P2 量測補註）：`docs/adr/0001-skip-v1.5.0-spec.md`
- 上游差異分析：`docs/analysis/upstream-status.md`
- 工具參考（auto-generated）：`docs/tools.md`
- **歷史 session 詳細修補史**：`docs/archive/handoff-history.md`（v2.1.0 ~ v2.1.5 修補史 + Phase 1-3 落地紀錄；HANDOFF 只留當前可動工項目）

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
