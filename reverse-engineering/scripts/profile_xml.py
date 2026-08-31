#!/usr/bin/env python3
"""Generate reproducible structural profiles of the supplied legacy XML formats."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Iterable


SAMPLE_LIMIT = 24


def digest(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def clean(value: str | None) -> str:
    return " ".join((value or "").split())


def value_kind(value: str) -> str:
    value = value.strip()
    if not value:
        return "empty"
    if value.lower() in {"true", "false"}:
        return "boolean"
    if re.fullmatch(r"[+-]?\d+", value):
        return "integer"
    if re.fullmatch(r"[+-]?(?:\d+\.\d*|\d*\.\d+)", value):
        return "decimal"
    if re.fullmatch(r"\d+(?:-\d+)?", value):
        return "integer-range"
    if re.fullmatch(r"ID_[A-Z0-9_-]+", value, re.I):
        return "internal-id"
    if "," in value:
        return "comma-list"
    return "string"


def sorted_counter(counter: Counter[str]) -> dict[str, int]:
    return dict(sorted(counter.items(), key=lambda item: (-item[1], item[0].lower())))


class AttributeProfile:
    def __init__(self) -> None:
        self.count = 0
        self.kinds: Counter[str] = Counter()
        self.samples: list[str] = []

    def add(self, value: str) -> None:
        self.count += 1
        self.kinds[value_kind(value)] += 1
        normalized = clean(value)
        if normalized not in self.samples and len(self.samples) < SAMPLE_LIMIT:
            self.samples.append(normalized[:300])

    def json(self) -> dict[str, Any]:
        return {
            "occurrences": self.count,
            "valueKinds": sorted_counter(self.kinds),
            "samples": self.samples,
        }


def profile_attributes(elements: Iterable[ET.Element]) -> dict[str, Any]:
    result: defaultdict[str, AttributeProfile] = defaultdict(AttributeProfile)
    for element in elements:
        for name, value in element.attrib.items():
            result[name].add(value)
    return {name: result[name].json() for name in sorted(result, key=str.lower)}


def profile_game_data(path: Path) -> dict[str, Any]:
    root = ET.parse(path).getroot()
    elements = [item for item in root if item.tag == "RulesElement"]
    types: defaultdict[str, list[ET.Element]] = defaultdict(list)
    for element in elements:
        types[element.get("type", "")].append(element)

    duplicate_ids = Counter(item.get("internal-id", "") for item in elements)
    duplicate_names = Counter((item.get("type", ""), item.get("name", "")) for item in elements)
    rule_elements = [rule for element in elements for rules in element.findall("rules") for rule in rules]
    direct_children = [child for element in elements for child in element]
    categories = Counter()
    for category in root.iter("Category"):
        categories.update(part.strip() for part in (category.text or "").split(",") if part.strip())

    by_type: dict[str, Any] = {}
    for type_name in sorted(types, key=str.lower):
        members = types[type_name]
        specifics = [child for member in members for child in member if child.tag.lower() == "specific"]
        rules = [rule for member in members for container in member.findall("rules") for rule in container]
        sources = Counter()
        for member in members:
            sources.update(part.strip() for part in member.get("source", "").split(",") if part.strip())
        by_type[type_name] = {
            "count": len(members),
            "attributes": profile_attributes(members),
            "directChildTags": sorted_counter(Counter(child.tag for member in members for child in member)),
            "specificFields": sorted_counter(Counter(item.get("name", "") for item in specifics)),
            "specificAttributes": profile_attributes(specifics),
            "ruleTags": sorted_counter(Counter(item.tag for item in rules)),
            "sources": sorted_counter(sources),
        }

    rules_by_tag: dict[str, Any] = {}
    for tag in sorted({item.tag for item in rule_elements}, key=str.lower):
        members = [item for item in rule_elements if item.tag == tag]
        body_samples = []
        for item in members:
            body = clean(item.text)
            if body and body not in body_samples and len(body_samples) < SAMPLE_LIMIT:
                body_samples.append(body[:300])
        rules_by_tag[tag] = {
            "count": len(members),
            "attributes": profile_attributes(members),
            "nonEmptyBodyCount": sum(bool(clean(item.text)) for item in members),
            "bodySamples": body_samples,
        }

    return {
        "file": str(path),
        "sha256": digest(path),
        "size": path.stat().st_size,
        "root": {"tag": root.tag, "attributes": root.attrib},
        "topLevelTags": sorted_counter(Counter(item.tag for item in root)),
        "rulesElementCount": len(elements),
        "rulesElementAttributes": profile_attributes(elements),
        "directChildTags": sorted_counter(Counter(item.tag for item in direct_children)),
        "directChildAttributesByTag": {
            tag: profile_attributes(item for item in direct_children if item.tag == tag)
            for tag in sorted({item.tag for item in direct_children}, key=str.lower)
        },
        "categories": sorted_counter(categories),
        "ruleLanguage": rules_by_tag,
        "types": by_type,
        "duplicateInternalIds": {key: value for key, value in duplicate_ids.items() if key and value > 1},
        "duplicateTypeAndNames": {
            f"{key[0]}::{key[1]}": value for key, value in duplicate_names.items() if key[1] and value > 1
        },
    }


def profile_part_files(paths: list[Path]) -> dict[str, Any]:
    operations: defaultdict[str, list[ET.Element]] = defaultdict(list)
    files = []
    for path in paths:
        root = ET.parse(path).getroot()
        files.append({
            "file": str(path),
            "sha256": digest(path),
            "size": path.stat().st_size,
            "root": {"tag": root.tag, "attributes": root.attrib},
            "topLevelTags": sorted_counter(Counter(item.tag for item in root)),
        })
        for element in root:
            operations[element.tag].append(element)

    operation_profile = {}
    for name in sorted(operations, key=str.lower):
        members = operations[name]
        children = [child for member in members for child in member]
        operation_profile[name] = {
            "count": len(members),
            "attributes": profile_attributes(members),
            "childTags": sorted_counter(Counter(child.tag for child in children)),
            "childAttributesByTag": {
                tag: profile_attributes(child for child in children if child.tag == tag)
                for tag in sorted({child.tag for child in children}, key=str.lower)
            },
        }
    return {"files": files, "operations": operation_profile}


def profile_index(path: Path) -> dict[str, Any]:
    root = ET.parse(path).getroot()
    result: dict[str, Any] = {
        "file": str(path),
        "sha256": digest(path),
        "size": path.stat().st_size,
        "root": {"tag": root.tag, "attributes": root.attrib},
        "topLevelTags": sorted_counter(Counter(item.tag for item in root)),
        "topLevelAttributesByTag": {
            tag: profile_attributes(item for item in root if item.tag == tag)
            for tag in sorted({item.tag for item in root}, key=str.lower)
        },
    }
    result["parts"] = [
        {child.tag: clean(child.text) for child in item}
        for item in root.findall("Part")
    ]
    result["obsoleteGroups"] = [
        [clean(child.text) for child in item.findall("Filename")]
        for item in root.findall("Obsolete")
    ]
    result["redirects"] = [dict(item.attrib) for item in root.findall("Redirect")]
    update = root.find("UpdateInfo")
    result["updateInfo"] = {child.tag: clean(child.text) for child in update} if update is not None else None
    return result


def walk_paths(element: ET.Element, prefix: tuple[str, ...] = ()) -> Iterable[tuple[tuple[str, ...], ET.Element]]:
    path = prefix + (element.tag,)
    yield path, element
    for child in element:
        yield from walk_paths(child, path)


def profile_characters(paths: list[Path]) -> dict[str, Any]:
    path_elements: defaultdict[tuple[str, ...], list[ET.Element]] = defaultdict(list)
    files = []
    for path in paths:
        root = ET.parse(path).getroot()
        for element_path, element in walk_paths(root):
            path_elements[element_path].append(element)
        files.append({
            "file": str(path),
            "sha256": digest(path),
            "size": path.stat().st_size,
            "root": {"tag": root.tag, "attributes": root.attrib},
            "rootChildTags": sorted_counter(Counter(item.tag for item in root)),
        })

    paths_profile = {}
    for element_path in sorted(path_elements, key=lambda p: "/".join(p).lower()):
        members = path_elements[element_path]
        text_samples = []
        for item in members:
            value = clean(item.text)
            if value and value not in text_samples and len(text_samples) < SAMPLE_LIMIT:
                text_samples.append(value[:300])
        paths_profile["/".join(element_path)] = {
            "count": len(members),
            "attributes": profile_attributes(members),
            "childTags": sorted_counter(Counter(child.tag for member in members for child in member)),
            "nonEmptyTextCount": sum(bool(clean(item.text)) for item in members),
            "textSamples": text_samples,
        }
    return {"files": files, "paths": paths_profile}


def profile_campaigns(paths: list[Path]) -> dict[str, Any]:
    """Profile campaigns, including the supplied legacy file with illegal XML-name parentheses."""
    files = []
    tag_pattern = re.compile(r"<\s*([^!?/][^\s>/]*)\s*/\s*>")
    name_pattern = re.compile(r"<D20CampaignSetting\s+name=[\"']([^\"']*)[\"']", re.IGNORECASE)
    for path in paths:
        text = path.read_text(encoding="utf-8-sig")
        parse_error = None
        root = None
        try:
            root = ET.fromstring(text)
        except ET.ParseError as error:
            parse_error = str(error)
        restricted_match = re.search(r"<Restricted>(.*?)</Restricted>", text, re.IGNORECASE | re.DOTALL)
        restricted_ids = tag_pattern.findall(restricted_match.group(1)) if restricted_match else []
        invalid_names = [value for value in restricted_ids if any(char in value for char in "()'")]
        files.append({
            "file": str(path),
            "sha256": digest(path),
            "size": path.stat().st_size,
            "name": ((root.attrib.get("name") if root is not None else None)
                     or ((name_pattern.search(text) or [None, None])[1])),
            "wellFormedXml10": parse_error is None,
            "parseError": parse_error,
            "restrictedCount": len(restricted_ids),
            "invalidXmlNameCount": len(invalid_names),
            "invalidXmlNameSamples": invalid_names[:SAMPLE_LIMIT],
            "houseruleCount": len(root.find("Houserules")) if root is not None and root.find("Houserules") is not None else 0,
        })
    return {"files": files}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("repository", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    repo = args.repository.resolve()
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)

    custom = repo / "CBLoader" / "Custom"
    parts = sorted(custom.glob("*.part"), key=lambda item: item.name.lower())
    characters = sorted((repo / "CharacterBuilder" / "SampleChars" / "SampleHeroes").glob("*.dnd4e"))
    campaigns = sorted((repo / "CharacterBuilder" / "SampleChars").glob("*.dndcamp"))

    reports = {
        "game-data-original.json": profile_game_data(repo / "CBLoader" / "Cache" / "combined.dnd40.original.xml"),
        "game-data-merged.json": profile_game_data(repo / "CBLoader" / "Cache" / "combined.dnd40.merged.xml"),
        "part-files.json": profile_part_files(parts),
        "wotc-index.json": profile_index(repo / "WotC.index"),
        "characters.json": profile_characters(characters),
        "campaigns.json": profile_campaigns(campaigns),
    }
    for filename, report in reports.items():
        (output / filename).write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
