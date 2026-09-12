import { buildAnalysisContextPack } from './analysis-context-builder'
import type {
  InteractionPeriodAnalysisRequest,
  InteractionPeriodAnalysisResult
} from '../../shared/interaction-ipc'

import type {
  MessageRepository
} from '../data/message-repository'

import {
  compareInteractionPeriods
} from './period-comparison'

import {
  createPeriodComparisonWindows
} from './time-window'

import {
  buildInteractionEvidenceReport
} from './evidence-builder'
/**
 * 互动分析服务。
 *
 * Repository 负责读取数据；
 * Analytics 负责计算；
 * IPC 不直接实现业务分析逻辑。
 */
export class InteractionAnalysisService {
  constructor(
    private readonly repository: MessageRepository
  ) {}

  analyzePeriod(
    request: InteractionPeriodAnalysisRequest
  ): InteractionPeriodAnalysisResult {
    const referenceTime =
      request.referenceTime ?? Date.now()

    const days =
      request.days ?? 7

    const windows =
      createPeriodComparisonWindows(
        referenceTime,
        days
      )

    const messages =
      this.repository.listMessagesInRange({
        accountId: request.accountId,
        conversationId:
          request.conversationId,

        startTime:
          windows.previous.startTime,

        endTime:
          windows.recent.endTime
      })

    const comparison =
      compareInteractionPeriods(
        messages,
        referenceTime,
        days
      )

    const analyzedMessageCount =
      messages.length

    // The report builder attaches message and semantic context after metric status.
    const evidenceReport =
      buildInteractionEvidenceReport({
        accountId:
          request.accountId,

        conversationId:
          request.conversationId,

        analyzedMessageCount,

        messages,

        comparison
      })

    const contextPack = buildAnalysisContextPack({
      accountId: request.accountId,
      conversationId: request.conversationId,
      generatedAt: Date.now(),
      comparison,
      evidenceReport
    })

    return {
      contextPack,
      comparison,
      evidenceReport,
      analyzedMessageCount
    }
  }
}