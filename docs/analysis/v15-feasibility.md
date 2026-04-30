# v1.5.0 承諾項目可行性分析

> 撰寫日期：2026-05-01。
> 資料來源：
> - 官方擴展文件 [`cocos/cocos-docs` `versions/3.8/zh/editor/extension/`](https://github.com/cocos/cocos-docs/tree/master/versions/3.8/zh/editor/extension)
> - 專案內 `node_modules/@cocos/creator-types/editor/packages/<pkg>/@types/`
> - 上游 README v1.5.0 段落（commit `754adec`）
>
> 本檔取代 [`upstream-status.md`](upstream-status.md) §3 的「能否補完」段，並
> 為 [`roadmap/05-v15-spec-parity.md`](../roadmap/05-v15-spec-parity.md) 提供
> 落地依據。讀完不需要再看上游 README。

## 一、官方文件覆蓋情況

`cocos-docs/3.8/zh/editor/extension` 把擴展開發的「**框架**」講得齊全
（messages、panel、contributions、scene-script、UI 元件清單），但**沒有
窮舉每個內建模組的 channel 清單**。權威來源是
`@cocos/creator-types/editor/packages/<pkg>/@types/message.d.ts`。

關鍵文件對應表：

| 內容 | 文件 |
|---|---|
| `Editor.Message.send` / `request` / `broadcast` 三種呼叫法、命名規範 | `messages.md`、`api/message.md` |
| 透過 `execute-scene-script` 進入 scene 進程 | `scene-script.md` |
| 面板生命週期（`ready` / `beforeClose` / `close` / `listeners` / `methods`） | `panel.md` |
| 自訂 UI 元件清單：`ui-num-input` / `ui-slider` / `ui-checkbox` / `ui-select` | `ui.md` |
| **scene 模組 Editor.Message channel 完整清單** | `creator-types/.../scene/@types/message.d.ts` |
| **scene-script 內可用的 façade 介面（含完整 prefab API）** | `creator-types/.../scene/@types/scene-facade-interface.d.ts` |
| asset-db 模組 channel 完整清單 | `creator-types/.../asset-db/@types/message.d.ts` |
| `cce` 命名空間（scene-script 內可直接呼叫的 manager） | `creator-types/.../scene/@types/scene.d.ts` |

## 二、Prefab 操作的真實 API 地圖

`scene` 模組的 Editor.Message **只有一個** prefab 相關 channel：
`restore-prefab`，吃 `{ uuid: string }`（即 `ResetComponentOptions`）。

**不存在**於 host 進程的訊息層（已在 P1 T-P1-6 確認並從程式碼移除）：
- `apply-prefab` / `revert-prefab`
- `load-asset` / `connect-prefab-instance` / `set-prefab-connection`

完整 prefab API 在 **Scene Façade**
（`scene-facade-interface.d.ts`），只能透過 `execute-scene-script` 進入
scene 進程後呼叫：

| 動作 | 路徑 |
|---|---|
| 建立 prefab 資產 | scene-script 端 `cce.Prefab.createPrefab(uuid, url)` + 呼叫端 `Editor.Message.request('asset-db', 'refresh-asset', url)` |
| 實例化 prefab（host 即可） | `Editor.Message.request('scene', 'create-node', { assetUuid })` |
| 同步（apply）：把 instance 改動推回 prefab 資產 | scene façade `applyPrefab(nodeUuid)` |
| 引用（link）：把 node 連到 prefab 資產 | scene façade `linkPrefab(nodeUuid, assetUuid)` |
| 解除引用（unlink）：脫離 prefab 連接 | scene façade `unlinkPrefab(nodeUuid, removeNested)` |
| 還原（revert / restore）：以 prefab 資產覆寫 instance | host: `restore-prefab({uuid})` 或 façade `restorePrefab(uuid, assetUuid)` |
| 讀 prefab dump | scene façade `getPrefabData(uuid)` |

**對照現況**：

- `source/scene.ts:329 createPrefabFromNode` 是 stub（comment 寫
  「運行時環境下無法直接創建預製體文件」是錯的）；`cce.Prefab.createPrefab`
  在 scene-script 上下文是直接可用的。
- `source/tools/prefab-tools.ts:953 updatePrefab`（apply）目前 fail loudly，
  但實際上可以透過 façade `applyPrefab` 落實。
- `source/tools/prefab-tools.ts:966 revertPrefab` 已正確使用
  `restore-prefab`（P1 T-P1-6 修過）。
- `source/tools/prefab-tools.ts` 內仍有大量手刻 prefab JSON 的程式碼
  （`createStandardPrefabContent` 等，~1000 行），是因為當初拿不到 façade
  API 才繞遠路。façade 化後可大幅縮減，但這屬於「擴大重構」，非 P4 範圍。

## 三、事件綁定（cc.EventHandler）的官方路徑

EventHandler 在 v3.x 是純資料物件，欄位：

| 欄位 | 型別 | 說明 |
|---|---|---|
| `target` | `Node \| null` | 包含 callback 的 Node（多半就是 owning component 所在的 Node 或 root） |
| `component` | `string` | 類別名稱（cc-class name），如 `"MyScript"` |
| `_componentId` | `string` | 內部 cid，由引擎依 `component` 計算 |
| `handler` | `string` | 方法名稱，如 `"onClick"` |
| `customEventData` | `string` | 觸發時帶入的字串資料 |

**已知 bug**（[cocos-engine #16517](https://github.com/cocos/cocos-engine/issues/16517)）：
3.8.1 在純運行時 `new EventHandler()` 後設 `component` 欄位有時不生效，
workaround 是寫 `_componentName`。此 bug 對 scene-script 內手動 push
EventHandler 影響最大，對「set-property dump」路徑影響較小（dump 走的
是 IProperty 序列化路徑，不經過 setter）。

兩條落實路徑：

### 路徑 A — Host 端 set-property（推薦）

```ts
// 先用 query-component 讀現有 dump 拿到 IProperty 形狀
const compDump = await Editor.Message.request('scene', 'query-component', componentUuid);
const clickEventsDump = compDump.value.clickEvents;

// 構造新的 EventHandler dump（複製陣列、加入新項）
const newClickEvents = {
    ...clickEventsDump,
    value: [
        ...clickEventsDump.value,
        {
            // 結構參考已存在的項（query 出來的）
            value: {
                target: { value: { uuid: targetNodeUuid } },
                component: { value: componentClassName },
                _componentId: { value: '' }, // 引擎自填
                handler: { value: handlerMethodName },
                customEventData: { value: customEventData ?? '' },
            },
            type: 'cc.ClickEvent', // 視 EventHandler 的 IProperty.type 而定
        },
    ],
};

await Editor.Message.request('scene', 'set-property', {
    uuid: componentUuid,
    path: 'clickEvents',
    dump: newClickEvents,
});
```

- 優點：一次 IPC，host 進程內可完成；自動觸發 undo / dirty 標記；
  與 Inspector 拖拉操作走同一條 code path。
- 缺點：dump 的精確 schema（`type` / 巢狀結構）要先用 `query-component`
  抓 ground truth，不能憑空構造。

### 路徑 B — Scene-script 端

```ts
// scene.ts methods
addClickEventHandler(buttonUuid, targetUuid, componentName, handler, customEventData) {
    const { director, EventHandler } = require('cc');
    const buttonComp = director.getScene().getChildByUuid(buttonUuid)?.getComponent('cc.Button');
    const targetNode = director.getScene().getChildByUuid(targetUuid);
    if (!buttonComp || !targetNode) return { success: false, error: '...' };

    const eh = new EventHandler();
    eh.target = targetNode;
    eh.component = componentName;
    eh.handler = handler;
    eh.customEventData = customEventData ?? '';
    buttonComp.clickEvents.push(eh);

    // 觸發 dirty + 通知 inspector
    Editor.Message.send('scene', 'snapshot');
    return { success: true };
}
```

- 優點：直觀，可直接用 cc 層 API。
- 缺點：3.8.1 上 `component` 欄位寫不進去（issue #16517）；需要保存場景才
  持久化（`Editor.Message.request('scene', 'save-scene')`）。

**選擇**：路徑 A 為預設實作，路徑 B 留作 fallback / debug 工具。

## 四、v1.5.0 七項承諾可行性表

| # | 承諾 | 可行性 | 路徑 | 落點 |
|---|---|---|---|---|
| 1 | 150+ 工具收斂為 50 個 action router | ✅ 純重構 | 不依賴官方 API | **P2 條件式**（量 token 後決定） |
| 2 | action+args、token -50% | ⚠️ 結構可做、數字未驗 | 同 #1 | P2 |
| 3a | Prefab 建立 | ✅ | scene-script `cce.Prefab.createPrefab` + `asset-db: refresh-asset` | **P4 T-P4-3** |
| 3b | Prefab 實例化 | ✅ 已落地 | host: `scene/create-node({ assetUuid })` | 既有；T-P4-3 內驗證 |
| 3c | Prefab 同步（apply） | ✅ | scene-script façade `applyPrefab` | **P4 T-P4-3** |
| 3d | Prefab 引用 / 解除（link / unlink） | ✅ | scene-script façade `linkPrefab` / `unlinkPrefab` | **P4 T-P4-3** |
| 3e | Prefab 還原（revert） | ✅ 已落地 | host: `scene/restore-prefab({uuid})` | 既有；T-P4-3 內驗證 |
| 4 | 事件綁定（onClick / EventHandler） | ✅ | host: `set-property` on `clickEvents`（路徑 A） | **P4 T-P4-1** |
| 5 | 接口參數更清晰 / 文件補完 | ✅ | 純文件；zod schema 已是基礎 | 邊做邊補 |
| 6 | 面板 UI 更簡潔 | ✅ 但低 ROI | `ui-*` 元件能力不如 Vue 3 自寫；只值得拆 composable | **P4 T-P4-2**（縮小範圍） |
| 7 | 整體架構更高效 | ❌ 無可測指標 | — | 跳過（P1 已做底層改造） |

## 五、與既有 roadmap 的落差

- `roadmap/05-v15-spec-parity.md` 應**新增 T-P4-3「Prefab façade 工具集」**：
  把 `prefab-tools.ts` 內 `updatePrefab`（apply）由 fail loudly 改為走
  scene-script + façade；補上 `link` / `unlink` / `get-prefab-data` 三個新
  工具；`createPrefab` 由「自寫 JSON」轉接到 `cce.Prefab.createPrefab`。
- `roadmap/05-v15-spec-parity.md` T-P4-2 的範圍應收斂：官方 `ui-*` 元件
  只有 4 個，不夠取代 Vue 3 寫的 panel；改為「**只拆 composable，不動
  template**」。
- `analysis/upstream-status.md` §3.3 結論可以從「中等成本」改為「**中等成本
  且有官方 API 撐腰**」（façade 路徑已驗）。
- `roadmap/README.md` 的「與 v1.5.0 的關係」表，第 2 列（預製體 100% 對齊）
  改為指向本檔 §二、§四第 3a–3e 列。

## 六、未驗證項與風險

下面這些**只有型別宣告，未經實機驗證**，落地時要先驗：

1. **`cce.Prefab.createPrefab(uuid, url)` 的 url 參數格式**：是 `db://...`
   還是檔系絕對路徑？型別只標 `string`。實機測試前可雙寫 try。
2. **`applyPrefab` 是否會自動觸發 asset-db re-import**：未確認。落地時要
   配對 `asset-db: refresh-asset` 補保險。
3. **EventHandler dump 的 `type` 欄位值**：未文件化。要先在編輯器手綁
   一個 onClick → `query-component` 看 ground truth。
4. **3.8.1 `component` 欄位寫不進去 bug**：scene-script 路徑要避開，host
   set-property 路徑理論上不受影響，但仍要實機確認。

風險緩解：每個新工具都應記錄「實機驗證狀態」於 commit message 與
HANDOFF；未驗者標 ⚠️。

## 七、落地路徑總結（給下個 session）

按本檔 §四的可行性，roadmap 增 / 改：

1. **roadmap/05-v15-spec-parity.md**：加 T-P4-3 prefab façade 工具集；T-P4-2
   縮小範圍。
2. **analysis/upstream-status.md**：§3 加註「詳見 v15-feasibility.md」。
3. **roadmap/README.md**：與 v1.5.0 關係表更新。
4. **HANDOFF.md**：P4 in-progress 標出。

實作順序：T-P4-3（最高槓桿，把現有 stub / fail loudly 接到正路）→
T-P4-1（小工程，新增三個 component 工具）→ T-P4-2（最後做，可省）。
