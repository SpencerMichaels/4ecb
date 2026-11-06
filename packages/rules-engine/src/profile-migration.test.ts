import { describe, expect, it } from "vitest";

import type { CharacterBuild } from "@4ecb/character-domain";
import {
  POWER_TEXT_FIELD,
  PREREQUISITE_IR_FIELD,
  type ContentEntity,
  type RuleStatement,
} from "@4ecb/content-domain";

import { applyCharacterCommand } from "@4ecb/character-domain";

import { projectBuildForEvaluation } from "./build-projection";
import { evaluateCharacter } from "./evaluator";
import { previewProfileMigration } from "./profile-migration";

function rule(value: string): RuleStatement {
  return {
    name: "statadd",
    attributes: [
      { name: "name", value: "Migration score" },
      { name: "value", value },
    ],
    text: "",
    children: [],
    ordinal: 0,
  };
}

function entity(id: string, value: string): ContentEntity {
  return {
    id,
    name: id,
    type: "Feat",
    source: "Synthetic migration fixture",
    sources: ["Synthetic migration fixture"],
    attributes: [],
    categories: [],
    specifics: [],
    rules: [rule(value)],
    description: "",
    extensions: [],
    provenance: { sourceKey: "migration", sourceOrdinal: 0 },
  };
}

const build: CharacterBuild = {
  formatVersion: 3,
  known: [],
  effectiveLevel: 1,
  levels: [
    {
      level: 1,
      root: {
        id: "root",
        identity: { definitionId: "LEVEL", name: "1", type: "Level" },
        acquiredLevel: 1,
        legality: "rules-legal",
        unresolved: false,
        children: [
          {
            id: "selected",
            identity: {
              definitionId: "SELECTED",
              name: "Selected",
              type: "Feat",
            },
            acquiredLevel: 1,
            legality: "rules-legal",
            unresolved: false,
            children: [],
          },
        ],
      },
    },
  ],
  grabbag: [],
  inventory: [
    {
      id: "item",
      acquiredLevel: 1,
      quantity: 1,
      equippedQuantity: 0,
      elements: [{ definitionId: "MISSING", name: "Missing", type: "Gear" }],
      overrides: {},
      legality: "rules-legal",
    },
  ],
  alternates: [],
  baseAbilities: {},
  textStrings: {},
};

