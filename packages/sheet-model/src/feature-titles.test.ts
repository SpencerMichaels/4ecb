import { describe, expect, it } from "vitest";
import type { ContentEntity } from "@4ecb/content-domain";
import {
  featureRowTitle,
  soleClassName,
  withoutDanglingChoiceLeadIn,
} from "./feature-titles";
import { buildSheetModel } from "./index";
import { withSheetOverview } from "./overview";

describe("feature row titles", () => {
  it("drops a leading level that repeats the tag and the sole class's name", () => {
    const sole = { level: 2, classFeature: true, soleClass: "Hexblade" };
    expect(featureRowTitle("Level 2 Hexblade Utility Power", sole)).toBe(
      "Utility Power",
    );
    expect(
      featureRowTitle("Level 2 Hexblade Utility Power", {
        ...sole,
        soleClass: undefined,
      }),
    ).toBe("Hexblade Utility Power");
    expect(featureRowTitle("Level 1 Guardian Feature", { level: 1 })).toBe(
      "Guardian Feature",
    );
  });
  it("keeps a level that differs from the tag, possessives and bare class names", () => {
    const sole = { level: 3, classFeature: true, soleClass: "Warlock" };
    expect(featureRowTitle("Level 2 Warlock Utility Power", sole)).toBe(
      "Level 2 Warlock Utility Power",
    );
    expect(featureRowTitle("Warlock Pact Boon", sole)).toBe(
      "Warlock Pact Boon",
    );
    expect(featureRowTitle("Level 3 Warlock's Curse", sole)).toBe(
      "Warlock's Curse",
    );
    expect(featureRowTitle("Level 3 Warlock", sole)).toBe("Warlock");
    // Only class features lose the class name; a feat's name is its own.
    expect(
      featureRowTitle("Level 3 Warlock Implement Expertise", {
        ...sole,
        classFeature: false,
      }),
    ).toBe("Warlock Implement Expertise");
  });
  it("finds a sole class unless the character is a hybrid or multiclass", () => {
    const hexblade = [
      { type: "Class", name: "Hexblade" },
      // A class counts as itself and its parent class.
      { type: "CountsAsClass", name: "Hexblade" },
      { type: "CountsAsClass", name: "Warlock" },
    ];
    expect(soleClassName(hexblade)).toBe("Hexblade");
    expect(
      soleClassName([...hexblade, { type: "Multiclass", name: "Multiclass" }]),
    ).toBeUndefined();
    expect(
      soleClassName([
        { type: "Class", name: "Hybrid" },
        { type: "Hybrid Class", name: "Hybrid Fighter" },
        { type: "Hybrid Class", name: "Hybrid Rogue" },
      ]),
    ).toBeUndefined();
    expect(soleClassName([])).toBeUndefined();
  });
});

describe("dangling choice lead-ins", () => {
  it("drops a closing sentence that only introduces an unshown choice list", () => {
    for (const text of [
      "You gain one of the following utility powers of your choice.",
      "You gain two of the following powers of your choice.",
      "Choose one of the following fighter talents.",
      "When you select this option, you choose one of the following class features.",
      "You add two of the following powers to your spellbook.",
      "When creating a kapak draconian character, you can pick from the following benefits.",
    ])
      expect(withoutDanglingChoiceLeadIn(text)).toBe("");
    expect(
      withoutDanglingChoiceLeadIn(
        "Your pact grants power. Choose one of the following options.",
      ),
    ).toBe("Your pact grants power.");
  });
  it("keeps real content after a lead-in, granted lists and plain choices", () => {
    for (const text of [
      "Choose one of the following options. Option A: you gain a bonus.",
      "You also gain the following powers.",
      "You gain a 2nd-level sorcerer utility power of your choice.",
      "You gain proficiency in a single weapon of your choice.",
    ])
      expect(withoutDanglingChoiceLeadIn(text)).toBe(text);
  });
});

describe("overview feature titles", () => {
  const entity = (
    id: string,
    name: string,
    type: string,
    extra: Partial<ContentEntity> = {},
  ): ContentEntity => ({
    id,
    name,
    type,
    source: "Synthetic",
    sources: [],
    attributes: [],
    categories: [],
    rules: [],
    extensions: [],
    specifics: [],
    provenance: { sourceKey: "synthetic", sourceOrdinal: 0 },
    description: "",
    ...extra,
  });
  const feature = entity(
    "feature:utility",
    "Level 2 Synthblade Utility Power",
    "Class Feature",
    {
      description:
        "You gain one of the following utility powers of your choice.",
      specifics: [
        { name: "Level", value: "2", extraAttributes: [], ordinal: 0 },
      ],
    },
  );
  const synthblade = entity("class:synthblade", "Synthblade", "Class", {
    rules: [
      {
        name: "grant",
        attributes: [{ name: "name", value: feature.id }],
        text: "",
        children: [],
        ordinal: 0,
      },
    ],
  });
  const overview = (extra: readonly ContentEntity[]) => {
    const content = [synthblade, feature, ...extra];
    const selections = content.map(({ id, name, type }) => ({
      id,
      name,
      type,
    }));
    const model = buildSheetModel(
      {
        details: { name: "Titled", Level: "2" },
        abilities: {},
        stats: {},
        selectedRules: selections,
        levelCount: 2,
        source: "legacy-cache" as const,
        textStrings: {},
        loot: [],
        powers: [],
      },
      content,
    );
    return withSheetOverview(model, {
      level: 2,
      stats: {},
      selections,
      content,
      inventory: [],
    }).overview!.features.find(({ id }) => id === feature.id)!;
  };
  it("titles a single-class feature without its level or class", () => {
    const row = overview([]);
    expect([row.name, row.level, row.title]).toEqual([
      "Level 2 Synthblade Utility Power",
      2,
      "Utility Power",
    ]);
  });
  it("keeps the class name for a multiclass character", () => {
    expect(
      overview([entity("multiclass", "Multiclass", "Multiclass")]).title,
    ).toBe("Synthblade Utility Power");
  });
});
