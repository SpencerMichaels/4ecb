/**
 * The saved-selection invariant: every element a legacy save holds is either
 * active in the modern evaluation or accounted for by a stated reason, and
 * every active modern element the save never held is classified. Anything
 * else is a silent drop (or an unexplained extra). `pnpm
 * audit:saved-selections` runs it over the private corpus; public tests run
 * it on synthetic saves.
 *
 * What the save holds: every RulesElement in the Level history (choices and
 * the grants legacy wrote under them), the grabbag, `<alternate>` choices,
 * per-level UserEdit roots, choices nested under loot definitions, and the
 * current loot (CharacterSheet LootTally). Blank `name="" type=""` slots are
 * legacy placeholders for unfilled choices and are only counted.
 *
 * A saved element gets the first status that applies:
 * - active: the occurrence, or another occurrence of its definition, is in
 *   `EvaluatedCharacter.occurrences`;
 * - replaced / retrained: `replacedSelections`, or a later saved element's
 *   `replaces` names it;
 * - dormant (D043): `dormantSelections`;
 * - diagnostic: an engine diagnostic names it (missing definition,
 *   unslotted, grant target missing…), import name matching left its saved
 *   ID unmatched, or the pack lacks its definition;
 * - under-provider: an ancestor is itself accounted for (its subtree goes
 *   with it);
 * - legacy-inactive: legacy's own RulesElementTally lacks it, so the legacy
 *   builder did not apply it either (a storage artifact, D098);
 * - houserule: saved with `legality="houserule"`;
 * - silent-drop: none of the above.
 * Each result also says whether legacy applied it (`legacyActive`): an
 * accounted element legacy applied is a disagreement with the oracle even
 * though it has a reason.
 */
import type { BuildOccurrence } from "@4ecb/character-domain";
import type { ContentEntity } from "@4ecb/content-domain";
import { parseRules, type EvaluatedCharacter } from "@4ecb/rules-engine";

import type { Dnd4eImportResult } from ".";

const key = (value: string) => value.trim().toLocaleLowerCase();

export type SavedElementStatus =
  | "active"
  | "replaced"
  | "retrained"
  | "dormant"
  | "diagnostic"
  | "under-provider"
  | "legacy-inactive"
  | "houserule"
  | "silent-drop";

export interface SavedElementResult {
  readonly path: string;
  readonly id: string;
  readonly definitionId: string;
  readonly name: string;
  readonly type: string;
  readonly level: number;
  readonly status: SavedElementStatus;
  readonly detail?: string;
  /** For a silent drop: the closest saved ancestor that is also dropped. */
  readonly droppedUnder?: string;
  /** Whether legacy's RulesElementTally holds it (legacy applied it). */
  readonly legacyActive: boolean;
}

export interface SavedLootResult {
  readonly name: string;
  readonly definitionIds: readonly string[];
  readonly savedCount: number;
  readonly modernCount: number;
  readonly status: "present" | "diagnostic" | "silent-drop";
  readonly detail?: string;
}

export interface ModernExtraResult {
  readonly definitionId: string;
  readonly name: string;
  readonly type: string;
  readonly kind: string;
  readonly provider: string;
  /**
   * content-grant: an unconditional grant of an element the save holds, so
   * the content the save was made with differs from this pack;
   * conditional-grant: a grant whose `requires` modern found met and legacy
   * did not; recovered-selection: a choice build-projection recovered;
   * under-extra: granted by another extra; unexplained: anything else.
   */
  readonly cause:
    | "content-grant"
    | "conditional-grant"
    | "recovered-selection"
    | "under-extra"
    | "unexplained";
  readonly detail?: string;
}

export interface SavedSelectionAudit {
  readonly blankSlots: number;
  readonly elements: readonly SavedElementResult[];
  readonly loot: readonly SavedLootResult[];
  readonly extras: readonly ModernExtraResult[];
}

interface SavedNode {
  readonly occurrence: BuildOccurrence;
  readonly path: string;
  readonly parent?: SavedNode;
}

