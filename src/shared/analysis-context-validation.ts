import type { MetricEvidence, MessageEvidence } from './interaction-evidence'
import type { SemanticEvidence } from './semantic-evidence'
import { ANALYSIS_CONTEXT_VERSION, type AnalysisContextPack } from './analysis-context'
import { DEFAULT_ANALYSIS_POLICY } from './analysis-policy'

export class AnalysisContextValidationError extends Error {
  constructor(path: string, reason: string) {
    super(`${path}: ${reason}`)
    this.name = 'AnalysisContextValidationError'
  }
}

type Check = (value: unknown, path: string) => void
const fail = (path: string, reason: string): never => {
  throw new AnalysisContextValidationError(path, reason)
}
const text: Check = (v, p) => {
  if (typeof v !== 'string' || !v.trim()) fail(p, 'expected non-empty string')
}
const number: Check = (v, p) => {
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(p, 'expected finite number')
}
const nonnegative: Check = (v, p) => {
  number(v, p)
  if ((v as number) < 0) fail(p, 'expected nonnegative number')
}
const count: Check = (v, p) => {
  nonnegative(v, p)
  if (!Number.isSafeInteger(v)) fail(p, 'expected safe integer')
}
const ratio: Check = (v, p) => {
  nonnegative(v, p)
  if ((v as number) > 1) fail(p, 'expected ratio in [0, 1]')
}
const oneOf = (...values: readonly unknown[]): Check => (v, p) => {
  if (!values.includes(v)) fail(p, 'unsupported value')
}
const nullable = (check: Check): Check => (v, p) => {
  if (v !== null) check(v, p)
}
const array = (check: Check, minimum = 0): Check => (v, p) => {
  if (!Array.isArray(v) || v.length < minimum) fail(p, 'expected array')
  const items = v as unknown[]
  if (Reflect.ownKeys(items).length !== items.length + 1) fail(p, 'expected dense JSON array')
  for (let i = 0; i < items.length; i++) check(items[i], `${p}[${i}]`)
}
// Exact-key validation prevents silently carrying extra chat data or runtime objects.
const object = (fields: Record<string, Check>, optional: Record<string, Check> = {}): Check => (v, p) => {
  if (typeof v !== 'object' || v === null || Object.getPrototypeOf(v) !== Object.prototype) {
    fail(p, 'expected plain JSON object')
  }
  const data = v as Record<string, unknown>
  for (const key of Reflect.ownKeys(data)) {
    if (typeof key !== 'string' || !(Object.hasOwn(fields, key) || Object.hasOwn(optional, key))) {
      fail(p, 'unexpected field')
    }
    const descriptor = Object.getOwnPropertyDescriptor(data, key)!
    if (!descriptor.enumerable || !('value' in descriptor)) fail(p, 'expected JSON data property')
  }
  for (const [key, check] of Object.entries(fields)) check(data[key], `${p}.${key}`)
  for (const [key, check] of Object.entries(optional)) {
    if (Object.hasOwn(data, key)) check(data[key], `${p}.${key}`)
  }
}
const directionMetrics = object({ messageCount: count, averageMessageLength: nonnegative })
const metrics = object({
  totalMessages: count, incoming: directionMetrics, outgoing: directionMetrics,
  activeDays: count,
  sessions: object({
    totalSessions: count, incomingStartedSessions: count, outgoingStartedSessions: count,
    incomingStartedRatio: ratio, outgoingStartedRatio: ratio
  }),
  replies: object({
    incomingToOutgoingCount: count, incomingToOutgoingMedianMs: nullable(nonnegative),
    outgoingToIncomingCount: count, outgoingToIncomingMedianMs: nullable(nonnegative)
  }),
  medianSessionDurationMs: nullable(nonnegative)
})
const numericChange = object({ previous: nonnegative, recent: nonnegative, absoluteChange: number, relativeChange: nullable(number) })
const nullableChange = object({ previous: nullable(nonnegative), recent: nullable(nonnegative), absoluteChange: nullable(number), relativeChange: nullable(number) })
const ratioChange = object({ previous: ratio, recent: ratio, percentagePointChange: number })
const changes = object({
  totalMessages: numericChange, incomingMessages: numericChange, outgoingMessages: numericChange,
  activeDays: numericChange, totalSessions: numericChange,
  incomingStartedRatio: ratioChange, outgoingStartedRatio: ratioChange,
  incomingToOutgoingMedianMs: nullableChange, outgoingToIncomingMedianMs: nullableChange,
  incomingAverageMessageLength: numericChange, outgoingAverageMessageLength: numericChange
})
const window = object({ startTime: number, endTime: number, label: text })
const metricEvidence = (direction: string): Check => object({
  id: text, kind: oneOf('metric'), direction: oneOf(direction), label: text,
  metric: oneOf('total-messages', 'incoming-messages', 'total-sessions', 'incoming-started-ratio', 'active-days', 'incoming-reply-latency', 'incoming-average-message-length'),
  previous: nullable(number), recent: nullable(number), change: nullable(number),
  unit: oneOf('count', 'ratio', 'milliseconds', 'characters')
})
const messageRef = object({
  messageId: text, senderId: text, direction: oneOf('incoming', 'outgoing'), timestamp: number, text
}, { senderName: text })
const messageEvidence = (direction: string): Check => object({
  id: text, kind: oneOf('message'), direction: oneOf(direction), label: text,
  evidenceType: oneOf('reply-latency', 'session-starter', 'long-reply'), messages: array(messageRef, 1)
})
const semanticEvidence = (direction: string): Check => object({
  id: text, kind: oneOf('semantic'), direction: oneOf(direction), label: text,
  category: oneOf('workload', 'fatigue', 'explicit-explanation', 'future-plan', 'reassurance', 'positive-engagement'),
  confidence: ratio, ruleId: text, messageIds: array(text, 1), excerpt: text,
  timestamp: number, senderId: text
}, { senderName: text })
const schema = object({
  version: oneOf(ANALYSIS_CONTEXT_VERSION),
  scope: object({ accountId: text, conversationId: text }), generatedAt: nonnegative,
  windows: object({ previous: window, recent: window }),
  metrics: object({ previous: metrics, recent: metrics, changes }),
  observations: array(object({
    id: text, title: text, status: oneOf('detected', 'not-detected', 'insufficient'),
    summary: text, evidenceIds: array(text)
  })),
  evidence: object({
    metricSupport: array(metricEvidence('support')), metricCounter: array(metricEvidence('counter')),
    messageSupport: array(messageEvidence('support')), messageCounter: array(messageEvidence('counter')),
    semanticSupport: array(semanticEvidence('support')), semanticCounter: array(semanticEvidence('counter')),
    semanticContext: array(semanticEvidence('context'))
  }),
  coverage: object({
    analyzedMessageCount: count, previousMessageCount: count, recentMessageCount: count,
    previousActiveDays: count, recentActiveDays: count
  }),
  policy: object({
    version: oneOf(DEFAULT_ANALYSIS_POLICY.version),
    sessionGapMs: oneOf(DEFAULT_ANALYSIS_POLICY.sessionGapMs),
    minimumMessagesPerPeriod: oneOf(DEFAULT_ANALYSIS_POLICY.minimumMessagesPerPeriod),
    semanticScope: object({
      window: oneOf('recent'), directions: (v, p) => {
        array(oneOf('incoming'), 1)(v, p)
        if ((v as unknown[]).length !== 1) fail(p, 'v1 requires incoming only')
      }
    })
  })
})

