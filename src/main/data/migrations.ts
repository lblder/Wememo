import type { DatabaseSync } from 'node:sqlite'

export const DATABASE_SCHEMA_VERSION = 2

/**
 * Wememo 数据库迁移入口。
 *
 * 负责将旧数据库逐步升级到当前 Schema Version。
 * 不负责业务查询。
 * 
 * v1：messages 表
 * v2：FTS5 trigram 消息全文索引
 * 
 * @author liang
 * @created 2026-09-09
 */
export function migrateDatabase(database: DatabaseSync): void {
  const versionRow = database
    .prepare('PRAGMA user_version')
    .get() as { user_version: number }

  let currentVersion = Number(versionRow.user_version)

  if (currentVersion > DATABASE_SCHEMA_VERSION) {
    throw new Error(
      `数据库版本 ${currentVersion} 高于当前程序支持的版本 ${DATABASE_SCHEMA_VERSION}`
    )
  }

  if (currentVersion < 1) {
    migrateToVersion1(database)
    currentVersion = 1
  }

  if (currentVersion < 2) {
    migrateToVersion2(database)
    currentVersion = 2
  }

  if (currentVersion !== DATABASE_SCHEMA_VERSION) {
    throw new Error(
      `数据库迁移失败：当前版本 ${currentVersion}，目标版本 ${DATABASE_SCHEMA_VERSION}`
    )
  }
}

function migrateToVersion1(database: DatabaseSync): void {
  database.exec('BEGIN IMMEDIATE')

  try {
    database.exec(`
      CREATE TABLE messages (
        id TEXT PRIMARY KEY,

        source TEXT NOT NULL,
        source_message_id TEXT NOT NULL,

        account_id TEXT NOT NULL,
        conversation_id TEXT NOT NULL,

        sender_id TEXT NOT NULL,
        sender_name TEXT,

        direction TEXT NOT NULL
          CHECK (direction IN ('incoming', 'outgoing')),

        timestamp INTEGER NOT NULL,

        type TEXT NOT NULL
          CHECK (type = 'text'),

        text TEXT NOT NULL,

        imported_at INTEGER NOT NULL,

        UNIQUE (
          source,
          account_id,
          conversation_id,
          source_message_id
        )
      );

      CREATE INDEX idx_messages_scope_time
      ON messages (
        account_id,
        conversation_id,
        timestamp,
        id
      );

      PRAGMA user_version = 1;
    `)

    database.exec('COMMIT')
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }
}

function migrateToVersion2(database: DatabaseSync): void {
  database.exec('BEGIN IMMEDIATE')

  try {
    database.exec(`
      CREATE VIRTUAL TABLE message_fts
      USING fts5(
        id UNINDEXED,
        account_id UNINDEXED,
        conversation_id UNINDEXED,
        text,
        tokenize = 'trigram'
      );

      INSERT INTO message_fts (
        id,
        account_id,
        conversation_id,
        text
      )
      SELECT
        id,
        account_id,
        conversation_id,
        text
      FROM messages;

      PRAGMA user_version = 2;
    `)

    database.exec('COMMIT')
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }
}