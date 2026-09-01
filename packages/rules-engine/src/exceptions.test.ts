import { describe, expect, it } from "vitest";

import type { ContentEntity } from "@4ecb/content-domain";

import {
  diverseStudyException,
  EXCEPTION_IDS,
  isCustomChoiceException,
  isUniversalSkill,
  seekerException,
  versatileMasterException,
} from "./exceptions";

function entity(
  id: string,
  name: string,
  type: string,
  specifics: Array<[string, string]> = [],
): ContentEntity {
  return {
    id,
    name,
    type,
    source: "Synthetic",
    sources: ["Synthetic"],
    attributes: [],
    categories: [],
    specifics: specifics.map(([field, value], ordinal) => ({
      name: field,
      value,
      extraAttributes: [],
      ordinal,
    })),
    rules: [],
    description: "",
    extensions: [],
    provenance: { sourceKey: "fixture", sourceOrdinal: 0 },
  };
}

describe("named compatibility exceptions", () => {
  const power = entity("POWER", "Power", "Power", [["Class", "Wizard"]]);
  it("covers universal class skills", () =>
    expect(
      isUniversalSkill(
        entity("SKILL", "Skill", "Skill", [["UniversalClassSkill", "true"]]),
        "Class",
      ),
    ).toBe(true));
  it("covers Diverse Study", () =>
    expect(
      diverseStudyException(
        power,
        EXCEPTION_IDS.diverseStudyClass,
        new Set([EXCEPTION_IDS.diverseStudy.toLocaleLowerCase()]),
      ),
    ).toBe(true));
  it("covers Seeker and Versatile Master class powers", () => {
    expect(
      seekerException(
        power,
        "provider",
        ["Encounter"],
        new Set([EXCEPTION_IDS.seekerFeature.toLocaleLowerCase()]),
      ),
    ).toBe(true);
    expect(
      versatileMasterException(
        power,
        EXCEPTION_IDS.versatileMasterFeature,
        new Set([
          EXCEPTION_IDS.versatileMasterPrerequisite.toLocaleLowerCase(),
        ]),
      ),
    ).toBe(true);
  });
  it("does not treat ordinary official choices as custom bypasses", () =>
    expect(isCustomChoiceException(power)).toBe(false));
});
