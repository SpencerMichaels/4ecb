import { describe, expect, it } from "vitest";
import type {
  CharacterBuild,
  LegacyCharacterSnapshot,
} from "@4ecb/character-domain";
import type { ContentEntity } from "@4ecb/content-domain";
import type { EvaluatedCharacter } from "@4ecb/rules-engine";

import { deityDomains, deityDomainsText } from "./deity-reference";
import { godFragmentPowerCard } from "./god-fragment-card";
import { buildEvaluatedSheetModel, type SheetCard } from "./index";
import { sheetCardDeck } from "./card-deck";
import { sheetItemSetCards } from "./item-set-card";

type Occurrence = EvaluatedCharacter["occurrences"][number];

const entity = (
  id: string,
  name: string,
  type: string,
  specifics: Readonly<Record<string, string>> = {},
  description = "",
): ContentEntity => ({
  id,
  name,
  type,
  source: "Synthetic Book",
  sources: ["Synthetic Book"],
  attributes: [],
  categories: [],
  specifics: Object.entries(specifics).map(([name, value], ordinal) => ({
    name,
    value,
    extraAttributes: [],
    ordinal,
  })),
  rules: [],
  description,
  extensions: [],
  provenance: { sourceKey: "sheet-gaps-test", sourceOrdinal: 0 },
});

const content = [
  entity(
    "DEITY",
    "Synthetic Moon",
    "Deity",
    { Alignment: "Unaligned", Domains: "DOMAIN_B, DOMAIN_A, MISSING" },
    "God of synthetic tides.",
  ),
  entity("DOMAIN_A", "Tides", "Domain", {}, "Tidal lore."),
  entity("DOMAIN_B", "Dusk", "Domain", {}, "Dusk lore."),
  entity("FEAT", "Awaken Synthetic Shard", "Feat", {
    "Short Description": "Gain your shard's benefits",
  }),
  {
    ...entity("SHARD", "Shard of the Moon", "God Fragment", {
      "Constant Benefits": "You gain a +2 bonus to Stealth checks.",
      Deity: "DEITY",
      "Action Type": "Free",
      Effect: "You gain concealment.",
      Keywords: "Teleportation",
      Trigger: "You use a divine encounter power.",
      "Power Usage": "Encounter",
      Quirks: "Sneaky",
    }),
    flavor: "Shadows fold around you.",
  },
  entity(
    "SET",
    "Synthetic Regalia",
    "Item Set",
    {
      Tier: "Heroic",
      "Set Items": "CROWN,CLOAK,BOOTS",
      Benefits: "SET_4,SET_2",
    },
    "Regalia of a synthetic court.",
  ),
  entity(
    "SET_2",
    "Synthetic Regalia (2)",
    "Item Set Benefit",
    { _Item_Set_ID: "SET", "Piece Count": "2" },
    "Two-piece benefit.",
  ),
  entity(
    "SET_4",
    "Synthetic Regalia (4)",
    "Item Set Benefit",
    { _Item_Set_ID: "SET", "Piece Count": "4" },
    "Four-piece benefit.",
  ),
  entity("CROWN", "Synthetic Crown", "Magic Item", { _Item_Set_ID: "SET" }),
  entity("CLOAK", "Synthetic Cloak", "Magic Item", { _Item_Set_ID: "SET" }),
  entity("RING", "Plain Ring", "Magic Item"),
];
const byId = new Map(content.map((value) => [value.id.toLowerCase(), value]));
const lookup = (id: string) => byId.get(id.toLowerCase());

