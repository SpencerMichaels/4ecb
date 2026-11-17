import { entityNames, type ContentEntity } from "@4ecb/content-domain";
import type { CharacterOccurrence } from "@4ecb/rules-engine";

export type SheetProficiencyKind =
  "Armor" | "Shields" | "Weapons" | "Implements";

/** The whole-category tiers: superior weapons are granted one by one (no
 *  record covers a whole superior category), so they stay listed. */
export const SHEET_WEAPON_CATEGORY_TIERS = ["Simple", "Military"] as const;
export const SHEET_WEAPON_CATEGORY_RANGES = ["Melee", "Ranged"] as const;
export type SheetWeaponCategoryTier =
  (typeof SHEET_WEAPON_CATEGORY_TIERS)[number];
export type SheetWeaponCategoryRange =
  (typeof SHEET_WEAPON_CATEGORY_RANGES)[number];
/** A whole simple or military weapon category ("Simple Melee", "Military Ranged"). */
export interface SheetWeaponCategory {
  readonly tier: SheetWeaponCategoryTier;
  readonly range: SheetWeaponCategoryRange;
}

/** One kind's proficiencies, as compact as the grants allow. */
export interface SheetProficiencyGroup {
  readonly kind: SheetProficiencyKind;
  /**
   * Lower-cased display names: groups ("mace group", "military heavy
   * blade") and lone grants. Weapons list here only what isn't a whole
   * category; those are `categories`.
   */
  readonly values: readonly string[];
  /** Weapons only: the whole categories granted, in tier then range order. */
  readonly categories?: readonly SheetWeaponCategory[];
  /**
   * The kind's one-line text: armor as a ladder range ("cloth–chainmail"),
   * weapons as their categories ("simple & military") then "; " and the
   * rest, other kinds their values.
   */
  readonly summary: string;
  /** Every proficiency definition shown, including those a listed group covers. */
  readonly definitionIds: readonly string[];
}

const KINDS: readonly SheetProficiencyKind[] = [
  "Armor",
  "Shields",
  "Weapons",
  "Implements",
];
const NAMED_KINDS: Readonly<Record<string, SheetProficiencyKind>> = {
  armor: "Armor",
  shield: "Shields",
  weapon: "Weapons",
  implement: "Implements",
};

/** "Armor Proficiency (Cloth)" → Armor/cloth; "Weapon Group (Mace)" → Weapons/mace group. */
function namedProficiency(
  name: string,
): { kind: SheetProficiencyKind; value: string } | undefined {
  const single = /^(\w+) Proficiency \((.+)\)$/i.exec(name.trim());
  const kind = single && NAMED_KINDS[single[1]!.toLowerCase()];
  if (kind) return { kind, value: single[2]!.trim().toLowerCase() };
  const group = /^Weapon Group \((.+)\)$/i.exec(name.trim());
  if (group)
    return {
      kind: "Weapons",
      value: `${group[1]!.trim().toLowerCase()} group`,
    };
  return undefined;
}

/** Body armor from lightest to heaviest, as the content spells the types. */
export const SHEET_ARMOR_LADDER = [
  "Cloth",
  "Leather",
  "Hide",
  "Chainmail",
  "Scale",
  "Plate",
] as const;

/**
 * Armor types held: a contiguous run of the ladder as its range
 * ("cloth–chainmail"), one type alone, otherwise the list in ladder order;
 * a type off the ladder (spiked plate) follows the range or list.
 */
export function armorSummary(values: readonly string[]): string {
  const rungs = SHEET_ARMOR_LADDER.map((type) => type.toLowerCase());
  const held = rungs.filter((rung) => values.includes(rung));
  const others = values.filter((value) => !rungs.includes(value));
  const first = held.length ? rungs.indexOf(held[0]!) : 0;
  const contiguous =
    held.length > 1 && rungs.indexOf(held.at(-1)!) - first === held.length - 1;
  return [
    ...(contiguous ? [`${held[0]}–${held.at(-1)}`] : held),
    ...others,
  ].join(", ");
}

/**
 * Whole weapon categories in words: a tier with both ranges is the tier
 * alone ("simple"), else the tier and its range ("simple melee"); tiers
 * holding the same ranges share them ("simple & military",
 * "simple & military melee"); otherwise simple then military, joined by
 * ", " ("simple, military melee").
 */
export function weaponCategorySummary(
  categories: readonly SheetWeaponCategory[],
): string {
  const rangesOf = (tier: SheetWeaponCategoryTier) =>
    SHEET_WEAPON_CATEGORY_RANGES.filter((range) =>
      categories.some(
        (category) => category.tier === tier && category.range === range,
      ),
    );
  const phrase = (
    tiers: string,
    ranges: readonly SheetWeaponCategoryRange[],
  ) => (ranges.length === 1 ? `${tiers} ${ranges[0]!.toLowerCase()}` : tiers);
  const [simple, military] = SHEET_WEAPON_CATEGORY_TIERS.map(rangesOf) as [
    SheetWeaponCategoryRange[],
    SheetWeaponCategoryRange[],
  ];
  if (simple.length && simple.join() === military.join())
    return phrase("simple & military", simple);
  return [
    ...(simple.length ? [phrase("simple", simple)] : []),
    ...(military.length ? [phrase("military", military)] : []),
  ].join(", ");
}

