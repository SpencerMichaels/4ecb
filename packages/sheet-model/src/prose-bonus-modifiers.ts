import {
  readProseBonuses,
  type ContentEntity,
  type ProseBonus,
  type ProseBonusTarget,
} from "@4ecb/content-domain";
import type { EvaluatedStat } from "@4ecb/rules-engine";

import type {
  ConditionalModifier,
  ConditionalModifierSurface,
} from "./conditional-modifiers";
import type { DefensiveTrait } from "./defensive-traits";

/**
 * Page 1's rows for the situational bonuses a feature, chosen benefit or
 * equipped item states only in its prose (content-domain `prose-bonuses.ts`,
 * parsed at pack build): each goes in the pane a conditional statadd of the
 * same stat would — a skill, check, defense, initiative or speed bonus is a
 * conditional modifier, a saving throw or resistance a defensive trait —
 * with the record's own words as its text and the record's sources for
 * reminder dedup (reminder-coverage.ts).
 */

/** A record the character has: a page-1 feature (or a choice made under
 *  one) or an equipped item's definition. */
export interface ProseBonusSource {
  readonly entity: ContentEntity;
  /** The sheet's name for it ("Foreign Memories", the item's name). */
  readonly name: string;
  /** Its reminder source keys (`def:…`, `inv:…`, `name:…`). */
  readonly sourceKeys: readonly string[];
}

export interface ProseBonusRows {
  readonly modifiers: readonly ConditionalModifier[];
  readonly traits: readonly DefensiveTrait[];
  /** Each row's source keys. */
  readonly sources: ReadonlyMap<
    ConditionalModifier | DefensiveTrait,
    readonly string[]
  >;
}

const key = (value: string) => value.trim().toLocaleLowerCase();

/** The pane surface and target name of a modifier row. */
function modifierTarget(
  target: ProseBonusTarget,
): { surface: ConditionalModifierSurface; target: string } | undefined {
  switch (target.kind) {
    case "skill":
      return { surface: "skills", target: target.name };
    case "checks":
      return { surface: "checks", target: target.name };
    case "defense":
      return { surface: "defenses", target: target.name };
    case "initiative":
      return { surface: "initiative", target: "Initiative" };
    case "speed":
      return { surface: "speed", target: "Speed" };
    default:
      return undefined;
  }
}

/** Evaluated stat names a target's own contributions sit under. */
function statNames(target: ProseBonusTarget): readonly string[] {
  switch (target.kind) {
    case "skill":
      return [target.name, `${target.name} Misc`];
    case "defense":
      return target.name === "AC"
        ? ["AC", "Armor Class"]
        : [target.name, `${target.name} Defense`];
    case "initiative":
      return ["Initiative", "Initiative Misc"];
    case "speed":
      return ["Speed"];
    case "saving-throws":
      return ["Saving Throws"];
    case "death-saves":
      return ["Death Saving Throws", "Death Saves"];
    case "resist":
      return [`resist:${target.name.replace(/ damage$/i, "")}`];
    case "checks":
      return [];
  }
}

/**
 * The prose bonuses of the character's records as page-1 rows. A bonus the
 * evaluation already carries — a contribution of the same amount to the
 * same stat from the same source, as a granted child's statadd or native
 * handling would add — is left out, so nothing shows twice.
 */
export function proseBonusRows(
  sources: readonly ProseBonusSource[],
  stats: Readonly<Record<string, EvaluatedStat>>,
  sourceOf: (provenanceId: string | undefined) => readonly string[],
): ProseBonusRows {
  const byName = new Map(
    Object.entries(stats).map(([name, stat]) => [key(name), stat] as const),
  );
  const modifiers: ConditionalModifier[] = [];
  const traits: DefensiveTrait[] = [];
  const rowSources = new Map<
    ConditionalModifier | DefensiveTrait,
    readonly string[]
  >();
  const seenEntities = new Set<string>();
  const seenTexts = new Set<string>();
  const evaluated = (bonus: ProseBonus, keys: ReadonlySet<string>) =>
    bonus.targets.every((target) =>
      statNames(target).some((name) =>
        (byName.get(key(name))?.contributions ?? []).some(
          (contribution) =>
            contribution.numericValue === bonus.amount &&
            sourceOf(contribution.id).some((source) => keys.has(source)),
        ),
      ),
    );
  for (const source of sources) {
    if (seenEntities.has(key(source.entity.id))) continue;
    seenEntities.add(key(source.entity.id));
    const keys = new Set(source.sourceKeys);
    readProseBonuses(source.entity.specifics).forEach((bonus, index) => {
      const identity = `${key(source.name)}\u0000${key(bonus.text)}`;
      if (seenTexts.has(identity) || evaluated(bonus, keys)) return;
      seenTexts.add(identity);
      const provenanceId = `prose:${source.entity.id}#${index}`;
      const first = bonus.targets[0];
      if (first === undefined) return;
      if (first.kind === "saving-throws" || first.kind === "death-saves") {
        const trait: DefensiveTrait = {
          label: first.kind === "death-saves" ? "Death saves" : "Saving throws",
          value: bonus.text,
          source: source.name,
          group: "Saving throws",
          conditional: true,
          authored: true,
        };
        traits.push(trait);
        rowSources.set(trait, source.sourceKeys);
        return;
      }
      if (first.kind === "resist") {
        const trait: DefensiveTrait = {
          label: "Resistances",
          value: bonus.text,
          source: source.name,
          group: "Resistances",
          conditional: true,
          authored: true,
        };
        traits.push(trait);
        rowSources.set(trait, source.sourceKeys);
        return;
      }
      const placed = modifierTarget(first);
      if (placed === undefined) return;
      const modifier: ConditionalModifier = {
        surface: placed.surface,
        target: bonus.targets
          .map((target) => modifierTarget(target)?.target)
          .filter((name): name is string => name !== undefined)
          .join(", "),
        text: bonus.text,
        source: source.name,
        provenanceId,
      };
      modifiers.push(modifier);
      rowSources.set(modifier, source.sourceKeys);
    });
  }
  return { modifiers, traits, sources: rowSources };
}
