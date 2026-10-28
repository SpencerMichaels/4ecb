import {
  isRulesInertTextKey,
  type BuildOccurrence,
  type BuildUserRule,
  type CharacterBuild,
  type CharacterCommand,
} from "@4ecb/character-domain";
import type {
  ContentElementNode,
  ContentEntity,
  ContentNode,
  RuleStatement,
} from "@4ecb/content-domain";

import type {
  CharacterInventoryEntry,
  CharacterOccurrence,
  EvaluatedChoice,
  EvaluationInput,
} from "./evaluator";
import { parseRules } from "./ir";
import {
  inventoryWornSymbolEntryId,
  legacyEquipCount,
  legacyLoadoutHints,
} from "./loadout-slots";

interface ChildSlot {
  readonly ruleOrdinal: number;
  readonly choiceIndex: number;
  readonly kind: "choice" | "grant";
  readonly minimumLevel: number;
  /** A grant's target name or internal ID, as authored. */
  readonly grantTarget?: string;
  /** A select slot's element type: only a record of this type can fill it. */
  readonly type?: string;
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
          grantTarget: rule.name,
        },
      ];
    if (rule.kind === "select")
      return Array.from({ length: Math.max(1, rule.number) }, (_, index) => ({
        ruleOrdinal: rule.source.ordinal,
        choiceIndex: index,
        kind: "choice" as const,
        minimumLevel: rule.source.level.minimum,
        type: rule.type,
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

/**
 * A choice an item's own rules require of its owner (for example Armor of
 * Resistance's damage type), independent of character state. Purely
 * content-derived: no equip state, level, or evaluated legality is involved,
 * so it is safe to call before the item is ever owned (at purchase time).
 */
export interface ItemChoiceSlot {
  readonly ruleOrdinal: number;
  readonly choiceIndex: number;
  readonly type: string;
  readonly category?: string;
  readonly label?: string;
}

/** The item-owned choice slots `entity`'s own rules require, in slot order. */
export function itemChoiceSlots(
  entity: ContentEntity,
): readonly ItemChoiceSlot[] {
  return parseRules(entity.id, entity.rules).flatMap((rule) => {
    if (rule.kind !== "select") return [];
    return Array.from({ length: Math.max(1, rule.number) }, (_, index) => ({
      ruleOrdinal: rule.source.ordinal,
      choiceIndex: index,
      type: rule.type,
      ...(rule.category === undefined ? {} : { category: rule.category }),
      ...(rule.label === undefined ? {} : { label: rule.label }),
    }));
  });
}

interface ChildAssignment {
  /** The rule slot each saved child fills, by child index. */
  readonly slots: readonly (ChildSlot | undefined)[];
  /**
   * Children that are the selection of a container grant nobody claimed,
   * by child index: the grant slot and the container's select slot.
   */
  readonly adopted: ReadonlyMap<
    number,
    { readonly grant: ChildSlot; readonly select: ChildSlot }
  >;
}

/**
 * Pairs saved children with their parent's rule slots. Saved children follow
 * rule order, but a record saved against older content can list a different
 * set of grants, which shifts every later child onto the wrong slot (and lets
 * a stale child suppress a current grant). So, in order:
 * 1. a grant slot claims the saved child that is its target;
 * 2. a child is adopted as the selection of an unclaimed container grant when
 *    its categories name the container (current content wraps formerly direct
 *    traits in selections: Bonus At-Will Power under Human Power Selection,
 *    Dilettante under Half-Elf Power Selection);
 * 3. any other child keeps the slot at its own position if still free and
 *    still eligible: a select slot takes only a record of its own type;
 * 4. the rest fill the first free eligible choice slot in order, never
 *    another grant's slot, and any left over stay unslotted.
 *
 * Native load (VerifySelect, then `D20Choice::CopyLoadedChoice`/`Sync` in
 * `-Module-.cs` ~17121/6956) is purely positional and silently drops a child
 * whose type differs from its slot's. A save made against older content (a
 * Deva saved before its Race Ability Bonus select existed) would then lose a
 * language and leave its real language slot open; step 4 instead re-seats
 * the child in a matching slot (D091: recover rather than copy the loss).
 * Adoption needs content lookups, so callers without them skip step 2.
 */
function assignChildSlots(
  occurrence: BuildOccurrence,
  entity: ContentEntity | undefined,
  entityById?: (id: string) => ContentEntity | undefined,
): ChildAssignment {
  const slots = childSlots(occurrence, entity);
  const assigned: (ChildSlot | undefined)[] = occurrence.children.map(
    () => undefined,
  );
  const adopted = new Map<number, { grant: ChildSlot; select: ChildSlot }>();
  const claimed = new Set<ChildSlot>();
  const lower = (value: string) => value.trim().toLocaleLowerCase();
  const matches = (child: BuildOccurrence, target: string) =>
    [child.identity.definitionId, child.identity.name].some(
      (value) => value !== undefined && lower(value) === lower(target),
    );
  const free = (index: number) =>
    assigned[index] === undefined && !adopted.has(index);
  for (const slot of slots) {
    if (slot.grantTarget === undefined) continue;
    const index = occurrence.children.findIndex(
      (child, childIndex) =>
        free(childIndex) && matches(child, slot.grantTarget!),
    );
    if (index < 0) continue;
    assigned[index] = slot;
    claimed.add(slot);
  }
  if (entityById !== undefined)
    for (const grant of slots) {
      if (grant.grantTarget === undefined || claimed.has(grant)) continue;
      const container = entityById(grant.grantTarget);
      if (container === undefined) continue;
      const select = childSlots(
        { ...occurrence, children: [] },
        container,
      ).find((slot) => slot.kind === "choice");
      if (select === undefined) continue;
      const index = occurrence.children.findIndex((child, childIndex) => {
        if (!free(childIndex) || child.identity.definitionId === undefined)
          return false;
        return (entityById(child.identity.definitionId)?.categories ?? []).some(
          (category) =>
            lower(category) === lower(container.id) ||
            lower(category) === lower(container.name),
        );
      });
      if (index < 0) continue;
      adopted.set(index, { grant, select });
      claimed.add(grant);
    }
  // Native `D20Choice::CopyLoadedChoice` installs a loaded child in its
  // positional select only when the record's type is the select's type.
  const eligible = (child: BuildOccurrence, slot: ChildSlot) =>
    slot.type === undefined ||
    child.identity.type.trim() === "" ||
    lower(child.identity.type) === lower(slot.type);
  occurrence.children.forEach((child, index) => {
    const positional = slots[index];
    if (
      !free(index) ||
      positional === undefined ||
      claimed.has(positional) ||
      !eligible(child, positional)
    )
      return;
    assigned[index] = positional;
    claimed.add(positional);
  });
  const remaining = slots.filter(
    (slot) => !claimed.has(slot) && slot.grantTarget === undefined,
  );
  occurrence.children.forEach((child, index) => {
    if (!free(index)) return;
    const slot = remaining.find(
      (candidate) => !claimed.has(candidate) && eligible(child, candidate),
    );
    if (slot === undefined) return;
    assigned[index] = slot;
    claimed.add(slot);
  });
  return { slots: assigned, adopted };
}

export function findBuildChildIndex(
  occurrence: BuildOccurrence,
  entity: ContentEntity | undefined,
  ruleOrdinal: number,
  choiceIndex: number,
): number {
  const matching = (slot: ChildSlot | undefined) =>
    slot !== undefined &&
    slot.ruleOrdinal === ruleOrdinal &&
    slot.choiceIndex === choiceIndex;
  const existing = assignChildSlots(occurrence, entity).slots.findIndex(
    matching,
  );
  if (existing >= 0) return existing;
  const index = childSlots(occurrence, entity).findIndex(matching);
  // The positional child, if any, belongs to another slot (or no slot, when
  // it is a saved child no slot can take): append rather than overwrite it.
  return index < 0 || index < occurrence.children.length
    ? occurrence.children.length
    : index;
}

function findBuildOccurrence(
  build: CharacterBuild,
  id: string,
): BuildOccurrence | undefined {
  const visit = (occurrence: BuildOccurrence): BuildOccurrence | undefined =>
    occurrence.id === id
      ? occurrence
      : occurrence.children.map(visit).find((value) => value !== undefined);
  return [...build.levels.map((frame) => frame.root), ...build.grabbag]
    .map(visit)
    .find((value) => value !== undefined);
}

/**
 * Whether an evaluated occurrence exists only in the evaluator's graph and
 * can be materialized at its slot: a grant, or a rule default (a choice
 * occurrence stored nowhere, unlike a spellbook alternate or item choice).
 */
function isGeneratedOccurrence(
  build: CharacterBuild,
  occurrence: CharacterOccurrence,
): boolean {
  if (occurrence.kind === "grant") return true;
  if (occurrence.kind !== "choice") return false;
  const stored = (value: BuildOccurrence): boolean =>
    value.id === occurrence.id || value.children.some(stored);
  return (
    findBuildOccurrence(build, occurrence.id) === undefined &&
    !build.alternates.some((alternate) => stored(alternate.choice)) &&
    findInventoryProvider(build, occurrence.id) === undefined
  );
}

/**
 * An inventory-owned choice provider: an item definition (the evaluator's
 * synthetic `<entry>:definition:<index>` provider) or an occurrence stored
 * beneath one, with a way to rebuild the entry around new children.
 */
/**
 * The evaluated level of everything the character owns. Inventory is one
 * current state (D097): an evaluation at an earlier viewed level still
 * carries, wears and wields today's holdings, so they enter from level 1.
 */
const HOLDING_LEVEL = 1;

function atHoldingLevel(occurrence: BuildOccurrence): BuildOccurrence {
  return {
    ...occurrence,
    acquiredLevel: HOLDING_LEVEL,
    children: occurrence.children.map(atHoldingLevel),
  };
}

/**
 * Current holdings as evaluator inventory entries, present at every
 * evaluated level (D097). The sheet reads the same entries so its holding
 * IDs and counts match the evaluation's.
 */
export function evaluationInventory(
  inventory: CharacterBuild["inventory"],
  wornSymbolEntryId?: string,
): CharacterInventoryEntry[] {
  return inventory.map((entry) => ({
    id: entry.id,
    ...(entry.name === undefined ? {} : { name: entry.name }),
    definitionIds: entry.elements.flatMap((element) =>
      element.definitionId === undefined ? [] : [element.definitionId],
    ),
    quantity: entry.quantity,
    // Native keeps the holy symbol slot out of the equip count.
    equippedQuantity: legacyEquipCount(entry),
    ...(entry.id === wornSymbolEntryId ? { wornSymbol: true } : {}),
    acquiredLevel: HOLDING_LEVEL,
    overrides: entry.overrides,
    ...(entry.equippedSlots === undefined
      ? {}
      : { equippedSlots: entry.equippedSlots }),
    ...(entry.wieldedTwoHanded === undefined
      ? {}
      : { wieldedTwoHanded: entry.wieldedTwoHanded }),
    ...(entry.augmentEntryId === undefined
      ? {}
      : { augmentEntryId: entry.augmentEntryId }),
  }));
}

function findInventoryProvider(
  build: CharacterBuild,
  id: string,
):
  | {
      readonly occurrence: BuildOccurrence;
      readonly withChildren: (
        children: readonly BuildOccurrence[],
      ) => CharacterBuild["inventory"][number];
    }
  | undefined {
  for (const entry of build.inventory)
    for (const [elementIndex, element] of entry.elements.entries()) {
      const withElementChildren = (children: readonly BuildOccurrence[]) => ({
        ...entry,
        elements: entry.elements.map((value, index) =>
          index === elementIndex ? { ...value, children } : value,
        ),
      });
      const root: BuildOccurrence = {
        id: `${entry.id}:definition:${elementIndex}`,
        identity: element,
        acquiredLevel: entry.acquiredLevel,
        legality: entry.legality,
        children: element.children ?? [],
        unresolved: element.definitionId === undefined,
      };
      const search = (
        occurrence: BuildOccurrence,
        rebuild: (
          children: readonly BuildOccurrence[],
        ) => ReturnType<typeof withElementChildren>,
      ):
        | {
            occurrence: BuildOccurrence;
            withChildren: typeof rebuild;
          }
        | undefined => {
        if (occurrence.id === id) return { occurrence, withChildren: rebuild };
        for (const [childIndex, child] of occurrence.children.entries()) {
          const found = search(child, (children) =>
            rebuild(
              occurrence.children.map((value, index) =>
                index === childIndex ? { ...child, children } : value,
              ),
            ),
          );
          if (found !== undefined) return found;
        }
        return undefined;
      };
      const found = search(root, withElementChildren);
      if (found !== undefined) return found;
    }
  return undefined;
}

/**
 * Creates a durable choice command, materializing generated grant ancestors
 * back to the nearest saved occurrence when the provider exists only in the
 * evaluator's fixed-point graph.
 */
export function commandForEvaluatedChoice(
  build: CharacterBuild,
  choice: EvaluatedChoice,
  evaluatedOccurrences: readonly CharacterOccurrence[],
  entities: readonly ContentEntity[],
  selected: BuildOccurrence,
  placeholderId: (index: number) => string,
): CharacterCommand | undefined {
  const byId = new Map(
    entities.map((entity) => [entity.id.toLocaleLowerCase(), entity]),
  );
  const durableProvider = findBuildOccurrence(
    build,
    choice.providerOccurrenceId,
  );
  const evaluatedProvider = evaluatedOccurrences.find(
    (occurrence) => occurrence.id === choice.providerOccurrenceId,
  );
  const providerEntity =
    evaluatedProvider === undefined
      ? undefined
      : byId.get(evaluatedProvider.definitionId.toLocaleLowerCase());
  const atStorageLevel = (
    occurrence: BuildOccurrence,
    acquiredLevel: number,
  ): BuildOccurrence => ({
    ...occurrence,
    acquiredLevel,
    children: occurrence.children.map((child) =>
      atStorageLevel(child, acquiredLevel),
    ),
  });
  const chooseAt = (
    parent: BuildOccurrence,
    index: number,
    occurrence: BuildOccurrence,
  ): CharacterCommand => {
    const choose = (slot: number, value: BuildOccurrence) =>
      ({
        kind: "choose",
        parentId: parent.id,
        index: slot,
        occurrence: value,
      }) as const;
    const commands = Array.from(
      { length: Math.max(0, index - parent.children.length) },
      (_, offset) => {
        const slot = parent.children.length + offset;
        return choose(slot, {
          id: placeholderId(slot),
          identity: { name: "", type: "" },
          acquiredLevel: parent.acquiredLevel,
          legality: "rules-legal",
          children: [],
          unresolved: true,
        });
      },
    );
    commands.push(
      choose(index, atStorageLevel(occurrence, parent.acquiredLevel)),
    );
    return commands.length === 1
      ? (commands[0] as CharacterCommand)
      : { kind: "batch", commands };
  };
  const providerRule =
    providerEntity === undefined
      ? undefined
      : parseRules(providerEntity.id, providerEntity.rules).find(
          (rule) =>
            rule.source.ordinal === choice.ruleOrdinal &&
            rule.kind === "select",
        );
  const generatedWithChild = (
    occurrence: CharacterOccurrence,
    entity: ContentEntity,
    ruleOrdinal: number,
    choiceIndex: number,
    child: BuildOccurrence,
  ): BuildOccurrence => {
    const base: BuildOccurrence = {
      id: occurrence.id,
      identity: {
        definitionId: entity.id,
        name: entity.name,
        type: entity.type,
      },
      acquiredLevel: occurrence.acquiredLevel,
      legality: "rules-legal",
      children: [],
      unresolved: false,
    };
    const index = findBuildChildIndex(base, entity, ruleOrdinal, choiceIndex);
    return {
      ...base,
      children: [
        ...Array.from({ length: index }, (_, slot): BuildOccurrence => ({
          id: placeholderId(slot),
          identity: { name: "", type: "" },
          acquiredLevel: occurrence.acquiredLevel,
          legality: "rules-legal",
          children: [],
          unresolved: true,
        })),
        child,
      ],
    };
  };
  // A generated provider is a grant or a rule default (a default selection
  // that has choices of its own, like Eldritch Blast's ability).
  const generated = (occurrence: CharacterOccurrence) =>
    isGeneratedOccurrence(build, occurrence);
  /**
   * Stores `materialized` (the generated `cursor`, already carrying its new
   * child) beneath the nearest saved ancestor, materializing each generated
   * ancestor in between.
   */
  const materializeBeneathSaved = (
    start: CharacterOccurrence,
    occurrence: BuildOccurrence,
  ): CharacterCommand | undefined => {
    let cursor = start;
    let materialized = occurrence;
    for (let depth = 0; depth < evaluatedOccurrences.length; depth += 1) {
      if (cursor.parentId === undefined || cursor.ruleOrdinal === undefined)
        return undefined;
      const durableParent = findBuildOccurrence(build, cursor.parentId);
      if (durableParent !== undefined) {
        const parentEvaluation = evaluatedOccurrences.find(
          (value) => value.id === durableParent.id,
        );
        const parentEntity =
          parentEvaluation === undefined
            ? undefined
            : byId.get(parentEvaluation.definitionId.toLocaleLowerCase());
        return chooseAt(
          durableParent,
          findBuildChildIndex(
            durableParent,
            parentEntity,
            cursor.ruleOrdinal,
            cursor.choiceIndex ?? 0,
          ),
          materialized,
        );
      }
      const evaluatedParent = evaluatedOccurrences.find(
        (value) => value.id === cursor.parentId,
      );
      if (evaluatedParent === undefined || !generated(evaluatedParent))
        return undefined;
      const parentEntity = byId.get(
        evaluatedParent.definitionId.toLocaleLowerCase(),
      );
      if (parentEntity === undefined) return undefined;
      materialized = generatedWithChild(
        evaluatedParent,
        parentEntity,
        cursor.ruleOrdinal,
        cursor.choiceIndex ?? 0,
        materialized,
      );
      cursor = evaluatedParent;
    }
    return undefined;
  };
  if (
    providerEntity !== undefined &&
    providerRule?.kind === "select" &&
    providerRule.spellbook !== undefined
  ) {
    const spellbook = providerRule.spellbook;
    const sameProvider = (alternate: CharacterBuild["alternates"][number]) =>
      alternate.provider.definitionId !== undefined
        ? alternate.provider.definitionId.toLocaleLowerCase() ===
          providerEntity.id.toLocaleLowerCase()
        : alternate.provider.name.toLocaleLowerCase() ===
            providerEntity.name.toLocaleLowerCase() &&
          alternate.provider.type.toLocaleLowerCase() ===
            providerEntity.type.toLocaleLowerCase();
    const existing = build.alternates.find(
      (alternate) =>
        alternate.choice.id === choice.selectedOccurrenceId ||
        (sameProvider(alternate) &&
          alternate.selectName.toLocaleLowerCase() ===
            spellbook.toLocaleLowerCase()),
    );
    const putAlternate: CharacterCommand = {
      kind: "put-alternate",
      alternate: {
        id: existing?.id ?? `web:alternate:${selected.id}`,
        selectName: existing?.selectName ?? spellbook,
        provider: existing?.provider ?? {
          definitionId: providerEntity.id,
          name: providerEntity.name,
          type: providerEntity.type,
        },
        choice: atStorageLevel(selected, choice.level),
      },
    };
    // An alternate finds its provider among saved occurrences, so a
    // generated provider (the Spellbook a wizard's class grants) is saved
    // first; otherwise the pick would land in the grabbag.
    if (
      durableProvider !== undefined ||
      evaluatedProvider === undefined ||
      !generated(evaluatedProvider)
    )
      return putAlternate;
    const materialize = materializeBeneathSaved(evaluatedProvider, {
      id: evaluatedProvider.id,
      identity: {
        definitionId: providerEntity.id,
        name: providerEntity.name,
        type: providerEntity.type,
      },
      acquiredLevel: evaluatedProvider.acquiredLevel,
      legality: "rules-legal",
      children: [],
      unresolved: false,
    });
    return materialize === undefined
      ? putAlternate
      : { kind: "batch", commands: [materialize, putAlternate] };
  }
  const inventoryProvider = findInventoryProvider(
    build,
    choice.providerOccurrenceId,
  );
  if (inventoryProvider !== undefined) {
    const { occurrence } = inventoryProvider;
    const index = findBuildChildIndex(
      occurrence,
      providerEntity ??
        (occurrence.identity.definitionId === undefined
          ? undefined
          : byId.get(occurrence.identity.definitionId.toLocaleLowerCase())),
      choice.ruleOrdinal,
      choice.index,
    );
    const children = [
      ...occurrence.children,
      ...Array.from(
        { length: Math.max(0, index - occurrence.children.length) },
        (_, offset): BuildOccurrence => ({
          id: placeholderId(occurrence.children.length + offset),
          identity: { name: "", type: "" },
          acquiredLevel: occurrence.acquiredLevel,
          legality: "rules-legal",
          children: [],
          unresolved: true,
        }),
      ),
    ];
    children[index] = atStorageLevel(selected, occurrence.acquiredLevel);
    return {
      kind: "put-inventory",
      entry: inventoryProvider.withChildren(children),
    };
  }
  if (durableProvider !== undefined) {
    const index = findBuildChildIndex(
      durableProvider,
      providerEntity,
      choice.ruleOrdinal,
      choice.index,
    );
    return chooseAt(durableProvider, index, selected);
  }
  if (
    evaluatedProvider === undefined ||
    !generated(evaluatedProvider) ||
    providerEntity === undefined
  )
    return undefined;
  return materializeBeneathSaved(
    evaluatedProvider,
    generatedWithChild(
      evaluatedProvider,
      providerEntity,
      choice.ruleOrdinal,
      choice.index,
      selected,
    ),
  );
}

/**
 * Reports whether an evaluated choice has a durable provider, or a complete
 * generated-grant ancestry that can be materialized beneath one.
 *
 * Generated providers may be nested several grants deep (racial traits are a
 * common example), so callers must not assume that only the immediate parent
 * needs to exist in the stored build.
 */
export function canMaterializeEvaluatedChoiceProvider(
  build: CharacterBuild,
  choice: EvaluatedChoice,
  evaluatedOccurrences: readonly CharacterOccurrence[],
  entities: readonly ContentEntity[],
): boolean {
  if (
    findBuildOccurrence(build, choice.providerOccurrenceId) !== undefined ||
    findInventoryProvider(build, choice.providerOccurrenceId) !== undefined
  )
    return true;

  const byId = new Map(
    entities.map((entity) => [entity.id.toLocaleLowerCase(), entity]),
  );
  let cursor = evaluatedOccurrences.find(
    (occurrence) => occurrence.id === choice.providerOccurrenceId,
  );
  for (let depth = 0; depth < evaluatedOccurrences.length; depth += 1) {
    if (
      cursor === undefined ||
      !isGeneratedOccurrence(build, cursor) ||
      cursor.parentId === undefined ||
      cursor.ruleOrdinal === undefined ||
      !byId.has(cursor.definitionId.toLocaleLowerCase())
    )
      return false;
    if (findBuildOccurrence(build, cursor.parentId) !== undefined) return true;
    cursor = evaluatedOccurrences.find(
      (occurrence) => occurrence.id === cursor?.parentId,
    );
  }
  return false;
}

const sharedEntityIndexCache = new WeakMap<
  readonly ContentEntity[],
  ReadonlyMap<string, ContentEntity>
>();

function sharedEntityIndex(
  entities: readonly ContentEntity[],
): ReadonlyMap<string, ContentEntity> {
  const cached = sharedEntityIndexCache.get(entities);
  if (cached !== undefined) return cached;
  const created = new Map(
    entities.map((entity) => [entity.id.toLocaleLowerCase(), entity]),
  );
  sharedEntityIndexCache.set(entities, created);
  return created;
}

export function projectBuildForEvaluation(
  build: CharacterBuild,
  entities: readonly ContentEntity[],
): EvaluationInput {
  const ruleChildren = (rule: BuildUserRule): ContentNode[] => [
    ...(rule.text.length === 0
      ? []
      : [{ kind: "text" as const, value: rule.text }]),
    ...rule.children.map((child): ContentElementNode => ({
      kind: "element",
      name: child.name,
      attributes: child.attributes,
      children: ruleChildren(child),
    })),
  ];
  const localEntities: ContentEntity[] = build.levels.flatMap(
    (frame, frameIndex) => {
      if (frame.userEdit === undefined) return [];
      const id = `ID_INTERNAL_USER_EDIT_${frame.userEdit.root.id}`;
      const rules: RuleStatement[] = frame.userEdit.rules.map(
        (rule, ordinal) => ({
          name: rule.name,
          attributes: rule.attributes,
          text: rule.text,
          children: ruleChildren(rule),
          ordinal,
        }),
      );
      return [
        {
          id,
          name: frame.userEdit.root.identity.name,
          type: frame.userEdit.root.identity.type,
          // Character-local rules are intrinsically available even when the
          // campaign configures a restricted source-entitlement list.
          source: "Core",
          sources: ["Core"],
          attributes: [],
          categories: [],
          specifics: [],
          rules,
          description: "",
          extensions: [],
          provenance: {
            sourceKey: "character-user-edit",
            sourceOrdinal: frameIndex,
          },
        },
      ];
    },
  );
  const sharedById = sharedEntityIndex(entities);
  const localById = new Map(
    localEntities.map((entity) => [entity.id.toLocaleLowerCase(), entity]),
  );
  const entityById = (id: string): ContentEntity | undefined =>
    localById.get(id.toLocaleLowerCase()) ??
    sharedById.get(id.toLocaleLowerCase());
  const occurrences: CharacterOccurrence[] = [];

  const visit = (
    occurrence: BuildOccurrence,
    kind: CharacterOccurrence["kind"],
    parentId?: string,
    slot?: ChildSlot,
    parentEffectiveLevel?: number,
  ) => {
    const effectiveAcquiredLevel = Math.max(
      occurrence.acquiredLevel,
      slot?.minimumLevel ?? occurrence.acquiredLevel,
      parentEffectiveLevel ?? occurrence.acquiredLevel,
    );
    if (
      occurrence.identity.definitionId !== undefined &&
      !occurrence.unresolved
    )
      occurrences.push({
        id: occurrence.id,
        definitionId: occurrence.identity.definitionId,
        acquiredLevel: effectiveAcquiredLevel,
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
        : entityById(occurrence.identity.definitionId);
    const { slots, adopted } = assignChildSlots(occurrence, entity, entityById);
    occurrence.children.forEach((child, index) => {
      const adoption = adopted.get(index);
      if (adoption !== undefined) {
        // The evaluator materializes the container grant under this ID.
        visit(
          child,
          "choice",
          `${occurrence.id}:grant:${adoption.grant.ruleOrdinal}`,
          adoption.select,
          effectiveAcquiredLevel,
        );
        return;
      }
      // A saved child no current slot can take stays owned and preserved,
      // but fills no choice: it has no rule position.
      const childSlot = slots[index];
      visit(
        child,
        childSlot?.kind ?? "choice",
        occurrence.id,
        childSlot,
        effectiveAcquiredLevel,
      );
    });
  };
  for (const frame of build.levels) {
    visit(frame.root, "root");
    if (frame.userEdit !== undefined)
      visit(
        {
          ...frame.userEdit.root,
          identity: {
            ...frame.userEdit.root.identity,
            definitionId: `ID_INTERNAL_USER_EDIT_${frame.userEdit.root.id}`,
          },
          acquiredLevel: frame.level,
          unresolved: false,
        },
        "root",
      );
  }
  for (const occurrence of build.grabbag) visit(occurrence, "grabbag");
  // Legacy spellbooks and similar "prepared versus known" features serialize
  // the non-primary selection in an <alternate> envelope. On load, the legacy
  // engine resolves its provider identity and SelectName back to the matching
  // spellbook select slot, then installs the alternate element in that slot.
  // Preserve the envelope in CharacterBuild while projecting the same logical
  // parent/rule relationship for evaluation. Unknown providers remain owned as
  // grabbag evidence rather than being discarded.
  for (const alternate of build.alternates) {
    const provider = occurrences.find((occurrence) => {
      const providerEntity = entityById(occurrence.definitionId);
      const identityMatches =
        alternate.provider.definitionId !== undefined
          ? occurrence.definitionId.toLocaleLowerCase() ===
            alternate.provider.definitionId.toLocaleLowerCase()
          : providerEntity?.name.toLocaleLowerCase() ===
              alternate.provider.name.toLocaleLowerCase() &&
            providerEntity.type.toLocaleLowerCase() ===
              alternate.provider.type.toLocaleLowerCase();
      return (
        identityMatches &&
        providerEntity !== undefined &&
        parseRules(providerEntity.id, providerEntity.rules).some(
          (rule) =>
            rule.kind === "select" &&
            rule.spellbook?.toLocaleLowerCase() ===
              alternate.selectName.toLocaleLowerCase(),
        )
      );
    });
    const providerEntity =
      provider === undefined ? undefined : entityById(provider.definitionId);
    const selectRule =
      providerEntity === undefined
        ? undefined
        : parseRules(providerEntity.id, providerEntity.rules).find(
            (rule) =>
              rule.kind === "select" &&
              rule.spellbook?.toLocaleLowerCase() ===
                alternate.selectName.toLocaleLowerCase(),
          );
    if (provider === undefined || selectRule?.kind !== "select") {
      visit(alternate.choice, "grabbag");
      continue;
    }
    visit(
      alternate.choice,
      "choice",
      provider.id,
      {
        ruleOrdinal: selectRule.source.ordinal,
        choiceIndex: 0,
        kind: "choice",
        minimumLevel: selectRule.source.level.minimum,
      },
      provider.acquiredLevel,
    );
  }
  // Item-specific selections (for example an Armor of Resistance damage type)
  // are serialized beneath the relevant loot definition, not in the level
  // tree. Project them beneath the evaluator's synthetic inventory provider so
  // an already-completed item choice is not presented as unresolved. Like the
  // holding itself, its choices apply at every evaluated level.
  for (const entry of build.inventory) {
    entry.elements.forEach((element, definitionIndex) => {
      const children = (element.children ?? []).map(atHoldingLevel);
      if (children.length === 0) return;
      const providerId = `${entry.id}:definition:${definitionIndex}`;
      const provider: BuildOccurrence = {
        id: providerId,
        identity: element,
        acquiredLevel: HOLDING_LEVEL,
        legality: entry.legality,
        children,
        unresolved: element.definitionId === undefined,
      };
      const entity =
        element.definitionId === undefined
          ? undefined
          : entityById(element.definitionId);
      const { slots } = assignChildSlots(provider, entity);
      children.forEach((child, index) => {
        const slot = slots[index];
        visit(child, slot?.kind ?? "choice", providerId, slot, HOLDING_LEVEL);
      });
    });
  }

  // The legacy builder sometimes serializes a race's selected variable ability
  // bonus inside its generated Grants subtree, alongside the race's fixed
  // bonus. Recover that choice only when the race rule's category identifies a
  // single matching descendant; ambiguous or unfamiliar layouts remain
  // unresolved for the normal evaluator diagnostic.
  for (const provider of [...occurrences]) {
    const providerEntity = entityById(provider.definitionId);
    if (providerEntity === undefined) continue;
    for (const rule of parseRules(providerEntity.id, providerEntity.rules)) {
      if (
        rule.kind !== "select" ||
        rule.type.toLocaleLowerCase() !== "race ability bonus" ||
        rule.number !== 1 ||
        rule.category === undefined ||
        occurrences.some(
          (candidate) =>
            candidate.parentId === provider.id &&
            candidate.ruleOrdinal === rule.source.ordinal,
        )
      )
        continue;
      const categoryNames = new Set(
        rule.category
          .split("|")
          .map((name) => name.trim().toLocaleLowerCase())
          .filter(Boolean),
      );
      const isDescendant = (candidate: CharacterOccurrence): boolean => {
        let parentId = candidate.parentId;
        for (
          let depth = 0;
          parentId !== undefined && depth < occurrences.length;
          depth += 1
        ) {
          if (parentId === provider.id) return true;
          parentId = occurrences.find(
            (parent) => parent.id === parentId,
          )?.parentId;
        }
        return false;
      };
      const matches = occurrences.filter((candidate) => {
        if (!isDescendant(candidate)) return false;
        const definition = entityById(candidate.definitionId);
        return (
          definition?.type.toLocaleLowerCase() === "race ability bonus" &&
          categoryNames.has(definition.name.toLocaleLowerCase())
        );
      });
      if (matches.length !== 1) continue;
      const selected = matches[0]!;
      const index = occurrences.findIndex(
        (candidate) => candidate.id === selected.id,
      );
      occurrences[index] = {
        ...selected,
        parentId: provider.id,
        ruleOrdinal: rule.source.ordinal,
        choiceIndex: 0,
        kind: "choice",
      };
    }
  }

  const holdingRecords = new Map(
    build.inventory.flatMap((entry) =>
      entry.elements.flatMap(({ definitionId }) => {
        const entity =
          definitionId === undefined ? undefined : entityById(definitionId);
        return entity === undefined
          ? []
          : [[entity.id.toLocaleLowerCase(), entity] as const];
      }),
    ),
  );
  const inventory: CharacterInventoryEntry[] = [
    ...evaluationInventory(
      build.inventory,
      inventoryWornSymbolEntryId(
        build.inventory,
        holdingRecords,
        legacyLoadoutHints(build.textStrings),
      ),
    ),
    // Known rituals are owned elements whose own rules (a community ritual's
    // granted power) still apply. They enter evaluation exactly as an
    // unequipped ritual holding did before they left the inventory.
    ...build.known.map((entry) => ({
      id: entry.id,
      ...(entry.legacyLoot?.name === undefined
        ? {}
        : { name: entry.legacyLoot.name }),
      definitionIds:
        entry.element.definitionId === undefined
          ? []
          : [entry.element.definitionId],
      quantity: 1,
      equippedQuantity: 0,
      acquiredLevel: entry.acquiredLevel,
      overrides: entry.legacyLoot?.overrides ?? {},
    })),
  ];
  // Wallet edits and free-text character details/notes change
  // build.textStrings but never affect rules evaluation. Excluding them keeps
  // otherwise-identical builds hashing to the same EvaluationInput, so
  // MemoizedRulesClient's caches reuse the prior result instead of forcing a
  // full re-evaluation for edits that can't change it.
  const textStrings = Object.fromEntries(
    Object.entries(build.textStrings).filter(
      ([key]) => !isRulesInertTextKey(key),
    ),
  );
  return {
    level: build.effectiveLevel,
    baseAbilities: build.baseAbilities,
    occurrences,
    inventory,
    textStrings,
    localEntities,
  };
}
