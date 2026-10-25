import { describe, expect, it } from "vitest";
import type { ContentEntity } from "@4ecb/content-domain";
import type {
  CharacterOccurrence,
  EvaluatedContribution,
  EvaluatedStat,
  EvaluatedCharacter,
} from "@4ecb/rules-engine";

import { buildSheetModel, type SheetCard } from "./index";
import { withSheetOverview } from "./overview";
import { withUniversalActionCards } from "./universal-action-cards";

function entity(
  id: string,
  name: string,
  type: string,
  summary: string,
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
    description: summary,
    specifics: [
      {
        name: "Short Description",
        value: summary,
        extraAttributes: [],
        ordinal: 0,
      },
    ],
  };
}

const swift = entity(
  "racial:swift",
  "Swift Stride",
  "Racial Trait",
  "+2 to speed when charging",
);
const style = entity(
  "class:style",
  "Hunter Style",
  "Class Feature",
  "You gain Quick Hands as a bonus feat. In addition, you can sheathe a weapon as a free action and gain a +4 bonus to AC against opportunity attacks you provoke when you make a ranged attack.",
);
const aim = entity(
  "feat:aim",
  "Sure Aim",
  "Feat",
  "If no allies are closer to the target than you, get +1 on ranged attacks against it.",
);
const guard = entity(
  "feat:guard",
  "Steady Guard",
  "Feat",
  "+2 to saving throws when you are bloodied",
);
const entities = [swift, style, aim, guard];

function contribution(
  stat: string,
  id: string,
  providerId: string,
  providerName: string,
  value: string,
  condition: string,
): EvaluatedContribution {
  return {
    id,
    stat,
    value,
    providerId,
    providerName,
    condition,
    numericValue: Number(value),
    applied: false,
    reason: "conditional",
  };
}

const stats: Record<string, EvaluatedStat> = {
  Speed: {
    name: "Speed",
    value: 6,
    contributions: [
      contribution(
        "Speed",
        "occ:1:0",
        "occ:1",
        "Swift Stride",
        "+2",
        "when charging",
      ),
    ],
  },
  AC: {
    name: "AC",
    value: 18,
    contributions: [
      contribution(
        "AC",
        "occ:2:0",
        "occ:2",
        "Hunter Style",
        "+4",
        "against opportunity attacks you provoke when you make a ranged attack",
      ),
    ],
  },
  "ranged:attack": {
    name: "ranged:attack",
    value: 0,
    contributions: [
      contribution(
        "ranged:attack",
        "occ:3:0",
        "occ:3",
        "Sure Aim",
        "+1",
        "if none of your allies are closer to the target",
      ),
    ],
  },
  "Saving Throws": {
    name: "Saving Throws",
    value: 0,
    contributions: [
      contribution(
        "Saving Throws",
        "occ:4:0",
        "occ:4",
        "Steady Guard",
        "+2",
        "while you are bloodied",
      ),
      contribution(
        "Saving Throws",
        "loot:1:definition:1:0",
        "loot:1:definition:1",
        "Ward of Recovery",
        "+1",
        "against ongoing damage",
      ),
    ],
  },
};
const occurrences: CharacterOccurrence[] = [swift, style, aim, guard].map(
  (definition, index) => ({
    id: `occ:${index + 1}`,
    definitionId: definition.id,
    acquiredLevel: 1,
    kind: "choice",
  }),
);

function overview(extraPowers: readonly SheetCard[] = []) {
  const selectedRules = entities.map(({ id, name, type }) => ({
    id,
    name,
    type,
  }));
  const base = buildSheetModel(
    {
      details: { name: "Dedup hero", Level: "5" },
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
  return withSheetOverview(
    {
      ...base,
      powers: [
        ...extraPowers,
        {
          kind: "power",
          name: "Ranged basic attack",
          fields: [],
          additionalEffects: [
            {
              source: "authoritative-evaluation",
              provider: "Sure Aim",
              provenanceId: "occ:3:0",
              text: "+1 to attack rolls if none of your allies are closer to the target - Sure Aim.",
            },
          ],
        },
      ],
    },
    {
      level: 5,
      stats: Object.fromEntries(
        Object.entries(stats).map(([name, stat]) => [name, String(stat.value)]),
      ),
      evaluatedStats: stats,
      occurrences,
      selections: selectedRules,
      content: entities,
      inventory: [
        {
          id: "loot:1",
          name: "Leather Ward of Recovery +1",
          quantity: 1,
          equipped: 1,
          slots: ["body"],
          fields: [
            {
              label: "Property",
              value:
                "You gain a +1 item bonus to saving throws against ongoing damage.",
            },
          ],
        },
      ],
    },
  ).overview!;
}

describe("Remember in play deduplication", () => {
  it("keeps self, ally and companion Action Point benefits beside their card", () => {
    const cards = withUniversalActionCards([], {
      textContributions: [
        {
          name: "Action Point",
          value:
            "Ward Tattoo:When you spend an action point, gain resist 5 fire",
          providerId: "loot:tattoo:definition:0",
          providerName: "Ward Tattoo",
          definitionId: "tattoo",
        },
        {
          name: "ALLY.Action Point",
          value:
            "Helpful Leader:When an ally spends an action point, that ally gains +2 to attack",
          providerId: "leader",
          providerName: "Helpful Leader",
          definitionId: "leader",
        },
        {
          name: "BEAST.Action Point",
          value:
            "Beast Bond:When your companion spends an action point, it gains +2 to damage",
          providerId: "bond",
          providerName: "Beast Bond",
          definitionId: "bond",
        },
      ],
    } as unknown as EvaluatedCharacter);
    const result = overview(cards);
    for (const effect of cards.find((card) => card.name === "Action Point")!
      .additionalEffects!) {
      expect(result.reminders).toContainEqual(
        expect.objectContaining({ value: effect.text }),
      );
    }
    // Ordinary card and conditional-stat duplication is still suppressed.
    expect(result.reminders.map(({ label }) => label)).not.toContain(
      "Sure Aim",
    );
    expect(result.reminders.map(({ label }) => label)).not.toContain(
      "Steady Guard",
    );
  });
  it("drops reminders a more specific place shows in full, by provenance", () => {
    const labels = overview().reminders.map(({ label }) => label);
    // Conditional modifiers pane (speed), power card (attack), saves rows
    // (a feat and an item whose name differs from its contribution's).
    expect(labels).not.toContain("Swift Stride");
    expect(labels).not.toContain("Sure Aim");
    expect(labels).not.toContain("Steady Guard");
    expect(labels).not.toContain("Leather Ward of Recovery +1");
  });
  it("keeps a reminder whose source has benefits shown nowhere else", () => {
    const result = overview();
    expect(result.reminders.map(({ label }) => label)).toEqual([
      "Hunter Style",
    ]);
    // Its bonus still shows in the pane.
    expect(
      result.conditionalModifiers.map(({ source, text }) => [source, text]),
    ).toEqual([
      ["Swift Stride", "+2 to speed when charging"],
      [
        "Hunter Style",
        "+4 to AC against opportunity attacks you provoke when you make a ranged attack",
      ],
    ]);
    expect(result.summaryReminders ?? result.reminders).toEqual(
      result.reminders,
    );
  });
});
