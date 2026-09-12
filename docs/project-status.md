# Project Status

| Field | Result |
|---|---|
| Date | 2026-09-12 |
| Stage | D4-D Evidence Layer Freeze |
| Status | **PASS** |

## AnalysisContextPack Contract

- Context version: `wememo-analysis-context-v1`.
- Policy version: `wememo-analysis-policy-v1`; semantic rule IDs retain `semantic-v1:<category>`.
- Contains scope, generatedAt (generation time, separate from analysis window endpoint),
  windows, unchanged previous/recent metrics and changes, observations, evidence,
  coverage and policy. Existing IPC result fields remain compatible; `contextPack`
  is added to the existing analyze-period response. No new IPC channel.
- Pack observations preserve id/title/status/summary and reference evidence through
  `evidenceIds`. This intentionally normalizes the suggested observation contract:
  legacy mixed semantic arrays and duplicate evidence bodies do not enter the Pack.
  The original Evidence Report remains available for the existing evidence UI.
- Builder reads only comparison/report/policy inputs. It does not query SQLite,
  receive the full chat array, recalculate metrics or alter deterministic status.

## Policy and Classification

- The fixed v1 policy records and supplies the actual defaults: 30-minute Session
  gap, minimum 5 messages in each period, recent window and incoming-only semantics.
  Sessionizer, metric observation gate and semantic extractor use these defaults.
- Bundle has seven explicit groups: metricSupport/metricCounter,
  messageSupport/messageCounter, semanticSupport/semanticCounter/semanticContext.
- Classification follows each evidence item's direction, including legacy containers.
  Workload/fatigue cannot be relabeled as support for decline. Identical IDs deduplicate
  in first-seen order across observations; conflicting contents under one ID fail.

## Validation and Data Minimization

- Handwritten shared runtime validator checks all nested contract fields, finite
  numbers, versions, exact JSON object keys, coverage consistency, adjacent windows,
  unique evidence IDs and valid observation references. It rejects extra fields,
  missing provenance, wrong-direction buckets and unsupported policy settings.
- Scope/window mismatches and coverage inconsistencies fail construction. Inputs
  are validated before JSON copying; the detached result is deeply frozen in Main.
  JSON/IPC round trips preserve values, but do not preserve Object.freeze semantics.
- Raw text is limited to selected MessageEvidence/SemanticEvidence. No full message
  arrays or database/runtime objects are part of the contract. A safety test proves
  that text occurring only in an unselected message does not appear in serialized output.
- AnalysisContextPack is the sole standard analysis input for the future LLM layer.
  A future reasoner must consume this Pack instead of SQLite/full chats or independently
  recalculating metrics/selecting evidence. No LLM integration yet.

## D4-D Acceptance

- Baseline: typecheck PASS; 13 test files / 91 tests PASS.
- Final: typecheck PASS; 15 test files / 145 tests PASS; build PASS.
- Added 54 tests: 11 builder/service tests and 43 runtime-validation tests. Existing
  91 tests remain intact. Integration uses the real Demo importer, in-memory SQLite
  repository and InteractionAnalysisService with a fixed reference time.
- GUI PASS: `pnpm dev`, 50-message Demo, clicked “分析最近 7 天”. Version and Policy
  fields rendered correctly; Coverage Previous 25 / Recent 20 (45 analyzed), Support 8,
  Counter 7, Context 7. Visual inspection confirmed the compact summary layout.
- Demo semantic context contains workload/fatigue; counter includes explicit-explanation
  and reassurance; semantic support is empty. Existing observation stays `detected`.
- Known `node:sqlite` ExperimentalWarning only. No unresolved acceptance blocker.

## Limits and Repository State

- v1 policy is fixed; changing its values requires a new supported version. Existing
  low-level metric helpers may accept custom options, but those results must not be
  presented as a v1 Pack. Production Service uses the fixed defaults.
- Runtime validation verifies structure and internal references, not the truth of
  quoted text against SQLite or authenticity of an externally supplied Pack.
- Selected excerpts are preserved without redaction or a token budget. No remote
  transmission, prompt, SDK, model, embeddings or D5 behavior was added.
