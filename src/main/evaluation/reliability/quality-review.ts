import type { ReliabilityRun } from './evaluation'
export const QUALITY_DIMENSIONS = ['groundedness', 'relevance', 'counterAwareness', 'uncertainty'] as const
export interface HumanRating {
  reviewId: string; reviewer: string; notes: string
  scores: Record<typeof QUALITY_DIMENSIONS[number], 0 | 1 | 2>
}
/** Human-entered ratings only. Refuses unknown IDs, incomplete scores and duplicate reviews. */
export function summarizeHumanRatings(records: readonly ReliabilityRun[], value: unknown) {
  const reject = (): never => { throw new Error('Invalid human ratings') }
  if (!Array.isArray(value)) reject()
  const valid = new Map(records.filter(row => row.endToEndPass && row.reviewId).map(row => [row.reviewId!, row]))
  const seen = new Set<string>()
  const rated: { row: ReliabilityRun; rating: HumanRating; total: number }[] = []
  for (const entry of value as unknown[]) {
    if (!entry || typeof entry !== 'object' || Object.keys(entry).sort().join(',') !== 'notes,reviewId,reviewer,scores') reject()
    const rating = entry as HumanRating
    if (typeof rating.reviewId !== 'string' || !valid.has(rating.reviewId) || seen.has(rating.reviewId) || typeof rating.reviewer !== 'string' || !rating.reviewer.trim() || typeof rating.notes !== 'string') reject()
    if (!rating.scores || typeof rating.scores !== 'object' || Object.keys(rating.scores).sort().join(',') !== [...QUALITY_DIMENSIONS].sort().join(',') || QUALITY_DIMENSIONS.some(key => ![0, 1, 2].includes(rating.scores[key]))) reject()
    seen.add(rating.reviewId)
    rated.push({ row: valid.get(rating.reviewId)!, rating, total: QUALITY_DIMENSIONS.reduce((sum, key) => sum + rating.scores[key], 0) })
  }
  const groups = [...new Set(records.map(row => `${row.set}/${row.promptVariant}/${row.mode}`))]
  return { version: 'wememo-human-quality-v1', scorer: 'human', eligible: valid.size, reviewed: rated.length,
    complete: rated.length === valid.size, groups: Object.fromEntries(groups.map(group => {
      const eligible = records.filter(row => `${row.set}/${row.promptVariant}/${row.mode}` === group && row.endToEndPass)
      const selected = rated.filter(item => `${item.row.set}/${item.row.promptVariant}/${item.row.mode}` === group)
      return [group, { eligible: eligible.length, reviewed: selected.length,
        meanTotal: selected.length ? selected.reduce((sum, item) => sum + item.total, 0) / selected.length : null,
        meanDimensions: Object.fromEntries(QUALITY_DIMENSIONS.map(key => [key, selected.length ? selected.reduce((sum, item) => sum + item.rating.scores[key], 0) / selected.length : null])) }]
    })) }
}
