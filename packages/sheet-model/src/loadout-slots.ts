import type {
  BuildInventoryEntry,
  EquipmentSlotAssignment,
  EquipmentSlotId,
} from "@4ecb/character-domain";
import type { ContentEntity } from "@4ecb/content-domain";

/**
 * The single loadout-slot resolver shared by the builder's Loadout editor and
 * the sheet: which slots a holding can occupy, and which slots each equipped
 * holding occupies once legacy `equip-count` holdings (no recorded slots) are
 * projected into the modern slot model.
 */
type ItemElements = Pick<BuildInventoryEntry, "elements">;

export type LoadoutHolding = Pick<
  BuildInventoryEntry,
  "id" | "quantity" | "equippedQuantity" | "equippedSlots" | "elements"
>;

export interface ResolvedLoadoutAssignments {
  readonly assignmentsByEntry: ReadonlyMap<
    string,
    readonly EquipmentSlotAssignment[]
  >;
}

function specific(entity: ContentEntity, name: string): string | undefined {
  const wanted = name.trim().toLocaleLowerCase();
  const value = entity.specifics.find(
    (field) => field.name.trim().toLocaleLowerCase() === wanted,
  )?.value;
  return value === undefined || value.trim() === "" ? undefined : value.trim();
}

/** Legacy IsShield: an armor whose Armor Type names a shield. */
export function isAuthoredShield(entity: ContentEntity): boolean {
  return (
    entity.type.trim().toLocaleLowerCase() === "armor" &&
    (specific(entity, "Armor Type") ?? "")
      .toLocaleLowerCase()
      .includes("shield")
  );
}

/** Lowercased content IDs of a holding's base/enchantment elements. */
export function inventoryDefinitionIds<Item extends ItemElements>(
  entry: Item,
): readonly string[] {
  return entry.elements.flatMap(({ definitionId }) =>
    definitionId === undefined ? [] : [definitionId.toLocaleLowerCase()],
  );
}

function definitionsOf(
  entry: ItemElements,
  byId: ReadonlyMap<string, ContentEntity>,
): readonly ContentEntity[] {
  return inventoryDefinitionIds(entry).flatMap((id) => {
    const entity = byId.get(id);
    return entity === undefined ? [] : [entity];
  });
}

/** The modern slots a holding may occupy, from its authored content. */
export function inventorySlotCandidates<Item extends ItemElements>(
  entry: Item,
  byId: ReadonlyMap<string, ContentEntity>,
): readonly EquipmentSlotId[] {
  const definitions = definitionsOf(entry, byId);
  const item = definitions[0];
  const armor = definitions.find(
    (definition) => definition.type.toLocaleLowerCase() === "armor",
  );
  const slots = definitions
    .flatMap((definition) => [
      specific(definition, "Item Slot") ?? "",
      specific(definition, "Magic Item Type") ?? "",
    ])
    .join("\n")
    .toLocaleLowerCase();
  const candidates: EquipmentSlotId[] = [];
  if (armor !== undefined && isAuthoredShield(armor)) {
    return ["off-hand"];
  }
  if (
    slots.includes("two-hand") ||
    slots.includes("off-hand") ||
    slots.includes("one-hand")
  ) {
    candidates.push("main-hand", "off-hand");
  }
  if (slots.includes("head and neck")) candidates.push("head", "neck");
  if (item?.type.toLocaleLowerCase() === "weapon") {
    return ["main-hand", "off-hand"];
  }
  if (armor !== undefined) return ["body"];
  const mappings = [
    ["body", "body"],
    ["head", "head"],
    ["neck", "neck"],
    ["arms", "arms"],
    ["hands", "hands"],
    ["ring", "ring-1"],
    ["ring", "ring-2"],
    ["waist", "waist"],
    ["feet", "feet"],
    ["holy symbol", "symbol"],
    ["symbol", "symbol"],
    ["ki focus", "ki-focus"],
    ["tattoo", "tattoo"],
    ["companion", "companion"],
    ["familiar", "familiar"],
    ["mount", "mount"],
  ] as const;
  return [
    ...new Set(
      candidates.concat(
        mappings
          .filter(([needle]) => slots.includes(needle))
          .map(([, slot]) => slot),
      ),
    ),
  ];
}

