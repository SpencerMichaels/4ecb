import type { ContentEntity } from "@4ecb/content-domain";

/**
 * Power-card parts the legacy sheet derives from a power's record
 * (CharTracker/PowerCardPower.cs `UpdatePowerCardPower`, PowerCard.cs
 * `MonkMovementTechnique`, RulesEngineCommon `BasicUtils.IsMonkTechnique`).
 */

type Lookup = (id: string) => ContentEntity | undefined;

const key = (value: string) => value.trim().toLocaleLowerCase();

function specific(entity: ContentEntity, name: string): string {
  return (
    entity.specifics.find((field) => key(field.name) === key(name))?.value ?? ""
  ).trim();
}

/**
 * The card's class block: the power's class ("Wizard"); for a classless
 * power, "Racial" when its Display names a racial power, else the skill a
 * skill power belongs to ("Diplomacy"). Legacy writes "Racial Power" in a
 * CLASS box; here the block shares the footer with the "... power" type, so
 * it reads "Racial". Unresolvable references show nothing, as in legacy.
 */
export function powerClassBlock(
  entity: ContentEntity,
  lookup: Lookup,
): string | undefined {
  const classId = specific(entity, "Class");
  if (classId) return lookup(classId)?.name.trim() || undefined;
  if (specific(entity, "Display").includes("Racial")) return "Racial";
  const skillId = specific(entity, "_SkillPower");
  return (skillId && lookup(skillId)?.name.trim()) || undefined;
}

/**
 * A monk full discipline's movement technique: the power its `_ChildPower`
 * names, when that record's name says "[Movement Technique]". Other child
 * powers (secondary attacks, summoned-creature attacks) stay their own cards.
 */
export function movementTechniqueOf(
  entity: ContentEntity,
  lookup: Lookup,
): ContentEntity | undefined {
  const childId = specific(entity, "_ChildPower");
  const child = childId ? lookup(childId) : undefined;
  return child !== undefined &&
    child.name.toLocaleLowerCase().includes("[movement technique]")
    ? child
    : undefined;
}

/** Fields a legacy power card never prints in its body (`lPowerExcludes`). */
export const POWER_CARD_BODY_EXCLUDES: ReadonlySet<string> = new Set([
  "power type",
  "power usage",
  "class",
  "level",
  "keywords",
  "action type",
  "attack type",
  "target",
  "targets",
  "display",
  "primary target",
]);

/**
 * Powers known only through a spellbook slot (a legacy `<alternate>`, the
 * wizard's second daily or utility of a level): legacy prints their cards
 * with a "SPELLBOOK" subtitle (`D20Workspace.IsSpellbook`). A power the
 * character also owns any other way is not one.
 */
export function spellbookPowerIds(evaluation: {
  readonly occurrences: readonly {
    readonly id: string;
    readonly definitionId: string;
  }[];
  readonly choices: readonly {
    readonly spellbook?: string;
    readonly selectedOccurrenceId?: string;
  }[];
}): ReadonlySet<string> {
  const spellbookOccurrences = new Set(
    evaluation.choices.flatMap((choice) =>
      choice.spellbook === undefined ||
      choice.selectedOccurrenceId === undefined
        ? []
        : [choice.selectedOccurrenceId],
    ),
  );
  const result = new Set<string>();
  const otherwise = new Set<string>();
  for (const occurrence of evaluation.occurrences)
    (spellbookOccurrences.has(occurrence.id) ? result : otherwise).add(
      key(occurrence.definitionId),
    );
  for (const id of otherwise) result.delete(id);
  return result;
}
