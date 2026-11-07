import type { ContentEntity } from "@4ecb/content-domain";

import type { SheetCard, SheetPowerVariant, SheetValue } from "./index";

/**
 * An augmentable psionic power's "Augment N" section on its one card
 * (D118): the parent's authored rules for that augment, as the book prints
 * them ("Hit: As above, and …"), and that version's evaluated numbers where
 * they differ from the unaugmented power's.
 */
export interface SheetPowerAugment {
  /** The augment version's power record (`_AugmentParent`). */
  readonly id: string;
  /** The power points it spends: the section reads "Augment <augment>". */
  readonly augment: string;
  /** Its rules, labels trimmed; the version's differing fields when the
   *  parent has no authored block for it. */
  readonly fields: readonly SheetValue[];
  /** The version's evaluated attack and damage where they differ from the
   *  base card's (same weapon, same attack). */
  readonly numbers?: readonly SheetAugmentNumbers[];
}

/** One weapon's (or attack's) augmented numbers, only the differing ones. */
export interface SheetAugmentNumbers {
  /** The weapon, when the card lists more than one. */
  readonly equipmentName?: string;
  /** The attack, when the power makes more than one. */
  readonly ordinal?: number;
  readonly attack?: string;
  readonly damage?: string;
}

const key = (value: string) => value.trim().toLocaleLowerCase();

const field = (entity: ContentEntity, name: string) =>
  entity.specifics.find((specific) => specific.name === name)?.value.trim();

/** An augmentable power's version record IDs, in authored order (version 0
 *  first); empty for any other record. */
