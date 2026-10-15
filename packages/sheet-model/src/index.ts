import {
  detailsWithLegacyTextStrings,
  formatInventoryItemName,
  type CharacterBuild,
  type LegacyCharacterSnapshot,
  type LegacyLootSnapshot,
  type LegacyPowerSnapshot,
} from "@4ecb/character-domain";
import {
  isUserFacingSpecific,
  weaponPropertyText,
  type ContentEntity,
  type SpecificField,
} from "@4ecb/content-domain";
import {
  aggregateInventory,
  applyFieldOverlays,
  type EvaluatedCharacter,
  type EvaluatedPower,
} from "@4ecb/rules-engine";

import {
  featureClauseKey,
  irrelevantFeatureClauseNames,
} from "./power-feature-clauses";
import { withSheetOverview, type SheetOverview } from "./overview";
export type {
  SheetOverview,
  OverviewFeature,
  OverviewInventory,
} from "./overview";

export interface SheetValue {
  readonly label: string;
  readonly value: string;
}

export interface SheetCard {
  readonly id?: string;
  readonly kind: "power" | "item";
  readonly name: string;
  readonly itemType?: string;
  readonly baseItemType?: string;
  readonly usage?: string;
  readonly actionType?: string;
  readonly keywords?: string;
  readonly attack?: string;
  readonly damage?: string;
  readonly damageType?: string;
  readonly critical?: string;
  readonly brutal?: number;
  readonly fields: readonly SheetValue[];
  readonly flavor?: string;
  readonly prerequisites?: string;
  readonly description?: string;
  readonly source?: string;
  readonly variants?: readonly SheetPowerVariant[];
  /** Calculation diagnostics, never authored rules or physical-card sections. */
  readonly calculationWarnings?: readonly string[];
  readonly additionalEffects?: readonly SheetAdditionalEffect[];
}

export interface SheetAdditionalEffect {
  readonly text: string;
  readonly source: "authoritative-evaluation" | "legacy-cache";
  readonly provider?: string;
  readonly provenanceId?: string;
}

export type SheetLearnedReferenceKind =
  "ritual" | "alchemical-formula" | "martial-practice";

/** A learned rules reference, distinct from quantity-bearing physical gear. */
export interface SheetLearnedReference {
  readonly id?: string;
  readonly kind: SheetLearnedReferenceKind;
  readonly name: string;
  readonly quantity: number;
  readonly fields: readonly SheetValue[];
  readonly flavor?: string;
  readonly prerequisites?: string;
  readonly description?: string;
  readonly source?: string;
}

export interface SheetPowerVariant {
  readonly basicAttackTypes?: readonly ("melee" | "ranged")[];
  readonly id: string;
  readonly equipmentName: string;
  readonly equipped: boolean;
  readonly weaponDamage?: string;
  readonly hand?: "main" | "off";
  readonly pairedEquipmentName?: string;
  readonly ability?: string;
  readonly powerBonus?: number;
  readonly attack?: string;
  readonly attacks?: readonly SheetPowerAttack[];
  readonly damage?: string;
  readonly damageType?: string;
  readonly additionalEffects?: readonly SheetAdditionalEffect[];
}

export interface SheetPowerAttack {
  readonly id: string;
  readonly ordinal: number;
  readonly ability: string;
  readonly powerBonus: number;
  readonly attack: string;
  readonly target?: string;
  readonly damage?: string;
  readonly damageType?: string;
  readonly weaponRole?: "main" | "off";
  readonly eligible?: boolean;
}

export interface CharacterSheetModel {
  readonly overview?: SheetOverview;
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
  readonly learnedReferences: readonly SheetLearnedReference[];
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
        : [
            {
              label: field.name,
              value:
                field.name.trim().toLocaleLowerCase() === "properties"
                  ? weaponPropertyText(entity, field.value)
                  : field.value,
            },
          ],
    ) ?? []
  );
}

function fieldFromOverlay(
  entity: ContentEntity,
  name: string,
  value: string,
  ordinal: number,
): SpecificField {
  const authored = entity.specifics.find(
    (specific) =>
      specific.name.trim().toLocaleLowerCase() ===
      name.trim().toLocaleLowerCase(),
  );
  return {
    name,
    value,
    extraAttributes: authored?.extraAttributes ?? [],
    ordinal: authored?.ordinal ?? entity.specifics.length + ordinal,
  };
}

