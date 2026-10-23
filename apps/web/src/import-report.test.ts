import { describe, expect, it } from "vitest";

import { importDnd4e, type Dnd4eImportReport } from "@4ecb/legacy-dnd4e";

import { importReportToast } from "./import-report";

const base: Dnd4eImportReport = {
  diagnostics: [{ severity: "info", code: "x", message: "Background note" }],
  levelCount: 1,
  selectedRuleCount: 0,
  powerCount: 0,
  lootCount: 0,
  unknownRootElements: [],
  usesLegacyCache: true,
};

function match(index: number, savedName = `Feature ${index}`) {
  return {
    savedId: `THEIRS_${index}`,
    savedName,
    type: "Class Feature",
    definitionId: `OURS_${index}`,
    definitionName: `Feature ${index}`,
    basis: "name" as const,
  };
}

describe("import report toast", () => {
  it("says nothing when there are no warnings or matches", () => {
    expect(importReportToast("Erdan", base)).toBeUndefined();
  });

  it("lists name matches, summarizing past eight", () => {
    const toast = importReportToast("Erdan", {
      ...base,
      definitionMatching: {
        matched: [
          match(0, "Old Feature 0"),
          ...Array.from({ length: 9 }, (_, index) => match(index + 1)),
        ],
        ambiguous: [],
        unmatched: [],
      },
    });
    expect(toast).toEqual({
      tone: "warning",
      title: "Imported Erdan, matching content by name",
      messages: [
        "Matched 10 saved records your content doesn't have by name: Old Feature 0 as Feature 0 (Class Feature); Feature 1 (Class Feature); Feature 2 (Class Feature); Feature 3 (Class Feature); Feature 4 (Class Feature); Feature 5 (Class Feature); Feature 6 (Class Feature); Feature 7 (Class Feature); and 2 more. Exports use the matched records; the builder's Diagnostics lists them all.",
      ],
    });
  });

  it("puts warnings, including ambiguous names, before the matches", () => {
    const imported = importDnd4e(
      `<D20Character game-system="D&amp;D4E"><CharacterSheet/><Level><RulesElement name="1" type="Level" internal-id="L1" charelem="l1"><RulesElement name="Knack" type="Class Feature" internal-id="THEIRS" charelem="k"/></RulesElement></Level></D20Character>`,
      {
        matchMissingDefinitionsIn: [
          { id: "L1", name: "1", type: "Level", rules: [] },
          { id: "A", name: "Knack", type: "Class Feature", rules: [] },
          { id: "B", name: "Knack", type: "Class Feature", rules: [] },
        ],
      },
    );
    expect(importReportToast("Max", imported.report)).toEqual({
      tone: "warning",
      title: "Imported Max with warnings",
      messages: [
        "Knack (Class Feature) isn't in the active content, and 2 records share its name, so it wasn't matched.",
      ],
    });
  });
});
