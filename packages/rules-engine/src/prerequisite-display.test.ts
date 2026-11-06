import { describe, expect, it } from "vitest";

import {
  contentCacheBuildCounts,
  displayPrerequisites,
  renamedEntity,
  type ContentEntity,
} from "@4ecb/content-domain";

import { evaluateCharacter, type EvaluationInput } from "./evaluator";
import { prerequisiteDisplayLines } from "./prerequisite-display";

// A campaign renames a record keeping its stock name as an alias (D116):
// displayed prerequisite lines name it by its current name, swapping only
// the occurrences the rule text resolves to it.

function record(
  id: string,
  name: string,
  type: string,
  options: {
    prerequisites?: string;
    printPrerequisites?: string;
    aliases?: string[];
  } = {},
): ContentEntity {
  return {
    id,
    name,
    type,
    source: "Test",
    sources: ["Test"],
    attributes: [],
    categories: [],
    specifics: [],
    rules: [],
    description: "",
    extensions: [],
    provenance: { sourceKey: "test", sourceOrdinal: 0 },
    ...options,
  };
}

// The stock shapes: a race with its hybrids' same-named CountsAsRace.
const stock = [
  record("ID_FMP_RACE_26", "Shadar-kai", "Race"),
  record("ID_INTERNAL_COUNTSASRACE_SHADAR-KAI", "Shadar-kai", "CountsAsRace"),
  record("ID_FMP_RACE_33", "Genasi", "Race"),
  record("ID_FMP_RACE_28", "Warforged", "Race"),
  record("ID_FMP_LANGUAGE_8", "Supernal", "Language"),
  record("ID_FMP_LANGUAGE_6", "Primordial", "Language"),
  record(
    "ID_INTERNAL_BACKGROUND_ASSOCIATION_SUPERNAL",
    "Supernal",
    "Background Association",
  ),
  record("ID_FMP_CLASS_127", "Invoker", "Class"),
  record("ID_FMP_CLASS_9", "Wizard", "Class"),
  record("ID_FMP_CLASS_125", "Artificer", "Class"),
  record("ID_CINDERSOUL", "Cindersoul", "Racial Trait"),
  record("ID_CAUSTICSOUL", "Causticsoul", "Racial Trait"),
  record("ID_EMERGENT_PRIMORDIAL", "Emergent Primordial", "Epic Destiny"),
  record("ID_WARFORGED_JUGGERNAUT", "Warforged Juggernaut", "Paragon Path"),
];

const feats = [
  // An authored print line that drops the rule's "; Paragon Tier".
  record("F_GHOSTLY", "Ghostly Rejuvenation", "Feat", {
    prerequisites: "11th level, shadar-kai; Paragon Tier",
    printPrerequisites: "11th level, shadar-kai",
  }),
  // A reworded print line.
  record("F_ABYSS", "Enemy of the Abyss", "Feat", {
    prerequisites: "Genasi, Cindersoul or Causticsoul",
    printPrerequisites: "Genasi, corrupt manifestation",
  }),
  // Old names inside longer clauses.
  record("F_FLUENT", "Holy Speech", "Feat", {
    prerequisites: "fluent in Supernal",
  }),
  record("F_RIMETONGUE", "Rimetongue Caller", "Feat", {
    prerequisites: "Wizard, Primordial language",
    printPrerequisites: "Wizard, Primordial language",
  }),
  record("F_WARBORN", "Warborn Fury Style", "Feat", {
    prerequisites: "Con 13 or warforged race",
  }),
  record("F_LEARN", "Learn Supernal", "Background", {
    prerequisites: "Supernal background association",
  }),
  record("F_SELF_FORGED", "Self-Forged", "Feat", {
    prerequisites: "!Warforged, artificer",
    printPrerequisites: "Any race except warforged, must be an artificer",
  }),
  // Clauses naming other records that embed an old name.
  record("F_EMERGENT", "Primordial Wrath", "Feat", {
    prerequisites: "Emergent Primordial",
  }),
  record("F_JUGGERNAUT", "Juggernaut Strike", "Feat", {
    prerequisites: "Warforged, Warforged Juggernaut",
  }),
  // More occurrences in the line than resolved clauses.
  record("F_TWICE", "Shadow Twin", "Feat", {
    prerequisites: "Shadar-kai",
    printPrerequisites: "Shadar-kai; you must look like a shadar-kai elder",
  }),
  // An old name in a clause the rule text does not resolve.
  record("F_UNPARSED", "Gauntlet", "Feat", {
    prerequisites: "Any race except warforged, must be an artificer",
  }),
  // Title and capital case.
  record("F_TITLE", "Shadar-Kai Soul", "Feat", {
    prerequisites: "Shadar-Kai; invoker",
    printPrerequisites: "SHADAR-KAI; invoker",
  }),
];

