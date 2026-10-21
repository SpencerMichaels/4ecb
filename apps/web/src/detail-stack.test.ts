import { describe, expect, it } from "vitest";

import type { ContentEntity, RuleStatement } from "@4ecb/content-domain";

import { candidateReferenceIndex } from "./CandidateSelectionTable";
import { detailStackEntries, offeredDetailEntities } from "./detail-stack";

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
