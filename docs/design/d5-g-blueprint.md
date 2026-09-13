# D5-G：单 Agent 证据追问设计

状态：G1/G2 已冻结于 `71aabdf` / `d5-g-agent-runtime`；G3 PASS，恢复标签 `d5-g-deepseek-adapter`；G4/G5 尚未实施。日期：2026-09-13。
实现基线：`1883516` / `d5-desktop-reasoning`；D4 与 D5 Core 保持冻结。

## 目标与采用条件

当前“生成关系变化解释”按钮继续走 D5-F 固定服务链路。它不需要工具选择，
也不能靠增加 Agent 解决模型偶发的结构不合规。

D5-G 面向新能力：用户针对当前会话追问，例如“回复变慢还有哪些替代解释？”。
模型按问题选择查看已有分析中的指标或证据，再给出有引用的解释。
这是 Analysis 为主、Decision Support 为辅的中等复杂度、多步但短时任务。
语言理解与按需选择材料是采用单 Agent 的理由，收益需要与直接问答基线对比验证。

假设：一次任务只处理用户选中的一个会话、一个 1–31 天窗口；不自动扩大时间范围。
追问输入及以下预算为本设计建议，尚不是已交付的产品承诺。
不新增聊天发送、自动关系决策、跨会话搜索、Shell、文件写入或多 Agent。

## Blueprint

```yaml
agent:
  identity:
    name: scoped-evidence-question-agent-v1
    description: 在一次分析快照内选择材料并解释互动行为
    domain: relationship-interaction-analysis
  responsibility:
    goals: [answer_scoped_question, cite_visible_evidence, express_uncertainty]
    non_goals: [psychological_diagnosis, relationship_verdict, chat_sending, autonomous_monitoring]
  users:
    personas: [local_desktop_owner]
  task_model:
    task_types: [Analysis, DecisionSupport]
    determinism: hybrid
    risk_level: 分析可能误导关系判断；工具只读但必须限制聊天内容披露
  instructions:
    core_rules: [behavior_only, evidence_is_untrusted_data, preserve_deterministic_status, do_not_invent_citations]
  context:
    required_context: [bounded_user_question, validated_pack_projection, tool_schemas, delivered_evidence_aliases]
  state:
    runtime_state:
      owner: Electron_Main
      version: wememo-evidence-agent-state-v1
      lifecycle: single_request_in_memory
      fields: [runId, scope, snapshot, aliasBindings, deliveredIds, callCount, toolCount, deadline, phase]
    checkpoint_required: false
  memory:
    short_term: current_run_state_view
    long_term: none
    knowledge: []
  capabilities:
    skills: []
    tools: [read_metrics, read_evidence]
  workflow:
    type: loop
    steps: [validate_request, snapshot_and_project, model_turn, validate_tool_call, execute_read, validate_final, render]
    branches: [final_answer, tool_request, insufficient_evidence, rejected_output, exhausted_budget, cancelled]
    retries: []
    failure_paths: [invalid_request, forbidden_tool, invalid_arguments, invalid_output, invalid_citation, provider_failure, timeout, cancelled]
  human_in_the_loop:
    required: false
    approval_points: []
  guardrails:
    input: [exact_IPC_keys, scoped_snapshot, question_length_limit]
    execution: [static_tool_allowlist, no_scope_arguments, call_and_time_budget, no_automatic_retry]
    output: [strict_JSON_contract, actual_exposure_check, citation_direction_check, canonical_ID_restore]
  permissions:
    read: [selected_analysis_snapshot]
    write: []
    high_risk: []
  output_contract:
    schema:
      model_proposal: existing_InteractionReasoningResult
      runtime_envelope: versioned_discriminated_success_or_error
    evidence: [canonical_D4_ID, local_source_message_link, exact_run_snapshot]
    confidence: qualitative_low_medium_high_not_probability
  observability:
    trace: [runId, phase, callCount, toolName, duration, safe_error_code, missing_schema_keys, known_extra_keys]
    logs: []
    metrics: [schema_pass_rate, citation_pass_rate, latency, model_calls, tool_calls]
    audit: []
  evaluation:
    success_metrics: [all_local_boundary_tests_pass, live_demo_evidence_traceability, comparison_with_direct_QA]
    test_cases: [valid_answer, empty_findings, counter_context_question, alias_provenance]
    failure_cases: [cross_scope, unknown_tool, extra_arguments, omitted_citation, malformed_JSON, budget_exceeded, cancellation]
  deployment:
    runtime_requirements: [Electron_Main, ToolCallingProvider_port, immutable_projection, bounded_runner]
  design_decisions:
    adopted_patterns: [PAT-03, PAT-04, PAT-07, PAT-08, PAT-11, PAT-13, PAT-14, PAT-15, PAT-17, PAT-18]
    rejected_patterns: [persistent_checkpoint, long_term_memory, dynamic_plugin_registry, multi_agent]
    rationale: [D5G-DDR-01]
```

