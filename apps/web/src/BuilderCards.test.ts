import { describe, expect, it } from "vitest";

import type { BuildOccurrence, CharacterBuild } from "@4ecb/character-domain";

import { buildParagonPathId } from "./BuilderCards";

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
