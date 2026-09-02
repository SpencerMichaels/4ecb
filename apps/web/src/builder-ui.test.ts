import { describe, expect, it } from "vitest";

import {
  applyCharacterCommand,
  type CharacterBuild,
} from "@4ecb/character-domain";
import type { ContentEntity } from "@4ecb/content-domain";
import type { EvaluatedCharacter } from "@4ecb/rules-engine";

import {
  candidateReason,
  choiceForSkillCandidate,
  choicesAtLevel,
  groupDependentChoiceFlows,
  groupLevelChoices,
  groupChoicesByLegacyWorkflow,
  groupParameterizedCandidates,
  groupRepeatedChoiceSlots,
  isCandidateVisible,
  isOptionalRetrainingChoice,
  planningHorizonCommand,
  selectedChoiceHasWarning,
  unresolveEvaluatedChoiceCommand,
} from "./builder-ui";

const level = (number: number): ContentEntity => ({
  id: `ID_INTERNAL_LEVEL_${number}`,
  name: String(number),
  type: "Level",
  source: "Public test fixture",
  sources: ["Public test fixture"],
  attributes: [],
  categories: [],
  specifics: [],
  rules: [],
  description: "",
  extensions: [],
  provenance: { sourceKey: "builder-ui", sourceOrdinal: number },
});

const build: CharacterBuild = {
  formatVersion: 1,
  effectiveLevel: 1,
  levels: [
    {
      level: 1,
      root: {
        id: "level-1",
        identity: {
          definitionId: "ID_INTERNAL_LEVEL_1",
          name: "1",
          type: "Level",
        },
        acquiredLevel: 1,
        legality: "rules-legal",
        children: [],
        unresolved: false,
      },
    },
  ],
  grabbag: [],
  inventory: [],
  alternates: [],
  baseAbilities: {},
  textStrings: {},
};

