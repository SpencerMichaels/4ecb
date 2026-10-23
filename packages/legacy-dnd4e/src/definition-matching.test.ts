import { describe, expect, it } from "vitest";

import { isCharacterRecord, newCharacterRecord } from "@4ecb/character-domain";
import type { ContentEntity } from "@4ecb/content-domain";
import {
  evaluateCharacter,
  projectBuildForEvaluation,
} from "@4ecb/rules-engine";

import {
  compareEditedDnd4eRoundTrip,
  exportEditedDnd4e,
  importDnd4e,
  matchableName,
  projectBuildForLegacyExport,
} from ".";

function entity(
  id: string,
  name: string,
  type: string,
  grants: readonly {
    readonly name: string;
    readonly type: string;
    readonly level?: number;
  }[] = [],
): ContentEntity {
  return {
    id,
    name,
    type,
    source: "Public test fixture",
    sources: ["Public test fixture"],
    attributes: [],
    categories: [],
    specifics: [],
    rules: grants.map((grant, ordinal) => ({
      name: "grant",
      attributes: [
        { name: "name", value: grant.name },
        { name: "type", value: grant.type },
        ...(grant.level === undefined
          ? []
          : [{ name: "level", value: String(grant.level) }]),
      ],
      text: "",
      children: [],
      ordinal,
    })),
    description: "",
    extensions: [],
    provenance: { sourceKey: "name-matching-test", sourceOrdinal: 0 },
  };
}

/** Our content: the same theme, feature and power under different IDs. */
const content: readonly ContentEntity[] = [
  entity("L1", "1", "Level"),
  entity("RULES", "Expansion Rules", "Rules"),
  entity("OUR_THEME", "Ghost of the Past", "Theme", [
    { name: "OUR_START", type: "Class Feature" },
    { name: "OUR_L5", type: "Class Feature", level: 5 },
  ]),
  entity(
    "OUR_START",
    "Level 1 Ghost of the Past Starting Feature",
    "Class Feature",
    [{ name: "OUR_POWER", type: "Power" }],
  ),
  entity("OUR_L5", "Level 5 Ghost of the Past Feature", "Class Feature"),
  entity("OUR_POWER", "Guidance of the Past", "Power"),
  entity("OUR_STYLE", "Archery   Style", "Class Feature"),
  entity("OUR_RYE", "Smith &amp; Rye", "Magic Item"),
  entity("OUR_STONE", "Ioun Stone of Insight", "Magic Item"),
  entity("OUR_SHIRT", "Chain Shirt", "Armor"),
  entity("TWIN_A", "Twin Knack", "Class Feature"),
  entity("TWIN_B", "Twin Knack", "Class Feature"),
];

/** A character saved with another source's IDs for the same records. */
const xml = `<?xml version="1.0"?>
<D20Character game-system="D&amp;D4E">
  <CharacterSheet>
    <RulesElementTally>
      <RulesElement name="Ghost of the Past Starting Feature" type="Class Feature" internal-id="THEIR_START"><specific name="Level"> 1 </specific></RulesElement>
      <RulesElement name="Ghost of the Past Level 5 Feature" type="Class Feature" internal-id="THEIR_L5"><specific name="Level"> 5 </specific></RulesElement>
    </RulesElementTally>
  </CharacterSheet>
  <textstring name="THEIR_STONE">Given</textstring>
  <textstring name="LOOTNOTE_THEIR_SHIRT__THEIR_RYE__Smith &amp; Rye Chain Shirt">Polished</textstring>
  <Level>
    <RulesElement name="1" type="Level" internal-id="L1" charelem="l1">
      <RulesElement name="Expansion Rules" type="Rules" internal-id="RULES" charelem="rules">
        <RulesElement name="Ghost of  the PAST" type="Theme" internal-id="THEIR_THEME" charelem="theme">
          <RulesElement name="Ghost of the Past Starting Feature" type="Class Feature" internal-id="THEIR_START" charelem="start">
            <RulesElement name="Guidance of the Past" type="Power" internal-id="THEIR_POWER" charelem="power"/>
          </RulesElement>
          <RulesElement name="Ghost of the Past Level 5 Feature" type="Class Feature" internal-id="THEIR_L5" charelem="l5"/>
        </RulesElement>
        <RulesElement name="Archery Style" type="Class Feature" internal-id="THEIR_STYLE" charelem="style"/>
        <RulesElement name="Twin Knack" type="Class Feature" internal-id="THEIR_TWIN" charelem="twin"/>
        <RulesElement name="Homebrew Knack" type="Class Feature" internal-id="THEIR_HOMEBREW" charelem="homebrew"/>
      </RulesElement>
    </RulesElement>
    <loot count="1" equip-count="1">
      <RulesElement name="Chain Shirt" type="Armor" internal-id="THEIR_SHIRT"/>
      <RulesElement name="Smith &amp; Rye" type="Magic Item" internal-id="THEIR_RYE"/>
    </loot>
    <loot count="1" equip-count="0">
      <RulesElement name="Ioun Stone of Insight" type="Magic Item" internal-id="THEIR_STONE"/>
    </loot>
  </Level>
  <Grabbag>
    <RulesElement name="Archery Style" type="Class Feature" internal-id="THEIR_STYLE" charelem="bag"/>
  </Grabbag>
  <alternate name="Ghost of the Past" type="Theme" internal-id="THEIR_THEME" SelectName="Swap">
    <RulesElement name="Guidance of the Past" type="Power" internal-id="THEIR_POWER" charelem="alt"/>
  </alternate>
</D20Character>`;

