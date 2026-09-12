import { DEFAULT_ANALYSIS_POLICY } from '../../shared/analysis-policy'
import { extractSemanticEvidence } from './semantic-evidence-extractor'
import type {
  InteractionPeriodComparison
} from '../../shared/interaction-analysis'

import type {
  InteractionEvidenceReport,
  InteractionObservation,
  MetricEvidence
} from '../../shared/interaction-evidence'

import type {
  CanonicalMessage
} from '../../shared/message'

import {
  buildMessageEvidence
} from './message-evidence-builder'

function metricEvidence(
  evidence: Omit<MetricEvidence, 'kind'>
): MetricEvidence {
  return {
    kind: 'metric',
    ...evidence
  }
}

function buildInteractionDeclineObservation(
  comparison: InteractionPeriodComparison
): InteractionObservation {
  const evidence: MetricEvidence[] = []
  const counterEvidence: MetricEvidence[] = []

  /*
   * 1. 总消息量下降
   */
  const messageChange =
    comparison.changes.totalMessages

  if (
    messageChange.relativeChange !== null &&
    messageChange.relativeChange <= -0.2
  ) {
    evidence.push(
      metricEvidence({
        id: 'E-total-messages-down',
        direction: 'support',
        metric: 'total-messages',
        label: '总消息量下降',
        previous: messageChange.previous,
        recent: messageChange.recent,
        change: messageChange.relativeChange,
        unit: 'count'
      })
    )
  }

  /*
   * 2. 对方消息量下降
   */
  const incomingChange =
    comparison.changes.incomingMessages

  if (
    incomingChange.relativeChange !== null &&
    incomingChange.relativeChange <= -0.2
  ) {
    evidence.push(
      metricEvidence({
        id: 'E-incoming-messages-down',
        direction: 'support',
        metric: 'incoming-messages',
        label: '对方消息量下降',
        previous: incomingChange.previous,
        recent: incomingChange.recent,
        change: incomingChange.relativeChange,
        unit: 'count'
      })
    )
  }

  /*
   * 3. Session 数下降
   */
  const sessionChange =
    comparison.changes.totalSessions

  if (
    sessionChange.relativeChange !== null &&
    sessionChange.relativeChange <= -0.2
  ) {
    evidence.push(
      metricEvidence({
        id: 'E-sessions-down',
        direction: 'support',
        metric: 'total-sessions',
        label: '独立聊天 Session 数下降',
        previous: sessionChange.previous,
        recent: sessionChange.recent,
        change: sessionChange.relativeChange,
        unit: 'count'
      })
    )
  }

  /*
   * 4. 对方主动发起比例下降
   */
  const initiativeChange =
    comparison.changes
      .incomingStartedRatio

  if (
    initiativeChange
      .percentagePointChange <= -0.15
  ) {
    evidence.push(
      metricEvidence({
        id: 'E-initiative-down',
        direction: 'support',
        metric: 'incoming-started-ratio',
        label: '对方发起 Session 的比例下降',
        previous: initiativeChange.previous,
        recent: initiativeChange.recent,
        change:
          initiativeChange.percentagePointChange,
        unit: 'ratio'
      })
    )
  }

  /*
   * 5. 对方回复时间增加
   *
   * outgoing -> incoming
   * 即：
   * 我方发送 -> 对方回复
   */
  const replyChange =
    comparison.changes
      .outgoingToIncomingMedianMs

  if (
    replyChange.relativeChange !== null &&
    replyChange.relativeChange >= 0.5
  ) {
    evidence.push(
      metricEvidence({
        id: 'E-reply-slower',
        direction: 'support',
        metric: 'incoming-reply-latency',
        label: '对方回复中位时间增加',
        previous: replyChange.previous,
        recent: replyChange.recent,
        change: replyChange.relativeChange,
        unit: 'milliseconds'
      })
    )
  }

  /*
   * ---------- 反向指标证据 ----------
   */

  /*
   * 6. 活跃天数没有减少
   */
  const activeDaysChange =
    comparison.changes.activeDays

  if (
    activeDaysChange.absoluteChange >= 0
  ) {
    counterEvidence.push(
      metricEvidence({
        id: 'C-active-days-stable',
        direction: 'counter',
        metric: 'active-days',
        label: '活跃天数没有减少',
        previous: activeDaysChange.previous,
        recent: activeDaysChange.recent,
        change:
          activeDaysChange.absoluteChange,
        unit: 'count'
      })
    )
  }

  /*
   * 7. 对方平均消息长度增加
   */
  const lengthChange =
    comparison.changes
      .incomingAverageMessageLength

  if (
    lengthChange.relativeChange !== null &&
    lengthChange.relativeChange >= 0.1
  ) {
    counterEvidence.push(
      metricEvidence({
        id: 'C-message-length-up',
        direction: 'counter',
        metric:
          'incoming-average-message-length',
        label: '对方平均消息长度增加',
        previous: lengthChange.previous,
        recent: lengthChange.recent,
        change: lengthChange.relativeChange,
        unit: 'characters'
      })
    )
  }

  /*
   * 两个时期至少各 5 条消息，
   * 才进行 detected / not-detected 判断。
   */
  const enoughData =
    comparison.previous.totalMessages >= DEFAULT_ANALYSIS_POLICY.minimumMessagesPerPeriod &&
    comparison.recent.totalMessages >= DEFAULT_ANALYSIS_POLICY.minimumMessagesPerPeriod

  if (!enoughData) {
    return {
      id: 'interaction-decline',

      title: '互动投入下降信号',

      status: 'insufficient',

      summary:
        '当前两个时期的消息量不足，暂不判断互动是否发生明显下降。',

      evidence,

      counterEvidence,

      messageEvidence: [],

      counterMessageEvidence: [],
      semanticEvidence: [],
      counterSemanticEvidence: []
    }
  }

  /*
   * 至少两个支持指标，
   * 才判定 detected。
   */
  if (evidence.length >= 2) {
    return {
      id: 'interaction-decline',

      title: '互动投入下降信号',

      status: 'detected',

      summary:
        '多个聊天行为指标同时出现下降，但这些指标只能说明互动模式变化，不能直接推断真实感情状态。',

      evidence,

      counterEvidence,

      messageEvidence: [],

      counterMessageEvidence: [],
      semanticEvidence: [],
      counterSemanticEvidence: []
    }
  }

  return {
    id: 'interaction-decline',

    title: '互动投入下降信号',

    status: 'not-detected',

    summary:
      '当前没有足够的确定性行为指标支持“互动明显下降”的判断。',

    evidence,

    counterEvidence,

    messageEvidence: [],

    counterMessageEvidence: [],
    semanticEvidence: [],
    counterSemanticEvidence: []
  }
}

