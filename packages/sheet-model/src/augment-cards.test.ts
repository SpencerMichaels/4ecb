import { describe, expect, it } from "vitest";
import type {
  CharacterBuild,
  LegacyCharacterSnapshot,
} from "@4ecb/character-domain";
import type { ContentEntity } from "@4ecb/content-domain";
import type { EvaluatedCharacter, EvaluatedPower } from "@4ecb/rules-engine";

import {
  applySheetLayout,
  buildEvaluatedSheetModel,
  buildSheetModel,
  createSheetPowerCardFinder,
  sheetCardDeck,
  sheetLayoutCardKeys,
} from "./index";

// Spelled as the real content is: the parent lists its versions in
// `_AugmentVersions`, each "Augment" marker's value is its power points,
// and the fields under it are indented (" Hit").
const power = (
  id: string,
  name: string,
  fields: readonly (readonly [string, string])[],
): ContentEntity => ({
  id,
  name,
  type: "Power",
  source: "Synthetic Book",
  sources: [],
  attributes: [],
  categories: [],
  specifics: fields.map(([fieldName, value], ordinal) => ({
    name: fieldName,
    value,
    extraAttributes: [],
    ordinal,
  })),
  rules: [],
  description: "",
  extensions: [],
  provenance: { sourceKey: "synthetic", sourceOrdinal: 0 },
});

const common = [
  ["Power Usage", "Encounter"],
  ["Keywords", "Augmentable, Psionic, Weapon"],
  ["Action Type", "Standard action"],
  ["Attack Type", "Melee weapon"],
  ["Target", "One creature"],
  ["Attack", "Charisma vs. Will"],
] as const;
const baseHit =
  "1[W] + Charisma modifier psychic damage, and you push the target 1 square.";
const versionId = (augment: number) =>
  `ID_INTERNAL_POWER_SYNTHETIC_STRIKE_(AUGMENT_${augment})`;
const parent = power("ID_SYN_STRIKE", "Synthetic Strike", [
  ...common,
  ["Hit", baseHit],
  ["Augment", "2"],
  [" Hit", "2[W] + Charisma modifier psychic damage. As above, and slide 1."],
  ["Augment", "4"],
  ["\tHit", "As above, and the target is dazed."],
  ["Level", "11"],
  ["Power Type", "Attack"],
  ["_AugmentVersions", [0, 2, 4].map(versionId).join(",")],
]);
const version = (augment: number, hit: string) =>
  power(versionId(augment), `Synthetic Strike (Augment ${augment})`, [
    ["_SupportsID", "ID_SYN_STRIKE"],
    ...common,
    ["Hit", hit],
    ["Level", "11"],
    ["Power Type", "Attack"],
    ["_AugmentParent", "ID_SYN_STRIKE"],
  ]);
const versions = [
  version(0, baseHit),
  version(2, "2[W] + Charisma modifier psychic damage, and slide 1."),
  version(4, `${baseHit} The target is dazed.`),
];
const content = [parent, ...versions];

const evaluated = (augment: number, dice: number): EvaluatedPower => ({
  definitionId: versionId(augment),
  name: `Synthetic Strike (Augment ${augment})`,
  usage: "Encounter",
  actionType: "Standard action",
  keywords: ["Augmentable", "Psionic", "Weapon"],
  recoveries: [],
  unsupported: [],
  variants: ["legacy:loot:1:1", "unarmed"].map((suffix, index) => ({
    id: `${versionId(augment)}:${suffix}`,
    equipmentName: index === 0 ? "Flail" : "Unarmed",
    proficient: true,
    equipped: index === 0,
    attackBonus: 18,
    defense: "Will",
    damage: `${dice}d${index === 0 ? 10 : 4}+6`,
    attackComponents: [],
    damageComponents: [],
    conditionalDamage: [],
  })),
});

const evaluation = (powers: readonly EvaluatedPower[]) =>
  ({
    level: 11,
    converged: true,
    iterations: 1,
    complete: true,
    legal: true,
    occurrences: [],
    activeDefinitionIds: [],
    activeDefinitions: [],
    choices: [],
    stats: {},
    overlays: [],
    suggestions: [],
    textStrings: {},
    textContributions: [],
    diagnostics: [],
    powers,
  }) as unknown as EvaluatedCharacter;

const snapshot: LegacyCharacterSnapshot = {
  details: {},
  abilities: {},
  stats: {},
  selectedRules: [],
  loot: [],
  powers: [],
  textStrings: {},
  levelCount: 11,
  source: "legacy-cache",
};
const build: CharacterBuild = {
  formatVersion: 3,
  known: [],
  effectiveLevel: 11,
  levels: [],
  grabbag: [],
  inventory: [],
  alternates: [],
  baseAbilities: {},
  textStrings: {},
};
const sheet = (powers: readonly EvaluatedPower[]) =>
  buildEvaluatedSheetModel(snapshot, build, evaluation(powers), content);
const strikeCards = (powers: readonly EvaluatedPower[]) =>
  sheet(powers).powers.filter((card) => card.name.includes("Synthetic"));

