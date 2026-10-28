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

  it("adds +1 on every second half-point statadd, as native", () => {
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
    ).toEqual([3, 5]);

    // Native CalculateStatValue (~36246): the +1 is a non-penalty add under
    // the second statadd's type, whatever the signs.
    const signs = new StatAccumulator();
    const half = (id: string, stat: string, value: string, type?: string) =>
      signs.add({
        id,
        stat,
        value,
        providerId: id,
        providerName: id,
        halfPoint: true,
        ...(type === undefined ? {} : { bonusType: type }),
      });
    half("a", "Vampire Surge Adjustment", "-3");
    half("b", "Vampire Surge Adjustment", "-3");
    half("c", "Mixed", "+4");
    half("d", "Mixed", "-3");
    half("e", "Typed", "+2", "Feat");
    half("f", "Typed", "+2", "Feat");
    expect(signs.evaluate("Vampire Surge Adjustment").value).toBe(-5);
    expect(signs.evaluate("Mixed").value).toBe(2);
    expect(signs.evaluate("Typed").value).toBe(2);
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

  it("adds zero/non-zero-gated statadds after the stat's sum, untyped (native CalculateStatValue)", () => {
    // Venom Handler and Serpentine Armor: resist poison 5 only while no
    // other poison resistance; both gated adds count (native sums them).
    const none = new StatAccumulator();
    none.add({
      id: "venom",
      stat: "resist:poison",
      value: "+5",
      bonusType: "resist",
      zeroOnly: true,
      providerId: "venom",
      providerName: "Venom Handler",
    });
    none.add({
      id: "armor",
      stat: "resist:poison",
      value: "+5",
      bonusType: "resist",
      zeroOnly: true,
      providerId: "armor",
      providerName: "Serpentine Armor +1",
    });
    expect(none.evaluate("resist:poison").value).toBe(10);
    // A typed resistance listed after the gated add still closes the gate:
    // the decision reads the whole sum, typed parts included.
    const typed = new StatAccumulator();
    typed.add({
      id: "venom",
      stat: "resist:poison",
      value: "+5",
      bonusType: "resist",
      zeroOnly: true,
      providerId: "venom",
      providerName: "Venom Handler",
    });
    add(typed, "race", "resist:poison", "+3", "Racial");
    const evaluated = typed.evaluate("resist:poison");
    expect(evaluated.value).toBe(3);
    expect(
      evaluated.contributions.find((entry) => entry.id === "venom"),
    ).toMatchObject({ applied: false, reason: "zero-gate" });
    // Wand of Frost: +2 resist cold on top of a typed resistance, uncapped
    // by the shared "resist" type; nothing without one.
    const wand = new StatAccumulator();
    add(wand, "genasi", "resist:cold", "+5", "resist");
    wand.add({
      id: "wand",
      stat: "resist:cold",
      value: "+2",
      bonusType: "resist",
      nonZeroOnly: true,
      providerId: "wand",
      providerName: "Wand of Frost +1",
    });
    expect(wand.evaluate("resist:cold").value).toBe(7);
    const bare = new StatAccumulator();
    bare.add({
      id: "wand",
      stat: "resist:cold",
      value: "+2",
      bonusType: "resist",
      nonZeroOnly: true,
      providerId: "wand",
      providerName: "Wand of Frost +1",
    });
    expect(bare.evaluate("resist:cold").value).toBe(0);
  });

  it("applies a statmin statadd only while the named stat meets it (native StatAddApplies)", () => {
    // Superior Defense: +1 AC at Dexterity 13 and another at Dexterity 15.
    const superior = (dexterity: number) => {
      const stats = new StatAccumulator();
      add(stats, "base", "Dexterity", String(dexterity));
      add(stats, "ac", "AC", "10");
      for (const minimum of ["Dexterity 13", "Dexterity 15"])
        stats.add({
          id: minimum,
          stat: "AC",
          value: "+1",
          statMinimum: minimum,
          providerId: "superior",
          providerName: "Superior Defense",
        });
      return stats.evaluate("AC");
    };
    expect(superior(12).value).toBe(10);
    expect(superior(13).value).toBe(11);
    expect(superior(15).value).toBe(12);
    expect(
      superior(14).contributions.find((entry) => entry.id === "Dexterity 15"),
    ).toMatchObject({ applied: false, reason: "statmin" });
  });

  it("reads MINONEMOD and HALFMOD links (native ParseStatAdd)", () => {
    const stats = new StatAccumulator();
    add(stats, "con", "Constitution", "8");
    add(stats, "cha", "Charisma", "15");
    // Storm Adept: lightning damage + Constitution modifier, at least 1.
    add(
      stats,
      "storm",
      "lightning:damage",
      "+MINONEMOD(Constitution)",
      "Storm Adept",
    );
    // Shared Prescience: initiative + half the Charisma modifier.
    add(
      stats,
      "prescience",
      "Initiative Misc",
      "+HALFMOD(Charisma)",
      "Shared Prescience",
    );
    expect(stats.evaluate("lightning:damage").value).toBe(1);
    expect(stats.evaluate("Initiative Misc").value).toBe(1);
  });

  it("drops a linked stat's gated statadds (native CalculateStatValue locals)", () => {
    const stats = new StatAccumulator();
    stats.add({
      id: "gated",
      stat: "Linked Resist",
      value: "+5",
      zeroOnly: true,
      providerId: "gated",
      providerName: "Gated",
    });
    add(stats, "link", "resist:fire", "+Linked Resist");
    // On its own the linked stat adds its zero-gated statadd.
    expect(stats.evaluate("Linked Resist").value).toBe(5);
    // Through a link the gated statadd is dropped.
    expect(stats.evaluate("resist:fire").value).toBe(0);
  });

  it("zeroes the stat and stops at an untyped literal 0 (native ~36222)", () => {
    // Armor Specialization (Chainmail): Armor Penalty value=0 while in chain.
    const stats = new StatAccumulator();
    add(stats, "chain", "Armor Penalty", "-1");
    add(stats, "specialization", "Armor Penalty", "0");
    add(stats, "later", "Armor Penalty", "-2");
    const evaluated = stats.evaluate("Armor Penalty");
    expect(evaluated.value).toBe(0);
    expect(
      evaluated.contributions.map(({ id, applied }) => [id, applied]),
    ).toEqual([
      ["chain", false],
      ["specialization", true],
      ["later", false],
    ]);
  });

  it("gives a blank (0) ability base score 0 and modifier 0 (native GetAbilityMod)", () => {
    // An imported incomplete save: the base is an untyped literal 0, so the
    // racial +2 after it is skipped and ABILITYMOD reads 0, not -5.
    const stats = new StatAccumulator();
    add(stats, "base", "Strength", "0");
    add(stats, "race", "Strength", "+2");
    add(stats, "half", "Athletics", "+HALF-LEVEL");
    add(stats, "mod", "Athletics", "+ABILITYMOD(Strength)", "Ability");
    add(stats, "level", "HALF-LEVEL", "+1");
    expect(stats.evaluate("Strength").value).toBe(0);
    expect(stats.evaluate("Athletics").value).toBe(1);
  });
});
