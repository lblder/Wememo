# Wememo 结构化输出研究：DeepSeek、开源实践与下一轮实验

研究日期：2026-09-14。对象：D5-F 固定解释链路与 D5-G Evidence Agent。研究基线为本地 `1eb76bd`，并包含当前尚未提交的 G4/G5 评估实现。

后续实测更新：用户授权的 24 次合成探针已经完成，见[DeepSeek JSON Schema 实测结果](/Users/lbld/Documents/ChatGPT/Wememo/docs/research/deepseek-json-schema-results-2026-09-14.md)。Responses 接口接受 Schema，但观察到嵌套字段等约束违规；下文保留此前文档研究和实验计划，不能将候选能力视为已验证修复。

第二轮实测更新：[Instructor + Pydantic 独立对照实验](/Users/lbld/Documents/ChatGPT/Wememo/docs/research/instructor-pydantic-comparison-results-2026-09-14.md)完成 36 次合成请求，采用相同 Wememo v1 契约、严格配置与零重试。Instructor JSON 本批最终通过 5/12，直接 Responses Schema 3/12，Instructor TOOLS 2/12；尚不能证明稳定改善。该轮未引入 Python 生产服务。

本文结合源码、已有真实调用记录、DeepSeek 官方文档、开源框架文档与实现、公开问题记录。没有新增模型调用，没有读取 API key，没有修改 Prompt、校验规则、预算或 Provider。文中的新方案和验收阈值均为建议，尚未实测。

## 1. 结论与优先级

**Wememo 当前需要同时解决“输出形状遵循性”和“证据引用遵循性”。JSON 能解析只是第一步。** 已有评估中，两条路径的结构通过率都不到一半；通过结构检查的答案，又有大量在引用检查处被拒绝。因此，换一个 JSON parser 或反复强调“只输出 JSON”，都不足以完成任务。

