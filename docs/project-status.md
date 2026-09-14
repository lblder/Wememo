# D6-P0: Provider Transport Diagnostics

- Added safe per-call diagnostics for HTTP status, DNS/connection failures, timeouts,
  explicit cancellation, body reading and envelope decoding. Existing runtime error codes
  and all Prompt/Validator/tool/budget policies remain unchanged.
- Request IDs are hashed; retry-after is limited to bounded integer seconds. No request,
  response body, excerpt, scope, credentials or raw error text enters diagnostic records.
- Independent A/B/C qualification CLI: five sequential calls per group, zero retries.
  C uses locally constructed, validated two-tool history to test second-round protocol
  independently of initial model tool selection. It is not an Agent E2E or quality score.
- Verification: **50 test files / 687 tests PASS**, typecheck and production build PASS.
  Actual offline CLI persisted all 15 rows and passed source/hash/persistence checks.
- Old 8-run canary is permanently preserved as `2026-09-14-live-v0-preflight`, status
  `transport qualification failed`. All original artifact hashes are in its new disposition
  sidecar; no original metrics were rewritten. Future V0 must restart from zero.
- Frozen before live calls: `b3c327b` / `d6-provider-diagnostics-v1` (local).
- Real qualification completed **15/15 HTTP 200**, five calls per group. A returned final
  messages; B and C returned tool_calls. C's further calls were not executed. Average
  latency: A 4.626 s, B 2.237 s, C 1.856 s. All persistence/source/HEAD checks passed.
- No HTTP/transport failures were reproduced. The old three failures cannot be identified
  retrospectively. This is a protocol result, not a final schema/citation or quality score.
- No new canary, V0 continuation, Prompt experiment, manual grading or remote push occurred.

See [P0 method and commands](evaluation/transport/README.md) and
[real A/B/C results](evaluation/transport/2026-09-14-live-p0/summary.md).

---

# D6 V0 Canary — Stopped Before the Remaining 72 Runs

| Field | Result |
|---|---|
| Date | 2026-09-14 |
| Frozen harness | `2d7b755` / `d6-eval-harness-v1` (local, not pushed) |
| Status | **Canary connectivity check failed; 8/80 completed, 72 not started** |
| Provider | DeepSeek / `deepseek-flash`, frozen V0 and parameters |

- The harness was committed and tagged before any live call. Pre-freeze verification passed
  47 test files / 616 tests, typecheck, build and a complete 8 + 72 offline canary exercise.
- The live canary completed 6 Normal and 2 Stress runs with 12 Provider calls and 9 normal
  returns. Three Agent runs encountered provider-unavailable; the frozen connectivity gate
  correctly stopped the batch. Persistence, failure classification, source hashes and commit
  consistency checks passed. No code, Prompt, model parameters, data or runtime policy was
  changed during these calls or before the original canary report. No retries or additional API probes were made.
- Normal canary: Direct E2E 1/3, Agent 0/3. Stress canary: Direct 1/1, Agent 0/1. These are
  actual canary counts, not the planned full-set 30/30 and 10/10 denominators.
- Two Agent failures occurred before any tool proposal. Of the two runs meeting the
  predeclared retrieval targets, one failed final citation direction and one failed its last
  Provider call. Provider failures are not counted again as independent tool-policy failures.
- Existing safe errors do not retain HTTP status or curl exit codes, so the specific
  network/server cause remains undetermined. This batch cannot establish stable connectivity
  or select a Prompt variant. Human scoring is deferred; the two valid answers remain unscored.
- The frozen tag is unchanged and no push occurred. Only this status note and the live
  canary artifacts are new local changes. This batch is now permanently classified as preflight and excluded from future V0;
  its remaining 72 runs will not be resumed.

See [canary tables and failure distribution](evaluation/reliability/2026-09-14-live-v0/summary.md)
and [all eight raw metric records](evaluation/reliability/2026-09-14-live-v0/report.json).

---

# D6: Real-Model Reliability Evaluation v2

| Field | Result |
|---|---|
| Date | 2026-09-14 |
| Stage | Independent reliability harness, Normal/Stress repeats, Prompt variants and human review |
| Status | **Harness and canary checks PASS; V0 live baseline authorized; human review deferred** |
| Verification | **47 test files / 616 tests PASS**, typecheck PASS, production build PASS |
| Frozen A | `68764c1` — desktop evidence question and evaluation harness |
| Frozen B | `da6541c` — provider settings and reasoning diagnostics |
| Frozen C | `4c68163` — independent structured-output research and experiments |

