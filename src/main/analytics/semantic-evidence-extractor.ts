import { DEFAULT_ANALYSIS_POLICY } from '../../shared/analysis-policy'
import { sortMessages, type CanonicalMessage } from '../../shared/message'
import type { InteractionPeriodComparison } from '../../shared/interaction-analysis'
import type { SemanticEvidence, SemanticEvidenceCategory } from '../../shared/semantic-evidence'

interface SemanticRule {
  category: SemanticEvidenceCategory
  direction: 'counter' | 'context'
  label: string
  confidence: number
  patterns: RegExp[]
  exclude?: RegExp[]
}

const NEGATIVE_PLAN_PATTERNS = [
  /再也不/, /不(?:想|会|能|要|打算)?(?:再)?去/, /别再/,
  /没空/, /没时间/, /不行/, /算了/, /取消/
]

// Ordered by priority. Each category produces at most one item per message.
const RULES: readonly SemanticRule[] = [
  {
    category: 'explicit-explanation', direction: 'counter', confidence: 0.9,
    label: '对方明确解释了回复变慢或未回消息',
    patterns: [/不是故意/, /最近回复慢/, /因为工作/, /没怎么看手机/,
      /(?:回复|回消息|回你).*(?:主要就是|主要是|因为)/]
  },
  {
    category: 'reassurance', direction: 'counter', confidence: 0.9,
    label: '对方明确表达了澄清或安抚',
    patterns: [/不是故意/, /别多想/, /没有不想理你/, /不是不回/]
  },
  {
    category: 'workload', direction: 'context', confidence: 0.7,
    label: '对方提到了工作或繁忙安排',
    patterns: [/忙/, /工作/, /项目/, /开会/, /会议/, /加班/, /事情很多/, /任务/, /时间.*排满/],
    exclude: [/不忙/, /不加班/, /没有工作/, /不用(?:工作|开会)/]
  },
  {
    category: 'fatigue', direction: 'context', confidence: 0.7,
    label: '对方提到了疲劳或休息',
    patterns: [/累/, /没(?:什么)?精神/, /疲惫/, /疲劳/, /休息/, /睡觉/],
    exclude: [/不累/, /不疲惫/, /不用休息/]
  },
  {
    category: 'future-plan', direction: 'counter', confidence: 0.7,
    label: '对方提到了后续活动或安排',
    patterns: [/哪天/, /下次/, /有空/, /再去/, /再说/, /等你不忙/, /可以去/],
    exclude: NEGATIVE_PLAN_PATTERNS
  },
  {
    category: 'positive-engagement', direction: 'counter', confidence: 0.9,
    label: '对方明确分享了内容或积极回应共同计划',
    patterns: [/(?:分享给你|给你分享|发给你看看).{4,}/,
      /(?:好呀|太好了|很期待|好期待).*(?:一起|我们).*(?:去|见面|吃|看|玩)/],
    exclude: [...NEGATIVE_PLAN_PATTERNS, /不(?:想|会|要)?(?:分享|发给)/]
  }
]

/** Incoming expressions in [recent.startTime, recent.endTime) only.
 * Counter means alternative context for the decline observation, not a refutation
 * of measured behavior. No rule changes observation status.
 */
export function extractSemanticEvidence(
  messages: readonly CanonicalMessage[],
  comparison: Pick<InteractionPeriodComparison, 'windows'>
): SemanticEvidence[] {
  const { startTime, endTime } = comparison.windows[DEFAULT_ANALYSIS_POLICY.semanticScope.window]
  const result: SemanticEvidence[] = []
  const seen = new Set<string>()

  for (const message of sortMessages(messages)) {
    if (message.direction !== DEFAULT_ANALYSIS_POLICY.semanticScope.directions[0] ||
        message.timestamp < startTime || message.timestamp >= endTime) continue
    const text = message.text.trim()
    if (!text) continue
    const matched = new Set<SemanticEvidenceCategory>()
    for (const rule of RULES) {
      if (rule.category === 'workload' && matched.has('explicit-explanation')) continue
      if (!rule.patterns.some((pattern) => pattern.test(text)) ||
          rule.exclude?.some((pattern) => pattern.test(text))) continue
      const ruleId = `semantic-v1:${rule.category}`
      const id = JSON.stringify([ruleId, message.accountId, message.conversationId, message.id])
      matched.add(rule.category)
      if (seen.has(id)) continue
      seen.add(id)
      result.push({
        id, kind: 'semantic', category: rule.category,
        direction: rule.direction, label: rule.label,
        confidence: rule.confidence, ruleId,
        messageIds: [message.id], excerpt: message.text,
        timestamp: message.timestamp, senderId: message.senderId,
        ...(message.senderName !== undefined ? { senderName: message.senderName } : {})
      })
    }
  }
  return result
}
