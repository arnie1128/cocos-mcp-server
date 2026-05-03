# Rollback anchors archive

歷史回滾錨點。`docs/HANDOFF.md` 只保留最近 2 cycle 的錨點；超過範圍的退回操作來這裡查 SHA。

`--force-with-lease` 比 `--force` 安全，會檢查遠端沒被別人推過。

## v2.10 cycle

| 退到哪個狀態 | 指令 |
|---|---|
| v2.10.5 改動前（v2.10.4 cycle wrap 點） | `git reset --hard 211bfb7` |
| v2.10.4 改動前（v2.10.3 Stage 3 wrap 點） | `git reset --hard e596095` |
| v2.10.3 改動前（v2.10.2 Stage 2 wrap 點） | `git reset --hard c2c2ef6` |
| v2.10.2 改動前（v2.10.1 Stage 1 wrap 點） | `git reset --hard 4c8e232` |
| v2.10.1 改動前（v2.9.7 release 點） | `git reset --hard 5573190` |

## v2.9 cycle

| 退到哪個狀態 | 指令 |
|---|---|
| v2.9.7 改動前（v2.9.6 round-2 patch 點） | `git reset --hard e9fd3c0` |
| v2.9.6 改動前（v2.9.5 round-1 patch 點） | `git reset --hard e425aa7` |
| v2.9.5 改動前（v2.9.4 release 點） | `git reset --hard 3bf839f` |
| v2.9.0 改動前（v2.8.4 release 點） | `git reset --hard 843fe73` |

## v2.8 cycle

| 退到哪個狀態 | 指令 |
|---|---|
| v2.8.4 改動前（v2.8.3 #5 landmine + sharper warning 點） | `git reset --hard ce6825f` |
| v2.8.3 改動前（v2.8.2 reload-retest doc 點） | `git reset --hard 40ad5b7` |
| v2.8.2 改動前（v2.8.1 release 點 + round-2 ship-it） | `git reset --hard 03568fc` |
| v2.8.1 改動前（v2.8.0 release 點） | `git reset --hard ddb6c77` |
| v2.8.0 改動前（v2.7.3 release 點 + 三方 ship-it round 3） | `git reset --hard d1a868f` |

## v2.7 cycle

| 退到哪個狀態 | 指令 |
|---|---|
| v2.7.3 改動前（v2.7.2 release 點） | `git reset --hard dd88952` |
| v2.7.2 改動前（v2.7.1 release 點） | `git reset --hard 39d044f` |
| v2.7.1 改動前（v2.7.0 release 點） | `git reset --hard 5c67031` |
| v2.7.0 改動前（v2.6.2 release 點 + 三方 ship-it round 3） | `git reset --hard 27e7716` |

## v2.6 cycle

| 退到哪個狀態 | 指令 |
|---|---|
| v2.6.2 改動前（v2.6.1 release 點 + 三方 ship-it round 2 part-A） | `git reset --hard 7614497` |
| v2.6.1 改動前（v2.6.0 release 點） | `git reset --hard 4ce04cd` |
| v2.6.0 改動前（v2.5.1 release 點 + reload-retested） | `git reset --hard 1e828ba` |

## v2.5 cycle

| 退到哪個狀態 | 指令 |
|---|---|
| v2.5.1 改動前（v2.5.0 release 點） | `git reset --hard 543c06a` |
| v2.5.0 改動前（v2.4.12 release 點 + reload-retested） | `git reset --hard 185f98c` |

## v2.4 cycle

| 退到哪個狀態 | 指令 |
|---|---|
| v2.4.12 改動前（v2.4.11 release 點 + 三方 ship-it round 4） | `git reset --hard 8bb46e8` |
| v2.4.11 改動前（v2.4.10 release 點） | `git reset --hard 52bad57` |
| v2.4.10 改動前（v2.4.9 release 點 + 三方 ship-it round 2） | `git reset --hard 15b6a8e` |
| v2.4.9 改動前（v2.4.8 release 點） | `git reset --hard a953e6e` |
| v2.4.8 改動前（v2.4.7 release 點 + reload-tested） | `git reset --hard acdfac1` |
| v2.4.7 改動前（v2.4.6 release 點 + 三方 ship-it） | `git reset --hard ac0539f` |
| v2.4.6 改動前（v2.4.5 release 點） | `git reset --hard c4a759d` |
| v2.4.5 改動前（v2.4.4 release 點） | `git reset --hard ba6e39e` |
| v2.4.4 改動前（v2.4.3 release 點） | `git reset --hard aa95e53` |
| v2.4.3 全部改動前（v2.4.2 release 點） | `git reset --hard 2b5c1f2` |
| v2.4.2 review patch round 2 改動前（v2.4.1 release 點） | `git reset --hard c39e1aa` |
| v2.4.1 review patch round 1 改動前（v2.4.0 release 點） | `git reset --hard 0231b10` |
| v2.4.0 全部改動前（v2.3.1 release 點） | `git reset --hard 351023b` |

## v2.3 cycle

| 退到哪個狀態 | 指令 |
|---|---|
| v2.3.1 review fixes 改動前（v2.3.0 release 點） | `git reset --hard 188ba52` |
| v2.3.0 改動前（v2.2.0 release 點） | `git reset --hard 16655bb` |

## v2.2 cycle

| 退到哪個狀態 | 指令 |
|---|---|
| v2.2.0 T-P3-1 Resources 改動前（v2.1.7 release 點） | `git reset --hard ab7191b` |

## v2.1 cycle

| 退到哪個狀態 | 指令 |
|---|---|
| v2.1.7 description sweep 改動前（v2.1.6 release 點） | `git reset --hard 05d865e` |
| v2.1.6 死碼清掃前（保留 P2 close 的 doc 改動） | `git reset --hard 12c20c4` |
| v2.1.6 全部改動前（P2 close 也退） | `git reset --hard 18810a0` |
| v2.1.5 改動前（v2.1.4 release 點） | `git reset --hard 6cc295f` |
| v2.1.4 改動前（v2.1.3 release 點） | `git reset --hard 9b7f1f7` |
| Panel 直式改動前（v2.1.1 release 點） | `git reset --hard 62f6e83` |
| v2.1.1 改動前（v2.1.0 release 點） | `git reset --hard ac1248e` |

## P0 / P1 / P4 + Fork 起點

| 退到哪個狀態 | 指令 |
|---|---|
| P4 開工前（只留 P1 done） | `git reset --hard afc4753` |
| P1 全部改動前（只留 P0） | `git reset --hard 7fb416c` |
| Fork 起點 | `git reset --hard 754adec`（會丟掉所有本 fork commit） |
