// rules.py, verbatim. Do not edit; copy from rules.py.
export const RULES_PY = String.raw`"""Escalation Router rules v1.0 (prototype, synthetic data).

Routes teacher and district escalations. Pure, deterministic, standard library only.
Every decision returns {result, rules_fired, explanation, next_step, cc}.
"""
import re

FIELDS = ("issue_type", "student_data", "teachers_affected", "renewal_days")
ISSUE_TYPES = ("how_to", "bug", "feature", "outage", "other", "needs_review")
STUDENT_DATA = ("yes", "no", "unsure")
RANGES = {"teachers_affected": (1, 10000), "renewal_days": (0, 1095)}
SEV1_TEACHERS = 3
RENEWAL_WINDOW_DAYS = 90

PRIVACY = "Privacy officer"
SEV1 = "Sev1: page engineering on-call"
COORD = "Coordinator review"
ENG = "Engineering queue"
PRODUCT = "Product backlog"
SUPPORT = "Support"

RANK = (PRIVACY, SEV1, COORD, ENG, PRODUCT, SUPPORT)

NEXT_STEP = {
    PRIVACY: "Privacy officer reviews the same day and decides whether families or the district must be told.",
    SEV1: "Engineering on-call is paged now; the Head of Customer Success confirms in parallel.",
    COORD: "A CS coordinator reads the item and routes it by hand.",
    ENG: "Engineering triages in the next daily standup.",
    PRODUCT: "Product adds it to the backlog and tags the district.",
    SUPPORT: "Support replies with the matching help article within one business day.",
}

_DIGITS = re.compile(r"[0-9]+")


def _whole(raw, lo, hi):
    if isinstance(raw, bool):
        return None
    if isinstance(raw, int):
        value = raw
    elif isinstance(raw, str):
        text = raw.strip()
        if not _DIGITS.fullmatch(text):
            return None
        value = int(text)
    else:
        return None
    return value if lo <= value <= hi else None


def validate(raw):
    """Turn raw field text into typed values. Returns (typed, errors)."""
    typed, errors = {}, []
    for name, options in (("issue_type", ISSUE_TYPES), ("student_data", STUDENT_DATA)):
        value = raw.get(name)
        value = value.strip() if isinstance(value, str) else value
        if value in options:
            typed[name] = value
        else:
            errors.append(name)
    for name, (lo, hi) in RANGES.items():
        value = _whole(raw.get(name), lo, hi)
        if value is None:
            errors.append(name)
        else:
            typed[name] = value
    return typed, errors


def _rule_num(rule_id):
    return int(rule_id[1:])


def decide(raw):
    typed, errors = validate(raw)
    if errors:
        return {
            "result": COORD,
            "rules_fired": ["R1"],
            "explanation": ["R1 fired: missing or invalid " + ", ".join(errors) + " → Coordinator review."],
            "next_step": NEXT_STEP[COORD],
            "cc": [],
        }

    t = typed["issue_type"]
    s = typed["student_data"]
    n = typed["teachers_affected"]
    d = typed["renewal_days"]
    routes, notes = {}, {}

    if s in ("yes", "unsure"):
        routes["R2"] = PRIVACY
        notes["R2"] = "R2 fired: student data = " + s + " → Privacy officer, same day."
    if t == "outage" and n >= SEV1_TEACHERS:
        routes["R3"] = SEV1
        notes["R3"] = "R3 fired: outage affecting " + str(n) + " teachers ≥ " + str(SEV1_TEACHERS) + " → Sev1."
    if t == "outage" and n < SEV1_TEACHERS:
        routes["R4"] = ENG
        notes["R4"] = "R4 fired: outage affecting " + str(n) + " teachers < " + str(SEV1_TEACHERS) + " → Engineering queue."
    if t == "bug":
        routes["R5"] = ENG
        notes["R5"] = "R5 fired: issue type bug → Engineering queue."
    if t == "feature":
        routes["R6"] = PRODUCT
        notes["R6"] = "R6 fired: issue type feature → Product backlog."
    if t == "how_to":
        routes["R7"] = SUPPORT
        notes["R7"] = "R7 fired: issue type how_to → Support with help article."
    if t == "needs_review":
        routes["R8"] = COORD
        notes["R8"] = "R8 fired: AI was unsure of the issue type → Coordinator review."
    if not routes:
        routes["R11"] = COORD
        notes["R11"] = "R11 fired: no routing rule fired (issue type " + t + ") → Coordinator review."

    result = min(routes.values(), key=RANK.index)
    fired = list(routes.keys())
    cc = []
    if d <= RENEWAL_WINDOW_DAYS:
        fired.append("R9")
        notes["R9"] = "R9 fired: renewal in " + str(d) + " days ≤ " + str(RENEWAL_WINDOW_DAYS) + " → copy the account manager."
        cc.append("Account manager")
    next_step = NEXT_STEP[result]
    if "R3" in routes:
        fired.append("R10")
        notes["R10"] = "R10 fired: Sev1 outage → page on-call now; Head of CS confirms in parallel."
        if result != SEV1:
            next_step = next_step + " Engineering on-call is also paged now (R10)."
    fired.sort(key=_rule_num)
    return {
        "result": result,
        "rules_fired": fired,
        "explanation": [notes[r] for r in fired],
        "next_step": next_step,
        "cc": cc,
    }


SCENARIOS = [
    ("T1", {"issue_type": "how_to", "student_data": "no", "teachers_affected": "1", "renewal_days": "200"}, SUPPORT, ["R7"]),
    ("T2", {"issue_type": "outage", "student_data": "no", "teachers_affected": "3", "renewal_days": "200"}, SEV1, ["R3", "R10"]),
    ("T3", {"issue_type": "feature", "student_data": "yes", "teachers_affected": "1", "renewal_days": "400"}, PRIVACY, ["R2", "R6"]),
    ("T4", {"issue_type": "feature", "student_data": "no", "teachers_affected": "2", "renewal_days": "45"}, PRODUCT, ["R6", "R9"]),
    ("T5", {"issue_type": "needs_review", "student_data": "no", "teachers_affected": "1", "renewal_days": "200"}, COORD, ["R8"]),
    ("T6", {"issue_type": "outage", "student_data": "no", "teachers_affected": "2", "renewal_days": "200"}, ENG, ["R4"]),
    ("T7", {"issue_type": "bug", "student_data": "no", "teachers_affected": "5", "renewal_days": "300"}, ENG, ["R5"]),
    ("T8", {"issue_type": "other", "student_data": "no", "teachers_affected": "1", "renewal_days": "200"}, COORD, ["R11"]),
    ("T9", {"issue_type": "outage", "student_data": "unsure", "teachers_affected": "4", "renewal_days": "30"}, PRIVACY, ["R2", "R3", "R9", "R10"]),
    ("M1", {"issue_type": "bug", "student_data": "no", "teachers_affected": "1e3", "renewal_days": "200"}, COORD, ["R1"]),
    ("M2", {"issue_type": "bug", "student_data": "no", "teachers_affected": "5", "renewal_days": "12.5"}, COORD, ["R1"]),
]


def self_test():
    passed, failures = 0, []
    for test_id, inputs, expected, expected_rules in SCENARIOS:
        out = decide(inputs)
        if out["result"] == expected and out["rules_fired"] == expected_rules:
            passed += 1
        else:
            failures.append((test_id, expected, expected_rules, out["result"], out["rules_fired"]))
    return {"passed": passed, "total": len(SCENARIOS), "failures": failures}


def determinism_check(inputs, runs=25):
    seen = set()
    for _ in range(runs):
        out = decide(inputs)
        seen.add((out["result"], tuple(out["rules_fired"])))
    return len(seen)
`
