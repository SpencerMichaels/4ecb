import { describe, expect, it } from "vitest";

import {
  POWER_MENTIONS_FIELD,
  POWER_MENTIONS_VERSION,
  type ContentEntity,
} from "@4ecb/content-domain";
import type {
  CharacterOccurrence,
  EvaluatedCharacter,
} from "@4ecb/rules-engine";

import { buildSheetModel } from "./index";
import { withSheetOverview } from "./overview";
import {
  powerCardMentionEffects,
  powerMentionEffects,
} from "./power-mention-effects";
import { withUniversalActionCards } from "./universal-action-cards";

function record(
  id: string,
  name: string,
  type: string,
  fields: Readonly<Record<string, string>>,
  description = "",
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
    specifics: Object.entries(fields).map(([name, value], ordinal) => ({
      name,
      value,
      extraAttributes: [],
      ordinal,
    })),
  };
}

// As the pack build stores them (content-domain power-mentions.ts).
const mentions = (...powers: string[]) =>
  JSON.stringify({ version: POWER_MENTIONS_VERSION, powers });

const abjure = record("power:abjure", "Abjure Undead", "Power", {});
const wrenching = record(
  "feat:wrenching",
  "Wrenching Abjuration",
  "Feat",
  {
    "Short Description":
      "Slide instead of pull with abjure undead but must end closer to you",
    [POWER_MENTIONS_FIELD]: mentions("Abjure Undead"),
  },
  "When you hit with your abjure undead class feature, you can slide the target instead of pulling the target, but it must end the forced movement closer to you than where it began.",
);
const armor = record("item:armor", "Battleforged Armor +1", "Magic Item", {
  Property:
    "If you use your second wind when you are bloodied, regain an extra 1d10 hit points.",
  [POWER_MENTIONS_FIELD]: mentions("Second Wind"),
});
const entities = [abjure, wrenching, armor];
const byId = new Map(entities.map((entity) => [entity.id, entity]));

const evaluation = {
  level: 5,
  stats: {},
  activeDefinitions: [
    {
      definitionId: wrenching.id,
      occurrenceIds: ["occ:1"],
      providerOccurrenceIds: [],
    },
    {
      definitionId: armor.id,
      occurrenceIds: ["loot:1:definition:1"],
      providerOccurrenceIds: [],
    },
  ],
} as unknown as Pick<
  EvaluatedCharacter,
  "activeDefinitions" | "level" | "stats"
>;

describe("feats and items that name a power (D126)", () => {
  it("puts a feat's note and an equipped item's property on the power", () => {
    const effects = powerMentionEffects(evaluation, (id) => byId.get(id), [
      { id: "loot:1", name: "Battleforged Armor +1", equipped: true },
    ]);
    expect(effects.get("abjure undead")).toEqual([
      {
        text: "Slide instead of pull with abjure undead but must end closer to you - Wrenching Abjuration.",
        source: "authoritative-evaluation",
        provider: "Wrenching Abjuration",
        provenanceId: "occ:1",
      },
    ]);
    expect(effects.get("second wind")?.map(({ text }) => text)).toEqual([
      "If you use your second wind when you are bloodied, regain an extra 1d10 hit points - Battleforged Armor +1.",
    ]);
  });

  it("puts them on the universal Second Wind card", () => {
    const effects = powerMentionEffects(evaluation, (id) => byId.get(id), [
      { id: "loot:1", name: "Battleforged Armor +1", equipped: true },
    ]);
    const secondWind = withUniversalActionCards(
      [],
      { overlays: [], stats: {} } as unknown as EvaluatedCharacter,
      effects,
    ).find(({ name }) => name === "Second Wind");
    expect(
      secondWind?.additionalEffects?.map(({ provider }) => provider),
    ).toEqual(["Battleforged Armor +1"]);
  });

  it("leaves out an item that is not equipped", () => {
    const effects = powerMentionEffects(evaluation, (id) => byId.get(id), [
      { id: "loot:1", name: "Battleforged Armor +1", equipped: false },
    ]);
    expect(effects.has("second wind")).toBe(false);
  });

  it("skips a provider the card already lists a rider of", () => {
    const effects = powerMentionEffects(evaluation, (id) => byId.get(id));
    expect(powerCardMentionEffects(effects, abjure, [])).toHaveLength(1);
    expect(
      powerCardMentionEffects(effects, abjure, ["Wrenching Abjuration"]),
    ).toEqual([]);
  });

  it("drops the feat's page-1 reminder its power card now shows", () => {
    const selections = [wrenching].map(({ id, name, type }) => ({
      id,
      name,
      type,
    }));
    const occurrences: CharacterOccurrence[] = [
      {
        id: "occ:1",
        definitionId: wrenching.id,
        acquiredLevel: 1,
        kind: "choice",
      },
    ];
    const base = buildSheetModel(
      {
        details: { name: "Abjurer", Level: "5" },
        abilities: {},
        stats: {},
        selectedRules: selections,
        levelCount: 5,
        source: "legacy-cache",
        textStrings: {},
        loot: [],
        powers: [],
      },
      entities,
    );
    const shown = (withCard: boolean) =>
      withSheetOverview(
        {
          ...base,
          powers: [
            {
              kind: "power",
              id: abjure.id,
              name: abjure.name,
              fields: [],
              ...(withCard
                ? {
                    additionalEffects: powerCardMentionEffects(
                      powerMentionEffects(evaluation, (id) => byId.get(id)),
                      abjure,
                      [],
                    ),
                  }
                : {}),
            },
          ],
        },
        {
          level: 5,
          stats: {},
          evaluatedStats: {},
          occurrences,
          selections,
          content: entities,
          inventory: [],
        },
      )
        .overview?.reminderCandidates?.filter(
          ({ label }) => label === wrenching.name,
        )
        .map(({ defaultShown }) => defaultShown);
    expect(shown(false)).toEqual([true]);
    expect(shown(true)).toEqual([false]);
  });
});
