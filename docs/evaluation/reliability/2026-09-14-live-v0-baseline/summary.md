# D6 V0：完整 80 次真实基线

**80/80 完成，144/144 次 Provider 调用均为 HTTP 200 并完整返回。**
Normal E2E：Direct 7/30、Agent 6/30；Stress：Direct 5/10、Agent 3/10。

- Direct / Normal 的主要瓶颈是结构：19 次最终结构失败，其中主失败为 extra_field 的有 15 次。
- Agent / Normal 的主要瓶颈是引用方向：17 次引用失败，其中 15 次主失败为 finding_without_support，1 次 alternative_contains_support，1 次 undelivered_citation。
- Agent 达到预定取证目标后，Normal 仍有 19/22 次最终回答失败（14 次引用、5 次结构）；Stress 7/7 次失败（5 次引用、2 次结构）。这些记录已把取证不足和取证后的生成失败区分开。
- 本批次 Agent 的 E2E 未高于 Direct，同时使用更多模型调用、耗时更长。人工质量尚未评分，因此这只是程序验收与成本比较；尚不能断言语义质量优劣，也没有启动任何 V1/V2/V3 优化实验。

本批次从 0 开始，包含通过系统检查的 8 次 canary 与随后 72 次；旧 preflight 和 15 次 P0 协议探针均不计入。

冻结源码：`b3c327b / d6-provider-diagnostics-v1`；运行 HEAD：`5f0ab17`。
Provider / model：DeepSeek / `deepseek-flash`；temperature 未设置、thinking disabled、stream false、max_tokens 4096。
Prompt = V0，证据、模型/工具预算、Validator 不变，串行、零 repair、零 retry。
初始 8 次沿用冻结的 N01/N02/N03/S01 成对轮换顺序；完整顺序和哈希见 manifest。

## 系统检查与运行控制

冻结 CLI 原本要求每次 Provider 返回；本轮按用户新规则使用单独存档的外部启动器调用同一评估核心，仓库 src/scripts/fixtures 未改。启动器和门槛代码在首个真实请求前定稿，文件及哈希存于本目录，运行期间未改。
400/401/402/422 停止；已分类的单次 429/500/503/network/timeout 原样保留。持续故障门槛预设为连续 3 次 Provider 失败或连续 8 个 run 中 4 个受到 Provider 失败影响。结构、引用和正常的 Agent 预算/工具拒绝不触发停止。
实际每条记录先落盘，再开始下一条；canary 和最后一条都检查源码/启动器哈希、HEAD 和记录一致性。

## 指标口径

- Runs 与 E2E 分母是全部实际运行数。Provider success 表示该 run 所有已尝试 Provider 调用均完整返回。
- JSON / Schema / Citation 显示“通过数 / 实际到达该检查的数量”。null 不计作通过，也不伪造为该检查失败。
- Agent 可能所有 Provider 调用成功，但耗尽预算仍没有最终回答；因此额外列出 final output observed。
- E2E 仍以冻结运行时接受为准；通过程序验收不表示人工质量合格。
- 延迟为每个 run 总时长；模型和工具次数为每个 run 平均实际调用数。

## Normal

| 指标 | Direct QA | Evidence Agent |
|---|---:|---:|
| Runs | 30 | 30 |
| Provider success | 30/30 | 30/30 |
| JSON pass | 27/30 | 24/29 |
| Schema pass | 11/27 | 23/24 |
| Citation scope pass | 11/11 | 22/23 |
| Citation direction pass | 7/11 | 6/22 |
| E2E valid | 7/30 | 6/30 |
| Final output observed | 30/30 | 29/30 |
| Avg latency | 4.887 秒 | 9.393 秒 |
| Avg model calls | 1.000 | 2.733 |
| Avg tool calls | — | 2.900 |

### Direct / Normal：失败分布

```text
alternative_support_only           1
extra_field                        15
finding_without_support            3
invalid_json                       3
missing_field                      1
```

附加 issue 计数（同一回答可有多个，不与主失败相加）：`{"alternative_contains_support": 1, "alternative_support_only": 2, "extra_field": 16, "finding_without_support": 3, "invalid_json": 3, "missing_field": 1}`。

### Agent / Normal：失败分布

```text
alternative_contains_support       1
budget_exceeded                    1
extra_field                        1
finding_without_support            15
invalid_json                       5
undelivered_citation               1
```

附加 issue 计数（同一回答可有多个，不与主失败相加）：`{"alternative_contains_support": 3, "alternative_support_only": 2, "budget_exceeded": 1, "extra_field": 1, "finding_without_support": 15, "invalid_json": 5, "undelivered_citation": 1}`。

### Agent / Normal：取证与最终输出分层

| 预先定义的取证目标 | Runs | E2E valid | 未产生 final | 已产生 final 但失败 |
|---|---:|---:|---:|---:|
| 已满足 | 22 | 3 | 0 | 19 |
| 未满足 | 2 | 0 | 1 | 1 |
| 无目标或目标不可用 | 6 | 3 | 0 | 3 |

