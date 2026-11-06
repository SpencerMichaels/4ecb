import {
  applyCharacterCommand,
  type BuildKnownEntry,
  type BuildOccurrence,
  type CharacterBuild,
  type CharacterCommand,
} from "@4ecb/character-domain";
import type { ContentEntity } from "@4ecb/content-domain";

import {
  commandForEvaluatedChoice,
  projectBuildForEvaluation,
} from "./build-projection";
import {
  evaluateCharacter,
  type EvaluatedCharacter,
  type EvaluatedChoice,
} from "./evaluator";
import { grantedKnownRecords } from "./known-records";
import { ritualAllowances } from "./ritual-allowances";

/**
 * A choice among named rituals (a Psion's Sending or Tenser's Floating Disk,
 * Wild Sage's three rituals) is a `select type="Ritual"` (D115). The old
 * builder had no such select: its saves hold the ritual as known loot, and
 * this app's earlier content counted it against a `from=` allowance. When
 * such a choice is still open, the known entry that stands for it fills it:
 *
 * - an entry learned from a retired allowance of the provider or of what it
 *   grants (a key naming no current allowance: the Psion's grants record's
 *   `ID_INTERNAL_GRANTS_PSION#2`, Wild Sage's `ID_FMP_FEAT_1885`), else
 * - the earliest free entry from imported loot (no allowance, `legacyLoot`).
 *
 * The entry is kept (its loot is what export writes back); once the choice
 * holds the ritual, `knownRecords` lists it once, as chosen, and allowances
 * never count it. A bought entry, or one on a current allowance, is never
 * taken. Filled at import and at a content update, never silently later, so
 * a player's own change to the choice stands.
 */

export interface RitualChoiceFill {
  readonly choiceId: string;
  readonly entryId: string;
  readonly definitionId: string;
  /** The ritual's name ("Sending"). */
  readonly name: string;
  /** The element whose choice it fills ("Psion", "Wild Sage"). */
  readonly provider: string;
}

export interface RitualChoiceFills {
  readonly fills: readonly RitualChoiceFill[];
  /** One command making every fill; undefined when there is none. */
  readonly command?: CharacterCommand;
}

function key(value: string): string {
  return value.trim().toLocaleLowerCase();
}

export function isRitualChoice(choice: Pick<EvaluatedChoice, "type">): boolean {
  return key(choice.type) === "ritual";
}

