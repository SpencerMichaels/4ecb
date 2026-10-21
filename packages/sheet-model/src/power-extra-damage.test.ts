import { describe, expect, it } from "vitest";

import type { ContentEntity } from "@4ecb/content-domain";
import type { EvaluatedCharacter, EvaluatedPower } from "@4ecb/rules-engine";

import { createSheetPowerCardFinder } from ".";

const strike: ContentEntity = {
  id: "STRIKE",
  name: "Synthetic strike",
  type: "Power",
  source: "Core",
  sources: [],
  attributes: [],
  categories: [],
  description: "",
  extensions: [],
  specifics: [
    {
      name: "Power Usage",
      value: "Encounter",
      extraAttributes: [],
      ordinal: 0,
    },
    {
      name: "Action Type",
      value: "No Action",
      extraAttributes: [],
      ordinal: 1,
    },
    {
      name: "Effect",
      value: "The target takes 1d10 extra damage.",
      extraAttributes: [],
      ordinal: 2,
    },
  ],
  rules: [],
  provenance: { sourceKey: "synthetic", sourceOrdinal: 0 },
};

const power = (extra?: EvaluatedPower["extraDamage"]): EvaluatedPower => ({
  definitionId: "STRIKE",
  name: "Synthetic strike",
  usage: "Encounter",
  actionType: "No Action",
  keywords: [],
  variants: [],
  recoveries: [],
  unsupported: [],
  ...(extra === undefined ? {} : { extraDamage: extra }),
});

const evaluation = (powers: readonly EvaluatedPower[]) =>
  ({
    level: 13,
    converged: true,
    iterations: 1,
    complete: true,
    legal: true,
    occurrences: [],
    activeDefinitionIds: [],
    activeDefinitions: [],
    choices: [],
    stats: {},
    textStrings: {},
    overlays: [],
    powers,
    suggestions: [],
    diagnostics: [],
  }) as unknown as EvaluatedCharacter;

describe("extra damage dice on power cards", () => {
  it("adds the summed dice as one card-only additional effect", () => {
    const evaluated = power({
      dice: "2d10",
      components: [
        { dice: "1d10", source: "Upgrade 1", provenanceId: "u:1" },
        { dice: "1d10", source: "Upgrade 2", provenanceId: "u:2" },
      ],
    });
    const card = createSheetPowerCardFinder(evaluation([evaluated]), [strike])(
      strike,
      evaluated,
    );
    expect(card.additionalEffects).toEqual([
      {
        text: "+2d10 extra damage.",
        source: "authoritative-evaluation",
        cardOnly: true,
      },
    ]);
    // The authored effect text stays as published.
    expect(card.fields.find(({ label }) => label === "Effect")?.value).toBe(
      "The target takes 1d10 extra damage.",
    );
  });

  it("adds nothing when no feature adds dice", () => {
    const evaluated = power();
    const card = createSheetPowerCardFinder(evaluation([evaluated]), [strike])(
      strike,
      evaluated,
    );
    expect(card.additionalEffects).toBeUndefined();
  });
});
