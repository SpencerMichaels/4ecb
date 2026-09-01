import type {
  CharacterBuild,
  LegacyCharacterSnapshot,
  LegacyPowerSnapshot,
} from "@4ecb/character-domain";
import type { ContentEntity } from "@4ecb/content-domain";
import {
  aggregateInventory,
  applyFieldOverlays,
  type EvaluatedCharacter,
  type EvaluatedPower,
} from "@4ecb/rules-engine";

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
  readonly source: "legacy-cache" | "authoritative-evaluation";
  readonly identity: readonly SheetValue[];
  readonly abilities: readonly SheetValue[];
  readonly defenses: readonly SheetValue[];
  readonly resources: readonly SheetValue[];
  readonly senses: readonly SheetValue[];
  readonly skills: readonly SheetValue[];
  readonly equipment: readonly SheetValue[];
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

function field(entity: ContentEntity | undefined, name: string): string {
  return (
    entity?.specifics.find(
      (specific) =>
        specific.name.trim().toLocaleLowerCase() ===
        name.trim().toLocaleLowerCase(),
    )?.value ?? ""
  );
}

function evaluatedStat(
  evaluation: EvaluatedCharacter,
  name: string,
): string | undefined {
  const exact = evaluation.stats[name];
  const found =
    exact ??
    Object.entries(evaluation.stats).find(
      ([candidate]) =>
        candidate.trim().toLocaleLowerCase() ===
        name.trim().toLocaleLowerCase(),
    )?.[1];
  return found === undefined ? undefined : String(found.value);
}

function signed(value: number): string {
  return value >= 0 ? `+${value}` : String(value);
}

