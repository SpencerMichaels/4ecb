import { describe, expect, it } from "vitest";

import { readPowerTextStore } from "@4ecb/content-domain";

import { parseD20Rules } from "./parser";

const parsed = parseD20Rules(`<D20Rules game-system="D&amp;D4E">
  <RulesElement internal-id="ID_TEST_POWER" name="Test Strike" type="Power" source="Synthetic">
    <specific name="Power Usage">At-Will</specific>
    <specific name="Keywords">Martial, Weapon</specific>
    <specific name="Attack Type">Melee weapon</specific>
    <specific name="Attack">Strength vs. AC </specific>
    <specific name="Hit">1[W] + Strength modifier damage.</specific>
    <specific name="Secondary Attack">Strength vs. Reflex</specific>
    <specific name="Hit">The target is pushed 1 square and dazed by the damage you deal.</specific>
    <specific name="Effect">You can spend a healing surge.</specific>
  </RulesElement>
  <RulesElement internal-id="ID_TEST_FEAT" name="Test Training" type="Feat" source="Synthetic">
    <rules>
      <modify name="Melee Basic Attack" type="Power" Field="Attack" value="Constitution vs. AC" />
      <modify name="Melee Basic Attack" type="Power" Field="Keywords" value="Charm" />
    </rules>
  </RulesElement>
</D20Rules>`);

const store = (id: string) =>
  readPowerTextStore(
    parsed.entities.find((entity) => entity.id === id)?.specifics ?? [],
  );

describe("the pack build's power text", () => {
  it("parses a power's attack slots and attack, hit and effect texts", () => {
    const power = store("ID_TEST_POWER");
    expect(power?.slots).toEqual([
      [2, "attack-type", 1],
      [3, "attack", 1],
      [4, "hit", 1],
      [5, "attack", 2],
      [6, "hit", 2],
    ]);
    // An attack slot's text is keyed trimmed, as the engine reads it.
    expect(Object.keys(power?.texts ?? {}).sort()).toEqual([
      "1[W] + Strength modifier damage.",
      "Strength vs. AC",
      "Strength vs. Reflex",
      "The target is pushed 1 square and dazed by the damage you deal.",
      "You can spend a healing surge.",
    ]);
    expect(power?.texts["You can spend a healing surge."]).toEqual({
      recoveries: [
        { kind: "healing-surge", expression: "You can spend a healing surge." },
      ],
    });
  });

  it("parses a modify value that replaces an attack field", () => {
    expect(Object.keys(store("ID_TEST_FEAT")?.texts ?? {})).toEqual([
      "Constitution vs. AC",
    ]);
  });

  it("reports a hit text with no damage expression", () => {
    expect(
      parsed.diagnostics
        .filter((diagnostic) => diagnostic.code === "power.text-unparsed")
        .map((diagnostic) => diagnostic.message),
    ).toEqual([
      'Power text: hit line has no damage expression: "The target is pushed 1 square and dazed by the damage you deal."',
    ]);
  });
});