/** Validates every nested field; rejects extra fields instead of leaking them onward.
 * Returns validated JSON data, without recalculating metrics or observation status.
 */
export function validateAnalysisContextPack(value: unknown): AnalysisContextPack {
  schema(value, 'contextPack')
  const pack = value as AnalysisContextPack
  const { previous, recent } = pack.windows
  if (previous.startTime >= previous.endTime || recent.startTime >= recent.endTime ||
      previous.endTime !== recent.startTime ||
      previous.endTime - previous.startTime !== recent.endTime - recent.startTime) {
    fail('windows', 'expected adjacent equal positive windows')
  }
  const c = pack.coverage
  if (c.analyzedMessageCount !== c.previousMessageCount + c.recentMessageCount ||
      c.previousMessageCount !== pack.metrics.previous.totalMessages ||
      c.recentMessageCount !== pack.metrics.recent.totalMessages ||
      c.previousActiveDays !== pack.metrics.previous.activeDays ||
      c.recentActiveDays !== pack.metrics.recent.activeDays) fail('coverage', 'inconsistent with metrics')
  for (const period of [pack.metrics.previous, pack.metrics.recent]) {
    if (period.totalMessages !== period.incoming.messageCount + period.outgoing.messageCount ||
        period.activeDays > period.totalMessages) fail('metrics', 'inconsistent message counts')
  }
  const ids = new Set<string>()
  for (const items of Object.values(pack.evidence) as (MetricEvidence | MessageEvidence | SemanticEvidence)[][]) {
    for (const item of items) {
      if (ids.has(item.id)) fail('evidence', 'duplicate evidence ID')
      ids.add(item.id)
      if (item.kind === 'semantic') {
        if ((item.category === 'workload' || item.category === 'fatigue') && item.direction === 'support') {
          fail('evidence', 'background cannot support decline')
        }
        if (!item.ruleId.startsWith('semantic-v1:')) fail('evidence', 'unsupported semantic rule version')
        if (item.timestamp < recent.startTime || item.timestamp >= recent.endTime) fail('evidence', 'semantic evidence outside recent window')
        if (new Set(item.messageIds).size !== item.messageIds.length) fail('evidence', 'duplicate message ID')
      }
      if (item.kind === 'message' && item.messages.some((m) => m.timestamp < recent.startTime || m.timestamp >= recent.endTime)) {
        fail('evidence', 'message evidence outside recent window')
      }
    }
  }
  const observationIds = new Set<string>()
  const referenced = new Set<string>()
  for (const observation of pack.observations) {
    if (observationIds.has(observation.id)) fail('observations', 'duplicate observation ID')
    observationIds.add(observation.id)
    if (new Set(observation.evidenceIds).size !== observation.evidenceIds.length) fail('observations', 'duplicate reference')
    for (const id of observation.evidenceIds) {
      if (!ids.has(id)) fail('observations', 'unknown evidence reference')
      referenced.add(id)
    }
  }
  if (referenced.size !== ids.size) fail('evidence', 'unreferenced evidence')
  return pack
}
