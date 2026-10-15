import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildSheetModel } from "@4ecb/sheet-model";
import {
  SheetOverview,
  fittingReminderIndices,
  overviewBasicAttackRows,
  overviewTrackingRows,
  paginateReferences,
  referenceParts,
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
      .split('class="ov-basic-probe"')[0]!;
    expect(summary.match(/<th scope="col">Weapon<\/th>/g)).toHaveLength(1);
    expect(summary).toContain("lucide-bow-arrow");
    expect(summary).toContain("lucide-sword");
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
  it("places initiative and speed in the identity header, with passive senses before skill bonuses", () => {
    const m = {
      ...model,
      identity: [
        { label: "Level", value: "7" },
        { label: "Class", value: "Paladin" },
        { label: "Race", value: "Dwarf" },
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
    const right = summary.split('class="sp-column sp-skills-column"')[1]!;
    expect(summary).not.toContain('class="sp-running-header"');
    expect(summary).not.toContain(">Movement</h3>");
    expect(summary).toContain("Dwarf Paladin 7");
    const header = summary
      .split('class="sp-identity"')[1]!
      .split("</section>")[0]!;
    expect(header).toContain('class="sp-values ov-header-stats"');
    expect(right).toContain(
      '<td class="ov-ability-score">19</td><th scope="row"><abbr title="Strength">STR</abbr></th>',
    );
    expect(right).not.toContain(">Score</th>");
    expect(right).toContain('aria-label="Ability score"');
    expect(right).toContain('class="ov-ability-name-heading">Ability</th>');
    const skills = right.split(">Skills</h3>")[1]!.split(">Languages</h3>")[0]!;
    expect(skills).toContain('<span class="ov-passive-value">(18)</span> +8');
    expect(skills).toContain('<span class="ov-passive-value">(25)</span> +15');
    expect(skills).not.toContain("ov-passive-skill");
    expect(header).toContain("<span>Initiative</span><strong>+12</strong>");
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
  it("combines actionable feat, feature and item reminders in one summary section", () => {
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
              },
              {
                label: "Defensive Stance",
                value: "When attacked, you can shift.",
              },
              {
                label: "Protective Charm",
                value: "An adjacent ally gains a bonus.",
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
    expect(summary).not.toContain("Quick Hands (heroic tier)");
    expect(summary).toContain("Defensive Stance");
    expect(summary).toContain("Protective Charm");
    expect(summary.match(/Remember in play/g)).toHaveLength(1);
    expect(
      summary.split('class="ov-reminder-probe"')[0]!.match(/Quick Hands/g),
    ).toHaveLength(1);
    expect(summary).not.toContain("Feat reminders");
    const [left, right] = summary.split('class="sp-column sp-skills-column"');
    expect(left).toContain("Remember in play");
    expect(left).not.toContain("Basic attacks");
    expect(right!.indexOf("Languages")).toBeLessThan(
      right!.indexOf("Basic attacks"),
    );
    expect(summary).not.toContain("Passive Training");
    expect(html).toContain("Passive Training");
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
    expect(markup.match(/<small>[1-8]<\/small>/g)).toHaveLength(8);
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
