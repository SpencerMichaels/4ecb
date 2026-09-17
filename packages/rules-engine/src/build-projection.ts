import type {
  BuildOccurrence,
  BuildUserRule,
  CharacterBuild,
  CharacterCommand,
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
    return {
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
  }
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
    evaluatedProvider?.kind !== "grant" ||
    evaluatedProvider.parentId === undefined ||
    evaluatedProvider.ruleOrdinal === undefined ||
    providerEntity === undefined
  )
    return undefined;
  let cursor = evaluatedProvider;
  let materialized = generatedWithChild(
    cursor,
    providerEntity,
    choice.ruleOrdinal,
    choice.index,
    selected,
  );
  for (let depth = 0; depth < evaluatedOccurrences.length; depth += 1) {
    if (cursor.parentId === undefined || cursor.ruleOrdinal === undefined)
      return undefined;
    const durableParent = findBuildOccurrence(build, cursor.parentId);
    if (durableParent !== undefined) {
      const parentEvaluation = evaluatedOccurrences.find(
        (occurrence) => occurrence.id === durableParent.id,
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
      (occurrence) => occurrence.id === cursor.parentId,
    );
    if (evaluatedParent?.kind !== "grant") return undefined;
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
  if (findBuildOccurrence(build, choice.providerOccurrenceId) !== undefined)
    return true;

  const byId = new Map(
    entities.map((entity) => [entity.id.toLocaleLowerCase(), entity]),
  );
  let cursor = evaluatedOccurrences.find(
    (occurrence) => occurrence.id === choice.providerOccurrenceId,
  );
  for (let depth = 0; depth < evaluatedOccurrences.length; depth += 1) {
    if (
      cursor?.kind !== "grant" ||
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
    const slots = childSlots(occurrence, entity);
    occurrence.children.forEach((child, index) => {
      const childSlot = slots[index] ?? {
        ruleOrdinal: index,
        choiceIndex: 0,
        kind: "choice" as const,
        minimumLevel: child.acquiredLevel,
      };
      visit(
        child,
        childSlot.kind,
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
  // an already-completed item choice is not presented as unresolved.
  for (const entry of build.inventory) {
    entry.elements.forEach((element, definitionIndex) => {
      const children = element.children ?? [];
      if (children.length === 0) return;
      const providerId = `${entry.id}:definition:${definitionIndex}`;
      const provider: BuildOccurrence = {
        id: providerId,
        identity: element,
        acquiredLevel: entry.acquiredLevel,
        legality: entry.legality,
        children,
        unresolved: element.definitionId === undefined,
      };
      const entity =
        element.definitionId === undefined
          ? undefined
          : entityById(element.definitionId);
      const slots = childSlots(provider, entity);
      children.forEach((child, index) => {
        const slot = slots[index] ?? {
          ruleOrdinal: index,
          choiceIndex: 0,
          kind: "choice" as const,
          minimumLevel: child.acquiredLevel,
        };
        visit(child, slot.kind, providerId, slot, entry.acquiredLevel);
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
    localEntities,
  };
}
