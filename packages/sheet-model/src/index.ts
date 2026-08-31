import type {
  LegacyCharacterSnapshot,
  LegacyPowerSnapshot,
} from "@4ecb/character-domain";
import type { ContentEntity } from "@4ecb/content-domain";

export interface SheetValue {
  readonly label: string;
  readonly value: string;
}

export interface SheetCard {
  readonly id?: string;
  readonly kind: "power" | "item";
  readonly name: string;
  readonly usage?: string;
  readonly actionType?: string;
  readonly keywords?: string;
  readonly attack?: string;
  readonly damage?: string;
  readonly fields: readonly SheetValue[];
  readonly description?: string;
  readonly source?: string;
}

export interface CharacterSheetModel {
  readonly source: "legacy-cache";
  readonly identity: readonly SheetValue[];
  readonly abilities: readonly SheetValue[];
  readonly defenses: readonly SheetValue[];
  readonly resources: readonly SheetValue[];
  readonly senses: readonly SheetValue[];
  readonly skills: readonly SheetValue[];
  readonly features: readonly {
    readonly group: string;
    readonly entries: readonly SheetValue[];
  }[];
  readonly powers: readonly SheetCard[];
  readonly items: readonly SheetCard[];
  readonly notes: readonly SheetValue[];
}

const ABILITIES = [
  "Strength",
  "Constitution",
  "Dexterity",
  "Intelligence",
  "Wisdom",
  "Charisma",
] as const;
const SKILLS = [
  "Acrobatics",
  "Arcana",
  "Athletics",
  "Bluff",
  "Diplomacy",
  "Dungeoneering",
  "Endurance",
  "Heal",
  "History",
  "Insight",
  "Intimidate",
  "Nature",
  "Perception",
  "Religion",
  "Stealth",
  "Streetwise",
  "Thievery",
] as const;

function values(
  stats: Readonly<Record<string, string>>,
  names: readonly string[],
): SheetValue[] {
  return names.flatMap((name) =>
    stats[name] === undefined ? [] : [{ label: name, value: stats[name] }],
  );
}

function entityMap(
  entities: readonly ContentEntity[],
): Map<string, ContentEntity> {
  return new Map(
    entities.map((entity) => [entity.id.toLocaleLowerCase(), entity]),
  );
}

function entityFields(entity: ContentEntity | undefined): SheetValue[] {
  return (
    entity?.specifics.flatMap((field) =>
      field.value.length === 0
        ? []
        : [{ label: field.name, value: field.value }],
    ) ?? []
  );
}

function powerCard(
  power: LegacyPowerSnapshot,
  entities: Map<string, ContentEntity>,
): SheetCard {
  const entity =
    power.id === undefined
      ? undefined
      : entities.get(power.id.toLocaleLowerCase());
  const weapon = power.weapons[0];
  const attack =
    weapon?.attackBonus === undefined
      ? undefined
      : `+${weapon.attackBonus} vs ${weapon.defense ?? "defense"}`;
  return {
    ...(power.id === undefined ? {} : { id: power.id }),
    kind: "power",
    name: power.name,
    ...(power.usage === undefined ? {} : { usage: power.usage }),
    ...(power.actionType === undefined ? {} : { actionType: power.actionType }),
    ...(entity?.specifics.find((field) => field.name === "Keywords")?.value ===
    undefined
      ? power.keywords === undefined
        ? {}
        : { keywords: power.keywords }
      : {
          keywords:
            entity.specifics.find((field) => field.name === "Keywords")
              ?.value ?? "",
        }),
    ...(attack === undefined ? {} : { attack }),
    ...(weapon?.damage === undefined ? {} : { damage: weapon.damage }),
    fields: entityFields(entity).filter(
      (field) =>
        !["Power Usage", "Action Type", "Keywords"].includes(field.label),
    ),
    ...(entity?.description === undefined || entity.description.length === 0
      ? power.description === undefined
        ? {}
        : { description: power.description }
      : { description: entity.description }),
    ...(entity?.source === undefined
      ? power.source === undefined
        ? {}
        : { source: power.source }
      : { source: entity.source }),
  };
}

export function buildSheetModel(
  snapshot: LegacyCharacterSnapshot,
  content: readonly ContentEntity[] = [],
): CharacterSheetModel {
  const entities = entityMap(content);
  const ruleGroups = new Map<string, SheetValue[]>();
  for (const rule of snapshot.selectedRules) {
    if (
      ![
        "Racial Trait",
        "Class Feature",
        "Feat",
        "Theme",
        "Background",
        "Paragon Path",
        "Epic Destiny",
        "Language",
      ].includes(rule.type)
    )
      continue;
    const entry: SheetValue = {
      label: rule.name,
      value: [
        rule.legality === "houserule" ? "House rule" : "",
        rule.description ?? "",
      ]
        .filter(Boolean)
        .join(" · "),
    };
    ruleGroups.set(rule.type, [...(ruleGroups.get(rule.type) ?? []), entry]);
  }
  const itemCards: SheetCard[] = snapshot.loot
    .filter((loot) => loot.showPowerCard)
    .map((loot) => {
      const element =
        [...loot.elements]
          .reverse()
          .find((candidate) => candidate.id !== undefined) ?? loot.elements[0];
      const entity =
        element?.id === undefined
          ? undefined
          : entities.get(element.id.toLocaleLowerCase());
      return {
        ...(element?.id === undefined ? {} : { id: element.id }),
        kind: "item" as const,
        name: loot.name,
        fields: [
          { label: "Quantity", value: String(loot.count) },
          ...entityFields(entity),
        ],
        ...(entity?.description === undefined || entity.description.length === 0
          ? {}
          : { description: entity.description }),
        ...(entity?.source === undefined ? {} : { source: entity.source }),
      };
    });
  const detail = snapshot.details;
  return {
    source: "legacy-cache",
    identity: [
      "name",
      "Level",
      "Race",
      "Class",
      "ParagonPath",
      "EpicDestiny",
      "Player",
      "Experience",
      "Company",
    ].flatMap((name) =>
      detail[name] === undefined || detail[name]?.length === 0
        ? []
        : [{ label: name, value: detail[name] ?? "" }],
    ),
    abilities: ABILITIES.flatMap((name) => {
      const score = snapshot.stats[name] ?? snapshot.abilities[name];
      return score === undefined ? [] : [{ label: name, value: String(score) }];
    }),
    defenses: values(snapshot.stats, ["AC", "Fortitude", "Reflex", "Will"]),
    resources: values(snapshot.stats, [
      "Hit Points",
      "Healing Surges",
      "Healing Surge Value",
      "Action Point",
      "Speed",
      "Initiative",
    ]),
    senses: values(snapshot.stats, ["Passive Insight", "Passive Perception"]),
    skills: values(snapshot.stats, SKILLS),
    features: [...ruleGroups].map(([group, entries]) => ({ group, entries })),
    powers: snapshot.powers.map((power) => powerCard(power, entities)),
    items: itemCards,
    notes: [
      "Traits",
      "Appearance",
      "Companions",
      "Notes",
      "CarriedMoney",
      "StoredMoney",
    ].flatMap((name) =>
      detail[name] === undefined || detail[name]?.length === 0
        ? []
        : [{ label: name, value: detail[name] ?? "" }],
    ),
  };
}
