# SQLite 能力探测

日期：2026-09-09
平台：macOS arm64

## Node.js Runtime

- Node.js：22.22.1
- node:sqlite：支持
- SQLite：3.53.3

## Electron Runtime

- Electron：44.2.0
- node:sqlite：支持
- SQLite：3.53.4
- FTS5：支持
- trigram tokenizer：支持

## 当前技术决定

D2 阶段使用 Electron 内置 `node:sqlite` 作为 Wememo 本地数据库接口。

原因：

- 无需额外 SQLite native addon；
- 避免 Electron ABI / rebuild 复杂度；
- 当前 Electron Runtime 已验证可用；
- 当前 SQLite 支持 FTS5 和 trigram；
- 满足当前本地消息持久化与后续中文检索需求。

## 已知限制

当前 `node:sqlite` API 仍需要在正式发布前重新评估稳定性与兼容性。

当前检测到 Node Runtime 与 Electron Runtime 使用的 SQLite 小版本不同，
因此应用实际行为应以 Electron Runtime 为准。