- The three requested commits were created separately on local main. Every pre-commit full
  baseline passed typecheck, 543 tests, build and diff checks. Commit A was additionally
  verified as an independent 491-test snapshot. No tag was moved or created; no push occurred.
  The working tree was clean after Commit C, before starting the independent D6 changes.
- D6 defines 10 Normal questions × 3 repeats × 2 modes and 5 Stress questions × 2 repeats
  × 2 modes: 80 runs per Prompt variant. V0 is unchanged; V1 adds exact fields, V2 adds a
  checklist to V1, V3 adds a short shape example to V1. Variant/path order rotates.
- The observational funnel distinguishes JSON, fields, all citation scopes and directions,
  retaining null for unattempted checks and the original runtime error. It separates
  unknown aliases from catalog-only aliases and distinguishes support-only from mixed
  invalid alternatives. Frozen runtime acceptance remains mandatory.
- Retrieval proxies record predeclared material availability and delivery separately from
  final validity. Conditional summaries show output failures after retrieval targets are met.
  Local synthetic injection/context-only snapshots do not alter production Builders or data.
- Reports are written to new directories with per-run checkpoints, controlled cancellation,
  source/input hashes and no retries. Only validated synthetic answers receive separate
  human-review artifacts; all four scores start null. No automatic judge or quality claim.
- Final verification added 64 tests covering the ordered funnel, mixed failures, exact-field
  distinctions, catalog-only citations, direction errors, atomic tool batches, final-round
  budget, 429, no-data, cancellation/late response, timeout, variant scheduling and human
  ratings. The actual CLI completed **320/320 Mock runs** (Normal 240 / Stress 80) across
  V0–V3; source hashes and all distinct scheduled tuples were checked. This is a harness
  result, not model compliance. Empty human input remains 0 reviewed / 320 eligible.
- The authorized canary gate adds 9 tests. A complete offline canary run paused after
  6 Normal + 2 Stress, verified persistence/hashes and continued the remaining 72 with
  no duplicates. The full 80-row schedule and original pair indices are recorded.
- D6 changes are isolated under evaluation and CLI documentation. Production Renderer, IPC,
  Provider, Reasoner, Agent Runner, validators and policy budgets remain unchanged from B.
  The user authorized 80 V0 real runs with an 8-run canary gate; no D6 real API calls
  have occurred at harness freeze. Prompt, model parameters, validators and budgets are unchanged.

See [D6 methodology, commands and human rubric](evaluation/reliability/README.md) and
[complete offline ablation metrics](evaluation/reliability/2026-09-14-mock-ablation/report.json).
D6 harness and its canary gate are being frozen as a separate local commit with the
`d6-eval-harness-v1` tag before any real V0 call. Human scoring remains deferred.
The earlier sections below record their implementation-time state; A/B/C are now committed.

---

# Model Settings and Failure Diagnostics

| Field | Result |
|---|---|
| Date | 2026-09-14 |
| Stage | TraceMemo-inspired configuration separation and failure observability |
| Status | **Implementation, automated checks and isolated desktop smoke PASS** |
| Verification | **42 test files / 543 tests PASS**, typecheck PASS, production build PASS |

- Added an application-level “模型设置” panel for the official DeepSeek base URL,
  model ID and write-only API key. Main owns configuration and injects providers into
  both existing reasoning services. Saving applies immediately without a model request.
  Saved configuration takes precedence over startup environment configuration; explicit
  blank-key saving can migrate an active environment key. Existing environment files are
  not modified. Unreadable saved configuration fails closed and can be replaced with an
  explicitly supplied new key.
- Main separates public metadata from randomly named encrypted credential files in the
  Electron user-data directory. Asynchronous OS safeStorage encryption, private file
  permissions, bounded reads and validated paths are used. New ciphertext is staged before
  the metadata pointer is switched; a failed switch preserves the old configuration.
  Unavailable secure storage does not fall back to plaintext. Saving and model tasks are
  mutually exclusive. Renderer receives safe status only; no key-reading IPC was added.
- Added shared safe diagnostics for JSON syntax, exact fields, undelivered citations,
  citation direction and local binding failures. Both desktop flows explain the rejection
  stage without displaying the rejected answer. Diagnostics carry fixed labels and known
  schema field names, never raw model output, credentials, scope or canonical evidence IDs.
- Evaluation v2 records JSON syntax and field validation separately, retaining combined
  schema results and explicit citation denominators. Unattempted checks remain null;
  historical v1 reports and the 15 questions are unchanged. The new mock comparison passed
  **30/30 planned runs**. This validates the harness, not real-model reliability.
