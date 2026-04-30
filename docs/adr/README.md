# Architectural Decision Records (ADR)

> 記錄此 fork 的關鍵設計決定。每個 ADR 是一個**不變動的歷史記錄**——
> 決議日期、當時的 context、考慮過的選項、為什麼選 A 不選 B。
> 後續推翻不要改舊檔，發新 ADR 並在舊檔頂端加 `Superseded by 0XXX`。

## 編號規則

- 流水號（`0001`、`0002`、...），不重用、不重排。
- 檔名：`NNNN-kebab-case-title.md`。

## 目錄

| 編號 | 標題 | 狀態 |
|---|---|---|
| [0001](./0001-skip-v1.5.0-spec.md) | 不追原作者 v1.5.0 spec | Accepted |

## 撰寫範本

```markdown
# ADR NNNN: <標題>

**Date**: YYYY-MM-DD
**Status**: Proposed | Accepted | Superseded by NNNN | Deprecated
**Decider**: <who>

## Context

<為什麼需要做這個決定，當時的情境>

## Decision

<決定是什麼，一句話講清楚>

## Consequences

### Positive

- ...

### Negative

- ...

### Neutral

- ...

## Alternatives Considered

### Option A: <選項>

<為什麼最終沒選>

### Option B: <選項>

<為什麼最終沒選>

## References

- 相關 issue / PR / 文件連結
```
