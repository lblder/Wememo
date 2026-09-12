# D5-G G1/G2 Acceptance

| Field | Result |
|---|---|
| Date | 2026-09-12 |
| Stage | Tool contracts / on-demand evidence / bounded Mock runner |
| Status | **PASS — bounded Agent runtime frozen before G3** |
| Baseline | `a9bc5af` / D5-F tag `d5-desktop-reasoning` at `1883516` |
| Recovery tag | `d5-g-agent-runtime` |

- New isolated module: `src/main/evidence-agent`. No real provider adapter, Renderer,
  IPC, package dependency, SQLite repository or frozen D4/D5-F code changes.
- ToolCallingProvider is a separate port with final/tool-call responses, an AbortSignal
  boundary and safe typed provider errors. Mock supports scripted, deferred and invalid responses.
- A validated Pack is cloned and recursively frozen before the first await. An independent
  projection selects support/counter/context with 24-item / 500-code-point excerpt /
  12,000-code-point content limits. D5-F's final prompt builder is never invoked.
- Initial user data contains question, coverage, metadata-only catalog and empty deliveredIds.
  Static labels prevent source labels from smuggling excerpts or metric values into the index.
  Identity fields remain local; exact identifiers in source text/question are redacted.
- Random run UUIDs namespace aliases. Only current catalog aliases are accepted by read_evidence
  (1–6 unique aliases). Whole batches and cumulative budgets are validated before any read.
  Extra parameters, unknown tools, canonical IDs, stale aliases and repeated call IDs fail.
- read_metrics returns fixed-snapshot numeric metrics and status metadata, never marks evidence
  delivered. read_evidence returns bounded content and then updates deliveredIds. Distinct-call-ID
  repeat reads count toward tool budget while delivered aliases are deduplicated.
- Runner caps calls at 3 model / 4 tool, 60 s per model / 1 s per tool / 120 s per run,
  32,000 code points per serialized request and 4,096 requested output tokens. Third-call tools
  are refused. No retry. Over-budget tool responses are not marked delivered or sent onward.
- Final output passes existing strict JSON/schema validation, then citations against only delivered
  aliases and their bindings, then canonical ID restoration. Empty findings remain valid.
- Per-run in-memory state and safe trace are isolated across concurrent runs. Cancellation and
  timeouts abort step signals, reject promptly even if a provider ignores abort, and discard late
  responses. No raw prompts/output/errors are logged or persisted by production modules.
- Validation: typecheck PASS; 30 test files / 374 tests PASS (74 new tests in 4 files);
  production build PASS; git diff --check PASS. Frozen paths were compared with
  d5-desktop-reasoning and have no changes.
- Limits: actual model compliance, semantic entailment and real provider cancellation remain untested.
  Character budgets are not token or monetary guarantees; synchronous JS cannot be forcibly preempted.
  G1/G2 is accepted as a separate runtime milestone before the G3 adapter.
- Pre-G3 review confirmed all five identity/delivery/atomicity/trace boundaries. Existing privacy
  tests now explicitly check every canonical evidence ID and forbidden identity key in read_metrics,
  alias-only read_evidence output and safe failure metadata; the test count remains 374.

See [updated D5-G blueprint](design/d5-g-blueprint.md) for the contract and implementation sequence.

---

# D5-F Historical Acceptance

| Field | Result |
|---|---|
| Date | 2026-09-12 |
| Stage | D5-F Real Provider / Service / Desktop Integration |
| Status | **PASS — controlled desktop reasoning; known limits retained** |
| Baseline | `30fdaaf` / `d5-reasoning-core` |
| Recovery tag | `d5-desktop-reasoning` |

## Implementation

- User-selected first adapter: DeepSeek (`deepseek-flash`). Adapter lives under `src/main/providers`, outside frozen Core.
  No SDK/dependency added; production injects Electron `net.fetch` for system proxy use.
- Main environment configuration only: no secret IPC, Renderer settings, localStorage,
  committed .env, provider-response logging or secret getters. UI receives safe status
  (provider/model/configured/message). Endpoint accepts only HTTPS api.deepseek.com (root or /v1 base path), with no URL credentials/query/redirect following.
- Adapter sends two prompt messages, JSON-object mode, thinking disabled, no streaming,
  no tool calling, 4096 output-token limit. Timeout is 60 seconds; response envelope
  limited to 1 MB. HTTP/auth/rate-limit/network/timeout errors become safe error codes.
  Truncated, empty and tool responses fail. No retry or automatic request on startup.
- ReasoningService accepts only accountId/conversationId/days (1–31). It creates the
  ContextPack through InteractionAnalysisService, injects the provider into the unchanged
  InteractionReasoner, and returns only validated reasoning with its exact local citation
  context. No-data/configuration errors avoid calls; a busy gate prevents concurrent calls.
- New status/generate IPC channels use narrow Preload methods. Main checks sender window,
  main frame and exact application URL. Navigation/new-window creation is blocked.
  Renderer cannot submit prompts, keys, endpoints, evidence or ContextPacks.
