import {
  describe,
  expect,
  it
} from 'vitest'

import {
  createPeriodComparisonWindows,
  DAY_MS
} from './time-window'

describe(
  'createPeriodComparisonWindows',
  () => {
    it('creates two adjacent seven-day windows', () => {
      const referenceTime =
        Date.parse(
          '2026-09-10T12:00:00+08:00'
        )

      const windows =
        createPeriodComparisonWindows(
          referenceTime,
          7
        )

      expect(
        windows.recent.endTime
      ).toBe(referenceTime)

      expect(
        windows.recent.startTime
      ).toBe(
        windows.previous.endTime
      )

      expect(
        windows.recent.endTime -
          windows.recent.startTime
      ).toBe(7 * DAY_MS)

      expect(
        windows.previous.endTime -
          windows.previous.startTime
      ).toBe(7 * DAY_MS)
    })

    it('rejects invalid duration', () => {
      expect(() =>
        createPeriodComparisonWindows(
          Date.now(),
          0
        )
      ).toThrow(
        'days 必须是正整数'
      )
    })
  }
)