const INTERNAL_POWER_FIELD_NAMES = new Set([
  "class",
  "class id",
  "associated feat",
  "associated feat id",
  "associated theme",
  "associated theme id",
]);

function isUserFacingPowerField(field: SpecificField): boolean {
  return (
    isUserFacingSpecific(field) &&
    !INTERNAL_POWER_FIELD_NAMES.has(field.name.trim().toLocaleLowerCase())
  );
}

/**
 * Field overlays are returned as a name/value record, so rebuild the minimum
 * SpecificField shape before applying the canonical public-field predicate.
 * Object insertion order retains the entity's authored order; newly introduced
 * overlay fields follow the authored fields.
 */
function evaluatedEntityFields(
  entity: ContentEntity,
  evaluation: EvaluatedCharacter,
): SheetValue[] {
  const applied = applyFieldOverlays(entity, evaluation.overlays);
  const appliedByName = new Map(
    Object.entries(applied).map(([name, value]) => [
      name.trim().toLocaleLowerCase(),
      { name, value },
    ]),
  );
  const matchingOverlays = evaluation.overlays.filter((overlay) =>
    overlay.targetDefinitionIds.some(
      (id) => id.toLocaleLowerCase() === entity.id.toLocaleLowerCase(),
    ),
  );
  const overlaidNames = new Set(
    matchingOverlays.map((overlay) => overlay.field.trim().toLocaleLowerCase()),
  );
  const authored = [...entity.specifics].sort(
    (left, right) => left.ordinal - right.ordinal,
  );
  const lastAuthoredIndex = new Map<string, number>();
  authored.forEach((specific, index) =>
    lastAuthoredIndex.set(specific.name.trim().toLocaleLowerCase(), index),
  );
  const authoredFields = authored.flatMap((specific, index) => {
    const normalizedName = specific.name.trim().toLocaleLowerCase();
    const overlaid = appliedByName.get(normalizedName);
    const resolved =
      overlaidNames.has(normalizedName) &&
      lastAuthoredIndex.get(normalizedName) === index &&
      overlaid !== undefined
        ? { ...specific, name: overlaid.name, value: overlaid.value }
        : specific;
    return isUserFacingPowerField(resolved)
      ? [{ label: resolved.name, value: resolved.value }]
      : [];
  });
  const introducedFields = Object.entries(applied).flatMap(
    ([label, value], ordinal) => {
      if (lastAuthoredIndex.has(label.trim().toLocaleLowerCase())) return [];
      const specific = fieldFromOverlay(entity, label, value, ordinal);
      return isUserFacingPowerField(specific)
        ? [{ label: specific.name, value: specific.value }]
        : [];
    },
  );
  return [...authoredFields, ...introducedFields];
}

function entityPresentation(
  entity: ContentEntity | undefined,
): Pick<SheetCard, "flavor" | "prerequisites" | "description" | "source"> {
  if (entity === undefined) return {};
  const candidatePrerequisites =
    entity.printPrerequisites?.trim() || entity.prerequisites?.trim();
  const prerequisites =
    candidatePrerequisites !== undefined &&
    candidatePrerequisites.toLocaleLowerCase() !== "unselectable" &&
    isUserFacingSpecific({
      name: "Prerequisite",
      value: candidatePrerequisites,
      extraAttributes: [],
      ordinal: 0,
    })
      ? candidatePrerequisites
      : undefined;
  return {
    ...(entity.flavor === undefined || entity.flavor.trim().length === 0
      ? {}
      : { flavor: entity.flavor }),
    ...(prerequisites === undefined || prerequisites.length === 0
      ? {}
      : { prerequisites }),
    ...(entity.description.length === 0
      ? {}
      : { description: entity.description }),
    ...(entity.source.length === 0 ? {} : { source: entity.source }),
  };
}

