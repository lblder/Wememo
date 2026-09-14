/** Report schema names only. Model prose, values and arbitrary property names stay local. */
export function describeExactKeyFailure(rawText: string | undefined, errorMessage: string): string {
  const match = /^(result|findings\[(\d{1,6})\]|alternativeExplanations\[(\d{1,6})\]): expected exact keys$/.exec(errorMessage)
  if (!match || rawText === undefined) return ''
  try {
    const root = JSON.parse(rawText)
    const group = match[2] !== undefined ? 'findings' : 'alternativeExplanations'
    const item = match[1] === 'result' ? root : root?.[group]?.[Number(match[2] ?? match[3])]
    if (!item || typeof item !== 'object' || Array.isArray(item)) return ''
    const expected = match[1] === 'result' ? ['version', 'summary', 'findings', 'alternativeExplanations', 'uncertainties']
      : group === 'findings' ? ['id', 'claim', 'evidenceIds', 'confidence'] : ['id', 'explanation', 'evidenceIds']
    const keys = Object.keys(item)
    const missing = expected.filter(key => !Object.hasOwn(item, key))
    const extra = keys.filter(key => !expected.includes(key))
    const safeNames = new Set(['id', 'claim', 'explanation', 'evidenceIds', 'confidence', 'reason', 'text', 'title', 'summary', 'uncertainties', 'version'])
    const knownExtras = extra.filter(key => safeNames.has(key))
    const unknownCount = extra.length - knownExtras.length
    return [missing.length ? `缺少 ${missing.join('、')}` : '', knownExtras.length ? `多出 ${knownExtras.join('、')}` : '',
      unknownCount ? `另有 ${unknownCount} 个未识别字段` : ''].filter(Boolean).join('；')
  } catch { return '' }
}
