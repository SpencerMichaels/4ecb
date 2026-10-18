import { describe, expect, it } from "vitest";
import type { EvaluatedCharacter } from "@4ecb/rules-engine";

import type { SheetCard } from "./index";
import { withUniversalActionCards } from "./universal-action-cards";

const contribution = (name: string, value: string, providerId: string) => ({
  name,
  value,
  providerId,
  providerName: "ignored",
  definitionId: "X",
});

describe("universal action cards", () => {
  it("lists action point notes like the legacy card", () => {
    const self = withUniversalActionCards([], {
      textContributions: [
        contribution(
          "Action Point",
          "Demonskin Tattoo (heroic tier):When you spend an action point, gain resist 5",
          "a",
        ),
        contribution("Other", "Ignored.", "b"),
      ],
    } as unknown as EvaluatedCharacter).find(
      (card) => card.name === "Action Point",
    );
    expect(self).toMatchObject({
      usage: "Encounter (Special)",
      actionType: "Free Action",
      universal: true,
    });
    expect(self?.additionalEffects).toEqual([
      expect.objectContaining({
        provider: "Demonskin Tattoo (heroic tier)",
        text: "When you spend an action point, gain resist 5.",
      }),
    ]);

    const grouped = withUniversalActionCards([], {
      textContributions: [
        contribution("Action Point", "Action Surge:+3 attack.;Plain note", "a"),
        contribution("ALLY.Action Point", "Inspiring Leader:Heal 5.", "b"),
      ],
    } as unknown as EvaluatedCharacter).find(
      (card) => card.name === "Action Point",
    );
    expect(
      grouped?.additionalEffects?.map((effect) => [
        effect.provider,
        effect.text,
      ]),
    ).toEqual([
      ["Self · Action Surge", "+3 attack."],
      ["Self", "Plain note."],
      ["Ally · Inspiring Leader", "Heal 5."],
    ]);
  });

  it("builds one Second Wind card with the legacy healing amount", () => {
    const contentSecondWind = {
      kind: "power",
      name: "Second Wind",
      universal: true,
      actionType: "Standard Action",
      fields: [],
    } as SheetCard;
    const evaluation = {
      stats: {
        "Hit Points": { name: "Hit Points", value: 67, contributions: [] },
        "Healing Surge Value": {
          name: "Healing Surge Value",
          value: 1,
          contributions: [],
        },
      },
    } as unknown as EvaluatedCharacter;
    const secondWinds = withUniversalActionCards(
      [contentSecondWind],
      evaluation,
    ).filter((card) => card.name === "Second Wind");
    const [secondWind] = secondWinds;
    expect(secondWinds).toHaveLength(1);
    expect(secondWind).toMatchObject({
      actionType: "Standard Action",
      usage: "Encounter",
      sharedUsage: "Second Wind",
    });
    expect(secondWind?.fields).toContainEqual({
      label: "Effect",
      value:
        "You spend a healing surge and regain 17 hit points. You gain a +2 bonus to all defenses until the start of your next turn.",
    });
    expect(secondWind?.fields).toContainEqual({
      label: "Power Type",
      value: "Utility",
    });
    expect(secondWind?.additionalEffects).toBeUndefined();
  });

  it("shares one use among encounter powers that spend your own second wind", () => {
    const power = (name: string, usage: string, effect: string) =>
      ({
        kind: "power",
        name,
        usage,
        fields: [{ label: "Effect", value: effect }],
      }) as SheetCard;
    const cards = withUniversalActionCards(
      [
        {
          ...power(
            "Dwarven Resilience",
            "Encounter",
            "You use your second wind.",
          ),
          actionType: "Minor Action",
        },
        power(
          "Invigorating Stride",
          "Encounter",
          "You shift. You can use your second wind.",
        ),
        power(
          "Soothing Wind",
          "Daily",
          "You use your second wind and regain 2d6.",
        ),
        power(
          "Encouraging Boost",
          "Encounter",
          "The target can use its second wind.",
        ),
      ],
      {} as EvaluatedCharacter,
    );
    expect(
      Object.fromEntries(cards.map((card) => [card.name, card.sharedUsage])),
    ).toEqual({
      "Dwarven Resilience": "Second Wind",
      "Invigorating Stride": "Second Wind",
      "Soothing Wind": undefined,
      "Encouraging Boost": undefined,
      "Second Wind": "Second Wind",
      "Action Point": undefined,
    });
    expect(cards.find((card) => card.name === "Second Wind")?.actionType).toBe(
      "Standard Action",
    );
  });

  it("applies Second Wind overlays: last Action Type wins, other fields become notes", () => {
    const cards = withUniversalActionCards([], {
      overlays: [
        {
          providerOccurrenceId: "trait-1",
          targetDefinitionIds: [],
          targetName: "Second Wind",
          field: "Action Type",
          value: "Minor Action",
        },
        {
          providerOccurrenceId: "feat-1",
          targetDefinitionIds: [],
          targetName: "Second Wind",
          field: "Action Type",
          value: "Free Action",
        },
        {
          providerOccurrenceId: "feat-1",
          targetDefinitionIds: [],
          targetName: "Second Wind",
          field: "Stoneheart Warrior",
          value: "You can use your second wind as a free action.",
        },
        {
          providerOccurrenceId: "feat-2",
          targetDefinitionIds: ["OTHER_POWER"],
          targetName: "Other Power",
          field: "Elsewhere",
          value: "Not for second wind.",
        },
      ],
    } as unknown as EvaluatedCharacter);
    const secondWind = cards.find((card) => card.name === "Second Wind");
    expect(secondWind?.actionType).toBe("Free Action");
    expect(secondWind?.additionalEffects).toEqual([
      expect.objectContaining({
        provider: "Stoneheart Warrior",
        text: "You can use your second wind as a free action.",
        cardOnly: true,
      }),
    ]);
  });
});
