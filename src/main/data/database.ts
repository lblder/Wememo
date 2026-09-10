import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { migrateDatabase } from './migrations'

/**
 * 打开 Wememo SQLite 数据库。
 *
 * 主要职责：
 * - 创建数据库目录；
 * - 打开 SQLite；
 * - 设置基础 SQLite 参数；
 * - 执行 Schema Migration。
 * 
 * @author liang
 * @created 2026-09-09
 */

export function openDatabase(databasePath: string): DatabaseSync {
  mkdirSync(dirname(databasePath), {
    recursive: true
  })

  const database = new DatabaseSync(databasePath)

  database.exec('PRAGMA foreign_keys = ON')

  migrateDatabase(database)

  return database
}