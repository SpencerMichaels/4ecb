import { describe, expect, it } from "vitest";

import {
  NATIVE_WEAPON_BONUSES,
  authoredAttackLine,
  hitLineAt,
  levelHeaderText,
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

  it("reads the first signed number after any stat word, only before ' vs.'", () => {
    // Native CalcStatVsDefense (~23811): a WOG companion's modify.
    expect(
      authoredAttackLine(parseAttackField("Base + 4 vs. AC")).bonus,
    ).toEqual({ base: 4 });
    // No " vs": native reads no stat.
    expect(
      authoredAttackLine(
        parseAttackField(
          "The attacker repeats the attack that missed you against its own defenses with a +4 power bonus.",
        ),
      ).bonus,
    ).toEqual({});
    // A dual power's melee half is the whole line's stat.
    const dual = parseAttackField(
      "Strength (melee) or Dexterity (ranged) vs. AC. If the target couldn't see you before you moved, it grants combat advantage to you for this attack.",
    );
    expect("alternatives" in dual.other && dual.other.alternatives).toEqual([
      { defense: "AC", abilities: ["Strength"], bonus: {} },
      { defense: "AC", abilities: ["Dexterity"], bonus: {} },
    ]);
  });

  it("takes attack abilities only from the stats before ' vs.'", () => {
    const line = (text: string) =>
      authoredAttackLine(parseAttackField(text)).abilities;
    expect(
      line(
        "Dexterity vs. Fortitude. If the target is bloodied, you gain a bonus to the attack roll equal to one-half your Strength modifier.",
      ),
    ).toEqual(["Dexterity"]);
    expect(
      line(
        "Intelligence vs. Fortitude, Wisdom vs. Fortitude, or Charisma vs. Fortitude",
      ),
    ).toEqual(["Intelligence", "Wisdom", "Charisma"]);
  });

  it("reads a theme power's 'Level N' header fields from that level", () => {
    const slots = powerAttackSlots(
      [
        ["Attack", "Primary ability vs. AC, two attacks."],
        ["Hit", "5 + ability modifier damage per attack."],
        ["Level 19", ""],
        [" Attack", "As above, but Primary ability + 2 vs. AC."],
        ["Level 27", ""],
        [" Hit", "As above, but +6 power bonus to damage rolls."],
        ["_ThemePower", "ID_SYNTHETIC_THEME"],
      ].map(([name, value], ordinal) => ({
        name: name!,
        value: value!,
        ordinal,
      })),
    );
    // The "As above, but" Hit only restates the main Hit's damage (D105).
    expect(slots).toEqual([
      [0, "attack", 1],
      [1, "hit", 1],
      [3, "attack", 1, 19],
    ]);
    expect(levelHeaderText("As above, but Primary ability + 2 vs. AC.")).toBe(
      "Primary ability + 2 vs. AC.",
    );
  });

  it("never reads a summon's Opportunity Attack command as the power's attack", () => {
    expect(
      powerAttackSlots(
        [" Opportunity Attack", "• Opportunity Attack", "Attack"].map(
          (name, ordinal) => ({ name, ordinal }),
        ),
      ),
    ).toEqual([[2, "attack", 1]]);
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

  it("reads every term of native CalcDamage's '+' chain", () => {
    const clause = (text: string, level = 1) =>
      hitLineAt(parseHitField(text), level).other.clauses[0];
    // A flat number in the chain (ParseAbilityMod's all-digit branch).
    expect(clause("2[W] + 2 + Strength modifier damage.")).toMatchObject({
      powerDamageBonus: 2,
      modifierAbilities: ["Strength"],
    });
    // An ability without "modifier", alone or before another.
    expect(
      clause("5[W] + Strength damage, and you can push the target 1 square.")
        .modifierAbilities,
    ).toEqual(["Strength"]);
    expect(
      clause("3[W] + Strength + Constitution modifier damage.")
        .modifierAbilities,
    ).toEqual(["Strength", "Constitution"]);
    // A comma list is a choice of abilities (MultipleAbilityChoices).
    expect(
      clause("1d10 + Charisma, Intelligence Wisdom modifier psychic damage."),
    ).toMatchObject({ hasOr: true });
    // A bonus in the prose before "damage" is no damage term.
    expect(
      clause(
        "1[W] + Strength modifier, and you gain a + 2 bonus to AC until the end of your next turn and deal fire damage.",
      ).powerDamageBonus,
    ).toBeUndefined();
    // A push or pull distance is not damage dice.
    expect(clause("You push the secondary target 1d4 squares.").fixedDice).toBe(
      undefined,
    );
  });

  it("reads the ranged clause of a melee-or-ranged ability with the weapon dice", () => {
    const [melee, ranged] = parseHitField(
      "3[W] + Strength (melee) or Dexterity (ranged) modifier damage.",
    ).steps[0]!.line.other.clauses;
    expect(melee).toMatchObject({
      weaponTerms: [{ count: 3 }],
      modifierAbilities: ["Strength"],
    });
    expect(ranged).toMatchObject({
      weaponTerms: [{ count: 3 }],
      modifierAbilities: ["Dexterity"],
    });
    // The ranged clause is the part naming "(ranged", not the last " or ".
    const [, choice] = parseHitField(
      "3[W] + Strength modifier damage (melee) or 3[W] + Dexterity modifier damage (ranged). The damage type is your choice of acid, cold, fire, or thunder.",
    ).steps[0]!.line.other.clauses;
    expect(choice?.modifierAbilities).toEqual(["Dexterity"]);
  });

  it("reads a level step without 'damage' as the whole expression", () => {
    const field = parseHitField(
      "5 + ability modifier damage per attack, and the target takes a penalty to attack rolls (save ends).\nIncrease damage to 10 + ability modifier at 29th level.",
    );
    expect(hitLineAt(field, 29)).toMatchObject({
      damage: true,
      other: { clauses: [{ flatBase: 10, abilityPhrase: "ability" }] },
    });
  });

  it("steps at an indented or mid-line native 'Level N:'", () => {
    const indented = parseHitField(
      "1[W] + Strength modifier damage.\n  Level 21: 2[W] + Strength modifier damage.",
    );
    expect(indented.steps.map((step) => step.from)).toEqual([undefined, 21]);
    const tabbed = parseHitField(
      "1[W] + your highest ability modifier damage.\n\tLevel 11: 2[W] + your highest ability modifier damage.\n\tLevel 21: 3[W] + your highest ability modifier damage.",
    );
    expect(
      [1, 11, 21].map(
        (level) =>
          hitLineAt(tabbed, level).other.clauses[0].weaponTerms?.[0]?.count,
      ),
    ).toEqual([1, 2, 3]);
    const midLine = parseHitField("1[W] damage. Level 21: 2[W] damage.");
    expect(
      [1, 21].map(
        (level) =>
          hitLineAt(midLine, level).other.clauses[0].weaponTerms?.[0]?.count,
      ),
    ).toEqual([1, 2]);
    // D105: a line-start non-native level still steps; mid-line it does not.
    expect(
      parseHitField("1[W] damage.\n\tLevel 13: 2[W] damage.").steps.map(
        (step) => step.from,
      ),
    ).toEqual([undefined, 13]);
    expect(
      parseHitField("1[W] damage. Level 13: 2[W] damage.").steps.map(
        (step) => step.from,
      ),
    ).toEqual([undefined]);
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
