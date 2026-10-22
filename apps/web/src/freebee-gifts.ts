import type {
  BuildInventoryEntry,
  CharacterBuild,
  CharacterCommand,
  EquipmentSlotAssignment,
  EquipmentSlotId,
  FreebeeGift,
} from "@4ecb/character-domain";
import type { ContentEntity } from "@4ecb/content-domain";
import {
  pendingFreebeeItems,
  type EvaluatedCharacter,
} from "@4ecb/rules-engine";

import { contentSpecificValue } from "./builder-ui";
import {
  inventoryRequiresBothHands,
  inventorySlotCandidates,
  resolveLoadoutAssignments,
} from "./equipment-ui";

/**
 * Legacy equips a gift only when its record names an Item Slot
 * (`TryToEquip` → `ValidateEquip`): Monk Unarmed Strike, the Shadowblade.
 * Unlike legacy, a gift takes a free slot and never displaces an item the
 * player equipped.
 */
function giftSlots(
  entry: BuildInventoryEntry,
  entity: ContentEntity,
  byId: ReadonlyMap<string, ContentEntity>,
  occupied: ReadonlySet<EquipmentSlotId>,
): readonly EquipmentSlotAssignment[] {
  const authored = (contentSpecificValue(entity, "Item Slot") ?? "")
    .trim()
    .toLocaleLowerCase();
  if (authored === "") return [];
  const candidates = inventorySlotCandidates(
    entry,
    byId,
  ) as readonly EquipmentSlotId[];
  if (inventoryRequiresBothHands(entry, byId))
    return candidates.includes("main-hand") &&
      candidates.includes("off-hand") &&
      !occupied.has("main-hand") &&
      !occupied.has("off-hand")
      ? [
          { slot: "main-hand", quantityIndex: 0 },
          { slot: "off-hand", quantityIndex: 0 },
        ]
      : [];
  const ordered = authored.includes("off-hand")
    ? [...candidates].sort(
        (left, right) =>
          Number(right === "off-hand") - Number(left === "off-hand"),
      )
    : candidates;
  const slot = ordered.find((candidate) => !occupied.has(candidate));
  return slot === undefined ? [] : [{ slot, quantityIndex: 0 }];
}

/**
 * The one command that gives every free item (`FREEBEE:`) the evaluation
 * entitles the build to and records each as given; undefined when there is
 * nothing to give. Deterministic: entry IDs come from the item's content ID.
 */
export function freebeeGiftCommand(
  build: CharacterBuild,
  evaluation: Pick<EvaluatedCharacter, "level" | "occurrences" | "stats">,
  byId: ReadonlyMap<string, ContentEntity>,
): CharacterCommand | undefined {
  const pending = pendingFreebeeItems(build, evaluation, (id) =>
    byId.get(id.toLocaleLowerCase()),
  );
  if (pending.length === 0) return undefined;
  const occupied = new Set<EquipmentSlotId>(
    [...resolveLoadoutAssignments(build.inventory, byId).assignmentsByEntry]
      .flatMap(([, assignments]) => assignments)
      .map(({ slot }) => slot),
  );
  const ids = new Set(build.inventory.map(({ id }) => id));
  const gifts = pending.map((item): FreebeeGift => {
    if (item.owned) return { marker: item.marker };
    let id = `web:freebee:${item.definitionId}`;
    for (let suffix = 2; ids.has(id); suffix += 1)
      id = `web:freebee:${item.definitionId}:${suffix}`;
    ids.add(id);
    const holding: BuildInventoryEntry = {
      id,
      acquiredLevel: item.acquiredLevel,
      quantity: 1,
      equippedQuantity: 0,
      elements: [
        {
          definitionId: item.entity.id,
          name: item.entity.name,
          type: item.entity.type,
        },
      ],
      overrides: {},
      legality: "rules-legal",
    };
    const slots = giftSlots(holding, item.entity, byId, occupied);
    slots.forEach(({ slot }) => occupied.add(slot));
    return {
      marker: item.marker,
      entry:
        slots.length === 0
          ? holding
          : { ...holding, equippedQuantity: 1, equippedSlots: slots },
    };
  });
  return { kind: "give-freebees", gifts };
}