/**
 * 构建完整 Evidence Report。
 *
 * 包含：
 * 1. Metric Evidence
 * 2. Counter Metric Evidence
 * 3. Message Evidence
 * 4. Counter Message Evidence
 * 5. Semantic context and counter evidence (status stays metric-driven)
 */
export function buildInteractionEvidenceReport(
  input: {
    accountId: string

    conversationId: string

    analyzedMessageCount: number

    messages: readonly CanonicalMessage[]

    comparison:
      InteractionPeriodComparison
  }
): InteractionEvidenceReport {
  /*
   * 先生成指标观察。
   */
  const observation =
    buildInteractionDeclineObservation(
      input.comparison
    )

  /*
   * 再从原始消息中选择可追溯证据。
   */
  const messageEvidence =
    buildMessageEvidence(
      input.messages,
      input.comparison
    )

  const semanticEvidence = extractSemanticEvidence(
    input.messages, input.comparison
  )

  const enrichedObservation:
    InteractionObservation = {
    ...observation,

    messageEvidence:
      messageEvidence.support,

    counterMessageEvidence:
      messageEvidence.counter,

    semanticEvidence: semanticEvidence.filter((item) => item.direction !== 'counter'),
    counterSemanticEvidence: semanticEvidence.filter((item) => item.direction === 'counter')
  }

  return {
    accountId:
      input.accountId,

    conversationId:
      input.conversationId,

    windows:
      input.comparison.windows,

    analyzedMessageCount:
      input.analyzedMessageCount,

    observations: [
      enrichedObservation
    ]
  }
}