const occurrence = (
  id: string,
  definitionId: string,
  parentId?: string,
  kind: Occurrence["kind"] = "grant",
): Occurrence => ({
  id,
  definitionId,
  acquiredLevel: 1,
  kind,
  ...(parentId === undefined ? {} : { parentId, ruleOrdinal: 0 }),
});
const snapshot: LegacyCharacterSnapshot = {
  details: {},
  abilities: {},
  stats: {},
  selectedRules: [],
  loot: [],
  powers: [],
  textStrings: {},
  levelCount: 1,
  source: "legacy-cache",
};
const holding = (id: string, definitionId: string, equipped: number) => ({
  id,
  acquiredLevel: 1,
  quantity: 1,
  equippedQuantity: equipped,
  elements: [
    {
      definitionId,
      name: lookup(definitionId)!.name,
      type: "Magic Item",
    },
  ],
  overrides: {},
  legality: "rules-legal" as const,
});
const build: CharacterBuild = {
  formatVersion: 3,
  known: [],
  effectiveLevel: 1,
  levels: [],
  grabbag: [],
  inventory: [
    holding("crown", "CROWN", 1),
    holding("ring", "RING", 1),
    holding("cloak", "CLOAK", 0),
  ],
  alternates: [],
  baseAbilities: {},
  textStrings: {},
};
const occurrences = [
  occurrence("deity", "DEITY", undefined, "root"),
  occurrence("domain-b", "DOMAIN_B", "deity"),
  occurrence("domain-a", "DOMAIN_A", "deity"),
  occurrence("feat", "FEAT", undefined, "root"),
  occurrence("shard", "SHARD", "feat", "choice"),
];
const evaluation = {
  level: 1,
  converged: true,
  iterations: 1,
  complete: true,
  legal: true,
  occurrences,
  activeDefinitionIds: occurrences.map(({ definitionId }) => definitionId),
  activeDefinitions: [],
  choices: [],
  stats: {},
  overlays: [],
  suggestions: [],
  textStrings: {},
  textContributions: [],
  diagnostics: [],
  powers: [],
  itemSets: [{ setId: "SET", pieces: 2, activeBenefitIds: ["SET_2"] }],
} as unknown as EvaluatedCharacter;
const sheet = buildEvaluatedSheetModel(snapshot, build, evaluation, content);

describe("deity domains", () => {
  it("names the deity's domains in its Domains order", () => {
    const deity = lookup("DEITY")!;
    expect(deityDomains(deity, lookup).map(({ id }) => id)).toEqual([
      "DOMAIN_B",
      "DOMAIN_A",
    ]);
    expect(deityDomainsText(deity, lookup)).toBe("Dusk, Tides");
    expect(deityDomainsText(lookup("DOMAIN_A")!, lookup)).toBeUndefined();
  });

  it("gives the deity a reference entry led by its domains", () => {
    expect(sheet.identity).toContainEqual({
      label: "Deity",
      value: "Synthetic Moon",
    });
    expect(sheet.deity).toEqual({
      id: "DEITY",
      name: "Synthetic Moon",
      domains: [
        { id: "DOMAIN_B", name: "Dusk" },
        { id: "DOMAIN_A", name: "Tides" },
      ],
      description: "God of synthetic tides.",
      source: "Synthetic Book",
    });
    expect(
      sheet.overview?.features.find(({ group }) => group === "Deity"),
    ).toMatchObject({
      name: "Synthetic Moon",
      fields: [{ label: "Domains", value: "Dusk, Tides" }],
      description: "God of synthetic tides.",
      fieldsFirst: true,
      playReminder: false,
    });
    // Page 1's features list doesn't gain a Deity group.
    expect(sheet.features.map(({ group }) => group)).not.toContain("Deity");
  });
});

describe("god fragments", () => {
  it("cards the fragment's ability from its own fields", () => {
    expect(godFragmentPowerCard(lookup("SHARD")!)).toEqual({
      id: "SHARD",
      kind: "power",
      name: "Shard of the Moon",
      usage: "Encounter",
      actionType: "Free",
      keywords: "Teleportation",
      fields: [
        { label: "Trigger", value: "You use a divine encounter power." },
        { label: "Effect", value: "You gain concealment." },
      ],
      flavor: "Shadows fold around you.",
      source: "Synthetic Book",
    });
    expect(godFragmentPowerCard(lookup("FEAT")!)).toBeUndefined();
    expect(
      godFragmentPowerCard({
        ...lookup("SHARD")!,
        specifics: lookup("SHARD")!.specifics.filter(
          ({ name }) => name !== "Power Usage",
        ),
      }),
    ).toBeUndefined();
  });

  it("joins the power cards and puts its constant benefit on the feat", () => {
    expect(sheet.powers.map(({ name }) => name)).toContain("Shard of the Moon");
    const feat = sheet.features
      .flatMap(({ entries }) => entries)
      .find(({ label }) => label === "Awaken Synthetic Shard");
    expect(feat?.choices?.map(({ name }) => name)).toEqual([
      "Shard of the Moon",
    ]);
    expect(
      sheet.overview?.features.find(
        ({ name }) => name === "Awaken Synthetic Shard",
      )?.fields,
    ).toContainEqual({
      label: "Constant Benefits",
      value: "You gain a +2 bonus to Stealth checks.",
    });
  });
});

