import { INTERACTION_REASONING_VERSION } from '../../shared/interaction-reasoning'

/** Provider-specific formatting reinforcement; the frozen validators remain authoritative. */
export const DEEPSEEK_OUTPUT_INSTRUCTIONS = `
输出前逐项自检 JSON 字段集合，所有必需字段都要出现，任何层级都不得添加额外字段：
根对象恰好为 version、summary、findings、alternativeExplanations、uncertainties。
version 必须为 "${INTERACTION_REASONING_VERSION}"，不是输入数据中的 contextVersion 或 policyVersion。
findings 的每个对象恰好为 id、claim、evidenceIds、confidence。
alternativeExplanations 的每个对象恰好为 id、explanation、evidenceIds。
特别注意：alternativeExplanations 不包含 confidence，也不使用 claim、reason 或 text 替代 explanation；不要遗漏 id。
uncertainties 是非空字符串数组，不是对象数组。
每项 evidenceIds 是非空字符串数组，只能使用本次输入提供的证据 ID。
finding 必须有 support 引用，alternativeExplanation 只能有 counter/context 引用。
没有足够 support 时 findings 可以为 []；没有可引用的替代解释时 alternativeExplanations 可以为 []。
以下仅展示单个对象的字段结构，示意证据 ID 必须替换为本次 allowedEvidenceIds 中方向适用的实际 ID：
finding: {"id":"finding-1","claim":"行为描述","evidenceIds":["实际 support ID"],"confidence":"low"}
alternativeExplanation: {"id":"alternative-1","explanation":"替代解释","evidenceIds":["实际 counter/context ID"]}
只输出最终 JSON；不要输出自检过程。`
