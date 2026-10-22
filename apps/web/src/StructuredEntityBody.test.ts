import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ContentEntity } from "@4ecb/content-domain";

import {
  StructuredEntityBody,
  structuredEntityKind,
} from "./StructuredEntityBody";

function entity(
  id: string,
  name: string,
  type: string,
  specifics: Readonly<Record<string, string>>,
  description = "",
): ContentEntity {
  return {
    id,
    name,
    type,
    source: "test",
    sources: ["test"],
    attributes: [],
    categories: [],
    specifics: Object.entries(specifics).map(([fieldName, value], ordinal) => ({
      name: fieldName,
      value,
      extraAttributes: [],
      ordinal,
    })),
    rules: [],
    description,
    extensions: [],
    provenance: { sourceKey: "test", sourceOrdinal: 0 },
  };
}

function render(subject: ContentEntity, others: readonly ContentEntity[] = []) {
  const references = new Map(
    [subject, ...others].flatMap((item) => [
      [item.id.toLocaleLowerCase(), item] as const,
      [item.name.toLocaleLowerCase(), item] as const,
    ]),
  );
  const kind = structuredEntityKind(subject);
  if (kind === undefined) throw new Error("not a structured entity");
  return renderToStaticMarkup(
    createElement(StructuredEntityBody, {
      entity: subject,
      kind,
      references,
      hideFlavortext: false,
    }),
  );
}

describe("structured race, class and background cards", () => {
  it("leads a race with its stat grid and traits, then its lore", () => {
    const trait = entity(
      "TRAIT_STOMACH",
      "Iron Stomach",
      "Racial Trait",
      {},
      "+5 to saving throws against poison.",
    );
    const markup = render(
      entity(
        "RACE_STOUT",
        "Stoutfolk",
        "Race",
        {
          Size: "Medium",
          Speed: "5 squares",
          "Ability Scores": "+2 Constitution, +2 Strength or +2 Wisdom",
          "Physical Qualities": "Broad and sturdy.",
          "Racial Traits": "TRAIT_STOMACH",
          "Short Description": "Tough mountain folk.",
          "Odd Field": "Kept somewhere.",
        },
        "A long lore description.",
      ),
      [trait],
    );

    expect(markup).toContain("Tough mountain folk.");
    expect(markup).toContain("<dt>Speed</dt><dd>5 squares</dd>");
    expect(markup).toContain("Iron Stomach");
    expect(markup).toContain("+5 to saving throws against poison.");
    expect(markup).not.toContain("TRAIT_STOMACH");
    // Rules before lore; unknown fields are kept under "More".
    expect(markup.indexOf("Iron Stomach")).toBeLessThan(
      markup.indexOf("A long lore description."),
    );
    expect(markup).toContain("Physical qualities");
    expect(markup).toContain("Kept somewhere.");
    expect(markup).not.toContain("aria-expanded");
  });

  it("summarizes a class and lists its own class features", () => {
    const classEntity = entity("CLASS_WARDEN_TEST", "Shieldbearer", "Class", {
      Role: "Defender. You protect your allies.",
      "Power Source": "Martial. Training, not magic.",
      "Key Abilities": "Strength, Constitution",
      "Hit Points at 1st Level": "15 + Constitution score",
      "Short Description": "You stand firm.",
      _PARSED_CLASS_FEATURE: "Guard Stance",
    });
    const ownFeature = entity(
      "FEATURE_OWN",
      "Guard Stance",
      "Class Feature",
      { Class: "CLASS_WARDEN_TEST" },
      "Mark adjacent enemies.",
    );
    const otherFeature = entity(
      "FEATURE_OTHER",
      "Guard Stance",
      "Class Feature",
      { Class: "CLASS_OTHER" },
      "Someone else's stance.",
    );
    const markup = render(classEntity, [otherFeature, ownFeature]);

    expect(markup).toContain(
      `<p class="entity-card-lede"><strong class="entity-card-summary">Martial Defender.</strong> You stand firm.</p>`,
    );
    expect(markup).toContain(
      "<dt>Key abilities</dt><dd>Strength, Constitution</dd>",
    );
    expect(markup).toContain("<dt>HP at 1st</dt>");
    expect(markup).toContain("Mark adjacent enemies.");
    expect(markup).not.toContain("Someone else&#x27;s stance.");
  });

  it("puts a background's benefit up front with its campaign", () => {
    const markup = render(
      entity("BACKGROUND_CITY", "Harbor City", "Background", {
        type: "Campaign",
        Campaign: "Test Realms",
        Benefit: "You gain a +2 bonus to Diplomacy checks.",
        "Common Knowledge": "A busy port.",
      }),
    );

    expect(markup).toContain("Test Realms · Campaign");
    expect(markup).toContain('class="entity-benefit"');
    expect(markup.indexOf("+2 bonus to Diplomacy")).toBeLessThan(
      markup.indexOf("A busy port."),
    );
  });

  it("applies only to races, classes and backgrounds", () => {
    expect(
      structuredEntityKind(entity("FEAT", "Toughness", "Feat", {})),
    ).toBeUndefined();
    expect(
      structuredEntityKind(
        entity("HYBRID", "Hybrid Fighter", "Hybrid Class", {}),
      ),
    ).toBe("class");
  });
});
