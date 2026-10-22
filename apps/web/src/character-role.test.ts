import { describe, expect, it } from "vitest";
import type { ContentEntity } from "@4ecb/content-domain";

import { characterRoleLine, classRole } from "./character-role";

function entity(
  id: string,
  type: string,
  fields: Readonly<Record<string, string>> = {},
): ContentEntity {
  return {
    id,
    name: id,
    type,
    specifics: Object.entries(fields).map(([name, value], ordinal) => ({
      name,
      value,
      ordinal,
    })),
  } as unknown as ContentEntity;
}

const paladin = entity("ID_PALADIN", "Class", {
  Role: "Defender. You stand in front of your allies.",
  "Power Source": "Divine. You are a holy warrior.",
});
const content = [
  paladin,
  entity("ID_HYBRID", "Class"),
  entity("ID_HYBRID_BARD", "Hybrid Class", {
    Role: "leader.",
    "Power Source": "Arcane.",
  }),
  entity("ID_HYBRID_EXECUTIONER", "Hybrid Class", {
    Role: "Striker.  You are a warrior.",
    "Power Source": "Martial and Shadow.",
  }),
  entity("ID_ORDER_ADEPT", "Class"),
  entity("ID_DWARF", "Race"),
];
const evaluated = (...ids: string[]) =>
  ({
    occurrences: ids.map((definitionId) => ({ definitionId })),
  }) as unknown as Parameters<typeof characterRoleLine>[0];

describe("character role line", () => {
  it("reads each class field's one-word label, title-cased", () => {
    expect(classRole(paladin)).toBe("Divine Defender");
    expect(classRole(content[3]!)).toBe("Martial Striker");
    expect(classRole(content[1]!)).toBeUndefined();
  });

  it("names a single class's power source and role", () => {
    expect(
      characterRoleLine(
        evaluated("ID_DWARF", "ID_ORDER_ADEPT", "id_paladin"),
        content,
      ),
    ).toBe("Divine Defender");
    expect(characterRoleLine(evaluated("ID_DWARF"), content)).toBeUndefined();
  });

  it("joins a hybrid's two halves, ignoring the Hybrid marker class", () => {
    expect(
      characterRoleLine(
        evaluated("ID_HYBRID", "ID_HYBRID_BARD", "ID_HYBRID_EXECUTIONER"),
        content,
      ),
    ).toBe("Arcane Leader / Martial Striker");
  });
});