function evaluatedPowerCards(
  power: EvaluatedPower,
  entity: ContentEntity | undefined,
  evaluation: EvaluatedCharacter,
): SheetCard[] {
  const fields =
    entity === undefined ? {} : applyFieldOverlays(entity, evaluation.overlays);
  const commonFields: SheetValue[] = [
    ...Object.entries(fields)
      .filter(
        ([name, value]) =>
          value.length > 0 &&
          !["power usage", "action type", "keywords"].includes(
            name.toLocaleLowerCase(),
          ),
      )
      .map(([label, value]) => ({ label, value })),
    ...power.recoveries.map((recovery) => ({
      label: "Recovery",
      value: recovery.expression,
    })),
    ...(power.unsupported.length === 0
      ? []
      : [{ label: "Compatibility", value: power.unsupported.join("; ") }]),
  ];
  const variants = power.variants.length === 0 ? [undefined] : power.variants;
  return variants.map((variant) => ({
    id:
      variant === undefined
        ? power.definitionId
        : `${power.definitionId}:${variant.id}`,
    kind: "power",
    name:
      variant === undefined
        ? power.name
        : `${power.name} — ${variant.equipmentName}`,
    ...(power.usage === undefined ? {} : { usage: power.usage }),
    ...(power.actionType === undefined ? {} : { actionType: power.actionType }),
    ...(power.keywords.length === 0
      ? {}
      : { keywords: power.keywords.join(", ") }),
    ...(variant?.attackBonus === undefined
      ? {}
      : {
          attack: `${signed(variant.attackBonus)} vs ${variant.defense ?? "defense"}`,
        }),
    ...(variant?.damage === undefined ? {} : { damage: variant.damage }),
    fields: [
      ...commonFields,
      ...(variant?.damageType === undefined
        ? []
        : [{ label: "Damage type", value: variant.damageType }]),
      ...(variant?.critical === undefined
        ? []
        : [{ label: "Critical", value: variant.critical }]),
      ...(variant?.brutal === undefined
        ? []
        : [{ label: "Brutal", value: String(variant.brutal) }]),
    ],
    ...(entity?.description === undefined || entity.description.length === 0
      ? {}
      : { description: entity.description }),
    ...(entity?.source === undefined || entity.source.length === 0
      ? {}
      : { source: entity.source }),
  }));
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
    equipment: snapshot.loot.map((loot) => ({
      label: loot.name,
      value: [
        `× ${loot.count}`,
        loot.equippedCount > 0 ? `${loot.equippedCount} equipped` : "",
      ]
        .filter(Boolean)
        .join(" · "),
    })),
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

/** Build a sheet only from a converged rules evaluation and its exact content profile. */
export function buildEvaluatedSheetModel(
  snapshot: LegacyCharacterSnapshot,
  build: CharacterBuild,
  evaluation: EvaluatedCharacter,
  content: readonly ContentEntity[],
): CharacterSheetModel {
  if (!evaluation.converged)
    throw new Error("A nonconvergent evaluation cannot produce a sheet");

  const entities = entityMap(content);
  const active = evaluation.occurrences.flatMap((occurrence) => {
    const entity = entities.get(occurrence.definitionId.toLocaleLowerCase());
    return entity === undefined ? [] : [{ occurrence, entity }];
  });
  const identityDetails: Record<string, string> = {
    ...snapshot.details,
    Level: String(evaluation.level),
  };
  for (const [type, detailName] of [
    ["Race", "Race"],
    ["Class", "Class"],
    ["Theme", "Theme"],
    ["Paragon Path", "ParagonPath"],
    ["Epic Destiny", "EpicDestiny"],
  ] as const) {
    const selected = active.find(
      ({ entity }) =>
        entity.type.toLocaleLowerCase() === type.toLocaleLowerCase(),
    );
    if (selected !== undefined)
      identityDetails[detailName] = selected.entity.name;
  }

  const features = new Map<string, SheetValue[]>();
  const seenFeatures = new Set<string>();
  for (const { occurrence, entity } of active) {
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
      ].includes(entity.type) ||
      seenFeatures.has(entity.id)
    )
      continue;
    seenFeatures.add(entity.id);
    features.set(entity.type, [
      ...(features.get(entity.type) ?? []),
      {
        label: entity.name,
        value: [
          occurrence.legality === "houserule" ? "House rule" : "",
          field(entity, "Short Description") || entity.description,
        ]
          .filter(Boolean)
          .join(" · "),
      },
    ]);
  }

  const inventory = aggregateInventory(
    build.inventory.map((entry) => ({
      id: entry.id,
      ...(entry.name === undefined ? {} : { name: entry.name }),
      definitionIds: entry.elements.flatMap((element) =>
        element.definitionId === undefined ? [] : [element.definitionId],
      ),
      quantity: entry.quantity,
      equippedQuantity: entry.equippedQuantity,
      acquiredLevel: entry.acquiredLevel,
      overrides: entry.overrides,
    })),
    evaluation.level,
  );
  const itemCards: SheetCard[] = inventory.flatMap((entry) => {
    const original = build.inventory.find(
      (candidate) => candidate.id === entry.id,
    );
    if (original?.showPowerCard === false) return [];
    const entity = [...entry.definitionIds]
      .reverse()
      .map((id) => entities.get(id.toLocaleLowerCase()))
      .find((candidate) => candidate !== undefined);
    const preservedName = original?.elements
      .map((element) => element.name)
      .filter(Boolean)
      .join(" ");
    return [
      {
        ...(entity === undefined ? {} : { id: entity.id }),
        kind: "item" as const,
        name:
          entry.name ??
          original?.name ??
          (preservedName ||
            entry.definitionIds
              .map((id) => entities.get(id.toLocaleLowerCase())?.name ?? id)
              .join(" ")),
        fields: [
          { label: "Quantity", value: String(entry.quantity) },
          ...(entry.equippedQuantity === 0
            ? []
            : [
                {
                  label: "Equipped",
                  value: String(entry.equippedQuantity),
                },
              ]),
          ...entityFields(entity),
        ],
        ...(entity?.description === undefined || entity.description.length === 0
          ? {}
          : { description: entity.description }),
        ...(entity?.source === undefined || entity.source.length === 0
          ? {}
          : { source: entity.source }),
      },
    ];
  });

  const powerCards = evaluation.powers.flatMap((power) =>
    evaluatedPowerCards(
      power,
      entities.get(power.definitionId.toLocaleLowerCase()),
      evaluation,
    ),
  );
  const evaluatedValues = (names: readonly string[]) =>
    names.flatMap((name) => {
      const value = evaluatedStat(evaluation, name);
      return value === undefined ? [] : [{ label: name, value }];
    });

  return {
    source: "authoritative-evaluation",
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
      identityDetails[name] === undefined || identityDetails[name]?.length === 0
        ? []
        : [{ label: name, value: identityDetails[name] ?? "" }],
    ),
    abilities: ABILITIES.flatMap((name) => {
      const value =
        evaluatedStat(evaluation, name) ??
        build.baseAbilities[name] ??
        snapshot.abilities[name];
      return value === undefined ? [] : [{ label: name, value: String(value) }];
    }),
    defenses: evaluatedValues(["AC", "Fortitude", "Reflex", "Will"]),
    resources: evaluatedValues([
      "Hit Points",
      "Healing Surges",
      "Healing Surge Value",
      "Action Point",
      "Speed",
      "Initiative",
    ]),
    senses: evaluatedValues(["Passive Insight", "Passive Perception"]),
    skills: evaluatedValues(SKILLS),
    equipment: inventory.map((entry) => {
      const original = build.inventory.find(
        (candidate) => candidate.id === entry.id,
      );
      const preservedName = original?.elements
        .map((element) => element.name)
        .filter(Boolean)
        .join(" ");
      return {
        label:
          entry.name ??
          original?.name ??
          (preservedName ||
            entry.definitionIds
              .map((id) => entities.get(id.toLocaleLowerCase())?.name ?? id)
              .join(" ")),
        value: [
          `× ${entry.quantity}`,
          entry.equippedQuantity > 0
            ? `${entry.equippedQuantity} equipped`
            : "",
        ]
          .filter(Boolean)
          .join(" · "),
      };
    }),
    features: [...features].map(([group, entries]) => ({ group, entries })),
    powers: powerCards,
    items: itemCards,
    notes: [
      "Traits",
      "Appearance",
      "Companions",
      "Notes",
      "CarriedMoney",
      "StoredMoney",
    ].flatMap((name) =>
      identityDetails[name] === undefined || identityDetails[name]?.length === 0
        ? []
        : [{ label: name, value: identityDetails[name] ?? "" }],
    ),
  };
}