export function augmentVersionIdsOf(entity: ContentEntity): string[] {
  return (field(entity, "_AugmentVersions") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

/** The augmentable power a record belongs to: itself when it lists
 *  augment versions, its `_AugmentParent` when it is one. */
export function augmentParentOf(
  entity: ContentEntity,
  lookup: (id: string) => ContentEntity | undefined,
): ContentEntity | undefined {
  if (augmentVersionIdsOf(entity).length > 0) return entity;
  const parentId = field(entity, "_AugmentParent");
  const parent = parentId ? lookup(parentId) : undefined;
  return parent !== undefined && augmentVersionIdsOf(parent).length > 0
    ? parent
    : undefined;
}

/** The parent's authored augment blocks, in order: each "Augment" marker's
 *  value, then the indented fields under it (labels trimmed). */
function authoredAugmentBlocks(
  fields: readonly SheetValue[],
): { readonly augment: string; readonly fields: SheetValue[] }[] {
  const blocks: { augment: string; fields: SheetValue[] }[] = [];
  let open: { augment: string; fields: SheetValue[] } | undefined;
  for (const { label, value } of fields) {
    if (key(label) === "augment") {
      open = { augment: value.trim(), fields: [] };
      blocks.push(open);
    } else if (open !== undefined && /^\s/.test(label))
      open.fields.push({ label: label.trim(), value });
    else open = undefined;
  }
  return blocks;
}

/** A version's fields that differ from the base card's, for a parent with
 *  no authored block for that version. */
function differingFields(base: SheetCard, version: SheetCard): SheetValue[] {
  const baseValues = new Map(
    base.fields.map(({ label, value }) => [key(label), value.trim()]),
  );
  return version.fields
    .filter(({ label, value }) => baseValues.get(key(label)) !== value.trim())
    .map(({ label, value }) => ({ label: label.trim(), value }));
}

interface Numbers {
  readonly attack: string | undefined;
  readonly damage: string | undefined;
}

/** The version's numbers, per weapon and attack, that differ from the
 *  base's for the same weapon and attack. Both cards come from the
 *  evaluation; nothing is recomputed. */
function differingNumbers(
  base: SheetCard,
  version: SheetCard,
): SheetAugmentNumbers[] {
  const suffix = (card: SheetCard, variant: SheetPowerVariant) =>
    card.id !== undefined && variant.id.startsWith(`${card.id}:`)
      ? variant.id.slice(card.id.length + 1)
      : variant.id;
  const rows = (
    card: SheetCard,
  ): { variant: string; name?: string; numbers: Map<number, Numbers> }[] =>
    (card.variants ?? []).length === 0
      ? [
          {
            variant: "",
            numbers: new Map([
              [1, { attack: card.attack, damage: card.damage }],
            ]),
          },
        ]
      : (card.variants ?? []).map((variant) => ({
          variant: suffix(card, variant),
          name: variant.equipmentName,
          numbers: new Map(
            (variant.attacks ?? []).length === 0
              ? [[1, { attack: variant.attack, damage: variant.damage }]]
              : (variant.attacks ?? []).map((attack) => [
                  attack.ordinal,
                  { attack: attack.attack, damage: attack.damage },
                ]),
          ),
        }));
  const baseRows = new Map(rows(base).map((row) => [row.variant, row]));
  const versionRows = rows(version);
  return versionRows.flatMap((row) => {
    const baseRow = baseRows.get(row.variant);
    return [...row.numbers].flatMap(([ordinal, numbers]) => {
      const baseNumbers = baseRow?.numbers.get(ordinal);
      const attack =
        numbers.attack !== undefined && numbers.attack !== baseNumbers?.attack
          ? numbers.attack
          : undefined;
      const damage =
        numbers.damage !== undefined && numbers.damage !== baseNumbers?.damage
          ? numbers.damage
          : undefined;
      if (attack === undefined && damage === undefined) return [];
      return [
        {
          ...(versionRows.length > 1 && row.name !== undefined
            ? { equipmentName: row.name }
            : {}),
          ...(row.numbers.size > 1 ? { ordinal } : {}),
          ...(attack === undefined ? {} : { attack }),
          ...(damage === undefined ? {} : { damage }),
        },
      ];
    });
  });
}

export interface AugmentCardParts {
  readonly lookup: (id: string) => ContentEntity | undefined;
  /** The parent's card fields in authored order, as its own card would
   *  show them (personalized), "Augment" markers and indented fields
   *  included. */
  readonly parentFields: (parent: ContentEntity) => readonly SheetValue[];
  /** The parent's flavor, prerequisites, description and source. */
  readonly presentation?: (parent: ContentEntity) => Partial<SheetCard>;
}

/**
 * One card for an augmentable power's versions (D118): the lowest version's
 * card (version 0, the unaugmented power) under the parent's ID and name,
 * then an "Augment N" section per further version. `versions` are the
 * version cards present, in any order.
 */
export function combinedAugmentCard(
  parent: ContentEntity,
  versions: readonly SheetCard[],
  parts: AugmentCardParts,
): SheetCard | undefined {
  const order = augmentVersionIdsOf(parent).map(key);
  const index = (card: SheetCard) => order.indexOf(key(card.id ?? ""));
  const present = versions
    .filter((card) => index(card) >= 0)
    .sort((left, right) => index(left) - index(right));
  const base = present[0];
  if (base === undefined) return undefined;
  const blocks = authoredAugmentBlocks(parts.parentFields(parent));
  const augments = present.slice(1).map((version): SheetPowerAugment => {
    const at = index(version);
    const block = blocks[at - 1];
    const numbers = differingNumbers(base, version);
    return {
      id: version.id!,
      augment:
        block?.augment ||
        /AUGMENT_(\d+)\)?$/i.exec(version.id ?? "")?.[1] ||
        String(at),
      fields:
        block === undefined || block.fields.length === 0
          ? differingFields(base, version)
          : block.fields,
      ...(numbers.length === 0 ? {} : { numbers }),
    };
  });
  return {
    ...base,
    id: parent.id,
    name: parent.name,
    ...parts.presentation?.(parent),
    augmentVersionIds: present.map((card) => card.id!),
    ...(augments.length === 0 ? {} : { augments }),
  };
}

/**
 * The parent's own card (a legacy cache sheet's) in the same layout: its
 * "Augment" blocks become sections, without numbers of their own.
 */
function splitAugmentFields(card: SheetCard, parent: ContentEntity): SheetCard {
  const blocks = authoredAugmentBlocks(card.fields);
  if (blocks.length === 0) return card;
  const versions = augmentVersionIdsOf(parent);
  const inBlock = new Set<number>();
  let open = false;
  card.fields.forEach(({ label }, index) => {
    if (key(label) === "augment") open = true;
    else if (!(open && /^\s/.test(label))) open = false;
    if (open) inBlock.add(index);
  });
  return {
    ...card,
    fields: card.fields.filter((_, index) => !inBlock.has(index)),
    augmentVersionIds: versions,
    augments: blocks.map((block, index) => ({
      id: versions[index + 1] ?? `${parent.id}:augment-${block.augment}`,
      augment: block.augment,
      fields: block.fields,
    })),
  };
}

/**
 * The cards with each augmentable power's version cards folded into one
 * card (`combinedAugmentCard`), in the place of its first version.
 */
export function withCombinedAugmentCards(
  cards: readonly SheetCard[],
  parts: AugmentCardParts,
): SheetCard[] {
  const parents = new Map<SheetCard, ContentEntity>();
  const groups = new Map<string, SheetCard[]>();
  for (const card of cards) {
    const entity = card.id === undefined ? undefined : parts.lookup(card.id);
    const parent =
      entity === undefined ? undefined : augmentParentOf(entity, parts.lookup);
    // The parent's own card (a legacy cache listing it) is not a version.
    if (parent === undefined || parent === entity) continue;
    parents.set(card, parent);
    const group = groups.get(key(parent.id)) ?? [];
    group.push(card);
    groups.set(key(parent.id), group);
  }
  const placed = new Set<string>();
  return cards.flatMap((card) => {
    const parent = parents.get(card);
    if (parent === undefined) {
      // A parent's own card gives way to its versions' combined card; a
      // legacy cache lists only the parent, whose own fields are split.
      if (card.id !== undefined && groups.has(key(card.id))) return [];
      const entity = card.id === undefined ? undefined : parts.lookup(card.id);
      return [
        entity !== undefined && augmentVersionIdsOf(entity).length > 0
          ? splitAugmentFields(card, entity)
          : card,
      ];
    }
    if (placed.has(key(parent.id))) return [];
    placed.add(key(parent.id));
    const combined = combinedAugmentCard(
      parent,
      groups.get(key(parent.id)) ?? [],
      parts,
    );
    return combined === undefined ? [card] : [combined];
  });
}
