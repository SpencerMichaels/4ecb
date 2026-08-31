#!/usr/bin/env python3
"""Deterministic reference implementation of recovered CBLoader merge semantics.

Inputs are applied in command-line order. This utility is for fixtures, inspection,
and migration tests; production importers should additionally retain comments,
source locations, and unknown nodes in a lossless XML representation.
"""

from __future__ import annotations

import argparse
import copy
import sys
import xml.etree.ElementTree as ET
from collections import OrderedDict
from dataclasses import dataclass, field
from pathlib import Path


ALLOWED_ATTRIBUTES = ("name", "type", "internal-id", "source", "revision-date")


def local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def meaningful(text: str | None) -> bool:
    return text is not None and text.strip() != ""


def detached(element: ET.Element) -> ET.Element:
    """Clone an element without ElementTree's parent-owned trailing text."""
    result = copy.deepcopy(element)
    result.tail = None
    return result


@dataclass
class Record:
    internal_id: str
    attributes: OrderedDict[str, str] = field(default_factory=OrderedDict)
    categories: list[str] = field(default_factory=list)
    root_elements: list[ET.Element] = field(default_factory=list)
    rules: list[ET.Element | str] = field(default_factory=list)
    root_text: list[str] = field(default_factory=list)

    def __post_init__(self) -> None:
        self.attributes["internal-id"] = self.internal_id

    def add(self, source: ET.Element, include_attributes: bool = True) -> None:
        if include_attributes:
            for name, value in source.attrib.items():
                name = local(name)
                if name in ALLOWED_ATTRIBUTES:
                    self.attributes[name] = value
                else:
                    warn(f"invalid record attribute {name!r} on {self.internal_id}")

        if meaningful(source.text):
            self.root_text.append(source.text or "")
        for child in source:
            kind = local(child.tag).lower()
            if kind == "category":
                for category in "".join(child.itertext()).split(","):
                    category = category.strip()
                    if category and category not in self.categories:
                        self.categories.append(category)
            elif kind in ("specific", "prereqs", "print-prereqs", "flavor"):
                self.root_elements.append(detached(child))
            elif kind == "rules":
                if meaningful(child.text):
                    self.rules.append(child.text or "")
                for rule in child:
                    self.rules.append(detached(rule))
                    if meaningful(rule.tail):
                        self.rules.append(rule.tail or "")
            else:
                warn(f"unknown RulesElement child {local(child.tag)!r} on {self.internal_id}")
            if meaningful(child.tail):
                self.root_text.append(child.tail or "")

    def remove(self, command: ET.Element) -> None:
        kind = local(command.tag).lower()
        if kind == "category":
            self.categories.clear()
        elif kind == "specific":
            name = command.get("name")
            if name is None:
                warn(f"specific removal without name on {self.internal_id}")
            else:
                self.root_elements = [node for node in self.root_elements
                                      if not (local(node.tag).lower() == "specific" and node.get("name") == name)]
        elif kind in ("prereqs", "print-prereqs", "flavor"):
            self.root_elements = [node for node in self.root_elements if local(node.tag).lower() != kind]
        elif kind == "maintext":
            self.root_text.clear()
        elif kind == "attribute":
            name = command.get("name")
            if name not in self.attributes:
                warn(f"missing attribute {name!r} on {self.internal_id}")
            elif name == "internal-id":
                warn(f"refusing to remove primary key on {self.internal_id}")
            else:
                del self.attributes[name]
        elif kind == "rules":
            self.rules.clear()
        else:
            warn(f"unknown RemoveNodes command {local(command.tag)!r}")

    def to_xml(self) -> ET.Element:
        result = ET.Element("RulesElement", self.attributes)
        if self.categories:
            ET.SubElement(result, "Category").text = ",".join(self.categories)
        result.extend(detached(node) for node in self.root_elements)
        if self.rules:
            rules = ET.SubElement(result, "rules")
            previous: ET.Element | None = None
            for rule in self.rules:
                if isinstance(rule, str):
                    if previous is None:
                        rules.text = (rules.text or "") + rule
                    else:
                        previous.tail = (previous.tail or "") + rule
                else:
                    previous = detached(rule)
                    rules.append(previous)
        if self.root_text:
            # CBLoader emits main text after structured children.
            text = "\n".join(self.root_text)
            if len(result):
                result[-1].tail = (result[-1].tail or "") + text
            else:
                result.text = text
        return result


def warn(message: str) -> None:
    print(f"warning: {message}", file=sys.stderr)


class Merger:
    def __init__(self, game_system: str = "D&D4E") -> None:
        self.game_system = game_system
        self.records: OrderedDict[str, Record] = OrderedDict()
        self.raw: list[ET.Element] = []

    @staticmethod
    def require_id(element: ET.Element) -> str:
        value = element.get("internal-id")
        if value is None:
            raise ValueError(f"no internal-id on {local(element.tag)}")
        return value

    def get(self, internal_id: str, overwrite: bool) -> Record:
        if overwrite or internal_id not in self.records:
            # Assignment to an existing OrderedDict key preserves its position,
            # matching modern .NET Dictionary insertion behavior used by this build.
            self.records[internal_id] = Record(internal_id)
        return self.records[internal_id]

    def process(self, path: Path) -> None:
        root = ET.parse(path).getroot()
        if local(root.tag).lower() != "d20rules":
            raise ValueError(f"{path}: root is not D20Rules")
        for element in root:
            kind = local(element.tag).lower()
            if kind == "ruleselement":
                self.get(self.require_id(element), True).add(element)
            elif kind == "appendnodes":
                self.get(self.require_id(element), False).add(element)
            elif kind == "massappend":
                for internal_id in (value.strip() for value in (element.get("ids") or "").split(",")):
                    if not internal_id:
                        continue
                    if internal_id not in self.records:
                        warn(f"MassAppend target {internal_id!r} does not exist")
                    else:
                        self.records[internal_id].add(element, include_attributes=False)
            elif kind == "removenodes":
                internal_id = self.require_id(element)
                if internal_id not in self.records:
                    warn(f"RemoveNodes target {internal_id!r} does not exist")
                else:
                    for command in element:
                        self.records[internal_id].remove(command)
            elif kind == "deleteelement":
                internal_id = self.require_id(element)
                if self.records.pop(internal_id, None) is None:
                    warn(f"DeleteElement target {internal_id!r} does not exist")
            elif kind == "appendrawelements":
                self.raw.extend(copy.deepcopy(child) for child in element)
            elif kind not in ("changelog", "updateinfo"):
                warn(f"unknown top-level operation {local(element.tag)!r}")

    def document(self) -> ET.ElementTree:
        root = ET.Element("D20Rules", {"game-system": self.game_system})
        root.extend(record.to_xml() for record in self.records.values())
        root.extend(copy.deepcopy(node) for node in self.raw)
        return ET.ElementTree(root)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("inputs", nargs="+", type=Path, help="base XML followed by parts in merge order")
    parser.add_argument("-o", "--output", required=True, type=Path)
    args = parser.parse_args()

    merger = Merger()
    for path in args.inputs:
        merger.process(path)
    document = merger.document()
    ET.indent(document, space="  ")
    document.write(args.output, encoding="utf-8", xml_declaration=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
