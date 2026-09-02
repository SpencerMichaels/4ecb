import { describe, expect, it } from "vitest";

import {
  CharacterTransaction,
  type BuildOccurrence,
} from "@4ecb/character-domain";
import type { ContentEntity, RuleStatement } from "@4ecb/content-domain";
import type { ContentPackManifest } from "@4ecb/content-pack";
import {
  commandForEvaluatedChoice,
  evaluateCharacter,
  projectBuildForEvaluation,
} from "@4ecb/rules-engine";

import { createLevelFrame, createNativeCharacter } from "./new-character";

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
    source: "Native character smoke fixture",
    sources: ["Native character smoke fixture"],
    attributes: [],
    categories: [],
    specifics: [],
    rules,
    description: "",
    extensions: [],
    provenance: { sourceKey: "native-character", sourceOrdinal: 0 },
  };
}

const manifest: ContentPackManifest = {
  formatVersion: 1,
  packId: "native-smoke",
  name: "Native creation smoke profile",
  contentDigest: "native-smoke-digest",
  gameSystem: "D&D4E",
  sourceKey: "native-character",
  recordCount: 0,
  typeCounts: [],
  accounting: {
    topLevelRecords: 0,
    acceptedRecords: 0,
    warnedRecords: 0,
    rejectedRecords: 0,
    rawTopLevelElements: 0,
  },
  diagnosticCounts: { error: 0, warning: 0, info: 0 },
};

describe("native character creation", () => {
  it("exposes required level-1 identity choices through the generic evaluator/editor commands", () => {
    const entities = [
      entity("ID_INTERNAL_LEVEL_1", "1", "Level", [
        rule("select", { type: "Race", number: "1" }, 0),
        rule("select", { type: "Class", number: "1" }, 1),
        rule("select", { type: "Feat", number: "1" }, 2),
      ]),
      entity("RACE", "Public race", "Race"),
      entity("CLASS", "Public class", "Class"),
      entity("FEAT", "Public feat", "Feat"),
    ];
    const record = createNativeCharacter("New Hero", manifest, entities, {
      id: "native-character",
      occurrenceId: "level-one",
      now: "2026-09-01T00:00:00.000Z",
      profileBinding: {
        packId: "profile:fixture:revision",
        contentDigest: "resolved-digest",
        layers: [
          { packId: "baseline", contentDigest: "baseline-digest" },
          { packId: "personal", contentDigest: "personal-digest" },
        ],
        resolutionPolicy: "last-pack-wins-v1",
      },
    });
    expect(record.profileBinding?.layers?.map(({ packId }) => packId)).toEqual([
      "baseline",
      "personal",
    ]);
    const transaction = new CharacterTransaction(record.build);
    let evaluation = evaluateCharacter(
      projectBuildForEvaluation(transaction.current, entities),
      entities,
    );
    expect(evaluation.choices.map((choice) => choice.type)).toEqual([
      "Race",
      "Class",
      "Feat",
    ]);
    expect(evaluation.complete).toBe(false);

    for (const [choiceType, definitionId] of [
      ["Race", "RACE"],
      ["Class", "CLASS"],
      ["Feat", "FEAT"],
    ] as const) {
      const choice = evaluation.choices.find(
        (candidate) => candidate.type === choiceType,
      );
      expect(choice).toBeDefined();
      const definition = entities.find((value) => value.id === definitionId)!;
      const selected: BuildOccurrence = {
        id: `selected-${definitionId.toLocaleLowerCase()}`,
        identity: {
          definitionId: definition.id,
          name: definition.name,
          type: definition.type,
        },
        acquiredLevel: 1,
        legality: "rules-legal",
        children: [],
        unresolved: false,
      };
      const command = commandForEvaluatedChoice(
        transaction.current,
        choice!,
        evaluation.occurrences,
        entities,
        selected,
        (index) => `placeholder-${index}`,
      );
      expect(command).toBeDefined();
      transaction.dispatch(command!);
      evaluation = evaluateCharacter(
        projectBuildForEvaluation(transaction.current, entities),
        entities,
      );
    }

    expect(evaluation.complete).toBe(true);
    expect(
      transaction.current.levels[0]?.root.children.map(
        (child) => child.identity.definitionId,
      ),
    ).toEqual(["RACE", "CLASS", "FEAT"]);
  });

  it("advances the same native build from level 1 through level 30", () => {
    const entities = Array.from({ length: 30 }, (_, index) =>
      entity(`ID_INTERNAL_LEVEL_${index + 1}`, String(index + 1), "Level"),
    );
    const record = createNativeCharacter("Epic Bound", manifest, entities, {
      id: "level-smoke",
      occurrenceId: "level-1",
      now: "2026-09-01T00:00:00.000Z",
    });
    const transaction = new CharacterTransaction(record.build);
    for (let level = 2; level <= 30; level += 1)
      transaction.dispatch({
        kind: "add-level",
        frame: createLevelFrame(level, entities, `level-${level}`),
      });
    const evaluation = evaluateCharacter(
      projectBuildForEvaluation(transaction.current, entities),
      entities,
    );
    expect(transaction.current.effectiveLevel).toBe(30);
    expect(transaction.current.levels).toHaveLength(30);
    expect(transaction.current.levels.map((frame) => frame.level)).toEqual(
      Array.from({ length: 30 }, (_, index) => index + 1),
    );
    expect(evaluation).toMatchObject({
      level: 30,
      complete: true,
      converged: true,
    });
    expect(
      evaluation.occurrences.filter((occurrence) => occurrence.kind === "root"),
    ).toHaveLength(30);
  });

  it("requires an exact profile with the canonical level definition", () => {
    expect(() =>
      createNativeCharacter("No Level", manifest, [
        entity("OTHER", "Other", "Level"),
      ]),
    ).toThrow("no level 1 record");
  });
});
