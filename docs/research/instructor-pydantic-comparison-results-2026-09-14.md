# Instructor + Pydantic 独立对照实验

实验时间：2026-09-14，北京时间 14:57:25–14:59:24。模型请求及响应均为 `deepseek-flash`。共 36 次真实请求，全部使用脚本内的合成证据。

**本批 Instructor JSON 模式稍好，但没有解决结构与引用问题，也不足以证明稳定改善。** 它最终通过 5/12，直接 Responses Schema 为 3/12，Instructor 工具输出为 2/12。Wememo 原有 TypeScript 校验器对全部 36 个输出的判断与实验一致。当前没有引入 Python 运行服务，也没有修改生产 Prompt、Provider、Runner 或校验器。

## 实验结果

| 指标 | 直接 Responses Schema | Instructor JSON | Instructor TOOLS |
|---|---:|---:|---:|
| Provider HTTP 200 / 请求数 | 12/12 | 12/12 | 12/12 |
| 严格 JSON 语法通过 / 全部运行 | 12/12 | 12/12 | 11/12 |
| Schema 与 Pydantic 字段检查均通过 / 全部运行 | 8/12 | 9/12 | 8/12 |
| 引用通过 / 实际执行引用检查 | 3/8 | 5/9 | 2/8 |
| 最终有效 / 全部运行 | **3/12（25.0%）** | **5/12（41.7%）** | **2/12（16.7%）** |
| JSON 语法失败 | 0 | 0 | 1 |
| 字段结构失败 | 4 | 3 | 3 |
| 引用失败 | 5 | 4 | 6 |

结构失败时不执行引用检查；未检查的引用记为 `null`，不记作引用失败。最终有效要求协议完整、原始文本能严格解析、字段和引用检查通过；Instructor 两组还要求 SDK 成功返回对象。这里的“有效”不包含自然语言结论的正确性或回答质量评分。

Instructor JSON 比直接 Schema 多通过 2 次，字段结构只多通过 1 次。不能把两个最终通过结果的差异全部解释为 Schema 改善。两组 Instructor 成功解析的对象分别有 9 个和 8 个，其中仍有 4 个和 6 个被引用校验拒绝。

## 对照条件

六个固定场景，各重复两次，每次运行三条路径。顺序轮换，顺序执行；没有挑选成功样本，没有修复输出，也没有失败后的补跑。

| 路径 | 实际请求组织方式 |
|---|---|
| 直接 Responses Schema | `/responses`，把 Pydantic 生成的 Schema 放入 `text.format.schema`，类型为 `json_schema` |
| Instructor JSON | `/chat/completions`，`Mode.JSON`；开启 `response_format: {type: "json_object"}`，由库在 system 消息中追加 Schema 与格式说明 |
| Instructor TOOLS | `/chat/completions`，`Mode.TOOLS`；把 Schema 放入单一输出函数 `RelationshipAnalysis` 的参数，并强制选择该函数 |

三组使用相同基础 system 指令、相同场景输入、相同模型、关闭思考、非流式输出、输出上限 1200 tokens，均未显式设置 temperature。Instructor 增加的格式说明及 Schema 放置位置是本次观察变量。不同接口与输出模式也会产生影响，因此结果不能单独归因于 Pydantic 或某一段提示词。