describe("an augmentable power's one card (D118)", () => {
  it("folds non-contiguous versions into one card under the parent", () => {
    const cards = strikeCards([
      evaluated(0, 1),
      evaluated(2, 2),
      evaluated(4, 1),
    ]);
    expect(cards).toHaveLength(1);
    const [card] = cards;
    expect(card).toMatchObject({
      id: "ID_SYN_STRIKE",
      name: "Synthetic Strike",
      augmentVersionIds: [0, 2, 4].map(versionId),
      damage: "1d10+6",
    });
    // The base is version 0's card: its own Hit, no augment markers.
    expect(card!.fields.map(({ label }) => label)).toEqual([
      "Attack Type",
      "Target",
      "Attack",
      "Hit",
      "Level",
      "Power Type",
    ]);
    expect(card!.fields.find(({ label }) => label === "Hit")?.value).toBe(
      baseHit,
    );
    // Each further version is its authored block, as the book prints it.
    expect(card!.augments).toEqual([
      {
        id: versionId(2),
        augment: "2",
        fields: [
          {
            label: "Hit",
            value:
              "2[W] + Charisma modifier psychic damage. As above, and slide 1.",
          },
        ],
        // Version 2's evaluated damage differs, per weapon.
        numbers: [
          { equipmentName: "Flail", damage: "2d10+6" },
          { equipmentName: "Unarmed", damage: "2d4+6" },
        ],
      },
      {
        id: versionId(4),
        augment: "4",
        fields: [{ label: "Hit", value: "As above, and the target is dazed." }],
      },
    ]);
  });

  it("prints a locked power's version 0 alone, without augments", () => {
    const [card, ...rest] = strikeCards([evaluated(0, 1)]);
    expect(rest).toHaveLength(0);
    expect(card).toMatchObject({
      id: "ID_SYN_STRIKE",
      name: "Synthetic Strike",
      augmentVersionIds: [versionId(0)],
    });
    expect(card).not.toHaveProperty("augments");
  });

  it("falls back to a version's differing fields without an authored block", () => {
    const bare = power("ID_SYN_STRIKE", "Synthetic Strike", [
      ...common,
      ["Hit", baseHit],
      ["_AugmentVersions", [0, 2].map(versionId).join(",")],
    ]);
    const [card] = buildEvaluatedSheetModel(
      snapshot,
      build,
      evaluation([evaluated(0, 1), evaluated(2, 1)]),
      [bare, ...versions.slice(0, 2)],
    ).powers.filter((candidate) => candidate.name.includes("Synthetic"));
    expect(card!.augments).toEqual([
      {
        id: versionId(2),
        augment: "2",
        fields: [
          {
            label: "Hit",
            value: "2[W] + Charisma modifier psychic damage, and slide 1.",
          },
        ],
      },
    ]);
  });

  it("is the card the builder finds by the parent or any version", () => {
    const finder = createSheetPowerCardFinder(
      evaluation([evaluated(0, 1), evaluated(2, 2), evaluated(4, 1)]),
      content,
    );
    const sheetCard = strikeCards([
      evaluated(0, 1),
      evaluated(2, 2),
      evaluated(4, 1),
    ])[0];
    for (const record of [parent, versions[2]!])
      expect(finder(record, undefined)).toEqual(sheetCard);
    // Not owned: the hypothetical versions supplied, else every version's
    // authored card.
    const unowned = createSheetPowerCardFinder(evaluation([]), content);
    expect(
      unowned(parent, [evaluated(0, 1), evaluated(2, 2)]).augments?.map(
        ({ augment, numbers }) => [augment, numbers?.[0]?.damage],
      ),
    ).toEqual([["2", "2d10+6"]]);
    expect(
      unowned(parent, undefined).augments?.map(({ augment }) => augment),
    ).toEqual(["2", "4"]);
    expect(unowned(parent, undefined).name).toBe("Synthetic Strike");
  });

  it("keeps a saved layout's version card keys", () => {
    const model = sheet([evaluated(0, 1), evaluated(2, 2)]);
    const key = "power:id_syn_strike";
    expect(
      sheetCardDeck(model).filter((entry) => entry.key.includes("syn")),
    ).toHaveLength(1);
    const versionKeys = [0, 2].map(
      (augment) => `power:${versionId(augment).toLocaleLowerCase()}`,
    );
    const shownUnder = (hiddenCards: readonly string[]) =>
      applySheetLayout(model, { version: 1, hiddenCards }).cards.find(
        (card) => card.key === key,
      )?.shown;
    // Hidden when every version card was hidden, or the card itself is.
    expect(shownUnder(versionKeys)).toBe(false);
    expect(shownUnder([key])).toBe(false);
    expect(shownUnder(versionKeys.slice(0, 1))).toBe(true);
    // Showing it clears the old keys too.
    const card = applySheetLayout(model, {
      version: 1,
      hiddenCards: versionKeys,
    }).cards.find((candidate) => candidate.key === key)!;
    expect(sheetLayoutCardKeys(card, true)).toEqual([key, ...versionKeys]);
    expect(sheetLayoutCardKeys(card, false)).toEqual([key]);
    // A stored order places it where its first version card was.
    const order = applySheetLayout(model, {
      version: 1,
      cardOrder: [versionKeys[1]!, "play:character"],
    }).cards.map((entry) => entry.key);
    expect(order.indexOf(key)).toBeLessThan(order.indexOf("play:character"));
  });

  it("splits a legacy cache's parent card into the same sections", () => {
    const model = buildSheetModel(
      {
        ...snapshot,
        powers: [
          { id: "ID_SYN_STRIKE", name: "Synthetic Strike", weapons: [] },
        ],
      },
      content,
    );
    const [card] = model.powers;
    expect(card?.fields.map(({ label }) => label)).toEqual([
      "Attack Type",
      "Target",
      "Attack",
      "Hit",
      "Level",
      "Power Type",
    ]);
    expect(
      card?.augments?.map(({ id, augment, fields }) => [
        id,
        augment,
        fields.map(({ label }) => label),
      ]),
    ).toEqual([
      [versionId(2), "2", ["Hit"]],
      [versionId(4), "4", ["Hit"]],
    ]);
    expect(card?.augmentVersionIds).toEqual([0, 2, 4].map(versionId));
  });
});
