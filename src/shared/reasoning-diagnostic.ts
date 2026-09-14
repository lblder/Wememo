export const REASONING_DIAGNOSTICS = {
  'invalid-json': ['JSON 语法', '返回内容不是单个合法 JSON，可能包含额外文字、代码围栏或语法错误。'],
  'invalid-fields': ['字段结构', '返回字段不符合约定；系统没有补字段、删除字段或转换类型。'],
  'citation-not-delivered': ['引用范围', '引用了本次没有提供给模型的证据。'],
  'finding-missing-support': ['引用方向', '行为发现没有引用支持证据；只有背景证据时应允许不列行为发现。'],
  'alternative-uses-support': ['引用方向', '替代解释使用了支持证据；此处只允许反向或背景证据。'],
  'citation-binding-invalid': ['本地引用映射', '证据映射不完整或不一致。'],
  'invalid-provider-response': ['接口响应', '模型接口返回为空、截断或协议格式异常。']
} as const
export type ReasoningDiagnosticKind = keyof typeof REASONING_DIAGNOSTICS
/** detail contains only locally recognized schema paths/names, never model values or IDs. */
export interface ReasoningDiagnostic { kind: ReasoningDiagnosticKind; detail?: string }
