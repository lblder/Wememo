import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  describe,
  expect,
  it
} from 'vitest'

import {
  JsonImportFormatError,
  parseJsonImportDocument
} from './json-message-source'

const samplePath = resolve(
  process.cwd(),
  'fixtures/import/sample-conversation.json'
)

const sampleText =
  readFileSync(samplePath, 'utf8')

interface SampleDocument {
  format: string

  accountId: string

  messages: Array<{
    sourceMessageId: string
    conversationId: string
    senderId: string
    senderName?: string
    direction: string
    timestamp: string
    type: string
    text: string
  }>
}

function parseSampleDocument():
  SampleDocument {
  return JSON.parse(
    sampleText
  ) as SampleDocument
}

const sampleDocument =
  parseSampleDocument()

const sampleMessageCount =
  sampleDocument.messages.length

describe(
  'parseJsonImportDocument',
  () => {
    it('parses the sample document', () => {
      const result =
        parseJsonImportDocument(
          sampleText
        )

      expect(
        result.total
      ).toBe(
        sampleMessageCount
      )

      expect(
        result.accepted
      ).toBe(
        sampleMessageCount
      )

      expect(
        result.rejected
      ).toBe(0)

      expect(
        result.messages
      ).toHaveLength(
        sampleMessageCount
      )

      expect(
        result.messages.every(
          (message) =>
            message.source ===
            'json-import'
        )
      ).toBe(true)

      expect(
        result.messages.every(
          (message) =>
            typeof message.timestamp ===
            'number'
        )
      ).toBe(true)
    })

    it('generates stable IDs when importing the same document twice', () => {
      const first =
        parseJsonImportDocument(
          sampleText
        )

      const second =
        parseJsonImportDocument(
          sampleText
        )

      expect(
        first.messages.map(
          (message) =>
            message.id
        )
      ).toEqual(
        second.messages.map(
          (message) =>
            message.id
        )
      )
    })

    it('rejects one invalid message without rejecting valid messages', () => {
      const document =
        parseSampleDocument()

      document.messages[1].direction =
        'sideways'

      const result =
        parseJsonImportDocument(
          JSON.stringify(
            document
          )
        )

      expect(
        result.total
      ).toBe(
        sampleMessageCount
      )

      expect(
        result.accepted
      ).toBe(
        sampleMessageCount - 1
      )

      expect(
        result.rejected
      ).toBe(1)

      expect(
        result.messages
      ).toHaveLength(
        sampleMessageCount - 1
      )

      expect(
        result.errors
      ).toHaveLength(1)

      expect(
        result.errors[0]?.index
      ).toBe(1)
    })

    it('rejects an invalid top-level format', () => {
      const document =
        parseSampleDocument()

      document.format =
        'unknown-format'

      expect(() =>
        parseJsonImportDocument(
          JSON.stringify(
            document
          )
        )
      ).toThrow(
        JsonImportFormatError
      )
    })

    it('rejects malformed JSON', () => {
      expect(() =>
        parseJsonImportDocument(
          '{ invalid json'
        )
      ).toThrow(
        'JSON 解析失败'
      )
    })
  }
)