- The actual Electron application was exercised with an isolated user-data directory,
  a synthetic key and synthetic Demo messages. Renderer save, cleared password input,
  encrypted disk files, busy-save rejection, JSON/citation failure displays and hidden
  rejected output passed. A second process loaded and decrypted the saved settings.
  Network transport was mocked: **2 simulated provider requests, 0 real API requests**.
  Subsequent storage edge-case refinements passed the final automated suite above.
- D4 analytics, D5 reasoning contracts/validators, both DeepSeek adapters and Agent tools,
  prompts, selection and budgets remain unchanged. The Runner only adds safe diagnostic
  metadata after an existing rejection. No JSON repair, citation repair or retry was added.
  No Python runtime service, extra tool or knowledge worker was introduced in this scope.
- This milestone and the earlier G4/G5 work remain local and uncommitted. No commit, tag
  or push was performed. Real model compliance remains as measured in the earlier reports.

See [model settings and failure diagnostics](model-settings.md),
[evaluation methodology](evaluation/README.md),
[v2 mock results](evaluation/reports/2026-09-14-diagnostics-v2-mock.json) and
[isolated desktop smoke record](evaluation/reports/2026-09-14-model-settings-desktop-smoke.json).
The design reference is the [fixed-version TraceMemo source review](research/tracememo-structured-output-backend-review-2026-09-14.md).

---

# D5-G G4/G5 Desktop and Evaluation

| Field | Result |
|---|---|
| Date | 2026-09-13 |
| Stage | Desktop Evidence Question + fixed paired evaluation |
| Status | **Implementation and automated checks PASS; live model reliability NOT established** |
| Frozen G3 | `1eb76bd` / `d5-g-deepseek-adapter` (local; not pushed) |
| Frozen G1/G2 | `71aabdf` / `d5-g-agent-runtime` (unchanged) |

- Added a separate EvidenceQuestionService, exact four-field request contract, three narrow
  status/ask/cancel IPC methods, Preload methods and an independent “证据追问” panel.
  Renderer submits only question/accountId/conversationId/days. Main creates and validates
  the snapshot; it injects the frozen Runner and G3 adapter using Electron net.fetch.
- IPC checks the existing trusted window/main frame/URL boundary. Cancellation takes no
  Renderer target ID; Main derives the owner from the IPC event. One active question is
  permitted. Scope unmount, navigation, renderer termination and window close cancel work.
  Late answers cannot overwrite a cancelled or newly selected scope's UI.
- UI provides running/success/invalid-model-output/invalid-citation/provider-error/timeout/
  budget-exceeded/cancelled states plus local request errors. Fixed messages distinguish
  authentication, rate limits, tool argument failures and missing data. Failed responses carry
  no result or raw output. Successful citations reuse the canonical D4 evidence view.
- Added 15 fixed questions across five categories and a runnable, default-offline evaluation
  CLI. Direct QA and Agent use the same immutable synthetic snapshot and question with
  alternating order. Reports distinguish unattempted checks from failed checks and record
  every run, safe errors, calls, latency and explicit rate denominators. No automatic retry,
  JSON repair, citation repair, secret/raw-response logging or extra tools were added.
- Automated checks: typecheck PASS; **36 test files / 491 tests PASS** (74 added);
  production build PASS; git diff --check PASS. New coverage includes service/IPC injection,
  owner-only cancellation, late response handling, all UI error states, SQLite integration,
  paired snapshots, denominator accounting, no-data exit and evaluation interruption.
- Live evaluation: **30/30 planned runs completed**, DeepSeek flash, fixed synthetic Demo,
  curl local-proxy transport. Direct QA: schema 7/15, citation 2/7, end-to-end 2/15,
  15 model calls, average 6.17 s. Agent: schema 6/13, citation 0/6, end-to-end 0/15,
  40 model calls, 39 tool calls, average 10.53 s. Agent had two pre-final budget exits.
  All 28 invalid results were rejected. No settings or validators were changed after seeing
  these failures. Quality/entailment/psychological-boundary compliance were not scored.
- Desktop smoke check completed after explicit user authorization: one click on the synthetic
  50-message Demo, question “回复变慢还有其他解释吗？”, current-time 7-day comparison.
  The actual Electron net.fetch path made 3 model calls and 4 tool reads, delivered 18
  evidence items, and finished in 11.0 s (displayed precision). Final schema validation
  passed but citation validation failed. UI showed “证据引用校验失败” with the specific
  invalid-citation code and execution counts; no rejected answer was displayed. No retry.
  This checks the live desktop failure path; live success/cancellation UI paths were not
  exercised by this one request. Their automated coverage remains as recorded above.
  This supplemental GUI run is separate from the fixed 30-run CLI comparison.