function savedNodes(build: Dnd4eImportResult["build"]) {
  const nodes: SavedNode[] = [];
  let blankSlots = 0;
  const visit = (
    occurrence: BuildOccurrence,
    path: string,
    parent?: SavedNode,
  ) => {
    const { name, type, definitionId } = occurrence.identity;
    if (definitionId === undefined && name === "" && type === "") {
      blankSlots += 1;
      return;
    }
    const node: SavedNode = {
      occurrence,
      path: `${path} > ${name || definitionId}`,
      ...(parent === undefined ? {} : { parent }),
    };
    nodes.push(node);
    for (const child of occurrence.children) visit(child, node.path, node);
  };
  for (const frame of build.levels) {
    visit(frame.root, `L${frame.level}`);
    if (frame.userEdit !== undefined)
      visit(frame.userEdit.root, `L${frame.level} UserEdit`);
  }
  for (const occurrence of build.grabbag) visit(occurrence, "grabbag");
  for (const alternate of build.alternates)
    visit(alternate.choice, `alternate ${alternate.selectName}`);
  for (const entry of build.inventory)
    for (const element of entry.elements)
      for (const child of element.children ?? [])
        visit(child, `loot ${element.name}`);
  return { nodes, blankSlots };
}

export function auditSavedSelections(
  imported: Dnd4eImportResult,
  evaluated: EvaluatedCharacter,
  entities: readonly ContentEntity[],
): SavedSelectionAudit {
  const byId = new Map(entities.map((entity) => [key(entity.id), entity]));
  const { nodes, blankSlots } = savedNodes(imported.build);
  const activeIds = new Set(evaluated.occurrences.map(({ id }) => id));
  const activeDefinitions = new Set(evaluated.activeDefinitionIds.map(key));
  const replaced = new Set(
    (evaluated.replacedSelections ?? []).map(({ id }) => id),
  );
  const dormant = new Map(
    (evaluated.dormantSelections ?? []).map((selection) => [
      selection.occurrence.id,
      selection,
    ]),
  );
  const retrainedBy = new Map<string, BuildOccurrence>();
  for (const { occurrence } of nodes)
    if (occurrence.replacesId !== undefined)
      retrainedBy.set(occurrence.replacesId, occurrence);
  const diagnosticsByOccurrence = new Map<string, string[]>();
  for (const diagnostic of evaluated.diagnostics)
    if (diagnostic.occurrenceId !== undefined)
      diagnosticsByOccurrence.set(diagnostic.occurrenceId, [
        ...(diagnosticsByOccurrence.get(diagnostic.occurrenceId) ?? []),
        `${diagnostic.code}: ${diagnostic.message}`,
      ]);
  const matching = imported.report.definitionMatching;
  const importNamed = new Map<string, string>();
  for (const entry of matching?.ambiguous ?? [])
    importNamed.set(key(entry.savedId), "import: ambiguous name match");
  for (const entry of matching?.unmatched ?? [])
    importNamed.set(key(entry.savedId), "import: missing, no name match");
  const tally = imported.snapshot.selectedRules;
  const tallyIds = new Set(
    tally.flatMap((rule) => (rule.id === undefined ? [] : [key(rule.id)])),
  );
  const tallyNames = new Set(
    tally.map((rule) => `${key(rule.type)}\0${key(rule.name)}`),
  );
  const inTally = (occurrence: BuildOccurrence) => {
    const { definitionId, importedDefinitionId, name, type } =
      occurrence.identity;
    return (
      (definitionId !== undefined && tallyIds.has(key(definitionId))) ||
      (importedDefinitionId !== undefined &&
        tallyIds.has(key(importedDefinitionId))) ||
      tallyNames.has(`${key(type)}\0${key(name)}`)
    );
  };

  const results = new Map<SavedNode, SavedElementResult>();
  const classify = (node: SavedNode): SavedElementResult => {
    const cached = results.get(node);
    if (cached !== undefined) return cached;
    const { occurrence } = node;
    const definitionId = occurrence.identity.definitionId ?? "";
    const base = {
      path: node.path,
      id: occurrence.id,
      definitionId,
      name: occurrence.identity.name,
      type: occurrence.identity.type,
      level: occurrence.acquiredLevel,
      legacyActive: inTally(occurrence),
    };
    const result = ((): SavedElementResult => {
      if (activeIds.has(occurrence.id)) return { ...base, status: "active" };
      if (definitionId !== "" && activeDefinitions.has(key(definitionId)))
        return {
          ...base,
          status: "active",
          detail: "active through another occurrence",
        };
      if (replaced.has(occurrence.id)) return { ...base, status: "replaced" };
      const retrain = retrainedBy.get(occurrence.id);
      if (retrain !== undefined)
        return {
          ...base,
          status: "retrained",
          detail: `by ${retrain.identity.name} at level ${retrain.acquiredLevel}`,
        };
      const dormancy = dormant.get(occurrence.id);
      if (dormancy !== undefined)
        return {
          ...base,
          status: "dormant",
          detail: `${dormancy.slotName ?? dormancy.slotType} requires ${dormancy.requires}`,
        };
      const diagnostics = diagnosticsByOccurrence.get(occurrence.id);
      if (diagnostics !== undefined)
        return {
          ...base,
          status: "diagnostic",
          detail: diagnostics.join("; "),
        };
      const imported =
        importNamed.get(key(definitionId)) ??
        (definitionId !== "" && !byId.has(key(definitionId))
          ? "definition missing from the pack"
          : undefined);
      if (imported !== undefined)
        return { ...base, status: "diagnostic", detail: imported };
      if (node.parent !== undefined) {
        const parent = classify(node.parent);
        if (parent.status !== "active" && parent.status !== "silent-drop")
          return {
            ...base,
            status: "under-provider",
            detail: `${parent.name}: ${parent.status}${parent.detail === undefined ? "" : ` (${parent.detail})`}`,
          };
      }
      if (!inTally(occurrence))
        return {
          ...base,
          status: "legacy-inactive",
          detail: "absent from the legacy RulesElementTally",
        };
      if (occurrence.legality === "houserule")
        return { ...base, status: "houserule" };
      let ancestor = node.parent;
      while (ancestor !== undefined) {
        if (classify(ancestor).status === "silent-drop") break;
        ancestor = ancestor.parent;
      }
      return {
        ...base,
        status: "silent-drop",
        ...(ancestor === undefined
          ? {}
          : { droppedUnder: ancestor.occurrence.identity.name }),
      };
    })();
    results.set(node, result);
    return result;
  };
  const elements = nodes.map(classify);

  // Loot: legacy's current holdings against the modern inventory.
  const holdingKey = (ids: readonly (string | undefined)[]) =>
    ids.map((id) => key(id ?? "")).join("\0");
  const modernCounts = new Map<string, number>();
  for (const entry of imported.build.inventory) {
    const holding = holdingKey(entry.elements.map((e) => e.definitionId));
    modernCounts.set(
      holding,
      (modernCounts.get(holding) ?? 0) + entry.quantity,
    );
  }
  for (const entry of imported.build.known) {
    const holding = holdingKey([entry.element.definitionId]);
    modernCounts.set(holding, (modernCounts.get(holding) ?? 0) + 1);
  }
  const savedLoot = new Map<
    string,
    { name: string; ids: string[]; count: number }
  >();
  for (const loot of imported.snapshot.loot) {
    if (loot.count <= 0) continue;
    const ids = loot.elements.map((element) => element.id ?? element.name);
    const holding = holdingKey(ids);
    const current = savedLoot.get(holding);
    savedLoot.set(holding, {
      name: current?.name ?? loot.name,
      ids,
      count: (current?.count ?? 0) + loot.count,
    });
  }
  const loot: SavedLootResult[] = [...savedLoot].map(([holding, saved]) => {
    const modernCount = modernCounts.get(holding) ?? 0;
    const missing = saved.ids.filter((id) => !byId.has(key(id)));
    const base = {
      name: saved.name,
      definitionIds: saved.ids,
      savedCount: saved.count,
      modernCount,
    };
    if (modernCount === saved.count && missing.length === 0)
      return { ...base, status: "present" as const };
    if (missing.length > 0)
      return {
        ...base,
        status: "diagnostic" as const,
        detail: `missing from the pack: ${missing.join(", ")}`,
      };
    return {
      ...base,
      status: "silent-drop" as const,
      detail: `saved ${saved.count}, modern ${modernCount}`,
    };
  });

  // Extras: active modern definitions the save never held.
  const savedDefinitions = new Set<string>();
  const addSaved = (identity: {
    readonly definitionId?: string;
    readonly importedDefinitionId?: string;
  }) => {
    if (identity.definitionId !== undefined)
      savedDefinitions.add(key(identity.definitionId));
    if (identity.importedDefinitionId !== undefined)
      savedDefinitions.add(key(identity.importedDefinitionId));
  };
  for (const { occurrence } of nodes) addSaved(occurrence.identity);
  for (const id of tallyIds) savedDefinitions.add(id);
  for (const element of imported.build.inventory.flatMap((e) => e.elements))
    addSaved(element);
  for (const entry of imported.build.known) addSaved(entry.element);
  // A saved UserEdit is evaluated as a character-local definition.
  for (const frame of imported.build.levels)
    if (frame.userEdit !== undefined)
      savedDefinitions.add(
        key(`ID_INTERNAL_USER_EDIT_${frame.userEdit.root.id}`),
      );
  const occurrenceById = new Map(
    evaluated.occurrences.map((occurrence) => [occurrence.id, occurrence]),
  );
  const isExtra = (definitionId: string) => {
    if (savedDefinitions.has(key(definitionId))) return false;
    const entity = byId.get(key(definitionId));
    return !(
      entity !== undefined &&
      tallyNames.has(`${key(entity.type)}\0${key(entity.name)}`)
    );
  };
  const describe = (occurrenceId: string | undefined) => {
    const occurrence =
      occurrenceId === undefined ? undefined : occurrenceById.get(occurrenceId);
    const entity =
      occurrence === undefined
        ? undefined
        : byId.get(key(occurrence.definitionId));
    return entity === undefined
      ? (occurrenceId ?? "none")
      : `${entity.name} (${entity.type})`;
  };
  const extras: ModernExtraResult[] = evaluated.activeDefinitions.flatMap(
    (membership): ModernExtraResult[] => {
      if (!isExtra(membership.definitionId)) return [];
      const entity = byId.get(key(membership.definitionId));
      const occurrence = occurrenceById.get(membership.occurrenceIds[0] ?? "");
      const parent =
        occurrence?.parentId === undefined
          ? undefined
          : occurrenceById.get(occurrence.parentId);
      const base = {
        definitionId: membership.definitionId,
        name: entity?.name ?? membership.definitionId,
        type: entity?.type ?? "?",
        kind: occurrence?.kind ?? "?",
        provider: describe(occurrence?.parentId),
      };
      if (parent !== undefined && isExtra(parent.definitionId))
        return [{ ...base, cause: "under-extra" }];
      if (occurrence?.id.includes(":recovered:"))
        return [{ ...base, cause: "recovered-selection" }];
      if (occurrence?.kind === "grant" && parent !== undefined) {
        const providerEntity = byId.get(key(parent.definitionId));
        const rule =
          providerEntity === undefined
            ? undefined
            : parseRules(providerEntity.id, providerEntity.rules).find(
                (candidate) =>
                  candidate.source.ordinal === occurrence.ruleOrdinal,
              );
        return [
          rule?.requires === undefined
            ? { ...base, cause: "content-grant" }
            : {
                ...base,
                cause: "conditional-grant",
                detail: `requires ${rule.requires}`,
              },
        ];
      }
      return [{ ...base, cause: "unexplained" }];
    },
  );
  return { blankSlots, elements, loot, extras };
}