const emptyCharacter: EvaluationInput = {
  level: 1,
  baseAbilities: {},
  occurrences: [],
  inventory: [],
};

const renames: Readonly<Record<string, string>> = {
  ID_FMP_RACE_26: "Fetchling",
  ID_FMP_RACE_33: "Geniekin",
  ID_FMP_RACE_28: "Automaton",
  ID_FMP_LANGUAGE_8: "Celestial",
  ID_FMP_LANGUAGE_6: "Ignan",
  ID_INTERNAL_BACKGROUND_ASSOCIATION_SUPERNAL: "Celestial",
};

function campaign(): ContentEntity[] {
  return [...stock, ...feats].map((entity) =>
    renames[entity.id] === undefined
      ? entity
      : renamedEntity(entity, renames[entity.id]!),
  );
}

describe("prerequisite lines with renamed records (D116 aliases)", () => {
  const content = campaign();
  const { lines, diagnostics } = prerequisiteDisplayLines(content);
  const shown = (id: string) => {
    const entity = content.find((candidate) => candidate.id === id)!;
    return displayPrerequisites(entity, lines);
  };

  it("swaps a renamed race in an authored print line, keeping its case style", () => {
    expect(shown("F_GHOSTLY")).toBe("11th level, fetchling");
    expect(shown("F_TITLE")).toBe("FETCHLING; invoker");
  });

  it("keeps a reworded print line's wording", () => {
    expect(shown("F_ABYSS")).toBe("Geniekin, corrupt manifestation");
    expect(shown("F_SELF_FORGED")).toBe(
      "Any race except automaton, must be an artificer",
    );
  });

  it("swaps an old name inside a longer clause", () => {
    expect(shown("F_FLUENT")).toBe("fluent in Celestial");
    expect(shown("F_RIMETONGUE")).toBe("Wizard, Ignan language");
    expect(shown("F_WARBORN")).toBe("Con 13 or automaton race");
    expect(shown("F_LEARN")).toBe("Celestial background association");
  });

  it("leaves names of other records and unresolved clauses untouched", () => {
    expect(shown("F_EMERGENT")).toBe("Emergent Primordial");
    expect(shown("F_JUGGERNAUT")).toBe("Automaton, Warforged Juggernaut");
    expect(shown("F_UNPARSED")).toBe(
      "Any race except warforged, must be an artificer",
    );
    expect(lines).not.toHaveProperty("F_EMERGENT");
    expect(lines).not.toHaveProperty("F_UNPARSED");
  });

  it("swaps none of a name the line has more often than resolved clauses", () => {
    expect(shown("F_TWICE")).toBe(
      "Shadar-kai; you must look like a shadar-kai elder",
    );
    expect(diagnostics).toEqual([
      {
        entityId: "F_TWICE",
        line: "Shadar-kai; you must look like a shadar-kai elder",
        name: "Shadar-kai",
        occurrences: 2,
        references: 1,
      },
      {
        entityId: "F_UNPARSED",
        line: "Any race except warforged, must be an artificer",
        name: "Warforged",
        occurrences: 1,
        references: 0,
      },
    ]);
  });

  it("keeps a name a resolved record still has (a kept stock tongue)", () => {
    const kept = [
      ...stock.filter(({ id }) => id !== "ID_FMP_LANGUAGE_6"),
      record("ID_FMP_LANGUAGE_6", "Primordial", "Language"),
      record("ID_PF_AQUAN", "Aquan", "Language", { aliases: ["Primordial"] }),
      feats.find(({ id }) => id === "F_RIMETONGUE")!,
    ];
    const result = prerequisiteDisplayLines(kept);
    expect(result.lines).toEqual({});
    expect(result.diagnostics).toEqual([]);
  });

  it("is built once per content set and travels with the evaluation", () => {
    const before =
      contentCacheBuildCounts().get("prerequisite-display-lines") ?? 0;
    const first = evaluateCharacter(emptyCharacter, content);
    const second = evaluateCharacter(emptyCharacter, content);
    expect(first.prerequisiteLines).toEqual(lines);
    expect(second.prerequisiteLines).toBe(first.prerequisiteLines);
    // The set's lines were already built above.
    expect(contentCacheBuildCounts().get("prerequisite-display-lines")).toBe(
      before,
    );
  });

  it("changes nothing for content without aliases (every stock pack)", () => {
    const plain = [...stock, ...feats];
    expect(prerequisiteDisplayLines(plain)).toEqual({
      lines: {},
      diagnostics: [],
    });
    const evaluated = evaluateCharacter(emptyCharacter, plain);
    expect(evaluated).not.toHaveProperty("prerequisiteLines");
    for (const entity of plain)
      expect(displayPrerequisites(entity, evaluated.prerequisiteLines)).toBe(
        displayPrerequisites(entity),
      );
  });
});
