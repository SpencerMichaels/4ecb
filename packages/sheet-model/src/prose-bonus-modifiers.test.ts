import { describe, expect, it } from "vitest";
import {
  PROSE_BONUSES_FIELD,
  PROSE_BONUSES_VERSION,
  type ContentEntity,
  type ProseBonus,
} from "@4ecb/content-domain";
import type { CharacterOccurrence, EvaluatedStat } from "@4ecb/rules-engine";

import { buildSheetModel } from "./index";
import { withSheetOverview, type OverviewInventory } from "./overview";

function entity(
  id: string,
  name: string,
  type: string,
  description: string,
  bonuses: readonly ProseBonus[],
): ContentEntity {
  return {
    id,
    name,
    type,
    source: "Synthetic source",
    sources: [],
    attributes: [],
    categories: [],
    rules: [],
    extensions: [],
    provenance: { sourceKey: "synthetic", sourceOrdinal: 0 },
    description,
    specifics: [
      {
        name: "Short Description",
        value: description,
        extraAttributes: [],
        ordinal: 0,
      },
      {
        name: PROSE_BONUSES_FIELD,
        value: JSON.stringify({ version: PROSE_BONUSES_VERSION, bonuses }),
        extraAttributes: [],
        ordinal: 1,
      },
    ],
  };
}

const memories = entity(
  "feat:memories",
  "Foreign Memories",
  "Feat",
  "You gain a +5 feat bonus to Arcana and History checks as they relate to aberrant creatures or their works.",
  [
    {
      text: "+5 feat bonus to Arcana and History checks as they relate to aberrant creatures or their works",
      amount: 5,
      bonusType: "feat",
      targets: [
        { kind: "skill", name: "Arcana" },
        { kind: "skill", name: "History" },
      ],
    },
  ],
);
const darkness = entity(
  "class:darkness",
  "Enemy of the Darkness",
  "Class Feature",
  "You gain a +2 bonus to saving throws against poison.",
  [
    {
      text: "+2 bonus to saving throws against poison",
      amount: 2,
      targets: [{ kind: "saving-throws" }],
    },
  ],
);
// The evaluation already carries this one (a granted child's statadd).
const carried = entity(
  "feat:carried",
  "Keen Tracker",
  "Feat",
  "You gain a +2 bonus to Perception checks to track creatures.",
  [
    {
      text: "+2 bonus to Perception checks to track creatures",
      amount: 2,
      targets: [{ kind: "skill", name: "Perception" }],
    },
  ],
);
const block = entity(
  "item:block",
  "Mental Block (heroic tier)",
  "Magic Item",
  "",
  [
    {
      text: "+2 item bonus to saving throws against fear or charm effects",
      amount: 2,
      bonusType: "item",
      targets: [{ kind: "saving-throws" }],
    },
  ],
);
const entities = [memories, darkness, carried, block];

const stats: Record<string, EvaluatedStat> = {
  "Perception Misc": {
    name: "Perception Misc",
    value: 0,
    contributions: [
      {
        id: "occ:3:0",
        stat: "Perception Misc",
        value: "+2",
        providerId: "occ:3",
        providerName: "Keen Tracker",
        condition: "to track creatures",
        numericValue: 2,
        applied: false,
        reason: "conditional",
      },
    ],
  },
};
const occurrences: CharacterOccurrence[] = [memories, darkness, carried].map(
  (definition, index) => ({
    id: `occ:${index + 1}`,
    definitionId: definition.id,
    acquiredLevel: 1,
    kind: "choice",
  }),
);

function overview(equipped = 1) {
  const selectedRules = [memories, darkness, carried].map(
    ({ id, name, type }) => ({ id, name, type }),
  );
  const base = buildSheetModel(
    {
      details: { name: "Prose hero", Level: "5" },
      abilities: {},
      stats: {},
      selectedRules,
      levelCount: 5,
      source: "legacy-cache",
      textStrings: {},
      loot: [],
      powers: [],
    },
    entities,
  );
  const inventory: OverviewInventory[] = [
    {
      id: "loot:1",
      name: "Mental Block (heroic tier)",
      quantity: 1,
      equipped,
      slots: equipped ? ["neck"] : [],
      definitionIds: [block.id],
      fields: [
        {
          label: "Property",
          value:
            "You gain a +2 item bonus to saving throws against fear or charm effects.",
        },
      ],
    },
  ];
  return withSheetOverview(base, {
    level: 5,
    stats: {},
    evaluatedStats: stats,
    occurrences,
    selections: selectedRules,
    content: entities,
    inventory,
  }).overview!;
}

describe("prose-only bonuses on page 1", () => {
  it("lists a feature's prose bonus in the pane its stat belongs to", () => {
    const modifiers = overview().conditionalModifiers;
    expect(modifiers).toContainEqual(
      expect.objectContaining({
        surface: "skills",
        target: "Arcana, History",
        text: "+5 feat bonus to Arcana and History checks as they relate to aberrant creatures or their works",
        source: "Foreign Memories",
      }),
    );
  });

  it("lists prose save bonuses with the saving throws", () => {
    const traits = overview().defensiveTraits;
    expect(traits).toContainEqual(
      expect.objectContaining({
        label: "Saving throws",
        group: "Saving throws",
        value: "+2 bonus to saving throws against poison",
        source: "Enemy of the Darkness",
        conditional: true,
      }),
    );
    expect(traits).toContainEqual(
      expect.objectContaining({
        value: "+2 item bonus to saving throws against fear or charm effects",
        source: "Mental Block (heroic tier)",
      }),
    );
  });

  it("drops a bonus the evaluation already carries from the same source", () => {
    const texts = overview().conditionalModifiers.map(({ text }) => text);
    expect(texts).not.toContain(
      "+2 bonus to Perception checks to track creatures",
    );
  });

  it("drops the reminder the new row covers, and reads only equipped items", () => {
    const shown = overview();
    expect(
      (shown.reminderCandidates ?? []).map(({ label }) => label),
    ).not.toContain("Mental Block (heroic tier)");
    expect(
      overview(0).defensiveTraits.map(({ source }) => source),
    ).not.toContain("Mental Block (heroic tier)");
  });
});