/** True when the holding's weapon is two-handed (both hand slots). */
export function inventoryRequiresBothHands<Item extends ItemElements>(
  entry: Item,
  byId: ReadonlyMap<string, ContentEntity>,
): boolean {
  const item = definitionsOf(entry, byId).find(
    (entity) => entity.type.toLocaleLowerCase() === "weapon",
  );
  if (item === undefined) return false;
  return (
    (specific(item, "Item Slot") ?? "")
      .toLocaleLowerCase()
      .includes("two-hand") ||
    (specific(item, "Hands Required") ?? "")
      .toLocaleLowerCase()
      .includes("two-handed")
  );
}

const inferredSlotPriority: readonly EquipmentSlotId[] = [
  "body",
  "head",
  "neck",
  "arms",
  "hands",
  "waist",
  "feet",
  "symbol",
  "ki-focus",
  "tattoo",
  "companion",
  "familiar",
  "mount",
  "ring-1",
  "ring-2",
  "main-hand",
  "off-hand",
];

/**
 * Projects legacy `equip-count` holdings into the modern slot model for
 * presentation and the next loadout edit. The legacy format records how many
 * copies are equipped but not which hand/ring slot they occupy. Explicit
 * modern assignments always win; unambiguous remaining positions are filled
 * deterministically without changing the durable build until the user edits
 * the loadout.
 */
export function resolveLoadoutAssignments(
  inventory: readonly LoadoutHolding[],
  byId: ReadonlyMap<string, ContentEntity>,
): ResolvedLoadoutAssignments {
  const assignmentsByEntry = new Map<
    string,
    readonly EquipmentSlotAssignment[]
  >();
  const occupied = new Set<EquipmentSlotId>();

  for (const entry of inventory) {
    if (entry.equippedSlots === undefined) continue;
    const assignments = [...entry.equippedSlots];
    assignmentsByEntry.set(entry.id, assignments);
    assignments.forEach(({ slot }) => occupied.add(slot));
  }

  for (const entry of inventory) {
    if (
      entry.equippedSlots !== undefined ||
      entry.equippedQuantity <= 0 ||
      entry.quantity <= 0
    )
      continue;
    const candidates = new Set(inventorySlotCandidates(entry, byId));
    const bothHands = inventoryRequiresBothHands(entry, byId);
    const tentative: EquipmentSlotAssignment[] = [];
    const tentativelyOccupied = new Set(occupied);
    let complete = true;

    for (
      let quantityIndex = 0;
      quantityIndex < entry.equippedQuantity;
      quantityIndex += 1
    ) {
      if (bothHands) {
        if (
          !candidates.has("main-hand") ||
          !candidates.has("off-hand") ||
          tentativelyOccupied.has("main-hand") ||
          tentativelyOccupied.has("off-hand")
        ) {
          complete = false;
          break;
        }
        tentative.push(
          { slot: "main-hand", quantityIndex },
          { slot: "off-hand", quantityIndex },
        );
        tentativelyOccupied.add("main-hand");
        tentativelyOccupied.add("off-hand");
        continue;
      }
      const slot = inferredSlotPriority.find(
        (candidate) =>
          candidates.has(candidate) && !tentativelyOccupied.has(candidate),
      );
      if (slot === undefined) {
        complete = false;
        break;
      }
      tentative.push({ slot, quantityIndex });
      tentativelyOccupied.add(slot);
    }

    if (!complete) continue;
    assignmentsByEntry.set(entry.id, tentative);
    tentative.forEach(({ slot }) => occupied.add(slot));
  }

  return { assignmentsByEntry };
}
