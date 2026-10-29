import { describe, expect, it } from "vitest";

import type { ContentEntity, RuleStatement } from "@4ecb/content-domain";
import {
  evaluateCharacter,
  projectBuildForEvaluation,
} from "@4ecb/rules-engine";

import { auditSavedSelections, importDnd4e } from ".";

function statement(
  name: string,
  attributes: Readonly<Record<string, string>>,
  ordinal: number,
): RuleStatement {
  return {
    name,
    attributes: Object.entries(attributes).map(([attribute, value]) => ({
      name: attribute,
      value,
    })),
    text: "",
    children: [],
    ordinal,
  };
}

function entity(
  id: string,
  name: string,
  type: string,
  rules: readonly RuleStatement[] = [],
): ContentEntity {
  return {
    id,
    name,
    type,
    source: "Public saved-selection fixture",
    sources: ["Public saved-selection fixture"],
    attributes: [],
    categories: [],
    specifics: [],
    rules,
    description: "",
    extensions: [],
    provenance: { sourceKey: "saved-selection-audit", sourceOrdinal: 0 },
  };
}

const element = (
  name: string,
  type: string,
  id: string,
  charelem: string,
  children = "",
) =>
  `<RulesElement name="${name}" type="${type}" internal-id="${id}" charelem="${charelem}" legality="rules-legal"${children === "" ? " />" : `>${children}</RulesElement>`}`;

/**
 * A level-1 character whose feat grants a power now and another at level 5,
 * spelled as the legacy builder saves it: the level tree holds every grant,
 * the RulesElementTally only what applies.
 */
const SAVE = `<D20Character game-system="D&amp;D4E">
  <CharacterSheet>
    <RulesElementTally>
      ${element("1", "Level", "ID_INTERNAL_LEVEL_1", "a1")}
      ${element("Bold Feat", "Feat", "ID_TEST_FEAT_BOLD", "a2")}
      ${element("Bold Strike", "Power", "ID_TEST_POWER_STRIKE", "a3")}
    </RulesElementTally>
  </CharacterSheet>
  <Level>
    ${element(
      "1",
      "Level",
      "ID_INTERNAL_LEVEL_1",
      "a1",
      element(
        "Bold Feat",
        "Feat",
        "ID_TEST_FEAT_BOLD",
        "a2",
        element("Bold Strike", "Power", "ID_TEST_POWER_STRIKE", "a3") +
          element("Bolder Strike", "Power", "ID_TEST_POWER_LATER", "a4"),
      ) +
        `<RulesElement name="" type="" charelem="a5" legality="rules-legal" />`,
    )}
  </Level>
</D20Character>`;

const content = (featRules: readonly RuleStatement[] = []) => [
  entity("ID_INTERNAL_LEVEL_1", "1", "Level", [
    statement("select", { type: "Feat", number: "1" }, 0),
  ]),
  entity("ID_TEST_FEAT_BOLD", "Bold Feat", "Feat", [
    statement("grant", { name: "ID_TEST_POWER_STRIKE", type: "Power" }, 0),
    statement(
      "grant",
      { name: "ID_TEST_POWER_LATER", type: "Power", Level: "5" },
      1,
    ),
    ...featRules,
  ]),
  entity("ID_TEST_POWER_STRIKE", "Bold Strike", "Power"),
  entity("ID_TEST_POWER_LATER", "Bolder Strike", "Power"),
  entity("ID_TEST_POWER_EXTRA", "Newer Strike", "Power"),
];

function audit(entities: readonly ContentEntity[], dropOccurrence?: string) {
  const imported = importDnd4e(SAVE, { matchMissingDefinitionsIn: entities });
  const input = projectBuildForEvaluation(imported.build, entities);
  const evaluated = evaluateCharacter(
    {
      ...input,
      occurrences: input.occurrences.filter(
        (occurrence) => occurrence.id !== dropOccurrence,
      ),
    },
    entities,
  );
  return auditSavedSelections(imported, evaluated, entities);
}

describe("saved-selection invariant", () => {
  it("finds every saved element active or accounted for", () => {
    const result = audit(content());

    expect(result.blankSlots).toBe(1);
    expect(
      result.elements.map(({ name, status }) => `${name}: ${status}`),
    ).toEqual([
      "1: active",
      "Bold Feat: active",
      "Bold Strike: active",
      // Saved under its provider, applied by neither builder until level 5.
      "Bolder Strike: legacy-inactive",
    ]);
    expect(result.extras).toEqual([]);
  });

  it("reports a saved element the evaluation lost without a reason", () => {
    const result = audit(content(), "legacy:a2");

    expect(
      result.elements.filter(({ status }) => status === "silent-drop"),
    ).toEqual([
      expect.objectContaining({
        name: "Bold Feat",
        type: "Feat",
        legacyActive: true,
      }),
    ]);
  });

  it("classifies an active element the save never held", () => {
    const result = audit(
      content([
        statement("grant", { name: "ID_TEST_POWER_EXTRA", type: "Power" }, 2),
      ]),
    );

    expect(result.extras).toEqual([
      expect.objectContaining({
        name: "Newer Strike",
        cause: "content-grant",
        provider: "Bold Feat (Feat)",
      }),
    ]);
  });
});