- New ReasoningPanel has readiness, cost/data disclosure, loading/error states, empty
  finding handling and expandable canonical D4 citations with original text/messageId.
  Scope-keyed remounting discards old results and suppresses stale asynchronous updates.
- Frozen D4 contracts/analytics and D5 Core remain unchanged. No multi-agent/tool calling.

## Acceptance Evidence

- Baseline: typecheck PASS, 21 test files / 230 tests PASS.
- Final automated checks: typecheck PASS, 26 test files / 300 tests PASS, build PASS.
  Added 70 tests across request validation, config/HTTP adapter, Service integration and
  Renderer static rendering. Vitest now includes .test.tsx files with automatic JSX.
- Follow-up: accept empty tool_calls arrays as text responses; show safe JSON/field/envelope
  diagnostics on rejected output. A live attempt failed exact-key validation at
  alternativeExplanations[0]. DeepSeek now receives explicit per-object field constraints
  and a pre-output checklist; validators remain unchanged and no output repair or automatic
  retry is performed. Three adapter/service regressions cover extra confidence, missing id
  and claim substituted for explanation. The rejected historical response was not retained;
  its specific missing/extra keys cannot be established retrospectively. The Service now
  reports missing schema keys and known extra keys, counting arbitrary names without
  exposing them. Raw output is request-local only, never persisted or returned on failure.
- Adapter tests use injected HTTP stubs: request shape, JSON mode, headers, safe endpoints,
  safe errors, timeout/no retry, response limits and malformed/truncated responses.
- Integration: synthetic Demo → in-memory SQLite → Service → actual adapter protocol
  with stubbed transport → Core → validated canonical citations PASS. These are not
  claims of successful calls to the real DeepSeek service.
- Earlier GUI smoke check covered missing-key status and disclosure before the provider switch.
- Live diagnosis on 2026-09-12: current source + local credentials + official deepseek-flash
  passed contract and citation checks on two synthetic Demo requests (fixed reference time
  and current-time 7-day window). A third request from the restarted Electron GUI also
  passed, displaying 45 analyzed messages, detected status, findings, alternatives and
  uncertainties. Expanded semantic counter evidence showed canonical D4 ID, messageId and
  source excerpt. No real user conversation was used for these checks.
- The pre-diagnosis Electron process started after the updated prompt build, so stale Main
  code was ruled out for the reported failure. Current live checks did not reproduce that
  response. Passing calls do not establish future schema compliance: JSON-object mode
  guarantees JSON syntax, not the exact application contract. Frozen validators are intact.

## Local Configuration for Live Verification

Create the repository-external configuration using the interactive script:

```zsh
cd /Users/lbld/Documents/ChatGPT/Wememo
zsh scripts/configure-deepseek.zsh
source "$HOME/.config/wememo/deepseek.env"
pnpm dev
```

The script prompts for base URL, model ID and a hidden API key, saving a plaintext file
with permissions 600 in a directory with permissions 700. It refuses to overwrite an
existing file. The key is not part of shell command history. Main reads environment
variables on startup; the file must be sourced in the same terminal before launching.

- `WEMEMO_DEEPSEEK_API_KEY`: takes precedence over `DEEPSEEK_API_KEY`.
- `WEMEMO_DEEPSEEK_MODEL`: defaults to `deepseek-flash`.
- `WEMEMO_DEEPSEEK_BASE_URL`: defaults to `https://api.deepseek.com`.
  Only the official HTTPS host with an empty or `/v1` base path is accepted.
- Request uses `thinking: { type: 'disabled' }` and JSON-object output mode.

Select the synthetic Demo and click “生成关系变化解释” to send its selected evidence.
Expand findings and alternatives to inspect canonical citations.

