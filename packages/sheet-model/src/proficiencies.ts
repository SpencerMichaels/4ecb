import type { ContentEntity } from "@4ecb/content-domain";
import type { CharacterOccurrence } from "@4ecb/rules-engine";

export type SheetProficiencyKind =
  "Armor" | "Shields" | "Weapons" | "Implements";

/** One kind's proficiencies, as compact as the grants allow. */
export interface SheetProficiencyGroup {
  readonly kind: SheetProficiencyKind;
  /** Lower-cased display names: groups ("simple melee") and lone grants. */
  readonly values: readonly string[];
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

/**
 * The character's evaluated proficiencies by kind. A proficiency that grants
 * others (Simple Melee, Weapon Group (Mace)) is listed as the group, and the
 * proficiencies it grants are not repeated; a bare-named group takes its
 * granted proficiencies' kind.
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
    const kind =
      named?.kind ??
      granted
        .map((id) =>
          namedProficiency(
            proficiencies.find((entry) => entry.entity.id === id)?.entity
              .name ?? "",
          ),
        )
        .find((value) => value !== undefined)?.kind;
    // A proficiency that is neither named by kind nor grants any (a "Choose
    // Nothing" placeholder) has nothing to show.
    if (kind === undefined) continue;
    const value = named?.value ?? entity.name.trim().toLowerCase();
    const group = groups.get(kind) ?? { values: [], definitionIds: new Set() };
    group.values.push(value);
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
  return KINDS.flatMap((kind) => {
    const group = groups.get(kind);
    return group === undefined
      ? []
      : [
          {
            kind,
            values: group.values,
            definitionIds: [...group.definitionIds],
          },
        ];
  });
}
