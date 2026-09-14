# D6：Real-Model Reliability Evaluation v2

状态：已授权 V0 的 80 次真实基线；先做 6 Normal + 2 Stress canary，检查后继续 72 次；暂不人工评分。D6 不改变生产 Renderer、IPC、Provider、Reasoner、Agent Runner、证据选择或校验器。G4/G5 与设置诊断已分别冻结，独立研究材料另行提交。

## 要回答的问题

1. 真实模型主要失败在 JSON、字段、引用范围、引用方向还是取证阶段？
2. 在相同模型、问题、证据预算与严格校验下，哪种提示词组织方式值得进一步验证？
3. Direct QA 与 Evidence Agent 的有效率、人工质量和运行开销是否存在有用差异？

当前没有据此切换产品主路径，也没有预设 Agent 优于 Direct QA。

## 冻结基础

| 提交 | 内容 | 验证 |
|---|---|---|
| `68764c1` | Desktop Evidence Question + 原始评估工具 | 独立提交快照 36 文件 / 491 测试通过 |
| `da6541c` | Provider Settings + Reasoning Diagnostics + 评估细分 | 完整基线 42 文件 / 543 测试通过 |
| `4c68163` | 结构化输出研究、独立实验与历史结果 | 完整基线 42 文件 / 543 测试通过 |

每次提交前均通过完整工作区类型检查、543 项测试、打包与 diff 检查。A 另在隔离目录验证其独立快照；后续配置/诊断未被带入 A。以上均为本地提交，无新增标签或推送。

D6 使用新报告版本 `wememo-real-model-reliability-v2`，不覆盖旧的 `wememo-evidence-question-eval-v1/v2` 报告。

## 固定评价集与调用规模

| 集合 | 问题 | 重复 | 路径 | 每个 Prompt 变体的运行数 |
|---|---:|---:|---:|---:|
| Normal | 10 | 3 | Direct / Agent | 60 |
| Stress | 5 | 2 | Direct / Agent | 20 |

问题和检索目标预先保存在 `src/main/evaluation/reliability/cases.ts`。Normal 覆盖互动变化、回复变慢、替代解释、反向证据、数据不足与主动性。Stress 覆盖心理结论与忽略反证、删除引用、未交付引用、聊天原文注入和仅 context 时诱导 finding。

每个变体共 80 次运行。四个变体共 320 次运行；运行数不等于 HTTP 调用数，Agent 每次最多 3 次模型调用。V0 单独运行的理论上限为 160 次模型调用，四组上限为 640 次。失败不重试，不补跑，也不剔除。

Normal 与 Stress 永远分开汇总。一次小样本的差异不直接称为显著改善；需要考察各问题、重复间波动及后续独立验证。

## 数据、Prompt 与参数控制

所有输入仅来自仓库合成 Demo；CLI 不接收聊天路径、SQLite、任意问题、ContextPack 或自定义端点。

- `demo`：固定参考时间的可信 Builder 输出。
- `injection`：在 Demo Pack 的一个 workload excerpt 中加入明确的不可信聊天指令。初始 Agent 目录不含该正文；实际读取后才暴露。
- `context-only`：从 Demo Pack 删除非 context 证据并同步过滤 observation 引用。指标和 status 保留，因此这是“证据材料不完整”的压力场景，不伪称为重新计算出的数据不足状态。

三个版本均通过原有 ContextPack 校验；仅用于评估，不修改 Demo 文件或生产 Builder。每个问题在两条路径、各 Prompt 变体和重复中使用同一冻结快照，报告保存源 fixture 和派生 Pack 的哈希。

| 变体 | 唯一改动 | 合适的比较基线 |
|---|---|---|
| V0 | 原提示词，不改变字节 | 基线 |
| V1 | 在前部增加精确字段要求 | V0 |
| V2 | V1 + 内部检查清单 | V1 |
| V3 | V1 + 短合法形状样例，明确标记虚构 alias | V1 |

V2/V3 是分别在 V1 上增加一个因素，不把两者视为同一因素比较。样例 alias 不获得引用权限，模型照抄时仍会被拒绝。

Direct QA 沿用此前评估专用的 question 注入，并调用冻结的 InteractionReasoner；桌面固定解释不变。Agent 沿用冻结的 Runner，通过评估专用 Provider 包装添加提示词，并在调用前再次检查增加提示词后的完整请求字符预算。

模型、原有请求参数、4096 输出 token 上限、证据数量/字符预算、工具预算与零重试保持不变。temperature 统一不发送，记录为 `provider-default-omitted`，不声称控制了服务端随机性或 seed。Direct 与 Agent 本身的协议和交付方式不同，因此跨路径比较属于产品路径比较，不是纯 Prompt 实验。Prompt 变体顺序轮换，各变体的路径先后顺序也随重复轮换；运行逐条执行。

