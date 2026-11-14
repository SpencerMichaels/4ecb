import type { EvaluatedCharacter } from "@4ecb/rules-engine";
import type { CharacterSheetModel, SheetValue } from "@4ecb/sheet-model";
import {
  ABILITIES,
  CHARACTER_SNAPSHOT_VERSION,
  DAMAGE_TYPES,
  DEFENSES,
  SKILLS,
  type Ability,
  type CharacterSnapshot,
  type Defense,
  type Skill,
} from "@kit";

/**
 * A character's printed numbers as the shared kit's `CharacterSnapshot`,
 * for 4e DM Dashboard: embedded in .4ecb exports beside the characters
 * (`snapshots`), the way a legacy save carries its `<CharacterSheet>` for
 * applications without a rules engine. Every value is the evaluated sheet's
 * own (`buildEvaluatedSheetModel`), never recomputed here. Undefined when
 * the sheet isn't an evaluated one or lacks a number the snapshot requires:
 * no snapshot is better than partial numbers.
 */
export function characterSnapshot(input: {
  readonly sourceId: string;
  readonly title: string;
  readonly model: CharacterSheetModel;
  readonly evaluation: EvaluatedCharacter;
  readonly exportedAt: string;
  readonly appVersion?: string;
}): CharacterSnapshot | undefined {
  const { model, evaluation } = input;
  const overview = model.overview;
  if (model.source !== "authoritative-evaluation" || overview === undefined)
    return undefined;
  const text = (values: readonly SheetValue[], label: string) =>
    values.find((value) => key(value.label) === key(label))?.value.trim();
  const numeric = (value: string | undefined) => {
    const parsed = Number(value?.replace(/^\+/, ""));
    return value === undefined || !Number.isFinite(parsed) ? undefined : parsed;
  };
  const identity = (label: string) => text(model.identity, label) || undefined;
  const race = identity("Race");
  const className = identity("Class");
  if (race === undefined || className === undefined) return undefined;

  const resource = (label: string) => numeric(text(model.resources, label));
  const hp = {
    max: resource("Hit Points"),
    bloodied: numeric(overview.bloodied),
    surgeValue: resource("Healing Surge Value"),
    surgesPerDay: resource("Healing Surges"),
  };
  const defenses = Object.fromEntries(
    DEFENSES.map((defense) => [
      defense,
      numeric(text(model.defenses, DEFENSE_LABELS[defense])),
    ]),
  );
  const abilities = Object.fromEntries(
    ABILITIES.map((ability) => {
      const row = overview.abilities.find(
        ({ name }) => key(name) === ABILITY_NAMES[ability],
      );
      // The kit's modifier includes half the level: the sheet's check column.
      return [
        ability,
        { score: numeric(row?.score), modifier: numeric(row?.check) },
      ];
    }),
  );
  const skills = Object.fromEntries(
    SKILLS.map((skill) => {
      const row = overview.skills.find(({ name }) => key(name) === skill);
      return [
        skill,
        { total: numeric(row?.bonus), trained: row?.trained === true },
      ];
    }),
  );
  const scalars = {
    initiative: resource("Initiative"),
    speed: resource("Speed"),
    passivePerception: numeric(text(model.senses, "Passive Perception")),
    passiveInsight: numeric(text(model.senses, "Passive Insight")),
    savingThrowBonus: numeric(overview.saves),
  };
  if (
    [
      ...Object.values(hp),
      ...Object.values(defenses),
      ...Object.values(abilities).flatMap(({ score, modifier }) => [
        score,
        modifier,
      ]),
      ...Object.values(skills).map(({ total }) => total),
      ...Object.values(scalars),
    ].some((value) => value === undefined)
  )
    return undefined;

  const name = identity("name") ?? input.title;
  const player = identity("Player");
  const paragonPath = identity("ParagonPath");
  const epicDestiny = identity("EpicDestiny");
  const markType = defenderMark(model);
  return {
    version: CHARACTER_SNAPSHOT_VERSION,
    sourceId: input.sourceId,
    source: {
      app: "4ecb",
      ...(input.appVersion === undefined
        ? {}
        : { appVersion: input.appVersion }),
      exportedAt: input.exportedAt,
    },
    name,
    ...(player === undefined ? {} : { player }),
    level: overview.level,
    race,
    class: className,
    ...(paragonPath === undefined ? {} : { paragonPath }),
    ...(epicDestiny === undefined ? {} : { epicDestiny }),
    ...(markType === undefined ? {} : { markType }),
    hp: hp as CharacterSnapshot["hp"],
    defenses: defenses as Record<Defense, number>,
    ...(scalars as Pick<
      CharacterSnapshot,
      | "initiative"
      | "speed"
      | "passivePerception"
      | "passiveInsight"
      | "savingThrowBonus"
    >),
    abilities: abilities as CharacterSnapshot["abilities"],
    skills: skills as Record<Skill, { total: number; trained: boolean }>,
    resist: resistances(evaluation),
    // Every character starts the day with the base action points (legacy
    // `_BaseActionPoints`, 1).
    actionPoints: evaluatedNumber(evaluation, "_BaseActionPoints") ?? 1,
    powers: [],
    items: (overview.inventory ?? []).map((holding) => ({
      name: holding.name,
      equipped: holding.equipped > 0,
    })),
  };
}

