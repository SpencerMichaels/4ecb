import { weaponPropertyText, type ContentEntity } from "@4ecb/content-domain";

import type { CharacterInventoryEntry, FieldOverlay } from "./evaluator";
import type { EvaluatedStat } from "./stats";

export interface PowerComponent {
  readonly label: string;
  readonly value: number;
  readonly source?: string;
  readonly provenanceId?: string;
}

export interface PowerVariant {
  readonly id: string;
  readonly equipmentName: string;
  readonly basicAttackTypes?: readonly ("melee" | "ranged")[];
  readonly definitionIds?: readonly string[];
  readonly equipped?: boolean;
  readonly weaponDamage?: string;
  readonly hand?: "main" | "off";
  readonly pairedEquipmentName?: string;
  readonly attackStat?: string;
  readonly defense?: string;
  readonly attackBonus?: number;
  readonly damage?: string;
  readonly damageType?: string;
  readonly critical?: string;
  readonly brutal?: number;
  readonly attackComponents: readonly PowerComponent[];
  readonly attacks?: readonly PowerAttack[];
  readonly damageComponents: readonly PowerComponent[];
  readonly conditionalDamage: readonly PowerConditionalDamage[];
  readonly additionalEffects?: readonly PowerAdditionalEffect[];
}

export interface PowerAdditionalEffect {
  readonly text: string;
  readonly source: string;
  readonly provenanceId?: string;
}

export interface PowerAttack {
  readonly id: string;
  readonly ordinal: number;
  readonly attackStat: string;
  readonly powerBonus: number;
  readonly defense: string;
  readonly attackBonus: number;
  readonly target?: string;
  readonly attackType?: string;
  readonly damage?: string;
  readonly damageType?: string;
  readonly damageComponents?: readonly PowerComponent[];
  readonly weaponRole?: "main" | "off";
  readonly eligible?: boolean;
  readonly attackComponents: readonly PowerComponent[];
}

export interface PowerConditionalDamage {
  readonly source: string;
  readonly expression: string;
  readonly condition: string;
}

export interface EvaluatedPower {
  readonly definitionId: string;
  readonly name: string;
  readonly usage?: string;
  readonly actionType?: string;
  readonly attackType?: string;
  readonly keywords: readonly string[];
  readonly variants: readonly PowerVariant[];
  readonly recoveries: readonly PowerRecovery[];
  readonly unsupported: readonly string[];
}

export interface PowerRecovery {
  readonly kind: "healing" | "healing-surge" | "temporary-hit-points";
  readonly expression: string;
}

interface Loadout {
  readonly id: string;
  readonly name: string;
  readonly definitionIds: readonly string[];
  readonly weaponDamage?: string;
  readonly proficiency: number;
  readonly enhancement: number;
  readonly critical?: string;
  readonly unarmed: boolean;
  readonly weaponDefinition: boolean;
  readonly implementDefinition: boolean;
  readonly equipped: boolean;
  readonly hand?: "main" | "off";
  readonly pairedEquipmentName?: string;
  readonly tags: readonly string[];
  readonly properties: readonly string[];
  readonly weaponCategory?: string;
  readonly rangedWeapon: boolean;
}

