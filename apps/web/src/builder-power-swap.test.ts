import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { CharacterBuild } from "@4ecb/character-domain";
import type { ContentEntity } from "@4ecb/content-domain";
import type { EvaluatedCharacter, EvaluatedChoice } from "@4ecb/rules-engine";

import { builderIssueGroups } from "./builder-diagnostics";
import { ChoiceEditor } from "./ChoiceEditors";
import {
  contextualChoiceTitle,
  powerSwapPresentation,
  replacementPickSummary,
} from "./builder-ui";

function entity(
  id: string,
  name: string,
  type: string,
  rules: ContentEntity["rules"] = [],
): ContentEntity {
  return {
    id,
    name,
    type,
    source: "Public test fixture",
    sources: ["Public test fixture"],
    attributes: [],
    categories: [],
    specifics: [],
    rules,
    description: "",
    extensions: [],
    provenance: { sourceKey: "power-swap", sourceOrdinal: 0 },
  };
}

const replace = (
  ordinal: number,
  attributes: Readonly<Record<string, string>>,
  text = "",
) => ({
  name: "replace",
  attributes: Object.entries(attributes).map(([name, value]) => ({
    name,
    value,
  })),
  text,
  children: [],
  ordinal,
});

const level15 = entity("LEVEL_15", "15", "Level", [
  replace(0, {
    name: "Power Daily 15",
    requires: "!No Level 15 Daily Power",
    powerswap: "$$CLASS,daily,15",
  }),
  replace(1, { retrain: "true", optional: "true" }),
]);
const augment = entity("AUGMENT", "Psionic Augmentation (Hybrid)", "Internal", [
  replace(0, {
    name: "Hybrid At-Will/Encounter 27",
    powerswap: "$$CLASS,encounter|Augmentable At-Will,27",
  }),
]);
const multiclass = entity("PMC", "Paragon Multiclassing", "Internal", [
  replace(
    0,
    { powerswap: "$$CLASS_OR_MULTICLASS,at-will,7" },
    "Paragon Multiclassing",
  ),
]);
const powers = ["PRESS", "Press of Steel"] as const;
const byId = new Map(
  [
    level15,
    augment,
    multiclass,
    entity(powers[0], powers[1], "Power"),
    entity("HURRICANE", "Hurricane Strike", "Power"),
    entity("TOPPLING", "Toppling Finish", "Power"),
  ].map((definition) => [definition.id.toLocaleLowerCase(), definition]),
);

function swapChoice(
  provider: string,
  level: number,
  extra: Partial<EvaluatedChoice> = {},
): EvaluatedChoice {
  return {
    id: `${provider}:replacement:0`,
    level,
    providerOccurrenceId: provider,
    ruleOrdinal: 0,
    index: 0,
    type: "Replacement",
    optional: false,
    candidates: [],
    ...extra,
  } as EvaluatedChoice;
}

const evaluation = {
  occurrences: [
    { id: "level-15", definitionId: "LEVEL_15", acquiredLevel: 15 },
    { id: "augment", definitionId: "AUGMENT", acquiredLevel: 27 },
    { id: "pmc", definitionId: "PMC", acquiredLevel: 11 },
    // The level-25 holder of the slot the level-15 swap filled.
    {
      id: "hurricane-25",
      definitionId: "HURRICANE",
      replacesId: "toppling-19",
      acquiredLevel: 25,
    },
  ],
  choices: [],
} as unknown as EvaluatedCharacter;