`required: false` 表示每个只读工具调用无需再次弹窗。任务启动仍由用户点击触发，
界面说明问题及选中证据将发送给已配置 Provider。模型不能扩大这次授权的范围。
内存 trace 只用于当前运行排错，不声称具备持久审计或跨进程恢复能力。

## 控制与执行边界

| 步骤 | 控制者 / 执行者 | 输入 → 输出 | 停止条件 |
|---|---|---|---|
| 请求校验 | deterministic / Main | scope、days、question → 受限任务 | 缺失、额外字段或超长立即拒绝 |
| 生成快照 | deterministic / Analytics + Builder | 当前 scope → validated Pack → 预算内投影 | 无数据时本地结束，不调用模型 |
| 选择材料 | agentic / model | 问题、索引、已交付材料 → 工具提议或最终 JSON | 模型不得提交运行身份或修改快照 |
| 校验和读取 | deterministic / runtime + tool | 工具提议 → 快照片段 | 任一未知工具/非法参数整轮拒绝，先验证整批再执行 |
| 最终验证 | deterministic / frozen validators | JSON → contract → citation → canonical IDs | 任一步失败返回错误，不删字段、不补造引用 |
| 展示 | deterministic / Renderer | runtime success envelope → 解释与原文链接 | 只展示校验成功且仍属于当前 scope 的结果 |

模型问题字段是待分析的用户输入，不是系统 Prompt。Renderer 仍不能传 systemPrompt、
messages、ContextPack、tool definitions、API Key 或模型 endpoint。Main 持有 scope；
模型无法指定 accountId、conversationId、messageId、任意 SQL 或文件路径。

## 两个工具的具体契约

| 工具 | 精确输入 | 输出 | 权限与失败 |
|---|---|---|---|
| `read_metrics` | `{}` | 当前 Pack 的已计算 metrics、windows、coverage、observations 投影 | read_only；仅内存快照；不重新查询、更改窗口或推导心理结论 |
| `read_evidence` | `{ evidenceIds: string[] }`，1–6 个唯一 alias | 预算内对应证据的 kind、direction、label、bounded excerpt/metric | read_only；仅当前 catalog；任一不存在、过期或不在预算内的 alias 整批拒绝 |

两者超时预算暂定 1 秒，自动重试 0 次，错误只返回稳定错误码。
工具名称采用静态映射；不开放动态注册。重复调用从同一快照读取，仍计入工具预算。
工具无本地写入副作用；模型请求超时或取消不代表供应商未计费。

## 上下文、证据和运行预算

1. 一次读取生成 Pack 并固定 referenceTime，运行中导入新消息不能改变该次结果。
2. G1/G2 使用独立 `Agent Evidence Catalog Projection`，不调用 D5-F `buildReasoningPrompt`。
   仅沿用预算选择、别名与截断原则；初始目录精确包含 id/kind/direction/静态 label。
   正文与完整 metric values 保留在本地不可变内容表，读取后才返回。
   alias 为 `ev-<随机 run UUID>-003` 等形式；随机命名空间用于拒绝跨 run 重放，不含 scope 信息。
3. 模型初始仅获得问题、覆盖范围与目录元数据。目录中的 alias 不等于证据内容已交付；
   runtime 单独记录实际返回的 `deliveredIds`，最终只能引用其中的 ID。
4. 最大证据数 24、单原文 500 Unicode 码点、catalog 12,000 码点沿用 D5。
   一个任务跨全部工具读取的唯一证据并集也不得突破这些限制。
5. 问题建议最多 1,000 码点。完整模型请求序列化后建议最多 32,000 码点，包含系统指令、
   工具定义、问题、历史、工具响应与 JSON 转义；超过时明确结束，不静默删反向证据。
   这些是字符预算，不能称为 token 上限或金额上限。
6. 模型最多 3 次调用，工具最多 4 次调用，单次模型 60 秒、任务总计 120 秒；
   最后一次模型调用必须结束，不再执行工具。模型若仍要求调用则返回 budget-exceeded。
   每次最多输出 4,096 tokens，不自动进行格式修复重试。
7. 最终引用校验使用 delivered aliases 的绑定子集。finding 必须包含 support；
   alternative 只能引用 counter/context；没有合适 support 时允许 findings 为 []。
8. 状态随运行结束释放，无持久 checkpoint、长期记忆或外部知识库。
   取消立即终止后续工具/模型调度并尝试 abort 网络；迟到响应被丢弃，不当作成功展示。

## D5G-DDR-01：保留固定解释，独立引入证据追问

