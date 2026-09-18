import { describe, expect, it } from "vitest";

import type { ContentEntity } from "@4ecb/content-domain";

import {
  diverseStudyException,
  EXCEPTION_IDS,
  isCustomChoiceException,
  isUniversalSkill,
  matchingDeityAlignmentClasses,
  seekerException,
  shouldChooseDeity,
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

  it("requires a deity from either recovered class metadata field", () => {
    const ordinary = entity("ORDINARY", "Ordinary", "Class");
    const parsedClass = entity("DIVINE", "Divine", "Class", [
      ["_PARSED_CLASS_FEATURE", "Armor, CHANNEL DIVINITY, Healing"],
    ]);
    const hybridClass = entity("HYBRID", "Hybrid Divine", "Hybrid Class", [
      ["Hybrid Talent Options", "Armor, Channel Divinity (Hybrid Divine)."],
    ]);

    expect(shouldChooseDeity([ordinary])).toBe(false);
    expect(shouldChooseDeity([ordinary, parsedClass])).toBe(true);
    expect(shouldChooseDeity([hybridClass])).toBe(true);
  });

  it("preserves the exact case-insensitive Warpriest exclusion", () => {
    expect(
      shouldChooseDeity([
        entity("EXCLUDED", "wArPrIeSt", "Class", [
          ["_PARSED_CLASS_FEATURE", "Channel Divinity Powers"],
        ]),
      ]),
    ).toBe(false);
  });

  it("finds exact deity-alignment classes and follows hybrid base-class links", () => {
    const paladin = entity("PALADIN", "Paladin", "Class", [
      ["_PARSED_CLASS_FEATURE", "Channel Divinity"],
      [
        "Supplemental",
        "You must choose an alignment identical to the alignment of your patron deity.",
      ],
    ]);
    const invoker = entity("INVOKER", "Invoker", "Class", [
      ["_PARSED_CLASS_FEATURE", "Channel Divinity"],
      [
        "Supplemental",
        "Because of your divine bond, your alignment must match your deity’s.",
      ],
    ]);
    const cleric = entity("CLERIC", "Cleric", "Class", [
      ["_PARSED_CLASS_FEATURE", "Channel Divinity"],
      [
        "Supplemental",
        "You must choose a deity compatible with your alignment.",
      ],
    ]);
    const avenger = entity("AVENGER", "Avenger", "Class", [
      ["_PARSED_CLASS_FEATURE", "Channel Divinity"],
      ["Supplemental", "An avenger might serve any deity."],
    ]);
    const hybridPaladin = entity(
      "HYBRID-PALADIN",
      "Hybrid Paladin",
      "Hybrid Class",
      [
        ["Hybrid Talent Options", "Channel Divinity (Hybrid Paladin)"],
        ["_BaseClass", paladin.id],
      ],
    );
    const hybridInvoker = entity(
      "HYBRID-INVOKER",
      "Hybrid Invoker",
      "Hybrid Class",
      [
        ["Hybrid Talent Options", "Channel Divinity (Hybrid Invoker)"],
        ["_BaseClass", invoker.id],
      ],
    );
    const hybridCleric = entity(
      "HYBRID-CLERIC",
      "Hybrid Cleric",
      "Hybrid Class",
      [
        ["Hybrid Talent Options", "Channel Divinity (Hybrid Cleric)"],
        ["_BaseClass", cleric.id],
      ],
    );
    const hybridAvenger = entity(
      "HYBRID-AVENGER",
      "Hybrid Avenger",
      "Hybrid Class",
      [
        ["Hybrid Talent Options", "Channel Divinity (Hybrid Avenger)"],
        ["_BaseClass", avenger.id],
      ],
    );
    const definitions = [
      paladin,
      invoker,
      cleric,
      avenger,
      hybridPaladin,
      hybridInvoker,
      hybridCleric,
      hybridAvenger,
    ];

    expect(
      matchingDeityAlignmentClasses(definitions, definitions).map(
        ({ name }) => name,
      ),
    ).toEqual(["Paladin", "Invoker", "Hybrid Paladin", "Hybrid Invoker"]);
  });

  it("does not infer a hybrid alignment rule without an authored base link", () => {
    const hybrid = entity("HYBRID", "Hybrid Paladin", "Hybrid Class", [
      ["Hybrid Talent Options", "Channel Divinity (Hybrid Paladin)"],
    ]);
    expect(matchingDeityAlignmentClasses([hybrid], [hybrid])).toEqual([]);
  });
});
