import {
  mkdtempSync,
  rmSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  afterEach,
  describe,
  expect,
  it
} from 'vitest'

import {
  SYNTHETIC_ACCOUNT_ID,
  SYNTHETIC_CONVERSATION_ID,
  syntheticConversation
} from '../../shared/fixtures/synthetic-conversation'

import { openDatabase } from './database'
import { SqliteMessageRepository } from './sqlite-message-repository'

const temporaryDirectories: string[] = []

function createTemporaryDatabasePath(): string {
  const directory = mkdtempSync(
    join(tmpdir(), 'wememo-repository-test-')
  )

  temporaryDirectories.push(directory)

  return join(directory, 'wememo.sqlite')
}

afterEach(() => {
  for (
    const directory
    of temporaryDirectories.splice(0)
  ) {
    rmSync(directory, {
      recursive: true,
      force: true
    })
  }
})

describe('SqliteMessageRepository', () => {
  it('persists messages after reopening the database', () => {
    const path = createTemporaryDatabasePath()

    const firstDatabase = openDatabase(path)

    const firstRepository =
      new SqliteMessageRepository(firstDatabase)

    firstRepository.insertMessages(
      syntheticConversation
    )

    firstDatabase.close()

    const secondDatabase = openDatabase(path)

    const secondRepository =
      new SqliteMessageRepository(secondDatabase)

    const messages =
      secondRepository.listMessages({
        accountId: SYNTHETIC_ACCOUNT_ID,
        conversationId:
          SYNTHETIC_CONVERSATION_ID
      })

    expect(messages).toHaveLength(
      syntheticConversation.length
    )

    secondDatabase.close()
  })

  it('does not duplicate the same messages', () => {
    const path = createTemporaryDatabasePath()
    const database = openDatabase(path)

    const repository =
      new SqliteMessageRepository(database)

    const first =
      repository.insertMessages(
        syntheticConversation
      )

    const second =
      repository.insertMessages(
        syntheticConversation
      )

    expect(first.inserted).toBe(
      syntheticConversation.length
    )

    expect(first.duplicate).toBe(0)

    expect(second.inserted).toBe(0)

    expect(second.duplicate).toBe(
      syntheticConversation.length
    )

    database.close()
  })

  it('isolates conversations', () => {
    const path = createTemporaryDatabasePath()
    const database = openDatabase(path)

    const repository =
      new SqliteMessageRepository(database)

    repository.insertMessages(
      syntheticConversation
    )

    const messages =
      repository.listMessages({
        accountId: SYNTHETIC_ACCOUNT_ID,
        conversationId:
          'another-conversation'
      })

    expect(messages).toEqual([])

    database.close()
  })

  it('isolates accounts', () => {
    const path = createTemporaryDatabasePath()
    const database = openDatabase(path)

    const repository =
      new SqliteMessageRepository(database)

    repository.insertMessages(
      syntheticConversation
    )

    const messages =
      repository.listMessages({
        accountId: 'another-account',
        conversationId:
          SYNTHETIC_CONVERSATION_ID
      })

    expect(messages).toEqual([])

    database.close()
  })

  it('uses [startTime, endTime) time semantics', () => {
    const path = createTemporaryDatabasePath()
    const database = openDatabase(path)

    const repository =
      new SqliteMessageRepository(database)

    repository.insertMessages(
      syntheticConversation
    )

    const startTime =
      syntheticConversation[1].timestamp

    const endTime =
      syntheticConversation[3].timestamp

    const messages =
      repository.listMessages({
        accountId: SYNTHETIC_ACCOUNT_ID,
        conversationId:
          SYNTHETIC_CONVERSATION_ID,
        startTime,
        endTime
      })

    expect(
      messages.map((message) => message.id)
    ).toEqual([
      'synthetic-002',
      'synthetic-003'
    ])

    database.close()
  })

  it('returns a scoped message count', () => {
    const path = createTemporaryDatabasePath()
    const database = openDatabase(path)

    const repository =
      new SqliteMessageRepository(database)

    repository.insertMessages(
      syntheticConversation
    )

    const count =
      repository.countMessages({
        accountId: SYNTHETIC_ACCOUNT_ID,
        conversationId:
          SYNTHETIC_CONVERSATION_ID
      })

    expect(count).toBe(
      syntheticConversation.length
    )

    database.close()
  })

  it('applies the requested limit', () => {
    const path = createTemporaryDatabasePath()
    const database = openDatabase(path)

    const repository =
      new SqliteMessageRepository(database)

    repository.insertMessages(
      syntheticConversation
    )

    const messages =
      repository.listMessages({
        accountId: SYNTHETIC_ACCOUNT_ID,
        conversationId:
          SYNTHETIC_CONVERSATION_ID,
        limit: 3
      })

    expect(messages).toHaveLength(3)

    database.close()
  })
    it('searches one-character Chinese text with scoped LIKE', () => {
    const path = createTemporaryDatabasePath()
    const database = openDatabase(path)
    const repository = new SqliteMessageRepository(database)

    repository.insertMessages(syntheticConversation)

    const result = repository.searchMessages({
      accountId: SYNTHETIC_ACCOUNT_ID,
      conversationId: SYNTHETIC_CONVERSATION_ID,
      text: '累'
    })

    expect(result.mode).toBe('like-short')
    expect(result.messages.length).toBeGreaterThan(0)

    database.close()
  })

  it('searches two-character Chinese text with scoped LIKE', () => {
    const path = createTemporaryDatabasePath()
    const database = openDatabase(path)
    const repository = new SqliteMessageRepository(database)

    repository.insertMessages(syntheticConversation)

    const result = repository.searchMessages({
      accountId: SYNTHETIC_ACCOUNT_ID,
      conversationId: SYNTHETIC_CONVERSATION_ID,
      text: '工作'
    })

    expect(result.mode).toBe('like-short')
    expect(result.messages.length).toBeGreaterThan(0)

    database.close()
  })

  it('searches three-or-more-character text with FTS5 trigram', () => {
    const path = createTemporaryDatabasePath()
    const database = openDatabase(path)
    const repository = new SqliteMessageRepository(database)

    repository.insertMessages(syntheticConversation)

    const result = repository.searchMessages({
      accountId: SYNTHETIC_ACCOUNT_ID,
      conversationId: SYNTHETIC_CONVERSATION_ID,
      text: '下午的会'
    })

    expect(result.mode).toBe('fts-trigram')
    expect(result.messages.length).toBeGreaterThan(0)

    database.close()
  })

  it('does not leak search results across conversations', () => {
    const path = createTemporaryDatabasePath()
    const database = openDatabase(path)
    const repository = new SqliteMessageRepository(database)

    repository.insertMessages(syntheticConversation)

    const result = repository.searchMessages({
      accountId: SYNTHETIC_ACCOUNT_ID,
      conversationId: 'another-conversation',
      text: '工作'
    })

    expect(result.messages).toEqual([])

    database.close()
  })
})