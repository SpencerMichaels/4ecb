import { describe, expect, it } from "vitest";

import type { ContentEntity } from "@4ecb/content-domain";

import type { FieldOverlay } from "./evaluator";
import {
  increaseDamageDie,
  overlaidEntity,
  overlaidField,
  overlayTargets,
  withOverlaidItems,
} from "./item-fields";

function entity(
  id: string,
  name: string,
  type: string,
  specifics: Record<string, string> = {},
): ContentEntity {
  return {
    id,
    name,
    type,
    source: "test",
    sources: ["test"],
    attributes: [],
    categories: [],
    specifics: Object.entries(specifics).map(([fieldName, value], ordinal) => ({
      name: fieldName,
      value,
      extraAttributes: [],
      ordinal,
    })),
    rules: [],
    description: "",
    extensions: [],
    provenance: { sourceKey: "test", sourceOrdinal: 0 },
  };
}

const overlay = (changes: Partial<FieldOverlay>): FieldOverlay => ({
  providerOccurrenceId: "feat",
  targetDefinitionIds: [],
  field: "Properties",
  ...changes,
});

describe("item field overlays (native C_RulesElementField)", () => {
  it("steps dice through the native one-handed table", () => {
    expect(
      ["1d4", "1d6", "1d8", "1d10", "1d12", "2d6", "2d8", "2d10"].map((die) =>
        increaseDamageDie(die),
      ),
    ).toEqual(["1d6", "1d8", "1d10", "1d12", "2d6", "2d8", "2d10", "2d10"]);
    expect(increaseDamageDie("2d4")).toBe("1d10");
    expect(increaseDamageDie("d8")).toBe("1d10");
    expect(increaseDamageDie("1d6/1d4")).toBe("1d8/1d6");
    expect(increaseDamageDie("1d4", 2)).toBe("1d8");
    expect(increaseDamageDie("1d8 + 2")).toBe("1d8 + 2");
    expect(increaseDamageDie("")).toBe("");
  });

  it("targets records by name, ID, type and Large size, never by context name", () => {
    const scythe = entity("SCYTHE", "Scythe", "Weapon");
    const large = entity("LARGE_SCYTHE", "Large Scythe", "Weapon");
    const named = overlay({ targetName: "Scythe", targetType: "Weapon" });
    expect(overlayTargets(named, scythe)).toBe(true);
    expect(overlayTargets(named, large)).toBe(true);
    expect(overlayTargets(overlay({ targetName: "SCYTHE" }), scythe)).toBe(
      true,
    );
    expect(
      overlayTargets(
        overlay({ targetName: "Scythe", targetType: "Power" }),
        scythe,
      ),
    ).toBe(false);
    expect(
      overlayTargets(
        overlay({ targetName: "BaseItem" }),
        entity("B", "BaseItem", "Weapon"),
      ),
    ).toBe(false);
    expect(
      overlayTargets(
        overlay({ targetName: "BaseItem", targetDefinitionIds: ["SCYTHE"] }),
        scythe,
      ),
    ).toBe(true);
  });

  it("applies value, list-addition and die-increase in order without mutating content", () => {
    const sling = entity("SLING", "Sling", "Weapon", {
      Damage: "1d6",
      Properties: "Load Free",
    });
    const overlays = [
      overlay({ targetName: "Sling", listAddition: "High Crit" }),
      overlay({ targetName: "Sling", field: "Proficiency Bonus", value: "3" }),
      overlay({ targetName: "Sling", field: "Damage", dieIncrease: "1" }),
    ];
    expect(overlaidField(sling, "Properties", overlays)).toBe(
      "Load Free, High Crit",
    );
    const resolved = overlaidEntity(sling, overlays);
    expect(
      Object.fromEntries(resolved.specifics.map((s) => [s.name, s.value])),
    ).toEqual({
      Damage: "1d8",
      Properties: "Load Free, High Crit",
      "Proficiency Bonus": "3",
    });
    expect(sling.specifics.map((s) => s.value)).toEqual(["1d6", "Load Free"]);
    expect(overlaidEntity(sling, [])).toBe(sling);
  });

  it("overlays only loot records in an entity list", () => {
    const entities = [
      entity("SLING", "Sling", "Weapon", { Properties: "" }),
      entity("POWER", "Sling", "Power", { Properties: "" }),
    ];
    const overlays = [
      overlay({ targetName: "Sling", listAddition: "High Crit" }),
    ];
    const [weapon, power] = withOverlaidItems(entities, overlays);
    expect(weapon?.specifics[0]?.value).toBe("High Crit");
    expect(power).toBe(entities[1]);
    expect(withOverlaidItems(entities, [])).toBe(entities);
  });
});
