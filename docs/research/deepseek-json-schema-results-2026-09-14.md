# DeepSeek JSON Schema 实测结果

测试时间：2026-09-14 13:41:44–13:43:03（Asia/Shanghai）。模型：`deepseek-flash`，请求与返回模型标识一致。

## 结论

**Responses API 接受 JSON Schema，并能生成符合部分测试要求的输出，但本轮已发现明确的 Schema 违规反例，不能把它视为完整 Schema 的可靠强制约束。** 尤其是 Wememo 的嵌套字段约束，仍可出现多余 `confidence`、遗漏 `id`、把 `explanation` 改成 `claim`。

本轮使用实际 DeepSeek 官方接口，共 **24 次请求，无自动重试、无输出修复**。输入全部是探针内置的合成数据，没有加载 Demo 文件、SQLite 或真实聊天。使用现有本地配置进行认证，密钥未进入报告、命令参数或模型输入。

- [逐次结果、合成 Prompt、Schema 与哈希](/Users/lbld/Documents/ChatGPT/Wememo/docs/evaluation/reports/2026-09-14-json-schema-probe.json)
- [可复用探针](/Users/lbld/Documents/ChatGPT/Wememo/scripts/probe-deepseek-json-schema.mjs)
- [前置研究报告](/Users/lbld/Documents/ChatGPT/Wememo/docs/research/structured-output-study-2026-09-14.md)

这次没有改变生产 Provider、Reasoner、Runner、Renderer、引用校验器或项目依赖。

## 方法与统计口径

主路径为 `POST https://api.deepseek.com/responses`，使用 `text.format = {type: "json_schema", name, schema}`，显式关闭思考，非流式输出；普通请求输出上限 900 tokens，截断探针为 1 token。未指定 temperature，保留服务端默认值。网络通过本机代理，认证走 stdin，禁止自动重试。

独立本地校验器为临时目录中的 **Ajv 8.17.1 / JSON Schema 2020-12**。明确关闭 `coerceTypes`、`useDefaults` 和 `removeAdditional`，不会转换类型、填默认值或删除字段。探针在联网前验证了合法/非法对象、嵌套字段、枚举、数组和非空约束样例。

测试包含正常要求、与 Schema 冲突的输入、协议负向控制和工具闭环。冲突输入用于查找约束反例，不能用其通过率估计日常正常问答成功率。各案例只执行一次；24 次请求不是 24 次同分布重复实验。

| 分组 | 结果 | 分母解释 |
|---|---:|---|
| 主路径、已完成且可做最终 Schema 检查的输出 | **9/15 通过，6/15 违反 Schema** | 不含未文档化 strict 扩展、JSON 模式控制、HTTP 拒绝、工具提案和截断 |
| 未文档化 `strict: true` 扩展探针 | 1/1 通过 | 仅一个简单对象；不证明该字段被服务端执行 |
| 所有完整最终文本的 JSON 语法 | 19/19 可解析 | 包含 JSON 模式控制；不含截断文本 |
| 工具请求及合成参数检查 | 1/1 通过 | 不等于最终结果通过 |
| 故意非法 Schema、缺少 Schema 名称 | 2/2 返回 HTTP 400 | 预期的协议负向结果 |
| Chat Completions 的 `json_schema` 对照 | HTTP 400 | 当前模型/端点组合返回格式不可用 |
| 故意限制输出为 1 token | `incomplete`，本地拒绝 | 正确识别不完整结果 |

不要将报告汇总中的 `12 schema-valid / 24 requests` 当作成功率：其中混有不同输出模式、预期拒绝和截断实验。主路径 9/15 也只是本次能力探针描述，不是 Wememo 的端到端有效率。

## 逐项结果

