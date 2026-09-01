import type { BuildOccurrence, CharacterBuild } from "@4ecb/character-domain";
import type { ContentEntity } from "@4ecb/content-domain";

import type {
  CharacterInventoryEntry,
  CharacterOccurrence,
  EvaluationInput,
} from "./evaluator";
import { parseRules } from "./ir";

interface ChildSlot {
  readonly ruleOrdinal: number;
  readonly choiceIndex: number;
  readonly kind: "choice" | "grant";
  readonly minimumLevel: number;
}

function childSlots(
  occurrence: BuildOccurrence,
  entity: ContentEntity | undefined,
): ChildSlot[] {
  if (entity === undefined)
    return occurrence.children.map((_, index) => ({
      ruleOrdinal: index,
      choiceIndex: 0,
      kind: "choice",
      minimumLevel: occurrence.acquiredLevel,
    }));
  return parseRules(entity.id, entity.rules).flatMap<ChildSlot>((rule) => {
    if (rule.kind === "grant")
      return [
        {
          ruleOrdinal: rule.source.ordinal,
          choiceIndex: 0,
          kind: "grant" as const,
          minimumLevel: rule.source.level.minimum,
        },
      ];
    if (rule.kind === "select")
      return Array.from({ length: Math.max(1, rule.number) }, (_, index) => ({
        ruleOrdinal: rule.source.ordinal,
        choiceIndex: index,
        kind: "choice" as const,
        minimumLevel: rule.source.level.minimum,
      }));
    if (rule.kind === "replace")
      return [
        {
          ruleOrdinal: rule.source.ordinal,
          choiceIndex: 0,
          kind: "choice" as const,
          minimumLevel: rule.source.level.minimum,
        },
      ];
    return [];
  });
}

export function findBuildChildIndex(
  occurrence: BuildOccurrence,
  entity: ContentEntity | undefined,
  ruleOrdinal: number,
  choiceIndex: number,
): number {
  const slots = childSlots(occurrence, entity);
  const index = slots.findIndex(
    (slot) =>
      slot.ruleOrdinal === ruleOrdinal && slot.choiceIndex === choiceIndex,
  );
  return index < 0 ? occurrence.children.length : index;
}

export function projectBuildForEvaluation(
  build: CharacterBuild,
  entities: readonly ContentEntity[],
): EvaluationInput {
  const byId = new Map(
    entities.map((entity) => [entity.id.toLocaleLowerCase(), entity]),
  );
  const occurrences: CharacterOccurrence[] = [];

  const visit = (
    occurrence: BuildOccurrence,
    kind: CharacterOccurrence["kind"],
    parentId?: string,
    slot?: ChildSlot,
  ) => {
    if (
      occurrence.identity.definitionId !== undefined &&
      !occurrence.unresolved
    )
      occurrences.push({
        id: occurrence.id,
        definitionId: occurrence.identity.definitionId,
        acquiredLevel: Math.max(
          occurrence.acquiredLevel,
          slot?.minimumLevel ?? occurrence.acquiredLevel,
        ),
        kind,
        ...(parentId === undefined ? {} : { parentId }),
        ...(slot === undefined
          ? {}
          : {
              ruleOrdinal: slot.ruleOrdinal,
              choiceIndex: slot.choiceIndex,
            }),
        legality: occurrence.legality,
        ...(occurrence.replacesId === undefined
          ? {}
          : { replacesId: occurrence.replacesId }),
      });
    const entity =
      occurrence.identity.definitionId === undefined
        ? undefined
        : byId.get(occurrence.identity.definitionId.toLocaleLowerCase());
    const slots = childSlots(occurrence, entity);
    occurrence.children.forEach((child, index) => {
      const childSlot = slots[index] ?? {
        ruleOrdinal: index,
        choiceIndex: 0,
        kind: "choice" as const,
        minimumLevel: child.acquiredLevel,
      };
      visit(child, childSlot.kind, occurrence.id, childSlot);
    });
  };
  for (const frame of build.levels) visit(frame.root, "root");
  for (const occurrence of build.grabbag) visit(occurrence, "grabbag");

  const inventory: CharacterInventoryEntry[] = build.inventory.map((entry) => ({
    id: entry.id,
    ...(entry.name === undefined ? {} : { name: entry.name }),
    definitionIds: entry.elements.flatMap((element) =>
      element.definitionId === undefined ? [] : [element.definitionId],
    ),
    quantity: entry.quantity,
    equippedQuantity: entry.equippedQuantity,
    acquiredLevel: entry.acquiredLevel,
    overrides: entry.overrides,
  }));
  return {
    level: build.effectiveLevel,
    baseAbilities: build.baseAbilities,
    occurrences,
    inventory,
    textStrings: build.textStrings,
  };
}
