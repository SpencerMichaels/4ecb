import { describe, expect, it, vi } from "vitest";

import type { BuildOccurrence, CharacterBuild } from "@4ecb/character-domain";
import { scanCountingContent, type ContentEntity } from "@4ecb/content-domain";
import * as rules from "@4ecb/rules-engine";

import {
  buildParagonPathId,
  evaluatedBuilderCardSettings,
} from "./BuilderCards";

vi.mock("@4ecb/rules-engine", async (importOriginal) => {
  const original = await importOriginal<typeof rules>();
  return { ...original, evaluatePowers: vi.fn(original.evaluatePowers) };
});

const occurrence = (
  id: string,
  type: string,
  definitionId: string,
  children: readonly BuildOccurrence[] = [],
  replacesId?: string,
): BuildOccurrence =>
  ({
    id,
    identity: { definitionId, name: definitionId, type },
    acquiredLevel: 11,
    legality: "rules-legal",
    children,
    unresolved: false,
    ...(replacesId === undefined ? {} : { replacesId }),
  }) as BuildOccurrence;

const buildWith = (...roots: readonly BuildOccurrence[]) =>
  ({
    levels: roots.map((root, index) => ({ level: index + 1, root })),
  }) as unknown as CharacterBuild;

describe("builder card paragon path", () => {
  it("is the paragon path picked at any level, unless retrained away", () => {
    expect(
      buildParagonPathId(buildWith(occurrence("L1", "Level", "LEVEL_1"))),
    ).toBeUndefined();
    const path = occurrence("PP", "Paragon Path", "PATH_LEGENDARY");
    expect(
      buildParagonPathId(
        buildWith(
          occurrence("L1", "Level", "LEVEL_1"),
          occurrence("L11", "Level", "LEVEL_11", [path]),
        ),
      ),
    ).toBe("PATH_LEGENDARY");
    expect(
      buildParagonPathId(
        buildWith(
          occurrence("L11", "Level", "LEVEL_11", [path]),
          occurrence("L12", "Level", "LEVEL_12", [
            occurrence("PP2", "Paragon Path", "PATH_VALIANT", [], "PP"),
          ]),
        ),
      ),
    ).toBe("PATH_VALIANT");
  });
});

function entity(
  id: string,
  type: string,
  specifics: Readonly<Record<string, string>> = {},
): ContentEntity {
  return {
    id,
    name: id,
    type,
    source: "Public fixture",
    sources: ["Public fixture"],
    attributes: [],
    categories: [],
    description: "",
    specifics: Object.entries(specifics).map(([name, value], ordinal) => ({
      name,
      value,
      extraAttributes: [],
      ordinal,
    })),
    rules: [],
    extensions: [],
    provenance: { sourceKey: "public-builder-cards", sourceOrdinal: 0 },
  };
}

const power = entity("LATER_POWER", "Power", {
  "Power Usage": "Daily",
  "Action Type": "Standard Action",
  Effect: "You teleport 3 squares.",
});
const content = [entity("L1", "Level"), power];
const build: CharacterBuild = {
  formatVersion: 3,
  effectiveLevel: 1,
  levels: [
    {
      level: 1,
      root: {
        id: "l1",
        identity: { definitionId: "L1", name: "1", type: "Level" },
        acquiredLevel: 1,
        legality: "rules-legal",
        unresolved: false,
        children: [],
      },
    },
  ],
  grabbag: [],
  inventory: [],
  known: [],
  alternates: [],
  baseAbilities: {},
  textStrings: {},
};

const preferences = {
  resolveAbilityChoices: true,
  proficientEquipmentOnly: false,
  abbreviateAbilityValues: false,
};

describe("builder card settings", () => {
  it("evaluates a power the character doesn't own once per character state", () => {
    const evaluation = rules.evaluateCharacter(
      rules.projectBuildForEvaluation(build, content),
      content,
    );
    const evaluatePowers = vi.mocked(rules.evaluatePowers);
    evaluatePowers.mockClear();
    const settings = evaluatedBuilderCardSettings(
      build,
      evaluation,
      content,
      preferences,
    );
    // Nothing is evaluated until a pane shows a card.
    expect(evaluatePowers).not.toHaveBeenCalled();
    // A detail pane mounting, folding away and mounting again: the owned
    // powers once, the hypothetical power once.
    const first = settings.powerCardFor(power);
    const again = settings.powerCardFor(power);
    expect(again).toBe(first);
    expect(first.name).toBe("LATER_POWER");
    expect(evaluatePowers).toHaveBeenCalledTimes(2);
  });

  it("scans the content once per content, not per character state", () => {
    const { content: counted, scans } = scanCountingContent(content);
    const settingsFor = () => {
      const evaluation = rules.evaluateCharacter(
        rules.projectBuildForEvaluation(build, counted),
        counted,
      );
      const settings = evaluatedBuilderCardSettings(
        build,
        evaluation,
        counted,
        preferences,
      );
      settings.powerCardFor(power);
    };
    settingsFor();
    const warm = scans();
    // The next edit: a new evaluation and new card settings.
    settingsFor();
    expect(scans()).toBe(warm);
  });

  it("shows an augmentable power as its one combined card (D118)", () => {
    // Spelled as the real content is: indented fields under "Augment".
    const versionId = (augment: number) =>
      `ID_INTERNAL_POWER_MIND_SURGE_(AUGMENT_${augment})`;
    const parent = entity("MIND_SURGE", "Power", {
      "Power Usage": "At-Will",
      "Action Type": "Standard Action",
      Effect: "You slide the target 1 square.",
      Augment: "1",
      " Effect": "You slide the target 3 squares.",
      _AugmentVersions: [0, 1].map(versionId).join(","),
    });
    const version = (augment: number, effect: string) =>
      entity(versionId(augment), "Power", {
        "Power Usage": "At-Will",
        "Action Type": "Standard Action",
        Effect: effect,
        _AugmentParent: "MIND_SURGE",
      });
    const augmentable = [
      ...content,
      parent,
      version(0, "You slide the target 1 square."),
      version(1, "You slide the target 3 squares."),
    ];
    const evaluation = rules.evaluateCharacter(
      rules.projectBuildForEvaluation(build, augmentable),
      augmentable,
    );
    const settings = evaluatedBuilderCardSettings(
      build,
      evaluation,
      augmentable,
      preferences,
    );
    const card = settings.powerCardFor(parent);
    expect(card.name).toBe("MIND_SURGE");
    expect(card.augmentVersionIds).toEqual([0, 1].map(versionId));
    expect(card.fields).toContainEqual({
      label: "Effect",
      value: "You slide the target 1 square.",
    });
    expect(card.augments).toEqual([
      {
        id: versionId(1),
        augment: "1",
        fields: [{ label: "Effect", value: "You slide the target 3 squares." }],
      },
    ]);
  });
});