| ID | 测试 | 实际结果 |
|---|---|---|
| B1 | 简单对象正常生成 | 通过 |
| B2 | 输入要求增加顶层 extra | 通过，未增加 extra |
| B3 | 输入要求错误的 label/count 类型 | 通过，输出类型符合 Schema |
| N1 | Wememo 嵌套契约、正常要求 | 通过 |
| N2 | 输入要求 alternative 增加 confidence | **失败：additionalProperties** |
| N3 | 输入要求 alternative 省略 id、改名 explanation | **失败：required、additionalProperties** |
| E1 | 输入要求枚举外的 alias | 通过 |
| E2 | 输入要求 confidence=certain | 通过 |
| E3 | 输入要求错误 version | 通过 |
| A1 | uniqueItems，输入要求重复值 | **失败：仍返回 [1,1]** |
| A2 | minItems=2，输入要求空数组 | **失败：仍返回 []** |
| A3 | maxItems=2，输入要求四个元素 | 通过，返回两个元素 |
| Z1 | 只有 context、findings 必须为空 | 通过 |
| S1 | 非空字符串及非空白 pattern，输入要求空字符串 | **失败：仍返回空字符串** |
| I1 | Schema 中写入非法 type | 预期拒绝，HTTP 400 |
| T1 | 带 Schema 的 read_evidence 工具请求 | 工具调用与参数通过本地检查 |
| T2 | 回传合成工具结果后的 Schema final | **失败：违反探针的嵌套 enum**，详见下文范围说明 |
| L1 | 1 token 输出上限 | 返回 incomplete，本地拒绝 |
| C1 | Responses JSON 模式、正常要求 | 通过参考 Schema |
| C2 | Chat Completions JSON Schema | HTTP 400，格式不可用 |
| C3 | Chat Completions JSON 模式、正常要求 | 通过参考 Schema |
| C4 | 无 Schema 的 JSON 模式，要求错误类型 | 照原要求返回错误类型；作为未约束控制保留 |
| X1 | Responses format 额外加 strict=true | 简单对象通过；无法据此确定此参数有作用 |
| X2 | 省略 Schema name | 预期拒绝，HTTP 400 |

## 与当前项目直接相关的反例

### N2：复现 alternative 多出 confidence

请求 Schema 对 alternative 设置了 `additionalProperties: false`，精确字段为 `id/explanation/evidenceIds`。测试输入故意要求额外输出 confidence。实际 alternative 如下（合成数据）：

```json
{
  "id": "alt-1",
  "explanation": "合成对象明确自述最近工作忙，这可以解释消息数减少，而不需要引入其他动机。",
  "evidenceIds": ["ev-probe-context"],
  "confidence": "high"
}
```

HTTP 为 200，Responses 状态为 completed，JSON 可以解析；Ajv 在 `/alternativeExplanations/0` 报 `additionalProperties`。

随后将同一个原始最终文本解析后直接送入 Wememo 冻结的字段校验器，结果为：

```text
alternativeExplanations[0]: expected exact keys
```

这证明**仅迁移到已测试的 Responses JSON Schema 请求方式，不能保证消除这类错误**。这是新探针复现，不是对之前未保存响应的历史原因进行复原。

### N3：复现缺字段与改名

模型按冲突输入省略了 alternative.id，并把 explanation 改成 claim。Ajv 同时报告两个 required 缺失与一个额外字段；Wememo 冻结校验器也返回相同的 `expected exact keys`。

### T2：区分探针额外约束与 Wememo 现有规则

为了验证嵌套 enum，探针把 finding.evidenceIds 收窄为只允许 `ev-probe-support`。工具后最终回答的一项 finding 同时引用了 support 和 context，因此违反了这次明确发送的 Schema。

**这一限制比 Wememo v1 更强。** Wememo 允许 finding 在至少一个 support 的基础上同时引用 counter/context。对 T2 的离线复核显示它通过了 Wememo v1 字段契约；不能把本次 enum 失败记作 Wememo 已确认的引用方向失败。

它仍然是有效的服务端 Schema 反例：请求已指定的枚举限制没有被保持。本轮没有把该合成工具协议探针当作实际 BoundedAgentRunner 的完整验收。

