import { describe, expect, it } from "vitest";

import type { ContentEntity, RuleStatement } from "@4ecb/content-domain";

import { candidateReferenceIndex } from "./CandidateSelectionTable";
import {
  detailStackEntries,
  detailStackSectionHeading,
  detailStackSections,
  grantedLevel,
  offeredDetailEntities,
  optionBenefitEntry,
} from "./detail-stack";

function entity(
  id: string,
  type: string,
  specifics: Readonly<Record<string, string>> = {},
  grants: readonly (readonly [name: string, requires?: string])[] = [],
): ContentEntity {
  return {
    id,
    name: id.toLowerCase().replaceAll("_", " "),
    type,
    source: "test",
    sources: ["test"],
    attributes: [],
    categories: [],
    specifics: Object.entries(specifics).map(([name, value], ordinal) => ({
      name,
      value,
      extraAttributes: [],
      ordinal,
    })),
    rules: grants.map(([name, requires], ordinal): RuleStatement => ({
      name: "grant",
      attributes: [
        { name: "name", value: name },
        ...(requires === undefined
          ? []
          : [{ name: "requires", value: requires }]),
      ],
      text: "",
      children: [],
      ordinal,
    })),
    description: "",
    extensions: [],
    provenance: { sourceKey: "test", sourceOrdinal: 0 },
  };
}

const index = (...entities: readonly ContentEntity[]) =>
  candidateReferenceIndex(
    new Map(entities.map((item) => [item.id.toLowerCase(), item])),
  );
const summary = (
  root: ContentEntity,
  references: ReadonlyMap<string, ContentEntity>,
  exclude?: readonly string[],
) =>
  detailStackEntries(root, references, exclude).map(
    ({ entity: shown, relationship }) =>
      relationship === undefined ? shown.id : `${shown.id} (${relationship})`,
  );

describe("detail stack", () => {
  it("follows a paragon path's features, then all its powers, even later ones", () => {
    const wakePower = entity("WAKE_POWER", "Power");
    const wake = entity("WAKE", "Class Feature", {}, [["WAKE_POWER"]]);
    const favor = entity("FAVOR", "Class Feature");
    const utility = entity("UTILITY", "Power");
    const daily = entity("DAILY", "Power");
    const path = entity(
      "PATH",
      "Paragon Path",
      {
        "Class Features": "WAKE, FAVOR",
        Powers: "UTILITY,DAILY",
        _DisplayPowers: "UTILITY,DAILY",
      },
      // The level 20 power is granted only later.
      [["UTILITY"], ["DAILY", "Level 20"]],
    );
    expect(
      summary(path, index(path, wake, wakePower, favor, utility, daily)),
    ).toEqual([
      "WAKE",
      "WAKE_POWER (Granted power)",
      "FAVOR",
      "UTILITY (Granted power)",
      "DAILY (Granted power)",
    ]);
  });

  it("shows a deity's domains, a choice's options and a feature's children", () => {
    const change = entity("CHANGE", "Domain");
    const luck = entity("LUCK", "Domain");
    const deity = entity("DEITY", "Deity", { Domains: "CHANGE, LUCK" });
    const references = index(deity, change, luck);
    expect(summary(deity, references)).toEqual(["CHANGE", "LUCK"]);

    const firePower = entity("FIRE_POWER", "Power");
    const fire = entity("FIRE", "Racial Trait", { Powers: "FIRE_POWER" });
    const earth = entity("EARTH", "Racial Trait");
    const manifestation = entity("MANIFEST", "Racial Trait", {
      _PARSED_SUB_FEATURES: "FIRE, EARTH",
    });
    expect(
      summary(manifestation, index(manifestation, fire, firePower, earth)),
    ).toEqual(["FIRE", "FIRE_POWER (Granted power)", "EARTH"]);

    const child = entity("CHILD", "Class Feature");
    const magic = entity("MAGIC", "Class Feature", {
      _PARSED_CHILD_FEATURES: "CHILD",
    });
    expect(summary(magic, index(magic, child))).toEqual(["CHILD"]);
  });

  it("shows a theme's level features but leaves its powers to the theme list", () => {
    const feat = entity("THEME_FEAT", "Feat");
    const level1 = entity("LEVEL_1", "Class Feature", {}, [["THEME_FEAT"]]);
    const power = entity("THEME_POWER", "Power");
    const theme = entity("THEME", "Theme", {
      _PARSED_SUB_FEATURES: "LEVEL_1",
      _DisplayPowers: "THEME_POWER",
    });
    expect(
      summary(theme, index(theme, level1, feat, power), ["THEME_POWER"]),
    ).toEqual(["LEVEL_1", "THEME_FEAT (Granted feat)"]);
  });

  it("shows each card once, stops loops and bounds the depth", () => {
    const deepest = entity("DEEPEST", "Power");
    const deep = entity("DEEP", "Power", { _ChildPower: "DEEPEST" });
    const power = entity("POWER", "Power", { _ChildPower: "DEEP" });
    // Names its owner back, and a power the owner shows too.
    const feature = entity("FEATURE", "Class Feature", {
      _PARSED_SUB_FEATURES: "OWNER",
      _DisplayPowers: "POWER",
    });
    const owner = entity("OWNER", "Paragon Path", {
      "Class Features": "FEATURE",
      Powers: "POWER",
    });
    expect(summary(owner, index(owner, feature, power, deep, deepest))).toEqual(
      ["FEATURE", "POWER (Granted power)", "DEEP (Granted power)"],
    );
  });

  it("leaves a class's and a race's features to their own card", () => {
    const feature = entity("FEATURE", "Class Feature");
    const trait = entity("TRAIT", "Racial Trait");
    const playerClass = entity("CLASS", "Class", {
      _PARSED_CLASS_FEATURE: "FEATURE",
    });
    const race = entity("RACE", "Race", { _PARSED_SUB_FEATURES: "TRAIT" });
    const references = index(playerClass, race, feature, trait);
    expect(summary(playerClass, references)).toEqual([]);
    expect(summary(race, references)).toEqual([]);
  });

  it("offers an item's conditionally granted powers, not associates", () => {
    const eyebite = entity("EYEBITE", "Power");
    const guard = entity("GUARD", "Associate");
    const item = entity(
      "ARTIFACT",
      "Magic Item",
      { "Granted Powers": "EYEBITE", _DisplayPowers: "EYEBITE, GUARD" },
      [["EYEBITE", "!EYEBITE"]],
    );
    expect(
      offeredDetailEntities(item, index(item, eyebite, guard)).map(
        ({ id }) => id,
      ),
    ).toEqual(["EYEBITE"]);
  });
});