describe("builder planning UI", () => {
  it("groups large parenthetical families without changing exact candidates", () => {
    const candidates = [
      "GREATBOW",
      "HANDAXE",
      "RAPIER",
      "LONGBOW",
      "OTHER",
      "SMALL_A",
      "SMALL_B",
    ].map((definitionId) => ({
      definitionId,
      eligible: true,
      reasons: [],
    }));
    const names: Record<string, string> = {
      GREATBOW: "Weapon Proficiency (Greatbow)",
      HANDAXE: "Weapon Proficiency (Handaxe)",
      RAPIER: "Weapon Proficiency (Rapier)",
      LONGBOW: "Weapon Proficiency (Longbow)",
      OTHER: "Alertness",
      SMALL_A: "Special Training (First)",
      SMALL_B: "Special Training (Second)",
    };
    const groups = groupParameterizedCandidates(candidates, (id) => names[id]!);
    expect(groups[0]).toMatchObject({
      label: "Weapon Proficiency",
      parameterLabel: "Weapon type",
      options: [
        { candidate: { definitionId: "GREATBOW" }, label: "Greatbow" },
        { candidate: { definitionId: "HANDAXE" }, label: "Handaxe" },
        { candidate: { definitionId: "RAPIER" }, label: "Rapier" },
        { candidate: { definitionId: "LONGBOW" }, label: "Longbow" },
      ],
    });
    expect(groups.slice(1).map(({ label }) => label)).toEqual([
      "Alertness",
      "Special Training (First)",
      "Special Training (Second)",
    ]);
  });

  it("creates every intervening level without advancing the current level", () => {
    const command = planningHorizonCommand(
      build,
      4,
      [level(1), level(2), level(3), level(4)],
      (value) => `level-${value}`,
    );
    expect(command).toBeDefined();
    const planned = applyCharacterCommand(build, command!);
    expect(planned.levels.map((frame) => frame.level)).toEqual([1, 2, 3, 4]);
    expect(planned.effectiveLevel).toBe(1);
  });

  it("does not mutate stored levels when the visible horizon is lowered", () => {
    expect(
      planningHorizonCommand(build, 1, [level(1)], String),
    ).toBeUndefined();
  });

  it("turns evaluator reasons into objective user-facing text", () => {
    expect(candidateReason(["category", "self"])).toBe(
      "Does not match this choice category; A feature cannot select itself",
    );
  });

  it("never exposes category mismatches through the Show all filter", () => {
    const categoryMismatch = {
      definitionId: "cross-category",
      eligible: false,
      reasons: ["category"],
    };
    expect(isCandidateVisible(categoryMismatch, false)).toBe(false);
    expect(isCandidateVisible(categoryMismatch, true)).toBe(false);
    expect(isCandidateVisible(categoryMismatch, true, "cross-category")).toBe(
      false,
    );
  });

  it("shows legal, explicitly revealed, and recoverable selected candidates", () => {
    const legal = { definitionId: "legal", eligible: true, reasons: [] };
    const unavailable = {
      definitionId: "unavailable",
      eligible: false,
      reasons: ["prerequisite"],
    };
    expect(isCandidateVisible(legal, false)).toBe(true);
    expect(isCandidateVisible(unavailable, false)).toBe(false);
    expect(isCandidateVisible(unavailable, true)).toBe(true);
    expect(isCandidateVisible(unavailable, false, "unavailable")).toBe(true);
  });

  it("checks replacement legality only against the selected target", () => {
    const choice = {
      id: "replacement",
      type: "Replacement",
      optional: true,
      selectedOccurrenceId: "fading",
      replacementOptions: [
        {
          replacesOccurrenceId: "nimble",
          definitionId: "NIMBLE",
          candidates: [{ definitionId: "FADING", eligible: true, reasons: [] }],
        },
        {
          replacesOccurrenceId: "twin",
          definitionId: "TWIN",
          candidates: [
            {
              definitionId: "FADING",
              eligible: false,
              reasons: ["prerequisite"],
            },
          ],
        },
      ],
    } as unknown as EvaluatedCharacter["choices"][number];
    const evaluation = {
      occurrences: [
        {
          id: "fading",
          definitionId: "FADING",
          replacesId: "nimble",
          legality: "rules-legal",
        },
      ],
    } as unknown as EvaluatedCharacter;
    expect(selectedChoiceHasWarning(choice, evaluation)).toBe(false);
    expect(isOptionalRetrainingChoice(choice)).toBe(true);
    expect(
      isOptionalRetrainingChoice({ ...choice, name: "Mastery replacement" }),
    ).toBe(false);
  });

  it("keeps inventory-owned configuration out of the level-up timeline", () => {
    const evaluation = {
      occurrences: [
        {
          id: "level",
          kind: "root",
        },
        {
          id: "item",
          kind: "inventory",
        },
      ],
      choices: [
        { id: "advancement", level: 8, providerOccurrenceId: "level" },
        { id: "item-choice", level: 8, providerOccurrenceId: "item" },
      ],
    } as unknown as EvaluatedCharacter;

    expect(choicesAtLevel(8, evaluation).map(({ id }) => id)).toEqual([
      "advancement",
    ]);
  });

  it("groups repeated background and skill slots without losing order", () => {
    const choices = [
      { id: "race", type: "Race" },
      { id: "background-1", type: "Background" },
      { id: "skill-1", type: "Skill Training" },
      { id: "background-2", type: "Background" },
      { id: "skill-2", type: "Skill Training" },
      { id: "feat", type: "Feat" },
    ] as unknown as EvaluatedCharacter["choices"];
    const grouped = groupLevelChoices(choices);
    expect(grouped.backgrounds.map(({ id }) => id)).toEqual([
      "background-1",
      "background-2",
    ]);
    expect(grouped.skillTraining.map(({ id }) => id)).toEqual([
      "skill-1",
      "skill-2",
    ]);
    expect(grouped.ordinary.map(({ id }) => id)).toEqual(["race", "feat"]);
  });

  it("presents first-level choices in the legacy builder workflow order", () => {
    const choices = [
      { id: "gender", type: "Gender" },
      { id: "feat", type: "Feat" },
      { id: "daily", type: "Power Daily 1" },
      { id: "race", type: "Race" },
      { id: "skills", type: "Skill Training" },
      { id: "theme", type: "Theme" },
      { id: "class-feature", type: "Class Feature" },
      { id: "class", type: "Class" },
      { id: "alignment", type: "Alignment" },
      { id: "race-bonus", type: "Race Ability Bonus" },
    ] as unknown as EvaluatedCharacter["choices"];

    expect(
      groupChoicesByLegacyWorkflow(choices).map(({ section, choices }) => [
        section,
        choices.map(({ id }) => id),
      ]),
    ).toEqual([
      ["Class", ["class", "class-feature"]],
      ["Race", ["race", "race-bonus"]],
      ["Background", ["theme"]],
      ["Skills", ["skills"]],
      ["Powers", ["daily"]],
      ["Feats", ["feat"]],
      ["Character Details", ["gender", "alignment"]],
    ]);
  });

  it("presents nested selections and their replacement as one choice flow", () => {
    const choices = [
      {
        id: "feat",
        selectedOccurrenceId: "archery-mastery",
        providerOccurrenceId: "level-8",
      },
      {
        id: "mastery",
        selectedOccurrenceId: "rapid-shot-mastery",
        providerOccurrenceId: "archery-mastery",
      },
      {
        id: "replacement",
        providerOccurrenceId: "rapid-shot-mastery",
      },
      { id: "utility", providerOccurrenceId: "level-8" },
    ] as unknown as EvaluatedCharacter["choices"];

    expect(
      groupDependentChoiceFlows(choices).map((flow) =>
        flow.map(({ id }) => id),
      ),
    ).toEqual([["feat", "mastery", "replacement"], ["utility"]]);
  });

  it("groups positional slots emitted by the same rule", () => {
    const choices = [
      {
        id: "ability-1",
        level: 8,
        providerOccurrenceId: "level-8",
        ruleOrdinal: 3,
        type: "Ability Increase (Level 8)",
      },
      {
        id: "ability-2",
        level: 8,
        providerOccurrenceId: "level-8",
        ruleOrdinal: 3,
        type: "Ability Increase (Level 8)",
      },
      {
        id: "feat",
        level: 8,
        providerOccurrenceId: "level-8",
        ruleOrdinal: 2,
        type: "Feat",
      },
    ] as unknown as EvaluatedCharacter["choices"];

    expect(
      groupRepeatedChoiceSlots(choices).map((group) =>
        group.map(({ id }) => id),
      ),
    ).toEqual([["ability-1", "ability-2"]]);
  });

  it("fills the first unresolved skill slot that can accept a candidate", () => {
    const choices = [
      {
        id: "chosen",
        selectedOccurrenceId: "athletics",
        candidates: [],
      },
      {
        id: "blocked",
        candidates: [
          { definitionId: "ARCANA", eligible: false, reasons: ["category"] },
        ],
      },
      {
        id: "available",
        candidates: [{ definitionId: "ARCANA", eligible: true, reasons: [] }],
      },
    ] as unknown as EvaluatedCharacter["choices"];
    expect(
      choiceForSkillCandidate(choices, new Set(["chosen"]), "ARCANA", true)?.id,
    ).toBe("available");
  });

  it("clears a trained skill by replacing its exact positional slot", () => {
    const provider = level(1);
    const entity = {
      ...provider,
      rules: [
        {
          name: "select",
          attributes: [
            { name: "type", value: "Skill Training" },
            { name: "number", value: "2" },
          ],
          text: "",
          children: [],
          ordinal: 0,
        },
      ],
    } satisfies ContentEntity;
    const skillBuild: CharacterBuild = {
      ...build,
      levels: [
        {
          ...build.levels[0]!,
          root: {
            ...build.levels[0]!.root,
            children: [
              {
                id: "athletics",
                identity: {
                  definitionId: "ATHLETICS",
                  name: "Athletics",
                  type: "Skill Training",
                },
                acquiredLevel: 1,
                legality: "rules-legal",
                children: [],
                unresolved: false,
              },
              {
                id: "arcana",
                identity: {
                  definitionId: "ARCANA",
                  name: "Arcana",
                  type: "Skill Training",
                },
                acquiredLevel: 1,
                legality: "rules-legal",
                children: [],
                unresolved: false,
              },
            ],
          },
        },
      ],
    };
    const evaluation = {
      occurrences: [
        { id: "level-1", definitionId: entity.id },
        { id: "arcana", definitionId: "ARCANA" },
      ],
    } as unknown as EvaluatedCharacter;
    const choice = {
      providerOccurrenceId: "level-1",
      ruleOrdinal: 0,
      index: 1,
      selectedOccurrenceId: "arcana",
    } as unknown as EvaluatedCharacter["choices"][number];
    const command = unresolveEvaluatedChoiceCommand(
      skillBuild,
      choice,
      evaluation,
      [entity],
      "placeholder-skill",
    );
    expect(command).toMatchObject({
      kind: "choose",
      parentId: "level-1",
      index: 1,
      occurrence: { id: "placeholder-skill", unresolved: true },
    });
    expect(
      applyCharacterCommand(skillBuild, command!).levels[0]?.root.children[0]
        ?.id,
    ).toBe("athletics");
  });
});
