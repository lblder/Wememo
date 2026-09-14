# D6-P0 真实 Provider Transport Qualification

日期：2026-09-14。结论：**本批次传输与协议探针通过，旧故障未复现。**
这不是 V0 基线，也不是模型输出质量或引用有效率评估。

冻结代码：`b3c327b` / `d6-provider-diagnostics-v1`（本地）。
Provider：DeepSeek；实际配置 modelId：`deepseek-flash`。
传输：与 preflight 相同的 curl + 本机 HTTP proxy 路径。
参数：thinking disabled、temperature 未设置、stream false、max_tokens 4096；
单请求沿用 60 秒模型时限。顺序 A1–A5 → B1–B5 → C1–C5，串行、零重试。

## 三组结果

| 指标 | A：Direct，无 tools | B：Agent initial，带 tools | C：Agent continuation |
|---|---:|---:|---:|
| 计划 / 实际请求 | 5 / 5 | 5 / 5 | 5 / 5 |
| HTTP 200 | 5 | 5 | 5 |
| API envelope / 协议解码通过 | 5/5 | 5/5 | 5/5 |
| HTTP 错误 | 0 | 0 | 0 |
| Network / DNS / reset | 0 | 0 | 0 |
| Timeout / cancelled | 0 | 0 | 0 |
| Body / decode failure | 0 | 0 | 0 |
| 平均请求耗时 | 4.626 秒 | 2.237 秒 | 1.856 秒 |
| 返回类型 | final × 5 | tool_calls × 5 | tool_calls × 5 |

HTTP 400、401、402、422、429、500、503 各组均为 0；其他非 200 状态为 0。
三组 `failures` 和 `transportCodes` 分布都是空对象。实际原始记录 **15 条**，
实际 HTTP 调用 **15 次**，补发 **0 次**；没有尝试剩余 72 次或新的 V0。

C 使用本地构造、经过现有 whole-batch validator 校验的 assistant 工具历史：
`read_metrics` + `read_evidence`，随后回传现有只读工具产生的两条 tool message。
读取的三个 alias 分别为 support、counter、context；引用权限只在读取后加入 deliveredIds。
这是独立的协议 fixture，**不是模型自主选取证据的记录**。保持第二轮 `tool_choice: auto`，
五次都返回继续取证的 tool_calls；这些后续提案不执行，也不计作最终解释成功。

A 的 final 仅说明 API 消息 envelope 完整；这轮没有对 final 文本做 Reasoning Contract、
Citation 或人工质量验收，不保存该文本，也不据此断言结构化输出稳定。

## 对旧三次失败的判断

旧 8-run preflight 有 3 次 provider-unavailable，但旧适配器丢弃了 HTTP 状态和 curl
退出码，所以无法确定它们分别是 400、429、503、timeout 还是网络故障。本批次没有复现
失败，因此不能补写旧原因，也不能声称已修复某个服务端或网络故障。

当前证据支持：同一 modelId、关闭 thinking 时，Direct、初始 tool 请求及本次构造的
continuation 协议均被接受。它不能排除历史瞬时故障，或只在其他实际工具历史中出现的问题。
不修改 Prompt、Validator 或工具策略，也不根据 15 次短探针宣称长期可用性稳定。

## 官方协议核对

[当前官方首页](https://api-docs.deepseek.com/)列出 `deepseek-flash`，因此保留现有模型名。
[Thinking mode 文档](https://api-docs.deepseek.com/guides/thinking_mode/)要求 thinking + tools
后续完整传回 reasoning_content，否则可能返回 400；Wememo 当前两种编码器都显式关闭
thinking，本次请求也保持关闭。不能用该要求解释旧批次的两个首轮失败。
[官方错误码](https://api-docs.deepseek.com/quick_start/error_codes/)区分格式、认证、余额、
参数、限流和服务端异常；已为相应 HTTP 状态添加离线覆盖，没有引入文档建议的自动 retry。

## 记录与冻结边界

- `manifest.json`：modelId、控制变量、fixture/source hashes、冻结 HEAD。
- `requests.jsonl`：15 条逐请求安全记录；不含答案、Prompt、聊天内容、scope 或凭据。
- `report.json`：按组 HTTP/transport 分布，完成数与一致性检查。
- 源码 hash 未变、Git HEAD 未变、逐条落盘完全一致：全部 true。
- 50 个测试文件 / **687 项测试通过**；typecheck、build、diff check 通过。
- 相对 `d6-eval-harness-v1` 的 19 个关键 Prompt/Contract/Validator/tool/budget 源码
  逐字节不变，校验记录见上级 `frozen-boundaries.json`。
- 原有 8 个 preflight 文件保留原字节；只增加 disposition sidecar，标记
  `2026-09-14-live-v0-preflight` / `transport qualification failed` / `countsTowardV0: false`。

下一步可以基于新的冻结代码重新运行 canary。若再失败，先按真实 HTTP/transport 分类处理；
连通通过后才重启 V0。此次未启动新 canary、V0、V1–V3 或人工评分，未推送远程仓库。