describe("detail stack levels", () => {
  const levelled = (
    id: string,
    type: string,
    level: string,
    specifics: Readonly<Record<string, string>> = {},
    grants: readonly (readonly [name: string, requires?: string])[] = [],
  ) => entity(id, type, { Level: level, ...specifics }, grants);
  const withGrantLevels = (
    owner: ContentEntity,
    levels: Readonly<Record<string, string>>,
  ): ContentEntity => ({
    ...owner,
    rules: Object.entries(levels).map(([name, level], ordinal) => ({
      name: "grant",
      attributes: [
        { name: "name", value: name },
        { name: "Level", value: level },
      ],
      text: "",
      children: [],
      ordinal,
    })),
  });
  const sections = (
    root: ContentEntity,
    references: ReadonlyMap<string, ContentEntity>,
  ) =>
    detailStackSections(detailStackEntries(root, references)).map((section) => [
      section.level,
      section.entries.map(({ entity: shown }) => shown.id),
    ]);

  it("files a pact's features by their level, each with what it grants", () => {
    const boonPower = entity("BOON_POWER", "Power", { Level: "1" });
    const allyAttack = entity("ALLY_ATTACK", "Power", { Level: "1" });
    const boon = levelled("BOON", "Class Feature", "1", {}, [["BOON_POWER"]]);
    // Its powers' own levels don't move them away from the feature.
    const ally = levelled("LEVEL_9_ALLY", "Class Feature", "9", {}, [
      ["ALLY_ATTACK"],
    ]);
    const paragon = levelled("LEVEL_11_ASPECT", "Class Feature", "11");
    const pact = entity("PACT", "Trait Package", {
      _PARSED_CLASS_FEATURE: "BOON, LEVEL_9_ALLY, LEVEL_11_ASPECT",
    });
    const references = index(pact, boon, boonPower, ally, allyAttack, paragon);
    expect(sections(pact, references)).toEqual([
      [1, ["BOON", "BOON_POWER"]],
      [9, ["LEVEL_9_ALLY", "ALLY_ATTACK"]],
      [11, ["LEVEL_11_ASPECT"]],
    ]);
    expect(
      detailStackEntries(pact, references).map(({ depth }) => depth),
    ).toEqual([0, 1, 0, 1, 0]);
  });

  it("prefers the option's grant level and files its powers under it", () => {
    const wake = levelled("WAKE", "Class Feature", "11");
    const favor = entity("FAVOR", "Class Feature");
    const utility = entity("UTILITY", "Power", { Level: "12" });
    const daily = entity("DAILY", "Power");
    const path = withGrantLevels(
      entity("PATH", "Paragon Path", {
        "Class Features": "WAKE, FAVOR",
        Powers: "UTILITY, DAILY",
      }),
      { FAVOR: "16", DAILY: "20" },
    );
    expect(sections(path, index(path, wake, favor, utility, daily))).toEqual([
      [11, ["WAKE"]],
      [12, ["UTILITY"]],
      [16, ["FAVOR"]],
      [20, ["DAILY"]],
    ]);
  });

  it("gives an unlevelled benefit the first level, never one before the option's own", () => {
    const general = entity("GENERAL", "Class Feature");
    const blessing = levelled("BLESSING", "Class Feature", "1");
    const later = levelled("LATER", "Class Feature", "3");
    const domain = entity("DOMAIN", "Trait Package", {
      _PARSED_CLASS_FEATURE: "GENERAL, LATER, BLESSING",
    });
    expect(sections(domain, index(domain, general, blessing, later))).toEqual([
      [1, ["GENERAL", "BLESSING"]],
      [3, ["LATER"]],
    ]);

    // A level 16 feature's choice of a level 1 power comes at 16.
    const early = entity("EARLY", "Power", { Level: "1" });
    const usual = entity("USUAL", "Power", { Level: "16" });
    const choice = levelled("CHOICE_16", "Class Feature", "16", {
      _DisplayPowers: "EARLY, USUAL",
    });
    expect(sections(choice, index(choice, early, usual))).toEqual([]);
  });

  it("keeps one-level stacks and an item's powers flat", () => {
    const power = entity("FEAT_POWER", "Power", { Level: "7" });
    const feat = entity("FEAT", "Feat", {}, [["FEAT_POWER"]]);
    expect(sections(feat, index(feat, power))).toEqual([]);

    const first = entity("FIRST", "Power", { Level: "13" });
    const second = entity("SECOND", "Power", { Level: "16" });
    const item = entity("ITEM", "Magic Item", {
      _DisplayPowers: "FIRST, SECOND",
    });
    expect(sections(item, index(item, first, second))).toEqual([]);
  });

  it("files an option's own benefits by their level (theme powers)", () => {
    const theme = withGrantLevels(entity("THEME", "Theme"), { POWER_5: "5" });
    expect(
      grantedLevel(theme, entity("POWER_5", "Power", { Level: "2" })),
    ).toBe(5);
    expect(
      optionBenefitEntry(theme, entity("POWER_6", "Power", { Level: "6" })),
    ).toMatchObject({ depth: 0, level: 6 });
  });

  it("heads a section with its level, benefit names and card counts", () => {
    const allyPower = entity("ALLY_POWER", "Power");
    const allyAttack = entity("ALLY_ATTACK", "Power");
    const ally = {
      ...levelled("ALLY", "Class Feature", "9", {}, [
        ["ALLY_POWER"],
        ["ALLY_ATTACK"],
      ]),
      name: "Level 9 Summon Warlock's Ally",
    };
    const curse = {
      ...levelled("CURSE", "Class Feature", "11"),
      name: "Level 11 Fey Pact Curse",
    };
    const pact = entity("PACT", "Trait Package", {
      _PARSED_CLASS_FEATURE: "ALLY, CURSE",
    });
    const [nine, eleven] = detailStackSections(
      detailStackEntries(pact, index(pact, ally, allyPower, allyAttack, curse)),
    );
    expect(nine && detailStackSectionHeading(nine)).toEqual({
      label: "Level 9",
      count: "1 feature, 2 powers",
      names: ["Summon Warlock's Ally"],
    });
    expect(eleven && detailStackSectionHeading(eleven)).toEqual({
      label: "Level 11",
      count: "1 feature",
      names: ["Fey Pact Curse"],
    });
  });
});

