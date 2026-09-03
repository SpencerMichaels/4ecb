import { describe, expect, it } from "vitest";

import { isCharacterRecord, newCharacterRecord } from "@4ecb/character-domain";
import type { ContentEntity, RuleStatement } from "@4ecb/content-domain";
import {
  evaluateCharacter,
  projectBuildForEvaluation,
} from "@4ecb/rules-engine";

import {
  compareEditedDnd4eRoundTrip,
  exportEditedDnd4e,
  importDnd4e,
  projectBuildForLegacyExport,
} from ".";

function statement(
  name: string,
  attributes: Readonly<Record<string, string>>,
  ordinal = 0,
): RuleStatement {
  return {
    name,
    attributes: Object.entries(attributes).map(([attribute, value]) => ({
      name: attribute,
      value,
    })),
    text: "",
    children: [],
    ordinal,
  };
}

function entity(
  id: string,
  name: string,
  type: string,
  rules: readonly RuleStatement[] = [],
): ContentEntity {
  return {
    id,
    name,
    type,
    source: "Public construction-export fixture",
    sources: ["Public construction-export fixture"],
    attributes: [],
    categories: [],
    specifics: [],
    rules,
    description: "",
    extensions: [],
    provenance: {
      sourceKey: "construction-export-conformance",
      sourceOrdinal: 0,
    },
  };
}

describe("legacy save/history construction conformance", () => {
  it("regenerates current full-level caches instead of exporting history or stale imported caches", () => {
    const imported = importDnd4e(
      `<D20Character game-system="D&amp;D4E"><CharacterSheet><StatBlock><Stat value="999"><alias name="Construction Total"/></Stat></StatBlock></CharacterSheet><Level><RulesElement name="1" type="Level" internal-id="L1"/><UserEdit><RulesElement name="Level 1 user edits" type="User" charelem="user-edit"/><rules><statadd name="Construction Total" value="5" type="untyped" comment="preserve me"><future value="kept"/></statadd></rules></UserEdit></Level><Level><RulesElement name="2" type="Level" internal-id="L2"/></Level></D20Character>`,
    );
    const build = {
      ...imported.build,
      effectiveLevel: 2,
      grabbag: [
        {
          id: "house-option",
          identity: {
            definitionId: "HOUSE",
            name: "House option",
            type: "Feature",
          },
          acquiredLevel: 0,
          legality: "rules-legal" as const,
          children: [],
          unresolved: false,
        },
      ],
      textStrings: { NOTE_TEST: "authoritative current note" },
    };
    const content = [
      entity("L1", "1", "Level", [
        statement("statadd", { name: "Construction Total", value: "+1" }),
      ]),
      entity("L2", "2", "Level", [
        statement("statadd", { name: "Construction Total", value: "+2" }),
      ]),
      entity("HOUSE", "House option", "Feature", [
        statement("statadd", { name: "Construction Total", value: "+4" }),
      ]),
    ];
    const historical = evaluateCharacter(
      { ...projectBuildForEvaluation(build, content), level: 1 },
      content,
    );
    expect(() =>
      exportEditedDnd4e({
        target: "legacy-builder-0.07a",
        envelope: imported.envelope,
        snapshot: imported.snapshot,
        build,
        evaluation: historical,
        content,
      }),
    ).toThrow("evaluation does not match the build level");

    const current = evaluateCharacter(
      projectBuildForEvaluation(build, content),
      content,
    );
    const xml = exportEditedDnd4e({
      target: "legacy-builder-0.07a",
      envelope: imported.envelope,
      snapshot: imported.snapshot,
      build,
      evaluation: current,
      content,
    });
    const reimported = importDnd4e(xml);

    expect(current.stats["Construction Total"]?.value).toBe(12);
    expect(xml).toContain('<Stat value="12">');
    expect(xml).not.toContain('<Stat value="999">');
    expect(reimported.build.textStrings.NOTE_TEST).toBe(
      "authoritative current note",
    );
    expect(reimported.build.levels[0]?.userEdit).toMatchObject({
      root: {
        identity: { name: "Level 1 user edits", type: "User" },
      },
      rules: [
        {
          name: "statadd",
          attributes: expect.arrayContaining([
            { name: "name", value: "Construction Total" },
            { name: "comment", value: "preserve me" },
          ]),
          children: [
            {
              name: "future",
              attributes: [{ name: "value", value: "kept" }],
            },
          ],
        },
      ],
    });
    expect(
      isCharacterRecord(
        newCharacterRecord(
          reimported.envelope,
          reimported.snapshot,
          reimported.build,
          { id: "user-edit-round-trip", now: "2026-09-02T00:00:00.000Z" },
        ),
      ),
    ).toBe(true);
    expect(reimported.build.grabbag[0]?.identity.definitionId).toBe("HOUSE");
    expect(
      compareEditedDnd4eRoundTrip(
        projectBuildForLegacyExport(build),
        reimported.build,
      ),
    ).toEqual({ equivalent: true, differences: [] });
  });

  it("excludes inactive future grants and planning without mutating the native build", () => {
    const imported = importDnd4e(
      `<D20Character game-system="D&amp;D4E"><Level><RulesElement name="1" type="Level" internal-id="L1"/></Level><Level><RulesElement name="2" type="Level" internal-id="L2"><RulesElement name="Future feat" type="Feat" internal-id="FUTURE"/></RulesElement></Level></D20Character>`,
    );
    const build = { ...imported.build, effectiveLevel: 1 };
    const content = [
      entity("L1", "1", "Level"),
      entity("L2", "2", "Level", [
        statement("grant", { name: "FUTURE", type: "Feat" }),
      ]),
      entity("FUTURE", "Future feat", "Feat"),
    ];
    const evaluation = evaluateCharacter(
      projectBuildForEvaluation(build, content),
      content,
    );

    const xml = exportEditedDnd4e({
      target: "legacy-builder-0.07a",
      envelope: imported.envelope,
      snapshot: imported.snapshot,
      build,
      evaluation,
      content,
    });

    expect(xml).not.toContain("Future feat");
    expect(importDnd4e(xml).build.levels).toHaveLength(1);
    expect(build.levels).toHaveLength(2);
    expect(build.levels[1]?.root.children[0]?.identity.definitionId).toBe(
      "FUTURE",
    );
  });
});
