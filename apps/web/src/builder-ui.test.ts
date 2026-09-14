import { describe, expect, it } from "vitest";

import {
  applyCharacterCommand,
  type CharacterBuild,
} from "@4ecb/character-domain";
import type { ContentEntity, RuleStatement } from "@4ecb/content-domain";
import {
  evaluateCharacter,
  projectBuildForEvaluation,
  type CandidateDecision,
  type EvaluatedCharacter,
} from "@4ecb/rules-engine";

import {
  applyBuildPresetCommand,
  buildPresetSuggestionNames,
  candidateReason,
  candidateTableTypeGroup,
  classTableMetadata,
  contextualChoiceName,
  choiceSelectionTableKind,
  choiceTableSummary,
  choicePresentationLabel,
  contentSpecificValue,
  choiceForRepeatedCandidate,
  choicesAtLevel,
  evaluationAtHorizon,
  firstSentence,
  grantedDetailEntities,
  groupDependentChoiceFlows,
  groupLevelChoices,
  groupOverviewChoices,
  groupChoicesByLegacyWorkflow,
  groupBackgroundChoiceCandidates,
  groupParameterizedCandidates,
  groupRepeatedCandidateScopes,
  groupRepeatedChoiceSlots,
  identityChoiceLabel,
  isCandidateSelectable,
  isCandidateVisible,
  isCharacterDetailChoice,
  isBuildPresetChoice,
  isAbilityIncreaseChoiceType,
  isOptionalRetrainingChoice,
  planningHorizonCommand,
  powerTableLevel,
  selectedChoiceHasWarning,
  splitLabeledDescription,
  unresolveEvaluatedChoiceCommand,
} from "./builder-ui";

function candidate(
  definitionId: string,
  eligible = true,
  reasons: readonly string[] = [],
): CandidateDecision {
  return {
    definitionId,
    eligible,
    sourceEntitled: true,
    rulesLegal: eligible,
    activeDefinition: false,
    activeOccurrenceIds: [],
    providerOccurrenceIds: [],
    reasons,
  };
}

