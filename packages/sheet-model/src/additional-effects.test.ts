import { describe, expect, it } from "vitest";

import { mergeAdditionalEffects } from "./additional-effects";
import type { SheetAdditionalEffect } from "./index";

const effect = (
  text: string,
  provider?: string,
  provenanceId?: string,
): SheetAdditionalEffect => ({
  text,
  source: "authoritative-evaluation",
  ...(provider === undefined ? {} : { provider }),
  ...(provenanceId === undefined ? {} : { provenanceId }),
});

const wall = "whenever you are adjacent to a wall - Back to the Wall.";

describe("mergeAdditionalEffects", () => {
  it("reads one source's paired attack and damage bonus as one line", () => {
    expect(
      mergeAdditionalEffects([
        effect(`+1 to attack rolls ${wall}`, "Back to the Wall", "feat:1"),
        effect(
          "+2 to attack rolls if no ally is closer - Prime Shot.",
          "Prime Shot",
        ),
        effect(`+1 to damage rolls ${wall}`, "Back to the Wall", "feat:2"),
      ]),
    ).toEqual([
      effect(
        `+1 to attack and damage rolls ${wall}`,
        "Back to the Wall",
        "feat:1",
      ),
      effect(
        "+2 to attack rolls if no ally is closer - Prime Shot.",
        "Prime Shot",
      ),
    ]);
  });

  it("names both values when they differ", () => {
    expect(
      mergeAdditionalEffects([
        effect("+1 to attack rolls when charging (Charger).", "Charger"),
        effect("+2 to damage rolls when charging (Charger).", "Charger"),
      ]).map(({ text }) => text),
    ).toEqual([
      "+1 to attack rolls and +2 to damage rolls when charging (Charger).",
    ]);
  });

  it("keeps distinct conditions, sources and unpaired bonuses apart", () => {
    const distinct = [
      effect(`+1 to attack rolls ${wall}`, "Back to the Wall"),
      effect(
        "+1 to damage rolls while bloodied - Back to the Wall.",
        "Back to the Wall",
      ),
      effect("+1 to damage rolls when charging (Charger).", "Charger"),
      effect("+1 to damage rolls when charging (Rager).", "Rager"),
      effect("+1 to attack rolls."),
      effect("+1 to damage rolls."),
    ];
    expect(mergeAdditionalEffects(distinct)).toEqual(distinct);
    const triple = [
      effect("+1 to attack rolls when charging (Charger).", "Charger"),
      effect("+2 to attack rolls when charging (Charger).", "Charger"),
      effect("+1 to damage rolls when charging (Charger).", "Charger"),
    ];
    expect(mergeAdditionalEffects(triple)).toEqual(triple);
  });
});