- G4/G5 changes remain local for review. No G4/G5 commit/tag/push or final d5-g tag has
  been created. This milestone exposes and measures failures; it does not claim the model
  is ready for dependable end-user answers.

See [evaluation methodology and measured comparison](evaluation/README.md) and
[complete metrics report](evaluation/reports/2026-09-13-live.json).
The authorized desktop result is recorded in [GUI smoke metrics](evaluation/reports/2026-09-13-gui-smoke.json).

---

# D5-G G3 Adapter Verification

| Field | Result |
|---|---|
| Date | 2026-09-12 |
| Stage | Standalone DeepSeek native tool-calling adapter |
| Status | **PASS — protocol milestone; model compliance remains unproven** |
| Recovery tag | `d5-g-deepseek-adapter` |
| Frozen runtime | `71aabdf` / `d5-g-agent-runtime` (local commit and tag; not pushed) |

- Added `src/main/providers/deepseek-tool-calling-provider.ts` and its tests. G1/G2,
  D4, D5 Core, D5-F adapter, shared contracts, IPC, Preload and Renderer are unchanged.
  The adapter is not wired into the desktop entry point. No dependency was added.
- Translates the existing port into DeepSeek function definitions, assistant tool_calls,
  and tool replies paired by tool_call_id. Raw function argument strings and final text
  pass through unchanged; no permission checks, execution, output repair or alias remapping
  occur in the adapter. The Runner remains authoritative for the whole batch and citations.
- Uses the existing Main-only official-endpoint configuration. HTTPS, secret header and
  redirect refusal remain enforced. Thinking is disabled; tool_choice and output token
  limits come from the Runner. Final-only turns request JSON-object mode; auto turns permit
  native tool selection with the unchanged Agent system prompt specifying final JSON.
- No provider-owned retry, timeout, history or trace. The Runner's AbortSignal reaches the
  injected fetch transport; late responses are discarded. HTTP envelopes are bounded to
  1 MB. Authentication/429/network failures map to safe existing port codes. Malformed,
  truncated or refused API envelopes use DeepSeekToolProtocolError with the existing
  provider-unavailable code, preserving the frozen port. Invalid final JSON/schema/citations
  continue through the Runner's existing invalid-output/invalid-citation rejection paths.
- Automated verification: 43 new offline adapter tests; 31 test files / 417 tests PASS;
  typecheck, production build and git diff --check PASS. Tests cover request/history
  translation, raw arguments, protocol failures, HTTP errors/no retry, response bounds,
  cancellation/timeout, native tool round trips, atomic unknown-tool rejection, and final
  malformed JSON, extra fields and catalog-visible-but-undelivered citations.

## Real Protocol Check

- Used the existing local DeepSeek credentials with `deepseek-flash` and the synthetic
  Demo fixture only (50 analyzed messages at its fixed reference time). A temporary CLI
  harness loaded the actual adapter and frozen Runner. It injected a curl transport to
  use the local proxy; this verifies live HTTP protocol, not Electron transport or UI.
  Keys were passed through stdin, never process arguments. Raw responses stayed in memory;
  diagnostics emitted only phases, counts and fixed validation reasons. Every outgoing
  request passed checks excluding scope values and all canonical evidence IDs.
- Four manual runs, with no automatic retry or validator change: the first three used a
  broad question and were rejected (two invalid-output, one invalid-citation). The second
  was specifically diagnosed as invalid JSON; the first response was not retained for
  detailed diagnosis. The third passed schema validation but failed citation validation.
- The fourth used a short question requesting one support and one context evidence.
  The model selected aliases and issued native read_metrics plus read_evidence calls;
  the runtime returned two delivered aliases. On model call 2, one finding and one
  alternative explanation passed strict schema/direction/delivery checks, and their IDs
  were restored to canonical D4 evidence IDs. Model calls: 2; tool calls: 2; delivered: 2.
- This establishes the requested protocol loop. It does not establish stable output
  compliance or answer quality. The broader-question failures remain a G4/G5 evaluation
  concern; no malformed or ungrounded result was accepted. Real cancellation under network
  load and the Electron integration have not been exercised in this stage.

Protocol references: [DeepSeek Tool Calls](https://api-docs.deepseek.com/guides/tool_calls/),
[Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion/),
and [JSON Output](https://api-docs.deepseek.com/guides/json_mode/).

---

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
