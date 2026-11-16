import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Prose, proseBlocks } from "./Prose";

describe("shared prose renderer", () => {
  it("removes source indentation and treats every non-empty line as a paragraph", () => {
    const source =
      "    First paragraph.\r\n\tSecond paragraph.\r\n\r\n\r\n  Third paragraph.";

    expect(proseBlocks(source)).toEqual([
      { kind: "paragraph", text: "First paragraph." },
      { kind: "paragraph", text: "Second paragraph." },
      { kind: "paragraph", text: "Third paragraph." },
    ]);
    expect(source).toContain("    First paragraph.");
  });

  it("preserves recognizable headings and contiguous unordered and numbered lists", () => {
    expect(
      proseBlocks(
        [
          "  DIVINE SANCTION",
          "  Many paladin powers impose this mark.",
          "  Benefits:",
          "    • First benefit",
          "    *Second benefit",
          "",
          "  3. Third step",
          "  4) Fourth step",
        ].join("\n"),
      ),
    ).toEqual([
      { kind: "heading", text: "DIVINE SANCTION" },
      {
        kind: "paragraph",
        text: "Many paladin powers impose this mark.",
      },
      { kind: "heading", text: "Benefits" },
      {
        kind: "list",
        ordered: false,
        items: ["First benefit", "Second benefit"],
      },
      {
        kind: "list",
        ordered: true,
        start: 3,
        items: ["Third step", "Fourth step"],
      },
    ]);
  });

  it("treats a heading-like final line as prose because nothing follows it", () => {
    expect(proseBlocks("+2 Fortitude, Reflex, and Will")).toEqual([
      { kind: "paragraph", text: "+2 Fortitude, Reflex, and Will" },
    ]);
    expect(proseBlocks("DIVINE SANCTION\nThe mark.\nSpecial:")).toEqual([
      { kind: "heading", text: "DIVINE SANCTION" },
      { kind: "paragraph", text: "The mark." },
      { kind: "paragraph", text: "Special:" },
    ]);
    expect(
      proseBlocks("Levels\n<table><tr><td>1</td></tr></table>")[0],
    ).toEqual({ kind: "heading", text: "Levels" });
  });
  it("escapes corpus text instead of interpreting it as HTML", () => {
    const markup = renderToStaticMarkup(
      createElement(Prose, {
        value: '<img src=x onerror="alert(1)">\n- <script>unsafe()</script>',
      }),
    );

    expect(markup).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(markup).toContain("&lt;script&gt;unsafe()&lt;/script&gt;");
    expect(markup).not.toContain("<img");
    expect(markup).not.toContain("<script>");
  });

  it("preserves HTML table rows and headers as semantic tables", () => {
    expect(
      proseBlocks(
        "<table><tr><th>Level</th><th>Hunter's Quarry</th></tr><tr><td>1</td><td>1d6</td></tr></table>",
      ),
    ).toEqual([
      {
        kind: "table",
        headers: ["Level", "Hunter's Quarry"],
        rows: [["1", "1d6"]],
      },
    ]);

    const markup = renderToStaticMarkup(
      createElement(Prose, {
        value: "Use one option.<br>Then continue &amp; resolve it.",
      }),
    );
    expect(markup).toContain("Use one option.");
    expect(markup).toContain("Then continue &amp; resolve it.");
    expect(markup).not.toContain("&lt;br&gt;");
  });
  it("sets a legacy <rule> callout apart as its own paragraph", () => {
    expect(
      proseBlocks(
        "Walk the rope.\n<rule>Balance: The check is part of a move action.</rule>",
      ),
    ).toEqual([
      { kind: "paragraph", text: "Walk the rope." },
      {
        kind: "paragraph",
        text: "Balance: The check is part of a move action.",
      },
    ]);
  });
  it("tolerates unbalanced legacy block tags without swallowing the text after them", () => {
    // An unclosed <rule> (Hop Down) reads like a closed one.
    expect(
      proseBlocks(
        "Hop down 10 feet.\n<rule>Hop Down: Part of a move action.\n♦\tDC: DC 15.",
      ),
    ).toEqual([
      { kind: "paragraph", text: "Hop down 10 feet." },
      { kind: "paragraph", text: "Hop Down: Part of a move action." },
      { kind: "paragraph", text: "♦\tDC: DC 15." },
    ]);
    // A stray </table> (Create Scarecrow) is only a line break.
    expect(
      proseBlocks(
        "Make a DC 25 Arcana check.\nMaster's Sight * Encounter</table>",
      ),
    ).toEqual([
      { kind: "paragraph", text: "Make a DC 25 Arcana check." },
      { kind: "paragraph", text: "Master's Sight * Encounter" },
    ]);
    // A second <table> where </table> belonged (Wave) closes the table.
    const twice =
      "CONCORDANCE\n<table>Level\tScore\n1st\t+2<table>\n\nPleased (16–20)\nThe bonus becomes +4.";
    expect(proseBlocks(twice)).toEqual([
      { kind: "heading", text: "CONCORDANCE" },
      { kind: "table", headers: ["Level", "Score"], rows: [["1st", "+2"]] },
      { kind: "heading", text: "Pleased (16–20)" },
      { kind: "paragraph", text: "The bonus becomes +4." },
    ]);
    // A closing tag without its ">" (Skull of Sartine) still closes it.
    expect(
      proseBlocks(
        "<table>Level\tScore\n1st\t+2</table\n\nAfter the table.",
      ).map((block) => block.kind),
    ).toEqual(["table", "paragraph"]);
    const markup = renderToStaticMarkup(createElement(Prose, { value: twice }));
    expect(markup).not.toContain("&lt;table");
    expect(markup).toContain("The bonus becomes +4.");
  });
  it("reads an artifact's tab-less concordance table as label and score rows", () => {
    expect(
      proseBlocks(
        [
          "CONCORDANCE",
          "<table>Starting score 5",
          "Owner gains a level +1d10",
          "Owner kills an aquatic creature ",
          "that does not worship Melora (maximum 1/day) +1",
          "Owner attacks a creature that worships Melora –2<table>",
          "Pleased (16–20)",
          "The artifact is content.",
        ].join("\n"),
      ),
    ).toEqual([
      { kind: "heading", text: "CONCORDANCE" },
      {
        kind: "table",
        rows: [
          ["Starting score", "5"],
          ["Owner gains a level", "+1d10"],
          [
            "Owner kills an aquatic creature that does not worship Melora (maximum 1/day)",
            "+1",
          ],
          ["Owner attacks a creature that worships Melora", "–2"],
        ],
      },
      { kind: "heading", text: "Pleased (16–20)" },
      { kind: "paragraph", text: "The artifact is content." },
    ]);
    // A tab-less table whose last line has no score stays plain lines.
    expect(
      proseBlocks(
        "<table>Result Destination Plane\n2 Feywild\n3 Shadowfell</table>",
      ).map((block) => block.kind),
    ).not.toContain("table");
    // A tabbed concordance has no header row, and a doubled tab is spacing.
    expect(
      proseBlocks(
        "<table>Starting score\t5\nOwner is an eladrin\t\t+2\nOwner is an elf\t+1</table>",
      ),
    ).toEqual([
      {
        kind: "table",
        rows: [
          ["Starting score", "5"],
          ["Owner is an eladrin", "+2"],
          ["Owner is an elf", "+1"],
        ],
      },
    ]);
  });
  it("renders legacy tab-delimited tables without fusing headings, cells or surrounding prose", () => {
    const value =
      "An effect before the table.\n<table>Level\tExtra damage\n1–8\t+1d8\n9–16\t+2d8\n17–24\t+3d8</table>\nAn effect after the table.";
    expect(proseBlocks(value)).toEqual([
      { kind: "paragraph", text: "An effect before the table." },
      {
        kind: "table",
        headers: ["Level", "Extra damage"],
        rows: [
          ["1–8", "+1d8"],
          ["9–16", "+2d8"],
          ["17–24", "+3d8"],
        ],
      },
      { kind: "paragraph", text: "An effect after the table." },
    ]);
    const markup = renderToStaticMarkup(createElement(Prose, { value }));
    expect(markup).toContain('<table class="prose-table"><thead>');
    expect(markup).toContain('<th scope="col">Level</th>');
    expect(markup).toContain("<td>1–8</td><td>+1d8</td>");
    expect(markup).not.toContain("<h6>");
  });
  it("escapes cell markup and never copies source HTML attributes", () => {
    const markup = renderToStaticMarkup(
      createElement(Prose, {
        value:
          '<table onclick="bad()"><tr><th>Name</th><th>Effect</th></tr><tr><td>A &amp; B</td><td><img src=x onerror="bad()"></td></tr></table>',
      }),
    );
    expect(markup).toContain("A &amp; B");
    expect(markup).toContain("&lt;img");
    expect(markup).not.toContain("<img");
    expect(markup).not.toContain('onclick="bad()"');
  });
});

