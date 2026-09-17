import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ContentEntity, SpecificField } from "@4ecb/content-domain";

import {
  EntityCardBody,
  groupClassSpecifics,
  isClassEntity,
} from "./EntityCard";

function field(name: string, value: string, ordinal: number): SpecificField {
  return { name, value, ordinal, extraAttributes: [] };
}

function entity(
  type: string,
  specifics: readonly SpecificField[],
): ContentEntity {
  return {
    id: `${type}-fixture`,
    name: "Ardent",
    type,
    source: "Player's Handbook Test",
    sources: ["Player's Handbook Test"],
    attributes: [],
    categories: [],
    specifics,
    rules: [],
    description: "Class description.",
    extensions: [],
    provenance: { sourceKey: "test", sourceOrdinal: 0 },
  };
}

const classFields = [
  field("Role", "Leader. You aid your allies.", 0),
  field("Power Source", "Psionic. Your will shapes battle.", 1),
  field("Key Abilities", "Charisma, Constitution, Wisdom", 2),
  field("Hit Points at 1st Level", "12 + Constitution score", 3),
  field("Implements", "Any weapon you wield", 4),
  field("Implement", "Holy symbols", 5),
  field("Class Features", "Ardent Mantle", 6),
  field("Creating", "Choose a mantle.", 7),
  field("Uncatalogued Legacy Field", "Preserved fallback", 8),
  field("Class Features", "Psionic Augmentation", 9),
] as const;

describe("shared entity-card class details", () => {
  it("groups every authored field exactly once and retains duplicates in order", () => {
    const groups = groupClassSpecifics(classFields);
    expect(groups.map((group) => group.heading)).toEqual([
      "Role & Power Source",
      "Starting Statistics",
      "Proficiencies & Training",
      "Class Features & Build",
      "Flavor",
      "Other",
    ]);
    const groupedFields = groups.flatMap((group) => group.fields);
    expect(groupedFields).toHaveLength(classFields.length);
    expect(new Set(groupedFields)).toEqual(new Set(classFields));
    expect(
      groups
        .find((group) => group.heading === "Class Features & Build")
        ?.fields.map((specific) => specific.value),
    ).toEqual(["Ardent Mantle", "Psionic Augmentation"]);
  });

  it("renders the same labeled class sections for Class and Hybrid Class cards", () => {
    const render = (type: string) =>
      renderToStaticMarkup(
        createElement(EntityCardBody, {
          entity: entity(type, classFields),
          hideFlavortext: false,
        }),
      );
    const classMarkup = render("Class");
    const hybridMarkup = render("Hybrid Class");
    for (const markup of [classMarkup, hybridMarkup]) {
      expect(markup).toContain("Role &amp; Power Source");
      expect(markup).toContain("Starting Statistics");
      expect(markup).toContain("Proficiencies &amp; Training");
      expect(markup).toContain("Class Features &amp; Build");
      expect(markup).toContain(">Flavor<");
      expect(markup).toContain(">Other<");
      expect(markup.match(/<dt>Implements<\/dt>/g)).toHaveLength(1);
      expect(markup).toContain("Any weapon you wield");
      expect(markup).toContain("Holy symbols");
      expect(markup).toContain("Preserved fallback");
      expect(markup).toContain("Source: Player&#x27;s Handbook Test");
    }
    expect(isClassEntity(entity("Class", []))).toBe(true);
    expect(isClassEntity(entity("Hybrid Class", []))).toBe(true);
  });

  it("leaves non-class specifics in the standard shared details section", () => {
    const markup = renderToStaticMarkup(
      createElement(EntityCardBody, {
        entity: entity("Feat", [field("Benefit", "Gain a bonus.", 0)]),
        hideFlavortext: false,
      }),
    );
    expect(markup).toContain("<h5>Details</h5>");
    expect(markup).toContain("<dt>Benefit</dt>");
    expect(markup).not.toContain("Role &amp; Power Source");
  });
});
