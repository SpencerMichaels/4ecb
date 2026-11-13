import { describe, expect, it } from "vitest";

import type { ContentEntity } from "@4ecb/content-domain";
import {
  ACTION_TYPE_LABELS,
  ACTION_TYPE_SYMBOLS,
  ACTION_TYPES,
  type ActionType,
} from "@kit";

import { choiceSectionIcon } from "./builder-ui";
import {
  entityTypeIcon,
  entityVisualTone,
  powerActionSymbol,
  powerActionType,
  powerAttackIcon,
  sheetReferenceIcon,
} from "./visual-language";

function entity(
  type: string,
  categories: readonly string[] = [],
  specifics: Readonly<Record<string, string>> = {},
): ContentEntity {
  return {
    id: `${type}-fixture`,
    name: "Fixture",
    type,
    source: "Test",
    sources: ["Test"],
    attributes: [],
    categories,
    specifics: Object.entries(specifics).map(([name, value], ordinal) => ({
      name,
      value,
      ordinal,
      extraAttributes: [],
    })),
    rules: [],
    description: "",
    extensions: [],
    provenance: { sourceKey: "test", sourceOrdinal: 0 },
  };
}

describe("legacy-derived visual language", () => {
  it("matches printed card tones: usage, Utility blue, and plum features", () => {
    expect(
      entityVisualTone(
        entity("Power", [], {
          "Power Usage": "Encounter",
          "Power Type": "Utility",
          "Action Type": "Minor Action",
        }),
      ),
    ).toBe("utility");
    expect(
      entityVisualTone(
        entity("Power", [], {
          "Power Usage": "At-Will",
          "Power Type": "Feature",
          "Action Type": "Minor Action",
        }),
      ),
    ).toBe("at-will");
    expect(
      entityVisualTone(
        entity("Power", [], {
          "Power Usage": "At-Will",
          "Rules Item": "Rules reference text.",
          "Power Type": "Feature",
        }),
      ),
    ).toBe("feature");
  });

  it("uses authored Power Usage for tone, ignoring Utility categories", () => {
    expect(
      entityVisualTone(
        entity("Power", ["Utility"], { "Power Usage": "Encounter" }),
      ),
    ).toBe("encounter");
    expect(entityVisualTone(entity("Power", ["At-Will"]))).toBe("neutral");
    expect(
      entityVisualTone(entity("Power", [], { "Power Usage": "At-Will" })),
    ).toBe("at-will");
    expect(
      entityVisualTone(entity("Power", [], { "Power Usage": "Encounter" })),
    ).toBe("encounter");
    expect(
      entityVisualTone(entity("Power", [], { "Power Usage": "Daily" })),
    ).toBe("daily");
    expect(entityVisualTone(entity("Magic Item"))).toBe("item");
  });

  it("maps familiar entity families to monochrome icons", () => {
    expect(entityTypeIcon("Class")).toBe("character");
    expect(entityTypeIcon("Paragon Path")).toBe("crown");
    expect(entityTypeIcon("Epic Destiny")).toBe("sun");
    expect(entityTypeIcon("Race")).toBe("race");
    expect(entityTypeIcon("Feat")).toBe("feat");
    expect(entityTypeIcon("Power")).toBe("power");
    expect(entityTypeIcon("Armor")).toBe("item");
    expect(entityTypeIcon("Deity")).toBe("church");
  });

  it("maps every class- and race-related type to its family icon", () => {
    for (const type of [
      "Class",
      "Hybrid Class",
      "Class Feature",
      "Trait Package",
    ])
      expect(entityTypeIcon(type), type).toBe("character");
    for (const type of ["Race", "Racial Trait", "CountsAsRace"])
      expect(entityTypeIcon(type), type).toBe("race");
  });

  it("maps companion, proficiency, deity and language rows", () => {
    for (const type of ["Companion", "Familiar", "Associate"])
      expect(entityTypeIcon(type), type).toBe("companion");
    expect(entityTypeIcon("Proficiency")).toBe("proficient");
    expect(entityTypeIcon("God Fragment")).toBe("church");
    expect(entityTypeIcon("Domain")).toBe("globe");
    expect(entityTypeIcon("Language")).toBe("languages");
    expect(entityTypeIcon("Build")).toBe("signpost");
    // Internal plumbing stays generic.
    expect(entityTypeIcon("Internal")).toBe("content");
  });

  it("gives each sheet reference group its builder card's icon", () => {
    expect(sheetReferenceIcon("Class features")).toBe("character");
    expect(sheetReferenceIcon("Racial traits")).toBe("race");
    expect(sheetReferenceIcon("Racial features")).toBe("race");
    expect(sheetReferenceIcon("Feats")).toBe("feat");
    expect(sheetReferenceIcon("Other reminders")).toBe("feat");
    expect(sheetReferenceIcon("Paragon paths")).toBe("crown");
    expect(sheetReferenceIcon("Epic destinies")).toBe("sun");
    expect(sheetReferenceIcon("Theme")).toBe("background");
    expect(sheetReferenceIcon("Background")).toBe("background");
    expect(sheetReferenceIcon("Deity")).toBe("church");
    expect(sheetReferenceIcon("Items")).toBe("item");
    expect(sheetReferenceIcon("Item properties")).toBe("item");
    expect(sheetReferenceIcon("Item power index")).toBe("item");
    expect(sheetReferenceIcon("Power index")).toBe("power");
    expect(sheetReferenceIcon("Rituals & practices")).toBe("book");
  });

  it("heads the Theme section with its cards' icon", () => {
    expect(choiceSectionIcon("Theme")).toBe(entityTypeIcon("Theme"));
    expect(choiceSectionIcon("Theme")).toBe("background");
  });

  it("never uses the Shield for anything class-related", () => {
    expect(choiceSectionIcon("Class")).toBe("character");
    expect(sheetReferenceIcon("Class features")).not.toBe("class");
  });

  it("maps every power action type to the shared kit's symbol", () => {
    const symbol = (type: ActionType) => ACTION_TYPE_SYMBOLS[type];
    expect(powerActionSymbol("Standard Action")).toBe(symbol("standard"));
    expect(powerActionSymbol("Minor Action")).toBe(symbol("minor"));
    expect(powerActionSymbol("Move Action")).toBe(symbol("move"));
    expect(powerActionSymbol("Free Action")).toBe(symbol("free"));
    expect(powerActionSymbol("No Action")).toBe(symbol("no-action"));
    expect(powerActionSymbol("Immediate Reaction")).toBe(
      symbol("immediate-reaction"),
    );
    expect(powerActionSymbol("Opportunity Action")).toBe(symbol("opportunity"));
    expect(powerActionSymbol("Immediate Interrupt")).toBe(
      symbol("immediate-interrupt"),
    );
    expect(powerActionSymbol(undefined)).toBe(symbol("no-action"));
  });

  it("reads each of the kit's action type labels as that type", () => {
    for (const type of ACTION_TYPES) {
      expect(powerActionType(ACTION_TYPE_LABELS[type])).toBe(type);
    }
  });

  it("maps power attack metadata to compact semantic icons", () => {
    expect(powerAttackIcon("Melee weapon")).toBe("attack-melee");
    expect(powerAttackIcon("Melee or Ranged weapon")).toBe("attack-versatile");
    expect(powerAttackIcon("Area burst 1 within 10")).toBe("attack-area");
    expect(powerAttackIcon(undefined)).toBe("action-none");
  });
});
