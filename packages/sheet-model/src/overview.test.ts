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
  it("projects native surge bonuses over quarter HP and absent saves as zero", () => {
    const base = { ...snapshot, stats: { "Hit Points": "68" } };
    const m = buildSheetModel(base);
    expect(m.resources).toContainEqual({
      label: "Healing Surge Value",
      value: "17",
    });
    expect(m.overview?.saves).toBe("0");
    const bonus = buildSheetModel({
      ...base,
      stats: {
        "Hit Points": "71",
        "Healing Surge Value": "3",
        "Saving Throws": "2",
      },
    });
    expect(bonus.resources).toContainEqual({
      label: "Healing Surge Value",
      value: "20",
    });
    expect(bonus.overview?.saves).toBe("+2");
    expect(buildSheetModel({ ...base, stats: {} }).resources).toContainEqual({
      label: "Healing Surge Value",
      value: "—",
    });
  });
  it("excludes power-access/shared-use wrappers by their rules, not their names", () => {
    const wrapper = {
      ...feat,
      id: "feature:shared",
      name: "Shared Techniques",
      type: "Class Feature",
      description:
        "Once per encounter you can invoke special powers. You can learn other uses for this feature. Regardless of how many uses you know, you can use only one such ability per encounter. Each power works like your other powers.",
      specifics: [],
      rules: [
        {
          name: "grant",
          attributes: [
            { name: "type", value: "Power" },
            { name: "name", value: "power:one" },
          ],
          text: "",
          children: [],
          ordinal: 0,
        },
        {
          name: "select",
          attributes: [{ name: "type", value: "Power" }],
          text: "",
          children: [],
          ordinal: 1,
        },
      ],
    };
    const mixed = {
      ...wrapper,
      id: "feature:shared-benefit",
      name: "Techniques With Benefit",
      description:
        wrapper.description +
        " When you use one of these powers, you can shift one square.",
    };
    const rolled = {
      ...wrapper,
      id: "feature:rolled",
      name: "Calculated Benefit",
      description:
        wrapper.description + " You gain a +1 bonus to saving throws.",
      rules: [
        ...wrapper.rules,
        {
          name: "statadd",
          attributes: [
            { name: "name", value: "Saving Throws" },
            { name: "value", value: "+1" },
          ],
          text: "",
          children: [],
          ordinal: 2,
        },
      ],
    };
    const definitions = [wrapper, mixed, rolled];
    const m = buildSheetModel(
      {
        ...snapshot,
        selectedRules: definitions.map((e) => ({
          id: e.id,
          name: e.name,
          type: e.type,
        })),
      },
      definitions,
    );
    expect(m.overview?.features.find((f) => f.id === wrapper.id)).toMatchObject(
      { accessOnly: true, playReminder: false },
    );
    expect(m.overview?.reminders.map((r) => r.label)).not.toContain(
      wrapper.name,
    );
    expect(m.overview?.features.find((f) => f.id === mixed.id)).toMatchObject({
      accessOnly: false,
      playReminder: true,
    });
    expect(
      m.overview?.features.find((f) => f.id === rolled.id)?.accessOnly,
    ).toBe(false);
    expect(m.overview?.features).toHaveLength(3);
  });
  it("excludes grant/choice-only wrappers despite evocative flavor, retaining mixed benefits", () => {
    const wrapper = {
      ...feat,
      id: "feature:choice",
      type: "Class Feature",
      name: "First Choice",
      description:
        "When you raise your symbol, allies feel inspired. Benefit: Choose shining spark or smiting spark. You gain that power.",
      specifics: [
        {
          name: "Short Description",
          value: "Choose a power. You gain that power.",
          extraAttributes: [],
          ordinal: 0,
        },
      ],
      rules: [
        {
          name: "select",
          attributes: [{ name: "type", value: "Power" }],
          children: [],
          text: "",
          ordinal: 0,
        },
      ],
    };
    const mixed = {
      ...wrapper,
      id: "feature:mixed",
      name: "Choice With Benefit",
      description:
        "Benefit: You gain a power. When you are bloodied, an ally can shift.",
      specifics: [],
    };
    const m = buildSheetModel(
      {
        ...snapshot,
        selectedRules: [wrapper, mixed].map((e) => ({
          id: e.id,
          name: e.name,
          type: e.type,
        })),
      },
      [wrapper, mixed],
    );
    expect(
      m.overview?.features.find((f) => f.id === wrapper.id)?.playReminder,
    ).toBe(false);
    expect(m.overview?.reminders.map((r) => r.label)).toEqual([
      "Choice With Benefit",
    ]);
    expect(m.overview?.features).toHaveLength(2);
  });
  it("lists a selected feature once instead of repeating its bonus per affected power", () => {
    const base = buildSheetModel(snapshot, [feat]);
    const powers = [
      {
        kind: "power" as const,
        name: "First strike",
        fields: [],
        additionalEffects: [
          { source: "legacy-cache" as const, text: "+1 to an ally - Guard." },
        ],
      },
      {
        kind: "power" as const,
        name: "Second strike",
        fields: [],
        additionalEffects: [
          {
            source: "authoritative-evaluation" as const,
            provider: "Guard",
            provenanceId: feat.id,
            text: "+1 to an ally.",
          },
        ],
      },
    ];
    const m = withSheetOverview(
      { ...base, powers },
      {
        level: 8,
        stats: snapshot.stats,
        selections: snapshot.selectedRules,
        content: [feat],
        inventory: [],
      },
    );
    expect(m.overview?.reminders).toEqual([
      { label: feat.name, value: feat.description },
    ]);
    expect(m.powers).toEqual(powers);
  });
  it("deduplicates unattributed identical effects without merging distinct effects", () => {
    const base = buildSheetModel(snapshot, []);
    const powers = ["First", "Second"].map((name) => ({
      kind: "power" as const,
      name,
      fields: [],
      additionalEffects: [
        {
          source: "legacy-cache" as const,
          text: "Conditional bonus without a known provider.",
        },
      ],
    }));
    const m = withSheetOverview(
      { ...base, powers },
      { level: 8, stats: {}, selections: [], content: [], inventory: [] },
    );
    expect(
      m.overview?.reminders.filter(
        (r) => r.value === "Conditional bonus without a known provider.",
      ),
    ).toHaveLength(1);
  });
  it("omits passive grants and loadout bonuses from reminders, retaining actionable benefits", () => {
    const examples = [
      ["Weapon Training", "Gain proficiency with the test blade.", false],
      [
        "Skill Domain",
        "+1 to trained skill checks; associated powers can be used as basic attacks.",
        false,
      ],
      [
        "Light Defense",
        "+2 to AC while wearing cloth armor or no armor.",
        false,
      ],
      ["Improved Quarry", "Your extra damage dice increase to d8s.", false],
      [
        "Fast Hands",
        "Draw a weapon as part of the action when using it; +2 to initiative.",
        true,
      ],
      [
        "Hampering Strike",
        "Give up one extra damage die to slow the target.",
        true,
      ],
      [
        "Longer Steps",
        "Increase shifts from encounter powers by 2 squares.",
        true,
      ],
      [
        "Protect Allies",
        "While you use a shield, your allies gain +1 AC.",
        true,
      ],
    ] as const;
    const definitions = examples.map(([name, text], i) => ({
      ...feat,
      id: `feat:reminder:${i}`,
      name,
      description: text,
      specifics: [
        {
          name: "Short Description",
          value: text,
          extraAttributes: [],
          ordinal: 0,
        },
      ],
    }));
    const m = buildSheetModel(
      {
        ...snapshot,
        selectedRules: definitions.map((e) => ({
          id: e.id,
          name: e.name,
          type: "Feat",
        })),
      },
      definitions,
    );
    expect(m.overview?.features.map((f) => [f.name, f.playReminder])).toEqual(
      examples.map(([name, , expected]) => [name, expected]),
    );
    expect(m.overview?.features).toHaveLength(examples.length);
    expect(m.overview?.reminders.map((r) => r.label).sort()).toEqual(
      examples
        .filter(([, , expected]) => expected)
        .map(([name]) => name)
        .sort(),
    );
  });
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
  it("keeps missing training and full rules unknown while sparse saves default to zero", () => {
    const m = buildSheetModel({ ...snapshot, stats: { Athletics: "3" } }, []);
    expect(m.overview?.saves).toBe("0");
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
