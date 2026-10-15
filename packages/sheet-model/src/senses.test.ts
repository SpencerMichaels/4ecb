import { describe, expect, it } from "vitest";
import type { ContentEntity } from "@4ecb/content-domain";
import { overviewSenses } from "./senses";

const race: ContentEntity = {
  id: "race:test",
  name: "Test ancestry",
  type: "Race",
  source: "Synthetic",
  sources: [],
  attributes: [],
  categories: [],
  rules: [],
  extensions: [],
  description: "",
  provenance: { sourceKey: "synthetic", sourceOrdinal: 0 },
  specifics: [
    { name: "Vision", value: "Low-light", ordinal: 0, extraAttributes: [] },
  ],
};
const selected = [{ id: race.id, name: race.name, type: race.type }];
describe("overview senses", () => {
  it("reads racial vision metadata and deduplicates typed Vision selections", () => {
    expect(overviewSenses(selected, [race], {})).toBe("Low-light vision");
    expect(
      overviewSenses(
        [...selected, { id: "vision:low", name: "Low-light", type: "Vision" }],
        [race],
        { Vision: "Low-light vision" },
      ),
    ).toBe("Low-light vision");
  });
  it("keeps enhanced vision instead of a redundant normal mode", () => {
    expect(
      overviewSenses(
        [{ id: "vision:dark", name: "Darkvision", type: "Vision" }],
        [],
        { Vision: "Normal" },
      ),
    ).toBe("Darkvision");
  });
  it("ignores unselected content and misleading names outside the Vision type", () => {
    expect(
      overviewSenses(
        [{ id: "feat:test", name: "Darkvision practice", type: "Feat" }],
        [race],
        {},
      ),
    ).toBe("");
    expect(overviewSenses([], [], {})).toBe("");
  });
  it("preserves direct providers' authored special-sense range and condition", () => {
    const provider = {
      ...race,
      id: "feature:sense",
      type: "Class Feature",
      specifics: [],
      description:
        "The earth calls. You gain tremorsense 4 while touching stone.",
      rules: [
        {
          name: "grant",
          attributes: [{ name: "name", value: "vision:tremor" }],
          children: [],
          text: "",
          ordinal: 0,
        },
      ],
    };
    expect(
      overviewSenses(
        [
          { id: provider.id, name: provider.name, type: provider.type },
          { id: "vision:tremor", name: "Tremorsense", type: "Vision" },
        ],
        [provider],
        {},
      ),
    ).toBe("You gain tremorsense 4 while touching stone.");
  });
  it("retains explicit special-sense ranges without inventing unknown ones", () => {
    expect(
      overviewSenses(
        [
          { id: "vision:telepathy", name: "Telepathy", type: "Vision" },
          { id: "vision:tremor", name: "Tremorsense", type: "Vision" },
        ],
        [],
        { Telepathy: "10" },
      ),
    ).toBe("Telepathy 10; Tremorsense");
  });
});