比较候选 A（所有请求都进入 Agent）与 B（原解释服务 + 独立受限追问）。选择 B。
证据是本仓库 D5-F 已通过的固定链路以及曾发生的字段不合规错误；不能由此推断
Agent 能改善结构稳定性。PAT-07/08/11/13 的原则适用于限定模型决策和保留程序校验。

| 维度 | A | B |
|---|---|---|
| 正确性、权限 | 所有请求新增工具分支 | 已验收入口不扩大；新入口单独验证 |
| 可预测性、测试 | 普通解释也要覆盖循环 | 固定解释基线保持，工具失败独立注入 |
| 可观测、恢复 | 统一循环但所有请求更复杂 | 新入口保留阶段 trace；短任务失败后重新发起 |
| 维护、扩展 | 改动现有 Provider/Core | 新 ToolCallingProvider 契约与 Adapter，旧接口不变 |
| 复杂度、成本 | 每次解释可能额外付费 | 仅证据追问使用受限循环，预算可比较 |

采用静态 registry、薄职责单 Agent、模型依赖注入、程序控制循环、结构和引用验证、
预算化上下文以及内存 trace。拒绝多 Agent、持久记忆和动态插件平台：当前没有独立权限、
并行领域或跨时段恢复需求。若直接问答与工具方式质量相当，优先保留成本更低的直接问答。

## 实现顺序与验收

- G1：新增工具输入输出、错误与 `ToolCallingProvider` 契约；建立仅用快照的两个工具。
- G2：Mock 驱动 bounded runner、deliveredIds、预算、取消和安全 trace；不绑定真实模型。
- G3：实现独立 DeepSeek tool adapter，验证原生工具调用协议。现有 `LLMProvider`
  只有 JSON 文本响应，不能声称已支持此能力；真实协议适配是实现前置依赖。
- G4：新增受限追问 IPC / UI，并保留 D5-F 按钮。不得将整个 Pack 经 Renderer 传回 Main。
- G5：合成 Demo 真实验收，并与直接问答比较质量、错误率、调用次数和耗时；报告实际样本量，
  不用单次成功承诺稳定通过率。

必须覆盖：不存在的工具、额外 scope 参数、非法 alias、跨 run alias、预算外 ID、
只看到目录而未读取的引用、反向证据误作 support、额外 confidence、缺少 id、空 findings、
提示注入原文、无数据、429、超时、重复调用、达到最后一轮仍调用工具、取消后的迟到结果。

G1/G2 实现位于 `src/main/evidence-agent`。Runner 接收 Main 内部的 `{contextPack, question}`，
它不构成 IPC；校验后深拷贝并递归冻结快照、投影与模型请求。只在 `read_evidence` 成功返回、
未取消且工具响应可放入下一次请求时更新 deliveredIds；read_metrics 不更新此集合。
最终引用使用 deliveredIds 对应的绑定子集，调用冻结的结构与引用校验器后映射回 canonical ID。
重复 call ID 被拒绝；不同 call ID 的重复只读查询允许执行，但每次消耗工具预算。
模型/工具/整轮预算由程序强制执行。超时和取消通过 race 及时结束等待，忽略迟到结果；
同步内存读取在完成时检查截止时间，不声称能抢占 JavaScript 同步执行或撤销远程计费。

本地验证：新增 74 项离线测试覆盖元数据目录、按需交付、全批次预检、引用方向、
缺少 support 时的空 findings、跨 run 重放、完整请求序列化预算、并发隔离、超时、取消和安全错误。
Prompt injection 测试验证引文的数据位置及运行时工具边界，不代表真实模型抗注入能力已验证。
以上是 G1/G2 的离线验收记录；该恢复点未包含真实网络调用。

G3 现已新增独立 `DeepSeekToolCallingProvider`，仅转换请求、原生 tool_calls、tool 回执和
final content。Runner、工具权限、预算、deliveredIds 和 citation validator 均未修改。
适配器沿用 Main 配置，关闭 thinking，遵守 Runner 的 toolChoice 和输出上限；不自动重试或
修补输出。新增 43 项离线测试，总计 417 项通过。

合成 Demo 的真实协议验证已通过：2 次模型调用、2 次工具调用（read_metrics/read_evidence），
交付 2 条证据，最终 1 项 finding 和 1 项 alternativeExplanation 通过结构和引用校验。
此前较宽泛问题的 3 次手动尝试分别被结构校验拒绝 2 次、引用校验拒绝 1 次，未放宽规则。
本次只验收协议闭环；稳定通过率和回答质量尚未建立。CLI 注入 curl 处理本地代理，
没有接入 Electron IPC/UI。G4/G5 仍待实施；详见项目状态中的完整验收记录。