describe("a See Below lead", () => {
  const list = "* You gain darkvision.\n* You cannot be blinded.";
  const listBlock = {
    kind: "list",
    ordered: false,
    items: ["You gain darkvision.", "You cannot be blinded."],
  };

  it("is dropped from any field when a list follows it", () => {
    for (const lead of [
      "See Below:",
      "See below:",
      "See Below: ",
      "See below.",
      "See Below",
      "see below",
      "  see below :",
    ])
      expect(proseBlocks(`${lead}\n${list}`)).toEqual([listBlock]);
    expect(proseBlocks("See Below:\r\n• One.\r\n• Two.")).toEqual([
      { kind: "list", ordered: false, items: ["One.", "Two."] },
    ]);
    const markup = renderToStaticMarkup(
      createElement(Prose, { value: `See Below:\n${list}` }),
    );
    expect(markup).not.toMatch(/see below/i);
    expect(markup).toContain("<li>You gain darkvision.</li>");
  });

  it("stays when it is not a lead line pointing at a following list", () => {
    for (const unchanged of [
      "See below",
      "See below.",
      "See Below:",
      "See below: a benefit",
      "See Below:\nA paragraph, not a list.",
      "1 hour (see below)",
      "Power (Daily): Minor Action. See below:\n* Kept.",
      `Lead text.\nSee Below:\n${list}`,
    ])
      expect(
        renderToStaticMarkup(createElement(Prose, { value: unchanged })),
      ).toMatch(/see below/i);
    // A ritual's "Component Cost: See below" points at its body text.
    expect(proseBlocks("See below")).toEqual([
      { kind: "paragraph", text: "See below" },
    ]);
  });
});
