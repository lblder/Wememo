# WeChat Relationship Agent

## 项目目标

从零开始构建一个可运行、可理解、可维护的微信个人情感与关系分析桌面应用。本仓库当前只建立最小工程基线，不提供情感分析结论。

## 当前阶段

`D1`：Electron + React + TypeScript 桌面原型。

页面展示一段明确标记为 **Synthetic / 合成测试数据** 的虚构聊天。当前没有读取、导入或连接任何真实微信聊天数据。

## 技术基线

- Electron
- React
- TypeScript
- electron-vite
- Vitest
- pnpm

## 启动

```bash
pnpm install
pnpm dev
```

## 检查与测试

```bash
pnpm typecheck
pnpm test
pnpm build
```

## 数据状态

当前仅使用 `src/shared/fixtures/synthetic-conversation.ts` 中的合成数据。真实微信数据尚未接入；D1 也不会读取或修改微信数据库。

## 下一阶段

`D2 - Canonical Message / Local Persistence / Search`

D2 尚未实现。