describe("matching missing content by name on import", () => {
  it("normalizes entities, whitespace and case the same on both sides", () => {
    expect(matchableName("Smith &amp; Rye")).toBe(matchableName("smith & rye"));
    expect(matchableName(" Archery\n  Style ")).toBe("archery style");
    expect(matchableName("Caf&#233;")).toBe(matchableName("Café"));
  });

  it("leaves the build untouched without content", () => {
    const imported = importDnd4e(xml);
    expect(imported.report.definitionMatching).toBeUndefined();
    expect(
      imported.build.levels[0]?.root.children[0]?.children[0]?.identity,
    ).toMatchObject({ definitionId: "THEIR_THEME" });
  });

  it("uses the one same-named record everywhere the build names one", () => {
    const imported = importDnd4e(xml, { matchMissingDefinitionsIn: content });
    const rules = imported.build.levels[0]!.root.children[0]!;
    const theme = rules.children[0]!;
    expect(theme.identity).toEqual({
      definitionId: "OUR_THEME",
      name: "Ghost of  the PAST",
      type: "Theme",
      importedDefinitionId: "THEIR_THEME",
    });
    expect(theme.children[0]?.children[0]?.identity).toMatchObject({
      definitionId: "OUR_POWER",
      importedDefinitionId: "THEIR_POWER",
    });
    expect(rules.children[1]?.identity).toMatchObject({
      definitionId: "OUR_STYLE",
      importedDefinitionId: "THEIR_STYLE",
    });
    // Grab bag, alternates, loot base and enchantment.
    expect(imported.build.grabbag[0]?.identity.definitionId).toBe("OUR_STYLE");
    expect(imported.build.alternates[0]?.provider).toMatchObject({
      definitionId: "OUR_THEME",
      importedDefinitionId: "THEIR_THEME",
    });
    expect(imported.build.alternates[0]?.choice.identity.definitionId).toBe(
      "OUR_POWER",
    );
    expect(
      imported.build.inventory.flatMap((entry) =>
        entry.elements.map((element) => element.definitionId),
      ),
    ).toEqual(["OUR_SHIRT", "OUR_RYE", "OUR_STONE"]);
    // Text strings keyed by a record's ID follow it.
    expect(imported.build.textStrings).toMatchObject({
      OUR_STONE: "Given",
      "LOOTNOTE_OUR_SHIRT__OUR_RYE__Smith & Rye Chain Shirt": "Polished",
    });
    expect(imported.build.textStrings).not.toHaveProperty("THEIR_STONE");
    // The record stays storable.
    expect(
      isCharacterRecord(
        newCharacterRecord(
          imported.envelope,
          imported.snapshot,
          imported.build,
        ),
      ),
    ).toBe(true);
  });

  it("lines a matched parent's renamed children up with its grants by level", () => {
    const imported = importDnd4e(xml, { matchMissingDefinitionsIn: content });
    const theme = imported.build.levels[0]!.root.children[0]!.children[0]!;
    expect(theme.children.map((child) => child.identity)).toEqual([
      {
        definitionId: "OUR_START",
        name: "Ghost of the Past Starting Feature",
        type: "Class Feature",
        importedDefinitionId: "THEIR_START",
      },
      {
        definitionId: "OUR_L5",
        name: "Ghost of the Past Level 5 Feature",
        type: "Class Feature",
        importedDefinitionId: "THEIR_L5",
      },
    ]);
    expect(imported.report.definitionMatching?.matched).toContainEqual({
      savedId: "THEIR_START",
      savedName: "Ghost of the Past Starting Feature",
      type: "Class Feature",
      definitionId: "OUR_START",
      definitionName: "Level 1 Ghost of the Past Starting Feature",
      basis: "grant",
      grantedBy: "OUR_THEME",
    });
  });

  it("does not grant a matched child twice or leave it missing", () => {
    const imported = importDnd4e(xml, { matchMissingDefinitionsIn: content });
    const evaluation = evaluateCharacter(
      projectBuildForEvaluation(imported.build, content),
      content,
    );
    const missing = evaluation.diagnostics.flatMap((diagnostic) =>
      diagnostic.code === "occurrence.missing-definition"
        ? [diagnostic.message]
        : [],
    );
    expect(missing).toEqual([
      "Missing content definition THEIR_TWIN",
      "Missing content definition THEIR_HOMEBREW",
    ]);
    const level1 = evaluation.occurrences.filter(
      (occurrence) => occurrence.definitionId === "OUR_START",
    );
    expect(level1).toHaveLength(1);
    expect(
      evaluation.occurrences.filter(
        (occurrence) =>
          occurrence.definitionId === "OUR_POWER" &&
          occurrence.parentId === level1[0]?.id,
      ),
    ).toHaveLength(1);
  });

  it("reports ambiguous and unmatched records and never guesses", () => {
    const imported = importDnd4e(xml, { matchMissingDefinitionsIn: content });
    const twin = imported.build.levels[0]!.root.children[0]!.children[2]!;
    expect(twin.identity).toEqual({
      definitionId: "THEIR_TWIN",
      name: "Twin Knack",
      type: "Class Feature",
    });
    expect(imported.report.definitionMatching?.ambiguous).toEqual([
      {
        savedId: "THEIR_TWIN",
        savedName: "Twin Knack",
        type: "Class Feature",
        candidateIds: ["TWIN_A", "TWIN_B"],
      },
    ]);
    expect(imported.report.definitionMatching?.unmatched).toEqual([
      {
        savedId: "THEIR_HOMEBREW",
        savedName: "Homebrew Knack",
        type: "Class Feature",
        candidateIds: [],
      },
    ]);
    expect(
      imported.report.diagnostics.find(
        (diagnostic) => diagnostic.code === "definitions.ambiguous-name",
      ),
    ).toMatchObject({ severity: "warning" });
    expect(
      imported.report.definitionMatching?.matched.map(
        (match) => `${match.savedId}->${match.definitionId}:${match.basis}`,
      ),
    ).toEqual([
      "THEIR_THEME->OUR_THEME:name",
      "THEIR_POWER->OUR_POWER:name",
      "THEIR_STYLE->OUR_STYLE:name",
      "THEIR_SHIRT->OUR_SHIRT:name",
      "THEIR_RYE->OUR_RYE:name",
      "THEIR_STONE->OUR_STONE:name",
      "THEIR_START->OUR_START:grant",
      "THEIR_L5->OUR_L5:grant",
    ]);
  });

  it("exports the matched IDs and re-imports to the same build", () => {
    const imported = importDnd4e(xml, { matchMissingDefinitionsIn: content });
    const evaluation = evaluateCharacter(
      projectBuildForEvaluation(imported.build, content),
      content,
    );
    const exported = exportEditedDnd4e({
      target: "legacy-builder-0.07a",
      envelope: imported.envelope,
      snapshot: imported.snapshot,
      build: imported.build,
      evaluation,
      content,
    });
    expect(exported).toContain('internal-id="OUR_THEME"');
    expect(exported).not.toContain('internal-id="THEIR_THEME"');
    expect(exported).not.toContain('internal-id="THEIR_START"');
    expect(
      compareEditedDnd4eRoundTrip(
        projectBuildForLegacyExport(imported.build),
        importDnd4e(exported).build,
      ).equivalent,
    ).toBe(true);
  });
});
