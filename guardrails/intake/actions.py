"""Deterministic NeMo Guardrails actions for guided intake.

These checks are intentionally narrow. The TypeScript app remains the final
authority for PlanIntakeAiResponse parsing, draft merging, and PlanRequest
validation after NeMo returns.
"""

import json
import logging
import re
import time
from typing import Any, Optional

from nemoguardrails.actions import action

log = logging.getLogger(__name__)

REQUIRED_OUTPUT_FIELDS = {"status", "message", "planRequestDraft"}
ALLOWED_STATUSES = {"needs_more_info", "ready"}
MAX_INPUT_CHARS = 2000

INPUT_BLOCK_PATTERNS = [
    re.compile(r"\bignore (?:all )?(?:previous|prior|above) instructions\b", re.I),
    re.compile(r"\b(?:system|developer) prompt\b", re.I),
    re.compile(r"\bprompt injection\b", re.I),
    re.compile(r"\bapi key\b", re.I),
    re.compile(r"\bpassword\b", re.I),
    re.compile(r"\bsecret\b", re.I),
    re.compile(r"\btoken\b", re.I),
    re.compile(r"\bcredential\b", re.I),
    re.compile(r"\bhack\b", re.I),
    re.compile(r"\bexploit\b", re.I),
    re.compile(r"\bmalware\b", re.I),
    re.compile(r"\bransomware\b", re.I),
    re.compile(r"\bphishing\b", re.I),
    re.compile(r"\bsql injection\b", re.I),
    re.compile(r"\bexfiltrat", re.I),
    re.compile(r"\bwrite (?:me )?(?:a )?(?:python|javascript|typescript|shell|powershell|bash|sql|code|script|program)\b", re.I),
    re.compile(r"\bdebug (?:my )?(?:code|script|program|app)\b", re.I),
    re.compile(r"\btell me (?:a )?joke\b", re.I),
    re.compile(r"\bwrite (?:me )?(?:an? )?(?:essay|poem|song|story|email)\b", re.I),
    re.compile(r"\bsummarize (?:this )?(?:article|paper|webpage|document)\b", re.I),
    re.compile(r"\b(?:stock|crypto|bitcoin|exchange rate|weather forecast)\b", re.I),
]

INPUT_FAST_ALLOW_PATTERNS = [
    re.compile(r"^(?:no|nope|none|nothing|no injuries|no pain|no limitations|no constraints?|that's all|that is all|done)[.!]?$", re.I),
    re.compile(r"^(?:yes|yeah|yep|correct|right|exactly|sounds good)[.!]?$", re.I),
    re.compile(r"^(?:[1-7]|one|two|three|four|five|six|seven)\s*(?:x|times?|days?|sessions?)?(?:\s*(?:per|a|/)\s*week| weekly)?[.!]?$", re.I),
    re.compile(r"\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thurs|fri|sat|sun)\b", re.I),
    re.compile(r"\b(?:today|tomorrow|next week|asap|as soon as possible|\d{4}-\d{2}-\d{2}|\d{1,2}/\d{1,2})\b", re.I),
    re.compile(r"\b(?:climb(?:ing)?|boulder(?:ing)?|sport climbing|trad|ice|alpine|run(?:ning)?|runner|5k|10k|marathon|half marathon|cycl(?:e|ing|ist)|bike|biking|strength(?: and conditioning|/conditioning)?|conditioning|weight training|weightlifting|lifting|barbell)\b", re.I),
    re.compile(r"\b(?:gym|dumbbells?|barbells?|kettlebells?|bands?|treadmill|bike|trainer|hangboard|climbing wall|indoor climbing|shoes|harness)\b", re.I),
    re.compile(r"\b(?:injur(?:y|ies|ed)|pain|sore|strain|sprain|limitation|avoid|skip|exclude|don't include|do not include|knee|shoulder|elbow|back|ankle|wrist)\b", re.I),
    re.compile(r"\b(?:goal|train(?:ing)?|improve|build|prepare|race|event|endurance|strength|fitness|power|aerobic|anaerobic|volume|schedule|equipment|level|beginner|intermediate|advanced)\b", re.I),
]

INPUT_REVIEW_PATTERNS = [
    re.compile(r"\b(?:prompt|instruction|policy|configuration|config|internal|rules|guardrail|bypass|override|ignore)\b", re.I),
    re.compile(r"(?:[A-Za-z0-9+/]{80,}={0,2})"),
]