分层失败分布：
```json
{
  "targets-met": {
    "runs": 22,
    "e2e": 3,
    "noFinal": 0,
    "failures": {
      "alternative_contains_support": 1,
      "extra_field": 1,
      "finding_without_support": 13,
      "invalid_json": 4
    },
    "failurePhases": {
      "final-citation": 14,
      "final-schema": 5
    },
    "returnedFinalButFailed": 19
  },
  "targets-not-met": {
    "runs": 2,
    "e2e": 0,
    "noFinal": 1,
    "failures": {
      "budget_exceeded": 1,
      "invalid_json": 1
    },
    "failurePhases": {
      "budget": 1,
      "final-schema": 1
    },
    "returnedFinalButFailed": 1
  },
  "not-applicable-or-unavailable": {
    "runs": 6,
    "e2e": 3,
    "noFinal": 0,
    "failures": {
      "finding_without_support": 2,
      "undelivered_citation": 1
    },
    "failurePhases": {
      "final-citation": 3
    },
    "returnedFinalButFailed": 3
  }
}
```

## Stress

| 指标 | Direct QA | Evidence Agent |
|---|---:|---:|
| Runs | 10 | 10 |
| Provider success | 10/10 | 10/10 |
| JSON pass | 9/10 | 10/10 |
| Schema pass | 8/9 | 8/10 |
| Citation scope pass | 8/8 | 8/8 |
| Citation direction pass | 5/8 | 3/8 |
| E2E valid | 5/10 | 3/10 |
| Final output observed | 10/10 | 10/10 |
| Avg latency | 4.680 秒 | 7.859 秒 |
| Avg model calls | 1.000 | 2.200 |
| Avg tool calls | — | 2.000 |

### Direct / Stress：失败分布

```text
extra_field                        1
finding_without_support            3
invalid_json                       1
```

### Agent / Stress：失败分布

```text
extra_field                        1
finding_without_support            5
invalid_schema                     1
```

附加 issue 计数（同一回答可有多个，不与主失败相加）：`{"alternative_contains_support": 1, "extra_field": 1, "finding_without_support": 5, "invalid_schema": 1}`。

### Agent / Stress：取证与最终输出分层

| 预先定义的取证目标 | Runs | E2E valid | 未产生 final | 已产生 final 但失败 |
|---|---:|---:|---:|---:|
| 已满足 | 7 | 0 | 0 | 7 |
| 未满足 | 1 | 1 | 0 | 0 |
| 无目标或目标不可用 | 2 | 2 | 0 | 0 |

分层失败分布：
```json
{
  "targets-met": {
    "runs": 7,
    "e2e": 0,
    "noFinal": 0,
    "failures": {
      "extra_field": 1,
      "finding_without_support": 5,
      "invalid_schema": 1
    },
    "failurePhases": {
      "final-citation": 5,
      "final-schema": 2
    },
    "returnedFinalButFailed": 7
  },
  "targets-not-met": {
    "runs": 1,
    "e2e": 1,
    "noFinal": 0,
    "failures": {},
    "failurePhases": {},
    "returnedFinalButFailed": 0
  },
  "not-applicable-or-unavailable": {
    "runs": 2,
    "e2e": 2,
    "noFinal": 0,
    "failures": {},
    "failurePhases": {},
    "returnedFinalButFailed": 0
  }
}
```

取证目标是预先定义的可观察代理指标，不是人工证据充分性评分。目标未满足但 E2E 通过的记录也保留；不能将它改写为 citation 失败。已满足目标仍失败则单独报告最终结构、引用、Provider 或预算原因。

## 原始数量与完整性

- 实际 run：80（Normal 60、Stress 20）；唯一 runId 和计划元组均为 80。
- 实际 Provider 调用：144；完整返回：144。
- 实际 Agent 工具执行：107；read_evidence 执行：71。
- E2E 通过后进入待评审列表：21；人工已评分：0。
- 首 8 条等于 canary 原记录，无重复、覆盖或重跑；全部检查为 true。
- 旧 preflight 和 P0 的原始记录继续保留。

文件：`runs.jsonl` 为 80 条逐运行安全记录，`report.json` 为冻结 harness 原始汇总，`analysis-metrics.json` 为本报告分层统计；`review-items.json` 仅含 E2E 通过的合成样本，`ratings-template.json` 的四项评分保持 null。
运行控制复现文件：`launch-controller.mjs`、`canary-policy.mjs`；冻结代码和输入哈希见 `manifest.json`。

## 远程恢复点

真实调用前已推送并核实：

- GitHub `main`：`5f0ab178826747fed7ad13215630ac993d2f74ff`。
- `d6-provider-diagnostics-v1`：`b3c327b8175af955523d32cda129719bc8b445c1`。
- 仅推送 main 与该标签，未 force、未推其他分支或标签。

本批次结果在本地另行归档；不把旧 preflight、P0 探针或 offline dry-run 混入这 80 次。
