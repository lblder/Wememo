import { describe, expect, it } from 'vitest'
import { syntheticConversation } from '../../shared/fixtures/synthetic-conversation'
import type { CanonicalMessage } from '../../shared/message'
import { extractSemanticEvidence } from './semantic-evidence-extractor'

const comparison = { windows: {
  previous: { startTime: 0, endTime: 100, label: 'previous' },
  recent: { startTime: 100, endTime: 200, label: 'recent' }
} }
function message(text: string, overrides: Partial<CanonicalMessage> = {}): CanonicalMessage {
  return { ...syntheticConversation[0], id: 'm1', timestamp: 150, direction: 'incoming', text, ...overrides }
}
const extract = (text: string) => extractSemanticEvidence([message(text)], comparison)

describe('extractSemanticEvidence', () => {
  it.each([
    ['最近项目比较忙', 'workload', 'context', 0.7],
    ['最近几天的时间基本已经排满了', 'workload', 'context', 0.7],
    ['今天有点累，没什么精神', 'fatigue', 'context', 0.7],
    ['最近回复慢主要是工作太多，不是故意不回', 'explicit-explanation', 'counter', 0.9],
    ['不是故意不回消息', 'reassurance', 'counter', 0.9],
    ['等这周忙完我们再去', 'future-plan', 'counter', 0.7],
    ['给你分享今天拍的落日照片', 'positive-engagement', 'counter', 0.9],
    ['好呀，我们一起去看电影', 'positive-engagement', 'counter', 0.9]
  ])('extracts %s', (text, category, direction, confidence) => {
    expect(extract(text)).toEqual(expect.arrayContaining([
      expect.objectContaining({ category, direction, confidence })
    ]))
  })
  it.each(['以后再也不去了', '下次不去了', '有空也不想去', '可以去，但是算了', '下次再说吧，我不想去了'])('rejects negative plan: %s', (text) => {
    expect(extract(text).some((e) => e.category === 'future-plan')).toBe(false)
  })
  it.each(['嗯', '好', '主要就是这样', '   ', '我不忙', '今天不累'])('does not overinterpret %s', (text) => {
    expect(extract(text)).toEqual([])
  })
  it('uses the half-open recent window', () => {
    const messages = [99, 100, 199, 200, 201].map((timestamp) => message('工作很忙', { timestamp, id: String(timestamp) }))
    expect(extractSemanticEvidence(messages, comparison).map((e) => e.messageIds)).toEqual([['100'], ['199']])
  })
  it('deduplicates category hits and duplicated messages; prioritizes explanation', () => {
    const m = message('最近回复慢，因为工作项目会议堆一起，不是故意不回')
    const items = extractSemanticEvidence([m, m], comparison)
    expect(items.map((e) => e.category)).toEqual(['explicit-explanation', 'reassurance'])
    expect(extract('工作项目加班会议任务忙')).toHaveLength(1)
  })
  it('preserves exact source identity, text, timestamp and sender', () => {
    const m = message('  最近项目比较忙  ')
    expect(extractSemanticEvidence([m], comparison)[0]).toMatchObject({
      kind: 'semantic', messageIds: [m.id], excerpt: m.text,
      timestamp: m.timestamp, senderId: m.senderId, senderName: m.senderName,
      ruleId: 'semantic-v1:workload'
    })
  })
  it('returns empty for empty input', () => {
    expect(extractSemanticEvidence([], comparison)).toEqual([])
  })
  it('does not attribute outgoing statements to the other person', () => {
    expect(extractSemanticEvidence([message('最近项目比较忙', { direction: 'outgoing' })], comparison)).toEqual([])
  })
  it('is deterministic, sorted and does not mutate input', () => {
    const messages = [message('好累', { id: 'b' }), message('工作忙', { id: 'a' })]
    const snapshot = structuredClone(messages)
    const result = extractSemanticEvidence(messages, comparison)
    expect(result).toEqual(extractSemanticEvidence([...messages].reverse(), comparison))
    expect(result.map((e) => e.messageIds[0])).toEqual(['a', 'b'])
    expect(messages).toEqual(snapshot)
  })
})