describe("content profile migration preview", () => {
  it("reports missing and changed references plus evaluated value differences", () => {
    const preview = previewProfileMigration(
      build,
      [
        entity("LEVEL", "+1"),
        entity("SELECTED", "+1"),
        entity("MISSING", "+1"),
      ],
      [entity("LEVEL", "+1"), entity("SELECTED", "+4")],
    );

    expect(preview.sourceAvailable).toBe(true);
    expect(preview.referencedDefinitionCount).toBe(3);
    expect(preview.missingDefinitionIds).toEqual(["MISSING"]);
    expect(preview.changedDefinitionIds).toEqual(["SELECTED"]);
    // The owned, unslotted gear executes in the source profile (ShouldExecute).
    expect(preview.statChanges).toContainEqual({
      name: "Migration score",
      before: 3,
      after: 5,
    });
    expect(preview.source).toBeDefined();
    expect(preview.target).toMatchObject({ converged: true });
  });

  it("ignores pack-build parse fields when listing changed rules", () => {
    const parsed = (parse: string, hit = "1[W] damage.") => ({
      ...entity("SELECTED", "+1"),
      specifics: [
        { name: "Hit", value: hit, extraAttributes: [], ordinal: 0 },
        {
          name: POWER_TEXT_FIELD,
          value: parse,
          extraAttributes: [],
          ordinal: 1,
        },
        {
          name: PREREQUISITE_IR_FIELD,
          value: parse,
          extraAttributes: [],
          ordinal: 2,
        },
      ],
    });
    const level = entity("LEVEL", "+1");

    expect(
      previewProfileMigration(
        build,
        [level, parsed('{"version":3}')],
        [level, parsed('{"version":4}')],
      ).changedDefinitionIds,
    ).toEqual([]);
    expect(
      previewProfileMigration(
        build,
        [level, parsed('{"version":3}')],
        [level, parsed('{"version":4}', "2[W] damage.")],
      ).changedDefinitionIds,
    ).toEqual(["SELECTED"]);
  });

  it("keeps adoption evidence explicit when the old profile is unavailable", () => {
    const preview = previewProfileMigration(build, undefined, [
      entity("LEVEL", "+1"),
    ]);
    expect(preview.sourceAvailable).toBe(false);
    expect(preview.source).toBeUndefined();
    expect(preview.changedDefinitionIds).toEqual([]);
    expect(preview.missingDefinitionIds).toEqual(["MISSING", "SELECTED"]);
  });

  it("reports progress through the new evaluation, then the old", () => {
    const steps: string[] = [];
    previewProfileMigration(
      build,
      [entity("LEVEL", "+1")],
      [entity("LEVEL", "+1")],
      {
        onProgress: ({ evaluation, completed, total }) =>
          steps.push(`${evaluation} ${completed}/${total}`),
      },
    );
    expect(steps[0]).toMatch(/^target 0\//);
    expect(steps.at(-1)).toMatch(/^source (\d+)\/\1$/);
    expect(
      steps.findIndex((step) => step.startsWith("source")),
    ).toBeGreaterThan(steps.findLastIndex((step) => step.startsWith("target")));
  });

  it("fills a Ritual choice the new content adds from a known ritual", () => {
    const record = (
      id: string,
      name: string,
      type: string,
      rules: readonly RuleStatement[] = [],
    ): ContentEntity => ({ ...entity(id, "+0"), name, type, rules });
    const select: RuleStatement = {
      name: "select",
      attributes: [
        { name: "type", value: "Ritual" },
        { name: "number", value: "1" },
        { name: "Category", value: "ID_FMP_RITUAL_55|ID_FMP_RITUAL_60" },
      ],
      text: "",
      children: [],
      ordinal: 0,
    };
    const rituals = [
      record("ID_FMP_RITUAL_55", "Sending", "Ritual"),
      record("ID_FMP_RITUAL_60", "Tenser's Floating Disk", "Ritual"),
    ];
    const before = [
      record("LEVEL", "1", "Level"),
      record("ID_FMP_CLASS_437", "Psion", "Class"),
      ...rituals,
    ];
    const after = [
      record("LEVEL", "1", "Level"),
      record("ID_FMP_CLASS_437", "Psion", "Class", [select]),
      ...rituals,
    ];
    const psion: CharacterBuild = {
      ...build,
      inventory: [],
      levels: [
        {
          level: 1,
          root: {
            ...build.levels[0]!.root,
            children: [
              {
                id: "class",
                identity: {
                  definitionId: "ID_FMP_CLASS_437",
                  name: "Psion",
                  type: "Class",
                },
                acquiredLevel: 1,
                legality: "rules-legal",
                unresolved: false,
                children: [],
              },
            ],
          },
        },
      ],
      // Learned under the retired `from=` allowance of the old content.
      known: [
        {
          id: "sending",
          acquiredLevel: 1,
          element: {
            definitionId: "ID_FMP_RITUAL_55",
            name: "Sending",
            type: "Ritual",
          },
          acquisition: "free",
          allowance: "ID_FMP_CLASS_437#2",
        },
      ],
    };
    const preview = previewProfileMigration(psion, before, after);
    expect(preview.ritualChoiceFills).toEqual([
      expect.objectContaining({
        entryId: "sending",
        name: "Sending",
        provider: "Psion",
      }),
    ]);
    const adopted = applyCharacterCommand(psion, preview.ritualChoiceCommand!);
    expect(adopted.known).toEqual(psion.known);
    const evaluation = evaluateCharacter(
      projectBuildForEvaluation(adopted, after),
      after,
    );
    const choice = evaluation.choices.find(({ type }) => type === "Ritual");
    expect(
      evaluation.occurrences.find(
        ({ id }) => id === choice?.selectedOccurrenceId,
      )?.definitionId,
    ).toBe("ID_FMP_RITUAL_55");
    // Nothing to fill on the old content, which has no such choice.
    expect(
      previewProfileMigration(psion, after, before).ritualChoiceFills,
    ).toEqual([]);
  });
});