/**
 * The whole simple or military weapon category a proficiency record is, by
 * its name as the content spells it ("Simple Melee", "Military Ranged"); a
 * part of one ("Simple One-Handed Melee", "Military Heavy Blade") is none.
 */
function weaponCategory(
  entity: ContentEntity,
): SheetWeaponCategory | undefined {
  for (const name of entityNames(entity)) {
    const match = /^(Simple|Military) (Melee|Ranged)$/i.exec(name.trim());
    if (!match) continue;
    const [tier, range] = [match[1]!.toLowerCase(), match[2]!.toLowerCase()];
    return {
      tier: SHEET_WEAPON_CATEGORY_TIERS.find(
        (value) => value.toLowerCase() === tier,
      )!,
      range: SHEET_WEAPON_CATEGORY_RANGES.find(
        (value) => value.toLowerCase() === range,
      )!,
    };
  }
  return undefined;
}

/**
 * The character's evaluated proficiencies by kind. A proficiency that grants
 * others (Simple Melee, Weapon Group (Mace)) is listed as the group, and the
 * proficiencies it grants are not repeated; a bare-named group takes its
 * granted proficiencies' kind. Whole weapon categories are the Weapons
 * group's `categories` (also when another grant covers them), not values.
 */
export function sheetProficiencies(
  active: readonly {
    readonly occurrence: CharacterOccurrence;
    readonly entity: ContentEntity;
  }[],
): SheetProficiencyGroup[] {
  const proficiencies = active.filter(
    ({ entity }) => entity.type.trim().toLowerCase() === "proficiency",
  );
  const byOccurrence = new Map(
    proficiencies.map((entry) => [entry.occurrence.id, entry]),
  );
  const groupOf = (occurrence: CharacterOccurrence) =>
    occurrence.parentId === undefined
      ? undefined
      : byOccurrence.get(occurrence.parentId);
  const covered = new Map<string, string[]>();
  for (const { occurrence, entity } of proficiencies) {
    const group = groupOf(occurrence);
    if (group === undefined) continue;
    covered.set(group.entity.id, [
      ...(covered.get(group.entity.id) ?? []),
      entity.id,
    ]);
  }
  const coveredIds = new Set([...covered.values()].flat());
  const categories = new Set<string>();
  const categoryIds = new Set<string>();
  for (const { entity } of proficiencies) {
    const category = weaponCategory(entity);
    if (category === undefined) continue;
    categoryIds.add(entity.id);
    categories.add(`${category.tier} ${category.range}`);
  }
  const groups = new Map<
    SheetProficiencyKind,
    { values: string[]; definitionIds: Set<string> }
  >();
  const seen = new Set<string>();
  for (const { entity } of proficiencies) {
    if (coveredIds.has(entity.id) || seen.has(entity.id)) continue;
    seen.add(entity.id);
    const granted = covered.get(entity.id) ?? [];
    const named = namedProficiency(entity.name);
    const kindOf = (id: string, name: string) =>
      namedProficiency(name)?.kind ??
      (categoryIds.has(id) ? ("Weapons" as const) : undefined);
    const kind =
      kindOf(entity.id, entity.name) ??
      granted
        .map((id) =>
          kindOf(
            id,
            proficiencies.find((entry) => entry.entity.id === id)?.entity
              .name ?? "",
          ),
        )
        .find((value) => value !== undefined);
    // A proficiency that is neither named by kind nor grants any (a "Choose
    // Nothing" placeholder) has nothing to show.
    if (kind === undefined) continue;
    const value = named?.value ?? entity.name.trim().toLowerCase();
    const group = groups.get(kind) ?? { values: [], definitionIds: new Set() };
    if (!categoryIds.has(entity.id)) group.values.push(value);
    group.definitionIds.add(entity.id);
    const include = (ids: readonly string[]) => {
      for (const id of ids)
        if (!group.definitionIds.has(id)) {
          group.definitionIds.add(id);
          include(covered.get(id) ?? []);
        }
    };
    include(granted);
    groups.set(kind, group);
  }
  const weaponCategories = SHEET_WEAPON_CATEGORY_TIERS.flatMap((tier) =>
    SHEET_WEAPON_CATEGORY_RANGES.flatMap((range) =>
      categories.has(`${tier} ${range}`) ? [{ tier, range }] : [],
    ),
  );
  if (weaponCategories.length && !groups.has("Weapons"))
    groups.set("Weapons", { values: [], definitionIds: categoryIds });
  const summaryOf = (kind: SheetProficiencyKind, values: readonly string[]) => {
    if (kind === "Armor") return armorSummary(values);
    if (kind !== "Weapons") return values.join(", ");
    const categories = weaponCategorySummary(weaponCategories);
    return [categories, values.join(", ")]
      .filter((part) => part !== "")
      .join("; ");
  };
  return KINDS.flatMap((kind) => {
    const group = groups.get(kind);
    return group === undefined
      ? []
      : [
          {
            kind,
            values: group.values,
            ...(kind === "Weapons" ? { categories: weaponCategories } : {}),
            summary: summaryOf(kind, group.values),
            definitionIds: [...group.definitionIds],
          },
        ];
  });
}
