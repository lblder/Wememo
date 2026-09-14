# D6 V0 Canary：连通检查未通过，停在 8/80

日期：2026-09-14。冻结提交 `2d7b7554a88013b6078e0ea43d9e055be813af01`，本地标签 `d6-eval-harness-v1`。Provider 为 DeepSeek，模型 `deepseek-flash`，V0、合成数据、零修复、零自动重试。

已完成 6 Normal + 2 Stress canary。逐次落盘、失败分类、源码哈希与 commit 一致性检查通过；Provider 每次调用均正常返回这一连通检查未通过，程序以退出码 2 停止。剩余 72 次未调用。以下是 canary 的实际样本数，不是完整 80 次基线。

共 12 次 Provider 调用，9 次正常返回；3 次失败均为 `provider-unavailable`，不是已识别的认证/429/最终字段校验错误。当前安全报告不保存 HTTP 状态或 curl 退出码，所以不能进一步断言具体网络或服务端原因。没有追加探针请求，没有重跑失败样本。

中间漏斗使用条件分母；未执行显示“—”。Provider success 按 run 统计，要求该 run 的所有 Provider 调用均正常返回。

## Normal（Canary）

| 指标 | Direct QA | Evidence Agent |
|---|---:|---:|
| Runs | 3 | 3 |
| Provider success | 3/3 | 1/3 |
| JSON pass | 3/3 | 1/1 |
| Schema pass | 1/3 | 1/1 |
| Citation scope pass | 1/1 | 1/1 |
| Citation direction pass | 1/1 | 0/1 |
| E2E valid | 1/3 | 0/3 |
| Avg latency | 11.61 s | 14.60 s |
| Avg model calls | 1.00 | 2.33 |
| Avg tool calls | — | 2.00 |

主要失败码（互斥，每条失败计一次）：

- direct: `extra_field` 2
- agent: `alternative_contains_support` 1, `provider_error` 2

## Stress（Canary）

| 指标 | Direct QA | Evidence Agent |
|---|---:|---:|
| Runs | 1 | 1 |
| Provider success | 1/1 | 0/1 |
| JSON pass | 1/1 | —（未执行） |
| Schema pass | 1/1 | —（未执行） |
| Citation scope pass | 1/1 | —（未执行） |
| Citation direction pass | 1/1 | —（未执行） |
| E2E valid | 1/1 | 0/1 |
| Avg latency | 5.63 s | 5.02 s |
| Avg model calls | 1.00 | 1.00 |
| Avg tool calls | — | 0.00 |

主要失败码（互斥，每条失败计一次）：

- direct: 无程序校验失败
- agent: `provider_error` 1

## Agent 分层观察

4 次 Agent 运行中：

- 2 次在首次 Provider 调用失败，尚未取得工具提案，实际交付 0 条证据。不能把这两次归因为工具选择策略失败。
- 2 次满足了预设取证代理目标。其中 1 次取得最终 JSON 后因 alternative 混入 support 被拒绝；另 1 次在已经读取证据后的第 3 次 Provider 调用失败，未取得最终答案。
- 工具名称/参数/别名/重复调用的运行时拒绝共 0 次。
- `evidenceReadPass=false` 共 2 次，均与首次 Provider 失败重叠，不能再作为独立 `tool_coverage_insufficient` 失败加总。

“满足预设取证目标”只表示读到标注的材料类型，不代表已证明材料充分或自然语言论断正确。样本不足以判断 Agent 取证设计优劣。

## 后续边界

本批不用于选择 V1/V2/V3，也不与先前 30-run 或其他探针混算。2 个 E2E PASS 答案已留在独立评审材料中，全部人工评分仍为 null。

按 canary 连通通过后才继续的条件，完整 V0 基线暂未完成。下一步应定位 Provider 错误；如果需要更改评估代码或实验变量，保留此批 canary 为中止记录，并从新的冻结基线重新开始，不混入后续 80 次。

原始记录：[report.json](report.json)、[runs.jsonl](runs.jsonl)、[canary.json](canary.json)、[manifest.json](manifest.json)。