TOOLS 是一次性提交最终结构的函数，不是 Wememo 的 `read_metrics` / `read_evidence`，本实验不执行 Agent 工具循环。实际请求中的 `function.strict` 未设置；Pydantic/Instructor 的本地 `strict=True` 不等于 DeepSeek 服务端 Beta strict tool 模式。本轮未测试后者。[Instructor DeepSeek 集成说明](https://python.useinstructor.com/integrations/deepseek/)

版本固定为 Python 3.12.14、Instructor 1.17.0、Pydantic 2.13.5、OpenAI 兼容 SDK 3.3.0、jsonschema 4.26.0。环境位于 `/private/tmp/wememo-instructor-probe-venv`，完整依赖另存锁定文件；桌面项目依赖未因本实验增加 Python 包。

## 相同契约与严格配置

三个路径共用一个 `RelationshipAnalysis.model_json_schema()`，保留 Wememo v1 的精确字段：

```text
version: "wememo-interaction-reasoning-v1"
summary: 非空白字符串
findings: [{ id, claim, evidenceIds, confidence }]
alternativeExplanations: [{ id, explanation, evidenceIds }]
uncertainties: 非空的非空白字符串数组
```

- 所有对象 `extra="forbid"`，对应 `additionalProperties: false`；字段全部必填，无补缺省值。
- `strict=True`，不做类型转换；字符串检查失败即拒绝，不裁剪后接受。
- 每项引用至少一个、不得重复；同类 finding / alternative 的 `id` 不得重复。
- 允许 `findings: []` 和 `alternativeExplanations: []`。
- finding 至少引用一个 support，也允许同时引用 context；alternative 只能引用 counter/context。
- 所有引用必须属于本次交付集合。

重复 item id 与动态引用规则由本地验证器处理，Pydantic 自定义验证逻辑不会自动全部转成 JSON Schema。三组最终都经过同一套完整检查，不以 Schema 单独通过代替契约通过。

逐次捕获实际 HTTP 请求体，检查 Schema 约束是否一致：**36/36 一致**。Instructor 调整过根节点 `required` 的顺序；审计忽略顺序及 `title` / `description` 注释差异，保留其余约束。每个请求的实际 Schema、请求体、校验结果及 SHA-256 均已记录。

零重试分别设置在 Instructor、底层 SDK 与传输层。传输记录器还阻止同一次运行的第二次请求。实测每个运行均为一次尝试、一次 HTTP 请求；离线模拟合法输出、结构错误与 HTTP 429 时，两种 Instructor 模式也各只发一次请求。本版本的零重试行为已经由实验验证，不能仅凭某个框架参数的名字推断。[Instructor 重试机制](https://python.useinstructor.com/concepts/retrying/)

另外独立解析原始最终文本，不依赖 SDK 的便利解析。本次固定版本的 JSON 模式在离线代码围栏样例中拒绝了输出；真实调用里，所有 SDK 成功返回的对象与严格解析后的原始 JSON 值相同，没有观察到删除字段、补字段或转换类型。

## 哪些场景失败

下表每格表示最终有效次数 / 两次运行。N2、N3、R1、R2 故意加入与契约冲突的用户要求，测试抵抗格式与引用干扰的能力。

| 场景 | 输入要点 | 直接 Schema | Instructor JSON | Instructor TOOLS |
|---|---|---:|---:|---:|
| N1 正常要求 | 消息数 20→10，另有“工作忙”背景 | 1/2 | 2/2 | 1/2 |
| N2 多字段干扰 | 要求 alternative 添加 `confidence` | 0/2 | 1/2 | 0/2 |
| N3 缺字段干扰 | 要求 alternative 省略 `id`、改名 `explanation` | 0/2 | 0/2 | 0/2 |
| Z1 无 support | 应允许空 findings | 2/2 | 2/2 | 1/2 |
| R1 无效引用干扰 | 要求引用未交付的编号 | 0/2 | 0/2 | 0/2 |
| R2 方向干扰 | 要求用 context 单独制造 finding | 0/2 | 0/2 | 0/2 |

**原来的 `expected exact keys` 类错误仍然出现。** N2 第一次运行中三组都生成了多余的 alternative `confidence`；N3 两次运行中三组都违反必填字段要求。Pydantic 正确拒绝了这些输出，但没有让模型必然遵循字段约定。

**Pydantic 成功并不意味着引用成功。** N2 第二次的 Instructor TOOLS 输出包含如下引用：

```json
"evidenceIds": ["ev-probe-support", "ev-probe-context"]
```

这一数组出现在 finding 中是允许的；同一输出还把它放在 alternative 中，违反“替代解释只能用 counter/context”的规则。因此 SDK 成功解析，最终仍被拒绝。R1 与 R2 的两次重复中，三条路径也都未守住对应引用规则。

**函数参数也出现了一次非法 JSON。** Z1 第一次的 TOOLS 返回在字符串内包含未转义双引号，例如 `"explanation": "该"工作忙"表述可能…"`。SDK 与独立 JSON 解析均拒绝，没有自动修复。这次失败不能归因于不允许空 findings，因为输出本身已经是 `findings: []`。

## 延迟与 token 记录

| 指标，均为每组 12 次合计或平均 | 直接 Schema | Instructor JSON | Instructor TOOLS |
|---|---:|---:|---:|
| 平均单次耗时 | 3.073 秒 | 2.979 秒 | 3.873 秒 |
| 输入 tokens 合计 | 14,026 | 16,918 | 16,726 |
| 输出 tokens 合计 | 3,010 | 2,899 | 4,982 |
| 总 tokens 合计 | 17,036 | 19,817 | 21,708 |

token 数来自 Provider usage，36 次共 58,561 tokens。未折算账单；缓存、接口差异、网络与样本波动都会影响成本或耗时解释，不能根据这里约 0.1 秒的差异判定 JSON 模式更快。

## 与现有项目的独立复核

离线复核直接调用冻结的 TypeScript 字段校验器与引用校验器：**36/36 个真实输出判断一致，11/11 个契约边界样例判断一致**。样例包括混合 support/context 引用、空 findings、多余字段、缺字段、错误类型、空白字符串、重复引用、重复 item id 和非法 confidence。

引用复核仅在本地使用既有合成 Demo Pack 提供合法 binding 目标，验证是否应接受给定 alias 与方向；它不证明模型陈述与 Demo 内容存在语义对应，也不检查自然语言蕴含。真实 API 输入来自脚本内两条合成证据，不读取 SQLite 或用户聊天。

实验记录保存合成请求、合成最终文本、安全错误类型及用量，不保存鉴权头或完整 Provider 原始响应。凭据只用于官方 DeepSeek endpoint 的鉴权。源码、请求、Schema、复核输入以及冻结验证器的哈希用于追溯本批结果。

## 对 Wememo 的意义

Pydantic 的价值已经得到验证：集中表达类型、生成 Schema、执行严格校验，并给出明确的字段错误。Instructor 的价值体现在协议和请求组织上。本批结果尚不能支持“换成这两个库就解决结构化输出问题”，也没有依据为桌面程序增加 Python 服务。

当前保留 TypeScript 运行链路。Instructor JSON 的组织方式可以作为后续候选，在更多正常场景中比较；任何候选都继续经过现有严格结构与引用校验，不以 SDK 返回对象作为展示条件。

这只是 **6 个合成场景 × 2 次重复**，其中四类含主动冲突要求。它是契约遵循压力测试，不是产品日常成功率；也没有测 Agent 按需取证或回答质量。此前 24 次 JSON Schema 探针使用过更窄的 finding 引用 enum 等条件，本轮恢复实际 Wememo v1 契约，不能直接与此前 9/15 的通过率比较。

## 实验材料与复现

- [36 次完整记录，含生成 Schema 与实际请求体](/Users/lbld/Documents/ChatGPT/Wememo/docs/evaluation/reports/2026-09-14-instructor-pydantic-comparison.json)
- [冻结 TypeScript 校验器复核记录](/Users/lbld/Documents/ChatGPT/Wememo/docs/evaluation/reports/2026-09-14-instructor-comparison-parity.json)
- [独立 Python 实验脚本](/Users/lbld/Documents/ChatGPT/Wememo/scripts/experiments/instructor_pydantic_comparison.py)
- [完整依赖版本](/Users/lbld/Documents/ChatGPT/Wememo/scripts/experiments/instructor-pydantic-requirements.txt)
- [离线 TypeScript 复核脚本](/Users/lbld/Documents/ChatGPT/Wememo/scripts/experiments/verify-instructor-comparison.mjs)

在本机现有隔离环境执行离线自检，不调用模型：

```bash
cd /Users/lbld/Documents/ChatGPT/Wememo
/private/tmp/wememo-instructor-probe-venv/bin/python \
  scripts/experiments/instructor_pydantic_comparison.py --self-test
```

如临时环境已清理，用 Python 3.12 建立独立 venv 后，安装锁定文件中的 wheel 包。脚本导入 `httpx2`，需要保留锁定版本的依赖组合。

再次真实运行会产生新的 36 次 API 请求；以下是复现方法，本轮未额外执行。默认输出文件名带时间戳，不覆盖本批记录；本机代理默认端口 7897，可通过 `--proxy` 指定另一本地 HTTP 代理。

```bash
set -a
source "$HOME/.config/wememo/deepseek.env"
set +a
/private/tmp/wememo-instructor-probe-venv/bin/python \
  scripts/experiments/instructor_pydantic_comparison.py --live
```

对新记录进行离线复核时，将实际新文件路径和一个尚不存在的输出路径传给 `verify-instructor-comparison.mjs`。脚本禁止覆盖已有复核记录。