describe("detail stack paragon path sections", () => {
  const feature = (
    id: string,
    level: string,
    grants: readonly string[] = [],
    name = id,
  ): ContentEntity => ({
    ...entity(
      id,
      "Class Feature",
      { Level: level },
      grants.map((g) => [g]),
    ),
    name,
  });
  // Each path's level 11 feature grants every pact's own version of it.
  const legendaryCurse = feature(
    "LEGENDARY_CURSE",
    "11",
    [],
    "Level 11 Fey Curse (Legendary Blade)",
  );
  const legendaryInvocation = feature(
    "LEGENDARY_INVOCATION",
    "12",
    ["INVOCATION_POWER"],
    "Level 12 Fey Invocation [Legendary Blade]",
  );
  const invocationPower = entity("INVOCATION_POWER", "Power", { Level: "12" });
  const valiantCurse = feature("VALIANT_CURSE", "11");
  const legendaryFeature = feature("LEGENDARY_PACT_CURSE", "11", [
    "LEGENDARY_CURSE",
    "OTHER_PACT_CURSE",
  ]);
  const legendary = {
    ...entity("LEGENDARY", "Paragon Path", {
      "Class Features": "LEGENDARY_PACT_CURSE, LEGENDARY_INVOCATION",
    }),
    name: "Legendary Blade",
  };
  const valiant = {
    ...entity("VALIANT", "Paragon Path", { "Class Features": "VALIANT_CURSE" }),
    name: "Valiant Blade",
  };
  const shared = feature("SHARED_11", "11");
  const later = feature("GREATER_25", "25");
  const boon = feature("BOON", "1");
  const pact = entity("PACT", "Trait Package", {
    _PARSED_CLASS_FEATURE:
      "BOON, VALIANT_CURSE, LEGENDARY_CURSE, SHARED_11, LEGENDARY_INVOCATION, GREATER_25",
  });
  const references = index(
    pact,
    boon,
    legendary,
    valiant,
    legendaryFeature,
    legendaryCurse,
    legendaryInvocation,
    invocationPower,
    valiantCurse,
    shared,
    later,
  );
  const outline = (paragonPathId?: string) =>
    detailStackSections(detailStackEntries(pact, references), {
      paragonPathId,
    }).map((section) =>
      section.path === undefined
        ? `${String(section.level)}: ${section.entries.map(({ entity: shown }) => shown.id).join(" ")}`
        : `${section.path.name}: ${section.levels
            .map(
              ({ level, entries }) =>
                `${String(level)} ${entries.map(({ entity: shown }) => shown.id).join(" ")}`,
            )
            .join(" / ")}`,
    );

  it("gives each paragon path its own section, by level, at its first level", () => {
    expect(outline()).toEqual([
      "1: BOON",
      "11: SHARED_11",
      "Legendary Blade: 11 LEGENDARY_CURSE / 12 LEGENDARY_INVOCATION INVOCATION_POWER",
      "Valiant Blade: 11 VALIANT_CURSE",
      "25: GREATER_25",
    ]);
  });

  it("keeps only the character's paragon path", () => {
    expect(outline("valiant")).toEqual([
      "1: BOON",
      "11: SHARED_11",
      "Valiant Blade: 11 VALIANT_CURSE",
      "25: GREATER_25",
    ]);
    expect(outline("SOME_OTHER_PATH")).toEqual([
      "1: BOON",
      "11: SHARED_11",
      "25: GREATER_25",
    ]);
  });

  it("heads a path section with its name, level range and plain benefit names", () => {
    const section = detailStackSections(
      detailStackEntries(pact, references),
    ).find(({ path }) => path?.id === "LEGENDARY");
    expect(section && detailStackSectionHeading(section)).toEqual({
      label: "Legendary Blade (Levels 11–12)",
      count: "2 features, 1 power",
      names: ["Fey Curse", "Fey Invocation"],
    });
    const valiantSection = detailStackSections(
      detailStackEntries(pact, references),
    ).find(({ path }) => path?.id === "VALIANT");
    expect(
      valiantSection && detailStackSectionHeading(valiantSection).label,
    ).toBe("Valiant Blade (Level 11)");
  });

  it("leaves a paragon path's own features unsplit", () => {
    expect(
      detailStackEntries(legendary, references).some(
        ({ path }) => path !== undefined,
      ),
    ).toBe(false);
  });
});
