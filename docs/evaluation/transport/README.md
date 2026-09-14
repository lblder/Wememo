# D6-P0 Provider Transport Qualification

Independent protocol diagnostics, excluded from V0 reliability/quality denominators.
The old eight-run batch is preserved under `../reliability/2026-09-14-live-v0/`; its
`disposition.json` labels it `2026-09-14-live-v0-preflight`, status
`transport qualification failed`, and hashes every original artifact. Do not resume it.

## Frozen controls

- A: Direct V0 request, no tools, N01 synthetic Demo, five calls.
- B: Initial Agent V0 request with unchanged catalog-only prompt and two tools, five calls.
- C: Second-round request with locally constructed assistant tool calls and Main-produced
  tool results, five calls. The two calls (`read_metrics`, `read_evidence`) pass the existing
  whole-batch validator first. Read evidence contains one support, counter and context alias.
  The second-round request retains `tool_choice: auto`. A further tool proposal is a valid
  protocol response, but is not executed in this transport-only probe.
- C history is a deterministic protocol fixture, **not** a claimed model-generated tool
  selection. This isolates continuation availability even when B fails. Total: 15 HTTP calls,
  not 15 Agent sessions or 20 calls. All groups run sequentially with zero retries.
- Existing model configuration and official endpoint; `thinking: disabled`, temperature
  omitted, stream false, max_tokens 4096, existing 60-second model deadline. No repair,
  Prompt changes, schema/citation-policy changes, tool additions or budget changes.
- `frozen-boundaries.json` verifies 19 relevant source files against `d6-eval-harness-v1`.
  Manifests record source hashes, exact configured model, fixture hash and Git HEAD.

## Diagnostics and interpretation

Each attempted call records provider/model, phase, duration, HTTP status when received,
outcome and a fixed safe failure code. DNS, connection reset, connection failure, timeout,
cancel, body failure and API-envelope decode failure are distinct. `CURLE_RECV_ERROR`
means a receive failure; it does not by itself prove a TCP reset. Native ECONNRESET does.
Successful HTTP 200 can still fail envelope decoding, so HTTP and protocol pass are separate.
Protocol pass does **not** assert that final answer JSON or evidence citations are valid.

Only whitelisted transport/error names are retained. `retry-after` accepts integer seconds
up to 86400; other formats are omitted. Request-ID values are hashed (SHA-256), never stored
verbatim. HTTP bodies and error messages are never inspected for logging. The curl adapter
drains stderr, retains only the final response's selected diagnostic headers in memory,
and sends credentials via stdin and request content through a separate descriptor.

No API key, Authorization value, Prompt, excerpt, tool result, chat text, raw Provider body,
account/conversation/message/sender identifier or raw request ID enters the probe artifacts.
The existing D6 `provider_error` classification remains compatible; `providerDiagnostics`
provides the additional per-call breakdown without changing the evaluation funnel.

## Commands

```sh
node scripts/qualify-provider-transport.mjs --mock --out NEW_OFFLINE_DIRECTORY

set -a
source /Users/lbld/.config/wememo/deepseek.env
set +a
node scripts/qualify-provider-transport.mjs --live \
  --proxy http://127.0.0.1:7897 --out NEW_LIVE_DIRECTORY
```

Output directory creation is exclusive, before API calls. `requests.jsonl` is appended
after every call before proceeding; `report.json` has group-wise status/code distributions.
Exit 0: all protocol responses accepted. Exit 2: one or more protocol/transport failures
were measured. Exit 1: setup/persistence/invariant failure. Exit 130: interrupted.
There is no retry or automatic transition to canary/V0. Freeze the code with local tag
`d6-provider-diagnostics-v1` before live probes; do not move earlier tags.

## Official protocol review (2026-09-14)

The current [DeepSeek first-call page](https://api-docs.deepseek.com/) lists `deepseek-flash`
and describes the older flash model names as aliases. The existing configured model is
therefore retained. [Thinking mode documentation](https://api-docs.deepseek.com/guides/thinking_mode/)
requires reasoning_content to be carried through history when thinking and tools are used,
and documents HTTP 400 if it is missing. Both current Wememo encoders explicitly disable
thinking. This requirement is not evidence that it caused the old failures; two of those
failed before any continuation existed.

[Official error codes](https://api-docs.deepseek.com/quick_start/error_codes/) distinguish
400 format, 401 authentication, 402 balance, 422 parameters, 429 rate, 500 server and 503
overload. No suggested retry from the documentation is adopted inside these experiments.
The precise causes of the three historical `provider-unavailable` errors cannot be recovered
because their original HTTP/transport metadata was discarded.
