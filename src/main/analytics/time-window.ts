import type {
  PeriodComparisonWindows
} from '../../shared/interaction-analysis'

export const DAY_MS =
  24 * 60 * 60 * 1000

/**
 * 创建两个长度相同、首尾相接的滚动时间窗口。
 *
 * 例如：
 *
 * previous      recent
 * ──────────────┬──────────────
 * 前7天          最近7天        referenceTime
 *
 * 两个窗口都使用 [startTime, endTime)。
 */
export function createPeriodComparisonWindows(
  referenceTime: number,
  days = 7
): PeriodComparisonWindows {
  if (!Number.isFinite(referenceTime)) {
    throw new Error(
      'referenceTime 必须是有效时间戳'
    )
  }

  if (
    !Number.isInteger(days) ||
    days <= 0
  ) {
    throw new Error(
      'days 必须是正整数'
    )
  }

  const duration =
    days * DAY_MS

  const recentEnd =
    referenceTime

  const recentStart =
    recentEnd - duration

  const previousEnd =
    recentStart

  const previousStart =
    previousEnd - duration

  return {
    recent: {
      startTime: recentStart,
      endTime: recentEnd,
      label: `最近${days}天`
    },

    previous: {
      startTime: previousStart,
      endTime: previousEnd,
      label: `之前${days}天`
    }
  }
}