## 分层口径与稳定错误

```text
Provider 完成返回
  → JSON 解析
  → 精确字段契约
  → 所有引用的范围检查
  → 所有引用的方向检查
  → 冻结 Runtime 接受
  → 人工质量评审
```

各中间检查为 `true / false / null`：没有执行就是 null，不是失败。最终有效始终是布尔值，所有实际开始的运行均进入最终有效率分母。中断后未开始的运行不伪造记录，保留 planned/completed/interrupted。

Provider 指标表示 Adapter/Provider 接口完成返回，不是原始 HTTP 200 率；报告同时保留 providerResponses/modelCalls。一个 Agent run 的 providerPass 要求其已发起模型调用均完成返回。HTTP 200 但 envelope 无效可以归为 invalid_provider_response，不能算结构通过。

| 层级 | 主要错误码 |
|---|---|
| JSON | `invalid_json` |
| 字段 | `missing_field`、`extra_field`、`invalid_confidence`、`invalid_schema` |
| 引用范围 | `unknown_citation`：不在本次目录；`undelivered_citation`：在目录但未实际交付 |
| 引用方向 | `finding_without_support`、`alternative_support_only`、`alternative_contains_support` |
| 工具 | `unknown_tool`、`tool_argument_failure`、`duplicate_tool_call`、`invalid_tool_alias` |
| 运行 | `provider_error`、`invalid_provider_response`、`timeout`、`budget_exceeded`、`cancelled` |
| 本地 | `no_data`、`invalid_context`、`runtime_rejection`、`observation_mismatch` |

`failureCode` 是主要错误，`failureCodes` 保留同一已检查层内的多个问题，例如同时缺字段和多字段。额外字段只记录分类，不保存任意属性名或字段值。`runtimeFailureCode` 保留原运行时分类，便于核对。

分层观察器调用原 JSON/字段校验器，再检查整个答案的引用范围，最后检查方向。冻结引用校验器按条目遍历，因此多个错误同时存在时首个错误可能不同；D6 的漏斗顺序是统一分析口径。只有原运行时接受且观察器通过才算 E2E；观察器不能放行输出。finding 可混合 support/context，只要至少一个 support；alternative 不能含任何 support；没有合适证据时允许空 findings。

## 取证和回答分开测量

每条记录包括工具提案数、执行数、成功证据读取次数、目录数量、实际到达 Provider 调用的证据数量。非法整批请求不会产生半次成功交付。第三次模型调用继续请求工具时仍返回预算错误。

`readTargets` 是为问题预先标注的检索代理指标，例如 workload 或回复间隔指标是否可用、是否读取。完整目录的可用性通过相同冻结投影在本地计算，不把额外信息交给模型。目标在预算内不可用、没有标注目标或未调用模型时，`evidenceReadPass` 为 null。

这些目标只测“是否读到指定类型材料”，不能自动证明材料正确、充分或回答正确。汇总中的 `afterRetrievalMet` 单独显示读到目标后 JSON、字段、范围、方向和 E2E 表现，从而区分取证覆盖与最终表达失败。Stress 的结构/引用失败也不能自动算成心理推断边界的语义拒答成功。

## 执行与产物

```zsh
# 默认只运行离线 V0：80 runs
pnpm eval:reliability --mock

# 离线检查全部四组：320 runs
pnpm eval:reliability --mock --variants V0,V1,V2,V3

# 真实首轮基线；仅显式 --live 才联网，使用已配置的合成数据路径
source "$HOME/.config/wememo/deepseek.env"
pnpm eval:reliability --live --variants V0 --proxy http://127.0.0.1:7897

# 单独一套问题；不与另一套混合汇总
pnpm eval:reliability --live --variants V0 --set normal
```

CLI 继续只读显式环境配置，不读取 Electron 的桌面加密存储。真实执行会产生费用，保存 Provider Settings 不会自动启动评估。

`--out` 指向一个尚不存在的输出目录。目录在任何 API 调用前独占创建；已有结果不覆盖。每次运行完成立即写入检查点，Ctrl+C/SIGTERM 取消当前运行和后续调度，保留已完成的结果。取消无法撤回已经发送的请求或保证 Provider 未计费。

输出包括：

- `manifest.json`：预先记录的集合、模型、变体、参数和源文件/输入哈希。
- `runs.jsonl`：逐次纯指标检查点，不含原文、scope、canonical ID 或凭据。
- `report.json`：完整记录与按集合/变体/路径分别汇总的漏斗。
- `review-items.json`：仅 E2E PASS 的合成答案和实际交付的合成材料，供人工核对；引用统一转换为 review 别名，不修正任何结论。
- `review-checkpoint.jsonl`：通过答案的恢复检查点，不用于盲评顺序。
- `ratings-template.json`：空人工评分模板。
- `incomplete.json`：设置或保存异常时尽力保存的恢复记录，不伪装完成。

