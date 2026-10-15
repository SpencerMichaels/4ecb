import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildSheetModel } from "@4ecb/sheet-model";
import {
  SheetOverview,
  fittingReminderIndices,
  fittingReminderGroups,
  fittingSummaryPaneCount,
  fittingIdentityNameSize,
  basicAttackReferencePage,
  overviewBasicAttackRows,
  overviewTrackingRows,
  sortedTrackingRows,
  paginateReferences,
  referenceParts,
  summaryContinuationEntries,
  type ReferenceEntry,
} from "./SheetOverview";

const model = buildSheetModel({
  details: { name: "Overview fixture", Level: "8" },
  abilities: { Strength: 19 },
  stats: { "Hit Points": "72", "Healing Surges": "8" },
  selectedRules: [],
  textStrings: {},
  loot: [],
  powers: [],
  levelCount: 8,
  source: "legacy-cache",
});
describe("real-data sheet overview", () => {
  it("provides ten encounter tracking marks per power row", () => {
    const html = renderToStaticMarkup(
      <SheetOverview
        model={{
          ...model,
          powers: ["Alpha", "Beta"].map((name) => ({
            name,
            kind: "power" as const,
            usage: "Encounter",
            actionType: "Standard",
            fields: [],
          })),
        }}
        name="Fixture"
        portrait={undefined}
        paper="letter"
        monochrome={false}
        blankHP={false}
      />,
    );
    const table = html
      .split('class="sp-usage-table"')[1]!
      .split("</table>")[0]!;
    expect(table.match(/<col\//g)).toHaveLength(11);
    expect(table).not.toContain("<thead");
    expect(table.match(/class="ov-encounter-box"/g)).toHaveLength(20);
  });
  it("puts session/date and compact identity in the scratchpad running header", () => {
    const html = renderToStaticMarkup(
      <SheetOverview
        model={{
          ...model,
          identity: [
            { label: "Race", value: "Dwarf" },
            { label: "Class", value: "Paladin" },
            { label: "Level", value: "7" },
          ],
        }}
        name="Ingi"
        portrait={undefined}
        paper="letter"
        monochrome={false}
        blankHP={false}
      />,
    );
    const header = html
      .split('class="sp-running-header ov-scratch-header"')[1]!
      .split("</header>")[0]!;
    expect(header).toContain("Ingi · Dwarf Paladin 7");
    expect(header).toContain(
      'class="ov-scratch-header-details"> · Dwarf Paladin 7</span>',
    );
    expect(header).toContain("<span>Play scratchpad</span>");
    expect(header).toContain(
      'class="ov-scratch-header-session">Session / date',
    );
    expect(html).not.toContain("ov-scratch-session");
  });
  it("matches scratchpad health reference values to the four summary cells", () => {
    const html = renderToStaticMarkup(
      <SheetOverview
        model={model}
        name="Fixture"
        portrait={undefined}
        paper="letter"
        monochrome={false}
        blankHP={false}
      />,
    );
    const cells = html
      .split('class="sp-values ov-scratch-health-values"')[1]!
      .split('<div class="sp-hp-writing">')[0]!;
    expect(
      [...cells.matchAll(/<span>(.*?)<\/span>/g)].map((match) => match[1]),
    ).toEqual(["Max HP", "Bloodied", "Surges", "Surge HP"]);
    expect(cells).toContain(
      `<span>Surges</span><strong>${model.resources.find((value) => value.label === "Healing Surges")!.value}</strong>`,
    );
    const ap = html
      .split('class="ov-action-point-count"')[1]!
      .split("</div>")[0]!;
    expect(ap.match(/lucide-circle/g)).toHaveLength(3);
    expect(ap).not.toContain("<i");
    const death = html.split('class="sp-death-saves"')[1]!.split("</div>")[0]!;
    expect(death.indexOf("lucide-skull")).toBeLessThan(
      death.indexOf("Death saves"),
    );
  });
  it("sorts tracking powers by action, explicit utility type, then name without mutating input", () => {
    const rows = [
      {
        id: "reaction",
        name: "A reaction",
        action: "Immediate Reaction",
        usage: "Daily",
      },
      {
        id: "utility",
        name: "A utility",
        action: "Standard Action",
        usage: "Daily",
        utility: true,
      },
      { id: "z", name: "Z attack", action: "Standard", usage: "Daily" },
      { id: "a", name: "a attack", action: "Standard", usage: "Daily" },
      { id: "minor", name: "Minor", action: "Minor Action", usage: "Daily" },
      { id: "move", name: "Move", action: "Move Action", usage: "Daily" },
      { id: "free", name: "Free", action: "Free Action", usage: "Daily" },
      { id: "none", name: "No action", action: "No Action", usage: "Daily" },
      {
        id: "interrupt",
        name: "B interrupt",
        action: "Immediate Interrupt",
        usage: "Daily",
      },
      {
        id: "opportunity",
        name: "C opportunity",
        action: "Opportunity Action",
        usage: "Daily",
      },
      { id: "unknown", name: "Unknown", action: "", usage: "Daily" },
    ];
    const original = [...rows];
    expect(sortedTrackingRows(rows).map((row) => row.id)).toEqual([
      "a",
      "z",
      "utility",
      "move",
      "minor",
      "free",
      "none",
      "reaction",
      "interrupt",
      "opportunity",
      "unknown",
    ]);
    expect(rows).toEqual(original);
  });

  it("recognizes utility tracking powers only from explicit power and item metadata", () => {
    const rows = overviewTrackingRows({
      ...model,
      powers: [
        {
          name: "Divine Challenge",
          kind: "power",
          usage: "Encounter",
          fields: [],
        },
        {
          name: "Utility",
          kind: "power",
          usage: "Daily",
          fields: [{ label: "Power Type", value: "Utility" }],
        },
      ],
      overview: {
        ...model.overview!,
        inventory: [
          {
            name: "Charm",
            quantity: 1,
            equipped: 0,
            slots: [],
            fields: [
              {
                label: "Utility Power (Daily)",
                value: "Minor Action. Effect: Test.",
              },
              {
                label: "Power",
                value: "Utility Power (Encounter): Free Action. Effect: Test.",
              },
            ],
          },
        ],
      },
    });
    expect(rows.map((row) => Boolean(row.utility))).toEqual([
      false,
      true,
      true,
      true,
    ]);
  });

  it("continues only omitted reminders in category order, retaining all benefits", () => {
    const values = [
      {
        label: "Item (heroic tier)",
        category: "Item properties" as const,
        value: "First benefit.\n\nSecond benefit.",
        elements: ["First benefit.", "Second benefit."],
      },
      {
        label: "Visible feat",
        category: "Feats" as const,
        value: "Already on page one.",
      },
      {
        label: "Class reminder",
        category: "Class features" as const,
        value: "Still needs space.",
      },
    ];
    const entries = summaryContinuationEntries(values, [1]);
    expect(entries.map((entry) => entry.name)).toEqual([
      "Class reminder",
      "Item",
    ]);
    expect(entries[1]!.parts.map((part) => part.block)).toEqual([
      { kind: "list", ordered: false, items: ["First benefit."] },
      { kind: "list", ordered: false, items: ["Second benefit."] },
    ]);
    expect(summaryContinuationEntries(values, [0, 1, 2])).toEqual([]);
    expect(summaryContinuationEntries([], [])).toEqual([]);
  });
  it("bullets distinct reminder elements without splitting paragraphs into new bullets", () => {
    const first =
      "When you defend, gain a benefit.\n\nYou may apply it to an ally.";
    const second = "Whenever you shift, gain another benefit.";
    const html = renderToStaticMarkup(
      <SheetOverview
        model={{
          ...model,
          overview: {
            ...model.overview!,
            reminders: [
              {
                label: "Synthetic weapon",
                value: `${first}\n\n${second}`,
                elements: [first, second],
                category: "Item properties",
              },
            ],
          },
        }}
        name="Fixture"
        portrait={undefined}
        paper="letter"
        monochrome={false}
        blankHP={false}
      />,
    );
    const summary = html
      .split('aria-label="Character summary"')[1]!
      .split('class="ov-reminder-probe"')[0]!;
    const list = summary
      .split('<ul class="ov-reminder-elements">')[1]!
      .split("</ul>")[0]!;
    expect(list.match(/<li>/g)).toHaveLength(2);
    expect(list.match(/class="prose-paragraph"/g)).toHaveLength(3);
    expect(list.split("</li>")[0]).toContain("You may apply it to an ally.");
  });
  it("keeps expanded core-power descriptions off page one but available in references", () => {
    const short = {
      label: "Existing bonus",
      value: "+1d6 against your chosen foe.",
      category: "Class features" as const,
    };
    const expanded = {
      label: "Core power description",
      value: "A long ongoing target-dependent mechanical description.",
      category: "Class features" as const,
    };
    const html = renderToStaticMarkup(
      <SheetOverview
        model={{
          ...model,
          overview: {
            ...model.overview!,
            reminders: [short, expanded],
            summaryReminders: [short],
          },
        }}
        name="Fixture"
        portrait={undefined}
        paper="letter"
        monochrome={false}
        blankHP={false}
      />,
    );
    const summary = html
      .split('aria-label="Character summary"')[1]!
      .split("</article>")[0]!;
    expect(summary).toContain("Existing bonus");
    expect(summary).not.toContain("Core power description");
    expect(summary.split('class="ov-reminder-probe"')[0]).not.toContain(
      "more reminders in references.",
    );
    expect(html).toContain(expanded.value);
  });
  it("finds the actual reference-page label for basic attack alternatives", () => {
    const entry: ReferenceEntry = {
      id: "basic:test",
      name: "Test attack",
      group: "Basic attack alternatives",
      source: "",
      parts: [],
    };
    expect(basicAttackReferencePage([])).toBeUndefined();
    expect(basicAttackReferencePage([[entry]])).toBe("R1");
    expect(basicAttackReferencePage([[], [], [], [entry]])).toBe("R2");
    expect(basicAttackReferencePage([[], [], [], [], [entry]])).toBe("R3");
  });
  it("shrinks identity names to a readable minimum before leaving overflow to ellipsis", () => {
    expect(fittingIdentityNameSize((size) => size * 5, 200)).toBe(27);
    const fitted = fittingIdentityNameSize((size) => size * 10, 220);
    expect(fitted).toBeLessThanOrEqual(22);
    expect(fitted).toBeGreaterThan(21.75);
    expect(fittingIdentityNameSize((size) => size * 100, 220)).toBe(18);
  });
  it("preserves the full long name in title text and the heading tooltip", () => {
    const name = "A very long synthetic character name that needs truncation";
    const html = renderToStaticMarkup(
      <SheetOverview
        model={model}
        name={name}
        portrait={undefined}
        paper="letter"
        monochrome={false}
        blankHP={false}
      />,
    );
    expect(html).toContain(
      `<h1 class="ov-character-name" title="${name}">${name}</h1>`,
    );
  });
  it("puts senses before skills and keeps defensive traits above reminders on the right", () => {
    const html = renderToStaticMarkup(
      <SheetOverview
        model={{
          ...model,
          overview: {
            ...model.overview!,
            vision: "Low-light vision; Tremorsense 4",
            defensiveTraits: [{ label: "Resistance", value: "Fire 5" }],
          },
        }}
        name="Fixture"
        portrait={undefined}
        paper="letter"
        monochrome={false}
        blankHP={false}
      />,
    );
    const summary = html
      .split('aria-label="Character summary"')[1]!
      .split("</article>")[0]!;
    const [left, right] = summary.split(
      'class="sp-column ov-reminders-column"',
    );
    const headings = ["Senses", "Skills", "Abilities", "Basic attacks"];
    for (let i = 1; i < headings.length; i++)
      expect(left!.indexOf(`>${headings[i]}</h3>`)).toBeGreaterThan(
        left!.indexOf(`>${headings[i - 1]}</h3>`),
      );
    expect(left).not.toContain(">Resistances &amp; Weaknesses</h3>");
    expect(right).toContain(">Resistances &amp; Weaknesses</h3>");
    expect(right!.indexOf(">Resistances &amp; Weaknesses</h3>")).toBeLessThan(
      right!.indexOf('class="ov-reminder-region"'),
    );
    expect(summary).toContain("Low-light vision; Tremorsense 4");
    expect(left).toContain("lucide-eye");
    expect(summary).not.toContain("<strong>Vision:</strong>");
  });
  it("omits a blank company and its separator from the player subtitle", () => {
    const html = renderToStaticMarkup(
      <SheetOverview
        model={{
          ...model,
          identity: [
            { label: "Player", value: "Test player" },
            { label: "Company", value: "  " },
          ],
        }}
        name="Fixture"
        portrait={undefined}
        paper="letter"
        monochrome={false}
        blankHP={false}
      />,
    );
    expect(html).toContain('<p class="ov-player-company">Test player</p>');
  });
  it.each([
    { identity: [] },
    { identity: [{ label: "Theme", value: "Test theme" }] },
  ])(
    "keeps a complete identity box even with sparse metadata (%j)",
    ({ identity }) => {
      const html = renderToStaticMarkup(
        <SheetOverview
          model={{ ...model, identity }}
          name="Fixture"
          portrait={undefined}
          paper="letter"
          monochrome={false}
          blankHP={false}
        />,
      );
      const box = html
        .split('class="ov-identity-details"')[1]!
        .split("</dl>")[0]!;
      expect(box).not.toContain("<dt>Player</dt>");
      expect(box).not.toContain("<dt>Company</dt>");
      expect(html).toContain('<p class="ov-player-company"></p>');
      for (const label of ["Paragon path", "Epic destiny"])
        expect(box).toContain(`<dt>${label}</dt><dd>—</dd>`);
      expect(box).toContain(
        `<dt>Theme</dt><dd>${identity.length ? "Test theme" : "—"}</dd>`,
      );
    },
  );
  it("shows zero saves as dashes while retaining nonzero bonuses and unknowns", () => {
    for (const [saves, expected] of [
      ["+0", "—"],
      ["0", "—"],
      ["+2", "+2"],
      ["-1", "-1"],
      ["—", "—"],
    ]) {
      const html = renderToStaticMarkup(
        <SheetOverview
          model={{ ...model, overview: { ...model.overview!, saves: saves! } }}
          name="Fixture"
          portrait={undefined}
          paper="letter"
          monochrome={false}
          blankHP={false}
        />,
      );
      expect(html).toContain(`<span>Saves</span><strong>${expected}</strong>`);
      expect(html).toContain("<span>Surge HP</span>");
    }
  });
  it("signs nonnegative initiative without doubling signs or changing negative/unknown values", () => {
    for (const [value, expected] of [
      ["12", "+12"],
      ["+12", "+12"],
      ["0", "+0"],
      ["-2", "-2"],
      ["—", "—"],
    ]) {
      const m = {
        ...model,
        resources: [...model.resources, { label: "Initiative", value: value! }],
      };
      const html = renderToStaticMarkup(
        <SheetOverview
          model={m}
          name="Fixture"
          portrait={undefined}
          paper="letter"
          monochrome={false}
          blankHP={false}
        />,
      );
      expect(html).toContain(
        `<span>Initiative</span><strong>${expected}</strong>`,
      );
    }
  });
  it("uses one icon-led basic-attack table and a fist for unarmed", () => {
    const variants = [
      {
        id: "off",
        equipmentName: "Off blade",
        equipped: true,
        hand: "off" as const,
        attack: "+8 vs AC",
        damage: "1d6 + 3",
      },
      {
        id: "unarmed",
        equipmentName: "Unarmed",
        equipped: false,
        attack: "+4 vs AC",
        damage: "1d4",
      },
      {
        id: "main",
        equipmentName: "Main blade",
        equipped: true,
        hand: "main" as const,
        attack: "+10 vs AC",
        damage: "1d8+5",
      },
    ];
    const m = {
      ...model,
      powers: [
        {
          id: "melee",
          name: "Melee Basic Attack",
          kind: "power" as const,
          fields: [],
          variants,
        },
        {
          id: "ranged",
          name: "Ranged Basic Attack",
          kind: "power" as const,
          fields: [],
          variants,
        },
      ],
    };
    const rows = overviewBasicAttackRows(m);
    expect(rows.filter((r) => !r.ranged).map((r) => r.weapon)).toEqual([
      "Main blade",
      "Off blade",
      "Unarmed",
    ]);
    expect(rows.filter((r) => r.ranged).map((r) => r.weapon)).toEqual([
      "Main blade",
      "Off blade",
    ]);
    expect(rows[0]).toMatchObject({ attack: "+10", damage: "1d8+5" });
    const html = renderToStaticMarkup(
      <SheetOverview
        model={m}
        name="Fixture"
        portrait={undefined}
        paper="letter"
        monochrome={false}
        blankHP={false}
      />,
    );
    const summary = html
      .split('aria-label="Character summary"')[1]!
      .split("</article>")[0]!
      .split('class="ov-pane-probe"')[0]!;
    expect(summary.match(/<th scope="col">Weapon<\/th>/g)).toHaveLength(1);
    expect(summary).toContain("lucide-bow-arrow");
    expect(summary).toContain("lucide-sword");
    expect(summary).toContain(
      '<span class="ov-panel-note">More in references…</span>',
    );
    expect(summary).not.toContain("Showing the highest-ranked weapons");
    expect(
      renderToStaticMarkup(
        <SheetOverview
          model={{
            ...m,
            powers: [{ ...m.powers[0]!, variants: [variants[1]!] }],
          }}
          name="Fixture"
          portrait={undefined}
          paper="letter"
          monochrome={false}
          blankHP={false}
        />,
      ),
    ).toContain("lucide-hand-fist");
    expect(summary).not.toContain("vs AC");
    expect(variants).toHaveLength(3);
  });
  it("filters weapon capabilities and sorts globally by attack then average damage", () => {
    const variants = [
      {
        id: "gouge",
        equipmentName: "Gouge",
        basicAttackTypes: ["melee"] as const,
        equipped: true,
        attack: "+8 vs AC",
        damage: "2d6+3",
      },
      {
        id: "bow",
        equipmentName: "Bow",
        basicAttackTypes: ["ranged"] as const,
        equipped: false,
        attack: "+10 vs AC",
        damage: "1d10+3",
      },
      {
        id: "light",
        equipmentName: "Light thrown",
        basicAttackTypes: ["melee", "ranged"] as const,
        equipped: false,
        attack: "+8 vs AC",
        damage: "1d4+3",
      },
      {
        id: "heavy",
        equipmentName: "Heavy thrown",
        basicAttackTypes: ["melee", "ranged"] as const,
        equipped: false,
        attack: "+8 vs AC",
        damage: "1d12+3",
      },
      {
        id: "custom",
        equipmentName: "Unresolved custom weapon",
        equipped: false,
        attack: "Unknown",
        damage: "Unknown",
      },
    ];
    const m = {
      ...model,
      powers: ["Melee", "Ranged"].map((kind) => ({
        name: `${kind} Basic Attack`,
        kind: "power" as const,
        fields: [],
        variants,
      })),
    };
    const rows = overviewBasicAttackRows(m);
    expect(rows.map((row) => row.weapon)).toEqual([
      "Bow",
      "Gouge",
      "Heavy thrown",
      "Heavy thrown",
      "Light thrown",
      "Light thrown",
      "Unresolved custom weapon",
      "Unresolved custom weapon",
    ]);
    expect(rows.find((row) => row.weapon === "Bow")?.ranged).toBe(true);
    expect(rows.find((row) => row.weapon === "Gouge")?.ranged).toBe(false);
    expect(overviewBasicAttackRows(m, 1).map((row) => row.weapon)).toEqual([
      "Bow",
      "Gouge",
    ]);
  });
  it("places combat statistics in a full-width band with balanced summary columns", () => {
    const m = {
      ...model,
      features: [
        {
          group: "Language",
          entries: [
            { label: "Common", value: "" },
            { label: "Draconic", value: "" },
          ],
        },
      ],
      identity: [
        { label: "Level", value: "7" },
        { label: "Class", value: "Paladin" },
        { label: "Race", value: "Dwarf" },
        { label: "Player", value: "Synthetic player" },
        { label: "Company", value: "Synthetic company" },
        { label: "Theme", value: "Synthetic theme" },
      ],
      overview: {
        ...model.overview!,
        skills: [
          { name: "Insight", ability: "WIS", bonus: "+8", trained: false },
          { name: "Perception", ability: "WIS", bonus: "+15", trained: true },
        ],
      },
      resources: [...model.resources, { label: "Initiative", value: "12" }],
      senses: [
        { label: "Passive Insight", value: "18" },
        { label: "Passive Perception", value: "25" },
      ],
    };
    const html = renderToStaticMarkup(
      <SheetOverview
        model={m}
        name="Fixture"
        portrait={undefined}
        paper="letter"
        monochrome={false}
        blankHP={false}
      />,
    );
    const summary = html
      .split('aria-label="Character summary"')[1]!
      .split("</article>")[0]!;
    const right = summary
      .split('class="sp-column ov-main-column"')[1]!
      .split('class="sp-column ov-reminders-column"')[0]!;
    expect(summary).not.toContain('class="sp-running-header"');
    expect(summary).not.toContain(">Movement</h3>");
    expect(summary).toContain("Dwarf Paladin 7");
    const header = summary
      .split('class="sp-identity"')[1]!
      .split("</section>")[0]!;
    expect(header).not.toContain("Initiative");
    expect(header).toContain('class="ov-identity-details"');
    expect(header).toContain("<dt>Theme</dt><dd>Synthetic theme</dd>");
    expect(header).toContain(
      '<p class="ov-player-company">Synthetic player · Synthetic company</p>',
    );
    const band = summary
      .split('class="ov-numeric-band"')[1]!
      .split('class="sp-summary-grid')[0]!;
    expect(band).toContain('aria-label="Defenses" class="ov-stat-group"');
    expect(band).toContain('aria-label="Health" class="ov-stat-group"');
    expect(band).toContain('aria-label="Initiative" class="ov-stat-group"');
    expect(band).toContain('aria-label="Speed" class="ov-stat-group"');
    expect(band).not.toContain("<h3");
    expect(right).toContain(
      '<td class="ov-ability-score">19</td><th scope="row">Strength</th>',
    );
    expect(right).not.toContain(">Score</th>");
    expect(right).toContain('aria-label="Ability score"');
    expect(right).toContain('class="ov-ability-name-heading">Ability</th>');
    const abilitySection = right
      .split('class="ov-ability-section"')[1]!
      .split('class="sp-panel sp-skills-panel"')[0]!;
    expect(abilitySection).toContain(">Languages</h3>");
    expect(abilitySection).toContain(
      '<table class="ov-language-table" aria-label="Languages"><tbody><tr><th scope="row">Common</th></tr><tr><th scope="row">Draconic</th></tr></tbody></table>',
    );
    const skills = right.split(">Skills</h3>")[1]!.split(">Languages</h3>")[0]!;
    expect(skills).toContain('<span class="ov-passive-value">(18)</span> +8');
    expect(skills).toContain('<span class="ov-passive-value">(25)</span> +15');
    expect(skills).not.toContain("ov-passive-skill");
    expect(band).toContain("<span>Initiative</span><strong>+12</strong>");
  });
  it("groups defensive traits in the summary body and preserves full references", () => {
    const html = renderToStaticMarkup(
      <SheetOverview
        model={{
          ...model,
          overview: {
            ...model.overview!,
            defensiveTraits: [
              {
                label: "Resistance",
                value: "Fire 5",
                source: "Synthetic cloak",
              },
              {
                label: "Vulnerability",
                value: "Cold 5",
                source: "Synthetic curse",
              },
              { label: "Immunity", value: "acid", source: "Synthetic ward" },
              {
                label: "Synthetic immunity",
                group: "Immunities",
                value: "while transformed, you are immune to disease.",
                source: "Synthetic form",
              },
              {
                label: "Saving throws",
                value: "+2 to saves against poison",
                source: "Synthetic feat",
              },
            ],
          },
        }}
        name="Fixture"
        portrait={undefined}
        paper="letter"
        monochrome={false}
        blankHP={false}
      />,
    );
    const summary = html
      .split('aria-label="Character summary"')[1]!
      .split("</article>")[0]!;
    expect(summary).toContain(">Resistances &amp; Weaknesses</h3>");
    expect(summary).toContain("Resist 5 fire");
    expect(summary).toContain("Vulnerable 5 cold");
    expect(summary).toContain("Immune to acid");
    expect(summary).toContain("While transformed, you are immune to disease.");
    expect(summary).toContain("+2 to saves vs poison");
    expect(summary).toContain('<table class="ov-defensive-table"');
    const defensiveTable = summary
      .split('<table class="ov-defensive-table"')[1]!
      .split("</table>")[0]!;
    expect(defensiveTable).not.toContain("<thead");
    expect(defensiveTable).not.toContain("<th");
    expect(defensiveTable.match(/class="ov-defensive-striped"/g)).toHaveLength(
      3,
    );
    expect(defensiveTable).not.toContain("<tr></tr>");
    expect(summary).toContain("<td>Synthetic cloak</td>");
    expect(summary).toContain("<td>Synthetic feat</td>");
    expect(summary).toContain('aria-label="Resistances"');
    expect(summary.indexOf(">Resistances &amp; Weaknesses</h3>")).toBeLessThan(
      summary.indexOf('class="ov-reminder-region"'),
    );
    expect(
      summary.split('class="sp-identity"')[1]!.split("</section>")[0],
    ).not.toContain("Resist 5 fire");
    const empty = renderToStaticMarkup(
      <SheetOverview
        model={model}
        name="Fixture"
        portrait={undefined}
        paper="letter"
        monochrome={false}
        blankHP={false}
      />,
    );
    expect(empty).not.toContain(">Resistances &amp; Weaknesses</h3>");
  });
  it.each([
    ["0", "+0"],
    ["-2", "-2"],
  ])("signs initiative %s as %s", (value, expected) => {
    const html = renderToStaticMarkup(
      <SheetOverview
        model={{ ...model, resources: [{ label: "Initiative", value }] }}
        name="Fixture"
        portrait={undefined}
        paper="letter"
        monochrome={false}
        blankHP={false}
      />,
    );
    expect(html).toContain(
      `<span>Initiative</span><strong>${expected}</strong>`,
    );
  });
  it("fills reminder space without a fixed count cap, reserving overflow-caption space", () => {
    expect(
      fittingReminderIndices([30, 30, 30, 30, 30, 30, 30], 5, 300, 20),
    ).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(
      fittingReminderIndices([30, 30, 30, 30, 30, 30, 30], 5, 130, 20),
    ).toEqual([0, 1, 2]);
    expect(fittingReminderIndices([500, 30, 30], 5, 130, 20)).toEqual([1, 2]);
    expect(fittingReminderIndices([50, 50], 0, 100, 20)).toEqual([0, 1]);
  });
  it("places source-categorized reminder panes in their own right column", () => {
    const features = [false, true].map((playReminder) => ({
      id: `feat:${playReminder}`,
      name: playReminder ? "Quick Hands" : "Passive Training",
      group: "Feat",
      summary: playReminder
        ? "Draw a weapon while attacking."
        : "Gain weapon proficiency.",
      description: "Complete reference remains available.",
      fields: [],
      source: "Synthetic",
      fullTextAvailable: true,
      playReminder,
    }));
    const html = renderToStaticMarkup(
      <SheetOverview
        model={{
          ...model,
          overview: {
            ...model.overview!,
            features,
            reminders: [
              {
                label: "Quick Hands (heroic tier)",
                value: "Draw a weapon while attacking.",
                category: "Feats",
              },
              {
                label: "Defensive Stance",
                value: "When attacked, you can shift.",
                category: "Class features",
              },
              {
                label: "Protective Charm",
                value: "An adjacent ally gains a bonus.",
                category: "Item properties",
              },
            ],
          },
        }}
        name="Fixture"
        portrait={undefined}
        paper="letter"
        monochrome={false}
        blankHP={false}
      />,
    );
    const summary = html
      .split('aria-label="Character summary"')[1]!
      .split("</article>")[0]!;
    expect(summary).toContain("Quick Hands");
    expect(summary).toContain("<strong>Quick Hands</strong>");
    expect(summary).not.toContain("<strong>Quick Hands:</strong>");
    expect(summary).not.toContain("Quick Hands (heroic tier)");
    expect(summary).toContain("Defensive Stance");
    expect(summary).toContain("Protective Charm");
    expect(summary).toContain('aria-label="Reminders"');
    expect(summary).toContain(">Feats</h3>");
    expect(summary).toContain(">Class features</h3>");
    expect(summary).toContain(">Item properties</h3>");
    expect(
      summary.split('class="ov-reminder-probe"')[0]!.match(/Quick Hands/g),
    ).toHaveLength(1);
    expect(summary).not.toContain("Feat reminders");
    const [left, right] = summary.split(
      'class="sp-column ov-reminders-column"',
    );
    expect(left).not.toContain("Quick Hands");
    expect(left).toContain("Basic attacks");
    expect(left).toContain(">Abilities</h3>");
    expect(left).toContain(">Skills</h3>");
    expect(right).toContain("Quick Hands");
    expect(right!.split('class="ov-pane-probe"')[0]).not.toContain(
      "Basic attacks",
    );
    expect(summary).not.toContain("Passive Training");
    expect(html).toContain("Passive Training");
  });
  it("accounts for reminder pane overhead and preserves later fitting entries", () => {
    const groups = [
      {
        overhead: 20,
        gap: 5,
        entries: [
          { index: 0, height: 500 },
          { index: 1, height: 30 },
        ],
      },
      { overhead: 20, gap: 5, entries: [{ index: 2, height: 30 }] },
    ];
    expect(fittingReminderGroups(groups, 130, 20, 10)).toEqual([1, 2]);
    expect(fittingReminderGroups(groups, 100, 20, 10)).toEqual([1]);
    expect(fittingReminderGroups(groups, 700, 20, 10)).toEqual([0, 1, 2]);
  });
  it("moves an ordered suffix of whole panes when the left column fills", () => {
    expect(fittingSummaryPaneCount([80, 180, 130, 100], 520, 10)).toBe(4);
    expect(fittingSummaryPaneCount([80, 180, 130, 100], 419, 10)).toBe(3);
    expect(fittingSummaryPaneCount([80, 180, 130, 100], 400, 10)).toBe(2);
    // Do not skip an oversized pane to squeeze later, smaller panes onto the left.
    expect(fittingSummaryPaneCount([80, 500, 20], 200, 10)).toBe(1);
    expect(fittingSummaryPaneCount([500, 20], 200, 10)).toBe(0);
    expect(fittingSummaryPaneCount([], 200, 10)).toBe(0);
    // Overflow panes consume right-column space before reminder selection.
    expect(
      fittingReminderGroups(
        [{ overhead: 20, gap: 0, entries: [{ index: 0, height: 80 }] }],
        90,
        20,
        0,
      ),
    ).toEqual([]);
  });
  it("indexes item powers even when the physical item-card list is empty", () => {
    const rows = overviewTrackingRows({
      ...model,
      items: [],
      overview: {
        ...model.overview!,
        inventory: [
          {
            name: "Hidden-card charm",
            quantity: 1,
            equipped: 1,
            slots: ["neck"],
            fields: [
              {
                label: "Power",
                value: "Power (Daily): Minor Action. An authored effect.",
              },
            ],
          },
        ],
      },
    });
    expect(rows).toContainEqual({
      id: "item:0:0",
      name: "Hidden-card charm",
      action: "Minor",
      usage: "Daily",
    });
  });
  it("omits item enhancement and tier only in compact scratchpad names", () => {
    const fixture = {
      ...model,
      powers: [
        { name: "Power +2 (heroic tier)", kind: "power" as const, fields: [] },
      ],
      overview: {
        ...model.overview!,
        inventory: [
          "Charm +2 (heroic tier)",
          "Ring (paragon tier) +3",
          "Orb (epic tier)",
        ].map((name) => ({
          name,
          quantity: 1,
          equipped: 1,
          slots: [],
          fields: [
            {
              label: "Power",
              value: "Power (Daily): Minor Action. Effect: Test.",
            },
          ],
        })),
      },
    };
    expect(overviewTrackingRows(fixture, true).map((row) => row.name)).toEqual([
      "Power +2 (heroic tier)",
      "Charm",
      "Ring",
      "Orb",
    ]);
    expect(overviewTrackingRows(fixture)[1]?.name).toBe(
      "Charm +2 (heroic tier)",
    );
    expect(fixture.overview.inventory[0]?.name).toBe("Charm +2 (heroic tier)");
  });
  it("retains carried spares and full descriptions in the reference measurement surface", () => {
    const m = {
      ...model,
      overview: {
        ...model.overview!,
        features: [
          {
            id: "feat:full",
            name: "Guard",
            group: "Feat",
            summary: "Brief.",
            description: "The full synthetic description is preserved.",
            fields: [],
            source: "Synthetic source",
            fullTextAvailable: true,
          },
        ],
        inventory: [
          {
            name: "Synthetic blade",
            quantity: 2,
            equipped: 1,
            slots: ["main-hand"],
            fields: [],
          },
        ],
      },
    };
    const html = renderToStaticMarkup(
      <SheetOverview
        model={m}
        name="Fixture"
        portrait={undefined}
        paper="a4"
        monochrome
        blankHP={false}
      />,
    );
    expect(html).toContain("The full synthetic description is preserved.");
    expect(html.match(/Synthetic blade ×1/g)).toHaveLength(2);
    expect(html).toContain("main hand");
    expect(html).toContain("Carried equipment");
  });
  it("renders the approved summary and scratchpad without changing source data", () => {
    const markup = renderToStaticMarkup(
      <SheetOverview
        model={model}
        name="Overview fixture"
        portrait={undefined}
        paper="letter"
        monochrome={false}
        blankHP
      />,
    );
    expect(markup).toContain('aria-label="Character summary"');
    expect(markup).toContain('aria-label="Play scratchpad"');
    expect(markup).toContain("+½ level");
    expect(markup.match(/lucide-skull/g)).toHaveLength(3);
    expect(markup.match(/class="ov-surge-segment/g)).toHaveLength(8);
    const scratchpad = markup
      .split('aria-label="Play scratchpad"')[1]!
      .split("</article>")[0]!;
    expect(scratchpad).toContain('class="ov-effects-table"');
    expect(scratchpad).toContain('<th scope="col">Ends</th>');
    expect(scratchpad).toContain(">Session notes</h3>");
    expect(scratchpad).not.toContain(">Reminders</h3>");
    expect(scratchpad).not.toContain(">Quick reference</h3>");
    expect(markup).not.toContain(">72<");
    expect(model.resources.find((v) => v.label === "Hit Points")?.value).toBe(
      "72",
    );
  });
  it("groups Channel Divinity only from explicit keywords, retaining actions", () => {
    const rows = overviewTrackingRows({
      ...model,
      powers: [
        {
          id: "a",
          name: "Unrelated name",
          kind: "power",
          keywords: "Divine, Channel Divinity",
          usage: "Encounter",
          actionType: "Minor Action",
          fields: [],
        },
        {
          id: "b",
          name: "Channel Divinity in name only",
          kind: "power",
          usage: "Encounter",
          actionType: "Free Action",
          fields: [],
        },
      ],
    });
    expect(rows[0]).toMatchObject({
      group: "Channel Divinity",
      action: "Minor Action",
    });
    expect(rows[1]?.group).toBeUndefined();
  });
  it("preserves every word and numbered-list origin while splitting long rules", () => {
    const words =
      Array.from({ length: 230 }, (_, n) => `word${n}`).join(" ") + ".";
    const parts = referenceParts(words, "Benefit");
    expect(
      parts.map((p) => ("text" in p.block ? p.block.text : "")).join(" "),
    ).toBe(words);
    expect(parts.filter((p) => p.label)).toHaveLength(1);
    const numbered = referenceParts("4. First item.\n5. Second item.");
    expect(
      numbered.map((p) => (p.block.kind === "list" ? p.block.start : null)),
    ).toEqual([4, 5]);
  });
  it("paginates dense cards with continuations without losing or reordering parts", () => {
    const parts = referenceParts(
      Array.from({ length: 260 }, (_, n) => `word${n}`).join(" ") + ".",
    );
    const entry: ReferenceEntry = {
      id: "long",
      name: "Full rules",
      group: "Feats",
      source: "Synthetic",
      parts,
    };
    const columns = paginateReferences(
      [entry],
      new Map([
        ["long", { height: 650, overhead: 50, parts: parts.map(() => 150) }],
      ]),
      400,
    );
    expect(columns.length).toBeGreaterThan(1);
    expect(columns.flatMap((c) => c.flatMap((e) => e.parts))).toEqual(parts);
    expect(columns.flat().at(-1)?.continued).toBe(true);
    expect(paginateReferences([], new Map(), 400)).toEqual([]);
  });
});
