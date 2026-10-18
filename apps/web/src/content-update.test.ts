import { describe, expect, it } from "vitest";
import type { ProfileMigrationPreview } from "@4ecb/rules-engine";

import { describeContentUpdate, needsContentUpdate } from "./content-update";

const summary = {
  converged: true,
  complete: true,
  legal: true,
  activeDefinitionCount: 1,
  choiceCount: 0,
  powerCount: 1,
  errorCount: 0,
  warningCount: 0,
};
const power = (fields: Record<string, unknown>) =>
  JSON.stringify({ name: "Second Wind", usage: "Encounter", ...fields });

describe("content update summary", () => {
  it("describes player-visible changes in plain language", () => {
    const preview: ProfileMigrationPreview = {
      sourceAvailable: true,
      referencedDefinitionCount: 3,
      missingDefinitionIds: ["ID_GONE"],
      missingDefinitions: [{ id: "ID_GONE", name: "Old Feat", type: "Feat" }],
      changedDefinitionIds: ["ID_TRAIT"],
      changedDefinitions: [
        { id: "ID_TRAIT", name: "Dwarven Resilience", type: "Racial Trait" },
      ],
      removedSelections: [
        {
          occurrenceId: "occ-dr",
          name: "Dwarven Resilience",
          type: "Power",
          providerName: "Dwarven Resilience",
          providerType: "Racial Trait",
        },
      ],
      source: summary,
      target: summary,
      statChanges: [
        { name: "Hit Points", before: 67, after: 69 },
        { name: "_PER-LEVEL-HPS", before: 5, after: 6 },
      ],
      powerChanges: [
        {
          definitionId: "sw",
          before: power({ actionType: "Standard Action" }),
          after: power({ actionType: "Minor Action" }),
        },
        {
          definitionId: "new",
          after: JSON.stringify({ name: "Fresh Power" }),
        },
        {
          definitionId: "internal-only",
          before: power({ actionType: "Standard Action", other: 1 }),
          after: power({ actionType: "Standard Action", other: 2 }),
        },
      ],
      newDiagnosticCodes: [],
      resolvedDiagnosticCodes: [],
      targetDiagnostics: [],
    };
    expect(describeContentUpdate(preview)).toEqual({
      changes: [
        "Hit points: 67 → 69",
        "Second Wind: standard action → minor action",
        "New power: Fresh Power",
      ],
      missing: ["Old Feat"],
      updatedRules: ["Dwarven Resilience (racial trait)"],
      removals: [
        "Dwarven Resilience (power) — no longer included by Dwarven Resilience (racial trait)",
      ],
      removedOccurrenceIds: ["occ-dr"],
      canUpdate: true,
      changesKnown: true,
    });
  });

  it("flags a character pinned to content other than the active content", () => {
    const active = {
      packId: "corrected",
      contentDigest: "b".repeat(64),
    } as Parameters<typeof needsContentUpdate>[1];
    expect(
      needsContentUpdate({ packId: "old", contentDigest: "a" }, active),
    ).toBe(true);
    expect(
      needsContentUpdate(
        { packId: "corrected", contentDigest: "b".repeat(64) },
        active,
      ),
    ).toBe(false);
    expect(needsContentUpdate(undefined, active)).toBe(false);
  });
});
