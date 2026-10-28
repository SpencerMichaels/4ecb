import { describe, expect, it } from "vitest";

import { StatAccumulator } from "./stats";

function add(
  stats: StatAccumulator,
  id: string,
  stat: string,
  value: string,
  bonusType?: string,
) {
  stats.add({
    id,
    stat,
    value,
    providerId: id,
    providerName: id,
    ...(bonusType === undefined ? {} : { bonusType }),
  });
}

describe("stat evaluation", () => {
  it("supports aliases, linked stats, ability modifiers, and correct negative flooring", () => {
    const stats = new StatAccumulator();
    add(stats, "base", "Strength", "9");
    add(stats, "modifier", "Strength modifier", "+ABILITYMOD(Strength)");
    add(stats, "attack", "Attack", "+Strength modifier");
    add(stats, "passive", "Passive Attack", "Attack");
    stats.alias("Attack", "To Hit");
    expect(stats.evaluate("Strength modifier").value).toBe(-1);
    expect(stats.evaluate("To Hit").value).toBe(-1);
    expect(stats.evaluate("Passive Attack").value).toBe(-1);
  });

  it("stacks untyped values and selects one typed extreme", () => {
    const stats = new StatAccumulator();
    add(stats, "base", "AC", "10");
    add(stats, "feat2", "AC", "2", "Feat");
    add(stats, "feat1", "AC", "1", "Feat");
    add(stats, "penalty1", "AC", "-1", "Feat");
    add(stats, "penalty3", "AC", "-3", "Feat");
    expect(stats.evaluate("AC").value).toBe(12);
    expect(
      stats
        .evaluate("AC")
        .contributions.filter((entry) => entry.reason === "typed-stacking"),
    ).toHaveLength(3);
    const penalties = new StatAccumulator();
    add(penalties, "one", "Check", "-1", "Penalty");
    add(penalties, "three", "Check", "-3", "Penalty");
    expect(penalties.evaluate("Check").value).toBe(-3);
  });

  it("preserves signed half-point contributions for hybrid totals", () => {
    const stats = new StatAccumulator();
    stats.add({
      id: "hybrid-warlord",
      stat: "Healing Surges",
      value: "+3",
      providerId: "hybrid-warlord",
      providerName: "Synthetic Hybrid Warlord",
      halfPoint: true,
    });
    stats.add({
      id: "hybrid-fighter",
      stat: "Healing Surges",
      value: "+4",
      providerId: "hybrid-fighter",
      providerName: "Synthetic Hybrid Fighter",
      halfPoint: true,
    });
    stats.add({
      id: "negative-adjustment",
      stat: "Adjustment",
      value: "-3",
      providerId: "negative-adjustment",
      providerName: "Synthetic Negative Adjustment",
      halfPoint: true,
    });

    expect(stats.evaluate("Healing Surges").value).toBe(8);
    expect(stats.evaluate("Adjustment").value).toBe(-3);
    expect(
      stats
        .evaluate("Healing Surges")
        .contributions.map((entry) => entry.numericValue),
    ).toEqual([3.5, 4.5]);
  });

  it("retains but suppresses conditional and unmet equipment contributions", () => {
    const stats = new StatAccumulator({
      items: [
        {
          id: "armor",
          name: "Hide",
          type: "Armor",
          categories: ["Light"],
          properties: [],
          slot: "Body",
          quantity: 1,
        },
      ],
    });
    stats.add({
      id: "armor",
      stat: "AC",
      value: "2",
      providerId: "armor",
      providerName: "Armor",
      wearing: "armor:light",
    });
    stats.add({
      id: "condition",
      stat: "AC",
      value: "3",
      providerId: "condition",
      providerName: "Condition",
      condition: "against opportunity attacks",
    });
    stats.add({
      id: "heavy",
      stat: "AC",
      value: "4",
      providerId: "heavy",
      providerName: "Heavy",
      wearing: "armor:heavy",
    });
    const result = stats.evaluate("AC");
    expect(result.value).toBe(2);
    expect(result.contributions.map((entry) => entry.reason)).toContain(
      "conditional",
    );
    expect(result.contributions.map((entry) => entry.reason)).toContain(
      "equipment",
    );
  });

  it("evaluates a statlink against the parent's type caps (native CalculateStatAddValue)", () => {
    const stats = new StatAccumulator();
    add(stats, "base", "AC", "10");
    add(stats, "ward-1", "Ward", "+1", "Ward");
    add(stats, "ward-3", "Ward", "+3", "Ward");
    add(stats, "ward-flat", "Ward", "+1");
    // Two untyped links: the second link's typed piece finds AC's "Ward"
    // cap already at 3; its untyped piece still adds.
    add(stats, "light", "AC", "+Ward");
    add(stats, "heavy", "AC", "+Ward");
    const ac = stats.evaluate("AC");
    expect(ac.value).toBe(10 + 3 + 1 + 1);
    expect(
      ac.contributions.map((entry) => [
        entry.id,
        entry.numericValue,
        entry.applied,
      ]),
    ).toEqual([
      ["base", 10, true],
      ["light", 4, true],
      ["heavy", 1, true],
    ]);
    // The linked stat on its own keeps its own caps.
    expect(stats.evaluate("Ward").value).toBe(4);
  });

  it("reports a link that its parent's caps absorb as typed stacking", () => {
    const stats = new StatAccumulator();
    add(stats, "ward", "Ward", "+3", "Ward");
    add(stats, "light", "AC", "+Ward");
    add(stats, "heavy", "AC", "+Ward");
    const ac = stats.evaluate("AC");
    expect(ac.value).toBe(3);
    expect(ac.contributions[1]).toMatchObject({
      id: "heavy",
      numericValue: 0,
      applied: false,
      reason: "typed-stacking",
    });
  });

  it("does not stack a stat's typed bonus with the same type through a link", () => {
    const stats = new StatAccumulator();
    add(stats, "misc-feat", "Skill Misc", "+2", "Feat");
    add(stats, "misc-item", "Skill Misc", "+1", "Item");
    add(stats, "own-feat", "Skill", "+1", "Feat");
    add(stats, "misc", "Skill", "+Skill Misc");
    add(stats, "own-feat-3", "Skill", "+3", "Feat");
    const skill = stats.evaluate("Skill");
    expect(skill.value).toBe(3 + 1);
    // Applied contributions still sum to the total: the link is credited
    // only with the Item bonus once the later +3 Feat takes the cap.
    expect(
      skill.contributions
        .filter((entry) => entry.applied)
        .reduce((sum, entry) => sum + (entry.numericValue ?? 0), 0),
    ).toBe(4);
    expect(
      skill.contributions.map((entry) => [entry.id, entry.applied]),
    ).toEqual([
      ["own-feat", false],
      ["misc", true],
      ["own-feat-3", true],
    ]);
    expect(stats.evaluate("Skill Misc").value).toBe(3);
  });

  it("adds a typed link's result under its own type after the linked caps", () => {
    // Native: the linked stat records its "Ward" cap first, so a link typed
    // "Ward" finds the cap already at its result and adds nothing.
    const stats = new StatAccumulator();
    add(stats, "ward", "Ward", "+3", "Ward");
    add(stats, "link", "AC", "+Ward", "Ward");
    expect(stats.evaluate("AC").value).toBe(0);
    // A link typed differently from its pieces adds its result once.
    const shields = new StatAccumulator();
    add(shields, "piece", "Shield Bonus", "+2", "Shield Piece");
    add(shields, "first", "Reflex", "+Shield Bonus", "Shield");
    add(shields, "second", "Reflex", "+Shield Bonus", "Shield");
    expect(shields.evaluate("Reflex").value).toBe(2);
  });

  it("zeroes a bonus type for good with a typed literal 0 (native SetStatToZero)", () => {
    const stats = new StatAccumulator();
    add(stats, "penalty", "Skill", "-2", "Armor Penalty");
    add(stats, "training", "Skill", "0", "Armor Penalty");
    add(stats, "later", "Skill", "-1", "Armor Penalty");
    add(stats, "flat", "Skill", "+4");
    expect(stats.evaluate("Skill").value).toBe(4);
  });
});
