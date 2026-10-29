import { describe, expect, it } from "vitest";

import {
  CREATURE_STAT_BLOCK_FIELD,
  readCreatureStatBlock,
  type SpecificField,
} from "@4ecb/content-domain";

import { parseD20Rules } from "./parser";
import { commandRoll, parseSummonCreature } from "./summon-creature";

// Synthetic summon powers in the spellings the real content uses: indented
// command fields (" Standard action"), "Instinctive Effect", augment fields
// after "Augment", and stat-field creatures ("Hit Points", "Defenses",
// "Statistics", prefixed "<creature> Speed", "Creature"/"Size"/"Origin"/
// "Type").
const fields = (
  entries: readonly (readonly [string, string])[],
): SpecificField[] =>
  entries.map(([name, value], ordinal) => ({
    name,
    value,
    extraAttributes: [],
    ordinal,
  }));

const commandSummon = fields([
  ["Power Usage", "Daily"],
  ["Keywords", "Arcane, Implement, Summoning"],
  ["Action Type", "Minor Action"],
  ["Attack Type", "Ranged 5"],
  [
    "Effect",
    "You summon a Medium glass heron in an unoccupied square within range. The heron has speed 6 and fly 8 (hover). It has a +4 bonus to AC and a +2 bonus to its other defenses. The heron has resist 5 cold, and it gains a +2 bonus to AC against opportunity attacks. You can give the heron the following special commands.",
  ],
  [
    " Standard action",
    "Melee 1; targets one creature; Intelligence vs. Reflex; 1d8 + Intelligence modifier cold damage.",
  ],
  [
    " Opportunity Attack",
    "Melee 1; targets one creature; Intelligence vs. Reflex; 1d8 + Intelligence modifier cold damage.",
  ],
  [
    "Instinctive Effect",
    "If you haven't given the heron any commands by the end of your turn, it attacks the nearest enemy.",
  ],
  ["Augment", "2"],
  [" Effect", "As above, and the heron has fly 10."],
  [" Opportunity Action", "The heron shifts 1 square."],
  ["Class", "ID_SYN_CLASS_1"],
  ["Level", "9"],
]);

describe("commandRoll", () => {
  it.each([
    [
      "Melee 1; targets one creature; Wisdom vs. Fortitude; 1d8 + Wisdom modifier damage.",
      {
        attack: "Wisdom vs. Fortitude",
        hit: "1d8 + Wisdom modifier damage.",
        attackType: "Melee 1",
        target: "One creature",
      },
    ],
    [
      "The panther shifts 3 squares and then attacks: melee 1; targets one creature; Wisdom vs. Reflex; 1d10 + Wisdom modifier damage.",
      {
        attack: "Wisdom vs. Reflex",
        hit: "1d10 + Wisdom modifier damage.",
        attackType: "Melee 1",
        target: "One creature",
      },
    ],
    [
      "Melee 1 (one creature); Dexterity vs. Reflex; 2d6 + Dexterity modifier psychic damage.",
      {
        attack: "Dexterity vs. Reflex",
        hit: "2d6 + Dexterity modifier psychic damage.",
        attackType: "Melee 1",
        target: "One creature",
      },
    ],
    [
      "Melee 1; targets one creature; Intelligence + 2 vs. AC; 2d10 + Intelligence modifier damage.",
      {
        attack: "Intelligence + 2 vs. AC",
        hit: "2d10 + Intelligence modifier damage.",
        attackType: "Melee 1",
        target: "One creature",
      },
    ],
    [
      "Close burst 2; targets each enemy in burst; Wisdom vs. Reflex; the angel pulls the target 1 square.",
      {
        attack: "Wisdom vs. Reflex",
        hit: "the angel pulls the target 1 square.",
        attackType: "Close burst 2",
        target: "Each enemy in burst",
      },
    ],
  ])("reads %j", (text, roll) => {
    expect(commandRoll(text)).toEqual(roll);
  });

  it("is nothing for a command with no attack", () => {
    expect(commandRoll("The angel shifts 3 squares.")).toBeUndefined();
  });
});

