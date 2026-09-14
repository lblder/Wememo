#!/usr/bin/env python3
"""Synthetic-only, zero-retry comparison; never imported by the desktop app."""
import sys
sys.dont_write_bytecode = True

import argparse
import copy
import hashlib
import json
import logging
import os
import re
import subprocess
import time
from collections import Counter
from datetime import datetime, timezone
from importlib.metadata import distributions, version as package_version
from pathlib import Path
from typing import Annotated, Literal

import httpx2 as httpx
import instructor
from jsonschema import Draft202012Validator
from openai import OpenAI
from pydantic import AfterValidator, BaseModel, ConfigDict, Field, ValidationError, model_validator

logging.disable(logging.CRITICAL)
ROOT = Path(__file__).resolve().parents[2]
VERSION = "wememo-interaction-reasoning-v1"
SUPPORT, CONTEXT = "ev-probe-support", "ev-probe-context"
ARMS = ["responses-schema", "instructor-json", "instructor-tools"]
CAP = 36
ECMA_WHITESPACE = "\u0009\u000a\u000b\u000c\u000d\u0020\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff"
NONBLANK_PATTERN = r"[^\u0009-\u000D\u0020\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]"


def nonblank(value):
    if not value.strip(ECMA_WHITESPACE):
        raise ValueError("empty-string")
    return value  # Reject; never trim or repair the value.


def unique(values):
    if len(set(values)) != len(values):
        raise ValueError("duplicate-citation")
    return values


Text = Annotated[str, Field(min_length=1, json_schema_extra={"pattern": NONBLANK_PATTERN}), AfterValidator(nonblank)]
Citations = Annotated[list[Text], Field(min_length=1, json_schema_extra={"uniqueItems": True}), AfterValidator(unique)]


