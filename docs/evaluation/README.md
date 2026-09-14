# D5-G G5：固定问题评估

这套工具测量两条真实路径的响应与校验表现，不自动修复 JSON、不补引用、不重试失败请求。
默认离线 Mock；只有显式 `--live` 才调用 DeepSeek。CLI 只加载仓库的合成 Demo，不能指定聊天文件或 SQLite 数据库。

```zsh
pnpm eval:evidence --mock

# CLI 使用环境配置，密钥不写入命令参数。
source "$HOME/.config/wememo/deepseek.env"
pnpm eval:evidence --live

# Node fetch 无法使用本机代理时，可选 CLI curl transport。
pnpm eval:evidence --live --proxy http://127.0.0.1:7897
```

一次完整运行是 15 个固定问题 × 2 条路径，共 30 条记录；真实运行会产生 API 费用。
输出默认保存为 `docs/evaluation/reports/<时间>-<live|mock>.json`，可用 `--out` 指定新文件。
已有报告不会覆盖。Ctrl+C 取消当前等待、停止后续问题并保存已完成记录，退出码为 130。
评估失败是结果数据，完成整批评估返回 0；配置或脚本错误返回 1。

## 比较方法

- 五类问题各 3 个：指标、替代解释、反向证据、数据不足、越界问题。
  当前报告版本为 `wememo-evidence-question-eval-v1`，15 个问题文本保持不变并保存在报告中。
- 固定参考时间为 `2026-09-11T12:00:00+08:00`。每对问题使用同一份不可变分析快照，
  避免日期推进、数据变化影响比较。报告含 fixture SHA-256、覆盖计数和关键源文件 SHA-256。
- Direct QA 使用冻结的 `InteractionReasoner` 和 D5-F `DeepSeekProvider`。
  评估专用包装把同一个问题加入 user JSON，并声明问题是不可信数据；不改变桌面 D5-F。
- Agent 使用保留原有决策规则的 `BoundedAgentRunner` 和 G3 Adapter，保留 3 次模型、4 次工具等全部预算。
  两条路径的提示词、证据交付方式和预算来自各自现有实现，并非同一 Prompt 的随机实验。
- 每个问题每条路径仅运行一次。顺序交替，逐条执行，不并发、不筛选问题或剔除失败。
  真实模型非确定，随机 alias 也不同，不能从一次小样本推断稳定通过率。

## 指标定义

每条记录包含 `caseId/category/path`、Provider 返回数、模型/工具调用数、
`finalResponse/schemaPass/citationPass`、耗时、最终有效性与固定错误代码。
没有执行的校验用 `null`，不是 `false`。

| 指标 | 分子 / 分母 |
|---|---|
| Provider response | Provider 正常返回的 turn 数 / 实际模型调用数，包含工具提案和最终文本；不是原始 HTTP 可达率 |
| Runs with provider response | 至少得到一次 Provider 返回的运行数 / 运行数 |
| Structured-output | 最终文本通过严格 JSON/字段校验的次数 / 收到最终文本并尝试结构校验的次数 |
| Citation | 最终引用校验通过次数 / 实际进入引用校验的次数 |
| End-to-end valid | 完整链路有效次数 / 全部运行数，包含预算、超时及无数据等本地退出 |

分母为 0 时比例为 `null`。预算超限可能发生在取得最终文本之前，此时结构和引用均未执行。
模型/工具调用数及平均耗时用于比较运行开销；当前未采集实际 token 或账单，不能据此计算金额。
所有失败分类保留，不把 `invalid-output` 与 `invalid-citation` 合并。

报告不保存原始模型响应、证据正文、scope、canonical ID、API key、headers 或本地 alias binding。
输出通过校验也不等于语义正确：`qualityScoring: not-performed` 明确表示未评估相关性、
自然语言是否被证据支持、是否尊重心理推断边界。越界问题的结构/引用失败也不能算作语义拒答成功。
后续质量评价需单独人工盲评上述维度；只有质量接近时，才能结合实际开销选择 Direct QA。

## 2026-09-13 实测

[完整 30 条记录及来源哈希](reports/2026-09-13-live.json)。模型为 `deepseek-flash`，
使用已有本地配置与 curl 本机代理；这批数据只来自合成 Demo（50 条分析消息）。

| 指标 | Direct QA | Evidence Agent |
|---|---:|---:|
| Provider 返回（turn） | 15/15 | 40/40 |
| 最终文本结构通过 | 7/15 | 6/13 |
| 引用通过 | 2/7 | 0/6 |
| 端到端有效 | 2/15 | 0/15 |
| 模型调用总数 | 15 | 40 |
| 工具调用总数 | 0 | 39 |
| 平均耗时 | 6.17 秒 | 10.53 秒 |
| 结构失败 | 8 | 7 |
| 引用失败 | 5 | 6 |
| 预算超限 | 0 | 2 |

Agent 有 2 次在最终答案之前预算超限，因此结构校验分母为 13。所有 28 条无效运行均被拒绝。
Direct QA 仅 A1、D1 通过；本批 Agent 无有效结果。该结果不支持提升 Agent 的使用优先级，
也不支持把 Direct QA 称为稳定。保留原 D5-F 入口；先量化输出遵循性与引用失败，再决定优化位置。
本轮未修改 Prompt、验证规则或预算来提高通过率，未加入第三个工具或多 Agent。

## 补充：单次桌面实测

用户另行授权后，在真实 Electron UI 对 50 条合成消息的 Demo 会话发起一次
“回复变慢还有其他解释吗？”（当前时间的最近 7 天与前 7 天）。通过 Electron net.fetch
调用 DeepSeek，模型调用 3 次、工具读取 4 次、交付 18 条证据，界面显示耗时 11.0 秒。
最终结构校验通过，引用校验失败；界面显示“证据引用校验失败”和 `invalid-citation`，
未显示被拒绝的答案。没有重试。

[该次桌面实测记录](reports/2026-09-13-gui-smoke.json) 与上面的固定参考时间评价集分开保存，
不并入 30 次比较的分母。这次验证了真实桌面的引用失败呈现；不声称已经实测成功结果或取消状态。