function key(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function field(entity: ContentEntity, name: string): string | undefined {
  return entity.specifics.find((specific) => key(specific.name) === key(name))
    ?.value;
}

function numericStat(
  stats: Readonly<Record<string, EvaluatedStat>>,
  name: string,
): number {
  const direct = stats[name]?.value;
  if (typeof direct === "number") return direct;
  const found = Object.entries(stats).find(
    ([candidate]) => key(candidate) === key(name),
  )?.[1].value;
  return typeof found === "number" ? found : 0;
}

function parseEnhancement(entity: ContentEntity | undefined): number {
  const match = field(entity ?? emptyEntity, "Enhancement")?.match(/\+(\d+)/);
  return match === undefined || match === null ? 0 : Number(match[1]);
}

const emptyEntity: ContentEntity = {
  id: "",
  name: "",
  type: "",
  source: "",
  sources: [],
  attributes: [],
  categories: [],
  specifics: [],
  rules: [],
  description: "",
  extensions: [],
  provenance: { sourceKey: "", sourceOrdinal: 0 },
};

function equipmentName(parts: readonly ContentEntity[]): string {
  const weapon = parts.find((entity) => key(entity.type) === "weapon");
  const magic = parts.find(
    (entity) =>
      key(entity.type) === "magic item" && parseEnhancement(entity) > 0,
  );
  if (weapon !== undefined && magic !== undefined) {
    return /weapon/i.test(magic.name)
      ? magic.name.replace(/weapon/i, weapon.name)
      : `${weapon.name} ${magic.name}`;
  }
  return parts.map((entity) => entity.name).join(" + ");
}

function loadouts(
  inventory: readonly CharacterInventoryEntry[],
  byId: ReadonlyMap<string, ContentEntity>,
  textStrings: Readonly<Record<string, string>>,
): readonly Loadout[] {
  const result: Loadout[] = [];
  for (const entry of inventory.filter((item) => item.quantity > 0)) {
    const parts = entry.definitionIds.flatMap((id) => {
      const entity = byId.get(key(id));
      return entity === undefined ? [] : [entity];
    });
    const weapon = parts.find((entity) => key(entity.type) === "weapon");
    const magic = parts.find(
      (entity) =>
        key(entity.type) === "magic item" && parseEnhancement(entity) > 0,
    );
    const magicType =
      magic === undefined ? "" : field(magic, "Magic Item Type");
    const implement = parts.find((entity) => {
      const itemType = field(entity, "Magic Item Type") ?? "";
      return (
        /(implement|holy symbol|ki focus|orb|rod|staff|tome|totem|wand)/i.test(
          itemType,
        ) || /^(holy symbol|ki focus)$/i.test(entity.name)
      );
    });
    if (weapon === undefined && implement === undefined) continue;
    const critical = field(magic ?? emptyEntity, "Critical");
    result.push({
      id: entry.id,
      name: entry.name ?? equipmentName(parts),
      definitionIds: entry.definitionIds,
      ...(weapon === undefined && !/staff/i.test(magicType ?? "")
        ? {}
        : {
            weaponDamage:
              entry.overrides?.Damage ??
              field(weapon ?? emptyEntity, "Damage") ??
              "1d8",
          }),
      proficiency:
        Number(field(weapon ?? emptyEntity, "Proficiency Bonus")) ||
        (/staff/i.test(magicType ?? "") ? 2 : 0),
      enhancement: parseEnhancement(magic),
      ...(critical ? { critical } : {}),
      unarmed: false,
      weaponDefinition: weapon !== undefined,
      implementDefinition: implement !== undefined,
      equipped: entry.equippedQuantity > 0,
      tags: [
        ...parts.map((entity) => entity.name),
        ...(weapon === undefined
          ? []
          : [
              field(weapon, "Group") ?? "",
              `${field(weapon, "Group") ?? ""} group`,
              field(weapon, "Item Slot") ?? "",
              field(weapon, "Hands Required") ?? "",
              ...(field(weapon, "Properties") ?? "").split(","),
            ]),
        magicType ?? "",
        ...(implement === undefined || !magicType
          ? []
          : [`${magicType} implement`]),
      ]
        .map(key)
        .filter(Boolean),
      properties: weaponPropertyText(
        weapon,
        field(weapon ?? emptyEntity, "Properties") ?? "",
      )
        .split(",")
        .map(key)
        .filter(Boolean),
      ...(weapon === undefined
        ? {}
        : { weaponCategory: key(field(weapon, "Weapon Category") ?? "") }),
      rangedWeapon: Boolean(field(weapon ?? emptyEntity, "Range")),
    });
  }
  result.push({
    id: "unarmed",
    name: "Unarmed",
    definitionIds: [],
    weaponDamage: "1d4",
    proficiency: 0,
    enhancement: 0,
    unarmed: true,
    weaponDefinition: false,
    implementDefinition: false,
    equipped: false,
    tags: ["unarmed"],
    properties: [],
    weaponCategory: "melee",
    rangedWeapon: false,
  });
  const mainHandName = Object.entries(textStrings).find(
    ([name]) => key(name) === "_internal_mainhandweapon",
  )?.[1];
  const mainIndex =
    mainHandName === undefined
      ? -1
      : result.findIndex(
          (item) => item.equipped && key(item.name) === key(mainHandName),
        );
  if (mainIndex < 0) return result;
  const handed = result.map((item, index): Loadout =>
    !item.equipped || (!item.weaponDefinition && !item.implementDefinition)
      ? item
      : { ...item, hand: index === mainIndex ? "main" : "off" },
  );
  return handed.map((item) => {
    if (item.hand === undefined) return item;
    const pairs = handed.filter(
      (candidate) =>
        candidate.hand !== undefined &&
        candidate.hand !== item.hand &&
        (item.weaponDefinition
          ? candidate.weaponDefinition
          : candidate.implementDefinition),
    );
    const pair = pairs.length === 1 ? pairs[0] : undefined;
    return pair === undefined
      ? item
      : { ...item, pairedEquipmentName: pair.name };
  });
}

function effectiveField(
  power: ContentEntity,
  name: string,
  overlays: readonly FieldOverlay[],
): string | undefined {
  let value = field(power, name);
  for (const overlay of overlays) {
    if (
      overlay.targetDefinitionIds.includes(power.id) &&
      key(overlay.field) === key(name)
    ) {
      if (overlay.value !== undefined) value = overlay.value;
      if (overlay.listAddition !== undefined)
        value = [value, overlay.listAddition].filter(Boolean).join(", ");
    }
  }
  return value;
}

function diceTimes(expression: string, multiplier: number): string {
  const match = expression.match(/^(\d+)d(\d+)$/i);
  return match === null
    ? expression
    : `${Number(match[1]) * multiplier}d${match[2]}`;
}

function formatDamage(dice: string, bonus: number): string {
  if (bonus === 0) return dice;
  return `${dice}${bonus > 0 ? "+" : ""}${bonus}`;
}

function nativeSpecialDamage(
  power: ContentEntity,
  hitLine: string | undefined,
  level: number,
):
  | {
      readonly dice?: string;
      readonly expression?: string;
      readonly ability?: string;
      readonly suppressAbility?: boolean;
      readonly abilityOnly?: boolean;
    }
  | undefined {
  // The legacy engine checks this exact power name before parsing its
  // conditional movement prose.
  if (key(power.name) === "bond of censure")
    return { dice: level >= 21 ? "2d10" : "1d10", suppressAbility: true };
  if (key(power.name) === "knockdown assault")
    return { dice: "", ability: "Strength", abilityOnly: true };

  const hit = key(hitLine ?? "");
  if (hit.startsWith("you deal damage based on the level of the rage power"))
    return { expression: "As Above" };
  if (
    hit === "the target takes ongoing 10 radiant damage (save ends)." ||
    hit ===
      "the target is stunned and takes ongoing 10 poison damage (save ends both)." ||
    hit.startsWith("ongoing 10 poison damage (save ends).")
  )
    return { expression: "ongoing 10" };
  if (
    hit ===
    "the target is slowed and takes ongoing damage equal to 10 + your dexterity modifier (save ends both)."
  )
    return { dice: "ongoing 10", ability: "Dexterity" };
  return undefined;
}

function unresolvedNativeSpecialCase(hitLine: string | undefined): boolean {
  const hit = key(hitLine ?? "");
  return (
    hit.startsWith("deal damage equal to your strength modifier,") ||
    hit ===
      "the target takes necrotic damage equal to the damage you took from the attack." ||
    hit ===
      "you take damage equal to your level, and the target takes 3d10 + constitution modifier damage plus extra damage equal to one-half your level." ||
    hit ===
      "you pull the target 4 squares, and it takes 4[w] + your charisma modifier psychic damage. the enemy then chooses either to be pushed 3 squares or to take a -2 penalty to attack rolls (save ends)." ||
    hit ===
      "whenever the target deals damage with an attack before the end of your next turn, it takes 15 force damage and is dazed until the end of your next turn."
  );
}

function hasCompanionAbilityDamage(hitLine: string | undefined): boolean {
  return /\b(?:your\s+)?beast(?:'s)?\s+(?:Strength|Constitution|Dexterity|Intelligence|Wisdom|Charisma)\s+modifier\b/i.test(
    hitLine ?? "",
  );
}

function withoutCompanionAbilityDamage(value: string): string {
  return value.replace(
    /\b(?:your\s+)?beast(?:'s)?\s+(?:Strength|Constitution|Dexterity|Intelligence|Wisdom|Charisma)\s+modifier\b/gi,
    "",
  );
}

function criticalExpression(
  equipment: Loadout,
  level: number,
): string | undefined {
  const parts = equipment.critical === undefined ? [] : [equipment.critical];
  if (
    equipment.weaponDamage !== undefined &&
    equipment.properties.includes("high crit")
  ) {
    const dice = diceTimes(
      equipment.weaponDamage,
      1 + Math.floor((Math.max(1, level) - 1) / 10),
    );
    parts.unshift(`+${dice} high crit damage`);
  }
  return parts.length === 0 ? undefined : parts.join("; ");
}

function recoveryExpressions(
  ...values: Array<string | undefined>
): PowerRecovery[] {
  const seen = new Set<string>();
  return values.flatMap((value) =>
    (value ?? "")
      .split(/(?<=[.!?])\s+|\n+/)
      .map((expression) => expression.trim())
      .filter(Boolean)
      .flatMap((expression) => {
        const kind = /temporary hit points/i.test(expression)
          ? "temporary-hit-points"
          : /healing surge/i.test(expression)
            ? "healing-surge"
            : /regain(?:s)?\s+(?:all of (?:your|his|her|their)\s+)?hit points/i.test(
                  expression,
                )
              ? "healing"
              : undefined;
        const identity = `${kind}\0${expression}`;
        if (kind === undefined || seen.has(identity)) return [];
        seen.add(identity);
        return [{ kind, expression }];
      }),
  );
}

function combatStatComponents(
  stats: Readonly<Record<string, EvaluatedStat>>,
  equipment: Loadout,
  powerName: string,
  kind: "weapon" | "implement",
  fieldName: "attack" | "damage",
  attackType: string | undefined,
): PowerComponent[] {
  const suffix = `${kind}:${fieldName}`;
  const attackTypeTags = (() => {
    const normalized = key(attackType ?? "");
    if (/melee\s+or\s+ranged/.test(normalized)) {
      if (equipment.weaponCategory?.includes("ranged")) return ["ranged"];
      if (equipment.weaponCategory?.includes("melee")) return ["melee"];
    }
    return ["melee", "ranged", "area", "close"].filter((candidate) =>
      new RegExp(`\\b${candidate}\\b`).test(normalized),
    );
  })();
  const powerTags = [
    key(powerName),
    key(powerName).replace(/\s+attack$/, ""),
    ...attackTypeTags,
  ].filter(Boolean);
  const relevant = Object.entries(stats).filter(([name]) => {
    const normalized = key(name);
    if (normalized === suffix) return true;
    if (normalized.endsWith(`,${suffix}`)) {
      const qualifier = normalized.slice(0, -suffix.length - 1);
      return (
        equipment.tags.includes(qualifier) ||
        (equipment.equipped &&
          (qualifier === "two-weapon" || qualifier === "two-melee-weapon"))
      );
    }
    if (
      [...equipment.tags, ...powerTags].some(
        (tag) => normalized === `${tag}:${fieldName}`,
      )
    )
      return true;
    // Conditional equipment predicates are encoded before the terminal stat
    // name (for example, two-melee-weapon:damage). By this stage the stat
    // accumulator has already decided whether the contribution applies.
    return equipment.equipped && normalized.endsWith(`-${suffix}`);
  });
  const seen = new Set<string>();
  return relevant.flatMap(([name, stat]) => {
    if (stat.contributions.length === 0)
      return typeof stat.value === "number" && stat.value !== 0
        ? [{ label: name, value: stat.value }]
        : [];
    return stat.contributions.flatMap((contribution) => {
      if (
        !contribution.applied ||
        contribution.numericValue === undefined ||
        seen.has(contribution.id)
      )
        return [];
      seen.add(contribution.id);
      return [
        {
          label: name,
          value: contribution.numericValue,
          source: contribution.providerName,
          provenanceId: contribution.id,
        },
      ];
    });
  });
}

function uniquePowerComponents(
  components: readonly PowerComponent[],
): PowerComponent[] {
  const seen = new Set<string>();
  return components.filter(({ provenanceId }) => {
    if (provenanceId === undefined) return true;
    if (seen.has(provenanceId)) return false;
    seen.add(provenanceId);
    return true;
  });
}

function powerWeaponSpecificBonuses(
  power: ContentEntity,
  equipment: Loadout,
  stats: Readonly<Record<string, EvaluatedStat>>,
): {
  readonly attack: readonly PowerComponent[];
  readonly damage: readonly PowerComponent[];
} {
  const clauses = power.specifics
    .filter((specific) => key(specific.name) === "weapon")
    .map((specific) => specific.value);
  const hasFamily = (families: readonly string[]) =>
    families.some((family) => equipment.tags.includes(family));
  const attack = clauses.flatMap((clause) => {
    if (
      !/bonus to the attack roll equal to one-half your Strength modifier/i.test(
        clause,
      ) ||
      !hasFamily(["axe", "flail", "heavy blade", "pick"])
    )
      return [];
    return [
      {
        label: "power weapon bonus",
        value: Math.floor(numericStat(stats, "Strength modifier") / 2),
        source: power.name,
      },
    ];
  });
  const damage = clauses.flatMap((clause) => {
    if (
      !/(?:attack deals extra damage|gain a bonus to the damage roll) equal to your Constitution modifier/i.test(
        clause,
      ) ||
      !hasFamily(["axe", "hammer", "mace"])
    )
      return [];
    return [
      {
        label: "Constitution modifier",
        value: numericStat(stats, "Constitution modifier"),
        source: power.name,
      },
    ];
  });
  return { attack, damage };
}

const abilityNames = [
  "Strength",
  "Constitution",
  "Dexterity",
  "Intelligence",
  "Wisdom",
  "Charisma",
] as const;

function highestAbility(
  stats: Readonly<Record<string, EvaluatedStat>>,
  preferred: readonly string[] = abilityNames,
): string {
  const candidates = preferred.filter((candidate) =>
    abilityNames.some((ability) => key(ability) === key(candidate)),
  );
  return (candidates.length === 0 ? abilityNames : candidates).reduce(
    (best, candidate) => {
      const candidateModifier = numericStat(stats, `${candidate} modifier`);
      const bestModifier = numericStat(stats, `${best} modifier`);
      if (candidateModifier !== bestModifier)
        return candidateModifier > bestModifier ? candidate : best;
      const candidateScore = numericStat(stats, candidate);
      const bestScore = numericStat(stats, best);
      return candidateScore > bestScore ? candidate : best;
    },
  );
}

interface AuthoredAttack {
  readonly ordinal: number;
  readonly line: string;
  readonly target?: string;
  readonly hit?: string;
  readonly attackType?: string;
}

const attackOrdinals = new Map([
  ["primary", 1],
  ["secondary", 2],
  ["tertiary", 3],
  ["quaternary", 4],
]);

function attackOrdinal(name: string): number | undefined {
  const match = name
    .trim()
    .match(/^(primary|secondary|tertiary|quaternary)\s+/i);
  return match?.[1] === undefined
    ? undefined
    : attackOrdinals.get(key(match[1]));
}

function authoredAttacks(
  power: ContentEntity,
  overlays: readonly FieldOverlay[],
): readonly AuthoredAttack[] {
  const attacks = new Map<number, string>();
  const targets = new Map<number, string>();
  const hits = new Map<number, string>();
  const attackTypes = new Map<number, string>();
  let activeOrdinal = 1;
  for (const specific of [...power.specifics].sort(
    (left, right) => left.ordinal - right.ordinal,
  )) {
    const name = specific.name.trim();
    let value = specific.value;
    for (const overlay of overlays) {
      if (
        overlay.targetDefinitionIds.includes(power.id) &&
        key(overlay.field) === key(name)
      ) {
        if (overlay.value !== undefined) value = overlay.value;
        if (overlay.listAddition !== undefined)
          value = [value, overlay.listAddition].filter(Boolean).join(", ");
      }
    }
    const namedOrdinal = attackOrdinal(name);
    if (namedOrdinal !== undefined) activeOrdinal = namedOrdinal;
    if (/targets?$/i.test(name) && value.trim().length > 0)
      targets.set(namedOrdinal ?? activeOrdinal, value.trim());
    if (/attack$/i.test(name) && /\bvs\.?\s+[A-Za-z]+/i.test(value))
      attacks.set(namedOrdinal ?? activeOrdinal, value.trim());
    if (/^(?:(?:primary|secondary|tertiary|quaternary)\s+)?hit$/i.test(name))
      hits.set(namedOrdinal ?? activeOrdinal, value.trim());
    if (/attack type$/i.test(name))
      attackTypes.set(namedOrdinal ?? activeOrdinal, value.trim());
  }
  return [...attacks.entries()]
    .sort(([left], [right]) => left - right)
    .map(([ordinal, line]) => {
      const target = targets.get(ordinal);
      const hit = hits.get(ordinal);
      const attackType = attackTypes.get(ordinal);
      return {
        ordinal,
        line,
        ...(target === undefined ? {} : { target }),
        ...(hit === undefined ? {} : { hit }),
        ...(attackType === undefined ? {} : { attackType }),
      };
    });
}

function classKeyAbilities(
  activeDefinitionIds: readonly string[],
  byId: ReadonlyMap<string, ContentEntity>,
): readonly string[] {
  const selectedClass = activeDefinitionIds
    .map((id) => byId.get(key(id)))
    .find((entity) => /^(?:hybrid )?class$/i.test(entity?.type ?? ""));
  const authored = field(selectedClass ?? emptyEntity, "Key Abilities") ?? "";
  const seen = new Set<string>();
  return [
    ...authored.matchAll(new RegExp(`\\b(${abilityNames.join("|")})\\b`, "gi")),
  ].flatMap((match) => {
    const ability = abilityNames.find(
      (candidate) => key(candidate) === key(match[1] ?? ""),
    );
    if (ability === undefined || seen.has(ability)) return [];
    seen.add(ability);
    return [ability];
  });
}

function powerBonusAtLevel(line: string, level: number): number {
  const firstLine = line.split("\n")[0] ?? line;
  let bonus = Number(
    firstLine.match(
      /(?:ability|strength|constitution|dexterity|intelligence|wisdom|charisma)\s*\+\s*(\d+)/i,
    )?.[1] ?? 0,
  );
  for (const match of line.matchAll(
    /(?:Level\s+)?(\d+)(?:st|nd|rd|th)?(?:\s+level)?\s*:\s*[^\n]*?\+\s*(\d+)|Increase\s+to\s+\+(\d+)\s+bonus\s+at\s+(\d+)(?:st|nd|rd|th)\s+level/gi,
  )) {
    const threshold = Number(match[1] ?? match[4]);
    const candidate = Number(match[2] ?? match[3]);
    if (threshold <= level && Number.isFinite(candidate)) bonus = candidate;
  }
  return bonus;
}

function lineAtLevel(
  value: string | undefined,
  level: number,
): string | undefined {
  if (value === undefined) return undefined;
  let selected = value.split("\n")[0];
  let selectedLevel = 0;
  for (const line of value.split("\n").slice(1)) {
    const match = line.match(/^Level\s+(\d+):\s*(.*)$/i);
    if (
      match?.[1] !== undefined &&
      match[2] !== undefined &&
      Number(match[1]) <= level &&
      Number(match[1]) >= selectedLevel
    ) {
      selectedLevel = Number(match[1]);
      selected = match[2];
    }
    const increase = line.match(
      /^Increase damage to\s+(.*?)\s+at\s+(\d+)(?:st|nd|rd|th)\s+level/i,
    );
    if (
      increase?.[1] !== undefined &&
      increase[2] !== undefined &&
      Number(increase[2]) <= level &&
      Number(increase[2]) >= selectedLevel
    ) {
      selectedLevel = Number(increase[2]);
      selected = increase[1];
    }
  }
  return selected;
}

const strikerFeatures = [
  {
    name: "Hunter's Quarry",
    standardId: "id_fmp_class_feature_602",
    hybridId: "id_fmp_class_feature_1530",
    hybridClassId: "id_fmp_class_5",
    condition: "once per round against your quarry",
  },
  {
    name: "Warlock's Curse",
    standardId: "id_fmp_class_feature_605",
    hybridId: "id_fmp_class_feature_1533",
    hybridClassId: "id_fmp_class_7",
    condition: "once per turn against a cursed target",
  },
  {
    name: "Sneak Attack",
    standardId: "id_fmp_class_feature_322",
    hybridId: "id_fmp_class_feature_1531",
    hybridClassId: "id_fmp_class_6",
    condition: "once per turn with combat advantage and an eligible weapon",
    weaponRestricted: true,
  },
] as const;

function textValue(
  values: Readonly<Record<string, string>>,
  name: string,
): string | undefined {
  return Object.entries(values).find(
    ([candidate]) => key(candidate) === key(name),
  )?.[1];
}

function sneakAttackWeapon(equipment: Loadout): boolean {
  return equipment.tags.some((tag) =>
    /^(?:crossbow|light blade|shortbow|sling)(?: group)?$/i.test(tag),
  );
}

function conditionalStrikerDamage(input: {
  readonly activeDefinitionIds: readonly string[];
  readonly stats: Readonly<Record<string, EvaluatedStat>>;
  readonly textStrings: Readonly<Record<string, string>>;
  readonly power: ContentEntity;
  readonly equipment: Loadout;
}): readonly PowerConditionalDamage[] {
  const activeIds = new Set(input.activeDefinitionIds.map(key));
  return strikerFeatures.flatMap((feature) => {
    const standard = activeIds.has(feature.standardId);
    const hybrid = activeIds.has(feature.hybridId);
    if (!standard && !hybrid) return [];
    if (
      hybrid &&
      !standard &&
      !input.power.categories.some(
        (category) => key(category) === feature.hybridClassId,
      )
    )
      return [];
    if (
      "weaponRestricted" in feature &&
      feature.weaponRestricted &&
      !sneakAttackWeapon(input.equipment)
    )
      return [];
    const dice = numericStat(input.stats, `${feature.name} Dice`);
    const flat = numericStat(input.stats, feature.name);
    if (dice <= 0 && flat === 0) return [];
    const die = textValue(input.textStrings, `${feature.name} Die`) ?? "d6";
    const diceExpression = dice > 0 ? `${dice}${die}` : "";
    const expression = [
      diceExpression,
      flat === 0 ? "" : `${flat > 0 && diceExpression ? "+" : ""}${flat}`,
    ].join("");
    return [{ source: feature.name, expression, condition: feature.condition }];
  });
}

/** Native CalcConditionals/InfoKeyword reminders, kept out of ordinary totals. */
function powerAdditionalEffects(input: {
  readonly stats: Readonly<Record<string, EvaluatedStat>>;
  readonly power: ContentEntity;
  readonly equipment: Loadout;
  readonly keywords: readonly string[];
  readonly attackType?: string;
  readonly attackStat: string;
  readonly defense: string;
  readonly hasAttack: boolean;
  readonly damage?: string;
  readonly byId: ReadonlyMap<string, ContentEntity>;
}): readonly PowerAdditionalEffect[] {
  const tags = new Set([
    ...input.keywords.map(key),
    ...input.equipment.tags,
    ...input.equipment.properties,
    key(input.power.name),
    ...input.power.categories.map(key),
    key(field(input.power, "Class") ?? ""),
    key(field(input.power, "Class ID") ?? ""),
    key(field(input.power, "Power Usage") ?? ""),
    key(input.attackStat),
    key(input.defense),
    ...["melee", "ranged", "close", "area"].filter((tag) =>
      new RegExp(`\\b${tag}\\b`, "i").test(input.attackType ?? ""),
    ),
  ]);
  if (/melee\s+or\s+ranged/i.test(input.attackType ?? "")) {
    tags.delete(input.equipment.rangedWeapon ? "melee" : "ranged");
  }
  const basicAttack =
    /^(?:Melee|Ranged) Basic Attack$/i.test(input.power.name) ||
    Boolean(field(input.power, "_BasicAttack"));
  if (basicAttack) {
    tags.add("basic");
    tags.add(`${tags.has("ranged") ? "ranged" : "melee"} basic`);
  }
  const damageRoll = /\d+d\d+/i.test(input.damage ?? "");
  const globals = new Map([
    ["attack rolls", "attack"],
    ["damage", "damage"],
    ["damage rolls", "damage-roll"],
    [
      "weapon attack rolls",
      tags.has("weapon") && !input.equipment.unarmed ? "attack" : "none",
    ],
    [
      "weapon damage rolls",
      tags.has("weapon") && !input.equipment.unarmed ? "damage-roll" : "none",
    ],
  ]);
  const seen = new Set<string>();
  return Object.entries(input.stats).flatMap(([name, stat]) => {
    const normalized = key(name);
    const qualified = normalized.match(
      /^(.*):(attack|damage|damage-roll|info)(?:\((.*)\))?$/,
    );
    const kind = globals.get(normalized) ?? qualified?.[2];
    if (kind === undefined || kind === "none") return [];
    if (kind === "attack" && !input.hasAttack) return [];
    if (kind === "damage" && input.damage === undefined) return [];
    if (kind === "damage-roll" && !damageRoll) return [];
    // Native comma keywords are a conjunction; parenthesized limits name the
    // selected weapon/base/enchantment, not another owned inventory variant.
    if (qualified !== null && qualified !== undefined) {
      if (!qualified[1]?.split(",").every((tag) => tags.has(key(tag))))
        return [];
      const limiter = qualified[3];
      if (
        limiter !== undefined &&
        !input.equipment.definitionIds.some(
          (id) => key(input.byId.get(key(id))?.name ?? "") === limiter,
        )
      )
        return [];
    }
    return stat.contributions.flatMap((contribution) => {
      const identity = `${contribution.id}:${kind === "damage-roll" ? "damage" : kind}`;
      if (seen.has(identity) || contribution.reason === "equipment") return [];
      if (
        !basicAttack &&
        (/opportunity attack/i.test(contribution.condition ?? "") ||
          /^(?:on any successful charge|when you charge)$/i.test(
            contribution.condition ?? "",
          ))
      )
        return [];
      if (kind === "info") {
        if (!contribution.applied && contribution.reason !== "conditional")
          return [];
        const text = contribution.value.trim();
        if (!text) return [];
        seen.add(identity);
        return [
          {
            text,
            source: contribution.providerName,
            provenanceId: contribution.id,
          },
        ];
      }
      if (contribution.reason !== "conditional" || !contribution.condition)
        return [];
      const value = contribution.numericValue;
      if (value === 0) return [];
      const amount =
        value === undefined
          ? contribution.value
          : `${value > 0 ? "+" : ""}${value}`;
      const bonus =
        contribution.bonusType === undefined
          ? ""
          : ` ${contribution.bonusType} bonus`;
      const text = `${amount}${bonus} to ${kind === "attack" ? "attack rolls" : "damage rolls"} ${contribution.condition} - ${contribution.providerName}.`;
      seen.add(identity);
      return [
        {
          text,
          source: contribution.providerName,
          provenanceId: contribution.id,
        },
      ];
    });
  });
}

export function evaluatePowers(input: {
  readonly level: number;
  readonly activeDefinitionIds: readonly string[];
  readonly inventory: readonly CharacterInventoryEntry[];
  readonly stats: Readonly<Record<string, EvaluatedStat>>;
  readonly overlays: readonly FieldOverlay[];
  readonly textStrings?: Readonly<Record<string, string>>;
  readonly entities: readonly ContentEntity[];
}): readonly EvaluatedPower[] {
  const byId = new Map(
    input.entities.map((entity) => [key(entity.id), entity]),
  );
  const equipped = loadouts(input.inventory, byId, input.textStrings ?? {});
  const versatileUsedTwoHanded =
    Number(
      textValue(input.textStrings ?? {}, "_INTERNAL_VersatileUsedTwoHanded"),
    ) !== 0;
  const activePowerIds = [
    ...new Set(
      input.activeDefinitionIds.flatMap((definitionId) => {
        const power = byId.get(key(definitionId));
        const versions = field(power ?? emptyEntity, "_AugmentVersions")
          ?.split(",")
          .map((value) => value.trim())
          .filter(Boolean);
        return versions === undefined || versions.length === 0
          ? [definitionId]
          : versions;
      }),
    ),
  ];
  return activePowerIds.flatMap((definitionId) => {
    const power = byId.get(key(definitionId));
    if (power === undefined || key(power.type) !== "power") return [];
    const keywords = (effectiveField(power, "Keywords", input.overlays) ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const attackType = effectiveField(power, "Attack Type", input.overlays);
    const attackDefinitions = authoredAttacks(power, input.overlays);
    const attackLine = attackDefinitions[0]?.line;
    const hitLine = lineAtLevel(
      attackDefinitions[0]?.hit ?? effectiveField(power, "Hit", input.overlays),
      input.level,
    );
    const effectLine = effectiveField(power, "Effect", input.overlays);
    const hasAttack = /\bvs\.?\s+[A-Za-z]+/i.test(attackLine ?? "");
    const recoveries = recoveryExpressions(hitLine, effectLine);
    const weaponPower = keywords.some((value) => key(value) === "weapon");
    const implementPower = keywords.some((value) => key(value) === "implement");
    const effectOnlyCalculation = !hasAttack && effectLine !== undefined;
    const candidates = !hasAttack
      ? effectOnlyCalculation
        ? weaponPower
          ? equipped.filter(
              (item) => item.weaponDamage !== undefined || item.unarmed,
            )
          : implementPower
            ? equipped
            : equipped.filter((item) => item.unarmed)
        : []
      : weaponPower
        ? equipped.filter(
            (item) => item.weaponDamage !== undefined || item.unarmed,
          )
        : implementPower
          ? equipped
          : equipped.filter((item) => item.unarmed);
    // Legacy PowerStats retains every legal equipment variant even for prose
    // that names one hand. The saved main-hand selection describes the active
    // pairing; it must not erase the alternate variants a user can select.
    const handCandidates = candidates;
    const hasDualImplementSpellcaster = input.activeDefinitionIds.some((id) => {
      const entity = byId.get(key(id));
      return (
        key(id) === "id_fmp_feat_1127" ||
        key(entity?.name ?? "") === "dual implement spellcaster"
      );
    });
    const preferredAbilities = classKeyAbilities(
      input.activeDefinitionIds,
      byId,
    );
    const variants = handCandidates.map((equipment): PowerVariant => {
      const weaponSpecific = powerWeaponSpecificBonuses(
        power,
        equipment,
        input.stats,
      );
      const explicitAbilityChoice = abilityNames.find((ability) =>
        input.activeDefinitionIds.some((definitionId) => {
          const choice = byId.get(key(definitionId));
          return key(choice?.name ?? "") === key(`${power.name} ${ability}`);
        }),
      );
      const calculatedAttacks = (
        attackDefinitions.length === 0
          ? [{ ordinal: 1, line: "" } as AuthoredAttack]
          : attackDefinitions
      ).map((definition): PowerAttack => {
        const phaseAttackType = definition.attackType ?? attackType;
        const phaseAlternatives = /\(melee[^]*\sor\s[^]*\(ranged/i.test(
          definition.line,
        )
          ? definition.line.split(/\s+or\s+/i)
          : undefined;
        const authoredLine =
          phaseAlternatives !== undefined && phaseAlternatives.length > 1
            ? ((equipment.rangedWeapon
                ? phaseAlternatives.at(-1)
                : phaseAlternatives[0]) ?? definition.line)
            : definition.line;
        const attack = authoredLine.match(/^(.*?)\s+vs\.?\s+([A-Za-z]+)/i);
        const attackLeft = attack?.[1] ?? "";
        const availableAbilities = abilityNames.filter((ability) =>
          new RegExp(`\\b${ability}\\b`, "i").test(authoredLine),
        );
        const selectedAbilityForAttack =
          explicitAbilityChoice !== undefined &&
          (new RegExp(`\\b${explicitAbilityChoice}\\b`, "i").test(
            authoredLine,
          ) ||
            /primary ability/i.test(attackLeft))
            ? explicitAbilityChoice
            : undefined;
        let attackStat =
          selectedAbilityForAttack ??
          (availableAbilities.length > 0
            ? highestAbility(input.stats, availableAbilities)
            : /primary ability/i.test(attackLeft)
              ? highestAbility(input.stats, preferredAbilities)
              : "Unknown");
        if (
          weaponPower &&
          /^ranged\b/i.test(phaseAttackType ?? "") &&
          attackStat === "Dexterity" &&
          equipment.properties.includes("heavy thrown")
        )
          attackStat = "Strength";
        const defense = attack?.[2] ?? "Unknown";
        const attackComponents: PowerComponent[] = [
          {
            label: `${attackStat} modifier`,
            value: numericStat(input.stats, `${attackStat} modifier`),
          },
          { label: "half your level", value: Math.floor(input.level / 2) },
        ];
        if (weaponPower && equipment.proficiency !== 0)
          attackComponents.push({
            label: "proficiency bonus",
            value: equipment.proficiency,
          });
        if (equipment.enhancement !== 0)
          attackComponents.push({
            label: "enhancement bonus",
            value: equipment.enhancement,
          });
        attackComponents.push(
          ...combatStatComponents(
            input.stats,
            equipment,
            power.name,
            weaponPower ? "weapon" : "implement",
            "attack",
            phaseAttackType,
          ),
        );
        if (implementPower && equipment.weaponDefinition)
          attackComponents.push(
            ...combatStatComponents(
              input.stats,
              equipment,
              power.name,
              "weapon",
              "attack",
              phaseAttackType,
            ).filter(({ provenanceId }) =>
              provenanceId?.endsWith(":legacy-focused-expertise"),
            ),
          );
        const powerBonus = powerBonusAtLevel(authoredLine, input.level);
        if (powerBonus !== 0)
          attackComponents.push({
            label: "power attack bonus",
            value: powerBonus,
          });
        attackComponents.push(...weaponSpecific.attack);
        return {
          id: `${power.id}:attack-${definition.ordinal}`,
          ordinal: definition.ordinal,
          attackStat,
          powerBonus,
          defense,
          attackBonus: attackComponents.reduce(
            (sum, component) => sum + component.value,
            0,
          ),
          ...(definition.target === undefined
            ? {}
            : { target: definition.target }),
          ...(phaseAttackType === undefined
            ? {}
            : { attackType: phaseAttackType }),
          attackComponents,
        };
      });
      const primaryAttack = calculatedAttacks[0];
      const attackStat = primaryAttack?.attackStat ?? "Unknown";
      const defense = primaryAttack?.defense ?? "Unknown";
      const attackComponents = primaryAttack?.attackComponents ?? [];

      const calculateDamage = (
        hitLine: string | undefined,
        attackStat: string,
        attackType: string | undefined,
      ): Pick<
        PowerVariant,
        "damage" | "damageType" | "damageComponents" | "conditionalDamage"
      > => {
        const hitClauses = /\(melee[^]*\sor\s[^]*\(ranged/i.test(hitLine ?? "")
          ? (hitLine ?? "").split(/\s+or\s+/i)
          : [hitLine ?? ""];
        const selectedHitClause =
          hitClauses.length > 1
            ? equipment.rangedWeapon
              ? hitClauses.at(-1)
              : hitClauses[0]
            : hitLine;
        const damageComponents: PowerComponent[] = [];
        const specialDamage = nativeSpecialDamage(power, hitLine, input.level);
        const weaponMatch = selectedHitClause?.match(/(\d+)\[W\]/i);
        const fixedMatch = selectedHitClause?.match(/(\d+d\d+)/i);
        const dice =
          specialDamage?.dice ??
          (weaponMatch !== null && weaponMatch !== undefined
            ? [
                diceTimes(
                  equipment.weaponDamage ?? "1d4",
                  Number(weaponMatch[1]),
                ),
                key(power.name) === "howling strike"
                  ? fixedMatch?.[1]
                  : undefined,
              ]
                .filter(Boolean)
                .join("+")
            : fixedMatch?.[1]);
        const ongoing = /\bongoing\b/i.test(hitLine ?? "");
        const primaryDamageClause = withoutCompanionAbilityDamage(
          (selectedHitClause ?? "").split(/\bdamage\b/i)[0] ?? "",
        );
        let damageAbilities: readonly string[] = abilityNames.filter(
          (ability) =>
            new RegExp(`\\b${ability} modifier\\b`, "i").test(
              primaryDamageClause,
            ),
        );
        if (
          damageAbilities.length === 0 &&
          /\bability modifier\b/i.test(primaryDamageClause)
        )
          damageAbilities = [attackStat];
        const listedAbilities = abilityNames.filter((ability) =>
          new RegExp(`\\b${ability}\\b`, "i").test(primaryDamageClause),
        );
        if (damageAbilities.length === 0 && listedAbilities.length > 1)
          damageAbilities = [attackStat];
        if (
          equipment.properties.includes("heavy thrown") &&
          attackStat === "Strength" &&
          damageAbilities.length === 1 &&
          damageAbilities[0] === "Dexterity"
        )
          damageAbilities = ["Strength"];
        const additiveAbilities = specialDamage?.ability
          ? [specialDamage.ability]
          : specialDamage?.suppressAbility
            ? []
            : /\bor\b/i.test(primaryDamageClause)
              ? listedAbilities.includes(
                  attackStat as (typeof abilityNames)[number],
                )
                ? [attackStat]
                : damageAbilities.slice(0, 1)
              : damageAbilities;
        if (dice !== undefined)
          damageComponents.push(
            ...additiveAbilities.map((ability) => ({
              label: `${ability} modifier`,
              value: numericStat(input.stats, `${ability} modifier`),
            })),
          );
        if (
          dice !== undefined &&
          !specialDamage?.abilityOnly &&
          equipment.enhancement !== 0
        )
          damageComponents.push({
            label: "enhancement bonus",
            value: equipment.enhancement,
          });
        if (dice !== undefined) damageComponents.push(...weaponSpecific.damage);
        const offHandImplements = handCandidates.filter(
          (candidate) =>
            candidate.hand === "off" &&
            candidate.equipped &&
            candidate.implementDefinition,
        );
        const pairedImplement =
          implementPower &&
          hasDualImplementSpellcaster &&
          equipment.hand === "main" &&
          offHandImplements.length === 1
            ? offHandImplements[0]
            : undefined;
        if (
          dice !== undefined &&
          !specialDamage?.abilityOnly &&
          (pairedImplement?.enhancement ?? 0) !== 0
        )
          damageComponents.push({
            label: "off-hand implement enhancement bonus",
            value: pairedImplement?.enhancement ?? 0,
            source: "Dual Implement Spellcaster",
          });
        if (dice !== undefined && !specialDamage?.abilityOnly)
          damageComponents.push(
            ...combatStatComponents(
              input.stats,
              equipment,
              power.name,
              weaponPower ? "weapon" : "implement",
              "damage",
              attackType,
            ),
          );
        if (
          dice !== undefined &&
          weaponPower &&
          equipment.properties.includes("versatile") &&
          versatileUsedTwoHanded
        )
          damageComponents.push({
            label: "versatile weapon used two-handed",
            value: 1,
          });
        if (
          dice !== undefined &&
          !specialDamage?.abilityOnly &&
          implementPower &&
          equipment.weaponDefinition
        )
          damageComponents.push(
            ...combatStatComponents(
              input.stats,
              equipment,
              power.name,
              "weapon",
              "damage",
              attackType,
            ),
          );
        const powerDamageBonus = Number(
          selectedHitClause?.match(
            /\+\s*(\d+)\s+(?:[a-z]+\s+)*damage\b/i,
          )?.[1] ?? 0,
        );
        if (
          dice !== undefined &&
          !specialDamage?.abilityOnly &&
          powerDamageBonus !== 0
        )
          damageComponents.push({
            label: "power damage bonus",
            value: powerDamageBonus,
          });
        const uniqueDamageComponents = uniquePowerComponents(damageComponents);
        const damageBonus = uniqueDamageComponents.reduce(
          (sum, component) => sum + component.value,
          0,
        );
        const conditionalDamage: readonly PowerConditionalDamage[] = [
          ...(key(power.name) === "call of the beast"
            ? [
                {
                  source: power.name,
                  expression: String(
                    (input.level >= 21 ? 10 : 5) +
                      numericStat(input.stats, "Wisdom modifier"),
                  ),
                  condition:
                    "on its next turn when the target attacks without including your ally nearest to it",
                },
              ]
            : []),
          ...(dice === undefined
            ? []
            : conditionalStrikerDamage({
                activeDefinitionIds: input.activeDefinitionIds,
                stats: input.stats,
                textStrings: input.textStrings ?? {},
                power,
                equipment,
              })),
        ];
        const primaryDamageText =
          (selectedHitClause ?? "").split(/\bdamage\b/i)[0] ?? "";
        const damageType = primaryDamageText.match(
          /\b(?:acid|cold|fire|force|lightning|necrotic|poison|psychic|radiant|thunder)(?:\s*(?:,|and|or)\s*(?:acid|cold|fire|force|lightning|necrotic|poison|psychic|radiant|thunder))*\b/i,
        )?.[0];
        return {
          ...(specialDamage?.expression !== undefined
            ? { damage: specialDamage.expression }
            : dice === undefined
              ? ongoing
                ? { damage: "Ongoing" }
                : {}
              : {
                  damage: specialDamage?.abilityOnly
                    ? String(damageBonus)
                    : formatDamage(dice, damageBonus),
                }),
          ...(damageType === undefined ? {} : { damageType: key(damageType) }),
          damageComponents: uniqueDamageComponents,
          conditionalDamage,
        };
      };
      const damage = calculateDamage(hitLine, attackStat, attackType);
      const attacks =
        attackDefinitions.length === 0
          ? []
          : calculatedAttacks.map((attack): PowerAttack => {
              const definition = attackDefinitions.find(
                (candidate) => candidate.ordinal === attack.ordinal,
              );
              const phaseHit = lineAtLevel(definition?.hit, input.level);
              const phaseDamage =
                attack.ordinal === 1 &&
                phaseHit === hitLine &&
                attack.attackType === attackType
                  ? damage
                  : calculateDamage(
                      phaseHit,
                      attack.attackStat,
                      attack.attackType,
                    );
              const roleText = `${definition?.line ?? ""} ${phaseHit ?? ""}`;
              const usesOff = /\boff[- ]hand(?: weapon)?\b/i.test(roleText);
              const usesMain = /\bmain(?:[- ]hand)? weapon\b/i.test(roleText);
              const weaponRole =
                usesOff === usesMain ? undefined : usesOff ? "off" : "main";
              const companion =
                /\bbeast(?:'s)?\b/i.test(definition?.line ?? "") ||
                hasCompanionAbilityDamage(phaseHit);
              const eligible =
                !companion &&
                (weaponRole === undefined ||
                  equipment.hand === undefined ||
                  equipment.hand === weaponRole);
              return {
                ...attack,
                ...(companion || phaseDamage.damage === undefined
                  ? {}
                  : { damage: phaseDamage.damage }),
                ...(companion || phaseDamage.damageType === undefined
                  ? {}
                  : { damageType: phaseDamage.damageType }),
                ...(companion
                  ? {}
                  : { damageComponents: phaseDamage.damageComponents }),
                ...(weaponRole === undefined ? {} : { weaponRole }),
                ...(eligible ? {} : { eligible: false }),
              };
            });
      const critical = criticalExpression(equipment, input.level);
      const brutal = equipment.properties
        .map((property) => /^brutal\s+(\d+)$/i.exec(property)?.[1])
        .find((value) => value !== undefined);
      return {
        id: `${power.id}:${equipment.id}`,
        equipmentName: equipment.name,
        ...(equipment.unarmed
          ? { basicAttackTypes: ["melee" as const] }
          : equipment.weaponCategory?.includes("melee")
            ? {
                basicAttackTypes: /(?:light|heavy) thrown/i.test(
                  equipment.properties.join(","),
                )
                  ? ["melee" as const, "ranged" as const]
                  : ["melee" as const],
              }
            : equipment.weaponCategory?.includes("ranged")
              ? { basicAttackTypes: ["ranged" as const] }
              : {}),
        definitionIds: equipment.definitionIds,
        equipped: equipment.equipped,
        ...(equipment.weaponDamage === undefined
          ? {}
          : { weaponDamage: equipment.weaponDamage }),
        ...(equipment.hand === undefined ? {} : { hand: equipment.hand }),
        ...(equipment.pairedEquipmentName === undefined
          ? {}
          : { pairedEquipmentName: equipment.pairedEquipmentName }),
        attackStat,
        defense,
        ...(primaryAttack === undefined
          ? {}
          : { attackBonus: primaryAttack.attackBonus }),
        ...damage,
        additionalEffects: powerAdditionalEffects({
          stats: input.stats,
          power,
          equipment,
          keywords,
          ...(attackType === undefined ? {} : { attackType }),
          attackStat,
          defense,
          hasAttack,
          ...(damage.damage === undefined ? {} : { damage: damage.damage }),
          byId,
        }),
        ...(critical === undefined ? {} : { critical }),
        ...(brutal === undefined ? {} : { brutal: Number(brutal) }),
        attackComponents,
        attacks,
      };
    });
    const unsupported: string[] = [];
    const supportedStrikerIds = new Set<string>(
      strikerFeatures.flatMap(({ standardId, hybridId }) => [
        standardId,
        hybridId,
      ]),
    );
    for (const activeId of input.activeDefinitionIds) {
      const active = byId.get(key(activeId));
      if (
        active !== undefined &&
        key(active.type) === "class feature" &&
        /hunter's quarry|warlock's curse|sneak attack/i.test(active.name) &&
        !supportedStrikerIds.has(key(active.id))
      )
        unsupported.push(`striker-feature:${active.id}`);
    }
    if (
      power.specifics.some((specific) => /^Augment/i.test(specific.name)) &&
      field(power, "_AugmentVersions") === undefined
    )
      unsupported.push("augment");
    if (
      /\bdamage\b/i.test(hitLine ?? "") &&
      variants.some((variant) => variant.damage === undefined) &&
      key(power.name) !== "call of the beast"
    )
      unsupported.push("unparsed-hit");
    if (unresolvedNativeSpecialCase(hitLine))
      unsupported.push(`native-special-case:${power.id}`);
    if (
      hasCompanionAbilityDamage(hitLine) ||
      attackDefinitions.some(
        (attack) =>
          hasCompanionAbilityDamage(attack.hit) ||
          /\bbeast(?:'s)?\b/i.test(attack.line),
      )
    )
      unsupported.push(`companion-ability:${power.id}`);
    const usage = effectiveField(power, "Power Usage", input.overlays);
    const actionType = effectiveField(power, "Action Type", input.overlays);
    return [
      {
        definitionId: power.id,
        name: power.name,
        ...(usage === undefined ? {} : { usage }),
        ...(actionType === undefined ? {} : { actionType }),
        ...(attackType === undefined ? {} : { attackType }),
        keywords,
        variants,
        recoveries,
        unsupported,
      },
    ];
  });
}