Protocol checked against [DeepSeek quick start](https://api-docs.deepseek.com/)
and [Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion/).

## Remaining Limits

- The earlier exact-key failure remains unreproduced. JSON mode does not guarantee the
  exact schema; invalid model outputs continue to be rejected with safe field diagnostics.
- No in-app key storage or settings editor; no cancel/retry/streaming UI. Switching
  conversation hides the old result but an already sent request may still incur cost.
- Existing prompt-only semantic safety and evidence-selection limitations remain.
- The earlier D2 header is unchanged. This milestone freezes the controlled DeepSeek
  desktop path. PASS means valid outputs reach the GUI with traceable citations and invalid
  outputs are rejected; it does not promise every model response conforms to the schema.
  D5-G implementation is outside this milestone.

---

The following D5 Core, D4 and D1 sections are historical acceptance records.

# D5-A–E Historical Record

| Field | Result |
|---|---|
| Date | 2026-09-12 |
| Stage | D5-A–E Reasoning Core |
| Status | **PASS** |
| Baseline | `d3509d6` / `d4-evidence-layer` |

## Contracts and Pipeline

- Reasoning Contract Version: `wememo-interaction-reasoning-v1`.
- Reasoning Prompt Policy Version: `wememo-reasoning-prompt-v1`.
- Provider abstraction receives only systemPrompt/userPrompt/responseFormat and
  returns text/providerId/optional modelId. Mock Provider only; it returns a fixed
  response and records callCount and a copied lastRequest for tests.
- InteractionReasoner accepts only AnalysisContextPack. Ordered pipeline:
  context validation → detached snapshot → prompt builder → provider → strict JSON
  parser → output validator → citation validator → canonical-ID reasoning result.
  Snapshotting before await prevents later caller changes affecting citation checks.
- Provider failure, JSON parse failure, reasoning schema failure, invalid context
  and invalid citation have distinct error types. No automatic repair, retry or streaming.
- Output has summary, cited findings with qualitative low/medium/high confidence,
  cited alternativeExplanations and nonempty uncertainties. Exact-key validation
  rejects extra fields, missing citations, duplicate IDs and numeric confidence.
  Empty finding/alternative arrays are allowed when the prompt lacks usable evidence.

## Prompt Privacy and Evidence Identity

- A real D4 integration conflict was identified: semantic evidence IDs embed accountId
  and conversationId. The user selected D5-local aliases rather than changing frozen D4.
- Prompt catalog uses request-local `evidence-N` aliases. `allowedEvidenceIds` contains
  exactly the aliases actually sent. `evidenceIdBindings` keeps alias → original D4 ID
  locally and is never passed to the provider. Citation validation restores canonical
  IDs in the returned result, preserving original message provenance through D4.
- No scope, sender IDs/names, source message IDs, generatedAt or full Context snapshot
  is sent. Observations use local IDs and only selected evidence references. Exact
  scope identifier occurrences in labels/excerpts/summaries are redacted as well.
- Provider-facing JSON contains versions, windows, coverage, unchanged metrics,
  observations and selected evidence with direction/label and bounded source text.

## Prompt Policy and Grounding

- Language zh-CN; maximum 24 evidence items; maximum 500 Unicode code points per
  source excerpt; maximum 12,000 code points for the entire serialized evidence catalog
  (including metadata and JSON escaping). No tokenizer or third-party dependency.
- Stable round-robin visits support/counter/context groups. Each item's source payload
  is conservatively limited to reserve room for other groups. Excerpts expose truncation
  flags and omitted source counts. Skipped evidence is absent from both catalog and
  observation references; input Pack is never modified.
- Evidence excerpts, labels and summaries are untrusted quoted data, JSON-encoded and
  separate from system instructions. System policy forbids following embedded instructions,
  psychological conclusions and equating behavioral decline with relationship deterioration.
  It requires consideration of counter/context, uncertainty and insufficient-data limits.
- Citation validation checks actual prompt exposure and direction, not merely membership
  in the original Pack. Every finding needs at least one support citation. Alternatives
  may use only counter/context, including rejection of mixed support+context alternatives.
- Unknown IDs, budget-omitted IDs, duplicate citations and canonical-ID bypass of aliases
  fail. Local bindings must be complete, unique and reference real Pack evidence.

## Validation

- Starting worktree clean at D4: typecheck PASS, 15 files / 145 tests PASS, build PASS.
- Final: typecheck PASS; 21 files / 230 tests PASS (85 new tests); build PASS.
- Tests cover Mock behavior, exact output schema, JSON-only parser, scope privacy,
  reversible aliases, Unicode and serialized-catalog budgets, direction balance,
  injection encoded as data, budget-omitted citations, provider-not-called on invalid
  context, provider failures and snapshot stability.
- Demo JSON → in-memory SQLite → InteractionAnalysisService → ContextPack → Reasoner
  → Mock → validated canonical citations PASS. Citations derive from actual selected
  evidence, not hardcoded Demo IDs. No real model or network request was used.
- No real model API. No IPC/UI integration yet. GUI validation is not required for this
  stage. D4 contracts, deterministic logic, IPC, Renderer and package dependencies unchanged.

## Known Limits and Review State

- Citation checks prove existence/exposure/direction, not whether natural-language claims
  are logically entailed. Psychological and insufficient-data language restrictions are
  prompt instructions, not an automated semantic judge. Mock tests cannot demonstrate
  a real model's resistance to prompt injection.
- Evidence budget is measured in characters, not tokens, and bounds the catalog rather
  than the whole prompt. Text may contain personal information beyond exact scope IDs;
  this is data minimization, not comprehensive anonymization.
- Aliases are local to one prompt. Always retain that prompt's bindings through validation;
  only canonical IDs leave the Reasoner. JSON parsing follows JSON.parse semantics and
  does not implement a separate duplicate-object-key detector.
- No provider timeout, network adapter, model selection, credentials, tool calling,
  entailment judge or D5-F UI was added. No unresolved implementation/test blocker.
- Changes remain local for review. No commit, tag or push performed for D5-A–E.

---

The following D4 and D1 records are historical acceptance records.

# D4-D Historical Record

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