const level = (
  number: number,
  rules: readonly RuleStatement[] = [],
): ContentEntity => ({
  id: `ID_INTERNAL_LEVEL_${number}`,
  name: String(number),
  type: "Level",
  source: "Public test fixture",
  sources: ["Public test fixture"],
  attributes: [],
  categories: [],
  specifics: [],
  rules,
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
  it("resolves unconditional feat and power grants for nested details", () => {
    const definition = (
      id: string,
      name: string,
      type: string,
      rules: readonly RuleStatement[] = [],
    ): ContentEntity => ({ ...level(1, rules), id, name, type });
    const defensiveMobility = definition(
      "DEFENSIVE_MOBILITY",
      "Defensive Mobility",
      "Feat",
    );
    const rangerPower = definition("RANGER_POWER", "Ranger Power", "Power");
    const internal = definition("INTERNAL", "Internal helper", "Internal");
    const archer = definition(
      "ARCHER",
      "Archer Fighting Style",
      "Class Feature",
      [
        {
          name: "grant",
          attributes: [
            { name: "name", value: defensiveMobility.id },
            { name: "type", value: defensiveMobility.type },
          ],
          text: "",
          children: [],
          ordinal: 0,
        },
        {
          name: "grant",
          attributes: [
            { name: "name", value: rangerPower.id },
            { name: "type", value: rangerPower.type },
            { name: "requires", value: "CONDITIONAL" },
          ],
          text: "",
          children: [],
          ordinal: 1,
        },
        {
          name: "grant",
          attributes: [
            { name: "name", value: internal.id },
            { name: "type", value: internal.type },
          ],
          text: "",
          children: [],
          ordinal: 2,
        },
      ],
    );
    const references = new Map(
      [defensiveMobility, rangerPower, internal].map((entity) => [
        entity.id.toLocaleLowerCase(),
        entity,
      ]),
    );

    expect(grantedDetailEntities(archer, references)).toEqual([
      defensiveMobility,
    ]);
  });

  it("does not present a stale current-level result as a future plan", () => {
    const current = { level: 1 } as EvaluatedCharacter;
    const planned = { level: 4 } as EvaluatedCharacter;

    expect(evaluationAtHorizon(current, 4)).toBeUndefined();
    expect(evaluationAtHorizon(planned, 4)).toBe(planned);
  });

  it("uses concise player-facing labels in the level timeline", () => {
    expect(choicePresentationLabel("Choose Class Feature")).toBe(
      "Class Feature",
    );
    expect(choicePresentationLabel("Choose Background Choice")).toBe(
      "Background",
    );
    expect(choicePresentationLabel("Power Encounter 1")).toBe(
      "Encounter Power",
    );
    expect(choicePresentationLabel("Power Utility 6")).toBe("Utility Power");
    expect(choicePresentationLabel("Choose Ability Increase (Level 8)")).toBe(
      "Ability Score Increase",
    );
    expect(
      choicePresentationLabel("Companion Ability Increase (Level 8)"),
    ).toBe("Ability Score Increase");
    expect(
      isAbilityIncreaseChoiceType("Companion Ability Increase (Level 8)"),
    ).toBe(true);
    expect(identityChoiceLabel("Class")).toBe("Class");
    expect(identityChoiceLabel("Race")).toBe("Race");
    expect(identityChoiceLabel("Class Feature")).toBeUndefined();
  });

  it("treats Build choices as preset controls and parses their package", () => {
    const preset = {
      ...level(0),
      id: "BUILD",
      name: "War Wizard",
      type: "Build",
      specifics: [
        {
          name: "Suggested",
          value:
            "Feat: Expanded Spellbook (Human feat: Action Surge)\nSkills: Arcana, History\nAt-Will Powers: magic missile, scorching burst",
          extraAttributes: [],
          ordinal: 0,
        },
      ],
    };

    expect(
      isBuildPresetChoice({
        type: "Build",
      } as unknown as EvaluatedCharacter["choices"][number]),
    ).toBe(true);
    expect(buildPresetSuggestionNames(preset)).toEqual([
      "Expanded Spellbook",
      "Action Surge",
      "Arcana",
      "History",
      "magic missile",
      "scorching burst",
    ]);
  });

  it("derives feat and power table fields from authored legacy metadata", () => {
    const feat = {
      ...level(0),
      type: "Feat",
      flavor: "Longer flavor",
      specifics: [
        {
          name: "Short Description",
          value: "Gain a +2 feat bonus.",
          extraAttributes: [],
          ordinal: 0,
        },
      ],
    };
    const power = {
      ...level(0),
      type: "Power",
      flavor: "Move before striking.",
      description: "Long rules text",
      specifics: [
        {
          name: "Action Type",
          value: "Standard action",
          extraAttributes: [],
          ordinal: 0,
        },
      ],
    };
    const deity = {
      ...level(0),
      type: "Deity",
      specifics: [
        {
          name: "Alignment",
          value: "Lawful Good",
          extraAttributes: [],
          ordinal: 0,
        },
      ],
    };

    expect(
      choiceSelectionTableKind({
        type: "Feat",
      } as unknown as EvaluatedCharacter["choices"][number]),
    ).toBe("feat");
    expect(
      choiceSelectionTableKind({
        type: "Power Encounter 1",
      } as unknown as EvaluatedCharacter["choices"][number]),
    ).toBe("power");
    expect(
      choiceSelectionTableKind({
        type: "Feat Choice",
      } as unknown as EvaluatedCharacter["choices"][number]),
    ).toBe("feat");
    expect(
      choiceSelectionTableKind({
        type: "Class",
      } as unknown as EvaluatedCharacter["choices"][number]),
    ).toBe("class");
    expect(
      choiceSelectionTableKind({
        type: "Class Feature",
      } as unknown as EvaluatedCharacter["choices"][number]),
    ).toBe("feature");
    expect(
      choiceSelectionTableKind({
        type: "Deity",
      } as unknown as EvaluatedCharacter["choices"][number]),
    ).toBe("deity");
    expect(
      choiceSelectionTableKind({
        type: "Race",
        candidates: Array.from({ length: 9 }, (_, index) => ({
          definitionId: `race-${index}`,
        })),
      } as unknown as EvaluatedCharacter["choices"][number]),
    ).toBe("option");
    expect(
      choiceSelectionTableKind({
        type: "Alignment",
        candidates: Array.from({ length: 5 }, (_, index) => ({
          definitionId: `alignment-${index}`,
        })),
      } as unknown as EvaluatedCharacter["choices"][number]),
    ).toBeUndefined();
    expect(choiceTableSummary(feat, "feat")).toBe("Gain a +2 feat bonus.");
    expect(choiceTableSummary(power, "power")).toBe("Move before striking.");
    expect(choiceTableSummary(deity, "deity")).toBe("Lawful Good");
    expect(
      choiceTableSummary(
        {
          ...level(0),
          type: "Build",
          description: "Lead with control. Then protect your allies.",
        },
        "preset",
      ),
    ).toBe("Lead with control.");
    expect(contentSpecificValue(power, "action type")).toBe("Standard action");
  });

  it("derives compact class metadata from authored legacy fields", () => {
    const ranger = {
      ...level(0),
      type: "Class",
      specifics: [
        {
          name: "Role",
          value: "Striker. You focus damage on one enemy.",
          extraAttributes: [],
          ordinal: 0,
        },
        {
          name: "Power Source",
          value: "Martial. Your talents come from training.",
          extraAttributes: [],
          ordinal: 1,
        },
        {
          name: "Short Description",
          value: "A master of bow and blade.",
          extraAttributes: [],
          ordinal: 2,
        },
      ],
    };

    expect(classTableMetadata(ranger)).toEqual({
      role: { label: "Striker", description: "You focus damage on one enemy." },
      powerSource: {
        label: "Martial",
        description: "Your talents come from training.",
      },
    });
    expect(choiceTableSummary(ranger, "class")).toBe(
      "A master of bow and blade.",
    );
    expect(splitLabeledDescription("Defender. Very durable.")).toEqual({
      label: "Defender",
      description: "Very durable.",
    });
    expect(firstSentence("First sentence. Second sentence.")).toBe(
      "First sentence.",
    );
  });

  it("names a generic class-feature choice from its authored provider", () => {
    const provider = {
      ...level(0),
      id: "FEATURE_CENSURE",
      name: "Avenger's Censure",
      type: "Class Feature",
    };
    const option = {
      ...level(0),
      id: "FEATURE_UNITY",
      name: "Censure of Unity",
      type: "Class Feature",
      categories: ["FEATURE_CENSURE", "1"],
      specifics: [
        {
          name: "Short Description",
          value: "Fight more effectively beside your allies.",
          extraAttributes: [],
          ordinal: 0,
        },
      ],
    };
    const choice = {
      id: "censure-choice",
      level: 1,
      providerOccurrenceId: "censure-provider",
      ruleOrdinal: 0,
      index: 0,
      type: "Class Feature",
      optional: false,
      candidates: [candidate(option.id)],
    } as EvaluatedCharacter["choices"][number];
    const evaluation = {
      occurrences: [
        {
          id: "censure-provider",
          definitionId: provider.id,
          acquiredLevel: 1,
          kind: "grant",
        },
      ],
    } as unknown as EvaluatedCharacter;
    const byId = new Map(
      [provider, option].map((entity) => [entity.id, entity] as const),
    );

    expect(contextualChoiceName(choice, evaluation, (id) => byId.get(id))).toBe(
      "Avenger's Censure",
    );
    expect(choiceTableSummary(option, "feature")).toBe(
      "Fight more effectively beside your allies.",
    );
    expect(
      contextualChoiceName(
        choice,
        { occurrences: [] } as unknown as EvaluatedCharacter,
        (id) => byId.get(id),
      ),
    ).toBe("Avenger's Censure");

    const anonymousOption = {
      ...option,
      id: "FEATURE_ANONYMOUS",
      name: "Anonymous Option",
      categories: ["1"],
    };
    expect(
      contextualChoiceName(
        { ...choice, candidates: [candidate(anonymousOption.id)] },
        { occurrences: [] } as unknown as EvaluatedCharacter,
        (id) => (id === anonymousOption.id ? anonymousOption : undefined),
      ),
    ).toBeUndefined();
  });

  it("applies a Build preset only to matching unresolved choices", () => {
    const rules = [
      {
        name: "select",
        attributes: [
          { name: "type", value: "Build" },
          { name: "number", value: "1" },
        ],
        text: "",
        children: [],
        ordinal: 0,
      },
      {
        name: "select",
        attributes: [
          { name: "type", value: "Feat" },
          { name: "number", value: "1" },
        ],
        text: "",
        children: [],
        ordinal: 1,
      },
      {
        name: "select",
        attributes: [
          { name: "type", value: "Skill Training" },
          { name: "number", value: "1" },
        ],
        text: "",
        children: [],
        ordinal: 2,
      },
    ] satisfies RuleStatement[];
    const provider = level(1, rules);
    const preset = {
      ...level(0),
      id: "BUILD",
      name: "Preset",
      type: "Build",
      specifics: [
        {
          name: "Suggested",
          value: "Feat: Power Attack\nSkills: Athletics",
          extraAttributes: [],
          ordinal: 0,
        },
      ],
    };
    const feat = {
      ...level(0),
      id: "FEAT",
      name: "Power Attack",
      type: "Feat",
    };
    const skill = {
      ...level(0),
      id: "SKILL",
      name: "Athletics",
      type: "Skill Training",
    };
    const entities = [provider, preset, feat, skill];
    const evaluation = evaluateCharacter(
      projectBuildForEvaluation(build, entities),
      entities,
    );
    const command = applyBuildPresetCommand(
      build,
      preset,
      evaluation.choices,
      evaluation,
      entities,
      (definitionId) => `selected:${definitionId}`,
    );
    const updated = applyCharacterCommand(build, command!);

    expect(
      updated.levels[0]?.root.children.map(
        (child) => child.identity.definitionId,
      ),
    ).toEqual([undefined, "FEAT", "SKILL"]);
  });

  it("groups large parenthetical families without changing exact candidates", () => {
    const candidates = [
      "GREATBOW",
      "HANDAXE",
      "RAPIER",
      "LONGBOW",
      "OTHER",
      "SMALL_A",
      "SMALL_B",
    ].map((definitionId) => candidate(definitionId));
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

  it("groups feat and power candidates by authored legacy type metadata", () => {
    const entity = (
      id: string,
      name: string,
      type: string,
      specifics: Readonly<Record<string, string>> = {},
      prerequisites?: string,
    ): ContentEntity => ({
      id,
      name,
      type,
      source: "Public test fixture",
      sources: ["Public test fixture"],
      attributes: [],
      categories: [],
      specifics: Object.entries(specifics).map(
        ([fieldName, value], ordinal) => ({
          name: fieldName,
          value,
          extraAttributes: [],
          ordinal,
        }),
      ),
      rules: [],
      description: "",
      extensions: [],
      provenance: { sourceKey: "builder-ui", sourceOrdinal: 0 },
      ...(prerequisites === undefined ? {} : { prerequisites }),
    });
    const elf = entity("RACE_ELF", "Elf", "Race");
    const ranger = entity("CLASS_RANGER", "Ranger", "Class");
    const arcana = entity("SKILL_ARCANA", "Arcana", "Skill");
    const theme = entity("THEME_DUNE_TRADER", "Dune Trader", "Theme");
    const byReference = new Map(
      [elf, ranger, arcana, theme].flatMap((definition) => [
        [definition.id.toLocaleLowerCase(), definition] as const,
        [definition.name.toLocaleLowerCase(), definition] as const,
      ]),
    );
    const resolve = (reference: string) =>
      byReference.get(reference.trim().toLocaleLowerCase());

    expect(
      candidateTableTypeGroup(
        entity("MULTI", "Warrior of the Wild", "Feat", {
          Type: "Multiclass Ranger",
        }),
        "feat",
        resolve,
      ).label,
    ).toBe("Multiclass");
    expect(
      candidateTableTypeGroup(
        entity("ELVEN", "Elven Precision", "Feat", {}, "Elf"),
        "feat",
        resolve,
      ).label,
    ).toBe("Race");
    expect(
      candidateTableTypeGroup(
        entity("SKILL_FEAT", "Arcane Skill", "Feat", {}, "Trained in Arcana"),
        "feat",
        resolve,
      ).label,
    ).toBe("Skill");
    expect(
      candidateTableTypeGroup(
        entity("CLASS_POWER", "Twin Strike", "Power", {
          Class: "CLASS_RANGER",
        }),
        "power",
        resolve,
      ).label,
    ).toBe("Class");
    expect(
      candidateTableTypeGroup(
        entity("SKILL_POWER", "Agile Recovery", "Power", {
          _SkillPower: "SKILL_ARCANA",
        }),
        "power",
        resolve,
      ).label,
    ).toBe("Skill");
    expect(
      candidateTableTypeGroup(
        entity("THEME_POWER", "Deft Avoidance", "Power", {
          Class: "THEME_DUNE_TRADER",
        }),
        "power",
        resolve,
      ),
    ).toMatchObject({ label: "Theme (Dune Trader)", order: 50 });

    const levelTwo = entity("POWER_2", "Alpha", "Power", { Level: "2" });
    const levelSixB = entity("POWER_6_B", "Bravo", "Power", { Level: "6" });
    const levelSixA = entity("POWER_6_A", "Alpha", "Power", { Level: "6" });
    expect(powerTableLevel(levelSixA)).toBe(6);
    expect(powerTableLevel(levelTwo)).toBe(2);
    expect(powerTableLevel(levelSixB)).toBe(6);
  });

  it("groups background benefits without changing exact candidates", () => {
    const names: Record<string, string> = {
      TWO: "+2 to Nature",
      CLASS: "Arcana class skill",
      LANGUAGE: "Learn Draconic",
      BENEFIT: "Wild Hunter Benefit",
    };
    const candidates = Object.keys(names).map((definitionId) =>
      candidate(definitionId),
    );
    expect(
      groupBackgroundChoiceCandidates(candidates, (id) => names[id]!).map(
        ({ label, parameterLabel, options }) => ({
          label,
          parameterLabel,
          options: options.map((option) => option.label),
        }),
      ),
    ).toEqual([
      { label: "+2 to a skill", parameterLabel: "Skill", options: ["Nature"] },
      {
        label: "Add a class skill",
        parameterLabel: "Skill",
        options: ["Arcana"],
      },
      { label: "Language", parameterLabel: "Language", options: ["Draconic"] },
      {
        label: "Background benefit",
        parameterLabel: "Benefit",
        options: ["Wild Hunter"],
      },
    ]);
  });

  it("keeps constrained and freeform skill slots in separate scopes", () => {
    const choices = [
      {
        id: "restricted",
        providerOccurrenceId: "ranger",
        candidates: [
          { definitionId: "DUNGEONEERING", eligible: true, reasons: [] },
          { definitionId: "NATURE", eligible: true, reasons: [] },
          { definitionId: "ARCANA", eligible: false, reasons: ["category"] },
        ],
      },
      ...[0, 1, 2, 3].map((index) => ({
        id: `class-${index}`,
        providerOccurrenceId: "ranger",
        candidates: [
          { definitionId: "DUNGEONEERING", eligible: true, reasons: [] },
          { definitionId: "NATURE", eligible: false, reasons: ["duplicate"] },
          { definitionId: "ATHLETICS", eligible: true, reasons: [] },
        ],
      })),
    ] as unknown as EvaluatedCharacter["choices"];
    expect(
      groupRepeatedCandidateScopes(choices).map((scope) => ({
        choiceIds: scope.choices.map((choice) => choice.id),
        candidateIds: scope.candidateIds,
      })),
    ).toEqual([
      {
        choiceIds: ["restricted"],
        candidateIds: ["DUNGEONEERING", "NATURE"],
      },
      {
        choiceIds: ["class-0", "class-1", "class-2", "class-3"],
        candidateIds: ["DUNGEONEERING", "NATURE", "ATHLETICS"],
      },
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

  it("shows future choices without applying future stats to the current character", () => {
    const rules = (
      name: string,
      attributes: Readonly<Record<string, string>>,
      ordinal: number,
    ): RuleStatement => ({
      name,
      attributes: Object.entries(attributes).map(([attribute, value]) => ({
        name: attribute,
        value,
      })),
      text: "",
      children: [],
      ordinal,
    });
    const entities = [
      level(1),
      level(2, [
        rules("select", { type: "Feat" }, 0),
        rules("statadd", { name: "Future bonus", value: "+2" }, 1),
      ]),
      {
        ...level(3),
        id: "FUTURE_FEAT",
        name: "Future feat",
        type: "Feat",
      },
    ];
    const command = planningHorizonCommand(
      build,
      2,
      entities,
      (value) => `level-${value}`,
    );
    const planned = applyCharacterCommand(build, command!);
    const current = evaluateCharacter(
      projectBuildForEvaluation(planned, entities),
      entities,
    );
    const future = evaluateCharacter(
      projectBuildForEvaluation(
        { ...planned, effectiveLevel: planned.levels.length },
        entities,
      ),
      entities,
    );

    expect(current.level).toBe(1);
    expect(choicesAtLevel(2, current)).toEqual([]);
    expect(current.stats["Future bonus"]).toBeUndefined();
    expect(choicesAtLevel(2, future)).toHaveLength(1);
    expect(future.stats["Future bonus"]?.value).toBe(2);
  });

  it("does not mutate stored levels when the visible horizon is lowered", () => {
    expect(
      planningHorizonCommand(build, 1, [level(1)], String),
    ).toBeUndefined();
  });

  it("turns evaluator reasons into objective user-facing text", () => {
    expect(candidateReason(["prerequisite", "prerequisite-unverified"])).toBe(
      "Does not meet prerequisites; Prerequisites could not be verified",
    );
  });

  it("never exposes category mismatches through the Show all filter", () => {
    const categoryMismatch = candidate("cross-category", false, ["category"]);
    expect(isCandidateVisible(categoryMismatch, false)).toBe(false);
    expect(isCandidateVisible(categoryMismatch, true)).toBe(false);
    expect(isCandidateVisible(categoryMismatch, true, "cross-category")).toBe(
      false,
    );
  });

  it("shows legal, explicitly revealed, and recoverable selected candidates", () => {
    const legal = candidate("legal");
    const unavailable = candidate("unavailable", false, ["prerequisite"]);
    expect(isCandidateVisible(legal, false)).toBe(true);
    expect(isCandidateVisible(unavailable, false)).toBe(false);
    expect(isCandidateVisible(unavailable, true)).toBe(true);
    expect(isCandidateVisible(unavailable, false, "unavailable")).toBe(true);
  });

  it("reveals source-unentitled options for explanation but does not make them selectable", () => {
    const candidate = {
      definitionId: "unowned",
      eligible: false,
      sourceEntitled: false,
      rulesLegal: true,
      activeDefinition: false,
      activeOccurrenceIds: [],
      providerOccurrenceIds: [],
      reasons: ["source-unentitled"],
    };
    expect(isCandidateVisible(candidate, false)).toBe(false);
    expect(isCandidateVisible(candidate, true)).toBe(true);
    expect(isCandidateSelectable(candidate)).toBe(false);
    expect(candidateReason(candidate.reasons)).toBe(
      "Not included in this character's allowed sources",
    );
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

  it("separates non-level character details from mechanical choices", () => {
    expect(
      ["Gender", "Alignment", "Deity"].map((type) =>
        isCharacterDetailChoice({
          type,
        } as EvaluatedCharacter["choices"][number]),
      ),
    ).toEqual([true, true, true]);
    expect(
      isCharacterDetailChoice({
        type: "Race",
      } as EvaluatedCharacter["choices"][number]),
    ).toBe(false);
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
      {
        id: "companion-1",
        level: 8,
        providerOccurrenceId: "companion",
        ruleOrdinal: 1,
        type: "Companion Ability Increase (Level 8)",
      },
      {
        id: "companion-2",
        level: 8,
        providerOccurrenceId: "companion",
        ruleOrdinal: 1,
        type: "Companion Ability Increase (Level 8)",
      },
    ] as unknown as EvaluatedCharacter["choices"];

    expect(
      groupRepeatedChoiceSlots(choices).map((group) =>
        group.map(({ id }) => id),
      ),
    ).toEqual([
      ["ability-1", "ability-2"],
      ["companion-1", "companion-2"],
    ]);
  });

  it("groups overview choices by category and then level", () => {
    const choices = [
      { id: "power-7", level: 7, type: "Power Encounter 7" },
      { id: "class", level: 1, type: "Class" },
      { id: "power-1", level: 1, type: "Power At-Will 1" },
      { id: "skill", level: 1, type: "Skill Training" },
      { id: "feat-4", level: 4, type: "Feat" },
      {
        id: "companion",
        level: 8,
        type: "Companion Ability Increase (Level 8)",
      },
      {
        id: "retraining",
        level: 6,
        type: "Replacement",
        optional: true,
      },
    ] as unknown as EvaluatedCharacter["choices"];

    expect(
      groupOverviewChoices(choices).map(({ pane, choices }) => [
        pane,
        choices.map(({ id }) => id),
      ]),
    ).toEqual([
      ["Character", ["class"]],
      ["Ability Scores", ["companion"]],
      ["Skills", ["skill"]],
      ["Powers", ["power-1", "power-7"]],
      ["Feats", ["feat-4"]],
      ["Retraining", ["retraining"]],
    ]);
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
      choiceForRepeatedCandidate(choices, new Set(["chosen"]), "ARCANA", true)
        ?.id,
    ).toBe("available");
  });

  it("reuses a filled single-choice skill slot for the last candidate clicked", () => {
    const choices = [
      {
        id: "restricted",
        selectedOccurrenceId: "nature",
        candidates: [
          { definitionId: "DUNGEONEERING", eligible: true, reasons: [] },
          { definitionId: "NATURE", eligible: true, reasons: [] },
        ],
      },
    ] as unknown as EvaluatedCharacter["choices"];

    expect(
      choiceForRepeatedCandidate(
        choices,
        new Set(["restricted"]),
        "DUNGEONEERING",
        false,
        true,
      )?.id,
    ).toBe("restricted");
    expect(
      choiceForRepeatedCandidate(
        choices,
        new Set(["restricted"]),
        "DUNGEONEERING",
        false,
      ),
    ).toBeUndefined();
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

  it("clears completed optional backgrounds and retraining in their exact slots", () => {
    const levelOne = level(1, [
      {
        name: "select",
        attributes: [
          { name: "type", value: "Background" },
          { name: "number", value: "2" },
        ],
        text: "",
        children: [],
        ordinal: 0,
      },
    ]);
    const levelTwo = level(2, [
      {
        name: "replace",
        attributes: [
          { name: "retrain", value: "true" },
          { name: "optional", value: "true" },
        ],
        text: "",
        children: [],
        ordinal: 0,
      },
    ]);
    const optionalBuild: CharacterBuild = {
      ...build,
      effectiveLevel: 2,
      levels: [
        {
          level: 1,
          root: {
            ...build.levels[0]!.root,
            children: [
              {
                id: "primary-background",
                identity: {
                  definitionId: "BACKGROUND_A",
                  name: "First background",
                  type: "Background",
                },
                acquiredLevel: 1,
                legality: "rules-legal",
                children: [],
                unresolved: false,
              },
              {
                id: "extra-background",
                identity: {
                  definitionId: "BACKGROUND_B",
                  name: "Second background",
                  type: "Background",
                },
                acquiredLevel: 1,
                legality: "rules-legal",
                children: [],
                unresolved: false,
              },
            ],
          },
        },
        {
          level: 2,
          root: {
            id: "level-2",
            identity: {
              definitionId: levelTwo.id,
              name: levelTwo.name,
              type: levelTwo.type,
            },
            acquiredLevel: 2,
            legality: "rules-legal",
            children: [
              {
                id: "retrained-feat",
                identity: {
                  definitionId: "FEAT_B",
                  name: "New feat",
                  type: "Feat",
                },
                acquiredLevel: 2,
                legality: "rules-legal",
                children: [],
                unresolved: false,
                replacesId: "old-feat",
              },
            ],
            unresolved: false,
          },
        },
      ],
    };
    const evaluation = {
      occurrences: [
        { id: "level-1", definitionId: levelOne.id },
        { id: "level-2", definitionId: levelTwo.id },
      ],
    } as unknown as EvaluatedCharacter;
    const backgroundChoice = {
      providerOccurrenceId: "level-1",
      ruleOrdinal: 0,
      index: 1,
      selectedOccurrenceId: "extra-background",
    } as unknown as EvaluatedCharacter["choices"][number];
    const retrainingChoice = {
      providerOccurrenceId: "level-2",
      ruleOrdinal: 0,
      index: 0,
      selectedOccurrenceId: "retrained-feat",
    } as unknown as EvaluatedCharacter["choices"][number];

    const withoutBackground = applyCharacterCommand(
      optionalBuild,
      unresolveEvaluatedChoiceCommand(
        optionalBuild,
        backgroundChoice,
        evaluation,
        [levelOne, levelTwo],
        "empty-background",
      )!,
    );
    expect(withoutBackground.levels[0]?.root.children).toMatchObject([
      { id: "primary-background", unresolved: false },
      { id: "empty-background", unresolved: true },
    ]);

    const withoutRetraining = applyCharacterCommand(
      optionalBuild,
      unresolveEvaluatedChoiceCommand(
        optionalBuild,
        retrainingChoice,
        evaluation,
        [levelOne, levelTwo],
        "empty-retraining",
      )!,
    );
    expect(withoutRetraining.levels[1]?.root.children).toMatchObject([
      {
        id: "empty-retraining",
        unresolved: true,
        identity: { name: "", type: "" },
      },
    ]);
  });
});