function learnedReferenceKind(
  entity: ContentEntity | undefined,
  elementTypes: readonly string[],
): SheetLearnedReferenceKind | undefined {
  const type = entity?.type.trim().toLocaleLowerCase();
  if (type === "ritual scroll") return undefined;
  if (
    type !== "ritual" &&
    !elementTypes.some(
      (candidate) => candidate.trim().toLocaleLowerCase() === "ritual",
    )
  )
    return undefined;
  const subtype = field(entity, "Type").trim().toLocaleLowerCase();
  if (subtype === "alchemical formula") return "alchemical-formula";
  if (subtype === "martial practice") return "martial-practice";
  return "ritual";
}

function learnedReference(
  kind: SheetLearnedReferenceKind,
  name: string,
  quantity: number,
  entity: ContentEntity | undefined,
): SheetLearnedReference {
  return {
    ...(entity === undefined ? {} : { id: entity.id }),
    kind,
    name,
    quantity,
    fields: entityFields(entity),
    ...entityPresentation(entity),
  };
}

function legacyLootEntity(
  loot: LegacyLootSnapshot,
  entities: ReadonlyMap<string, ContentEntity>,
): ContentEntity | undefined {
  return [...loot.elements]
    .reverse()
    .flatMap((element) =>
      element.id === undefined
        ? []
        : [entities.get(element.id.toLocaleLowerCase())],
    )
    .find((entity) => entity !== undefined);
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
const ABILITY_ATTACK_OPTION_PATTERN = `(?:${ABILITY_PATTERN})(?:\\s*[+-]\\s*\\d+)?\\s+vs\\.?\\s+[A-Za-z]+`;
const ABILITY_ATTACK_OPTION_LIST_PATTERN = new RegExp(
  `\\b(${ABILITY_ATTACK_OPTION_PATTERN}(?:(?:\\s*,\\s*(?:(?:or|and)\\s+)?|\\s+(?:or|and)\\s+)${ABILITY_ATTACK_OPTION_PATTERN})+)`,
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
        .replace(ABILITY_ATTACK_OPTION_LIST_PATTERN, (match) => {
          const chosen = chooseAbility(match);
          if (chosen === undefined) return match;
          const options = [
            ...match.matchAll(new RegExp(ABILITY_ATTACK_OPTION_PATTERN, "gi")),
          ];
          return (
            options.find(([option]) =>
              new RegExp(`^${chosen.name}\\b`, "i").test(option),
            )?.[0] ?? match
          );
        })
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
  irrelevantFeatureClauses: ReadonlySet<string>,
  inventoryNames: ReadonlyMap<string, string>,
): SheetCard[] {
  // Older in-memory evaluations lack equipmentId but retain the exact native
  // power:inventory variant identity. Never join equipment by its display name.
  const legacyVariantNames = new Map(
    [...inventoryNames].map(([id, name]) => [
      `${power.definitionId}:${id}`,
      name,
    ]),
  );
  const commonFields: SheetValue[] = [
    ...(entity === undefined ? [] : evaluatedEntityFields(entity, evaluation))
      .filter(
        ({ label }) =>
          !irrelevantFeatureClauses.has(featureClauseKey(label)) &&
          !["power usage", "action type", "keywords"].includes(
            label.toLocaleLowerCase(),
          ),
      )
      .map(({ label, value }) => ({
        label,
        value: personalize(value),
      })),
  ];
  const variants: readonly SheetPowerVariant[] = power.variants.map(
    (variant) => ({
      id: variant.id,
      equipmentName:
        (variant.equipmentId === undefined
          ? undefined
          : inventoryNames.get(variant.equipmentId)) ??
        legacyVariantNames.get(variant.id) ??
        variant.equipmentName,
      ...(variant.basicAttackTypes === undefined
        ? {}
        : { basicAttackTypes: variant.basicAttackTypes }),
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
      ...(variant.attackStat === undefined
        ? {}
        : { ability: variant.attackStat }),
      powerBonus: variant.attacks?.[0]?.powerBonus ?? 0,
      ...((variant.attacks ?? []).length === 0
        ? {}
        : {
            attacks: (variant.attacks ?? []).map((attack) => ({
              id: attack.id,
              ordinal: attack.ordinal,
              ability: attack.attackStat,
              powerBonus: attack.powerBonus,
              attack: `${signed(attack.attackBonus)} vs ${attack.defense}`,
              ...(attack.target === undefined ? {} : { target: attack.target }),
              ...(attack.damage === undefined ? {} : { damage: attack.damage }),
              ...(attack.damageType === undefined
                ? {}
                : { damageType: attack.damageType }),
              ...(attack.weaponRole === undefined
                ? {}
                : { weaponRole: attack.weaponRole }),
              ...(attack.eligible === undefined
                ? {}
                : { eligible: attack.eligible }),
            })),
          }),
      ...(variant.damage === undefined ? {} : { damage: variant.damage }),
      ...(variant.damageType === undefined
        ? {}
        : { damageType: variant.damageType }),
      ...(variant.critical === undefined ? {} : { critical: variant.critical }),
      ...(variant.brutal === undefined ? {} : { brutal: variant.brutal }),
      additionalEffects: [
        ...(variant.additionalEffects ?? []).map((effect) => ({
          text: effect.text,
          source: "authoritative-evaluation" as const,
          provider: effect.source,
          ...(effect.provenanceId === undefined
            ? {}
            : { provenanceId: effect.provenanceId }),
        })),
        ...variant.conditionalDamage.map((effect) => ({
          text: `${effect.expression.startsWith("-") || effect.expression.startsWith("+") ? "" : "+"}${effect.expression} to damage ${effect.condition} (${effect.source}).`,
          source: "authoritative-evaluation" as const,
          provider: effect.source,
        })),
      ],
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
      ...(defaultVariant?.additionalEffects?.length
        ? { additionalEffects: defaultVariant.additionalEffects }
        : {}),
      fields: commonFields,
      ...(power.unsupported.length === 0
        ? {}
        : { calculationWarnings: power.unsupported }),
      ...entityPresentation(entity),
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
  const normalize = (value: string) => value.trim().toLocaleLowerCase();
  const mainHandName = Object.entries(snapshot.textStrings).find(
    ([name]) => normalize(name) === "_internal_mainhandweapon",
  )?.[1];
  const equippedWeapon = (candidate: LegacyPowerSnapshot["weapons"][number]) =>
    snapshot.loot.some(
      (item) =>
        item.equippedCount > 0 &&
        (normalize(item.name) === normalize(candidate.name) ||
          (candidate.definitionIds?.length &&
            candidate.definitionIds.every((id) =>
              item.elements.some(
                (element) => normalize(element.id ?? "") === normalize(id),
              ),
            ))),
    );
  const weapon =
    power.weapons.find(
      (candidate) =>
        mainHandName !== undefined &&
        normalize(candidate.name) === normalize(mainHandName) &&
        equippedWeapon(candidate),
    ) ??
    power.weapons.find(equippedWeapon) ??
    power.weapons[0];
  const attack =
    weapon?.attackBonus === undefined
      ? undefined
      : `+${weapon.attackBonus} vs ${weapon.defense ?? "defense"}`;
  const authoredAttack =
    field(entity, "Attack") || field(entity, "Primary Attack");
  const powerBonus = Number(authoredAttack.match(/\+\s*(\d+)/)?.[1] ?? 0);
  const variants: readonly SheetPowerVariant[] = power.weapons.map(
    (candidate, index) => ({
      id: `${power.id ?? power.name}:weapon-${index}`,
      equipmentName: candidate.name,
      equipped: equippedWeapon(candidate) || candidate === weapon,
      ...(candidate === weapon ? { hand: "main" as const } : {}),
      ...(candidate.attackStat === undefined
        ? {}
        : { ability: candidate.attackStat }),
      powerBonus,
      ...(candidate.attackBonus === undefined
        ? {}
        : {
            attack: `+${candidate.attackBonus} vs ${candidate.defense ?? "defense"}`,
          }),
      ...(candidate.damage === undefined ? {} : { damage: candidate.damage }),
      ...(candidate.conditions?.trim()
        ? {
            additionalEffects: [
              {
                text: candidate.conditions.trim(),
                source: "legacy-cache" as const,
              },
            ],
          }
        : {}),
    }),
  );
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
    ...(variants.length === 0 ? {} : { variants }),
    ...(variants.find((variant) => variant.hand === "main")
      ?.additionalEffects === undefined
      ? {}
      : {
          additionalEffects: variants.find(
            (variant) => variant.hand === "main",
          )!.additionalEffects,
        }),
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
    ...entityPresentation(entity),
    ...(entity?.description === undefined || entity.description.length === 0
      ? power.description === undefined
        ? {}
        : { description: power.description }
      : {}),
    ...(entity?.source === undefined || entity.source.length === 0
      ? power.source === undefined
        ? {}
        : { source: power.source }
      : {}),
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
  const lootPresentations = snapshot.loot.map((loot) => {
    const element =
      [...loot.elements]
        .reverse()
        .find((candidate) => candidate.id !== undefined) ?? loot.elements[0];
    const itemEntities = loot.elements.flatMap((candidate) => {
      const entity =
        candidate.id === undefined
          ? undefined
          : entities.get(candidate.id.toLocaleLowerCase());
      return entity === undefined ? [] : [entity];
    });
    const entity = itemEntities.at(-1) ?? legacyLootEntity(loot, entities);
    return {
      loot,
      element,
      entity,
      itemEntities,
      referenceKind: learnedReferenceKind(
        entity,
        loot.elements.map((candidate) => candidate.type),
      ),
    };
  });
  const itemCards: SheetCard[] = lootPresentations
    .filter(({ loot, referenceKind }) =>
      Boolean(loot.showPowerCard && referenceKind === undefined),
    )
    .map(({ loot, element, entity, itemEntities }) => {
      return {
        ...(element?.id === undefined ? {} : { id: element.id }),
        kind: "item" as const,
        name: loot.name,
        itemType: entity?.type ?? element?.type ?? "Item",
        baseItemType: itemEntities[0]?.type ?? loot.elements[0]?.type ?? "Item",
        fields: [
          { label: "Quantity", value: String(loot.count) },
          ...itemEntities.flatMap((candidate) => entityFields(candidate)),
        ],
        ...entityPresentation(entity),
      };
    });
  const learnedReferences = lootPresentations.flatMap(
    ({ loot, entity, referenceKind }) =>
      referenceKind === undefined
        ? []
        : [learnedReference(referenceKind, loot.name, loot.count, entity)],
  );
  const detail = detailsWithLegacyTextStrings(
    snapshot.details,
    snapshot.textStrings,
  );
  const model: CharacterSheetModel = {
    source: snapshot.source,
    identity: [
      "name",
      "Level",
      "Race",
      "Class",
      "Theme",
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
    equipment: lootPresentations.flatMap(({ loot, referenceKind }) =>
      referenceKind === undefined
        ? [
            {
              label: loot.name,
              value: [
                `× ${loot.count}`,
                loot.equippedCount > 0 ? `${loot.equippedCount} equipped` : "",
              ]
                .filter(Boolean)
                .join(" · "),
            },
          ]
        : [],
    ),
    features: [...ruleGroups].map(([group, entries]) => ({ group, entries })),
    powers: snapshot.powers.map((power) =>
      powerCard(power, entities, snapshot, keyAbilities, options),
    ),
    items: itemCards,
    learnedReferences,
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
  return withSheetOverview(model, {
    level: Number(detail.Level) || snapshot.levelCount || 1,
    stats: snapshot.stats,
    selections: snapshot.selectedRules,
    content,
    inventory: lootPresentations
      .filter(({ referenceKind }) => referenceKind === undefined)
      .map(({ loot }) => ({
        name: loot.name,
        quantity: loot.count,
        equipped: loot.equippedCount,
        slots: [],
        fields: loot.elements.flatMap((element) =>
          element.id
            ? entityFields(entities.get(element.id.toLocaleLowerCase()))
            : [],
        ),
      })),
  });
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
  const inventoryPresentations = inventory.map((entry) => {
    const original = build.inventory.find(
      (candidate) => candidate.id === entry.id,
    );
    const itemEntities =
      original?.elements.flatMap((element) => {
        const entity =
          element.definitionId === undefined
            ? undefined
            : entities.get(element.definitionId.toLocaleLowerCase());
        return entity === undefined ? [] : [entity];
      }) ?? [];
    const fallbackEntities = entry.definitionIds.flatMap((id) => {
      const entity = entities.get(id.toLocaleLowerCase());
      return entity === undefined ? [] : [entity];
    });
    const composedEntities =
      itemEntities.length === 0 ? fallbackEntities : itemEntities;
    const entity = composedEntities.at(-1);
    return {
      entry,
      original,
      entity,
      itemEntities: composedEntities,
      name: inventoryNames.get(entry.id) ?? "Unnamed item",
      referenceKind: learnedReferenceKind(
        entity,
        original?.elements.map((element) => element.type) ?? [],
      ),
    };
  });
  const itemCards: SheetCard[] = inventoryPresentations.flatMap(
    ({ entry, original, entity, itemEntities, name, referenceKind }) => {
      if (original?.showPowerCard === false || referenceKind !== undefined)
        return [];
      return [
        {
          ...(entity === undefined ? {} : { id: entity.id }),
          kind: "item" as const,
          name,
          itemType: entity?.type ?? original?.elements.at(-1)?.type ?? "Item",
          baseItemType:
            itemEntities[0]?.type ?? original?.elements[0]?.type ?? "Item",
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
            ...itemEntities.flatMap((candidate) => entityFields(candidate)),
          ],
          ...entityPresentation(entity),
        },
      ];
    },
  );
  const learnedReferences = inventoryPresentations.flatMap(
    ({ entry, entity, name, referenceKind }) =>
      referenceKind === undefined
        ? []
        : [learnedReference(referenceKind, name, entry.quantity, entity)],
  );

  const irrelevantFeatureClauses = irrelevantFeatureClauseNames(
    evaluation,
    content,
  );
  const powerCards = evaluation.powers.flatMap((power) =>
    evaluatedPowerCards(
      power,
      entities.get(power.definitionId.toLocaleLowerCase()),
      evaluation,
      personalizePowerText,
      irrelevantFeatureClauses,
      inventoryNames,
    ),
  );
  const evaluatedValues = (names: readonly string[]) =>
    names.flatMap((name) => {
      const value = evaluatedStat(evaluation, name);
      return value === undefined ? [] : [{ label: name, value }];
    });
  const evaluatedAliasedValues = (
    definitions: readonly (readonly [label: string, ...names: string[]])[],
  ) =>
    definitions.flatMap(([label, ...names]) => {
      const value = names
        .map((name) => evaluatedStat(evaluation, name))
        .find((candidate) => candidate !== undefined);
      return value === undefined ? [] : [{ label, value }];
    });

  const model: CharacterSheetModel = {
    source: "authoritative-evaluation",
    identity: [
      "name",
      "Level",
      "Race",
      "Class",
      "Theme",
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
    defenses: evaluatedAliasedValues([
      ["AC", "AC", "Armor Class"],
      ["Fortitude", "Fortitude Defense", "Fortitude"],
      ["Reflex", "Reflex Defense", "Reflex"],
      ["Will", "Will Defense", "Will"],
    ]),
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
    equipment: inventoryPresentations.flatMap(
      ({ entry, name, referenceKind }) =>
        referenceKind === undefined
          ? [
              {
                label: name,
                value: [
                  `× ${entry.quantity}`,
                  entry.equippedQuantity > 0
                    ? `${entry.equippedQuantity} equipped`
                    : "",
                ]
                  .filter(Boolean)
                  .join(" · "),
              },
            ]
          : [],
    ),
    features: [...features].map(([group, entries]) => ({ group, entries })),
    powers: powerCards,
    items: itemCards,
    learnedReferences,
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
  return withSheetOverview(model, {
    level: evaluation.level,
    evaluatedStats: evaluation.stats,
    occurrences: evaluation.occurrences,
    stats: Object.fromEntries(
      Object.entries(evaluation.stats).map(([name, stat]) => [
        name,
        String(stat.value),
      ]),
    ),
    selections: active.map(({ entity }) => ({
      id: entity.id,
      name: entity.name,
      type: entity.type,
    })),
    content,
    inventory: inventoryPresentations
      .filter(({ referenceKind }) => referenceKind === undefined)
      .map(({ entry, original, name, itemEntities }) => ({
        name,
        quantity: entry.quantity,
        equipped: entry.equippedQuantity,
        slots:
          original?.equippedSlots?.map((assignment) => assignment.slot) ?? [],
        fields: itemEntities.flatMap(entityFields),
      })),
  });
}
