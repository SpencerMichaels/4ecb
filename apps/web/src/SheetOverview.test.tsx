import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildSheetModel, type SheetCard } from "@4ecb/sheet-model";
import {
  SheetOverview,
  fittingReminderIndices,
  fittingReminderGroups,
  fittingSummaryPaneCount,
  fittingIdentityNameSize,
  overviewBasicAttackRows,
  overviewTrackingRows,
  sortedTrackingRows,
  paginateReferences,
  paginateReferenceGroups,
  referenceParts,
  references,
  balancedInventoryColumns,
  summaryContinuationEntries,
  paginateReminderColumns,
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
  it("preserves compact reminder categories across measured continuation columns", () => {
    expect(
      paginateReminderColumns(
        [
          {
            overhead: 20,
            gap: 5,
            entries: [
              { index: 0, height: 30 },
              { index: 1, height: 30 },
              { index: 2, height: 30 },
            ],
          },
          { overhead: 20, gap: 5, entries: [{ index: 3, height: 30 }] },
        ],
        100,
        10,
      ),
    ).toEqual([[0, 1], [2], [3]]);
    expect(paginateReminderColumns([], 100, 10)).toEqual([]);
    expect(
      paginateReminderColumns(
        [{ overhead: 20, gap: 5, entries: [{ index: 0, height: 200 }] }],
        100,
        10,
      ),
    ).toEqual([[0]]);
  });
  it("puts mechanical identity in the paired header and physical details before descriptive references", () => {
    const fixture = {
      ...model,
      identity: [
        ...model.identity,
        { label: "Size", value: "Small" },
        { label: "Deity", value: "Example deity" },
        { label: "Age", value: "30" },
      ],
      notes: [{ label: "Appearance", value: "A description." }],
    };
    const entries = references(fixture).filter(
      (entry) => entry.group === "Character record",
    );
    expect(entries.map((entry) => entry.name)).toEqual([
      "Character Details",
      "Appearance",
    ]);
    expect(entries[0]?.parts.map((part) => part.block)).toEqual([
      { kind: "table", headers: ["Detail", "Value"], rows: [["Age", "30"]] },
    ]);
    const html = renderToStaticMarkup(
      <SheetOverview
        model={fixture}
        name="Fixture"
        portrait={undefined}
        paper="letter"
        monochrome={false}
        blankHP={false}
      />,
    );
    expect(
      html.split('aria-label="Character summary"')[1]!.split("</article>")[0]!,
    ).toContain("<dt>Size</dt><dd>Small</dd>");
    expect(html.match(/class="ov-identity-table"/g)).toHaveLength(2);
  });
  it("prints carried weight, normal limit and load without guessing unknown inputs", () => {
    const entry = references({
      ...model,
      encumbrance: { carriedWeight: 65, normalLimit: 130, load: "Normal" },
    }).find((entry) => entry.id === "inventory:false");
    expect(entry?.encumbrance).toEqual({
      carriedWeight: 65,
      normalLimit: 130,
      load: "Normal",
    });
    expect(references(model).some((entry) => entry.id === "encumbrance")).toBe(
      false,
    );
  });
  it("places muted quantity-inclusive weights beside inventory names", () => {
    const fixture = {
      ...model,
      overview: {
        ...model.overview!,
        inventory: [
          {
            name: "Test staff",
            quantity: 2,
            equipped: 0,
            slots: [],
            fields: [],
            weight: 8,
          },
        ],
      },
    };
    const entry = references(fixture).find(
      (entry) => entry.id === "inventory:false",
    );
    expect(entry?.parts[0]?.inventoryWeight).toBe(8);
    const html = renderToStaticMarkup(
      <SheetOverview
        model={fixture}
        name="Fixture"
        portrait={undefined}
        paper="letter"
        monochrome={false}
        blankHP={false}
      />,
    );
    expect(html).toContain('class="ov-inventory-weight">8 lb</span>');
    expect(html).toContain('class="ov-inventory-encumbrance"');
  });
  it("puts Session notes in the wider first column and XP inside Treasure & consumables", () => {
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
    const records = html.split(
      'class="ov-scratch-layout ov-scratch-records ov-scratch-bottom"',
    )[1]!;
    const [notes, treasure] = records.split("</section>");
    expect(notes).toContain('>Session notes<span class="ov-panel-note">');
    expect(notes).toContain('class="sp-writing-lines ov-scratch-notes"');
    expect(notes).not.toContain('class="sp-xp-tracker"');
    expect(treasure).toContain(">Treasure &amp; consumables</h3>");
    expect(treasure).toContain('class="sp-writing-lines ov-scratch-treasure"');
    expect(treasure).toContain('class="sp-xp-tracker"');
  });
  it.each(["12500", "0"])(
    "shows recorded XP %s in the scratchpad box, not identity or a standalone reference card",
    (value) => {
      const fixture = {
        ...model,
        identity: [...model.identity, { label: "Experience", value }],
        notes: [],
      };
      expect(
        references(fixture).some(
          (entry) =>
            entry.id === "experience" || entry.group === "Character record",
        ),
      ).toBe(false);
      const html = renderToStaticMarkup(
        <SheetOverview
          model={fixture}
          name="Fixture"
          portrait={undefined}
          paper="letter"
          monochrome={false}
          blankHP={false}
        />,
      );
      const identity = html
        .split('class="ov-identity-details"')[1]!
        .split("</section>")[0]!;
      expect(identity).not.toContain("<dt>XP</dt>");
      expect(html).toContain(
        `class="ov-recorded-xp">Recorded: ${value}</small>`,
      );
      expect(html).toContain("<span>XP</span>");
    },
  );
  it("moves reference-page running identity and title into a three-part footer", () => {
    const fixture = {
      ...model,
      identity: [
        { label: "Race", value: "Dwarf" },
        { label: "Class", value: "Paladin" },
        { label: "Level", value: "7" },
      ],
    };
    const html = renderToStaticMarkup(
      <SheetOverview
        model={fixture}
        name="Ingi fixture"
        portrait={undefined}
        paper="letter"
        monochrome={false}
        blankHP={false}
      />,
    );
    const pages = [
      ...html.matchAll(
        /<article[^>]*aria-label="Character reference"[^>]*>([\s\S]*?)<\/article>/g,
      ),
    ];
    expect(pages.length).toBeGreaterThan(0);
    for (const page of pages) {
      expect(page[1]).not.toContain('class="sp-running-header"');
      expect(page[1]).toContain('class="sp-page-footer ov-reference-footer"');
      expect(page[1]).toContain(">Ingi fixture · Dwarf Paladin 7</span>");
      expect(page[1]).toContain("<span>Character Reference</span>");
      expect(page[1]).toContain('class="ov-page-number"');
    }
    expect(html).not.toContain('class="sp-running-header');
    expect(html).toContain("<span>Scratchpad</span>");
    const summary = html
      .split('aria-label="Character summary"')[1]!
      .split("</article>")[0]!;
    const summaryFooter = summary.split("<footer")[1]!;
    expect(summaryFooter).toContain('class="ov-reference-footer-identity"');
    expect(summaryFooter).toContain(">Ingi fixture · Dwarf Paladin 7</span>");
    expect(summaryFooter).toContain("<span>Character Summary</span>");
    expect(summaryFooter).toContain('class="ov-page-number">1</span>');
  });
  const inventoryParts = (category: string, count: number) =>
    Array.from({ length: count }, (_, i) => ({
      tableCategory: category,
      block: {
        kind: "table" as const,
        headers: ["Item", "Qty"],
        rows: [[`${category} ${i}`, "1"]],
      },
    }));
  it("balances inventory lines at whole-category boundaries, not halfway through each category", () => {
    const parts = [
      ...inventoryParts("Weapons", 10),
      ...inventoryParts("Armor", 5),
      ...inventoryParts("Gear", 4),
    ];
    const columns = balancedInventoryColumns(parts);
    expect(
      columns.map((column) => [
        ...new Set(column.map((part) => part.tableCategory)),
      ]),
    ).toEqual([["Weapons"], ["Armor", "Gear"]]);
    expect(columns.flat()).toEqual(parts);
    expect(
      balancedInventoryColumns(parts.slice(0, 10)).map(
        (column) => column.length,
      ),
    ).toEqual([10, 0]);
  });
  it("moves complete inventory categories rather than splitting those that fit a fresh column", () => {
    const parts = [
      ...inventoryParts("Weapons", 2),
      ...inventoryParts("Armor", 3),
      ...inventoryParts("Gear", 2),
    ];
    const entry: ReferenceEntry = {
      id: "inventory:false",
      name: "Inventory",
      group: "Items",
      source: "",
      parts,
    };
    const pages = paginateReferences(
      [entry],
      new Map([
        [
          entry.id,
          { height: 700, overhead: 40, parts: [90, 90, 70, 70, 70, 90, 90] },
        ],
      ]),
      300,
    ).flat();
    expect(pages).toHaveLength(2);
    const placements = pages.flatMap((page) =>
      page.inventoryColumns!.map((column) => [
        ...new Set(column.map((part) => part.tableCategory)),
      ]),
    );
    expect(placements.flat().filter((name) => name === "Weapons")).toHaveLength(
      1,
    );
    expect(placements.flat().filter((name) => name === "Armor")).toHaveLength(
      1,
    );
    expect(placements.flat().filter((name) => name === "Gear")).toHaveLength(1);
    expect(pages.flatMap((page) => page.parts)).toEqual(parts);
  });
  it("includes wrapped item-name lines when balancing inventory categories", () => {
    const wrapped = inventoryParts("Weapons", 1);
    wrapped[0]!.block.rows[0]![0] = "Long item name ".repeat(20);
    const columns = balancedInventoryColumns([
      ...wrapped,
      ...inventoryParts("Armor", 5),
      ...inventoryParts("Gear", 4),
    ]);
    expect(
      columns.map((column) => [
        ...new Set(column.map((part) => part.tableCategory)),
      ]),
    ).toEqual([["Weapons"], ["Armor", "Gear"]]);
  });
  it("uses the shorter column for later categories rather than forcing a contiguous split", () => {
    const columns = balancedInventoryColumns([
      ...inventoryParts("Weapons", 4),
      ...inventoryParts("Gear", 10),
      ...inventoryParts("Worn", 4),
    ]);
    expect(
      columns.map((column) => [
        ...new Set(column.map((part) => part.tableCategory)),
      ]),
    ).toEqual([["Weapons", "Worn"], ["Gear"]]);
  });
  it("splits a genuinely oversized inventory category without losing items", () => {
    const parts = inventoryParts("Gear", 10);
    const entry: ReferenceEntry = {
      id: "inventory:false",
      name: "Inventory",
      group: "Items",
      source: "",
      parts,
    };
    const pages = paginateReferences(
      [entry],
      new Map([
        [entry.id, { height: 1040, overhead: 40, parts: parts.map(() => 100) }],
      ]),
      400,
    ).flat();
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.flatMap((page) => page.parts)).toEqual(parts);
    expect(pages[1]?.continued).toBe(true);
    expect(
      pages.every((page) =>
        page.inventoryColumns!.every((column) => column.length <= 3),
      ),
    ).toBe(true);
  });
  it("separates common at-will grants and rules references without hiding actual No Action powers", () => {
    const power = (name: string): SheetCard => ({
      kind: "power",
      name,
      usage: "At-Will",
      actionType: "Standard Action",
      fields: [],
    });
    const powers = [
      power("Character attack"),
      { ...power("Common maneuver"), universal: true },
      {
        ...power("Effect rule"),
        actionType: "",
        fields: [{ label: "Rules Item", value: "An applied effect." }],
      },
      { ...power("Legitimate free effect"), actionType: "No Action" },
    ];
    const entries = references({
      ...model,
      powers,
      overview: {
        ...model.overview!,
        features: [
          {
            id: "effect-rule",
            name: "Effect rule",
            group: "Rules Item",
            referenceGroup: "Class Feature",
            description: "An applied effect.",
            summary: "An applied effect.",
            fields: [],
            source: "Synthetic",
            fullTextAvailable: true,
          },
        ],
      },
    });
    const names = (id: string) =>
      entries
        .find((entry) => entry.id === id)!
        .parts.flatMap((part) =>
          part.block.kind === "table"
            ? part.block.rows.map((row) => row[0])
            : [],
        );
    expect(names("powers:At-Will")).toEqual([
      "Character attack",
      "Legitimate free effect",
      "Common maneuver",
    ]);
    expect(entries.some((entry) => entry.id === "powers:At-Will:common")).toBe(
      false,
    );
    expect(
      entries
        .find((entry) => entry.id === "powers:At-Will")
        ?.parts.map((part) => part.tableCategory),
    ).toEqual([undefined, undefined, "Universal actions"]);
    const html = renderToStaticMarkup(
      <SheetOverview
        model={{ ...model, powers }}
        name="Fixture"
        portrait={undefined}
        paper="letter"
        monochrome={false}
        blankHP={false}
      />,
    );
    const atWill = html
      .split('data-reference-id="powers:At-Will"')[1]!
      .split("</section>")[0]!;
    expect(atWill).toContain(
      'class="ov-reference-table-category ov-power-index-subheading"',
    );
    expect(atWill).toContain(
      '<th colSpan="6" scope="rowgroup">Universal actions</th>',
    );
    expect(atWill.match(/<thead>/g)).toHaveLength(1);
    expect(html).not.toContain(">Universal actions</h3>");
    expect(entries.some((entry) => entry.id === "power-rules-references")).toBe(
      false,
    );
    expect(entries.find((entry) => entry.id === "effect-rule")?.group).toBe(
      "Class features",
    );
    expect(entries.find((entry) => entry.id === "effect-rule")?.parts).toEqual(
      referenceParts("An applied effect."),
    );
    expect(powers).toHaveLength(4);
  });
  it("prints background mechanics without narrative while retaining unresolved legacy text", () => {
    const feature = {
      id: "background",
      name: "Synthetic background",
      group: "Background",
      description: "A long story about growing up in a remote settlement.",
      summary: "A background story.",
      source: "Synthetic",
      fullTextAvailable: true,
      fields: [
        { label: "Common Knowledge", value: "More story and questions." },
        { label: "Benefit", value: "Reroll a failed save once per encounter." },
        { label: "Associated Skills", value: "History, Nature" },
        { label: "Associated Languages", value: "Elven" },
      ],
    };
    const entries = references({
      ...model,
      overview: {
        ...model.overview!,
        features: [
          feature,
          {
            ...feature,
            id: "legacy",
            fields: [],
            description: "A retained custom benefit.",
            fullTextAvailable: false,
          },
          {
            ...feature,
            id: "inline",
            fields: [],
            description: "Some story. Benefit: Gain a conditional bonus.",
          },
          { ...feature, id: "story-only", fields: [feature.fields[0]!] },
        ],
      },
    });
    const compact = entries.find((entry) => entry.id === "background")!;
    expect(compact.parts.map((part) => part.label)).toEqual([
      "Benefit",
      "Associated Skills",
      "Associated Languages",
    ]);
    expect(JSON.stringify(compact)).not.toContain(feature.description);
    expect(JSON.stringify(compact)).not.toContain("More story");
    expect(
      JSON.stringify(entries.find((entry) => entry.id === "legacy")),
    ).toContain("A retained custom benefit.");
    expect(entries.find((entry) => entry.id === "inline")?.parts).toEqual(
      referenceParts("Gain a conditional bonus.", "Benefit"),
    );
    expect(entries.some((entry) => entry.id === "story-only")).toBe(false);
  });
  it("omits theme overview prose while retaining separately granted theme features", () => {
    const feature = (id: string, group: string, description: string) => ({
      id,
      name: id,
      group,
      description,
      summary: description,
      source: "Synthetic",
      fullTextAvailable: true,
      fields: [],
      referenceGroup: "Theme",
      level: 1,
    });
    const entries = references({
      ...model,
      overview: {
        ...model.overview!,
        features: [
          feature(
            "Theme overview",
            "Theme",
            "A lengthy story about the theme's members.",
          ),
          feature(
            "Granted theme benefit",
            "Class Feature",
            "You gain a conditional bonus.",
          ),
        ],
      },
    });
    expect(
      entries
        .filter((entry) => entry.group === "Theme")
        .map((entry) => entry.id),
    ).toEqual(["Granted theme benefit"]);
    expect(entries[0]?.group).toBe("Theme");
    expect(entries[0]?.parts).toEqual(
      referenceParts("You gain a conditional bonus."),
    );
  });
  it("stacks balanced two-column categories instead of flowing categories down whole-page columns", () => {
    const entries = [
      "Class features",
      "Class features",
      "Class features",
      "Class features",
      "Racial traits",
      "Racial traits",
    ].map((group, index) => ({
      id: String(index),
      name: String(index),
      group,
      source: "",
      parts: [],
    }));
    const measurements = new Map(
      entries.map((entry) => [
        entry.id,
        { height: 60, overhead: 60, parts: [] },
      ]),
    );
    const pages = paginateReferenceGroups(entries, measurements, 400, 30);
    expect(pages).toHaveLength(1);
    expect(pages[0]?.map((block) => block.group)).toEqual([
      "Class features",
      "Racial traits",
    ]);
    expect(
      pages[0]?.[0]?.columns.map((column) => column.map((entry) => entry.id)),
    ).toEqual([
      ["0", "1"],
      ["2", "3"],
    ]);
    expect(
      pages[0]?.[1]?.columns.map((column) => column.map((entry) => entry.id)),
    ).toEqual([["4"], ["5"]]);
    expect(
      paginateReferenceGroups(
        entries.slice(0, 3),
        measurements,
        400,
        30,
      )[0]?.[0]?.columns.map((column) => column.length),
    ).toEqual([2, 1]);
    const smaller = paginateReferenceGroups(entries, measurements, 270, 30);
    expect(smaller).toHaveLength(2);
    expect(smaller[1]?.[0]?.group).toBe("Racial traits");
    expect(
      smaller.flatMap((page) => page.flatMap((block) => block.columns.flat())),
    ).toEqual(entries);
  });
  it("continues oversized category cards without repeating headings or losing prose", () => {
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
    const pages = paginateReferenceGroups(
      [entry],
      new Map([
        [entry.id, { height: 650, overhead: 50, parts: parts.map(() => 150) }],
      ]),
      400,
      30,
    );
    const blocks = pages.flat();
    expect(blocks.filter((block) => block.opening)).toHaveLength(1);
    expect(
      blocks.flatMap((block) =>
        block.columns.flat().flatMap((card) => card.parts),
      ),
    ).toEqual(parts);
    expect(
      blocks.flatMap((block) => block.columns.flat()).at(-1)?.continued,
    ).toBe(true);
    expect(paginateReferenceGroups([], new Map(), 400, 30)).toEqual([]);
  });
  it.each(["Feats", "Racial traits"])(
    "keeps whole %s together when possible, but splits oversized categories",
    (category) => {
      const makeEntries = (count: number): ReferenceEntry[] => [
        {
          id: "before",
          name: "Before",
          group: "Class features",
          source: "",
          parts: [],
        },
        ...Array.from({ length: count }, (_, index) => ({
          id: `feat:${index}`,
          name: `Feat ${index}`,
          group: category,
          source: "",
          parts: [],
        })),
        {
          id: "after",
          name: "After",
          group: "Other features",
          source: "",
          parts: [],
        },
      ];
      const measure = (entries: readonly ReferenceEntry[]) =>
        new Map(
          entries.map((entry) => [
            entry.id,
            {
              height: entry.id === "before" ? 170 : 60,
              overhead: 0,
              parts: [],
            },
          ]),
        );
      const entries = makeEntries(6);
      const pages = paginateReferenceGroups(entries, measure(entries), 400, 30);
      expect(pages).toHaveLength(2);
      expect(pages[0]?.map((block) => block.group)).toEqual(["Class features"]);
      expect(pages[1]?.map((block) => block.group)).toEqual([
        category,
        "Other features",
      ]);
      expect(pages[1]?.[0]?.columns.map((column) => column.length)).toEqual([
        3, 3,
      ]);
      expect(
        pages.flatMap((page) => page.flatMap((block) => block.columns.flat())),
      ).toEqual(entries);
      const oversized = makeEntries(12);
      const split = paginateReferenceGroups(
        oversized,
        measure(oversized),
        400,
        30,
      );
      expect(split[0]?.map((block) => block.group)).toEqual([
        "Class features",
        category,
      ]);
      expect(
        split.flat().filter((block) => block.group === category),
      ).toHaveLength(2);
      expect(
        split.flatMap((page) => page.flatMap((block) => block.columns.flat())),
      ).toEqual(oversized);
    },
  );
  it("does not invent reference entities from defensive stats or expanded reminders", () => {
    const entries = references({
      ...model,
      overview: {
        ...model.overview!,
        defensiveTraits: [{ label: "Resistance", value: "Fire 5" }],
        summaryReminders: [],
        reminders: [{ label: "Expanded reminder", value: "Derived prose" }],
      },
    });
    expect(
      entries.some(
        (entry) =>
          entry.id === "defensive-traits" ||
          entry.id.startsWith("reference-reminder:"),
      ),
    ).toBe(false);
  });
  it("budgets a category heading only once across columns", () => {
    const entries = ["first", "second", "third"].map((id) => ({
      id,
      name: id,
      group: "Feats",
      source: "",
      parts: [],
    }));
    const measured = new Map(
      entries.map((entry) => [
        entry.id,
        { height: 80, overhead: 80, parts: [] },
      ]),
    );
    // The first column fits one entry + heading; the next fits two entries
    // because a category continuing across columns has no repeated heading.
    expect(
      paginateReferences(entries, measured, 200, 50).map((c) => c.length),
    ).toEqual([1, 2]);
  });
  it("moves a category opening to keep its first two cards together when feasible", () => {
    const entries = [
      "Class features",
      "Racial traits",
      "Racial traits",
      "Feats",
    ].map((group, index) => ({
      id: String(index),
      name: String(index),
      group,
      source: "",
      parts: [],
    }));
    const measured = new Map(
      entries.map((entry) => [
        entry.id,
        { height: 80, overhead: 80, parts: [] },
      ]),
    );
    const columns = paginateReferences(entries, measured, 280, 30);
    expect(columns.map((column) => column.map((entry) => entry.id))).toEqual([
      ["0"],
      ["1", "2"],
      ["3"],
    ]);
    // No repeated title is charged in the continuation; content order remains.
    expect(columns.flat()).toEqual(entries);
    // With enough remaining space, a new category stays in the current column.
    expect(
      paginateReferences(entries, measured, 400, 30)[0]?.map(
        (entry) => entry.id,
      ),
    ).toEqual(["0", "1", "2"]);
    // A pair too tall for a fresh column must not introduce pointless whitespace.
    const large = new Map(measured);
    large.set("2", { height: 200, overhead: 200, parts: [] });
    expect(
      paginateReferences(entries, large, 280, 30)[0]?.map((entry) => entry.id),
    ).toEqual(["0", "1"]);
    // Summary continuation has no category headings and retains ordinary flow.
    expect(
      paginateReferences(entries, measured, 280)[0]?.map((entry) => entry.id),
    ).toEqual(["0", "1"]);
  });
  it("sorts origin sections by known acquisition level then name, leaving unknown levels last", () => {
    const feature = (name: string, group: string, level?: number) => ({
      id: name,
      name,
      group,
      description: name,
      summary: name,
      source: "Synthetic",
      fields: [],
      fullTextAvailable: true,
      ...(level === undefined ? {} : { level }),
    });
    const entries = references({
      ...model,
      overview: {
        ...model.overview!,
        features: [
          feature("A later", "Feat", 6),
          feature("Z early", "Feat", 1),
          feature("A early", "Feat", 1),
          feature("Unknown", "Feat"),
          {
            ...feature("Theme child", "Class Feature", 2),
            referenceGroup: "Theme",
          },
        ],
      },
    });
    expect(
      entries.filter((entry) => entry.feature).map((entry) => entry.name),
    ).toEqual(["Theme child", "A early", "Z early", "A later", "Unknown"]);
    expect(entries[0]?.group).toBe("Theme");
  });
  it("places card pages after the scratchpad and full references", () => {
    const html = renderToStaticMarkup(
      <SheetOverview
        model={model}
        name="Fixture"
        portrait={undefined}
        paper="letter"
        monochrome={false}
        blankHP={false}
      >
        <section data-card-position="here" />
      </SheetOverview>,
    );
    const marker = html.indexOf('data-card-position="here"');
    expect(marker).toBeGreaterThan(
      html.indexOf('class="ov-scratch-layout ov-scratch-upper"'),
    );
    expect(html.lastIndexOf('class="ov-measure-column')).toBeLessThan(marker);
  });
  it("supplies a continuous starting page to card rendering", () => {
    const html = renderToStaticMarkup(
      <SheetOverview
        model={model}
        name="Fixture"
        portrait={undefined}
        paper="letter"
        monochrome={false}
        blankHP={false}
      >
        {(firstPage) => <span data-card-start={firstPage} />}
      </SheetOverview>,
    );
    expect(html).toContain('data-card-start="3"');
  });
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
    expect(table).toContain('<thead class="sp-sr-only">');
    const heading = html
      .split('class="ov-tracking-title"')[1]!
      .split("</h3>")[0]!;
    expect(heading.match(/class="ov-tracking-number"/g)).toHaveLength(10);
    for (let n = 1; n <= 10; n++)
      expect(table).toContain(`<th scope="col">${n}</th>`);
    expect(table.match(/class="ov-encounter-box"/g)).toHaveLength(20);
  });
  it("provides five numbered daily tracking marks per power row", () => {
    const fixture = {
      ...model,
      powers: ["Alpha daily", "Beta daily"].map((name) => ({
        name,
        kind: "power" as const,
        usage: "Daily",
        actionType: "Minor",
        fields: [],
      })),
    };
    const html = renderToStaticMarkup(
      <SheetOverview
        model={fixture}
        name="Fixture"
        portrait={undefined}
        paper="letter"
        monochrome={false}
        blankHP={false}
      />,
    );
    const table = html
      .split('aria-label="Daily power usage"')[1]!
      .split("</table>")[0]!;
    expect(table.match(/<col\//g)).toHaveLength(6);
    expect(table).toContain('<thead class="sp-sr-only">');
    const heading = html
      .split('class="ov-tracking-title"')[1]!
      .split("</h3>")[0]!;
    expect(heading.match(/class="ov-tracking-number"/g)).toHaveLength(5);
    for (let n = 1; n <= 5; n++)
      expect(table).toContain(`<th scope="col">${n}</th>`);
    expect(table.match(/class="ov-daily-box"/g)).toHaveLength(10);
    expect(table).toContain("Alpha daily");
    expect(table).toContain("Beta daily");
  });
  it("puts date in Session notes and compact identity in the scratchpad footer", () => {
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
    const footer = html
      .split('aria-label="Play scratchpad"')[1]!
      .split("<footer")[1]!
      .split("</footer>")[0]!;
    expect(footer).toContain("Ingi · Dwarf Paladin 7");
    expect(footer).toContain("<span>Scratchpad</span>");
    expect(footer).not.toContain("Date");
    const notesHeader = html.split("Session notes")[1]!.split("</h3>")[0]!;
    expect(notesHeader).toContain(
      'class="ov-session-date"><strong>Date</strong><i></i>',
    );
    expect(footer).toContain('class="ov-page-number">2</span>');
    expect(html).not.toContain('class="sp-running-header');
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
    const xp = html.split('class="sp-xp-tracker"')[1]!.split("</div>")[0]!;
    expect(xp).toContain("<span>XP</span>");
    expect(xp).not.toContain("<i");
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
  it("does not promote expanded core-power reminders to reference entities", () => {
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
    expect(html).not.toContain(expanded.value);
  });
  it("indexes basic attacks as powers without standalone alternative tables", () => {
    const entries = references({
      ...model,
      powers: [
        {
          kind: "power",
          name: "Melee Basic Attack",
          usage: "At-Will",
          actionType: "Standard Action",
          attack: "+12 vs AC",
          fields: [],
        },
        {
          kind: "power",
          name: "Ranged Basic Attack",
          usage: "At-Will",
          actionType: "Standard Action",
          attack: "+10 vs AC",
          fields: [],
        },
      ],
    });
    expect(entries.some((entry) => entry.id.startsWith("basic:"))).toBe(false);
    const index = entries.find((entry) => entry.id === "powers:At-Will")!;
    expect(index.parts.map((part) => part.indexAction)).toEqual([
      "Standard Action",
      "Standard Action",
    ]);
    expect(
      index.parts.flatMap((part) =>
        part.block.kind === "table" ? part.block.rows.map((row) => row[0]) : [],
      ),
    ).toEqual(["Melee Basic Attack", "Ranged Basic Attack"]);
    const html = renderToStaticMarkup(
      <SheetOverview
        model={{
          ...model,
          powers: [
            {
              kind: "power",
              name: "Melee Basic Attack",
              usage: "At-Will",
              actionType: "Standard Action",
              attack: "+12 vs AC",
              fields: [],
            },
          ],
        }}
        name="Fixture"
        portrait={undefined}
        paper="letter"
        monochrome={false}
        blankHP={false}
      />,
    );
    expect(html).toContain('class="selection-metadata-icon action-type-icon"');
    expect(html).not.toContain(">Action</th>");
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
        .split("</section>")[0]!;
      expect(box).not.toContain("<dt>Player</dt>");
      expect(box).not.toContain("<dt>Company</dt>");
      expect(html).toContain('<p class="ov-player-company"></p>');
      for (const label of [
        "Size",
        "Deity",
        "Alignment",
        "Paragon path",
        "Epic destiny",
      ])
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
      '<span class="ov-panel-note">More on power cards…</span>',
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
    expect(
      html.match(/<td>Synthetic blade(?:<sup[^>]*>E<\/sup>)?<\/td>/g),
    ).toHaveLength(1);
    expect(html).toContain(
      '<span>Synthetic blade<sup class="ov-equipped-marker"',
    );
    expect(html).toContain("Main hand");
    expect(html).toContain(">Inventory</h3>");
  });
  it("makes equipped inventory a slot-first lookup and omits carried slot labels", () => {
    const item = (
      name: string,
      slots: string[],
      fields: { label: string; value: string }[] = [],
      category = "miscellaneous",
    ) => ({
      name,
      slots,
      fields,
      category,
      equipped: 1,
      quantity: 2,
    });
    const entries = references({
      ...model,
      overview: {
        ...model.overview!,
        inventory: [
          item("A sword", ["main-hand"], [], "weapons"),
          item("Z helmet", ["head"], [], "worn-items"),
          item(
            "Boots",
            [],
            [{ label: "Item Slot", value: "Feet" }],
            "worn-items",
          ),
        ],
      },
    });
    const tables = (id: string) =>
      entries
        .find((entry) => entry.id === id)!
        .parts.map((part) => part.block)
        .filter((block) => block.kind === "table");
    const equipped = tables("inventory:true");
    expect(
      equipped.every(
        (table) => table.headers?.join("/") === "Slot/Item/Slot/Item",
      ),
    ).toBe(true);
    const pairedRows = equipped.flatMap((table) => table.rows);
    expect(pairedRows[0]?.[0]).toBe("Head");
    expect(pairedRows[0]?.[2]).toBe("Main hand");
    expect(pairedRows[6]?.[0]).toBe("Feet");
    const equippedRows = [0, 2]
      .flatMap((column) =>
        pairedRows.map((row) => row.slice(column, column + 2)),
      )
      .filter((row) => row[0]);
    expect(equippedRows.filter((row) => row[1] !== "—")).toEqual([
      ["Head", "Z helmet"],
      ["Feet", "Boots"],
      ["Main hand", "A sword"],
    ]);
    expect(equippedRows).toContainEqual(["Neck", "—"]);
    expect(equippedRows).toContainEqual(["Off hand", "—"]);
    expect(equippedRows.some((row) => row[0] === "Ki focus")).toBe(false);
    expect(entries.find((entry) => entry.id === "inventory:true")?.name).toBe(
      "Equipped",
    );
    const carried = tables("inventory:false");
    expect(
      carried.every((table) => table.headers?.join("/") === "Item/Qty"),
    ).toBe(true);
    expect(carried.flatMap((table) => table.rows)).toEqual([
      ["A sword", "2"],
      ["Boots", "2"],
      ["Z helmet", "2"],
    ]);
    expect(
      entries
        .find((entry) => entry.id === "inventory:false")
        ?.parts.map((part) => part.tableCategory),
    ).toEqual(["Weapons", "Worn items", "Worn items"]);
    expect(
      entries
        .find((entry) => entry.id === "inventory:true")
        ?.parts.flatMap((part) =>
          part.block.kind !== "table"
            ? []
            : [
                ...(part.block.rows[0]?.[1] !== "—"
                  ? (part.slotCells?.map((slot) => slot.icon) ?? [])
                  : []),
                ...(part.block.rows[0]?.[3] !== "—"
                  ? (part.rightSlotCells?.map((slot) => slot.icon) ?? [])
                  : []),
              ],
        ),
    ).toEqual(["hard-hat", "sword", "footprints"]);
  });
  it("includes equipped-only holdings and total stack quantities with equipped superscripts", () => {
    const fixture = {
      ...model,
      overview: {
        ...model.overview!,
        inventory: [
          {
            name: "Equipped only",
            quantity: 1,
            equipped: 1,
            slots: ["body"],
            fields: [],
          },
          {
            name: "Stack",
            quantity: 5,
            equipped: 2,
            slots: ["main-hand"],
            fields: [],
          },
          {
            name: "Carried only",
            quantity: 3,
            equipped: 0,
            slots: [],
            fields: [],
          },
        ],
      },
    };
    const inventory = references(fixture).find(
      (entry) => entry.id === "inventory:false",
    )!;
    expect(
      inventory.parts.flatMap((part) =>
        part.block.kind === "table" ? part.block.rows : [],
      ),
    ).toEqual([
      ["Carried only", "3"],
      ["Equipped only", "1"],
      ["Stack", "5"],
    ]);
    expect(
      inventory.parts.map((part) => Boolean(part.equippedInventory)),
    ).toEqual([false, true, true]);
    const html = renderToStaticMarkup(
      <SheetOverview
        model={fixture}
        name="Fixture"
        portrait={undefined}
        paper="letter"
        monochrome={false}
        blankHP={false}
      />,
    );
    expect(html.match(/class="ov-equipped-marker"/g)).toHaveLength(2);
    expect(html).toContain('class="ov-slot-cell"');
    expect(html).toContain("lucide-shirt");
  });
  it("places side-by-side carried/stored Currency above two-column Equipped", () => {
    const fixture = {
      ...model,
      currency: [
        { label: "Carried", value: "13 gp" },
        { label: "Stored", value: "20 pp" },
      ],
      notes: [
        { label: "CarriedMoney", value: "13 gp" },
        { label: "StoredMoney", value: "20 pp" },
      ],
      overview: { ...model.overview!, inventory: [] },
    };
    const entries = references(fixture);
    const equipped = entries.find((entry) => entry.id === "inventory:true")!;
    expect(equipped.currency).toEqual(fixture.currency);
    expect(
      equipped.parts.every(
        (part) =>
          part.block.kind === "table" && part.block.rows[0]?.[1] === "—",
      ),
    ).toBe(true);
    expect(entries.some((entry) => entry.id.startsWith("note:"))).toBe(false);
    const html = renderToStaticMarkup(
      <SheetOverview
        model={fixture}
        name="Fixture"
        portrait={undefined}
        paper="letter"
        monochrome={false}
        blankHP={false}
      />,
    );
    expect(html).toContain('class="ov-reference-card ov-equipment-stack"');
    expect(html).toContain(">Currency</h3>");
    expect(html.indexOf(">Currency</h3>")).toBeLessThan(
      html.indexOf(">Equipped</h3>"),
    );
    expect(equipped.group).toBe("Items");
    expect(html).toContain('aria-label="Carried currency"');
    expect(html).toContain('aria-label="Stored currency"');
    expect(html).not.toContain('aria-label="Total currency"');
    expect(html).toContain("<span>GP</span><strong>13</strong>");
  });
  it("restarts inventory stripes per category and uses quantity prefixes with a blank for one", () => {
    const fixture = {
      ...model,
      overview: {
        ...model.overview!,
        inventory: [
          {
            name: "Gear one",
            category: "adventuring-gear",
            quantity: 1,
            equipped: 0,
            slots: [],
            fields: [],
          },
          ...Array.from({ length: 10 }, (_, i) => ({
            name: `Armor ${i}`,
            category: "armor-shields",
            quantity: 2,
            equipped: 0,
            slots: [],
            fields: [],
          })),
          {
            name: "Blade one",
            category: "weapons",
            quantity: 3,
            equipped: 0,
            slots: [],
            fields: [],
          },
          {
            name: "Blade two",
            category: "weapons",
            quantity: 4,
            equipped: 0,
            slots: [],
            fields: [],
          },
        ],
      },
    };
    const html = renderToStaticMarkup(
      <SheetOverview
        model={fixture}
        name="Fixture"
        portrait={undefined}
        paper="letter"
        monochrome={false}
        blankHP={false}
      />,
    );
    const firstColumn = html
      .split('class="ov-inventory-column"')[1]!
      .split('class="ov-inventory-column"')[0]!;
    expect(
      firstColumn.match(/class="ov-reference-part is-striped"/g),
    ).toHaveLength(2);
    expect(firstColumn.match(/class="ov-reference-part"/g)).toHaveLength(1);
    expect(firstColumn).toContain('aria-label="Quantity 1"><span> </span>');
    expect(firstColumn).toContain('aria-label="Quantity 3"><span>3×</span>');
    expect(html).not.toContain(">Qty</th>");
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
    const footer = scratchpad
      .split('class="sp-page-footer ov-reference-footer"')[1]!
      .split("</footer>")[0]!;
    expect(footer).toContain('class="ov-page-number">2</span>');
    expect(footer).toContain("Overview fixture");
    expect(footer).toContain("<span>Scratchpad</span>");
    expect(footer).not.toContain("Character reference");
    expect(scratchpad).toContain('<th scope="col">Ends</th>');
    expect(scratchpad).toContain('>Session notes<span class="ov-panel-note">');
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
