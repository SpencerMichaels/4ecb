import { isUserFacingSpecific, type ContentEntity } from "@4ecb/content-domain";
import type { LegacyRuleElement } from "@4ecb/character-domain";
import type { CharacterSheetModel, SheetValue } from "./index";

export interface OverviewFeature {
  readonly id: string;
  readonly name: string;
  readonly group: string;
  readonly summary: string;
  readonly description: string;
  readonly fields: readonly SheetValue[];
  readonly source: string;
  readonly fullTextAvailable: boolean;
}
export interface OverviewInventory {
  readonly name: string;
  readonly quantity: number;
  readonly equipped: number;
  readonly slots: readonly string[];
  readonly fields: readonly SheetValue[];
}
export interface SheetOverview {
  readonly level: number;
  readonly abilities: readonly {
    readonly name: string;
    readonly score: string;
    readonly modifier: string;
    readonly check: string;
  }[];
  readonly skills: readonly {
    readonly name: string;
    readonly ability: string;
    readonly bonus: string;
    readonly trained: boolean | undefined;
  }[];
  readonly saves: string;
  readonly bloodied: string;
  readonly vision: string;
  readonly features: readonly OverviewFeature[];
  readonly inventory: readonly OverviewInventory[];
  readonly reminders: readonly SheetValue[];
}
const key = (s: string) => s.trim().toLowerCase();
const signed = (n: number) => `${n >= 0 ? "+" : ""}${n}`;
const skillAbilities: Readonly<Record<string, string>> = {
  Acrobatics: "DEX",
  Arcana: "INT",
  Athletics: "STR",
  Bluff: "CHA",
  Diplomacy: "CHA",
  Dungeoneering: "WIS",
  Endurance: "CON",
  Heal: "WIS",
  History: "INT",
  Insight: "WIS",
  Intimidate: "CHA",
  Nature: "WIS",
  Perception: "WIS",
  Religion: "INT",
  Stealth: "DEX",
  Streetwise: "CHA",
  Thievery: "DEX",
};
export function withSheetOverview(
  model: CharacterSheetModel,
  input: {
    level: number;
    stats: Readonly<Record<string, string>>;
    selections: readonly LegacyRuleElement[];
    content: readonly ContentEntity[];
    inventory: readonly OverviewInventory[];
  },
): CharacterSheetModel {
  const stats = new Map(
    Object.entries(input.stats).map(([name, value]) => [key(name), value]),
  );
  const stat = (...names: string[]) =>
    names
      .map((name) => stats.get(key(name)))
      .find((value) => value !== undefined && value.trim() !== "");
  const number = (s: string | undefined) =>
    s !== undefined && /^[-+]?\d+(?:\.\d+)?$/.test(s.trim())
      ? Number(s)
      : undefined;
  const definitions = new Map(
    input.content.map((entity) => [key(entity.id), entity]),
  );
  const features: OverviewFeature[] = [];
  const seen = new Set<string>();
  for (const group of model.features)
    for (const entry of group.entries) {
      if (group.group === "Language") continue;
      const selected = input.selections.filter(
        (rule) =>
          key(rule.type) === key(group.group) &&
          key(rule.name) === key(entry.label),
      );
      const candidates = selected.flatMap((rule) =>
        rule.id
          ? [definitions.get(key(rule.id))].filter(
              (e): e is ContentEntity => e !== undefined,
            )
          : [],
      );
      const entity = candidates[0];
      const id = entity?.id ?? `${group.group}:${entry.label}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const summary =
        entity?.specifics.find(
          (field) => key(field.name) === "short description",
        )?.value || entry.value;
      const description =
        entity?.description.trim() ||
        entity?.specifics
          .find((field) => key(field.name) === "full text")
          ?.value.trim() ||
        "";
      const fields =
        entity?.specifics
          .filter(
            (field) =>
              isUserFacingSpecific(field) &&
              field.value.trim() &&
              !/^(?:short description|full text|level|type|class|power|powers|associated powers|associated power info|tier|source)$/i.test(
                field.name.trim(),
              ) &&
              field.value.trim() !== description,
          )
          .map((field) => ({ label: field.name.trim(), value: field.value })) ??
        [];
      if (
        entity?.prerequisites?.trim() &&
        !fields.some((field) => /^prerequisites?$/i.test(field.label))
      )
        fields.unshift({ label: "Prerequisite", value: entity.prerequisites });
      features.push({
        id,
        name: entry.label,
        group: group.group,
        summary,
        description: description || summary,
        fields,
        source: entity?.source ?? "",
        fullTextAvailable: Boolean(description || fields.length),
      });
    }
  const reminders: SheetValue[] = [];
  const reminderKeys = new Set<string>();
  const addReminder = (label: string, value: string) => {
    const identity = `${label}:${value}`;
    if (!value.trim() || reminderKeys.has(identity)) return;
    reminderKeys.add(identity);
    reminders.push({ label, value });
  };
  for (const feature of features)
    if (
      ["Feat", "Class Feature", "Racial Trait"].includes(feature.group) &&
      /\b(?:allies|ally|when|whenever|while|if|trigger)\b/i.test(
        `${feature.summary} ${feature.description}`,
      )
    )
      addReminder(feature.name, feature.summary || feature.description);
  for (const item of input.inventory.filter((item) => item.equipped > 0))
    for (const field of item.fields)
      if (
        /^propert(?:y|ies)$/i.test(field.label) &&
        /\b(?:allies|ally|when|whenever|while|if|trigger)\b/i.test(field.value)
      )
        addReminder(item.name, field.value);
  for (const power of model.powers)
    for (const effect of power.additionalEffects ?? [])
      addReminder(effect.provider ?? power.name, effect.text);
  reminders.sort(
    (a, b) =>
      Number(/\ball(?:y|ies)\b/i.test(b.value)) -
      Number(/\ball(?:y|ies)\b/i.test(a.value)),
  );
  const hp = number(stat("Hit Points"));
  const saves = stat("Saving Throws", "Saving Throw Bonus", "Saving Throw");
  const savesNumber = number(saves);
  return {
    ...model,
    overview: {
      level: input.level,
      abilities: model.abilities.map(({ label, value }) => {
        const score = number(value);
        const mod =
          number(stat(`${label} modifier`)) ??
          (score === undefined ? undefined : Math.floor((score - 10) / 2));
        return {
          name: label,
          score: value,
          modifier: mod === undefined ? "—" : signed(mod),
          check:
            mod === undefined ? "—" : signed(mod + Math.floor(input.level / 2)),
        };
      }),
      skills: model.skills.map(({ label, value }) => {
        const trained = number(stat(`${label} Trained`));
        return {
          name: label,
          ability: skillAbilities[label] ?? "",
          bonus: number(value) === undefined ? value : signed(Number(value)),
          trained:
            trained !== undefined
              ? trained > 0
              : input.selections.some(
                    (rule) =>
                      key(rule.type) === "skill training" &&
                      key(rule.name) === key(label),
                  )
                ? true
                : undefined,
        };
      }),
      saves: savesNumber === undefined ? (saves ?? "—") : signed(savesNumber),
      bloodied:
        stat("Bloodied Value", "Bloodied") ??
        (hp === undefined ? "—" : String(Math.floor(hp / 2))),
      vision:
        stat("Vision") ??
        input.selections
          .filter((rule) => /vision/i.test(rule.name))
          .map((rule) => rule.name)
          .join(", "),
      features,
      inventory: input.inventory.filter((item) => item.quantity > 0),
      reminders,
    },
  };
}
