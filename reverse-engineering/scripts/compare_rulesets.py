#!/usr/bin/env python3
"""Compare two D20Rules documents semantically, ignoring formatting whitespace."""

from __future__ import annotations

import argparse
import json
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path


SPACE = re.compile(r"\s+")


def normalized_text(value: str | None) -> str:
    return SPACE.sub(" ", value or "").strip()


def canonical(element: ET.Element):
    return {
        "tag": element.tag.rsplit("}", 1)[-1],
        "attributes": sorted((key.rsplit("}", 1)[-1], value) for key, value in element.attrib.items()),
        "text": normalized_text(element.text),
        "children": [canonical(child) for child in element],
        "tails": [normalized_text(child.tail) for child in element if normalized_text(child.tail)],
    }


def load(path: Path):
    root = ET.parse(path).getroot()
    records = {}
    raw = []
    duplicate = []
    for child in root:
        if child.tag.rsplit("}", 1)[-1].lower() == "ruleselement":
            internal_id = child.get("internal-id")
            if internal_id in records:
                duplicate.append(internal_id)
            records[internal_id] = canonical(child)
        else:
            raw.append(canonical(child))
    return records, raw, duplicate


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("expected", type=Path)
    parser.add_argument("actual", type=Path)
    parser.add_argument("--examples", type=int, default=10)
    args = parser.parse_args()

    expected, expected_raw, expected_dupes = load(args.expected)
    actual, actual_raw, actual_dupes = load(args.actual)
    missing = sorted(set(expected) - set(actual))
    extra = sorted(set(actual) - set(expected))
    changed = sorted(key for key in set(expected) & set(actual) if expected[key] != actual[key])
    report = {
        "expectedRecords": len(expected),
        "actualRecords": len(actual),
        "missingCount": len(missing),
        "extraCount": len(extra),
        "changedCount": len(changed),
        "rawElementsEqual": expected_raw == actual_raw,
        "expectedDuplicateIds": expected_dupes,
        "actualDuplicateIds": actual_dupes,
        "missingExamples": missing[:args.examples],
        "extraExamples": extra[:args.examples],
        "changedExamples": changed[:args.examples],
    }
    print(json.dumps(report, indent=2))
    return 0 if not missing and not extra and not changed and expected_raw == actual_raw else 1


if __name__ == "__main__":
    sys.exit(main())
