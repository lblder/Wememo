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

import { openDatabase } from './database'
import { DATABASE_SCHEMA_VERSION } from './migrations'

const temporaryDirectories: string[] = []

function createTemporaryDatabasePath(): string {
  const directory = mkdtempSync(
    join(tmpdir(), 'wememo-database-test-')
  )

  temporaryDirectories.push(directory)

  return join(directory, 'wememo.sqlite')
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, {
      recursive: true,
      force: true
    })
  }
})

describe('Wememo database', () => {
  it('creates the messages table and schema version', () => {
    const databasePath = createTemporaryDatabasePath()

    const database = openDatabase(databasePath)

    const version = database
      .prepare('PRAGMA user_version')
      .get() as { user_version: number }

    expect(version.user_version).toBe(
      DATABASE_SCHEMA_VERSION
    )

    const table = database
      .prepare(`
        SELECT name
        FROM sqlite_master
        WHERE type = 'table'
          AND name = 'messages'
      `)
      .get() as { name: string } | undefined

    expect(table?.name).toBe('messages')

    database.close()
  })

  it('can reopen an existing database without recreating the schema', () => {
    const databasePath = createTemporaryDatabasePath()

    const firstDatabase = openDatabase(databasePath)
    firstDatabase.close()

    const secondDatabase = openDatabase(databasePath)

    const version = secondDatabase
      .prepare('PRAGMA user_version')
      .get() as { user_version: number }

    expect(version.user_version).toBe(
      DATABASE_SCHEMA_VERSION
    )

    secondDatabase.close()
  })

  it('has the source identity uniqueness constraint', () => {
    const databasePath = createTemporaryDatabasePath()
    const database = openDatabase(databasePath)

    const insert = database.prepare(`
      INSERT INTO messages (
        id,
        source,
        source_message_id,
        account_id,
        conversation_id,
        sender_id,
        sender_name,
        direction,
        timestamp,
        type,
        text,
        imported_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    insert.run(
      'id-1',
      'json-import',
      'source-1',
      'account-1',
      'conversation-1',
      'sender-1',
      '测试用户',
      'incoming',
      1000,
      'text',
      '测试消息',
      Date.now()
    )

    expect(() =>
      insert.run(
        'different-internal-id',
        'json-import',
        'source-1',
        'account-1',
        'conversation-1',
        'sender-1',
        '测试用户',
        'incoming',
        1000,
        'text',
        '测试消息',
        Date.now()
      )
    ).toThrow()

    database.close()
  })
    it('creates the FTS5 trigram search index', () => {
    const databasePath = createTemporaryDatabasePath()
    const database = openDatabase(databasePath)

    const table = database
      .prepare(`
        SELECT name
        FROM sqlite_master
        WHERE type = 'table'
          AND name = 'message_fts'
      `)
      .get() as { name: string } | undefined

    expect(table?.name).toBe('message_fts')

    database.close()
  })
})