/**
 * Dragonshard augments bound to an item (legacy CharLootAugment).
 *
 * A host holding names the augment holding it carries with
 * `augmentEntryId`, set by the `set-inventory-augment` command. A holding
 * without the field has no modern choice and follows the `augment` loot
 * attribute an imported .dnd4e file stored: a serialized CharLootID that
 * FindLoot resolves to the owned loot with the same base (and enchantment)
 * IDs. Export writes the modern choice back as that attribute.
 */

/** Native CharLootID: the base and optional enchantment record IDs. */
export interface LegacyLootId {
  readonly baseId: string;
  readonly enchantId?: string;
}

/** The holding fields an augment binding reads. */
export interface AugmentBindingHolding {
  readonly id: string;
  readonly quantity: number;
  readonly augmentEntryId?: string | null;
  readonly overrides?: Readonly<Record<string, string>>;
}

/** The legacy loot attribute that stores the binding. */
export const LEGACY_AUGMENT_OVERRIDE = "augment";

function key(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function decodeXmlText(value: string): string {
  return value
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/&quot;/gu, '"')
    .replace(/&apos;/gu, "'")
    .replace(/&amp;/gu, "&");
}

function encodeXmlText(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;");
}

/** The saved `augment` loot attribute of a holding, if any. */
export function legacyAugmentOverride(
  holding: Pick<AugmentBindingHolding, "overrides">,
): string | undefined {
  return Object.entries(holding.overrides ?? {}).find(
    ([name]) => key(name) === LEGACY_AUGMENT_OVERRIDE,
  )?.[1];
}

/** Reads a serialized CharLootID; undefined when it names no base. */
export function parseLegacyLootId(
  serialized: string,
): LegacyLootId | undefined {
  const xml = decodeXmlText(serialized);
  const element = (name: string) =>
    new RegExp(`<${name}>([^<]*)</${name}>`, "u").exec(xml)?.[1]?.trim();
  const baseId = element("baseID");
  if (baseId === undefined || baseId === "") return undefined;
  const enchantId = element("enchantID");
  return enchantId === undefined || enchantId === ""
    ? { baseId }
    : { baseId, enchantId };
}

/**
 * Serializes a CharLootID as the legacy XmlSerializer writes it, on one line
 * (an XML attribute value normalizes line breaks to spaces on reading).
 */
export function serializeLegacyLootId(id: LegacyLootId): string {
  return [
    '<?xml version="1.0" encoding="utf-16"?>',
    '<CharLootID xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">',
    `<baseID>${encodeXmlText(id.baseId)}</baseID>`,
    ...(id.enchantId === undefined
      ? []
      : [`<enchantID>${encodeXmlText(id.enchantId)}</enchantID>`]),
    "</CharLootID>",
  ].join("");
}

/**
 * The owned holding whose augment is bound to `host`, or undefined. An
 * explicit `augmentEntryId` names it (null: none); otherwise the imported
 * CharLootID resolves, like FindLoot, to the first other owned holding with
 * that base ID (and enchantment ID, when the CharLootID names one).
 */
export function boundAugmentHolding<Holding extends AugmentBindingHolding>(
  host: Holding,
  inventory: readonly Holding[],
  definitionIds: (holding: Holding) => readonly string[],
): Holding | undefined {
  const owned = (candidate: Holding) =>
    candidate !== host && candidate.id !== host.id && candidate.quantity > 0;
  if (host.augmentEntryId === null) return undefined;
  if (host.augmentEntryId !== undefined)
    return inventory.find(
      (candidate) => candidate.id === host.augmentEntryId && owned(candidate),
    );
  const serialized = legacyAugmentOverride(host);
  if (serialized === undefined) return undefined;
  const lootId = parseLegacyLootId(serialized);
  if (lootId === undefined) return undefined;
  return inventory.find((candidate) => {
    if (!owned(candidate)) return false;
    const ids = definitionIds(candidate);
    return (
      key(ids[0] ?? "") === key(lootId.baseId) &&
      (lootId.enchantId === undefined ||
        key(ids[1] ?? "") === key(lootId.enchantId))
    );
  });
}

/** The holdings that carry `augment`, in inventory order. */
export function augmentHosts<Holding extends AugmentBindingHolding>(
  augment: Holding,
  inventory: readonly Holding[],
  definitionIds: (holding: Holding) => readonly string[],
): readonly Holding[] {
  return inventory.filter(
    (holding) =>
      holding.quantity > 0 &&
      boundAugmentHolding(holding, inventory, definitionIds) === augment,
  );
}