const DEFENSE_LABELS: Record<Defense, string> = {
  ac: "AC",
  fortitude: "Fortitude",
  reflex: "Reflex",
  will: "Will",
};

const ABILITY_NAMES: Record<Ability, string> = {
  str: "strength",
  con: "constitution",
  dex: "dexterity",
  int: "intelligence",
  wis: "wisdom",
  cha: "charisma",
};

/** The dashboard's defender mark ids, in its order, by the class feature or
 *  power that marks. A swordmage's other aegises have no id there. */
const DEFENDER_MARKS: readonly (readonly [id: string, name: string])[] = [
  ["combat-challenge", "combat challenge"],
  ["divine-challenge", "divine challenge"],
  ["aegis-of-assault", "aegis of assault"],
  ["natures-wrath", "nature's wrath"],
  ["battlemind-demand", "battlemind's demand"],
  ["hunter-quarry", "hunter's quarry"],
  ["warlock-curse", "warlock's curse"],
  ["oath-of-enmity", "oath of enmity"],
  ["assassins-shroud", "assassin's shroud"],
];

function defenderMark(model: CharacterSheetModel): string | undefined {
  const names = new Set(
    [
      ...model.features.flatMap(({ entries }) =>
        entries.map(({ label }) => label),
      ),
      ...model.powers.map(({ name }) => name),
    ].map((name) =>
      key(name)
        .replace(/[’‘]/g, "'")
        .replace(/\s*\(hybrid\)$/, ""),
    ),
  );
  return DEFENDER_MARKS.find(([, name]) => names.has(name))?.[0];
}

/** The evaluated `resist:<type>` totals above 0, as the sheet's defensive
 *  traits list them, for a damage type or all damage. Vulnerabilities
 *  (below 0), conditional resistances and resistances against other things
 *  ("resist:demons", "resist:area") are left out. */
function resistances(evaluation: EvaluatedCharacter) {
  return Object.entries(evaluation.stats).flatMap(([name, stat]) => {
    const type = /^resist\s*:\s*(.+)$/i.exec(name)?.[1]?.trim().toLowerCase();
    const value = Number(stat.value);
    return type === undefined ||
      !RESISTANCE_TYPES.has(type) ||
      !Number.isFinite(value) ||
      value <= 0
      ? []
      : [{ type, value }];
  });
}

const RESISTANCE_TYPES: ReadonlySet<string> = new Set([...DAMAGE_TYPES, "all"]);

function evaluatedNumber(
  evaluation: EvaluatedCharacter,
  name: string,
): number | undefined {
  const stat = Object.entries(evaluation.stats).find(
    ([candidate]) => key(candidate) === key(name),
  )?.[1];
  const value = Number(stat?.value);
  return stat === undefined || !Number.isFinite(value) ? undefined : value;
}

function key(value: string): string {
  return value.trim().toLowerCase();
}
