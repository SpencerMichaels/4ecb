import { describe, expect, it } from "vitest";
import type { EvaluatedStat } from "@4ecb/rules-engine";

import { provenanceSourceResolver, reminderCovered } from "./reminder-coverage";

describe("reminder coverage", () => {
  it("covers a reminder whose every amount and term a specific entry shows", () => {
    expect(
      reminderCovered("+2 to speed when charging", [
        "+2 to speed when charging",
      ]),
    ).toBe(true);
    expect(
      reminderCovered("On charge, gain +2 to damage and +2 to bull rush", [
        "+2 to bull rush when you charge",
        "+2 to damage rolls when you charge - Synthetic charge.",
      ]),
    ).toBe(true);
    expect(
      reminderCovered("+2 to saving throws when you have no APs", [
        "Saving throws: +2 to saves whenever you have no action points remaining",
      ]),
    ).toBe(true);
  });
  it("keeps a reminder that says more than the entries", () => {
    // A bonus feat and a free action nothing else represents.
    expect(
      reminderCovered(
        "You gain Synthetic Draw as a bonus feat. In addition, you can sheathe a weapon as a free action and gain a +4 bonus to AC against opportunity attacks you provoke by making a ranged attack.",
        [
          "+4 to AC against opportunity attacks you provoke by making a ranged attack",
        ],
      ),
    ).toBe(false);
    // Two +2 bonuses need two represented +2s.
    expect(
      reminderCovered("+2 to attack rolls and +2 to damage when charging", [
        "+2 to damage rolls when you charge",
      ]),
    ).toBe(false);
    // A movement the entries never mention.
    expect(
      reminderCovered("+2 to speed when charging; shift 1 square after", [
        "+2 to speed when charging",
      ]),
    ).toBe(false);
    expect(reminderCovered("+2 to speed when charging", [])).toBe(false);
    // A clause about something else shares few words with the entries.
    expect(
      reminderCovered(
        "Dilettante power becomes at-will; can use AP to regain an encounter attack power",
        [
          "You can spend an action point to regain the use of an encounter attack power that you have already used during this encounter.",
        ],
      ),
    ).toBe(false);
  });
  it("ignores loadout conditions the power cards already apply", () => {
    expect(
      reminderCovered(
        "+5 damage to prone target when using axe or heavy blade",
        ["+5 to damage rolls against a prone target - Synthetic chop."],
      ),
    ).toBe(true);
  });
  it("ignores level-scaling notes", () => {
    expect(
      reminderCovered(
        "You gain a +1 bonus to damage rolls against your sworn foe. The bonus increases to +2 at 11th level and +3 at 21st level.",
        ["+1 to damage rolls against your sworn foe - Synthetic oath."],
      ),
    ).toBe(true);
    expect(
      reminderCovered(
        "+1 to damage against your sworn foe (+2 at 11th level)",
        ["+1 to damage rolls against your sworn foe"],
      ),
    ).toBe(true);
  });
  it("resolves provenance to the granting definition or inventory holding", () => {
    const stats: Record<string, EvaluatedStat> = {
      Speed: {
        name: "Speed",
        value: 6,
        contributions: [
          {
            id: "occurrence:1:0",
            stat: "Speed",
            value: "+2",
            providerId: "occurrence:1",
            providerName: "Synthetic charge",
            applied: false,
            reason: "conditional",
          },
          {
            id: "loot:3:definition:1:0",
            stat: "Speed",
            value: "+1",
            providerId: "loot:3:definition:1",
            providerName: "Synthetic boots",
            applied: false,
            reason: "conditional",
          },
        ],
      },
    };
    const resolve = provenanceSourceResolver(stats, [
      {
        id: "occurrence:1",
        definitionId: "Feat:Charge",
        acquiredLevel: 1,
        kind: "choice",
      },
    ]);
    expect(resolve("occurrence:1:0")).toEqual(["def:feat:charge"]);
    expect(resolve("loot:3:definition:1:0")).toEqual(["inv:loot:3"]);
    // A special card's provider id resolves without a contribution.
    expect(resolve("loot:7:definition:0")).toEqual(["inv:loot:7"]);
    expect(resolve(undefined)).toEqual([]);
  });
});
