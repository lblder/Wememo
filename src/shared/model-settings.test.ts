import { describe, expect, it } from 'vitest'
import { validateSaveModelSettings } from './model-settings'

const valid = { baseUrl: 'https://api.deepseek.com', modelId: 'deepseek-flash', apiKey: 'synthetic-key' }
describe('write-only model settings contract', () => {
  it('accepts official addresses and an omitted or blank key for explicit reuse', () => {
    expect(validateSaveModelSettings({ ...valid, baseUrl: valid.baseUrl + '/v1/', apiKey: ' ' })).toEqual({ baseUrl: valid.baseUrl + '/v1', modelId: valid.modelId })
    const { apiKey: _, ...withoutKey } = valid
    expect(validateSaveModelSettings(withoutKey)).toEqual(withoutKey)
  })
  it.each([
    { ...valid, baseUrl: 'https://example.com' }, { ...valid, baseUrl: 'https://api.deepseek.com@evil.test' },
    { ...valid, baseUrl: 'https://api.deepseek.com/?key=PRIVATE' }, { ...valid, modelId: 'PRIVATE MODEL' },
    { ...valid, apiKey: 'a\r\nb' }, { ...valid, apiKey: 'a'.repeat(4097) }, { ...valid, apiKey: 1 },
    { ...valid, prompt: 'PRIVATE' }, { ...valid, path: '/tmp/key' }, { ...valid, endpoint: 'https://evil.test' },
    { ...valid, [Symbol('extra')]: 1 }, null, []
  ])('rejects malformed or expanded settings without returning input', value => {
    expect(() => validateSaveModelSettings(value)).toThrow('invalid-request')
  })
  it('rejects accessors without executing them', () => {
    let read = false
    const input = { ...valid }
    Object.defineProperty(input, 'apiKey', { enumerable: true, get() { read = true; throw new Error('PRIVATE') } })
    expect(() => validateSaveModelSettings(input)).toThrow('invalid-request')
    expect(read).toBe(false)
  })
})