OUTPUT_SECRET_PATTERNS = [
    re.compile(r"\b(?:system|developer) prompt\b", re.I),
    re.compile(r"\bhidden instructions?\b", re.I),
    re.compile(r"\bguardrail policy\b", re.I),
    re.compile(r"\bapi key\b", re.I),
    re.compile(r"\benvironment variables?\b", re.I),
    re.compile(r"\bdatabase url\b", re.I),
    re.compile(r"\b(?:password|secret|token|credential)\b", re.I),
    re.compile(r"\b(?:malware|ransomware|phishing|credential theft|exfiltrat|sql injection)\b", re.I),
]


def _elapsed_ms(started_at: float) -> int:
    return int((time.perf_counter() - started_at) * 1000)


def _context_text(context: Optional[dict], key: str) -> str:
    value = (context or {}).get(key)
    return value if isinstance(value, str) else ""


def _latest_user_message(message: str) -> str:
    marker = "LATEST_USER_MESSAGE:"
    marker_index = message.find(marker)
    if marker_index < 0:
        return message

    after_marker = message[marker_index + len(marker):].lstrip()
    end_match = re.search(r"\n\s*\n(?:Return a PlanIntakeAiResponse JSON object\.|[A-Z][A-Z0-9_ ]+:\s*\n)", after_marker)
    if end_match:
        return after_marker[: end_match.start()].strip()
    return after_marker.strip()


def _has_pattern(patterns: list[re.Pattern[str]], value: str) -> bool:
    return any(pattern.search(value) for pattern in patterns)


def _input_decision(message: str) -> str:
    trimmed = message.strip()
    if not trimmed:
        return "block"
    if len(trimmed) > MAX_INPUT_CHARS:
        return "block"
    if _has_pattern(INPUT_BLOCK_PATTERNS, trimmed):
        return "block"
    if _has_pattern(INPUT_FAST_ALLOW_PATTERNS, trimmed):
        return "allow"
    if len(trimmed) > 800 or _has_pattern(INPUT_REVIEW_PATTERNS, trimmed):
        return "needs_review"
    return "allow"


def _extract_output_contract_error(message: str) -> Optional[str]:
    trimmed = message.strip()
    if not trimmed:
        return "empty"

    fence_match = re.fullmatch(r"```(?:json)?\s*(.*?)\s*```", trimmed, flags=re.I | re.S)
    json_payload = fence_match.group(1).strip() if fence_match else trimmed

    if "```" in json_payload:
        return "markdown_fence"
    if not json_payload.startswith("{") or not json_payload.endswith("}"):
        return "json_envelope"

    try:
        parsed: Any = json.loads(json_payload)
    except json.JSONDecodeError:
        return "invalid_json"

    if not isinstance(parsed, dict):
        return "not_object"

    missing_fields = REQUIRED_OUTPUT_FIELDS - set(parsed.keys())
    if missing_fields:
        return "missing_fields"

    if parsed.get("status") not in ALLOWED_STATUSES:
        return "invalid_status"
    if not isinstance(parsed.get("message"), str) or not parsed.get("message", "").strip():
        return "invalid_message"
    if not isinstance(parsed.get("planRequestDraft"), dict):
        return "invalid_draft"

    if _has_pattern(OUTPUT_SECRET_PATTERNS, parsed.get("message", "")):
        return "unsafe_message"
    if _has_pattern(OUTPUT_SECRET_PATTERNS, json_payload):
        return "unsafe_output"

    return None


@action(is_system_action=True)
async def check_intake_input(context: Optional[dict] = None, **kwargs: Any) -> str:
    """Return allow, block, or needs_review for a guided-intake user message."""
    started_at = time.perf_counter()
    decision = _input_decision(_latest_user_message(_context_text(context, "user_message")))
    log.info("[nemo-intake] deterministic_input decision=%s durationMs=%s", decision, _elapsed_ms(started_at))
    return decision


@action(is_system_action=True)
async def check_intake_output_contract(context: Optional[dict] = None, **kwargs: Any) -> bool:
    """Return True when the model output matches the basic intake JSON envelope."""
    started_at = time.perf_counter()
    error = _extract_output_contract_error(_context_text(context, "bot_message"))
    allowed = error is None
    reason = error or "ok"
    log.info(
        "[nemo-intake] deterministic_output allowed=%s reason=%s durationMs=%s",
        str(allowed).lower(),
        reason,
        _elapsed_ms(started_at),
    )
    return allowed