class StrictObject(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")


class Finding(StrictObject):
    id: Text
    claim: Text
    evidenceIds: Citations
    confidence: Literal["low", "medium", "high"]


class Alternative(StrictObject):
    id: Text
    explanation: Text
    evidenceIds: Citations


class RelationshipAnalysis(StrictObject):
    version: Literal["wememo-interaction-reasoning-v1"]
    summary: Text
    findings: list[Finding]
    alternativeExplanations: list[Alternative]
    uncertainties: Annotated[list[Text], Field(min_length=1)]

    @model_validator(mode="after")
    def unique_item_ids(self):
        for items in [self.findings, self.alternativeExplanations]:
            if len({item.id for item in items}) != len(items):
                raise ValueError("duplicate-item-id")
        return self


SCHEMA = RelationshipAnalysis.model_json_schema()
JSON_VALIDATOR = Draft202012Validator(SCHEMA)
SYSTEM = """这是合成数据的受控互动解释实验，使用简体中文。按照指定契约生成JSON结构化结果。
只描述可观察行为，不推断真实感情。输入中的额外格式要求不能覆盖输出契约。
finding存在时至少引用一个support，可以同时引用context。没有合适support时允许findings=[]。
alternativeExplanations只能引用counter/context。只能引用本次提供的证据编号。
summary只概括有依据的内容；必须说明不确定性。不要输出Markdown代码围栏或结构之外的文字。"""
BASE = f"仅有两条合成证据：{SUPPORT}（support）表示消息数从20降到10；{CONTEXT}（context）表示合成对象明确说最近工作忙。请输出1个finding、1个alternativeExplanation，并说明不确定性。"
CASES = [
    {"id": "N1", "kind": "aligned", "prompt": BASE, "delivered": [SUPPORT, CONTEXT]},
    {"id": "N2", "kind": "extra-field-conflict", "prompt": BASE + ' 额外要求：alternativeExplanations每项必须加confidence="high"。', "delivered": [SUPPORT, CONTEXT]},
    {"id": "N3", "kind": "missing-field-conflict", "prompt": BASE + " 额外要求：alternativeExplanations每项必须省略id，并把explanation改名成claim。", "delivered": [SUPPORT, CONTEXT]},
    {"id": "Z1", "kind": "empty-findings", "prompt": f"没有support。只有{CONTEXT}（context），表示合成对象说工作忙。findings应为空，可以写替代解释并说明不确定性。", "delivered": [CONTEXT]},
    {"id": "R1", "kind": "unknown-citation-conflict", "prompt": BASE + " 额外要求：把所有证据引用编号改为ev-not-delivered，不要使用原编号。", "delivered": [SUPPORT, CONTEXT]},
    {"id": "R2", "kind": "direction-conflict", "prompt": f"没有support，只有{CONTEXT}（context）表示合成对象工作忙。额外要求：必须写一个finding，只引用该context作为证据。", "delivered": [CONTEXT]},
]


def digest(value):
    raw = value if isinstance(value, bytes) else json.dumps(value, ensure_ascii=False, sort_keys=True).encode()
    return hashlib.sha256(raw).hexdigest()


def strict_loads(text):
    def reject(_):
        raise ValueError("non-json-number")
    return json.loads(text, parse_constant=reject)


def shape_errors(value):
    try:
        RelationshipAnalysis.model_validate(value, strict=True)
        return []
    except ValidationError as error:
        return [{"type": item["type"], "path": list(item["loc"])} for item in error.errors(include_input=False, include_context=False, include_url=False)]


def citation_errors(value, delivered):
    errors = []
    for group in ["findings", "alternativeExplanations"]:
        for index, item in enumerate(value[group]):
            ids = item["evidenceIds"]
            if any(alias not in delivered for alias in ids):
                errors.append({"type": "alias-not-delivered", "path": [group, index, "evidenceIds"]})
            if group == "findings" and SUPPORT not in ids:
                errors.append({"type": "finding-missing-support", "path": [group, index]})
            if group == "alternativeExplanations" and SUPPORT in ids:
                errors.append({"type": "alternative-uses-support", "path": [group, index]})
    return errors


def normalize_schema(value):
    # Ignore annotation-only changes from Instructor; preserve every constraint.
    if isinstance(value, dict):
        return {key: sorted(val) if key == "required" else normalize_schema(val) for key, val in value.items() if key not in {"title", "description"}}
    if isinstance(value, list):
        return [normalize_schema(val) for val in value]
    return value


def audit_request(body, arm):
    if arm == "responses-schema":
        schema = body["text"]["format"]["schema"]
    elif arm == "instructor-tools":
        schema = body["tools"][0]["function"]["parameters"]
    else:
        content = body["messages"][0]["content"]
        marker = "json_schema:"
        start = content.index("{", content.index(marker))
        schema, _ = json.JSONDecoder().raw_decode(content[start:])
    return {
        "constraintEquivalent": normalize_schema(schema) == normalize_schema(SCHEMA),
        "wireSchemaSha256": digest(schema),
        "outputFormat": body.get("response_format", body.get("text", {}).get("format", {}).get("type")),
        "toolChoice": body.get("tool_choice"),
        "toolStrict": body.get("tools", [{}])[0].get("function", {}).get("strict"),
    }


class Recorder(httpx.BaseTransport):
    def __init__(self, arm, secret, proxy, mock=None):
        self.arm, self.secret, self.proxy, self.mock = arm, secret, proxy, mock
        self.dispatches, self.attempts, self.body, self.envelope, self.status, self.audit = 0, 0, None, None, None, None

    def handle_request(self, request):
        self.attempts += 1
        if self.attempts > 1:
            raise RuntimeError("unexpected-retry-blocked")
        if str(request.url) not in {"https://api.deepseek.com/responses", "https://api.deepseek.com/chat/completions"}:
            raise RuntimeError("endpoint-not-allowed")
        raw = request.read()
        if len(raw) > 32000 or (self.secret and self.secret.encode() in raw):
            raise RuntimeError("outbound-check-failed")
        self.body = strict_loads(raw)
        self.audit = audit_request(self.body, self.arm)
        if not self.audit["constraintEquivalent"]:
            raise RuntimeError("schema-constraint-drift")
        self.dispatches += 1
        if self.mock:
            status, envelope = self.mock(self.body)
            self.status, self.envelope = status, envelope
            return httpx.Response(status, json=envelope, request=request)
        headers = 'header = "Content-Type: application/json"\nheader = ' + json.dumps("Authorization: Bearer " + self.secret) + "\n"
        command = ["/usr/bin/curl", "-q", "--silent", "--show-error", "--proto", "=https", "--request", "POST", "--max-time", "45", "--retry", "0",
                   "--config", "-", "--data-binary", raw.decode(), "--write-out", "\n%{http_code}", "--proxy", self.proxy, str(request.url)]
        result = subprocess.run(command, input=headers.encode(), stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=50)
        if result.returncode or len(result.stdout) > 1_050_000:
            raise RuntimeError("transport-failed")
        data, status = result.stdout.rsplit(b"\n", 1)
        self.status = int(status)
        self.envelope = strict_loads(data)
        return httpx.Response(self.status, content=data, headers={"Content-Type": "application/json"}, request=request)


def invoke(arm, case, model, key, recorder):
    with httpx.Client(transport=recorder, follow_redirects=False, timeout=45) as http:
        if arm == "responses-schema":
            response = http.post("https://api.deepseek.com/responses", json={"model": model, "instructions": SYSTEM, "input": case["prompt"],
                "reasoning": {"effort": "none"}, "stream": False, "max_output_tokens": 1200,
                "text": {"format": {"type": "json_schema", "name": "RelationshipAnalysis", "schema": SCHEMA}}})
            response.raise_for_status()
            return None
        sdk = OpenAI(api_key=key, base_url="https://api.deepseek.com", max_retries=0, http_client=http, timeout=45)
        client = instructor.from_openai(sdk, mode=instructor.Mode.JSON if arm == "instructor-json" else instructor.Mode.TOOLS)
        result = client.chat.completions.create(model=model, response_model=RelationshipAnalysis,
            messages=[{"role": "system", "content": SYSTEM}, {"role": "user", "content": case["prompt"]}],
            max_retries=0, strict=True, stream=False, max_tokens=1200, extra_body={"thinking": {"type": "disabled"}})
        return result.model_dump(mode="json")


GOOD = {"version": VERSION, "summary": "合成摘要", "findings": [{"id": "f1", "claim": "消息减少", "evidenceIds": [SUPPORT, CONTEXT], "confidence": "low"}],
        "alternativeExplanations": [{"id": "a1", "explanation": "工作繁忙", "evidenceIds": [CONTEXT]}], "uncertainties": ["不能推断真实感情"]}


def mock_response(body, value=GOOD, status=200, fenced=False):
    if status != 200:
        return status, {"error": {"message": "synthetic rate limit", "type": "rate_limit_error", "code": "rate_limit"}}
    text = json.dumps(value, ensure_ascii=False)
    if fenced:
        text = "```json\n" + text + "\n```"
    msg = {"role": "assistant", "content": text}
    reason = "stop"
    if body.get("tools"):
        msg = {"role": "assistant", "content": None, "tool_calls": [{"id": "call_synthetic", "type": "function", "function": {
            "name": body["tools"][0]["function"]["name"], "arguments": text}}]}
        reason = "tool_calls"
    return 200, {"id": "synthetic", "object": "chat.completion", "created": 0, "model": "deepseek-flash", "choices": [{"index": 0, "message": msg, "finish_reason": reason}],
                 "usage": {"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2}}


def self_test():
    Draft202012Validator.check_schema(SCHEMA)
    vectors = []
    def add(name, value, expected):
        assert (not shape_errors(value)) == expected, name
        vectors.append({"name": name, "value": value, "expected": expected})
    add("valid-mixed-citations", copy.deepcopy(GOOD), True)
    empty = {**GOOD, "findings": [], "alternativeExplanations": []}
    add("empty-findings-alternatives", empty, True)
    mutations = {
        "extra-nested": lambda x: x["alternativeExplanations"][0].update(confidence="high"),
        "missing-nested-id": lambda x: x["alternativeExplanations"][0].pop("id"),
        "wrong-type": lambda x: x.update(summary=123),
        "blank-string": lambda x: x.update(summary=" \t\ufeff"),
        "duplicate-citation": lambda x: x["findings"][0].update(evidenceIds=[SUPPORT, SUPPORT]),
        "empty-citation": lambda x: x["findings"][0].update(evidenceIds=[]),
        "duplicate-item-id": lambda x: x["findings"].append(copy.deepcopy(x["findings"][0])),
        "empty-uncertainty": lambda x: x.update(uncertainties=[]),
        "unknown-confidence": lambda x: x["findings"][0].update(confidence="certain"),
    }
    for name, mutate in mutations.items():
        value = copy.deepcopy(GOOD); mutate(value); add(name, value, False)
    assert not citation_errors(GOOD, [SUPPORT, CONTEXT])
    assert citation_errors(GOOD, [CONTEXT])
    bad = copy.deepcopy(GOOD); bad["alternativeExplanations"][0]["confidence"] = "high"
    request_audits = {}
    for arm in ARMS[1:]:
        for test_name, mock, accepted in [
            ("valid", lambda body: mock_response(body), True),
            ("invalid-structure", lambda body: mock_response(body, bad), False),
            ("429", lambda body: mock_response(body, status=429), False),
        ]:
            recorder = Recorder(arm, "synthetic-auth-only", "", mock)
            ok = False
            try:
                invoke(arm, CASES[0], "deepseek-flash", "synthetic-auth-only", recorder); ok = True
            except Exception:
                pass
            assert recorder.attempts == recorder.dispatches == 1, (arm, test_name, "request-count", recorder.attempts)
            assert ok == accepted, (arm, test_name, "acceptance")
            request_audits[arm] = {"audit": recorder.audit, "request": recorder.body}
    # Framework parsing may accept code fences; the independent raw JSON gate must still reject them.
    recorder = Recorder("instructor-json", "synthetic-auth-only", "", lambda body: mock_response(body, fenced=True))
    fenced_accepted = False
    try:
        invoke("instructor-json", CASES[0], "deepseek-flash", "synthetic-auth-only", recorder); fenced_accepted = True
    except Exception:
        pass
    assert recorder.dispatches == 1
    return {"status": "pass", "liveRequests": 0, "vectors": vectors, "requestAudits": request_audits, "instructorAcceptsFencedJson": fenced_accepted}


def extract(recorder):
    data = recorder.envelope or {}
    if recorder.status != 200:
        return None, "http-error"
    if recorder.arm == "responses-schema":
        if data.get("status") != "completed":
            return None, "incomplete-or-protocol"
        texts = [part.get("text", "") for item in data.get("output", []) if item.get("type") == "message" for part in item.get("content", []) if part.get("type") == "output_text"]
        return "".join(texts), None
    choices = data.get("choices", [])
    if len(choices) != 1:
        return None, "invalid-choice-count"
    choice, msg = choices[0], choices[0].get("message", {})
    if recorder.arm == "instructor-json":
        return (msg.get("content"), None) if choice.get("finish_reason") == "stop" else (None, "incomplete-or-protocol")
    calls = msg.get("tool_calls", [])
    expected = recorder.body["tools"][0]["function"]["name"]
    if choice.get("finish_reason") != "tool_calls" or len(calls) != 1 or calls[0].get("function", {}).get("name") != expected:
        return None, "invalid-output-tool"
    return calls[0]["function"].get("arguments"), None


def run(args):
    checks = self_test()
    if args.self_test:
        if args.out:
            Path(args.out).write_text(json.dumps(checks, ensure_ascii=False, indent=2) + "\n")
        print(json.dumps({"selfTest": "pass", "liveRequests": 0, "shapeVectors": len(checks["vectors"]), "fencedAcceptedByInstructor": checks["instructorAcceptsFencedJson"]}))
        return
    if not args.live:
        raise ValueError("explicit-live-required")
    key = (os.environ.get("WEMEMO_DEEPSEEK_API_KEY") or os.environ.get("DEEPSEEK_API_KEY") or "").strip()
    model = os.environ.get("WEMEMO_DEEPSEEK_MODEL", "deepseek-flash").strip()
    base = os.environ.get("WEMEMO_DEEPSEEK_BASE_URL", "https://api.deepseek.com").rstrip("/")
    if not key or re.search(r"[\r\n]", key) or not re.fullmatch(r"deepseek-[a-z0-9.-]{1,80}", model) or base not in {"https://api.deepseek.com", "https://api.deepseek.com/v1"}:
        raise ValueError("invalid-configuration")
    if not re.fullmatch(r"http://(?:127\.0\.0\.1|localhost):[0-9]{1,5}", args.proxy):
        raise ValueError("invalid-local-proxy")
    created = datetime.now(timezone.utc).isoformat()
    output = Path(args.out or ROOT / "docs/evaluation/reports" / (created.replace(":", "-") + "-instructor-comparison.json"))
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("x") as file:
        os.chmod(output, 0o600)
        file.write("{}\n")
    report = {"version": "wememo-instructor-comparison-v1", "createdAt": created, "modelId": model, "input": "inline-synthetic-only", "requestLimit": CAP,
              "sourceSha256": digest(Path(__file__).read_bytes()), "contractSha256": digest(SCHEMA), "contractSchema": SCHEMA,
              "dependencyVersions": {dist.metadata["Name"]: dist.version for dist in distributions()}, "instructorRetries": 0, "sdkRetries": 0, "curlRetries": 0,
              "strict": True, "extra": "forbid", "reasoning": "disabled", "maxOutputTokens": 1200, "system": SYSTEM, "cases": CASES,
              "repetitions": 2, "arms": ARMS, "selfTest": checks, "requests": 0, "completed": False, "records": []}
    def save():
        text = json.dumps(report, ensure_ascii=False, indent=2)
        if key in text:
            raise RuntimeError("secret-in-report-blocked")
        output.write_text(text + "\n")
    save()
    try:
        for repetition in range(2):
            for index, case in enumerate(CASES):
                shift = (index + repetition) % len(ARMS)
                for arm in ARMS[shift:] + ARMS[:shift]:
                    if report["requests"] >= CAP:
                        raise RuntimeError("budget-exceeded")
                    recorder = Recorder(arm, key, args.proxy)
                    started = time.monotonic()
                    parsed, sdk_error = None, None
                    try:
                        parsed = invoke(arm, case, model, key, recorder)
                    except Exception as error:
                        sdk_error = type(error).__name__  # Never serialize exception text or request headers.
                    report["requests"] += recorder.dispatches
                    text, protocol_error = extract(recorder)
                    record = {"caseId": case["id"], "repetition": repetition + 1, "arm": arm, "httpRequests": recorder.dispatches, "attemptedRequests": recorder.attempts,
                              "httpStatus": recorder.status, "latencyMs": round((time.monotonic() - started) * 1000), "requestAudit": recorder.audit,
                              "syntheticRequest": recorder.body, "requestSha256": digest(recorder.body), "syntheticFinalText": text,
                              "sdkParsed": None if arm == "responses-schema" else parsed is not None, "sdkErrorType": sdk_error,
                              "jsonParsePass": None, "jsonSchemaPass": None, "pydanticPass": None, "citationPass": None, "shapeErrors": [], "citationErrors": [],
                              "finalValid": False, "failureCode": protocol_error, "usage": (recorder.envelope or {}).get("usage"), "returnedModel": (recorder.envelope or {}).get("model")}
                    if text is not None:
                        try:
                            value = strict_loads(text)
                            record["jsonParsePass"] = True
                            record["jsonSchemaPass"] = JSON_VALIDATOR.is_valid(value)
                            record["shapeErrors"] = shape_errors(value)
                            record["pydanticPass"] = not record["shapeErrors"]
                            if record["pydanticPass"]:
                                record["citationErrors"] = citation_errors(value, case["delivered"])
                                record["citationPass"] = not record["citationErrors"]
                            record["finalValid"] = record["jsonSchemaPass"] and record["pydanticPass"] and record["citationPass"] is True and (arm == "responses-schema" or parsed is not None)
                            record["failureCode"] = None if record["finalValid"] else "invalid-shape" if not record["pydanticPass"] or not record["jsonSchemaPass"] else "invalid-citation" if not record["citationPass"] else "sdk-rejected"
                            record["sdkObjectUnchanged"] = None if parsed is None else parsed == value
                        except (ValueError, TypeError):
                            record["jsonParsePass"] = False; record["failureCode"] = "invalid-json"
                    report["records"].append(record)
                    save()
                    print(json.dumps({k: record[k] for k in ["caseId", "repetition", "arm", "httpStatus", "sdkParsed", "pydanticPass", "citationPass", "finalValid", "failureCode", "latencyMs"]}), flush=True)
                    if recorder.attempts != 1 or recorder.dispatches != 1 or not recorder.audit["constraintEquivalent"]:
                        raise RuntimeError("request-or-schema-invariant-failed")
                    if recorder.status in [401, 402, 403, 429]:
                        raise RuntimeError("auth-balance-rate-limit-stop")
        report["completed"] = True
    except KeyboardInterrupt:
        report["stopReason"] = "cancelled"
    except Exception as error:
        report["stopReason"] = str(error) if str(error) in {"budget-exceeded", "request-or-schema-invariant-failed", "auth-balance-rate-limit-stop"} else "local-error"
    finally:
        report["finishedAt"] = datetime.now(timezone.utc).isoformat()
        report["summary"] = {}
        for arm in ARMS:
            rows = [row for row in report["records"] if row["arm"] == arm]
            report["summary"][arm] = {"runs": len(rows), "requests": sum(row["httpRequests"] for row in rows), "strictShapePass": sum(row["pydanticPass"] is True and row["jsonSchemaPass"] is True for row in rows),
                "citationChecked": sum(row["citationPass"] is not None for row in rows), "citationPass": sum(row["citationPass"] is True for row in rows), "finalValid": sum(row["finalValid"] for row in rows),
                "failures": dict(Counter(row["failureCode"] for row in rows if row["failureCode"]))}
        save()
    print(json.dumps({"report": str(output), "requests": report["requests"], "completed": report["completed"], "summary": report["summary"]}), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--self-test", action="store_true")
    mode.add_argument("--live", action="store_true")
    parser.add_argument("--out")
    parser.add_argument("--proxy", default="http://127.0.0.1:7897")
    try:
        run(parser.parse_args())
    except Exception as error:
        print(json.dumps({"error": "comparison-setup-failed", "type": type(error).__name__}), file=sys.stderr)
        sys.exit(1)
