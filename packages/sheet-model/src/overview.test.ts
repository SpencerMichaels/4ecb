import { describe, expect, it } from "vitest";
import type { ContentEntity } from "@4ecb/content-domain";
import { buildSheetModel } from "./index";
import { withSheetOverview } from "./overview";

const snapshot = {
  details: { name: "Overview hero", Level: "8" },
  abilities: { Strength: 19 },
  stats: {
    Strength: "19",
    "Strength modifier": "4",
    Athletics: "13",
    "Athletics Trained": "5",
    "Hit Points": "73",
    "Saving Throws": "1",
  },
  selectedRules: [{ id: "feat:guard", name: "Guard", type: "Feat" }],
  levelCount: 8,
  source: "legacy-cache" as const,
  textStrings: {},
  loot: [],
  powers: [],
};
const feat: ContentEntity = {
  id: "feat:guard",
  name: "Guard",
  type: "Feat",
  source: "Synthetic source",
  sources: [],
  attributes: [],
  categories: [],
  rules: [],
  extensions: [],
  provenance: { sourceKey: "synthetic", sourceOrdinal: 0 },
  description:
    "When you defend, an ally gains a bonus. This full rule must remain available.",
  specifics: [
    {
      name: "Short Description",
      value: "An ally gains a conditional bonus.",
      extraAttributes: [],
      ordinal: 0,
    },
  ],
};
describe("printed overview data", () => {
  it("retains full selected rules separately from authored short descriptions", () => {
    const m = buildSheetModel(snapshot, [feat]);
    expect(m.overview?.features[0]).toMatchObject({
      id: feat.id,
      description: feat.description,
      summary: feat.specifics[0]!.value,
      fullTextAvailable: true,
      source: feat.source,
    });
    expect(m.overview?.abilities[0]).toEqual({
      name: "Strength",
      score: "19",
      modifier: "+4",
      check: "+8",
    });
    expect(
      m.overview?.skills.find((s) => s.name === "Athletics"),
    ).toMatchObject({ trained: true, bonus: "+13", ability: "STR" });
    expect(m.overview).toMatchObject({ bloodied: "36", saves: "+1" });
    expect(m.overview?.reminders).toContainEqual({
      label: "Guard",
      value: feat.specifics[0]!.value,
    });
    expect(snapshot.stats["Hit Points"]).toBe("73");
  });
  it("does not invent missing training, saves, or full rules", () => {
    const m = buildSheetModel({ ...snapshot, stats: { Athletics: "3" } }, []);
    expect(m.overview?.saves).toBe("—");
    expect(m.overview?.bloodied).toBe("—");
    expect(m.overview?.skills[0]?.trained).toBeUndefined();
    expect(m.overview?.features[0]?.fullTextAvailable).toBe(false);
  });
  it("preserves inventory slots and hidden-card equipment, excluding only zero quantity", () => {
    const inventory = [
      {
        name: "Slotted blade",
        quantity: 2,
        equipped: 1,
        slots: ["main-hand"],
        fields: [],
      },
      { name: "Carried rope", quantity: 1, equipped: 0, slots: [], fields: [] },
      { name: "Spent", quantity: 0, equipped: 0, slots: [], fields: [] },
    ];
    const m = withSheetOverview(buildSheetModel(snapshot), {
      level: 8,
      stats: { "Saving Throws": "Conditional" },
      selections: [],
      content: [],
      inventory,
    });
    expect(m.overview?.inventory).toEqual(inventory.slice(0, 2));
    expect(m.overview?.saves).toBe("Conditional");
  });
  it("does not turn background storytelling into combat reminders", () => {
    const theme = { ...feat, id: "theme:story", type: "Theme", name: "Story" };
    const m = buildSheetModel(
      {
        ...snapshot,
        selectedRules: [{ id: theme.id, name: theme.name, type: theme.type }],
      },
      [theme],
    );
    expect(m.overview?.features).toHaveLength(1);
    expect(m.overview?.reminders).toHaveLength(0);
  });
});