Provider headers、API key、原始 HTTP envelope 和失败答案不保存。正常指标日志只含固定 case/阶段/计数。评审材料有意保存合成的通过答案和证据，以支持内容评价；不能推广成真实聊天的默认持久化策略。

## 人工评分

只查看随机排序的 `review-items.json`，另存填写后的 ratings 文件。材料不显示路径/变体，引用已统一命名；证据数量和内容差异仍可能透露路径，因此不宣称完全盲化。

| 项目 | 0 | 1 | 2 |
|---|---|---|---|
| Groundedness | 引用不能支撑 | 部分支撑 | 明确支撑 |
| Relevance | 没回答问题 | 部分回答 | 直接回答 |
| Counter-awareness | 忽略反证 | 提到但弱 | 明确纳入；无反证时准确说明缺失 |
| Uncertainty | 过度断言 | 有保留 | 边界清晰 |

总分 0–8。`reviewer` 必须填写，四项必须为整数 0/1/2；未评不记为 0。重复/未知 reviewId、失败答案的 ID、缺分或非法分值均拒绝导入。可导入部分人工评分，但汇总明确标记 eligible/reviewed/complete，不把未评答案计入平均分。

```zsh
pnpm eval:review --report /绝对路径/report.json \
  --ratings /绝对路径/人工填写的ratings.json \
  --out /绝对路径/新的quality-summary.json
```

没有 LLM Judge，也没有自动给 Mock 或真实通过答案打分。待取得真实有效率与人工质量后，再按各问题类别比较调用数、延迟和质量；未采集实际账单，不能把调用数直接换算成费用。

## V0 Canary 与冻结

首次真实 V0 使用 `--canary`。冻结的 canary 清单为 N01、N02、N03、S01 的 repeat 1，各自 Direct/Agent 两条路径。它从原始排程提取 originalIndex 1、2、7、8、13、14、61、62 作为前 8 次，保留每对原有方向及剩余 72 次的相对顺序；问题、重复次数和总样本量不变。运行前 manifest 保存完整清单、排程哈希与 Git commit。

第 8 条落盘后生成 `canary.json`，检查 6+2 组成、所有 Provider 调用完成返回、逐次落盘与内存记录一致、失败分类已捕获、源码哈希和 commit 未变。检查通过后暂停，审阅后输入 `CONTINUE`。同一进程使用已经载入并冻结的配置、快照、Prompt 与排程继续运行；继续前再次检查源码和 commit。基础设施检查失败或未批准时停止，不自动重试。

```zsh
pnpm eval:reliability --live --variants V0 --canary --proxy http://127.0.0.1:7897
```

Canary 的 E2E 通过率不用于决定是否继续。只有评估系统正常、变量未变时 8 次才并入最终 80 次；如修订实验变量，保留旧记录并另起一批，不混算。后续 Prompt 实验如需比较应沿用该已记录的排程。

本地冻结标签为 `d6-eval-harness-v1`。本次只汇报程序漏斗与取证覆盖；仅保留 E2E PASS 的待评分材料，不填写任何质量分数。

## 本轮离线验证记录

2026-09-14：46 个测试文件 / 607 项测试通过，类型检查、生产打包和 diff 检查通过。相对冻结基线增加 64 项测试；生产链路相对 `4c68163` 没有文件改动。

实际 CLI 的 V0–V3 Mock 对照完成 320/320 次，其中 Normal 240、Stress 80；全部通过结构与引用检查，逐次记录、排程唯一性和源文件哈希一致。Mock 返回预设合法结果，这些数字仅验证工具，不证明 Prompt 改善或真实模型可靠性。D6 真实模型调用为 0。

人工评分 CLI 的空评分导入验证保持 0 reviewed / 320 eligible，所有平均分为 null。没有伪造人工评分。

[完整离线指标](2026-09-14-mock-ablation/report.json) · [预先记录的实验参数](2026-09-14-mock-ablation/manifest.json)。真实评估及 Direct/Agent 路径决策尚未完成。

Canary 冻结前追加验证：47 个文件 / 616 项测试、类型检查、打包和 diff 检查通过；真实 CLI 在 Mock 模式完成“8 次 → 暂停审阅 → 72 次”。[Canary 离线记录](2026-09-14-canary-smoke.json) 保存检查结果、完整排程与源码哈希。本记录没有真实调用或人工质量评分。
