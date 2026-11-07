import { readProseBonuses } from "@4ecb/content-domain";
import { describe, expect, it } from "vitest";

import { parseD20Rules } from "./parser";

const escape = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;");

/** One record from synthetic XML written the way real records are. */
function record(body: string, type = "Feat") {
  const parsed = parseD20Rules(
    `<D20Rules game-system="D&amp;D4E"><RulesElement internal-id="ID_TEST_PROSE" name="Test Prose" type="${type}" source="Synthetic">${body}</RulesElement></D20Rules>`,
    "test.xml",
  );
  return parsed.entities.find(({ id }) => id === "ID_TEST_PROSE")!;
}

const statadd = (attributes: string) => `<statadd ${attributes} />`;
const rules = (...statadds: string[]) => `<rules>${statadds.join("")}</rules>`;
const specific = (name: string, value: string) =>
  `<specific name="${name}">${escape(value)}</specific>`;

/** Each stored bonus as "text [targets]". */
function bonuses(body: string, type?: string): string[] {
  return readProseBonuses(record(body, type).specifics).map(
    ({ text, targets }) =>
      `${text} [${targets
        .map((target) =>
          "name" in target ? `${target.kind}:${target.name}` : target.kind,
        )
        .join(", ")}]`,
  );
}

describe("prose bonuses (pack build)", () => {
  it("stores a feat's prose-only conditional skill bonus", () => {
    expect(
      bonuses(
        "You gain a +5 feat bonus to Arcana, Insight, History, and Dungeoneering checks as they relate to aberrant creatures or their works.",
      ),
    ).toEqual([
      "+5 feat bonus to Arcana, Insight, History, and Dungeoneering checks as they relate to aberrant creatures or their works [skill:Arcana, skill:Insight, skill:History, skill:Dungeoneering]",
    ]);
  });

  it("leaves out what the record's own statadds carry", () => {
    // A flat statadd of the same stat, amount and type, and a conditional
    // save statadd: Fey Senses.
    expect(
      bonuses(
        "You gain a +2 feat bonus to Perception and a +2 racial bonus to saving throws against charm effects." +
          rules(
            statadd('name="Perception Misc" value="+2" type="Feat"'),
            statadd(
              'name="Saving Throws" value="+2" type="Racial" condition="against charm effects"',
            ),
          ),
      ),
    ).toEqual([]);
    // The flat part is carried; the conditional clause is prose only.
    expect(
      bonuses(
        "You gain a +3 feat bonus to Perception checks and to checks made to avoid becoming lost, such as Intelligence checks made against a maze spell." +
          rules(statadd('name="Perception Misc" value="+3" type="Feat"')),
      ),
    ).toEqual([
      "+3 feat bonus to checks made to avoid becoming lost, such as Intelligence checks made against a maze spell [checks:Checks]",
    ]);
    // A list whose last target has the condition: only that one is new.
    expect(
      bonuses(
        "You gain a +2 bonus to initiative checks, Perception checks, and to saving throws against poison." +
          rules(
            statadd('name="Initiative Misc" value="+2"'),
            statadd('name="Perception Misc" value="+2"'),
          ),
        "Class Feature",
      ),
    ).toEqual(["+2 bonus to saving throws against poison [saving-throws]"]);
  });

  it("counts a statadd routed through the record's own stat as carrying it", () => {
    expect(
      bonuses(
        "You gain a +1 bonus to AC while you are not wearing heavy armor." +
          rules(
            statadd('name="Arena Training" value="+1"'),
            statadd(
              'name="AC" value="+Arena Training" not-wearing="armor:heavy"',
            ),
          ),
        "Class Feature",
      ),
    ).toEqual([]);
  });

  it("does not take a different bonus type's statadd for the prose bonus", () => {
    expect(
      bonuses(
        specific(
          "Property",
          "Gain a +2 item bonus to all defenses against attacks made by shapechangers.",
        ) +
          rules(
            statadd('name="Fortitude Defense" value="+2" type="Enhancement"'),
            statadd('name="Reflex Defense" value="+2" type="Enhancement"'),
            statadd('name="Will Defense" value="+2" type="Enhancement"'),
          ),
        "Magic Item",
      ),
    ).toEqual([
      "+2 item bonus to all defenses against attacks made by shapechangers [defense:AC, defense:Fortitude, defense:Reflex, defense:Will]",
    ]);
  });

  it("moves a leading condition after the bonus", () => {
    expect(
      bonuses(
        specific(
          "Property",
          "When you are standing on a surface of stone or earth, you gain a +2 item bonus to Athletics checks and Strength ability checks (but not Strength-based attacks).",
        ) + rules(statadd('name="Athletics Misc" value="+2" type="item"')),
        "Magic Item",
      ),
    ).toEqual([
      "+2 item bonus to Strength ability checks (but not Strength-based attacks) when you are standing on a surface of stone or earth [checks:Strength checks]",
    ]);
  });

  it("keeps resistances and saves for the defensive traits", () => {
    expect(
      bonuses("You gain resist 2 to all damage while you are bloodied."),
    ).toEqual([
      "resist 2 to all damage while you are bloodied [resist:all damage]",
    ]);
    // Legacy writes a conditional resistance as a stat of its own.
    expect(
      bonuses(
        specific(
          "Property",
          "Gain resist 5 to all damage from the attacks of tieflings or devils.",
        ) + rules(statadd('name="resist:tieflings" value="+5" type="resist"')),
        "Magic Item",
      ),
    ).toEqual([]);
  });

  it("skips triggered, temporary and other creatures' bonuses", () => {
    for (const text of [
      "When you use your second wind, you gain a +5 bonus to saving throws until the end of your next turn.",
      "When you spend an action point to take an extra action, you also gain a +2 bonus to all defenses against creatures marked by you.",
      "Your beast companion gains a +2 bonus to saving throws.",
      "Each ally adjacent to you gains a +2 shield bonus to Reflex defense against close and area attacks.",
      "While you are mounted on a natural beast, the mount gains a +2 feat bonus to speed and a +1 feat bonus to AC.",
      "When you use your iron mind racial power, you gain a +4 bonus to all defenses, instead of +2.",
      "Add religion to your class skill list and gain a +2 bonus to checks with that skill.",
      "You gain a +2 feat bonus to the speed of any mount you are riding.",
    ])
      expect(bonuses(text), text).toEqual([]);
  });

  it("skips a flat prose bonus with no condition", () => {
    // Missing content, not a situation: the stat line would be wrong.
    expect(
      bonuses("You gain a +2 bonus to Bluff checks and Insight checks."),
    ).toEqual([]);
  });

  it("reads a feature's note only when its full text has no bonus", () => {
    expect(
      bonuses(
        "Thanks to the tome, you have all but mastered your studies." +
          specific(
            "Short Description",
            "You gain a +4 bonus to skill checks involving necromancy, nethermancy, and the Shadowfell and a +1 bonus to attack rolls with shadow powers.",
          ),
        "Class Feature",
      ),
    ).toEqual([
      "+4 bonus to skill checks involving necromancy, nethermancy, and the Shadowfell [checks:Skill checks]",
    ]);
  });

  it("parses a background only when it implements its own benefit", () => {
    const benefit = specific(
      "Benefit",
      "You gain a +3 bonus to Nature checks made to recall useful information about geography.",
    );
    // A choice of benefits: the chosen Background Choice carries it.
    expect(
      bonuses(
        benefit +
          '<rules><grant name="ID_INTERNAL_BACKGROUND_ASSOCIATION_NATURE" type="Background Association" /></rules>',
        "Background",
      ),
    ).toEqual([]);
    expect(
      bonuses(
        benefit +
          '<rules><modify name="Nature" type="Skill Training" Field="UniversalClassSkill" value="true" /></rules>',
        "Background",
      ),
    ).toEqual([
      "+3 bonus to Nature checks made to recall useful information about geography [skill:Nature]",
    ]);
  });

  it("ignores an item's power text", () => {
    expect(
      bonuses(
        specific(
          "Power",
          "Daily (Minor Action): You gain a +2 bonus to all defenses while you are bloodied.",
        ),
        "Magic Item",
      ),
    ).toEqual([]);
  });
});
