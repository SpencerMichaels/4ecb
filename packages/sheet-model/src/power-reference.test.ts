import { describe, expect, it } from "vitest";
import type { ContentEntity } from "@4ecb/content-domain";
import { buildSheetModel } from "./index";
import { universalPowerDefinitionIds } from "./power-reference";

const entity = (id: string, type: string): ContentEntity => ({
  id,
  name: id,
  type,
  source: "Core",
  sources: [],
  attributes: [],
  categories: [],
  description: "",
  extensions: [],
  specifics: [],
  rules: [],
  provenance: { sourceKey: "synthetic", sourceOrdinal: 0 },
});
describe("universal power reference provenance", () => {
  it("projects an authored Channel Divinity field without inventing a keyword or relying on names", () => {
    const power = {
      ...entity("shared", "Power"),
      name: "Synthetic choice",
      specifics: [
        { name: "Keywords", value: "Divine", extraAttributes: [], ordinal: 0 },
        {
          name: "Channel Divinity",
          value: "Choose one shared power per encounter.",
          extraAttributes: [],
          ordinal: 1,
        },
      ],
    };
    const snapshot = {
      details: {},
      abilities: {},
      stats: {},
      selectedRules: [],
      textStrings: {},
      loot: [],
      levelCount: 1,
      source: "legacy-cache" as const,
      powers: [
        {
          id: "shared",
          name: "Synthetic choice",
          usage: "Encounter",
          actionType: "Minor Action",
          weapons: [],
        },
      ],
    };
    const card = buildSheetModel(snapshot, [power]).powers[0]!;
    expect(card.sharedUsage).toBe("Channel Divinity");
    expect(card.keywords).toBe("Divine");
    expect(buildSheetModel(snapshot).powers[0]?.sharedUsage).toBeUndefined();
  });
  it("follows unconditional generic starting grants, not publication or power names", () => {
    const common = entity("common", "Power");
    const personal = entity("personal", "Power");
    const later = entity("later", "Power");
    const content = [
      common,
      personal,
      later,
      {
        ...entity("starting", "Level1Rules"),
        name: "Level1Rules",
        rules: [
          {
            name: "grant",
            attributes: [{ name: "name", value: "common" }],
            children: [],
            text: "",
            ordinal: 0,
          },
          {
            name: "grant",
            attributes: [
              { name: "name", value: "personal" },
              { name: "requires", value: "Some class" },
            ],
            children: [],
            text: "",
            ordinal: 1,
          },
          {
            name: "grant",
            attributes: [
              { name: "name", value: "later" },
              { name: "Level", value: "2" },
            ],
            children: [],
            text: "",
            ordinal: 2,
          },
        ],
      },
    ];
    expect([...universalPowerDefinitionIds(content)]).toEqual(["common"]);
    const snapshot = {
      details: {},
      abilities: {},
      stats: {},
      selectedRules: [],
      textStrings: {},
      loot: [],
      levelCount: 1,
      source: "legacy-cache" as const,
      powers: [common, personal].map((power) => ({
        id: power.id,
        name: power.name,
        weapons: [],
      })),
    };
    const model = buildSheetModel(snapshot, content);
    expect(model.powers.map((power) => power.universal)).toEqual([
      true,
      undefined,
    ]);
    expect(
      buildSheetModel(snapshot).powers.every(
        (power) => power.universal === undefined,
      ),
    ).toBe(true);
  });
});
