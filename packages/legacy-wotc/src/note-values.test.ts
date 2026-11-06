import {
  NOTE_VALUES_FIELD,
  readNoteValues,
  type NoteSegment,
  type NoteValueTerm,
} from "@4ecb/content-domain";
import { describe, expect, it } from "vitest";

import { parseD20Rules } from "./parser";

const escape = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;");

/** One record from synthetic XML written the way real records are. */
function record(body: string, type = "Feat") {
  const parsed = parseD20Rules(
    `<D20Rules game-system="D&amp;D4E"><RulesElement internal-id="ID_TEST_NOTE" name="Test Note" type="${type}" source="Synthetic">${body}</RulesElement></D20Rules>`,
    "test.xml",
  );
  return parsed.entities.find(({ id }) => id === "ID_TEST_NOTE")!;
}

const short = (text: string) =>
  `<specific name="Short Description">${escape(text)}</specific>`;

/** The segments as text: a value in «», its terms as a compact list. */
function term(value: NoteValueTerm): string {
  switch (value.kind) {
    case "flat":
      return String(value.value);
    case "dice":
      return `${value.count}${value.die}`;
    case "tier":
      return value.values.map(term).join("/");
    case "per-tier":
      return `${term(value.value)} per tier`;
    case "half-level":
      return "half level";
    case "ability":
      return value.abilities.join(" or ");
  }
}
function shown(segments: readonly NoteSegment[] | undefined): string {
  return (segments ?? [])
    .map((segment) => {
      if (segment.kind === "text") return segment.text;
      if (segment.kind === "applied") return "⟦applied⟧";
      const { terms, steps, signed } = segment.value;
      const steps_ = (steps ?? [])
        .map(
          (step) =>
            ` | ${step.add ? "+" : ""}${step.terms.map(term).join(" + ")} @${step.level}`,
        )
        .join("");
      return `«${signed ? "±" : ""}${terms.map(term).join(" + ")}${steps_}»`;
    })
    .join("");
}

function note(body: string, text: string, type?: string) {
  return shown(readNoteValues(record(body, type).specifics, text)?.segments);
}

