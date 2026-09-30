import {
  detailsWithLegacyTextStrings,
  formatInventoryItemName,
  type CharacterBuild,
  type LegacyCharacterSnapshot,
  type LegacyPowerSnapshot,
} from "@4ecb/character-domain";
import { isUserFacingSpecific, type ContentEntity } from "@4ecb/content-domain";
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
  readonly damageType?: string;
  readonly critical?: string;
  readonly brutal?: number;
  readonly fields: readonly SheetValue[];
  readonly description?: string;
  readonly source?: string;
  readonly variants?: readonly SheetPowerVariant[];
}

export interface SheetPowerVariant {
  readonly id: string;
  readonly equipmentName: string;
  readonly equipped: boolean;
  readonly weaponDamage?: string;
  readonly hand?: "main" | "off";
  readonly pairedEquipmentName?: string;
  readonly attack?: string;
  readonly damage?: string;
}

export interface CharacterSheetModel {
  readonly source: "legacy-cache" | "native-empty" | "authoritative-evaluation";
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

export interface SheetModelOptions {
  readonly resolveAbilityChoices?: boolean;
}

function extendedLegacyNotes(
  textStrings: Readonly<Record<string, string>>,
): SheetValue[] {
  const fields = [
    ["Character Background", "NOTE_Character Background"],
    ["RPGA Notes", "NOTE_RPGA Notes"],
  ] as const;
  return fields.flatMap(([label, name]) => {
    const value = textStrings[name];
    return value === undefined || value.length === 0 ? [] : [{ label, value }];
  });
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
      field.value.length === 0 || !isUserFacingSpecific(field)
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

function classKeyAbilities(
  entity: ContentEntity | undefined,
): readonly string[] {
  const authored = field(entity, "Key Abilities");
  if (authored.length === 0) return [];
  const aliases = new Map<string, string>([
    ...ABILITIES.map(
      (ability) => [ability.toLocaleLowerCase(), ability] as const,
    ),
    ["str", "Strength"],
    ["con", "Constitution"],
    ["dex", "Dexterity"],
    ["int", "Intelligence"],
    ["wis", "Wisdom"],
    ["cha", "Charisma"],
  ]);
  const seen = new Set<string>();
  return [
    ...authored.matchAll(
      /\b(?:strength|str|constitution|con|dexterity|dex|intelligence|int|wisdom|wis|charisma|cha)\b/giu,
    ),
  ].flatMap(([value]) => {
    const ability = aliases.get(value.toLocaleLowerCase());
    if (ability === undefined || seen.has(ability)) return [];
    seen.add(ability);
    return [ability];
  });
}

function preferredClassEntity(
  entities: readonly ContentEntity[],
): ContentEntity | undefined {
  return (
    entities.find((entity) => entity.type.toLocaleLowerCase() === "class") ??
    entities.find(
      (entity) => entity.type.toLocaleLowerCase() === "hybrid class",
    )
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

type NumericStat = (name: string) => number | undefined;

interface AbilityPresentationContext {
  readonly modifier: NumericStat;
  readonly score: NumericStat;
  readonly keyAbilities: readonly string[];
}

const ABILITY_PATTERN = ABILITIES.join("|");
const ABILITY_CHOICE_LIST_PATTERN = `(?:your\\s+)?(?:${ABILITY_PATTERN})(?:(?:\\s*,\\s*(?:(?:or|and)\\s+)?|\\s+(?:or|and)\\s+|\\s*\\/\\s*)(?:your\\s+)?(?:${ABILITY_PATTERN}))+`;
const ABILITY_CHOICE_MODIFIER_PATTERN = new RegExp(
  `\\b(${ABILITY_CHOICE_LIST_PATTERN})\\s+modifier\\b`,
  "gi",
);
const ABILITY_CHOICE_ATTACK_PATTERN = new RegExp(
  `\\b(${ABILITY_CHOICE_LIST_PATTERN})(?=\\s+vs\\.?\\s)`,
  "gi",
);
const ABILITY_MODIFIER_PATTERN = new RegExp(
  `\\b(${ABILITY_PATTERN})\\s+modifier\\b(?!\\s*\\([+-]?\\d+\\))`,
  "gi",
);
const HALF_LEVEL_PATTERN =
  /\b(?:one[- ]half|half)(?:\s+your)?\s+level\b(?!\s*\([+-]?\d+\))|\b1\/2(?:\s+your)?\s+level\b(?!\s*\([+-]?\d+\))/gi;

function isAbilityChoice(text: string, start: number, length: number): boolean {
  const neighboringAbility = new RegExp(
    `(?:${ABILITY_PATTERN})(?:\\s+modifier)?(?:\\s*[,/]\\s*(?:(?:or|and)\\s*)?|\\s+(?:or|and)\\s+)$`,
    "i",
  );
  const followingAbility = new RegExp(
    `^\\s*(?:[,/]\\s*(?:(?:or|and)\\s*)?|(?:or|and)\\s+)(?:your\\s+)?(?:${ABILITY_PATTERN})\\b`,
    "i",
  );
  return (
    neighboringAbility.test(text.slice(0, start)) ||
    followingAbility.test(text.slice(start + length))
  );
}

function personalizePowerText(
  text: string,
  level: number,
  abilities: AbilityPresentationContext,
  resolveAbilityChoices: boolean,
): string {
  const chooseAbility = (
    list: string,
  ): { name: string; value: number } | undefined => {
    const mentions = [
      ...list.matchAll(new RegExp(`\\b(${ABILITY_PATTERN})\\b`, "gi")),
    ].map((match) =>
      ABILITIES.find(
        (ability) =>
          ability.toLocaleLowerCase() === match[1]?.toLocaleLowerCase(),
      ),
    );
    if (mentions.some((ability) => ability === undefined)) return undefined;
    const choices = mentions.map((name, authoredIndex) => ({
      name: name ?? "",
      value: abilities.modifier(`${name} modifier`),
      score: abilities.score(name ?? ""),
      keyIndex: abilities.keyAbilities.findIndex(
        (ability) => ability.toLocaleLowerCase() === name?.toLocaleLowerCase(),
      ),
      authoredIndex,
    }));
    if (choices.some(({ value }) => value === undefined)) return undefined;
    const best = choices.reduce<(typeof choices)[number] | undefined>(
      (best, choice) => {
        if (best === undefined) return choice;
        if (choice.value !== best.value)
          return (choice.value ?? 0) > (best.value ?? 0) ? choice : best;
        if (
          best.score !== undefined &&
          choice.score !== undefined &&
          choice.score !== best.score
        )
          return choice.score > best.score ? choice : best;
        const currentKeyIndex =
          best.keyIndex < 0 ? Number.POSITIVE_INFINITY : best.keyIndex;
        const choiceKeyIndex =
          choice.keyIndex < 0 ? Number.POSITIVE_INFINITY : choice.keyIndex;
        if (choiceKeyIndex !== currentKeyIndex)
          return choiceKeyIndex < currentKeyIndex ? choice : best;
        return choice.authoredIndex < best.authoredIndex ? choice : best;
      },
      undefined,
    );
    return best === undefined
      ? undefined
      : { name: best.name, value: best.value ?? 0 };
  };
  const resolvedChoices = resolveAbilityChoices
    ? text
        .replace(ABILITY_CHOICE_MODIFIER_PATTERN, (match, list: string) => {
          const chosen = chooseAbility(list);
          return chosen === undefined
            ? match
            : `${chosen.name} modifier (${signed(chosen.value)})`;
        })
        .replace(ABILITY_CHOICE_ATTACK_PATTERN, (match, list: string) => {
          const chosen = chooseAbility(list);
          return chosen === undefined
            ? match
            : `${chosen.name} (${signed(chosen.value)})`;
        })
    : text;
  const withAbilities = resolvedChoices.replace(
    ABILITY_MODIFIER_PATTERN,
    (match: string, ability: string, offset: number) => {
      if (isAbilityChoice(resolvedChoices, offset, match.length)) return match;
      const value = abilities.modifier(`${ability} modifier`);
      return value === undefined ? match : `${match} (${signed(value)})`;
    },
  );
  return withAbilities.replace(
    HALF_LEVEL_PATTERN,
    (match) => `${match} (${signed(Math.floor(level / 2))})`,
  );
}

/**
 * Creates the character-aware power-text formatter shared by the browser
 * detail cards and the printable character sheet.
 */
export function createEvaluatedPowerTextPersonalizer(
  evaluation: EvaluatedCharacter,
  content: readonly ContentEntity[],
  resolveAbilityChoices: boolean,
): (text: string) => string {
  const entities = entityMap(content);
  const activeEntities = evaluation.occurrences.flatMap((occurrence) => {
    const entity = entities.get(occurrence.definitionId.toLocaleLowerCase());
    return entity === undefined ? [] : [entity];
  });
  const numericStat = (name: string): number | undefined => {
    const raw = evaluatedStat(evaluation, name);
    if (raw === undefined) return undefined;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : undefined;
  };
  const abilities: AbilityPresentationContext = {
    modifier: numericStat,
    score: numericStat,
    keyAbilities: classKeyAbilities(preferredClassEntity(activeEntities)),
  };
  return (text) =>
    personalizePowerText(
      text,
      evaluation.level,
      abilities,
      resolveAbilityChoices,
    );
}

function evaluatedPowerCards(
  power: EvaluatedPower,
  entity: ContentEntity | undefined,
  evaluation: EvaluatedCharacter,
  personalize: (text: string) => string,
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
      .map(([label, value]) => ({
        label,
        value: personalize(value),
      })),
    ...power.recoveries.map((recovery) => ({
      label: "Recovery",
      value: recovery.expression,
    })),
    ...(power.unsupported.length === 0
      ? []
      : [{ label: "Compatibility", value: power.unsupported.join("; ") }]),
  ];
  const variants: readonly SheetPowerVariant[] = power.variants.map(
    (variant) => ({
      id: variant.id,
      equipmentName: variant.equipmentName,
      equipped: variant.equipped === true,
      ...(variant.weaponDamage === undefined
        ? {}
        : { weaponDamage: variant.weaponDamage }),
      ...(variant.hand === undefined ? {} : { hand: variant.hand }),
      ...(variant.pairedEquipmentName === undefined
        ? {}
        : { pairedEquipmentName: variant.pairedEquipmentName }),
      ...(variant.attackBonus === undefined
        ? {}
        : {
            attack: `${signed(variant.attackBonus)} vs ${variant.defense ?? "defense"}`,
          }),
      ...(variant.damage === undefined ? {} : { damage: variant.damage }),
      ...(variant.damageType === undefined
        ? {}
        : { damageType: variant.damageType }),
      ...(variant.critical === undefined ? {} : { critical: variant.critical }),
      ...(variant.brutal === undefined ? {} : { brutal: variant.brutal }),
    }),
  );
  const defaultVariant =
    variants.find((variant) => variant.equipped && variant.hand === "main") ??
    variants.find((variant) => variant.equipped) ??
    variants[0];
  return [
    {
      id: power.definitionId,
      kind: "power",
      name: power.name,
      ...(power.usage === undefined ? {} : { usage: power.usage }),
      ...(power.actionType === undefined
        ? {}
        : { actionType: power.actionType }),
      ...(power.keywords.length === 0
        ? {}
        : { keywords: power.keywords.join(", ") }),
      ...(defaultVariant?.attack === undefined
        ? {}
        : { attack: defaultVariant.attack }),
      ...(defaultVariant?.damage === undefined
        ? {}
        : { damage: defaultVariant.damage }),
      ...(variants.length === 0 ? {} : { variants }),
      fields: commonFields,
      ...(entity?.description === undefined || entity.description.length === 0
        ? {}
        : { description: entity.description }),
      ...(entity?.source === undefined || entity.source.length === 0
        ? {}
        : { source: entity.source }),
    },
  ];
}

function powerCard(
  power: LegacyPowerSnapshot,
  entities: Map<string, ContentEntity>,
  snapshot: LegacyCharacterSnapshot,
  keyAbilities: readonly string[],
  options: SheetModelOptions,
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
    fields: entityFields(entity)
      .filter(
        (field) =>
          !["Power Usage", "Action Type", "Keywords"].includes(field.label),
      )
      .map(({ label, value }) => ({
        label,
        value: personalizePowerText(
          value,
          snapshot.levelCount,
          {
            modifier: (name) => {
              const found = Object.entries(snapshot.stats).find(
                ([candidate]) =>
                  candidate.trim().toLocaleLowerCase() ===
                  name.trim().toLocaleLowerCase(),
              )?.[1];
              if (found !== undefined) {
                const parsed = Number(found);
                if (Number.isFinite(parsed)) return parsed;
              }
              const ability = ABILITIES.find(
                (candidate) =>
                  `${candidate} modifier`.toLocaleLowerCase() ===
                  name.toLocaleLowerCase(),
              );
              const score =
                ability === undefined ? undefined : snapshot.abilities[ability];
              return score === undefined
                ? undefined
                : Math.floor((score - 10) / 2);
            },
            score: (name) => {
              const found = Object.entries(snapshot.stats).find(
                ([candidate]) =>
                  candidate.trim().toLocaleLowerCase() ===
                  name.trim().toLocaleLowerCase(),
              )?.[1];
              const ability = ABILITIES.find(
                (candidate) =>
                  candidate.toLocaleLowerCase() === name.toLocaleLowerCase(),
              );
              const raw =
                found ??
                (ability === undefined
                  ? undefined
                  : snapshot.abilities[ability]);
              const parsed = Number(raw);
              return Number.isFinite(parsed) ? parsed : undefined;
            },
            keyAbilities,
          },
          options.resolveAbilityChoices === true,
        ),
      })),
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
  options: SheetModelOptions = {},
): CharacterSheetModel {
  const entities = entityMap(content);
  const selectedClassRule =
    snapshot.selectedRules.find(
      (rule) => rule.type.toLocaleLowerCase() === "class",
    ) ??
    snapshot.selectedRules.find(
      (rule) => rule.type.toLocaleLowerCase() === "hybrid class",
    );
  const selectedClass =
    selectedClassRule === undefined
      ? undefined
      : selectedClassRule.id === undefined
        ? preferredClassEntity(
            [...entities.values()].filter(
              (entity) =>
                entity.name.toLocaleLowerCase() ===
                selectedClassRule.name.toLocaleLowerCase(),
            ),
          )
        : entities.get(selectedClassRule.id.toLocaleLowerCase());
  const keyAbilities = classKeyAbilities(selectedClass);
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
  const detail = detailsWithLegacyTextStrings(
    snapshot.details,
    snapshot.textStrings,
  );
  return {
    source: snapshot.source,
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
    powers: snapshot.powers.map((power) =>
      powerCard(power, entities, snapshot, keyAbilities, options),
    ),
    items: itemCards,
    notes: [
      ...[
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
      ...extendedLegacyNotes(snapshot.textStrings),
    ],
  };
}

/** Build a sheet only from a converged rules evaluation and its exact content profile. */
export function buildEvaluatedSheetModel(
  snapshot: LegacyCharacterSnapshot,
  build: CharacterBuild,
  evaluation: EvaluatedCharacter,
  content: readonly ContentEntity[],
  options: SheetModelOptions = {},
): CharacterSheetModel {
  if (!evaluation.converged)
    throw new Error("A nonconvergent evaluation cannot produce a sheet");

  const entities = entityMap(content);
  const active = evaluation.occurrences.flatMap((occurrence) => {
    const entity = entities.get(occurrence.definitionId.toLocaleLowerCase());
    return entity === undefined ? [] : [{ occurrence, entity }];
  });
  const personalizePowerText = createEvaluatedPowerTextPersonalizer(
    evaluation,
    content,
    options.resolveAbilityChoices === true,
  );
  const identityDetails: Record<string, string> = {
    ...detailsWithLegacyTextStrings(snapshot.details, build.textStrings),
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
  const inventoryNames = new Map(
    inventory.map((entry) => {
      const original = build.inventory.find(
        (candidate) => candidate.id === entry.id,
      );
      const elements =
        original?.elements.map((element) => {
          const definition =
            element.definitionId === undefined
              ? undefined
              : entities.get(element.definitionId.toLocaleLowerCase());
          return {
            name: definition?.name ?? element.name,
            type: definition?.type ?? element.type,
          };
        }) ??
        entry.definitionIds.map((id) => {
          const definition = entities.get(id.toLocaleLowerCase());
          return {
            name: definition?.name ?? id,
            type: definition?.type ?? "",
          };
        });
      return [
        entry.id,
        formatInventoryItemName(elements, entry.name ?? original?.name),
      ] as const;
    }),
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
    return [
      {
        ...(entity === undefined ? {} : { id: entity.id }),
        kind: "item" as const,
        name: inventoryNames.get(entry.id) ?? "Unnamed item",
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
      personalizePowerText,
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
      return {
        label: inventoryNames.get(entry.id) ?? "Unnamed item",
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
      ...[
        "Traits",
        "Appearance",
        "Companions",
        "Notes",
        "CarriedMoney",
        "StoredMoney",
      ].flatMap((name) =>
        identityDetails[name] === undefined ||
        identityDetails[name]?.length === 0
          ? []
          : [{ label: name, value: identityDetails[name] ?? "" }],
      ),
      ...extendedLegacyNotes(build.textStrings),
    ],
  };
}