本次最值得跟进的新信息是：**DeepSeek 当前官方 Responses API 文档已经列出 `text.format.type: "json_schema"`**，而现有两个 Adapter 都走 Chat Completions。这里有一个可以减少字段遗漏、多余字段、类型错误的服务端约束候选，应先做独立能力验证。它是否完整执行 Wememo 所需约束，仍须对当前账号、模型和具体 Schema 实测。[Responses API 参考](https://api-docs.deepseek.com/api/create-response/)

建议顺序是：

1. **补齐脱敏诊断**：分开 JSON 语法、字段结构、引用范围、引用方向、协议截断等错误。
2. **先验证服务端 Schema 能力**：使用合成输入做小规模探针，再在 Direct QA 上建立单次输出基线。
3. **再处理 Agent 的最终输出约束**：保持按需取证和全部预算，明确每轮实际使用的输出模式。
4. **单独评估引用选择**：按本轮真正交付的 alias 构造约束，并保留本地 citation validator。
5. 最后才比较回答质量、延迟与实际 token 开销，决定 Agent 是否值得成为主要入口。

不建议本阶段更换整个 Agent 框架。现有权限、快照、引用和取消边界已经建立；可以借鉴开源项目的协议选择、错误分类与测试方法，避免把其默认重试或容错转换一并引入。

## 2. 实际数据告诉了我们什么

### 2.1 固定问题评估

依据：[30 次真实评估记录](/Users/lbld/Documents/ChatGPT/Wememo/docs/evaluation/reports/2026-09-13-live.json)与[评估方法](/Users/lbld/Documents/ChatGPT/Wememo/docs/evaluation/README.md)。模型为 `deepseek-flash`，15 个固定问题分别运行 Direct QA 和 Agent；每条路径每题仅尝试一次，没有修复或重试。使用合成 Demo 和固定参考时间，分析消息数为 50。

| 指标 | Direct QA | Evidence Agent |
|---|---:|---:|
| 运行数 | 15 | 15 |
| Provider 正常返回的 turn / 模型调用 | 15/15 | 40/40 |
| JSON 与字段结构通过 / 实际检查次数 | 7/15，46.7% | 6/13，46.2% |
| 引用通过 / 实际检查次数 | 2/7，28.6% | 0/6，0% |
| 端到端有效 / 全部运行 | 2/15，13.3% | 0/15，0% |
| 模型调用总数 | 15 | 40 |
| 工具调用总数 | 0 | 39 |
| 平均耗时 | 6.17 秒 | 10.53 秒 |
| 结构失败 / 引用失败 / 预算失败 | 8 / 5 / 0 | 7 / 6 / 2 |

Agent 有 2 次在得到最终答案前预算超限，所以结构检查分母为 13。结构未通过时不会运行引用检查，相应值是 `null`，不能当作一次引用失败。Provider 返回指标统计 Adapter 正常返回的 turn，包含工具提案，并非独立测量的原始 HTTP 成功率。

这批数据支持的结论是：**无效结果确实被阻止进入展示层，但当前可用性不足。** 它不支持“DeepSeek 普遍只有这个成功率”，也不支持“Direct QA 已稳定”。两条路径的 Prompt、证据交付方式、alias 和预算不同，属于完整产品路径比较，不能据此把差异全部归因于 tool calling。

本次重新计算了报告中列出的 14 个源文件 SHA-256，全部与当前工作区一致，涵盖两个 Provider、Runner、Prompt、投影、引用校验器和评估实现。以下源码解释与该批数据对应。

### 2.2 进一步按 Agent 最终回答轮次拆分

Runner 遇到 final 即退出，且这批没有重试，所以对确实得到 final 的记录，可由 `modelCalls` 推出最终回答轮次：

| 最终回答轮次 | final 数量 | 当前请求模式 | 结构通过 | 结构失败 |
|---|---:|---|---:|---:|
| 第 2 轮 | 3 | 未设置 `response_format` | 1 | 2 |
| 第 3 轮 | 10 | `json_object` | 5 | 5 |

这确认了一个实现差异：Agent 只在最后一轮禁用工具时开启 JSON 模式。前两轮允许直接 final，此时靠 Prompt 约定 JSON 格式。[Adapter](/Users/lbld/Documents/ChatGPT/Wememo/src/main/providers/deepseek-tool-calling-provider.ts:37)、[Runner](/Users/lbld/Documents/ChatGPT/Wememo/src/main/evidence-agent/bounded-agent-runner.ts:76)

但第三轮仍有 5 次结构失败，说明“早期 final 未开 JSON 模式”无法解释全部问题。当前 `invalid-output` 把语法与字段检查合并，不能进一步声称这 5 次都是多余字段，也不能声称 JSON 模式返回了非法 JSON。

### 2.3 单次桌面实测应单独看待

[GUI 实测记录](/Users/lbld/Documents/ChatGPT/Wememo/docs/evaluation/reports/2026-09-13-gui-smoke.json)使用真实 Electron 网络路径，对包含 50 条合成消息的 Demo 会话、当前时间的最近 7 天发起一次追问。结果为 3 次模型调用、4 次工具读取、交付 18 条证据、界面耗时 11.0 秒；结构通过、引用失败，拒绝的答案未展示。

这证明桌面路径能正确呈现引用失败。它与固定参考时间的 30 次评估分开，不合并分母；“50 条会话消息”也不等于该时间窗口实际分析了 50 条。

## 3. 必须区分的六层正确性

| 层次 | 检查内容 | 能通过却仍有问题的例子 |
|---|---|---|
| 传输与协议 | 响应完整、状态正确、最终内容可取得 | HTTP 成功，但输出因长度限制截断 |
| JSON 语法 | 严格解析为 JSON | 对象包含合法 JSON 字段 `confidence`，但放错位置 |
| 字段契约 | 精确 key、类型、枚举、非空、唯一性 | `evidenceIds` 是字符串数组，但编号不存在 |
| 引用资格 | 只引用本次允许、实际交付的 alias | alias 在目录可见，但从未读取正文 |
| 引用方向 | finding 至少一个 support；alternative 只用 counter/context | 用工作繁忙的 context 作为唯一 finding 证据 |
| 内容依据 | 引文是否支持具体说法，是否越过心理推断边界 | 引用了合法 support，却断言“对方已经不喜欢你” |

当前程序严格处理前面相关边界，但引用校验器明确不验证自然语言蕴含关系。**Schema 通过和 citation 通过，都不等于结论已经被证据充分支持。** 后续质量评估必须另行检查最后一层。[引用校验实现](/Users/lbld/Documents/ChatGPT/Wememo/src/main/reasoning/evidence-citation-validator.ts:14)

### 3.1 为什么会出现 `alternativeExplanations[0] — expected exact keys`

当前 alternative 的精确字段集合是：

```json
{
  "id": "alternative-1",
  "explanation": "工作繁忙可能解释部分回复变慢。",
  "evidenceIds": ["示例 alias"]
}
```

如果模型增加 `confidence`，遗漏 `id`，或把 `explanation` 写成 `claim`，都可能触发同一错误。这个检查比较字段集合，**不要求字段顺序一致**。字段值内容的检查发生在后面，不能把这条错误解释为“中文无法解析”。[字段校验器](/Users/lbld/Documents/ChatGPT/Wememo/src/shared/interaction-reasoning-validation.ts:15)

这是依据代码列出的可能触发方式，并非对历史响应的复原。历史记录未保存对应原始对象，不能确定那次究竟多了哪个字段、少了哪个字段。

### 3.2 为什么 JSON 正确后仍有引用失败

当前引用检查除了检查本地 binding 完整性，还会拒绝：

- 当前允许集合之外的 alias，包括拼写错误、其他 run 的 alias、仅在目录出现但未交付的 alias。
- finding 没有引用任何 support。
- alternative 引用了 support，即使同一项还引用了 context，也会拒绝。

这里有一个场景难点：用户问“回复变慢还有其他解释吗”，模型可能自然地把“近期工作繁忙”写成一个 finding，并只引用 context。从普通问答习惯看它是一条发现；从 Wememo v1 契约看，它应进入 `alternativeExplanations`。这是值得测试的**分类负担假说**，目前没有逐条响应证据证明它是本批主要原因。

`findings: []` 已被当前校验器和 Agent Prompt 允许。没有合适 support 时，正确做法是保留空 findings，并在替代解释或不确定性中回答；不能为了让结构非空而制造行为变化结论。

## 4. DeepSeek 当前能约束到什么程度

下面描述的是 2026-09-14 查阅到的官方接口说明，而非对历史版本的推断。

| 路径 | 官方说明中的能力 | 对 Wememo 的含义 |
|---|---|---|
| Chat Completions + `json_object` | `response_format.type` 列出 `text`、`json_object` | 当前实现启用的是 JSON 模式，没有把应用 Schema 作为服务端输出约束提交 |
| Beta 工具 `strict: true` | 对函数调用参数进行 Schema 约束 | 可以约束工具参数；不能仅靠这个开关约束最终 assistant 文本 |
| Responses + `text.format.json_schema` | 按提供的 JSON Schema 生成结构化文本 | 最值得先探测的最终答案约束候选，需要新的协议 Adapter |

来源：[Chat Completions 参考](https://api-docs.deepseek.com/api/create-chat-completion)、[严格工具调用](https://api-docs.deepseek.com/guides/tool_calls/)、[Responses 参考](https://api-docs.deepseek.com/api/create-response/)。

### 4.1 当前 JSON 模式的实际边界

DeepSeek 的 JSON 模式指南要求在请求中启用 `json_object`，并在消息中明确要求 JSON、给出示例；它还提及空内容与输出长度方面的注意事项。模式提供 JSON 格式能力，不能据此认定 Wememo 的精确字段集合、证据方向已被服务端执行。[JSON Output 指南](https://api-docs.deepseek.com/guides/json_mode/)

现有 Direct Provider 已包含 JSON 模式和额外格式提示，Agent Prompt 也已声明 alternative 不含 confidence。因此，继续叠加相似的格式提醒应作为对照实验，而不是先验认定的修复。

### 4.2 严格工具调用不能直接原样开启

Beta 文档要求所有对象属性列入 required，并设置 `additionalProperties: false`；它明确不支持字符串 `minLength/maxLength` 和数组 `minItems/maxItems`。Wememo 的 `read_evidence` 包含 1–6 个且唯一的参数约束，因此不能把现有工具 Schema 原样加上 strict 就假定兼容。文档未明确承诺的关键词也不能视作已支持。[严格模式 Schema 子集](https://api-docs.deepseek.com/guides/tool_calls/)

即使服务端参数约束可用，本地仍须执行 alias 当前 run 限制、整批预检、唯一性和预算。若为服务端生成较弱的兼容 Schema，必须明确它只是生成辅助，不能连带弱化本地工具契约。

### 4.3 Responses API 是候选能力，不是已验证修复

官方格式位置是 `text.format`，不是把 `json_schema` 填进当前 Chat Completions 请求。参考页列出了 `type/name/schema`，没有在该对象中列出 `strict` 字段；不应照搬其他服务商同名协议的字段。其完整 Schema 子集也需逐项验证。[Responses 格式定义](https://api-docs.deepseek.com/api/create-response/)

兼容指南还显示，部分参数被忽略，`max_tool_calls` 和 `parallel_tool_calls` 不能替代本地预算；服务是无状态路径，完整历史仍由客户端管理。**收到 HTTP 200 只能说明请求被接受，不能单凭这一点证明某个约束已生效。**[Responses 兼容表](https://api-docs.deepseek.com/guides/responses_api/)

对项目的工程影响是：当前配置及请求构造针对 `/chat/completions`，不是更改环境文件里的 base URL 就能完成迁移。应建立独立候选 Adapter，负责请求、返回项、终止状态、usage 和取消信号的翻译；保持现有 Reasoner/Runner 的权限归属。初期先用静态输出 Schema 验证 Direct QA，降低工具协议同时变化造成的混淆。

## 5. 开源社区怎样处理，以及哪些做法适合本项目

### 5.1 可借鉴的机制

| 项目 | 查阅到的机制 | Wememo 可借鉴之处 | 不能直接照搬之处 |
|---|---|---|---|
| LangChain | 区分 ProviderStrategy 与 ToolStrategy；ToolStrategy 支持校验错误反馈 | 明确记录实际生成策略，分离结构化最终结果与业务工具 | 默认错误反馈可能触发重试，改变预算与首次通过率 |
| Pydantic AI | Tool、Native、Prompted 三种输出方式；输出与工具有结束策略 | 用能力矩阵选择协议，并把最终结果视为独立阶段 | 默认执行/结束策略不能替换 Wememo 的整批校验和 delivered 边界 |
| Instructor | 类型校验、错误反馈、失败尝试记录；区分验证重试与 SDK 请求重试 | 每次尝试有记录，重试层次和成本可核算 | 不能把多次修正后的结果当成模型首次合规 |
| Vercel AI SDK | Schema 输出与校验接口；保留解析失败原因、响应元信息和 usage | 面向 TypeScript 的错误分类与观测设计 | 通用错误对象可能含原文，不能整包写日志；默认请求重试须核对 |
| BAML | Schema-Aligned Parsing 主动转换不规范输出以匹配目标形状 | 借鉴类型定义、提示词与测试样例的协同管理 | 主动转换与本阶段“严格拒绝、无静默修复”目标不同 |
| json_repair | 启发式补括号、引号等语法修复 | 帮助理解常见格式故障类型 | 修好 JSON 无法证明字段或引用正确；本阶段不接入 |
| XGrammar | 在推理引擎解码时施加语法约束 | 理解原生约束生成为何比提示词更强 | 需要接入模型推理过程；无法给远程 DeepSeek API 在客户端直接加 token 约束 |

机制来源分别为：[LangChain](https://docs.langchain.com/oss/python/langchain/structured-output)、[Pydantic AI](https://pydantic.dev/docs/ai/core-concepts/output/)、[Instructor](https://python.useinstructor.com/concepts/retrying/)、[AI SDK](https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data)、[BAML](https://docs.boundaryml.com/guide/introduction/why-baml)、[json_repair](https://github.com/mangiucugna/json_repair)、[XGrammar](https://github.com/mlc-ai/xgrammar)。最后两列是结合本项目约束作出的判断，并非这些项目对 Wememo 的建议。

### 5.2 “库调用成功”需要继续追到实际协议

查阅 LangChain 的 `ChatDeepSeek.with_structured_output()` 实现，可以看到 `method == "json_schema"` 被转换为 `function_calling`；strict 开启且使用默认地址时，切换到 Beta 端点。这说明**库级参数名称不一定等于线上请求的约束机制**。测试记录应保存实际 endpoint 类型、输出模式、Schema 版本，而不是只写“使用 structured output”。[ChatDeepSeek 源码](https://github.com/langchain-ai/langchain/blob/master/libs/partners/deepseek/langchain_deepseek/chat_models.py)

Instructor 的 DeepSeek 集成页推荐 Tools 模式；这也是把结构作为工具参数传递的路线，不能把它等同于最终文本天然遵循 Schema。[DeepSeek 集成说明](https://python.useinstructor.com/integrations/deepseek/)

对 Wememo 而言，“输出工具”可作为后备研究方案，但它必须是终结结果的协议形式，而不是第三个读取工具。若采用，最终提交与读取提案同批出现、没有交付证据却提交、提交后是否允许再执行工具，都需有明确规则。当前 G1/G2 契约未设计这条路径，不应由 Adapter 偷偷插入调用或自行执行业务工具。

### 5.3 框架默认行为可能让通过率看起来更高

LangChain 文档中的 ToolStrategy 默认 `handle_errors=True`，会把结构错误反馈给模型；可显式关闭。Instructor 则区分外层验证尝试与底层 SDK 的传输重试，这两层不能只用一个“请求数”概括。[LangChain 错误策略](https://docs.langchain.com/oss/python/langchain/structured-output)、[Instructor 重试语义](https://python.useinstructor.com/concepts/retrying/)

AI SDK 的请求重试默认值为 2，可设为 0；这与“输出字段错误是否自动纠正”仍是不同问题。未来若引入 SDK，实验必须核对实际失败类型对应的重试行为，不能只看 Runner 的模型计数。[AI SDK 设置](https://ai-sdk.dev/docs/ai-sdk-core/settings)

另一个直接相关的差别是校验宽松度：Pydantic 默认会尝试类型转换，额外字段默认忽略，严格使用时要分别配置。若某个教程把带有多余 confidence 的 alternative 接收后丢弃该字段，它的“成功”就不能与 Wememo 当前 exact-key 验收直接比较。[严格模式](https://pydantic.dev/docs/validation/latest/concepts/strict_mode/)、[额外字段配置](https://pydantic.dev/docs/validation/latest/api/pydantic/config/)

### 5.4 三个社区案例的实际教训

| 公开案例 | 可以确认的现象 | 应怎样用于本次研究 |
|---|---|---|
| DeepSeek-V3 #302，2025 年讨论 | 用户遇到 Chat 接口拒绝 `json_schema`，有人改用 `json_mode` | 区分“消除不支持参数错误”和“严格满足应用 Schema”；不能用旧帖否定今天另一个端点的新能力 |
| Vercel AI #7913，2025 年错误记录 | 请求已改成 `json_object`，但消息未包含 JSON 要求，服务端返回 400 | 兼容适配需覆盖完整协议要求，不能只替换一个字段；本项目 Prompt 已包含 JSON 要求，因此不是同一个已证实根因 |
| Pydantic AI #3384，2025-11-10 | 问题报告指出同一模型在不同服务商端点的 Schema 能力可能不同 | 能力探针应绑定 provider、endpoint、model 和版本组合，不能只按模型名决定 |

原始资料：[DeepSeek #302](https://github.com/deepseek-ai/DeepSeek-V3/issues/302)、[Vercel AI #7913](https://github.com/vercel/ai/issues/7913)、[Pydantic AI #3384](https://github.com/pydantic/pydantic-ai/issues/3384)。这些是带上下文的问题记录，不是对当前所有版本的统一结论；本文没有把评论中的主观成功率作为实验依据。

## 6. 针对 Wememo 的改进设计

### 6.1 第一优先：让失败能够被解释

现在的诊断缺口是：结构错误合并为 `invalid-output`，引用错误合并为 `invalid-citation`；Agent trace 没有保留安全的细分原因。观察性应增强，接受规则应保持一致。

建议新增一层固定枚举诊断，不直接保存异常对象或模型原文：

| 阶段 | 建议的细分代码示例 | 可记录信息 |
|---|---|---|
| Provider 协议 | `empty-content`、`incomplete-output`、`unexpected-response` | 状态枚举、结束原因枚举、响应字节数、耗时 |
| JSON 解析 | `json-syntax` | 解析阶段；不保存含原文片段的异常 message |
| 字段结构 | `missing-key`、`extra-key`、`wrong-type`、`invalid-enum`、`empty-value`、`duplicate-item-id`、`duplicate-citation` | 白名单字段路径、数组索引、缺失的已知字段名、多余字段数量 |
| 引用范围 | `alias-not-allowed`，有本地状态时再分 `not-delivered` / `unknown-alias` | 引用位置、交付数量；不记录非法 alias 原值 |
| 引用方向 | `finding-missing-support`、`alternative-uses-support` | 条目索引、各方向计数 |
| 本地不变量 | `binding-invariant-failed` | 固定代码；与模型引用错误分开归因 |

未知字段名也可能被模型写成聊天正文，因此只记录数量，不把任意 key 原文加入日志。`runId` 必须继续独立随机生成；不保存 scope、canonical ID、原文 excerpt、认证头或 Provider 原始响应。

还应增加 `finalTurn`、实际输出模式、Schema/Prompt/Policy 哈希、请求与返回模型标识、token usage 是否可得、每个阶段是否执行。未执行的检查继续用 `null`，失败率保留各自分母。

当前冻结代码没有结构化细分属性，不能靠匹配任意错误 message 长期维持诊断。下一轮应先设计最小的版本化诊断扩展，通过测试证明同一输入在扩展前后的 accept/reject 判定完全一致，再用于新评估。

### 6.2 第二优先：把输出契约真正传给支持它的服务端

建议第一版候选使用**静态字段 Schema**，对应现有 v1 输出，不改变现有字段名称或本地校验：

- 所有对象显式列出 required，并禁止额外字段。
- version、confidence 使用封闭取值。
- 区分 finding 的 `claim/confidence` 与 alternative 的 `explanation`。
- 保留 `findings: []` 和 `alternativeExplanations: []`。
- 非空字符串、引用唯一性和条目 ID 唯一性等约束，无论服务端支持到哪一步，本地继续执行。

这一阶段只检验“生成时知道并受到字段约束”是否降低结构失败。不要同时更换模型、改 alias、缩减 Evidence 或放宽 validator，否则难以归因。

类型、Prompt 示例和 provider Schema 的一致性也要检查。未来若建立单一契约来源，仍需做差分测试，避免 Schema 转换器丢掉 `additionalProperties`、非空或方向语义。代码中的 TypeScript interface 本身不会自动变成请求里的约束。

### 6.3 第三优先：用实际交付集合约束 citation 选择

当服务端能稳定执行字段 Schema 后，再研究动态枚举：

```text
Direct QA：已选中并放入 Prompt 的 alias → 可引用集合
Agent：read_evidence 成功交付的 alias → deliveredIds → 可引用集合

可引用集合 + 本地方向信息
            ↓
最终输出 Schema / 最终阶段提示
            ↓
严格解析 → 本地引用校验 → canonical ID 恢复
```

Agent 初始目录不能用作最终引用 enum，否则会重新允许未读取引用。对于 alternative，可以用“已交付 counter/context”作为候选集合；finding 的全部引用候选可来自已交付证据，但仍须至少含 support。

“至少含一个 support”在完整 JSON Schema 中可以表达为更复杂的数组约束，但具体 Provider 是否支持必须探测；不要假定其支持 `contains`、`minContains` 或所有组合关键词。只用 `items.enum` 也不能表达这条规则，最终仍由本地验证。

空集合尤其需要设计：没有 support 时应允许空 findings，而不是生成一个带假引用的 finding。不要发送一个未经兼容验证的空 enum，然后通过补假 alias 来让请求被接受。可以使用经过验证的空数组分支，或对这一分支退回明确提示加原有本地拒绝；记录实际模式。

这需要受信任的运行状态生成 provider-neutral 约束元数据。**当前冻结端口没有这个完整扩展，不应让 Provider 从自由文本里猜测 deliveredIds，也不应把 canonical binding 传给 Provider。** 动态引用约束属于后续明确审查的契约扩展，不能伪装成 G3 的无状态协议翻译。

### 6.4 Agent 最终回答阶段要有一致的约束

当前早期 final 缺少 JSON 模式，可以先做“工具自动选择阶段同时启用 JSON 模式是否兼容”的独立探针，不能直接假设 API 组合行为。对原生 Schema 路径，也应验证工具提案与结构化最终回答的组合，而不是只验证无工具的最小例子。

如果选择独立的最终格式化阶段，它必须占用现有最多 3 次模型调用中的一次。取证之后不能隐藏追加第 4 次“格式修复”调用，也不能在最后一轮继续执行读取工具。早期 final 如何处理应作为明确策略版本记录，不能由 Adapter 暗中重问。

### 6.5 当前不优先采取的措施

| 措施 | 暂不优先的原因 |
|---|---|
| 自动删多余字段、补 id、替换字段名 | 把失败转换成成功，改变本轮严格输出的定义 |
| 自动补引用或替换成最近似 alias | 引用是权限和证据关系，不能由字符串相似度补全 |
| json_repair / SAP 直接接入生产链路 | 改善可解析性不等于原始输出合规，且与已确定的阶段边界冲突 |
| 无上限或隐藏重试 | 掩盖首次失败，突破预算，增加延迟与调用成本 |
| 同时降低温度、换模型、改 Prompt、缩短 alias | 改动混杂，无法判断哪项有效；温度变化也不能替代契约约束 |
| 因 alias 太长就直接更换格式 | 长随机 alias 的复制负担是待测假说；Direct 的短 alias 也有大量引用失败，不能认定长度是主因 |
| 先把整个项目迁到 LangChain/Pydantic AI | 当前缺的是协议约束和可观测性证据，不是再建一套 Runner |

如果未来另行研究“校验后有界反馈”，应作为独立实验臂，保留首次通过率、修正后通过率和全部调用成本。它不属于当前建议默认启用的行为。

## 7. 可执行的下一轮实验方案

### 阶段 A：离线诊断与契约验证

建立小型合成响应集，覆盖：缺 alternative.id、多 confidence、错 explanation 名称、无效 JSON、未知 alias、未交付 alias、跨 run alias、方向误用、空 findings 合法、无 support 却制造 finding、截断响应、取消后迟到响应。

每个案例同时断言：接受或拒绝的结论与旧基线一致；新的固定子错误准确；日志没有正文、身份字段、canonical ID；未通过结果仍不展示。这一步不需要真实模型。

### 阶段 B：服务端能力探针

使用当前 `deepseek-flash` 和完全合成的短输入，先做以下 8 类探针，每类最多分配 3 次模型请求，总上限 24 次。单次工具闭环可能消耗 2–3 次请求，必须逐次计入，不能把一次闭环记成一次请求。无工具项目的重复用于测量稳定性，不是失败后补救；预先固定每类计划，不因结果成功选择性停止，也不自动扩大预算。

| 探针 | 要验证的能力 | 负向或边界输入 |
|---|---|---|
| 基础 Schema | required、类型、额外字段禁用 | 消息要求增加 Schema 外字段 |
| 嵌套结构 | alternative 与 finding 不同 key 集合 | 消息要求 alternative 带 confidence |
| 封闭枚举 | version、confidence、少量合成 alias | 消息要求输出 enum 外值 |
| 空数组 | 无可用 support 时 findings 为空 | 只有 context 的合成材料 |
| 非空与唯一性 | 支持哪些 Schema 关键词 | 空字符串、重复引用诱导 |
| 工具与最终输出组合 | 工具提案、结果回传、Schema final | tool_choice auto 与 none 两种阶段 |
| 不支持 Schema | 服务端拒绝还是忽略 | 单独测试未承诺关键词，不批量混入 |
| 输出终止 | 不完整输出的协议表现 | 很小的输出上限，核实本地拒绝 |

最小 Schema 通过后再逐步增加约束。记录请求是否被接受、返回对象是否通过独立本地检查、实际终止原因，而不是把 HTTP 200 当作全部通过。若基础能力持续不成立，停止后续正式评估并报告具体不兼容项；保留 Chat 路径基线。

### 阶段 C：先比较 Direct 的输出机制

沿用 15 个问题和固定快照，每题每臂 3 次独立运行，共 90 次请求：

| 实验臂 | 唯一主要变量 | 不变项 |
|---|---|---|
| C0 | 当前 Chat JSON 模式 | 同模型、同问题、同 Evidence、同 Prompt 内容、相同非思考设置和输出上限、无重试、原 validator |
| C1 | 候选 Responses 原生字段 Schema | 尽量保持与 C0 一致，显式记录无法等价映射的参数 |

这仍是端点加输出机制的组合比较，不能宣称只测量了某个解码算法。请求顺序在题目与重复块内随机安排，保留所有失败；记录真实 token usage、模型标识、配置与源码哈希。服务端若不支持 seed，不声称完全可复现。

样本只能提供初步信号。报告分题配对结果和不确定范围，不把同一问题的多次采样当成新增独立问题。通过率的分母必须与当前报告定义一致，并额外拆开语法通过率和字段通过率。

### 阶段 D：再验证 Agent，不同时改变取证策略

只有 C 阶段表明候选输出机制有明确收益，才进入 Agent 协议闭环。保留 metadata-only catalog、read_metrics/read_evidence、单 run binding、deliveredIds、整批预检、3 次模型/4 次工具、最后一轮禁止工具、取消和超时。

先比较当前 Agent 与“同一取证策略 + 新最终输出机制”，再单独比较动态 alias 约束；后者不能与前者合并为一个实验臂。每轮记录 final 发生位置、交付数量、所用模式和错误子类型。对应测试须证明新机制没有绕过目录未交付引用和方向检查。

此阶段的模型请求上限应在运行前按“题目 × 重复 × 实验臂 × 每 run 最多 3 次调用”计算，不沿用 Direct 的请求数预算。本文没有执行这些付费实验。

### 阶段 E：质量与成本比较

在结构和引用通过的答案上做盲评，检查是否回答了问题、每个重要说法是否被所引证据支持、是否承认替代解释与不确定性、是否越过心理推断边界。失败答案在整体可用性中仍计为不可交付，不能仅报告成功样本的质量。

同时统计空 findings 比例与“应有依据却过度回避”的比例，避免模型通过永远输出空数组获得看似完美的引用通过率。越界题因结构失败而被挡住，不算作一次正确语义拒答。

成本应报告输入/输出 token、可得时的缓存用量、P50/P95 延迟及每个有效回答的总体开销。模型调用次数是开销线索，不能替代实际账单。只有质量与可用性接近时，才优先选择成本更低的 Direct QA。

## 8. 下一步最小实施包与验收建议

推荐下一任务限定为 **“Structured Output Diagnostics + DeepSeek Schema Capability Probe”**：只增加安全诊断、离线回归样本和独立能力探针；通过后另行接入候选 Provider。保留现有 UI 状态与运行链路作为对照。

建议验收标准：

- 原有合法/非法样本的接受判定不变；所有日志脱敏断言通过。
- 能准确区分语法、字段、引用范围、引用方向和本地 binding 错误。
- 探针记录端点、模型、Schema、实际请求模式、完整次数、每次结果和不支持约束；没有静默降级。
- 原生约束候选只有在基础及嵌套结构探针表现一致后进入问题集比较。
- 新方案不依靠删字段、补引用、隐藏重试或扩大预算获得提升。
- “更适合继续试验”与“已达到稳定可用”分别作出判断；不能用一次 PASS 作为稳定性验收。

目前没有证据支持承诺某个方案能把 Wememo 提升到特定成功率。能够明确承诺的是下一轮会把失败定位到可解释的层次，并以保持原边界的实验判断哪项改进有效。

## 9. 仍然未知的事项

1. 历史每个 `invalid-output` 是语法错误、缺字段、多字段还是其他值检查失败；原始失败对象没有保留。
2. 历史每个 `invalid-citation` 是范围错误、方向错误还是本地 binding 异常；当前报告没有安全子原因。
3. 当前账号与模型对 Responses Schema 各关键词及工具组合的实际支持程度。
4. 长 alias、问题类别、输出长度和分类负担分别贡献了多少失败；需要分离变量。
5. Schema 与引用都通过的结果是否足够有用、是否忠实于证据；已有报告明确没有进行语义评分。

这些未知项不能靠猜测填满，也不需要以保留真实聊天或密钥来解决。合成失败集、脱敏结构诊断与受控重复实验足以推进当前阶段。

## 10. 资料索引与复核入口

以下网页均于 2026-09-14 查阅。动态文档和 `main/master` 分支可能变化，实施时应再核对采用的依赖版本与协议快照；公开问题的年份仅指该问题记录的历史上下文。

### 本地一手依据

- [固定评估报告](/Users/lbld/Documents/ChatGPT/Wememo/docs/evaluation/reports/2026-09-13-live.json)：30 条记录、问题集、源文件哈希、统计分母。
- [桌面单次记录](/Users/lbld/Documents/ChatGPT/Wememo/docs/evaluation/reports/2026-09-13-gui-smoke.json)：独立 GUI 调用及拒绝展示结果。
- [评估方法](/Users/lbld/Documents/ChatGPT/Wememo/docs/evaluation/README.md)：两条路径、固定快照、首次尝试与隐私范围。
- [Direct Provider](/Users/lbld/Documents/ChatGPT/Wememo/src/main/providers/deepseek-provider.ts:36)：JSON 模式与请求设置。
- [Tool Calling Provider](/Users/lbld/Documents/ChatGPT/Wememo/src/main/providers/deepseek-tool-calling-provider.ts:37)：最后一轮才开启 JSON 模式。
- [Agent Prompt](/Users/lbld/Documents/ChatGPT/Wememo/src/main/evidence-agent/agent-prompt.ts:6)：精确结构、引用方向与空 findings。
- [Runner](/Users/lbld/Documents/ChatGPT/Wememo/src/main/evidence-agent/bounded-agent-runner.ts:76)：每轮请求、交付与最终校验顺序。
- [结构校验器](/Users/lbld/Documents/ChatGPT/Wememo/src/shared/interaction-reasoning-validation.ts:15)：精确字段集合与拒绝条件。
- [引用校验器](/Users/lbld/Documents/ChatGPT/Wememo/src/main/reasoning/evidence-citation-validator.ts:14)：范围、binding、方向与语义边界。

### 官方与开源一手资料

| 编号 | 资料 | 用途 |
|---|---|---|
| S1 | [DeepSeek Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion) | 当前 Chat 输出格式与截断协议 |
| S2 | [DeepSeek JSON Output](https://api-docs.deepseek.com/guides/json_mode/) | JSON 模式使用条件 |
| S3 | [DeepSeek Tool Calls](https://api-docs.deepseek.com/guides/tool_calls/) | Beta strict 与 Schema 子集 |
| S4 | [DeepSeek Responses 参考](https://api-docs.deepseek.com/api/create-response/) | 原生 Schema 文本输出候选 |
| S5 | [DeepSeek Responses 指南](https://api-docs.deepseek.com/guides/responses_api/) | 兼容性、无状态历史与参数限制 |
| S6 | [LangChain Structured Output](https://docs.langchain.com/oss/python/langchain/structured-output) | Provider/Tool 策略及错误反馈 |
| S7 | [LangChain ChatDeepSeek 源码](https://github.com/langchain-ai/langchain/blob/master/libs/partners/deepseek/langchain_deepseek/chat_models.py) | 库方法向实际协议的转换 |
| S8 | [Pydantic AI Output](https://pydantic.dev/docs/ai/core-concepts/output/) | 三种输出机制与最终结果阶段 |
| S9 | [Pydantic Strict Mode](https://pydantic.dev/docs/validation/latest/concepts/strict_mode/) | 类型转换与严格校验区别 |
| S10 | [Pydantic Configuration](https://pydantic.dev/docs/validation/latest/api/pydantic/config/) | 默认忽略额外字段与 forbid 配置 |
| S11 | [Instructor DeepSeek](https://python.useinstructor.com/integrations/deepseek/) | 工具方式结构化提取 |
| S12 | [Instructor Retrying](https://python.useinstructor.com/concepts/retrying/) | 验证尝试与 SDK 请求层次 |
| S13 | [AI SDK Structured Data](https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data) | 结构校验错误与 usage 元数据 |
| S14 | [AI SDK Settings](https://ai-sdk.dev/docs/ai-sdk-core/settings) | 默认请求重试与取消参数 |
| S15 | [BAML Why BAML](https://docs.boundaryml.com/guide/introduction/why-baml) | SAP 主动转换机制，不采用其宣传性效果数字 |
| S16 | [json_repair](https://github.com/mangiucugna/json_repair) | 启发式 JSON 修复及范围 |
| S17 | [XGrammar](https://github.com/mlc-ai/xgrammar) | 解码约束生成及推理引擎接入 |
| S18 | [DeepSeek-V3 #302](https://github.com/deepseek-ai/DeepSeek-V3/issues/302) | 2025 年 Chat Schema 兼容问题 |
| S19 | [Vercel AI #7913](https://github.com/vercel/ai/issues/7913) | 2025 年 JSON 模式消息要求遗漏 |
| S20 | [Pydantic AI #3384](https://github.com/pydantic/pydantic-ai/issues/3384) | 模型能力与服务端点能力的区别 |

资料处理原则：官方文档用于当前协议声明，源码用于框架实际行为，问题记录用于理解具体故障；本文没有用社区评论推定普遍成功率，也没有把文档声明当作已经在 Wememo 上通过的真实测试。