- Existing D4-C heuristic limitations remain. The pre-existing D2 page header is
  retained; Analysis Context identifies the new version in the analysis panel.
- Worktree already contained uncommitted D3/D4 changes. They were preserved;
  no staging, commit, tag or push performed. Work stops at D4-D for user review.

---

The following D4-C and D1 records are historical acceptance records.

# D4-C Historical Record

| Field | Result |
|---|---|
| Date | 2026-09-12 |
| Stage | D4-C Semantic Evidence Layer |
| Status | **PASS** |

## D4-C Implementation

- Added shared `SemanticEvidence` / `SemanticEvidenceCategory` contracts: category,
  direction, label, static confidence, versioned ruleId, original messageIds,
  exact excerpt, timestamp and sender identity. Shared stays value-only.
- Main Analytics extracts six categories: workload, fatigue, explicit-explanation,
  future-plan, reassurance and conservative positive-engagement.
- Only incoming messages in `comparison.windows.recent` (`[startTime, endTime)`).
  Original IDs and excerpts are preserved; evidence IDs include rule version,
  account, conversation and message ID. Output is sorted and deduplicated by
  message/category. Explicit explanation suppresses the ordinary workload item;
  reassurance remains independently traceable.
- `semanticEvidence` contains context (and reserves support); `counterSemanticEvidence`
  contains counter items. Existing metric status and summary are unchanged.
  Main Service continues orchestration through the report builder; IPC transports
  the expanded report without business logic changes.
- Renderer shows both groups with label, category, direction, rule strength,
  sender, date/time and messageId. No new dependency or LLM integration.

## D4-C Validation

- Before changes: typecheck PASS; 12 test files / 62 tests PASS.
- After changes: typecheck PASS; 13 test files / 91 tests PASS; build PASS.
- Added 25 extractor tests and 4 report tests (29 total). Covers requested cases,
  half-open window boundaries, duplicate inputs, stable ordering, exact provenance,
  outgoing exclusion, conservative rules and preservation of all three metric statuses.
- Demo JSON integration uses a fixed 2026-09-11 reference time for reproducibility.
  It verifies workload, fatigue, explicit-explanation, reassurance and message provenance.
- GUI PASS: started `pnpm dev`, selected the already imported 50-message Demo,
  clicked “分析最近 7 天”; current rolling windows analyzed 45 messages. Confirmed
  metric, original message, semantic context and counter evidence with sender,
  timestamp and messageId. Observation remained `detected`. Visually inspected
  semantic evidence layout in Electron.
- Known `node:sqlite` ExperimentalWarning only; no failing checks.

## D4-C Limits

- These are Chinese lexical heuristics, not psychological judgments or probabilities.
  No LLM, embeddings, relationship score or real WeChat database access.
- Incoming-only v1 does not combine two-message conversations. It cannot reliably
  distinguish quoted speech, sarcasm, questions, other people's states or complex
  negation. Whole-message negative filters favor precision and can omit valid clauses.
- Future-plan keywords such as “再说” remain ambiguous; positive-engagement only
  recognizes explicit sharing or affirmative joint activities, never “嗯” / “好” alone.
- The current Demo's recent explicit invitations are outgoing, so they deliberately
  produce no incoming future-plan evidence. That category is verified by unit tests.
- GUI keeps the pre-existing D2 header; D4-C functionality is in the evidence panel.
- No unresolved implementation/test blocker. Existing D3/D4-A/D4-B changes were
  uncommitted at task start and are preserved. No commit or remote push performed.

---

The following is the retained historical D1 acceptance record; its deferred items
and next-task entry describe D1, not the current D4-C state.

# D1 Historical Record

| Field | Result |
|---|---|
| Date | 2026-09-08 21:49 CST |
| Stage | D1 — Electron + React + TypeScript baseline |
| Status | **PASS** |
| Project path | `/Users/lbld/Documents/ChatGPT/Wememo` |
| Next Task | `D2 - Canonical Message / Local Persistence / Search` |

## Environment

- macOS 26.2 (Build 25C56), Darwin arm64, `/bin/zsh`
- Git 2.50.1, Node.js 22.22.1, npm 11.16.0, pnpm 10.28.0
- Python 3.14.6
- Go: NOT INSTALLED (not required by D1)
- Full probe: [`docs/development/environment.md`](development/environment.md)