describe("item sets", () => {
  it("cards each owned set with its benefits by piece count", () => {
    expect(sheet.itemSets).toEqual([
      {
        kind: "item-set",
        id: "SET",
        name: "Synthetic Regalia",
        tier: "Heroic",
        group: false,
        pieces: 2,
        pieceIds: ["CROWN", "CLOAK", "BOOTS"],
        benefits: [
          {
            id: "SET_2",
            pieceCount: 2,
            text: "Two-piece benefit.",
            active: true,
          },
          {
            id: "SET_4",
            pieceCount: 4,
            text: "Four-piece benefit.",
            active: false,
          },
        ],
        description: "Regalia of a synthetic court.",
        source: "Synthetic Book",
      },
    ]);
  });

  it("shows an owned set without equipped pieces at zero", () => {
    const [card] = sheetItemSetCards([[lookup("CLOAK")!]], lookup, undefined);
    expect(card?.pieces).toBe(0);
    expect(card?.benefits.every(({ active }) => !active)).toBe(true);
    expect(sheetItemSetCards([[lookup("RING")!]], lookup, [])).toEqual([]);
  });

  it("carries a group set's entered party count, absent while unset", () => {
    const group = entity("GROUP", "Synthetic Company Arms", "Item Set", {
      Tier: "Group",
      Benefits: "GROUP_2",
    });
    const groupLookup = (id: string) =>
      id.toLowerCase() === "group" ? group : lookup(id);
    const blade = entity("BLADE", "Synthetic Blade", "Magic Item", {
      _Item_Set_ID: "GROUP",
    });
    const unset = sheetItemSetCards([[blade]], groupLookup, [], {});
    expect(unset[0]?.group).toBe(true);
    expect(unset[0]).not.toHaveProperty("partyPieces");
    const [set] = sheetItemSetCards(
      [[blade]],
      groupLookup,
      [{ setId: "GROUP", pieces: 3, activeBenefitIds: [] }],
      { "group set count": "3" },
    );
    expect(set?.partyPieces).toBe(3);
    expect(set?.pieces).toBe(3);
    // A non-group set ignores the textstring.
    expect(
      sheetItemSetCards([[lookup("CLOAK")!]], lookup, [], {
        "SET Set Count": "3",
      })[0],
    ).not.toHaveProperty("partyPieces");
  });

  it("places each set's card after the last of its pieces' cards", () => {
    const card = (id: string): SheetCard => ({
      id,
      kind: "item",
      name: id,
      fields: [],
    });
    const [set] = sheet.itemSets!;
    const ids = (items: SheetCard[]) =>
      sheetCardDeck({ powers: [], companions: [], items, itemSets: [set!] })
        .filter(({ group }) => group === "items")
        .map(({ card }) => (card as SheetCard).id);
    expect(
      ids([card("CROWN"), card("RING"), card("CLOAK"), card("OTHER")]),
    ).toEqual(["CROWN", "RING", "CLOAK", "SET", "OTHER"]);
    // A set whose pieces print no card closes the deck.
    expect(ids([card("RING")])).toEqual(["RING", "SET"]);
    // A piece hidden by its holding doesn't hold the set's card.
    expect(
      ids([
        card("CROWN"),
        { ...card("CLOAK"), hiddenByDefault: true },
        card("OTHER"),
      ]),
    ).toEqual(["CROWN", "SET", "CLOAK", "OTHER"]);
  });
});