/** The open Ritual choices `build`'s known entries fill, and the command. */
export function ritualChoiceFills(
  build: CharacterBuild,
  evaluation: Pick<
    EvaluatedCharacter,
    "activeDefinitionIds" | "choices" | "level" | "occurrences" | "stats"
  >,
  entities: readonly ContentEntity[],
): RitualChoiceFills {
  const byId = new Map(entities.map((entity) => [key(entity.id), entity]));
  const lookup = (id: string) => byId.get(key(id));
  const open = evaluation.choices.filter(
    (choice) =>
      isRitualChoice(choice) &&
      choice.selectedOccurrenceId === undefined &&
      choice.level <= evaluation.level,
  );
  if (open.length === 0) return { fills: [] };
  const currentAllowances = new Set(
    ritualAllowances(evaluation, lookup).map((allowance) => key(allowance.key)),
  );
  // Already known through a grant, gift or another choice: never twice.
  const given = new Set(
    grantedKnownRecords(evaluation, lookup).map(({ definitionId }) =>
      key(definitionId),
    ),
  );
  const occurrences = new Map(
    evaluation.occurrences.map((occurrence) => [occurrence.id, occurrence]),
  );
  const used = new Set<string>();
  const fills: RitualChoiceFill[] = [];
  const commands: CharacterCommand[] = [];
  for (const choice of open) {
    const providerOccurrence = occurrences.get(choice.providerOccurrenceId);
    if (providerOccurrence === undefined) continue;
    // The provider and what it grants (the Psion class's grants record).
    const providerIds = new Set<string>();
    for (const occurrence of evaluation.occurrences) {
      if (
        occurrence.id !== providerOccurrence.id &&
        occurrence.kind !== "grant"
      )
        continue;
      let cursor: typeof occurrence | undefined = occurrence;
      for (let depth = 0; cursor !== undefined && depth < 64; depth += 1) {
        if (cursor.id === providerOccurrence.id) {
          providerIds.add(key(occurrence.definitionId));
          break;
        }
        if (cursor !== occurrence && cursor.kind !== "grant") break;
        cursor =
          cursor.parentId === undefined
            ? undefined
            : occurrences.get(cursor.parentId);
      }
    }
    // A known entry makes its ritual an owned element, so the option it
    // stands for reads "owned" until it fills the choice.
    const options = new Set(
      choice.candidates
        .filter(
          ({ eligible, reasons }) =>
            eligible ||
            (reasons.length > 0 &&
              reasons.every((reason) => reason === "owned")),
        )
        .map(({ definitionId }) => key(definitionId)),
    );
    const usable = build.known.filter(
      (entry) =>
        entry.acquisition === "free" &&
        entry.acquiredLevel <= evaluation.level &&
        !used.has(entry.id) &&
        entry.element.definitionId !== undefined &&
        options.has(key(entry.element.definitionId)) &&
        !given.has(key(entry.element.definitionId)),
    );
    const retiredKey = (entry: BuildKnownEntry) =>
      entry.allowance !== undefined &&
      !currentAllowances.has(key(entry.allowance)) &&
      providerIds.has(key(entry.allowance.split("#")[0]!));
    const imported = usable
      .filter(
        (entry) =>
          entry.allowance === undefined && entry.legacyLoot !== undefined,
      )
      .sort((left, right) => left.acquiredLevel - right.acquiredLevel);
    const entry = usable.find(retiredKey) ?? imported[0];
    if (entry === undefined) continue;
    const entity = lookup(entry.element.definitionId!);
    if (entity === undefined) continue;
    const selected: BuildOccurrence = {
      id: `ritual-choice:${entry.id}`,
      identity: {
        definitionId: entity.id,
        name: entity.name,
        type: entity.type,
      },
      acquiredLevel: choice.level,
      legality: "rules-legal",
      children: [],
      unresolved: false,
    };
    const command = commandForEvaluatedChoice(
      build,
      choice,
      evaluation.occurrences,
      entities,
      selected,
      (index) => `ritual-choice:${entry.id}:slot:${index}`,
    );
    if (command === undefined) continue;
    used.add(entry.id);
    given.add(key(entity.id));
    commands.push(command);
    fills.push({
      choiceId: choice.id,
      entryId: entry.id,
      definitionId: entity.id,
      name: entity.name,
      provider: lookup(providerOccurrence.definitionId)?.name ?? "",
    });
  }
  if (commands.length === 0) return { fills };
  return {
    fills,
    command: commands.length === 1 ? commands[0]! : { kind: "batch", commands },
  };
}

/**
 * The fills of `build`'s open Ritual choices, evaluating it with candidate
 * detail only at those choices' levels. `evaluation`, when given (one
 * evaluated without candidate lists, like a migration preview's), only
 * tells whether there is an open Ritual choice at all.
 */
export function evaluateRitualChoiceFills(
  build: CharacterBuild,
  entities: readonly ContentEntity[],
  evaluation?: Pick<EvaluatedCharacter, "choices" | "level">,
): RitualChoiceFills {
  const hasFreeEntry = build.known.some(
    ({ acquisition }) => acquisition === "free",
  );
  if (!hasFreeEntry) return { fills: [] };
  const openLevels = (
    value: Pick<EvaluatedCharacter, "choices" | "level">,
  ): readonly number[] => [
    ...new Set(
      value.choices
        .filter(
          (choice) =>
            isRitualChoice(choice) &&
            choice.selectedOccurrenceId === undefined &&
            choice.level <= value.level,
        )
        .map(({ level }) => level),
    ),
  ];
  if (evaluation !== undefined && openLevels(evaluation).length === 0)
    return { fills: [] };
  const input = projectBuildForEvaluation(build, entities);
  const levels = evaluation === undefined ? undefined : openLevels(evaluation);
  const detailed = evaluateCharacter(
    levels === undefined ? input : { ...input, candidateDetailLevels: levels },
    entities,
  );
  return ritualChoiceFills(build, detailed, entities);
}

/**
 * Evaluates `build` and fills its open Ritual choices from its known
 * entries (an imported .dnd4e's Sending loot under the Psion's choice).
 */
export function fillRitualChoicesFromKnown(
  build: CharacterBuild,
  entities: readonly ContentEntity[],
): {
  readonly build: CharacterBuild;
  readonly fills: readonly RitualChoiceFill[];
} {
  const { fills, command } = evaluateRitualChoiceFills(build, entities);
  return command === undefined
    ? { build, fills }
    : { build: applyCharacterCommand(build, command), fills };
}
