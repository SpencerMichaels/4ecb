import { describe, expect, it } from "vitest";

import {
  NATIVE_WEAPON_BONUSES,
  authoredAttackLine,
  hitLineAt,
  parseAttackField,
  parseHitField,
  parsePowerFieldBonuses,
  parseRecoveries,
  powerAttackSlots,
  readPowerTextStore,
  POWER_TEXT_FIELD,
  POWER_TEXT_VERSION,
} from "./index";

// Synthetic lines spelled the way the real Power records spell them.
describe("power attack lines", () => {
  it("reads the defense, the named abilities and the first line's bonus", () => {
    const field = parseAttackField("Strength + 2 vs. AC");
    expect(field.isAttack).toBe(true);
    expect(field.defenses).toEqual(["AC"]);
    expect(authoredAttackLine(field)).toEqual({
      defense: "AC",
      abilities: ["Strength"],
      bonus: { base: 2 },
    });
    // The authored line is `other`'s line, so it is not stored twice.
    expect(field.raw).toBeUndefined();
  });

  it("reads a penalty after the stat word with '-' or '–' (native CalcStatVsDefense)", () => {
    expect(
      authoredAttackLine(parseAttackField("Strength -2 vs. AC"))?.bonus,
    ).toEqual({ base: -2 });
    expect(
      authoredAttackLine(parseAttackField("Strength –2 vs. AC"))?.bonus,
    ).toEqual({ base: -2 });
    expect(
      authoredAttackLine(parseAttackField("Dexterity – 2 vs. AC"))?.bonus,
    ).toEqual({ base: -2 });
    expect(
      authoredAttackLine(parseAttackField("Wisdom - 1 vs. AC"))?.bonus,
    ).toEqual({ base: -1 });
  });

  it("keeps a thrown-weapon alternative and a dual power's two lines", () => {
    const thrown = parseAttackField(
      "Strength (thrown weapon) or Dexterity vs. AC",
    );
    expect(thrown.thrown).toEqual({
      line: { defense: "AC", abilities: ["Strength"], bonus: {} },
    });
    expect(thrown.other).toEqual({
      line: { defense: "AC", abilities: ["Dexterity"], bonus: {} },
    });
    expect(authoredAttackLine(thrown).abilities).toEqual([
      "Strength",
      "Dexterity",
    ]);
    const dual = parseAttackField(
      "Strength vs. AC (melee; main weapon) or Dexterity vs. AC (ranged)",
    );
    expect("alternatives" in dual.other && dual.other.alternatives).toEqual([
      { defense: "AC", abilities: ["Strength"], bonus: {} },
      { defense: "AC", abilities: ["Dexterity"], bonus: {} },
    ]);
    expect(dual.mainWeapon).toBe(true);
  });

  it("reads special, beast, summoned and increase lines", () => {
    expect(
      authoredAttackLine(parseAttackField("Highest Mental Ability vs. Will"))
        .special,
    ).toBe("highest-mental");
    expect(
      authoredAttackLine(parseAttackField("Beast's attack bonus + 2 vs. AC"))
        .beastBonus,
    ).toBe(2);
    expect(
      authoredAttackLine(parseAttackField("Your level + 5 vs. Reflex"))
        .levelAttack,
    ).toEqual({ bonus: 5, defense: "Reflex" });
    expect(
      authoredAttackLine(
        parseAttackField(
          "Dexterity + 2 vs. Reflex\nIncrease to +4 bonus at 11th level, and to +6 bonus at 21st level",
        ),
      ).bonus,
    ).toEqual({
      base: 2,
      tier: { paragon: 4, epic: 6 },
      steps: [{ level: 11, bonus: 4 }],
    });
    const hawk = parseAttackField(
      "Dexterity vs. AC. Gain a power bonus to this attack equal to your Wisdom modifier.",
    );
    expect(hawk.wisdomPowerBonus).toBe(true);
    expect("line" in hawk.other && hawk.other.line.abilities).toEqual([
      "Dexterity",
    ]);
  });

  it("finds each attack slot's ordinal from its field name", () => {
    expect(
      powerAttackSlots(
        ["Attack", "Hit", "Secondary Target", "Secondary Attack", "Hit"].map(
          (name, ordinal) => ({ name, ordinal }),
        ),
      ),
    ).toEqual([
      [0, "attack", 1],
      [1, "hit", 1],
      [2, "target", 2],
      [3, "attack", 2],
      [4, "hit", 2],
    ]);
  });
});

