import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildSheetModel } from "@4ecb/sheet-model";
import {
  SheetOverview,
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
  it("limits the summary feat reminders to actionable entries without removing full references", () => {
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
        model={{ ...model, overview: { ...model.overview!, features } }}
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
    expect(markup).toContain("Pass. Perception");
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
