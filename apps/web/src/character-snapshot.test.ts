import { describe, expect, it } from "vitest";

import {
  CharacterTransaction,
  type BuildOccurrence,
  type CharacterRecord,
} from "@4ecb/character-domain";
import type { ContentEntity, RuleStatement } from "@4ecb/content-domain";
import type { ContentPackManifest } from "@4ecb/content-pack";
import {
  commandForEvaluatedChoice,
  evaluateCharacter,
  projectBuildForEvaluation,
  type EvaluatedCharacter,
} from "@4ecb/rules-engine";
import { buildEvaluatedSheetModel } from "@4ecb/sheet-model";
import { SKILLS } from "@kit";

import { characterSnapshot } from "./character-snapshot";
import { createNativeCharacter } from "./new-character";

function rule(
  name: string,
  attributes: Readonly<Record<string, string>>,
  ordinal: number,
): RuleStatement {
  return {
    name,
    attributes: Object.entries(attributes).map(([attribute, value]) => ({
      name: attribute,
      value,
    })),
    text: "",
    children: [],
    ordinal,
  };
}

function entity(
  id: string,
  name: string,
  type: string,
  rules: readonly RuleStatement[] = [],
): ContentEntity {
  return {
    id,
    name,
    type,
    source: "Character snapshot fixture",
    sources: ["Character snapshot fixture"],
    attributes: [],
    categories: [],
    specifics: [],
    rules,
    description: "",
    extensions: [],
    provenance: { sourceKey: "character-snapshot", sourceOrdinal: 0 },
  };
}

const statadds = (values: Readonly<Record<string, string>>) =>
  Object.entries(values).map(([name, value], index) =>
    rule("statadd", { name, value }, index),
  );

const manifest = {
  packId: "snapshot-fixture",
  contentDigest: "snapshot-digest",
} as ContentPackManifest;

/** The race and class stand in for the real content's stat definitions;
 *  the class grants its defender mark as a class feature. */
const entities = [
  entity("ID_INTERNAL_LEVEL_1", "1", "Level", [
    rule("select", { type: "Race", number: "1" }, 0),
    rule("select", { type: "Class", number: "1" }, 1),
  ]),
  entity(
    "RACE",
    "Dwarf",
    "Race",
    statadds({
      Speed: "5",
      Constitution: "4",
      "resist:fire": "5",
      "resist:all": "2",
      // Resistances the content names by attacker or by malformed text.
      "resist:demons": "5",
      "resist:lightning and resist 5 thunder": "5",
    }),
  ),
  entity("CLASS", "Fighter", "Class", [
    ...statadds({
      "Hit Points": "27",
      "Healing Surges": "11",
      AC: "17",
      "Fortitude Defense": "14",
      "Reflex Defense": "11",
      "Will Defense": "11",
      Initiative: "1",
      "Passive Perception": "12",
      "Passive Insight": "10",
      "Saving Throws": "1",
      "resist:necrotic": "-5",
      ...Object.fromEntries(
        SKILLS.map((skill) => [
          skill.replace(/^./, (letter) => letter.toUpperCase()),
          skill === "athletics" ? "9" : "1",
        ]),
      ),
      "Athletics Trained": "5",
    }),
    rule("grant", { type: "Class Feature", name: "Combat Challenge" }, 99),
  ]),
  entity("COMBAT_CHALLENGE", "Combat Challenge", "Class Feature"),
];

