import type { BuildOccurrence } from "@4ecb/character-domain";
import type { ContentEntity } from "@4ecb/content-domain";
import { itemChoiceSlots, type ItemChoiceSlot } from "@4ecb/rules-engine";

import { itemChoiceCandidates } from "./equipment-ui";

/** A dot-joined `slotPath` — the map key `itemChoiceSelections` uses. */
export function itemChoicePathKey(path: readonly number[]): string {
  return path.join(".");
}

export interface ItemChoicePageInfo {
  readonly path: readonly number[];
  readonly slot: ItemChoiceSlot;
  readonly candidates: readonly ContentEntity[];
}

/**
 * Every item-owned choice page `entity` currently needs, depth-first: each
 * of the entity's own choice slots, and — for a slot that's already been
 * answered — any further choices the chosen candidate itself requires (for
 * example a granted power that itself asks "which ability governs this"),
 * recursively. A candidate's own choices only become visible once it's been
 * picked, so this list grows as `selections` fills in; nothing needs to
 * guess ahead at what a not-yet-chosen candidate might require.
 */
export function itemChoicePages(
  entity: ContentEntity,
  entities: readonly ContentEntity[],
  characterLevel: number,
  selections: ReadonlyMap<string, string>,
  pathPrefix: readonly number[] = [],
): readonly ItemChoicePageInfo[] {
  return itemChoiceSlots(entity).flatMap((slot, index) => {
    const path = [...pathPrefix, index];
    const candidates = itemChoiceCandidates(slot, entities, characterLevel);
    const chosenId = selections.get(itemChoicePathKey(path));
    const chosen =
      chosenId === undefined
        ? undefined
        : candidates.find((candidate) => candidate.id === chosenId);
    return [
      { path, slot, candidates },
      ...(chosen === undefined
        ? []
        : itemChoicePages(chosen, entities, characterLevel, selections, path)),
    ];
  });
}

/**
 * Builds the resolved `BuildOccurrence` tree for `entity`'s own choices —
 * mirroring `itemChoicePages`, but producing the actual occurrences to
 * store (each with its own resolved sub-choices nested beneath it, not a
 * flat list), so a candidate's further choice is stored right where the
 * evaluator already looks for it: as that candidate's own child.
 */
export function resolveItemChoiceOccurrences(
  entity: ContentEntity,
  entities: readonly ContentEntity[],
  characterLevel: number,
  selections: ReadonlyMap<string, string>,
  pathPrefix: readonly number[] = [],
): readonly BuildOccurrence[] {
  return itemChoiceSlots(entity).flatMap((slot, index) => {
    const path = [...pathPrefix, index];
    const chosenId = selections.get(itemChoicePathKey(path));
    const chosen =
      chosenId === undefined
        ? undefined
        : itemChoiceCandidates(slot, entities, characterLevel).find(
            (candidate) => candidate.id === chosenId,
          );
    if (chosen === undefined) return [];
    return [
      {
        id: `web:${crypto.randomUUID()}`,
        identity: {
          definitionId: chosen.id,
          name: chosen.name,
          type: chosen.type,
        },
        acquiredLevel: characterLevel,
        legality: "rules-legal" as const,
        children: resolveItemChoiceOccurrences(
          chosen,
          entities,
          characterLevel,
          selections,
          path,
        ),
        unresolved: false,
      },
    ];
  });
}

/**
 * Whether an item-owned choice's candidates are complex enough (e.g. a
 * Power, with its own attack/effect text worth previewing) to warrant the
 * two-column picker + detail-card layout, rather than the plain compact
 * button list used for a simple choice like a resistance type or language.
 */
export function isComplexItemChoice(
  candidates: readonly Pick<ContentEntity, "type">[],
): boolean {
  return candidates.some(
    (candidate) => candidate.type.trim().toLocaleLowerCase() === "power",
  );
}

/** A slot's heading and menu wording: its authored label ("Choose
 * Resistance Type") or "Choose <type>". */
export function itemChoiceHeading(slot: ItemChoiceSlot): string {
  return slot.label ?? `Choose ${slot.type.toLocaleLowerCase()}`;
}

/** `selections` with `path` set to `candidateId`, dropping the choices made
 * beneath the candidate it previously held (a granted power's own "which
 * ability governs this" sub-choice). */
export function chooseItemChoice(
  selections: ReadonlyMap<string, string>,
  path: readonly number[],
  candidateId: string,
): ReadonlyMap<string, string> {
  const pathKey = itemChoicePathKey(path);
  const next = new Map(selections);
  for (const key of next.keys())
    if (key.startsWith(`${pathKey}.`)) next.delete(key);
  next.set(pathKey, candidateId);
  return next;
}

/**
 * The selections an owned holding's saved choices already make, keyed like
 * `itemChoicePages`: each slot takes the saved child that is one of its
 * candidates, recursively.
 */
export function itemChoiceSelectionsFrom(
  entity: ContentEntity,
  children: readonly BuildOccurrence[],
  entities: readonly ContentEntity[],
  characterLevel: number,
  pathPrefix: readonly number[] = [],
): ReadonlyMap<string, string> {
  const selections = new Map<string, string>();
  const used = new Set<BuildOccurrence>();
  itemChoiceSlots(entity).forEach((slot, index) => {
    const path = [...pathPrefix, index];
    const candidates = itemChoiceCandidates(slot, entities, characterLevel);
    const child = children.find(
      (value) =>
        !used.has(value) &&
        candidates.some(
          (candidate) =>
            candidate.id.toLocaleLowerCase() ===
            value.identity.definitionId?.toLocaleLowerCase(),
        ),
    );
    const chosen = candidates.find(
      (candidate) =>
        candidate.id.toLocaleLowerCase() ===
        child?.identity.definitionId?.toLocaleLowerCase(),
    );
    if (child === undefined || chosen === undefined) return;
    used.add(child);
    selections.set(itemChoicePathKey(path), chosen.id);
    for (const [key, value] of itemChoiceSelectionsFrom(
      chosen,
      child.children,
      entities,
      characterLevel,
      path,
    ))
      selections.set(key, value);
  });
  return selections;
}
