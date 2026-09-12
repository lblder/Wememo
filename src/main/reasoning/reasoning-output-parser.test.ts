import { expect, it } from 'vitest'
import { InteractionReasoningValidationError } from '../../shared/interaction-reasoning-validation'
import { parseInteractionReasoningOutput, ReasoningOutputParseError } from './reasoning-output-parser'
import { demoPack, resultFor } from './reasoning-test-fixtures'

it('parses one strict JSON document', () => {
  const result = resultFor(demoPack())
  expect(parseInteractionReasoningOutput(` \n${JSON.stringify(result)}\n`)).toEqual(result)
})
it.each(['not JSON', '```json\n{}\n```', '{} trailing prose', '{"broken":', ''])('rejects malformed or wrapped output %s', (raw) => {
  expect(() => parseInteractionReasoningOutput(raw)).toThrow(ReasoningOutputParseError)
})
it.each(['null', '[]', '{}', '"hello"'])('distinguishes JSON schema error %s', (raw) => {
  expect(() => parseInteractionReasoningOutput(raw)).toThrow(InteractionReasoningValidationError)
})
it('does not repair extra fields or leak raw output in parse errors', () => {
  const result = { ...resultFor(demoPack()), newStatus: 'detected' }
  expect(() => parseInteractionReasoningOutput(JSON.stringify(result))).toThrow(InteractionReasoningValidationError)
  try { parseInteractionReasoningOutput('SECRET_RAW_OUTPUT') } catch (error) {
    expect((error as Error).message).not.toContain('SECRET_RAW_OUTPUT')
  }
})
