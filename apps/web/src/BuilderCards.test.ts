import { describe, expect, it, vi } from "vitest";

import type { BuildOccurrence, CharacterBuild } from "@4ecb/character-domain";
import type { ContentEntity } from "@4ecb/content-domain";
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

describe("builder card settings", () => {
  it("evaluates a power the character doesn't own once per character state", () => {
    const evaluation = rules.evaluateCharacter(
      rules.projectBuildForEvaluation(build, content),
      content,
    );
    const settings = evaluatedBuilderCardSettings(build, evaluation, content, {
      resolveAbilityChoices: true,
      proficientEquipmentOnly: false,
      abbreviateAbilityValues: false,
    });
    const evaluatePowers = vi.mocked(rules.evaluatePowers);
    evaluatePowers.mockClear();
    // A detail pane mounting, folding away and mounting again.
    const first = settings.powerCardFor(power);
    const again = settings.powerCardFor(power);
    expect(again).toBe(first);
    expect(first.name).toBe("LATER_POWER");
    expect(evaluatePowers).toHaveBeenCalledTimes(1);
  });
});