describe("power hit lines", () => {
  it("steps through Level lines and increase sentences by level", () => {
    const field = parseHitField(
      "1[W] + Strength modifier damage.\nLevel 21: 2[W] + Strength modifier damage.",
    );
    expect(field.steps.map((step) => step.from)).toEqual([undefined, 21]);
    expect(hitLineAt(field, 20).other.clauses[0].weaponTerms).toEqual([
      { count: 1 },
    ]);
    expect(hitLineAt(field, 21).other.clauses[0].weaponTerms).toEqual([
      { count: 2 },
    ]);
    const increase = parseHitField(
      "1d8 + Wisdom modifier radiant damage. Increase damage to 2d8 + Wisdom modifier at 11th level and 3d8 + Wisdom modifier at 21st level.",
    );
    expect(
      [1, 11, 21].map(
        (level) => hitLineAt(increase, level).other.clauses[0].fixedDice,
      ),
    ).toEqual(["1d8", "2d8", "3d8"]);
  });

  it("reads the '+ NdM' terms chained after the weapon dice (native CalcDamage)", () => {
    const added = (text: string) =>
      parseHitField(text).steps[0]!.line.other.clauses[0]?.weaponAddedDice;
    expect(added("1[W] + 1d8 + Wisdom modifier damage, and")).toEqual(["1d8"]);
    expect(added("2[W] + 2d6 + Strength modifier damage.")).toEqual(["2d6"]);
    expect(added("4[W] + 3d8 + Strength modifier force damage.")).toEqual([
      "3d8",
    ]);
    // Outside the chain: after "damage", after "plus", after "or".
    expect(
      added(
        "1[W] + Strength modifier damage + 1d8 lightning damage, and you gain",
      ),
    ).toBeUndefined();
    expect(
      added("1[W] + Wisdom modifier damage plus 1d10 thunder damage."),
    ).toBeUndefined();
    expect(
      added("1[W] (weapon attack) or +1d8 (not weapon attack) damage"),
    ).toBeUndefined();
  });

  it("reads a damage expression's terms", () => {
    const clause = parseHitField(
      "2[W] + 1[W] (off-hand weapon) + twice your Strength modifier + 4 fire damage.",
    ).steps[0]!.line.other.clauses[0];
    expect(clause).toMatchObject({
      weaponTerms: [{ count: 2 }, { count: 1, offhand: true }],
      modifierAbilities: ["Strength"],
      listedAbilities: ["Strength"],
      twice: ["Strength"],
      powerDamageBonus: 4,
      damageType: "fire",
    });
    const flat = parseHitField("10 damage, and ongoing 5 damage (save ends).")
      .steps[0]!.line.other;
    expect(flat.ongoing).toBe(true);
    expect(flat.clauses[0].flatBase).toBe(10);
    const beast = parseHitField("1[B] + 2 + beast's Strength modifier damage.")
      .steps[0]!.line;
    expect(beast.beastHit).toBe(true);
    expect(beast.other.clauses[0].beast).toEqual({
      beastDice: 1,
      beastAbilities: ["Strength"],
      flatBonus: 2,
    });
  });

  it("splits a melee-or-ranged hit and matches native special lines", () => {
    const split = parseHitField(
      "1[W] + Strength modifier damage (melee) or 1[W] + Dexterity modifier damage (ranged).",
    ).steps[0]!.line.other;
    expect(split.clauses.map((clause) => clause.modifierAbilities)).toEqual([
      ["Strength"],
      ["Dexterity"],
    ]);
    expect(
      parseHitField("The target takes ongoing 10 radiant damage (save ends).")
        .steps[0]!.line.other.special,
    ).toBe("ongoing-10");
  });

  it("finds healing and temporary hit points", () => {
    expect(
      parseRecoveries(
        "You can spend a healing surge. Each ally in the burst gains 5 temporary hit points.",
      ),
    ).toEqual([
      { kind: "healing-surge", expression: "You can spend a healing surge." },
      {
        kind: "temporary-hit-points",
        expression: "Each ally in the burst gains 5 temporary hit points.",
      },
    ]);
  });
});

describe("power field riders", () => {
  it("matches the native WeaponBonuses, CalcBeast and CalcBonuses texts", () => {
    expect(
      parsePowerFieldBonuses([
        {
          name: "Weapon",
          value:
            "If you're wielding an axe, a hammer, or a mace, the attack deals extra damage equal to your Constitution modifier.",
        },
        {
          name: "Brutal Scoundrel",
          value:
            "The attack deals extra damage equal to your Strength modifier.",
        },
        {
          name: "Hit",
          value:
            "The attack deals extra damage equal to your Strength modifier.",
        },
        { name: "Weapon", value: "Not a native line." },
      ]),
    ).toEqual({
      weapon: [
        {
          entry: 2,
          label: " for using an axe, a hammer, or a mace",
          groups: "axe,hammer,mace",
          ability: "Constitution",
        },
      ],
      riders: [{ field: "Brutal Scoundrel", ability: "Strength" }],
    });
  });
});

describe("the stored field", () => {
  it("reads only its own version", () => {
    const stored = (value: unknown) => [
      { name: POWER_TEXT_FIELD, value: JSON.stringify(value) },
    ];
    expect(
      readPowerTextStore(stored({ version: POWER_TEXT_VERSION, texts: {} })),
    ).toEqual({ version: POWER_TEXT_VERSION, texts: {} });
    expect(
      readPowerTextStore(
        stored({ version: POWER_TEXT_VERSION + 1, texts: {} }),
      ),
    ).toBeUndefined();
    expect(readPowerTextStore([])).toBeUndefined();
  });
});

describe("the native WeaponBonuses table", () => {
  it("has each text once, so a text names one entry", () => {
    const texts = NATIVE_WEAPON_BONUSES.map(({ text }) =>
      text.toLocaleLowerCase(),
    );
    expect(new Set(texts).size).toBe(texts.length);
  });
});
