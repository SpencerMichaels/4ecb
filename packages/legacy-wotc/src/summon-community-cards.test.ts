import { describe, expect, it } from "vitest";

import { readCreatureStatBlock } from "@4ecb/content-domain";

import { parseD20Rules } from "./parser";

// A hexblade's pact creature as the community content spells it: the summon
// power `_POWERCARD_0` with the stat fields, a trait card `_POWERCARD_1`
// with aura, special movement and opportunity action fields, and attack
// cards whose "Beast's attack bonus" line the 9B correction overlays with
// "your level + 5 vs. …" (a `modify` of the card itself). One class feature
// grants all of them.
const xml = `<?xml version="1.0"?>
<D20Rules game-system="D&amp;D4E">
  <RulesElement name="Level 9 Summon Warlock's Ally (Glass Well)" type="Class Feature" internal-id="ID_SYN_HEXBLADE_FEATURE" source="Synthetic">
    <rules>
      <grant name="ID_SYN_COMPANION_6_POWERCARD_0" type="Power" />
      <grant name="ID_SYN_COMPANION_6_POWERCARD_1" type="Power" />
      <grant name="ID_SYN_COMPANION_6_POWERCARD_2" type="Power" />
      <grant name="ID_SYN_COMPANION_6_POWERCARD_3" type="Power" />
      <statadd name="ID_SYN_COMPANION_6_POWERCARD_2:damage" value="+Pact Reward" />
    </rules>
  </RulesElement>
  <RulesElement name="Wolf Companion Notes" type="Class Feature" internal-id="ID_SYN_OTHER_FEATURE" source="Synthetic">
    <rules><grant name="ID_SYN_COMPANION_6_POWERCARD_4" type="Power" /></rules>
  </RulesElement>
  <RulesElement name="Summoned Creature (Glass Well)" type="Power" internal-id="ID_SYN_COMPANION_6_POWERCARD_0" source="Synthetic">
    <specific name="Power Usage"> Daily </specific>
    <specific name="Display">  </specific>
    <specific name="Keywords"> Arcane, Summoning </specific>
    <specific name="Action Type">  </specific>
    <specific name="Attack Type">  </specific>
    <specific name="Creature"> Glass Handmaiden </specific>
    <specific name="Size"> Medium </specific>
    <specific name="Origin"> Fey </specific>
    <specific name="Type"> Humanoid (Undead) </specific>
    <specific name="Hit Points"> Your bloodied value. </specific>
    <specific name="Healing Surges"> None, but you can expend a healing surge for the handmaiden if an effect allows it to spend one. </specific>
    <specific name="Defenses"> Your defenses + 2, not including any temporary bonuses or penalties. </specific>
    <specific name="Speed"> 6 </specific>
    <specific name="Level"> 9 </specific>
  </RulesElement>
  <RulesElement name="Glass Handmaiden" type="Power" internal-id="ID_SYN_COMPANION_6_POWERCARD_1" source="Synthetic">
    <Flavor>The Lady sends these servants.</Flavor>
    <specific name="Power Usage"> Daily </specific>
    <specific name="Keywords"> Arcane, Summoning, Aura </specific>
    <specific name="Action Type">  </specific>
    <specific name="Attack Type">  </specific>
    <specific name="Shining Presence (Aura 2)"> You gain a +2 power bonus to Insight checks while you are in the aura. </specific>
    <specific name="Special Movement (At-Will; 1/round)"> Minor Action. Effect: The handmaiden either walks, shifts, runs, stands up, squeezes, or crawls. </specific>
    <specific name="Opportunity Action (teleportation, At-Will)"> Trigger: An enemy hits you with a melee attack while within 10 squares of the handmaiden. Effect (Immediate Interrupt): The handmaiden teleports to a square adjacent to you. </specific>
    <specific name="Level"> 9 </specific>
  </RulesElement>
  <RulesElement name="Glass Handmaiden's Attack" type="Power" internal-id="ID_SYN_COMPANION_6_POWERCARD_2" source="Synthetic">
    <specific name="Power Usage"> At-Will </specific>
    <specific name="Keywords"> Arcane, Radiant, Summoning </specific>
    <specific name="Action Type"> Standard Action </specific>
    <specific name="Attack Type"> Melee 1 </specific>
    <specific name="Requirement"> You must have summoned your glass handmaiden. </specific>
    <specific name="Target"> One creature </specific>
    <specific name="Attack"> Beast's attack bonus vs. Reflex </specific>
    <specific name="Hit"> 2d8 + your Charisma modifier radiant damage, and the target is immobilized until the end of your next turn. </specific>
    <specific name="Special"> The creature lacks actions of its own. Instead, you spend actions to command it. </specific>
    <rules>
      <modify name="ID_SYN_COMPANION_6_POWERCARD_2" Field="Attack" value="your level + 5 vs. Reflex" />
    </rules>
  </RulesElement>
  <RulesElement name="Glass Handmaiden's Aura" type="Power" internal-id="ID_SYN_COMPANION_6_POWERCARD_3" source="Synthetic">
    <specific name="Power Usage"> Encounter </specific>
    <specific name="Keywords"> Arcane, Psychic, Summoning </specific>
    <specific name="Action Type"> Minor action </specific>
    <specific name="Requirement"> You must have summoned your glass handmaiden. </specific>
    <specific name="Effect"> Until the end of your next turn, any enemy that ends its turn in the handmaiden's aura takes 5 psychic damage. </specific>
    <specific name="Special"> The creature lacks actions of its own. Instead, you spend actions to command it. </specific>
  </RulesElement>
  <RulesElement name="Glass Companion Notes" type="Power" internal-id="ID_SYN_COMPANION_6_POWERCARD_4" source="Synthetic">
    <specific name="Notes"> Not the handmaiden's. </specific>
  </RulesElement>
</D20Rules>`;