describe("parseSummonCreature", () => {
  it("reads a special-command summon as a summoned creature with your hit points and defenses", () => {
    const parsed = parseSummonCreature("Summon Glass Heron", commandSummon);
    expect(parsed?.issues).toEqual([]);
    const block = parsed?.block;
    if (block?.kind !== "master") throw new Error("expected a master block");
    expect(block.name).toBe("Glass Heron");
    expect(block.block).toMatchObject({
      role: "Summoned Creature",
      size: "Medium",
      creatureType: "glass heron",
      hitPoints: { kind: "master-bloodied" },
      // The conditional "+2 bonus to AC against opportunity attacks" stays
      // in the Effect.
      defenses: {
        kind: "master",
        bonus: { ac: 4, fortitude: 2, reflex: 2, will: 2 },
      },
      defensesNote: "not including any temporary bonuses or penalties",
      speed: "6, fly 8 (hover)",
      defenseTraits: ["Resist 5 cold"],
    });
    expect(
      block.block.powers.map(({ name, action }) => [name, action]),
    ).toEqual([
      ["Standard Action", "Standard"],
      ["Opportunity Attack", "Opportunity"],
    ]);
    expect(block.block.powers[0]?.lines).toEqual([
      {
        text: "Melee 1; targets one creature; Intelligence vs. Reflex; 1d8 + Intelligence modifier cold damage.",
      },
    ]);
    expect(block.block.traits.map(({ name }) => name)).toEqual([
      "Instinctive Effect",
    ]);
    // The augment's fields stay on the power card.
    expect(block.powerFields).toEqual([
      " Standard action",
      " Opportunity Attack",
      "Instinctive Effect",
    ]);
  });

  it("leaves a summon whose creature it cannot place to the power card", () => {
    const unplaced = fields([
      ["Keywords", "Arcane, Summoning"],
      [
        "Effect",
        "You throw your sword into the air. It has a +2 bonus to AC. Your allies gain a +2 bonus to Will while adjacent to it.",
      ],
      [" Standard action", "Melee 1; Strength vs. AC; 1d8 damage."],
    ]);
    const parsed = parseSummonCreature("Flying Sword", unplaced);
    expect(parsed?.block).toBeUndefined();
    expect(parsed?.issues[0]).toMatch(/no "you summon/);
  });

  it("is nothing for a summon with no creature of its own", () => {
    expect(
      parseSummonCreature(
        "Summon Swarm",
        fields([
          ["Keywords", "Primal, Summoning"],
          ["Effect", "You summon a swarm. It attacks each turn."],
        ]),
      ),
    ).toBeUndefined();
    expect(
      parseSummonCreature(
        "Fireball",
        fields([
          ["Keywords", "Arcane, Fire"],
          ["Effect", "You summon a Large ball of fire in the square."],
          [" Standard action", "It explodes."],
        ]),
      ),
    ).toBeUndefined();
  });

  it("respells a stat-field creature as an associate stat block", () => {
    const parsed = parseSummonCreature(
      "Bound Wraith",
      fields([
        ["Power Usage", "Encounter"],
        ["Keywords", "Divine, Summoning"],
        ["Statistics", "Medium shadow humanoid (undead), Speed 6"],
        ["Hit Points", "(your healing surge value)"],
        [
          "Healing Surges",
          "None, but you can lose a healing surge for the wraith if an effect allows it to spend one.",
        ],
        [
          "Defenses",
          "Your defenses, not including any temporary bonuses or penalties",
        ],
        ["Traits", "Insubstantial: The wraith takes half damage."],
        [
          "Chill Shroud",
          "(Aura 1)\nEnemies in the aura take a -1 penalty to attack rolls.",
        ],
        [
          "Standard Action",
          "(At-Will)\nAttack: Melee 1 (one creature); your level + 5 vs. Fortitude\nHit: 1d10 + your Intelligence, Wisdom, or Charisma modifier cold damage.\nLevel 21: 2d10 + your Intelligence, Wisdom, or Charisma modifier cold damage.",
        ],
        [
          "Minor Action",
          "(Teleportation) * At-will (1/round)\n  Effect: The wraith teleports 3 squares.",
        ],
        [
          "Opportunity Action",
          "(At-Will)\nTrigger: An enemy hits you while you are adjacent to the wraith.\nEffect: The wraith can push the triggering enemy 1 square.\nLevel 21: The wraith pushes the triggering enemy up to 3 squares.",
        ],
        ["Class", "ID_SYN_CLASS_2"],
      ]),
    );
    expect(parsed?.issues).toEqual([]);
    const block = parsed?.block;
    if (block?.kind !== "master") throw new Error("expected a master block");
    expect(block.name).toBe("Bound Wraith");
    expect(block.block).toMatchObject({
      role: "Summoned Creature",
      size: "Medium",
      creatureType: "shadow humanoid (undead)",
      hitPoints: { kind: "master-surge-value" },
      defenses: { kind: "master" },
      speed: "6",
    });
    expect(block.block.traits.map(({ name, aura }) => [name, aura])).toEqual([
      ["Insubstantial", undefined],
      ["Chill Shroud", 1],
    ]);
    const [standard, minor] = block.block.powers;
    expect(standard).toMatchObject({ action: "Standard", usage: "At-Will" });
    expect(standard?.lines[0]?.attack?.bonus).toEqual({
      kind: "level",
      plus: 5,
    });
    expect(standard?.lines[1]?.steps?.[0]?.level).toBe(21);
    // "X, Y, or Z modifier": the three listed abilities (D111).
    expect(standard?.lines[1]?.damage?.terms[1]).toEqual({
      kind: "ability",
      abilities: ["Intelligence", "Wisdom", "Charisma"],
    });
    // The engine works out the attack from these texts (D111).
    expect(standard?.roll).toEqual({
      attack: "your level + 5 vs. Fortitude",
      hit: "1d10 + your Intelligence, Wisdom, or Charisma modifier cold damage.\nLevel 21: 2d10 + your Intelligence, Wisdom, or Charisma modifier cold damage.",
      attackType: "Melee 1",
      target: "One creature",
    });
    expect(minor?.roll).toBeUndefined();
    expect(minor).toMatchObject({
      action: "Minor",
      keywords: "Teleportation",
      usage: "At-will (1/round)",
    });
    expect(block.powerFields).toEqual([
      "Statistics",
      "Hit Points",
      "Defenses",
      "Healing Surges",
      "Traits",
      "Chill Shroud",
      "Standard Action",
      "Minor Action",
      "Opportunity Action",
    ]);
  });

  it("reads a prefixed stat-field creature and keeps the power's own attack", () => {
    const parsed = parseSummonCreature(
      "Servant of the Lamp 1",
      fields([
        ["Power Usage", "At-Will"],
        [
          "Servant of the Lamp Stats",
          "Small fire humanoid; Summoned Creature (minion)",
        ],
        [
          "Servant of the Lamp Defenses",
          "Your defenses, not including any temporary bonuses or penalties",
        ],
        [
          "Servant of the Lamp Hit Points",
          "1, a missed attack never damages a minion.",
        ],
        ["Servant of the Lamp Speed", "6; phasing"],
        ["Keywords", "Fire"],
        ["Attack", "Your level + 5 vs. Reflex"],
        ["Hit", "3 fire damage."],
      ]),
    );
    expect(parsed?.issues).toEqual([]);
    const block = parsed?.block;
    if (block?.kind !== "master") throw new Error("expected a master block");
    expect(block.name).toBe("Servant of the Lamp");
    expect(block.block).toMatchObject({
      role: "Summoned Creature (minion)",
      hitPoints: { kind: "fixed", value: 1 },
      hitPointsNote: "a missed attack never damages a minion",
      speed: "6; phasing",
    });
    expect(block.powerFields).not.toContain("Attack");
    expect(block.powerFields).not.toContain("Hit");
  });

  it("reads a hexblade creature's Creature, Size, Origin and Type fields", () => {
    const parsed = parseSummonCreature(
      "Summoned Creature (Glass Pact)",
      fields([
        ["Keywords", "Arcane, Summoning"],
        ["Creature", "Glass Sentinel"],
        ["Size", "Medium"],
        ["Origin", "Fey"],
        ["Type", "Humanoid (Construct)"],
        ["Hit Points", "Your bloodied value."],
        [
          "Healing Surges",
          "None, but you can expend a healing surge for the sentinel.",
        ],
        [
          "Defenses",
          "Your defenses + 2, not including any temporary bonuses or penalties.",
        ],
        ["Speed", "7 , fly 3 (hover)"],
      ]),
    );
    expect(parsed?.issues).toEqual([]);
    const block = parsed?.block;
    if (block?.kind !== "master") throw new Error("expected a master block");
    expect(block.name).toBe("Glass Sentinel");
    expect(block.block).toMatchObject({
      size: "Medium",
      creatureType: "fey humanoid (construct)",
      hitPoints: { kind: "master-bloodied" },
      defenses: {
        kind: "master",
        bonus: { ac: 2, fortitude: 2, reflex: 2, will: 2 },
      },
      speed: "7, fly 3 (hover)",
    });
  });

  it("stores the creature on the power record at import", () => {
    const xml = `<?xml version="1.0"?>
<D20Rules game-system="D&amp;D4E">
  <RulesElement name="Summon Glass Heron" type="Power" internal-id="ID_SYN_POWER_1" source="Synthetic">
    <specific name="Keywords">Arcane, Summoning</specific>
    <specific name="Effect">You summon a Small glass heron in an unoccupied square within range. The heron has speed 6.</specific>
    <specific name=" Standard action">Melee 1; Intelligence vs. AC; 1d6 damage.</specific>
  </RulesElement>
  <RulesElement name="Summon Lost Heron" type="Power" internal-id="ID_SYN_POWER_2" source="Synthetic">
    <specific name="Keywords">Arcane, Summoning</specific>
    <specific name="Effect">A heron appears.</specific>
    <specific name=" Standard action">Melee 1; Intelligence vs. AC; 1d6 damage.</specific>
  </RulesElement>
</D20Rules>`;
    const parsed = parseD20Rules(xml, "synthetic");
    const [found, lost] = parsed.entities;
    const block = readCreatureStatBlock(found?.specifics ?? []);
    expect(block?.kind === "master" && block.powerFields).toEqual([
      " Standard action",
    ]);
    expect(
      lost?.specifics.some(({ name }) => name === CREATURE_STAT_BLOCK_FIELD),
    ).toBe(false);
    expect(
      parsed.diagnostics.filter(
        ({ code }) => code === "summon.stat-block-unparsed",
      ),
    ).toHaveLength(1);
  });
});
