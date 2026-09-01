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
});