describe("summoned creatures' community cards (D111)", () => {
  const parsed = parseD20Rules(xml, "synthetic");
  const byId = new Map(parsed.entities.map((entity) => [entity.id, entity]));
  const summon = byId.get("ID_SYN_COMPANION_6_POWERCARD_0");
  const block = readCreatureStatBlock(summon?.specifics ?? []);
  if (block?.kind !== "master") throw new Error("expected a master block");

  it("merges the trait card's auras as traits and its actions as actions", () => {
    expect(block.block.traits).toEqual([
      {
        name: "Shining Presence",
        aura: 2,
        lines: [
          {
            text: "You gain a +2 power bonus to Insight checks while you are in the aura.",
          },
        ],
      },
    ]);
    expect(
      block.block.powers.map(({ name, action, usage, keywords }) => [
        name,
        action,
        usage,
        keywords,
      ]),
    ).toEqual([
      ["Special Movement", "Minor", "At-Will; 1/round", undefined],
      ["Opportunity Action", "Opportunity", "At-Will", "teleportation"],
      [
        "Glass Handmaiden's Attack",
        "Standard",
        "At-Will",
        "Arcane, Radiant, Summoning",
      ],
      [
        "Glass Handmaiden's Aura",
        "Minor",
        "Encounter",
        "Arcane, Psychic, Summoning",
      ],
    ]);
    expect(block.block.powers[1]?.lines.map(({ label }) => label)).toEqual([
      "Trigger",
      "Effect (Immediate Interrupt)",
    ]);
  });

  it("reads an attack card with its corrected attack line and a roll keyed to the card", () => {
    const attack = block.block.powers[2];
    expect(attack?.lines.map(({ label, text }) => [label, text])).toEqual([
      ["Target", "One creature"],
      ["Attack", "Melee 1; your level + 5 vs. Reflex"],
      [
        "Hit",
        "2d8 + your Charisma modifier radiant damage, and the target is immobilized until the end of your next turn.",
      ],
    ]);
    expect(attack?.lines[1]?.attack).toEqual({
      range: "Melee 1",
      bonus: { kind: "level", plus: 5 },
      defense: "Reflex",
    });
    expect(attack?.roll).toEqual({
      attack: "your level + 5 vs. Reflex",
      hit: "2d8 + your Charisma modifier radiant damage, and the target is immobilized until the end of your next turn.",
      attackType: "Melee 1",
      target: "One creature",
      source: {
        id: "ID_SYN_COMPANION_6_POWERCARD_2",
        name: "Glass Handmaiden's Attack",
      },
    });
    // The repeated Special prints once, with the creature's notes; the
    // Requirement names the creature the card already is.
    expect(block.block.other).toEqual([
      "The creature lacks actions of its own. Instead, you spend actions to command it.",
    ]);
    expect(block.absorbed).toEqual([
      "ID_SYN_COMPANION_6_POWERCARD_1",
      "ID_SYN_COMPANION_6_POWERCARD_2",
      "ID_SYN_COMPANION_6_POWERCARD_3",
    ]);
  });

  it("keeps the merged cards as inert Internal records under their IDs", () => {
    for (const id of [
      "ID_SYN_COMPANION_6_POWERCARD_1",
      "ID_SYN_COMPANION_6_POWERCARD_2",
      "ID_SYN_COMPANION_6_POWERCARD_3",
    ]) {
      const card = byId.get(id);
      expect(card?.type).toBe("Internal");
      expect(card?.specifics).toEqual([]);
      // Only the card's rewrite of its own text goes.
      expect(card?.rules).toEqual([]);
    }
    expect(byId.get("ID_SYN_COMPANION_6_POWERCARD_1")?.name).toBe(
      "Glass Handmaiden",
    );
  });

  it("leaves a card another record grants alone", () => {
    expect(byId.get("ID_SYN_COMPANION_6_POWERCARD_4")?.type).toBe("Power");
  });

  it("adds the merged commands' texts to the summon's power text IR", () => {
    const ir = JSON.parse(
      summon?.specifics.find(({ name }) => name === "_Power Text IR")?.value ??
        "{}",
    ) as { texts?: Record<string, unknown> };
    expect(Object.keys(ir.texts ?? {})).toEqual(
      expect.arrayContaining([
        "your level + 5 vs. Reflex",
        "2d8 + your Charisma modifier radiant damage, and the target is immobilized until the end of your next turn.",
      ]),
    );
  });
});