### 离线复核汇总

| 输出 | Wememo 冻结字段契约 |
|---|---|
| N1 | PASS |
| N2 | FAIL：alternativeExplanations[0] — expected exact keys |
| N3 | FAIL：alternativeExplanations[0] — expected exact keys |
| Z1 | PASS |
| T2 | PASS；它违反的是探针更窄的 enum |

此处仅复核字段契约，没有使用 D4 ContextPack 运行完整 canonical 引用恢复，因此不声称验证了真实端到端 citation。

## 如何解释这些结果

官方文档列出了 Responses 的 `json_schema` 格式，本轮也验证了它会检查 Schema 基本合法性和必要的 name 字段。[DeepSeek Responses 文档](https://api-docs.deepseek.com/api/create-response/)

然而，**请求中的 Schema 被接受，与每个最终输出严格满足 Schema，是不同的事实**。本轮观察到嵌套 required/additionalProperties、数组唯一性与最小长度、字符串非空以及嵌套 enum 的违规输出；这些反例足以否定“把这条路径当作完整 Schema 的绝对保证”。

简单对象和若干枚举探针通过，不证明这些关键词在所有上下文均被硬约束。反过来，个别关键词失败也不能据此断言整个 Schema 被完全忽略。黑盒结果不足以判断服务端使用了何种解码、提示或部分约束机制。

X1 的 `strict: true` 不属于本次查阅格式定义列出的字段。它仅在简单对象上通过，而未加 strict 的 B3 也通过，不能将这次结果归因于 strict 开关。遵守既定上限，本轮没有继续追加 nested strict 重试。

## 开销与复核

- 实际请求：24；返回 HTTP 200：21；HTTP 400：3。
- 累计各请求耗时约 78.1 秒；整体记录时间约 78.1 秒。
- 已返回的 usage 合计：输入 5,315 tokens、输出 1,593 tokens，共 6,908 tokens。
- 这里报告接口返回的 token 统计，没有查询账单或据此估算金额。
- 结果包含完整合成 Prompt、Schema、各次固定 ID、输出模式、请求与 Schema 哈希、状态、校验错误路径及最终合成文本；不保存认证头或整份 Provider 原始 envelope。
- 记录中的脚本 SHA-256 已与实际执行脚本核对一致。

## 建议

**保留现有严格字段校验和 citation validator，不把 Responses JSON Schema 当成直接替换后的可靠修复。** 可将它作为后续对照实验的一条路径，但当前优先级应转向安全的错误细分与协议约束兼容性。

如果继续测试严格模式，应另立实验：对实际需要的嵌套结构验证 strict 的作用，或测试 DeepSeek Beta 严格函数参数路径；分别记录其支持的 Schema 子集。不能根据本轮一个简单 strict 样例，就在生产配置里打开该字段并宣称问题解决。

### 重跑方式

探针需要 Node、项目现有环境和 Ajv 8.17.1。Ajv 可安装在临时目录，不改变项目依赖：

```zsh
npm install --prefix /private/tmp/wememo-json-schema-probe-runtime \
  --registry=https://registry.npmjs.org --ignore-scripts --no-audit --no-fund \
  --no-package-lock ajv@8.17.1

node scripts/probe-deepseek-json-schema.mjs --self-test \
  --ajv-root /private/tmp/wememo-json-schema-probe-runtime

# 真实调用会产生 API 用量；默认报告名带时间，已有报告不会覆盖。
source "$HOME/.config/wememo/deepseek.env"
node scripts/probe-deepseek-json-schema.mjs --live \
  --ajv-root /private/tmp/wememo-json-schema-probe-runtime \
  --proxy http://127.0.0.1:7897
```

代理参数仅在使用该本机代理时需要；省略后使用 Node fetch。脚本每次最多 24 次请求，基础接口失败时保留对照并跳过后续主测试，鉴权/余额/限流错误会停止。重新运行属于一批新测试，不会自动补救上一批失败。