function nativeCharacter(choose: readonly string[] = ["RACE", "CLASS"]): {
  record: CharacterRecord;
  evaluation: EvaluatedCharacter;
  build: CharacterRecord["build"];
} {
  const record = createNativeCharacter("Brakka", manifest, entities, {
    id: "native-brakka",
    occurrenceId: "level-one",
    now: "2026-11-13T00:00:00.000Z",
  });
  const transaction = new CharacterTransaction(record.build);
  const evaluate = () =>
    evaluateCharacter(
      {
        ...projectBuildForEvaluation(transaction.current, entities),
        candidateDetailLevels: [],
      },
      entities,
    );
  let evaluation = evaluate();
  for (const id of choose) {
    const definition = entities.find((candidate) => candidate.id === id)!;
    const choice = evaluation.choices.find(
      (candidate) => candidate.type === definition.type,
    )!;
    const selected: BuildOccurrence = {
      id: `selected-${id.toLowerCase()}`,
      identity: {
        definitionId: id,
        name: definition.name,
        type: definition.type,
      },
      acquiredLevel: 1,
      legality: "rules-legal",
      children: [],
      unresolved: false,
    };
    transaction.dispatch(
      commandForEvaluatedChoice(
        transaction.current,
        choice,
        evaluation.occurrences,
        entities,
        selected,
        (index) => `placeholder-${index}`,
      )!,
    );
    evaluation = evaluate();
  }
  return { record, evaluation, build: transaction.current };
}

function snapshotOf(character: ReturnType<typeof nativeCharacter>) {
  return characterSnapshot({
    sourceId: character.record.id,
    title: character.record.title,
    model: buildEvaluatedSheetModel(
      character.record.snapshot,
      character.build,
      character.evaluation,
      entities,
    ),
    evaluation: character.evaluation,
    exportedAt: "2026-11-13T12:00:00.000Z",
    appVersion: "abc1234",
  });
}

describe("characterSnapshot", () => {
  it("projects a native character's evaluated sheet numbers", () => {
    const character = nativeCharacter();
    // A native record carries no legacy cache: every number is evaluated.
    expect(character.record.snapshot.source).toBe("native-empty");
    const snapshot = snapshotOf(character);
    expect(snapshot).toMatchObject({
      version: 1,
      sourceId: "native-brakka",
      source: {
        app: "4ecb",
        appVersion: "abc1234",
        exportedAt: "2026-11-13T12:00:00.000Z",
      },
      name: "Brakka",
      level: 1,
      race: "Dwarf",
      class: "Fighter",
      markType: "combat-challenge",
      hp: { max: 27, bloodied: 13, surgeValue: 6, surgesPerDay: 11 },
      defenses: { ac: 17, fortitude: 14, reflex: 11, will: 11 },
      initiative: 1,
      speed: 5,
      passivePerception: 12,
      passiveInsight: 10,
      savingThrowBonus: 1,
      // Damage types and all damage only; vulnerabilities aren't resistances.
      resist: [
        { type: "fire", value: 5 },
        { type: "all", value: 2 },
      ],
      actionPoints: 1,
      powers: [],
      items: [],
    });
    expect(snapshot?.abilities.con).toEqual({ score: 14, modifier: 2 });
    expect(snapshot?.abilities.str).toEqual({ score: 8, modifier: -1 });
    expect(Object.keys(snapshot?.skills ?? {}).sort()).toEqual(
      [...SKILLS].sort(),
    );
    expect(snapshot?.skills.athletics).toEqual({ total: 9, trained: true });
    expect(snapshot?.skills.stealth).toEqual({ total: 1, trained: false });
    expect(snapshot).not.toHaveProperty("paragonPath");
    expect(snapshot).not.toHaveProperty("player");
  });

  it("writes no snapshot for an incomplete build", () => {
    // Race chosen, no class: no class name and none of the class's numbers.
    expect(snapshotOf(nativeCharacter(["RACE"]))).toBeUndefined();
  });

  it("writes no snapshot from a legacy cache sheet", () => {
    const character = nativeCharacter();
    const model = buildEvaluatedSheetModel(
      character.record.snapshot,
      character.build,
      character.evaluation,
      entities,
    );
    expect(
      characterSnapshot({
        sourceId: character.record.id,
        title: character.record.title,
        model: { ...model, source: "legacy-cache" },
        evaluation: character.evaluation,
        exportedAt: "2026-11-13T12:00:00.000Z",
      }),
    ).toBeUndefined();
  });
});