## Files Created

- Electron main process: `src/main/index.ts`
- Minimal preload bridge: `src/preload/index.ts`
- React renderer: `src/renderer/index.html`, `src/renderer/src/App.tsx`, `main.tsx`, `styles.css`, `env.d.ts`
- Shared contracts: `src/shared/message.ts`, `src/shared/desktop-api.ts`
- Synthetic fixture: `src/shared/fixtures/synthetic-conversation.ts`
- Tests: `src/shared/message.test.ts`
- Tooling: `package.json`, `pnpm-lock.yaml`, Electron/Vite/Vitest/TypeScript configs, `.gitignore`
- Documentation: `README.md`, `docs/development/environment.md`, this status file
- Runtime evidence: `docs/screenshots/d1-prototype.png`

## Tests

Command: `pnpm test`

Result: PASS — 1 test file, 4 tests passed.

Covered invariants:

1. Synthetic message IDs are unique.
2. Messages sort by timestamp, with ID as the deterministic secondary key.
3. Every fixture message has a non-empty `conversationId`.
4. Every fixture direction is `incoming` or `outgoing`.

## Build Result

- `pnpm typecheck`: PASS
- `pnpm build`: PASS
- Production outputs generated for Main, Preload, and Renderer under ignored `out/`.

## Runtime Result

PASS. `pnpm dev` launched the Electron app and a GUI inspection confirmed:

- Window title: `WeChat Relationship Agent`
- `D1 Prototype` and `当前阶段：D1`
- `Synthetic / 合成测试数据`
- Explicit statement that real WeChat data is not connected
- Message count: 14
- Incoming and outgoing synthetic chat messages rendered in opposing bubbles
- Runtime platform exposed as `darwin` through the limited preload API

The window was intentionally stopped with Ctrl-C after verification. Screenshot: `docs/screenshots/d1-prototype.png`.

## WeChat Data Access Probe

- WeChat installed at `/Applications/WeChat.app`
- Version 4.1.11 (Build 269136)
- Common sandbox container and group-container paths exist
- D1 did not enumerate container contents or read, copy, decrypt, or modify any WeChat database
- This confirms only that a future adapter investigation has an installed app and candidate container locations; real data access is not implemented or claimed

## Architecture Decisions Actually Made

1. Use Electron + React + TypeScript + electron-vite for the D1 desktop baseline, as explicitly authorized for this stage.
2. Treat `Message` as a value-only shared contract. It has no Electron object, filesystem handle, database handle, UI component, or React state dependency.
3. Keep renderer privileges narrow: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`; preload exposes only a frozen synchronous platform getter and no unrestricted `ipcRenderer`.
4. Use deterministic ordering: ISO timestamp first, then stable message ID.
5. Keep all displayed conversation content synthetic and visibly labeled at both source and UI levels.

## Known Problems

- Requested `v0.2.0` mother document and 7–14 day plan were not present. The attached `v0.1.0` mother document and split `00`–`07` documents were read instead.
- The attached ZIP is a versioned source snapshot outside this repository, so its `04_当前状态与续接.md` was not modified. This repository status file is the maintained D1 record.
- The first Electron runtime download failed through Node `fetch`. The official archive was downloaded with curl, matched the package-provided SHA-256 checksum, and was then installed from a local cache. Runtime verification subsequently passed.
- No unresolved D1 implementation or runtime problem remains.

## Deliberately Deferred

D2 and later capabilities were not started: persistence, search, real WeChat access, LangGraph, vector databases, RAG, embeddings, memory, relationship analysis, emotion prompts, automatic replies/sending, multi-Agent orchestration, Redis, PostgreSQL, and Docker.

## D1 Acceptance Checklist

- [x] 环境已探测
- [x] 项目可安装
- [x] Electron 可启动
- [x] React 页面可显示
- [x] TypeScript typecheck 通过
- [x] 合成消息可显示
- [x] shared Message Contract 已建立
- [x] 至少 4 项基础测试通过
- [x] build 通过
- [x] README 存在
- [x] environment.md 存在
- [x] 未声称已经接入真实微信数据

**D1 = PASS**