describe("level-progression power swaps", () => {
  it("names the swap and its level cap from the swap's own rule", () => {
    const swap = swapChoice("level-15", 15);
    expect(powerSwapPresentation(swap, evaluation, byId)).toEqual({
      kind: "daily attack",
      title: "Swap a daily attack power",
      explanation:
        "At 15th level, replace one of your daily attack powers with a new one of level 15 or lower.",
    });
    expect(contextualChoiceTitle(swap, evaluation, byId)).toBe(
      "Swap a daily attack power",
    );
    expect(
      powerSwapPresentation(swapChoice("augment", 27), evaluation, byId),
    ).toMatchObject({
      title: "Swap an encounter attack or augmentable at-will power",
      explanation:
        "At 27th level, replace one of your encounter attack or augmentable at-will powers with a new one of level 27 or lower.",
    });
  });

  it("leaves retraining and labelled replaces alone", () => {
    const retrain = swapChoice("level-15", 15, {
      ruleOrdinal: 1,
      optional: true,
    });
    expect(powerSwapPresentation(retrain, evaluation, byId)).toBeUndefined();
    expect(contextualChoiceTitle(retrain, evaluation, byId)).toBe(
      "Replacement",
    );
    const labelled = swapChoice("pmc", 11, { name: "Paragon Multiclassing" });
    expect(powerSwapPresentation(labelled, evaluation, byId)).toBeUndefined();
    expect(contextualChoiceTitle(labelled, evaluation, byId)).toBe(
      "Paragon Multiclassing",
    );
  });

  it("folds to the slot's own trade, not a later holder's", () => {
    const swap = swapChoice("level-15", 15, {
      selectedOccurrenceId: "hurricane-25",
    });
    const occurrence = (
      id: string,
      definitionId: string,
      acquiredLevel: number,
      children: CharacterBuild["levels"][number]["root"]["children"] = [],
      replacesId?: string,
    ) => ({
      id,
      identity: { definitionId, name: "", type: "" },
      acquiredLevel,
      legality: "rules-legal" as const,
      children,
      unresolved: false,
      ...(replacesId === undefined ? {} : { replacesId }),
    });
    const build = {
      levels: [
        {
          level: 9,
          root: occurrence("level-9", "LEVEL_9", 9, [
            occurrence("press", "PRESS", 9),
          ]),
        },
        {
          level: 15,
          root: occurrence("level-15", "LEVEL_15", 15, [
            occurrence("hurricane-15", "HURRICANE", 15, [], "press"),
          ]),
        },
      ],
      grabbag: [],
    } as unknown as CharacterBuild;
    // Without the build, the evaluation's holder is all there is.
    expect(replacementPickSummary(swap, evaluation, byId)).toBe(
      "Hurricane Strike",
    );
    expect(replacementPickSummary(swap, evaluation, byId, build)).toBe(
      "Press of Steel → Hurricane Strike",
    );
    expect(
      replacementPickSummary(
        swapChoice("level-15", 15),
        evaluation,
        byId,
        build,
      ),
    ).toBeUndefined();
  });

  it("names an unfilled swap by its kind in the diagnostics", () => {
    const issues = builderIssueGroups({
      evaluation: {
        ...evaluation,
        choices: [swapChoice("level-15", 15)],
        diagnostics: [],
      },
      byId,
      effectiveLevel: 15,
      planningHorizon: 15,
      abilityScoresIncomplete: false,
      abilityScoresHouseRuled: false,
    } as unknown as Parameters<typeof builderIssueGroups>[0]);
    expect(issues.unresolved.map(({ title }) => title)).toEqual([
      "Level 15 daily attack power swap",
    ]);
  });
});

describe("the swap editor", () => {
  it("explains the swap and labels both steps", () => {
    const swap = swapChoice("level-15", 15, {
      replacementOptions: [
        {
          replacesOccurrenceId: "press",
          definitionId: "PRESS",
          candidates: [],
        },
      ],
    });
    const build = {
      levels: [
        {
          level: 15,
          root: {
            id: "level-15",
            identity: { definitionId: "LEVEL_15" },
            acquiredLevel: 15,
            legality: "rules-legal",
            children: [],
            unresolved: false,
          },
        },
      ],
      grabbag: [],
    } as unknown as CharacterBuild;
    const html = renderToStaticMarkup(
      createElement(ChoiceEditor, {
        choice: swap,
        evaluation: { ...evaluation, choices: [swap] },
        build,
        entities: [...byId.values()],
        byId,
        disabled: false,
        rollbackRevision: 0,
        onDispatch: () => undefined,
      }),
    );
    expect(html).toContain(
      "At 15th level, replace one of your daily attack powers with a new one of level 15 or lower.",
    );
    expect(html).toContain("Power to replace");
    expect(html).toContain("New power");
    expect(html).toContain("Choose the power to replace first.");
    expect(html).not.toContain(">Replace<");
  });
});
