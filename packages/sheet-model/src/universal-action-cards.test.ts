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
    const self = withUniversalActionCards(
      [],
      {
        textContributions: [
          contribution(
            "Action Point",
            "Demonskin Tattoo (heroic tier):When you spend an action point, gain resist 5",
            "a",
          ),
          contribution("Other", "Ignored.", "b"),
        ],
      } as unknown as EvaluatedCharacter,
      "Human",
    ).find((card) => card.name === "Action Point");
    expect(self).toMatchObject({
      usage: "Encounter (Special)",
      universal: true,
    });
    expect(self?.additionalEffects).toEqual([
      expect.objectContaining({
        provider: "Demonskin Tattoo (heroic tier)",
        text: "When you spend an action point, gain resist 5.",
      }),
    ]);

    const grouped = withUniversalActionCards(
      [],
      {
        textContributions: [
          contribution(
            "Action Point",
            "Action Surge:+3 attack.;Plain note",
            "a",
          ),
          contribution("ALLY.Action Point", "Inspiring Leader:Heal 5.", "b"),
        ],
      } as unknown as EvaluatedCharacter,
      undefined,
    ).find((card) => card.name === "Action Point");
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
    const secondWinds = (race: string) =>
      withUniversalActionCards([contentSecondWind], evaluation, race).filter(
        (card) => card.name === "Second Wind",
      );
    const [dwarf] = secondWinds("Dwarf");
    expect(secondWinds("Dwarf")).toHaveLength(1);
    expect(dwarf).toMatchObject({
      actionType: "Minor Action",
      usage: "Encounter",
    });
    expect(dwarf?.fields).toContainEqual({
      label: "Effect",
      value:
        "You spend a healing surge and regain 17 hit points. You gain a +2 bonus to all defenses until the start of your next turn.",
    });
    expect(dwarf?.fields).toContainEqual({
      label: "Power Type",
      value: "Utility",
    });
    expect(dwarf?.additionalEffects).toEqual([
      expect.objectContaining({
        text: "Second wind is a minor action for dwarves.",
      }),
    ]);
    const [human] = secondWinds("Human");
    expect(human).toMatchObject({ actionType: "Standard Action" });
    expect(human?.additionalEffects).toBeUndefined();
  });
});
