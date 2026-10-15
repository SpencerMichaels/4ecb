import { describe, expect, it } from "vitest";
import type { ContentEntity } from "@4ecb/content-domain";
import type { CharacterOccurrence } from "@4ecb/rules-engine";
import type { SheetCard } from "./index";
import { corePowerReminders } from "./core-power-reminders";

const entity = (
  id: string,
  type: string,
  fields: Record<string, string> = {},
): ContentEntity => ({
  id,
  type,
  name: id,
  source: "Synthetic",
  sources: [],
  attributes: [],
  categories: [],
  description: "",
  extensions: [],
  provenance: { sourceKey: "synthetic", sourceOrdinal: 0 },
  specifics: Object.entries(fields).map(([name, value], ordinal) => ({
    name,
    value,
    ordinal,
    extraAttributes: [],
  })),
  rules: [],
});
const grant = (name: string, type: string) => ({
  name: "grant",
  attributes: [
    { name: "name", value: name },
    { name: "type", value: type },
  ],
  children: [],
  text: "",
  ordinal: 0,
});
const klass = {
  ...entity("class:test", "Class"),
  rules: [grant("grants:test", "Grants")],
};
const container = {
  ...entity("grants:test", "Grants"),
  rules: [grant("feature:test", "Class Feature")],
};
const feature = {
  ...entity("feature:test", "Class Feature", {
    Level: "1",
    Powers: "power:test",
  }),
  rules: [grant("power:test", "Power")],
};
const power = entity("power:test", "Power", { _ParentFeature: feature.id });
const card: SheetCard = {
  id: power.id,
  name: "Chosen Foe",
  kind: "power",
  fields: [
    {
      label: "Effect",
      value:
        "When you attack the target, roll twice. This lasts until the end of the encounter.\n\nYou must engage the target each turn or the effect ends.",
    },
  ],
};
const content = [klass, container, feature, power];
const selections = [klass, feature, power].map(({ id, name, type }) => ({
  id,
  name,
  type,
}));
const input = { content, selections, powers: [card] };
const occurrences: CharacterOccurrence[] = [
  { id: "root", definitionId: klass.id, kind: "root", acquiredLevel: 1 },
  {
    id: "container",
    parentId: "root",
    definitionId: container.id,
    kind: "grant",
    acquiredLevel: 1,
  },
  {
    id: "feature",
    parentId: "container",
    definitionId: feature.id,
    kind: "grant",
    acquiredLevel: 1,
  },
];
describe("core class-power reminders", () => {
  it("follows automatic class grants and uses the owned power's complete mechanical text", () => {
    expect(corePowerReminders(input)).toEqual([
      {
        featureId: feature.id,
        featureName: feature.name,
        powerId: power.id,
        label: card.name,
        value: card.fields[0]!.value,
      },
    ]);
    expect(corePowerReminders({ ...input, occurrences })).toHaveLength(1);
  });
  it("uses an authored mechanical summary and adds deduplicated calculated effects", () => {
    const summarized = {
      ...feature,
      specifics: [
        ...feature.specifics,
        {
          name: "Short Description",
          value: "Designate an enemy; deal extra damage once per round.",
          ordinal: 9,
          extraAttributes: [],
        },
      ],
    };
    const effect = {
      source: "authoritative-evaluation" as const,
      provider: feature.name,
      text: "+1d8 to damage against the designated enemy.",
    };
    const reminders = corePowerReminders({
      ...input,
      content: [klass, container, summarized, power],
      powers: [
        card,
        { ...card, id: "other", additionalEffects: [effect, effect] },
      ],
    });
    expect(reminders[0]?.value).toBe(
      `${summarized.specifics.at(-1)!.value}\n\n${effect.text}`,
    );
  });
  it("does not use grant-only short descriptions instead of mechanics", () => {
    const wrapper = {
      ...feature,
      specifics: [
        ...feature.specifics,
        {
          name: "Short Description",
          value: "Gain the chosen foe power.",
          ordinal: 9,
          extraAttributes: [],
        },
      ],
    };
    expect(
      corePowerReminders({
        ...input,
        content: [klass, container, wrapper, power],
      })[0]?.value,
    ).toBe(card.fields[0]!.value);
  });
  it("requires an active feature, owned power and an automatic class grant path", () => {
    expect(corePowerReminders({ ...input, selections: [klass] })).toEqual([]);
    expect(corePowerReminders({ ...input, powers: [] })).toEqual([]);
    expect(
      corePowerReminders({
        ...input,
        content: [{ ...klass, rules: [] }, container, feature, power],
      }),
    ).toEqual([]);
    expect(
      corePowerReminders({
        ...input,
        content: [
          klass,
          container,
          {
            ...feature,
            specifics: feature.specifics.map((f) =>
              f.name === "Level" ? { ...f, value: "7" } : f,
            ),
          },
          power,
        ],
      }),
    ).toEqual([]);
  });
  it("does not treat other active class records as the character's selected class", () => {
    const other = { ...klass, id: "class:other", name: "Other class" };
    const extended = {
      ...input,
      content: [{ ...klass, rules: [] }, other, container, feature, power],
      selections: [...selections, other],
    };
    expect(corePowerReminders({ ...extended, className: klass.name })).toEqual(
      [],
    );
    expect(
      corePowerReminders({ ...extended, className: other.name }),
    ).toHaveLength(1);
  });
  it("rejects later-level and feat-derived occurrences even with matching static metadata", () => {
    expect(
      corePowerReminders({
        ...input,
        occurrences: occurrences.map((o) =>
          o.id === "feature" ? { ...o, acquiredLevel: 11 } : o,
        ),
      }),
    ).toEqual([]);
    const feat = entity("feat:test", "Feat");
    expect(
      corePowerReminders({
        ...input,
        content: [...content, feat],
        occurrences: [
          ...occurrences.filter((o) => o.id !== "container"),
          {
            id: "container",
            definitionId: feat.id,
            kind: "choice",
            acquiredLevel: 1,
            parentId: "root",
          },
        ],
      }),
    ).toEqual([]);
  });
  it("does not reintroduce instantaneous powers, attacks or access containers", () => {
    for (const candidate of [
      { ...card, attack: "+5 vs AC" },
      {
        ...card,
        fields: [{ label: "Attack", value: "Strength vs AC" }, ...card.fields],
      },
      {
        ...card,
        fields: [{ label: "Effect", value: "The target regains hit points." }],
      },
      {
        ...card,
        fields: [
          {
            label: "Effect",
            value: "You gain a power and can use one such power per encounter.",
          },
        ],
      },
      {
        ...card,
        fields: [
          {
            label: "Effect",
            value:
              "The target regains hit points. You are weakened until your next turn ends.",
          },
        ],
      },
    ])
      expect(corePowerReminders({ ...input, powers: [candidate] })).toEqual([]);
  });
  it("does not mistake an effect-only Unknown-defense calculation for an authored attack", () => {
    expect(
      corePowerReminders({
        ...input,
        powers: [{ ...card, attack: "+4 vs Unknown" }],
      }),
    ).toHaveLength(1);
  });
  it("recognizes explicit parent-feature links without guessing from matching names", () => {
    const parentOnly = {
      ...feature,
      specifics: feature.specifics.filter((f) => f.name !== "Powers"),
      rules: [],
    };
    expect(
      corePowerReminders({
        ...input,
        content: [klass, container, parentOnly, power],
      }),
    ).toHaveLength(1);
    expect(
      corePowerReminders({
        ...input,
        content: [klass, container, parentOnly, { ...power, specifics: [] }],
      }),
    ).toEqual([]);
  });
});
