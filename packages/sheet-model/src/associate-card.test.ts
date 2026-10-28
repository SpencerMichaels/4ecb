import { describe, expect, it } from "vitest";
import {
  ASSOCIATE_STAT_BLOCK_VERSION,
  type ContentEntity,
} from "@4ecb/content-domain";
import {
  associateStatistics,
  type CharacterOccurrence,
  type EvaluatedAssociate,
  type EvaluatedStat,
} from "@4ecb/rules-engine";

import { associateCardText, sheetAssociateCard } from "./associate-card";
import { sheetCardDeck } from "./card-deck";
import { buildSheetModel } from "./index";
import { withSheetOverview } from "./overview";

function entity(
  id: string,
  name: string,
  type: string,
  summary = "",
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
    specifics: summary
      ? [
          {
            name: "Short Description",
            value: summary,
            extraAttributes: [],
            ordinal: 0,
          },
        ]
      : [],
  };
}

const stat = (name: string, value: number): EvaluatedStat => ({
  name,
  value,
  contributions: [],
});

const hound = entity("ASSOCIATE_HOUND", "Trained Moss Hound", "Associate");
const block: EvaluatedAssociate["block"] = {
  version: ASSOCIATE_STAT_BLOCK_VERSION,
  role: "Fey Beast Companion",
  size: "Medium",
  creatureType: "fey beast",
  hitPoints: { kind: "master-bloodied" },
  defenses: {
    kind: "level",
    base: { ac: 15, fortitude: 13, reflex: 13, will: 13 },
  },
  initiative: { bonus: 0 },
  perception: { bonus: 2 },
  speed: "7",
  senses: "low-light vision",
  traits: [
    {
      name: "Mossy Pack",
      aura: 1,
      lines: [
        { text: "Allies in the aura gain a +1 bonus to Stealth checks." },
      ],
    },
  ],
  powers: [
    {
      name: "Bite",
      action: "Standard",
      usage: "At-Will",
      lines: [
        {
          label: "Attack",
          text: "",
          attack: {
            range: "Melee 1 (one creature)",
            bonus: { kind: "level", plus: 5 },
            defense: "AC",
          },
        },
      ],
    },
  ],
};
const associate: EvaluatedAssociate = {
  definitionId: hound.id,
  name: hound.name,
  block,
  statistics: associateStatistics({
    block,
    stats: {
      "Hit Points": stat("Hit Points", 82),
      Initiative: stat("Initiative", 6),
      Perception: stat("Perception", 13),
    },
    level: 12,
  }),
  providerIds: ["occ:card"],
};

describe("associate card", () => {
  it("shows the evaluated associate's numbers and stat block", () => {
    const card = sheetAssociateCard(hound, associate, [
      "occ:card",
      "occ:tamer",
    ]);
    expect(card).toMatchObject({
      kind: "associate",
      id: "ASSOCIATE_HOUND",
      name: "Trained Moss Hound",
      role: "Fey Beast Companion",
      identity: "Medium fey beast",
      defenses: { ac: 27, fortitude: 25, reflex: 25, will: 25 },
      hitPoints: 41,
      hitPointsFrom: "Your bloodied value",
      bloodied: 20,
      initiative: 6,
      perception: 15,
      speed: "7",
      senses: "Low-light vision",
      provenanceIds: ["occ:card", "occ:tamer"],
    });
    expect(card.powers[0]?.lines[0]?.text).toBe(
      "Melee 1 (one creature); +17 vs. AC",
    );
    expect(card.abilities).toBeUndefined();
    expect(card.defensesNote).toBeUndefined();
    expect(associateCardText(card)).toContain("Mossy Pack");
  });

  it("is a companion card in the deck after the familiars", () => {
    const card = sheetAssociateCard(hound, associate);
    const deck = sheetCardDeck({
      powers: [],
      items: [],
      companions: [card],
    });
    expect(deck.map(({ key }) => key)).toContain("companion:associate_hound");
  });

  it("drops the page-1 reminders of the features that only give it", () => {
    const tamer = entity(
      "class:tamer",
      "Moss Hound Tamer",
      "Class Feature",
      "Gain a moss hound companion; it is an ally of you and your allies.",
    );
    const aura = entity(
      "class:tamer-aura",
      "Moss Hound Tamer Level 5",
      "Class Feature",
      "Gain combat advantage against enemies in your companion's aura.",
    );
    const entities = [tamer, aura, hound];
    const selections = [tamer, aura].map(({ id, name, type }) => ({
      id,
      name,
      type,
    }));
    const occurrences: CharacterOccurrence[] = [
      {
        id: "occ:tamer",
        definitionId: tamer.id,
        acquiredLevel: 1,
        kind: "choice",
      },
      {
        id: "occ:aura",
        definitionId: aura.id,
        acquiredLevel: 5,
        kind: "choice",
      },
    ];
    const base = buildSheetModel(
      {
        details: { name: "Tamer", Level: "12" },
        abilities: {},
        stats: {},
        selectedRules: selections,
        levelCount: 12,
        source: "legacy-cache",
        textStrings: {},
        loot: [],
        powers: [],
      },
      entities,
    );
    const reminders = (companions: typeof base.companions) =>
      withSheetOverview(
        { ...base, companions },
        {
          level: 12,
          stats: {},
          evaluatedStats: {},
          occurrences,
          selections,
          content: entities,
          inventory: [],
        },
      ).overview!.reminders.map(({ label }) => label);
    expect(reminders([])).toContain("Moss Hound Tamer");
    const withCard = reminders([
      sheetAssociateCard(hound, associate, ["occ:tamer"]),
    ]);
    expect(withCard).not.toContain("Moss Hound Tamer");
    // A rule of its own (combat advantage) stays.
    expect(withCard).toContain("Moss Hound Tamer Level 5");
  });
});