describe("feature note values (D112)", () => {
  it("reads tier tables, per-tier multiples and ability modifiers", () => {
    const text = "+1/+2/+3 (by tier) to damage with cold or necrotic powers";
    expect(note(short(text), text)).toBe(
      "«±1/2/3» to damage with cold or necrotic powers",
    );
    const perTier = "Gain +1 damage per tier with weapon attacks when Unarmed";
    expect(note(short(perTier), perTier)).toBe(
      "Gain «±1 per tier» damage with weapon attacks when Unarmed",
    );
    const ability =
      "Shift your Dex modifier in squares; gain Con or Int modifier temp hp";
    expect(note(short(ability), ability)).toBe(
      "Shift «Dexterity» squares; gain «Constitution or Intelligence» temp hp",
    );
    const bracketed = "Use Blood Drinker: gain 5 + [Cha mod] temp hp";
    expect(note(short(bracketed), bracketed)).toBe(
      "Use Blood Drinker: gain «5 + Charisma» temp hp",
    );
    const half = "Gain resistance to poison (5 + one-half your level);";
    expect(note(short(half), half)).toBe(
      "Gain resistance to poison («5 + half level»);",
    );
    const slash =
      "Gain 1/2 level + Con modifier temp hp when you use daily attack power";
    expect(note(short(slash), slash)).toBe(
      "Gain «half level + Constitution» temp hp when you use daily attack power",
    );
  });

  it("attaches level steps to the value before them", () => {
    const replaced =
      "Deal 2 + Dex mod extra damage if oath target moves away. (4 + Dex mod at 11th level, 6 + Dex mod at 21st)";
    expect(note(short(replaced), replaced)).toBe(
      "Deal «2 + Dexterity | 4 + Dexterity @11 | 6 + Dexterity @21» extra damage if oath target moves away.",
    );
    const added =
      "Swift charge power; temporary hp equal to Con mod (+5 at 11th, +10 at 21st) when you drop enemy to 0 hp";
    expect(note(short(added), added)).toBe(
      "Swift charge power; temporary hp equal to «Constitution | +5 @11 | +10 @21» when you drop enemy to 0 hp",
    );
    const flat =
      "+1 to attacks with weapons and implements of your choice (+2 at 11th, +3 at 21st level)";
    expect(note(short(flat), flat)).toBe(
      "«±1 | 2 @11 | 3 @21» to attacks with weapons and implements of your choice",
    );
    const epic = "+2 (+3 at epic) damage with fire or radiant attack prayers";
    expect(note(short(epic), epic)).toBe(
      "«±2 | 3 @21» damage with fire or radiant attack prayers",
    );
    const or =
      "Deal 1d6 extra damage against prone targets, or 2d6 at level 21.";
    expect(note(short(or), or)).toBe(
      "Deal «1d6 | 2d6 @21» extra damage against prone targets.",
    );
    const increase =
      "When you take fire damage, each enemy adjacent to you takes 5 fire damage. (Increase to 10 at Level 21)";
    expect(note(short(increase), increase)).toBe(
      "When you take fire damage, each enemy adjacent to you takes «5 | 10 @21» fire damage.",
    );
  });

  it("leaves other creatures' and substituted modifiers alone", () => {
    for (const text of [
      "Use Strength modifier for AC",
      "Use Str modifier instead of Cha modifier for divine challenge damage",
      "While not wearing heavy armor, use Con mod in place of Dex or Int mod to determine AC",
      "Gain bonus equal to half Cha + Wis mod to the next attack roll",
      "Gain twice your Con mod temp hp",
      "Ally adds its Con modifier to damage",
      "Deal damage equal to that power's relevant ability modifier",
      "+2 to death saving throws",
    ])
      expect(
        record(short(text)).specifics.some(
          ({ name }) => name === NOTE_VALUES_FIELD,
        ),
      ).toBe(false);
  });

  it("fills a bonus the note leaves to the full text", () => {
    const text =
      "Encounter, free; with tome, creatures summoned gain a bonus to damage rolls.";
    const body = `Once per encounter, as a free action, if you use your tome when using an arcane summoning power, all creatures summoned by that power gain a bonus to damage rolls equal to your Constitution modifier.${short(text)}`;
    expect(note(body, text, "Class Feature")).toBe(
      "Encounter, free; with tome, creatures summoned gain a «±Constitution» bonus to damage rolls.",
    );
  });

  it("marks a clause the record's unconditional stat additions apply", () => {
    const text =
      "+2/+3/+4 (by tier) to Will; make saving throw to end stunned or dazed at start of your turn even if not (save ends) effect";
    const rules = `<rules><statadd name="Superior Will" value="+2" /><statadd name="Superior Will" value="+1" requires="Paragon Tier" /><statadd name="Superior Will" value="+1" requires="Epic Tier" /><statadd name="Will Defense" value="+Superior Will" type="Feat" /></rules>`;
    expect(note(`${short(text)}${rules}`, text)).toBe(
      "⟦applied⟧make saving throw to end stunned or dazed at start of your turn even if not (save ends) effect",
    );
    // A conditional addition (holding a rod) is not on the sheet unasked.
    const rod = "+1 to AC; +2 to saving throws";
    const conditional = `<rules><statadd name="AC" value="+1" requires="WearingRod" /></rules>`;
    expect(
      record(`${short(rod)}${conditional}`).specifics.some(
        ({ name }) => name === NOTE_VALUES_FIELD,
      ),
    ).toBe(false);
  });

  it("parses the sheet override before its @", () => {
    const body = `${short("You gain a bonus to damage rolls.")}<specific name="_CS_ShortDescription">+1/+2/+3 (by tier) damage@Paragon Feature</specific>`;
    expect(note(body, "+1/+2/+3 (by tier) damage", "Class Feature")).toBe(
      "«±1/2/3» damage",
    );
  });
});
