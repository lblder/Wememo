import { describe, expect, it } from 'vitest'
import { validateToolCallingResponse } from './tool-calling-provider'
import { call, calls } from './agent-test-fixtures'

describe('untrusted ToolCallingProvider response boundary', () => {
  it.each([
    null, {}, { type: 'final', text: '{}' , calls: [] }, { type: 'final', text: '' },
    { type: 'tool_calls', calls: [] }, { type: 'tool_calls', calls: [null] },
    { type: 'tool_calls', calls: [call('a', 'read_metrics'), { ...call('b', 'read_metrics'), path: '/tmp' }] },
    { type: 'tool_calls', calls: [{ ...call('a', 'read_metrics'), argumentsJson: {} }] },
    { type: 'final', text: 'x'.repeat(32_001) }
  ])('rejects malformed or oversized responses', response => {
    expect(() => validateToolCallingResponse(response)).toThrow()
  })
  it('rejects accessors without evaluating provider-controlled code', () => {
    let accessed = false
    const response = { type: 'final', get text() { accessed = true; return '{}' } }
    expect(() => validateToolCallingResponse(response)).toThrow()
    expect(accessed).toBe(false)
  })
  it('rejects a batch larger than the entire tool budget', () => {
    expect(() => validateToolCallingResponse(calls(...['a', 'b', 'c', 'd', 'e'].map(id => call(id, 'read_metrics'))))).toThrow('预算')
  })
})
