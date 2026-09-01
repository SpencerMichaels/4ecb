import type { ContentEntity } from "@4ecb/content-domain";

import type { CharacterInventoryEntry, FieldOverlay } from "./evaluator";
import type { EvaluatedStat } from "./stats";

export interface PowerComponent {
  readonly label: string;
  readonly value: number;
  readonly source?: string;
}

export interface PowerVariant {
  readonly id: string;
  readonly equipmentName: string;
  readonly attackStat?: string;
  readonly defense?: string;
  readonly attackBonus?: number;
  readonly damage?: string;
  readonly damageType?: string;
  readonly critical?: string;
  readonly attackComponents: readonly PowerComponent[];
  readonly damageComponents: readonly PowerComponent[];
}

export interface EvaluatedPower {
  readonly definitionId: string;
  readonly name: string;
  readonly usage?: string;
  readonly actionType?: string;
  readonly attackType?: string;
  readonly keywords: readonly string[];
  readonly variants: readonly PowerVariant[];
  readonly unsupported: readonly string[];
}

interface Loadout {
  readonly id: string;
  readonly name: string;
  readonly weaponDamage?: string;
  readonly proficiency: number;
  readonly enhancement: number;
  readonly critical?: string;
  readonly unarmed: boolean;
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
  entities: readonly ContentEntity[],
): readonly Loadout[] {
  const byId = new Map(entities.map((entity) => [key(entity.id), entity]));
  const result: Loadout[] = [];
  for (const entry of inventory.filter((item) => item.equippedQuantity > 0)) {
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
    if (
      weapon === undefined &&
      !/(implement|holy symbol|orb|rod|staff|tome|totem|wand)/i.test(
        magicType ?? "",
      )
    )
      continue;
    const critical = field(magic ?? emptyEntity, "Critical");
    result.push({
      id: entry.id,
      name: equipmentName(parts),
      ...(weapon === undefined
        ? {}
        : { weaponDamage: field(weapon, "Damage") ?? "1d4" }),
      proficiency:
        Number(field(weapon ?? emptyEntity, "Proficiency Bonus")) || 0,
      enhancement: parseEnhancement(magic),
      ...(critical ? { critical } : {}),
      unarmed: false,
    });
  }
  result.push({
    id: "unarmed",
    name: "Unarmed",
    weaponDamage: "1d4",
    proficiency: 0,
    enhancement: 0,
    unarmed: true,
  });
  return result;
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
): string {
  return abilityNames.reduce((best, candidate) =>
    numericStat(stats, `${candidate} modifier`) >
    numericStat(stats, `${best} modifier`)
      ? candidate
      : best,
  );
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
  }
  return selected;
}

export function evaluatePowers(input: {
  readonly level: number;
  readonly activeDefinitionIds: readonly string[];
  readonly inventory: readonly CharacterInventoryEntry[];
  readonly stats: Readonly<Record<string, EvaluatedStat>>;
  readonly overlays: readonly FieldOverlay[];
  readonly entities: readonly ContentEntity[];
}): readonly EvaluatedPower[] {
  const byId = new Map(
    input.entities.map((entity) => [key(entity.id), entity]),
  );
  const equipped = loadouts(input.inventory, input.entities);
  return input.activeDefinitionIds.flatMap((definitionId) => {
    const power = byId.get(key(definitionId));
    if (power === undefined || key(power.type) !== "power") return [];
    const keywords = (effectiveField(power, "Keywords", input.overlays) ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const attackType = effectiveField(power, "Attack Type", input.overlays);
    const attackLine = effectiveField(power, "Attack", input.overlays);
    const hitLine = lineAtLevel(
      effectiveField(power, "Hit", input.overlays),
      input.level,
    );
    const effectLine = effectiveField(power, "Effect", input.overlays);
    const attack = attackLine?.match(
      /([A-Za-z]+)(?: modifier)?\s+vs\.?\s+([A-Za-z]+)/i,
    );
    const weaponPower = keywords.some((value) => key(value) === "weapon");
    const implementPower = keywords.some((value) => key(value) === "implement");
    const effectOnlyCalculation =
      (attack === null || attack === undefined) &&
      /^close\b/i.test(attackType ?? "") &&
      effectLine !== undefined;
    const candidates =
      attack === null || attack === undefined
        ? effectOnlyCalculation
          ? equipped.filter((item) => item.unarmed)
          : []
        : weaponPower
          ? equipped.filter(
              (item) => item.weaponDamage !== undefined || item.unarmed,
            )
          : implementPower
            ? equipped
            : equipped.filter((item) => item.unarmed);
    const variants = candidates.map((equipment): PowerVariant => {
      const parsedAttackStat = attack?.[1] ?? "Unknown";
      const attackStat = /^(?:primary|ability)$/i.test(parsedAttackStat)
        ? highestAbility(input.stats)
        : parsedAttackStat;
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

      const damageComponents: PowerComponent[] = [];
      const weaponMatch = hitLine?.match(/(\d+)\[W\]/i);
      const fixedMatch = hitLine?.match(/(\d+d\d+)/i);
      const dice =
        weaponMatch !== null && weaponMatch !== undefined
          ? diceTimes(equipment.weaponDamage ?? "1d4", Number(weaponMatch[1]))
          : fixedMatch?.[1];
      const explicitAbility =
        hitLine !== undefined &&
        new RegExp(`${attackStat} modifier`, "i").test(hitLine);
      const multipleAbilities =
        hitLine !== undefined &&
        abilityNames.filter((ability) =>
          new RegExp(`\\b${ability}\\b`, "i").test(hitLine),
        ).length > 1;
      if (dice !== undefined && (explicitAbility || multipleAbilities))
        damageComponents.push({
          label: `${attackStat} modifier`,
          value: numericStat(input.stats, `${attackStat} modifier`),
        });
      if (dice !== undefined && equipment.enhancement !== 0)
        damageComponents.push({
          label: "enhancement bonus",
          value: equipment.enhancement,
        });
      if (dice !== undefined && /^melee/i.test(attackType ?? "")) {
        const melee = numericStat(input.stats, "melee:damage");
        if (melee !== 0)
          damageComponents.push({ label: "melee damage", value: melee });
      }
      const damageBonus = damageComponents.reduce(
        (sum, component) => sum + component.value,
        0,
      );
      return {
        id: `${power.id}:${equipment.id}`,
        equipmentName: equipment.name,
        attackStat,
        defense,
        attackBonus: attackComponents.reduce(
          (sum, component) => sum + component.value,
          0,
        ),
        ...(dice === undefined
          ? {}
          : { damage: formatDamage(dice, damageBonus) }),
        ...(equipment.critical === undefined
          ? {}
          : { critical: equipment.critical }),
        attackComponents,
        damageComponents,
      };
    });
    const unsupported: string[] = [];
    if (
      /augment/i.test(power.name) ||
      power.specifics.some((s) => /^Augment/i.test(s.name))
    )
      unsupported.push("augment");
    if (
      /\bdamage\b/i.test(hitLine ?? "") &&
      variants.some((variant) => variant.damage === undefined)
    )
      unsupported.push("unparsed-hit");
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
        unsupported,
      },
    ];
  });
}
