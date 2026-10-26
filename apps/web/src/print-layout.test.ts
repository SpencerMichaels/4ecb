import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { appStyles } from "./test-styles";

const styles = appStyles;
const letterStyles = readFileSync(
  new URL("../public/print-letter.css", import.meta.url),
  "utf8",
);
const a4Styles = readFileSync(
  new URL("../public/print-a4.css", import.meta.url),
  "utf8",
);
const sheetSource = [
  "./CharacterSheetPage.tsx",
  "./PowerCard.tsx",
  "./ItemCard.tsx",
  "./use-print-card-fit.ts",
  "./print-power-attacks.ts",
]
  .map((path) => readFileSync(new URL(path, import.meta.url), "utf8"))
  .join("\n");

describe("print layout contract", () => {
  it("shares the first-column split between action/range and primary attack/target rows", () => {
    for (const selector of [
      "print-card-action-band",
      "print-card-combat-band",
    ]) {
      expect(styles).toMatch(
        new RegExp(
          `\\.${selector}\\s*\\{[^}]*grid-template-columns:\\s*var\\(\\s*--print-card-header-first-column,\\s*max-content\\s*\\)\\s+minmax\\(0, 1fr\\)`,
        ),
      );
    }
    expect(sheetSource).toContain(
      'element.style.removeProperty("--print-card-header-first-column")',
    );
    expect(sheetSource).toContain(
      '".print-card-combat-band:not(.is-secondary) > div:first-child"',
    );
  });
  it("places optional regular-weight keywords first in the subheader with a key icon", () => {
    const powerSource = sheetSource.slice(
      sheetSource.indexOf("export function PowerCard("),
      sheetSource.indexOf("export function ItemCard("),
    );
    const keywords = powerSource.indexOf('className="print-card-keyword-band"');
    expect(keywords).toBeLessThan(
      powerSource.indexOf('className="print-card-action-band"'),
    );
    expect(powerSource).toContain("{card.keywords?.trim() ? (");
    expect(powerSource).toContain('<Icon name="key" />');
    expect(powerSource).not.toContain("print-card-keywords-property");
    expect(styles).toMatch(
      /\.print-card-keyword-band\s*\{[^}]*font-weight:\s*400;/,
    );
    expect(styles).toContain(
      ".print-card-keyword-band,\n.print-card-action-band,",
    );
    expect(styles).toMatch(
      /\.print-reference-card\s*\{[^}]*grid-template-rows:\s*auto auto minmax\(0, 1fr\) auto auto;/,
    );
    expect(styles).toMatch(
      /\.print-power-card\.has-keywords\s*\{[^}]*grid-template-rows:\s*auto auto auto minmax\(0, 1fr\) auto;/,
    );
    expect(styles).toMatch(
      /\.print-power-card\s*\{[^}]*grid-template-rows:\s*auto auto minmax\(0, 1fr\) auto;/,
    );
    expect(powerSource).toContain(
      "{(card.additionalEffects ?? []).length === 0 ? null : (",
    );
    expect(powerSource).not.toContain(
      '<div className="print-card-additional">Additional effects</div>',
    );
  });
  it("wraps long titles without shrinking or displacing the fixed usage badge", () => {
    expect(styles).toMatch(
      /\.print-reference-card > header h3\s*\{[^}]*white-space:\s*normal;[^}]*overflow-wrap:\s*anywhere;/,
    );
    expect(styles).toMatch(
      /\.print-utility-usage-badge\s*\{[^}]*align-self:\s*flex-start;[^}]*flex-shrink:\s*0;/,
    );
    expect(styles).toMatch(
      /\.print-power-card > header h3 > span:last-child\s*\{[^}]*white-space:\s*normal;/,
    );
    expect(styles).toMatch(
      /\.print-power-card > header \.action-type-icon\s*\{[^}]*align-self:\s*flex-start;[^}]*margin-top:\s*max\(0px, calc\(0\.6em - 0\.075in\)\);/,
    );
  });
  it("softens internal subheader separators but retains the prominent bottom rule", () => {
    expect(styles).toMatch(
      /\.print-card-action-band\s*\{[^}]*border-bottom:\s*1px solid\s+color-mix/,
    );
    expect(styles).toMatch(
      /\.print-card-action-band > span\s*\{[^}]*border-right:\s*1px solid\s+color-mix/,
    );
    expect(styles).toMatch(
      /\.print-card-combat-band > div\s*\{[^}]*border-bottom:\s*1px solid var\(--card-color\);[^}]*border-right:\s*1px solid\s+color-mix/,
    );
    expect(styles).toContain(
      ".print-power-card:not(:has(.print-card-combat-band)) .print-card-action-band",
    );
  });
  it("places item keyword Properties below the numeric stat subheader", () => {
    expect(styles).toMatch(
      /\.print-item-stats\s*\{[^}]*border-bottom:\s*1px solid var\(--card-color\)/,
    );
    expect(styles).not.toContain(".print-item-stats.has-properties");
    expect(styles).toMatch(
      /\.print-item-properties p \{[^}]*text-indent:\s*0;/,
    );
    const itemSource = sheetSource.slice(
      sheetSource.indexOf("export function ItemCard("),
    );
    expect(itemSource.indexOf('className="print-item-stats"')).toBeLessThan(
      itemSource.indexOf(
        'className="print-item-stat-row print-item-properties"',
      ),
    );
    expect(
      itemSource.indexOf(
        'className="print-item-stat-row print-item-properties"',
      ),
    ).toBeLessThan(
      itemSource.indexOf('className="print-card-body print-item-body"'),
    );
    expect(styles).toMatch(/\.prose-table\s*\{[^}]*font-size:\s*inherit;/);
  });
  it("identifies utility frequency with a fixed-size colored title badge", () => {
    expect(sheetSource).toContain(
      "className={`print-utility-usage-badge usage-${usageTone}`}",
    );
    expect(sheetSource).toMatch(
      /usageTone === "encounter"\s*\? "E"\s*: usageTone === "daily"\s*\? "D"\s*: "W"/,
    );
    expect(styles).toMatch(
      /\.print-utility-usage-badge\s*\{[^}]*flex-shrink:\s*0;[^}]*font-size:\s*7\.5pt;/,
    );
    expect(styles).toMatch(
      /\.print-utility-usage-badge\.usage-encounter\s*\{[^}]*background:\s*#8b0000;/,
    );
    expect(styles).toMatch(
      /\.print-utility-usage-badge\.usage-daily\s*\{[^}]*background:\s*#777;/,
    );
  });
  it("removes wrapped separators and their space while keeping the target on its aligned row", () => {
    expect(styles).toMatch(/starts-wrapped-row::before[^}]*display:\s*none;/);
    expect(styles).toMatch(
      /\.print-card-attack-target\.starts-wrapped-row\s*\{[^}]*flex-basis:\s*100%;/,
    );
    expect(sheetSource).toContain(
      'cell.classList.remove("starts-wrapped-row")',
    );
    expect(sheetSource).toMatch(/withAuthoredPrintTargets\(\s*card,/);
  });
  it("keeps subsequent attacks inset and indents item-power text inside its heading strip", () => {
    expect(sheetSource).toContain("secondary={attackIndex > 0}");
    expect(styles).toMatch(
      /\.print-card-combat-band\.is-secondary\s*\{[^}]*border-radius:\s*0\.025in;[^}]*margin:\s*0;/,
    );
    expect(styles).toMatch(
      /\.print-card-combat-band\.is-secondary > div\s*\{[^}]*border:\s*0;/,
    );
    expect(styles).toMatch(
      /\.print-item-power > \.print-item-rule-text\s*\{[^}]*padding-inline:\s*0\.035in;/,
    );
    expect(styles).toMatch(
      /\.print-card-combat-band\.is-secondary \+ \.print-card-attack-rules\s*\{[^}]*padding-inline:\s*0\.035in;/,
    );
    expect(styles).toMatch(
      /\.print-card-combat-band\.is-secondary\s*\{[^}]*background:\s*color-mix\(in srgb, var\(--card-color\) 20%, var\(--card-paper\)\)/,
    );
    expect(styles).toMatch(
      /\.print-item-power-heading\s*\{[^}]*background:\s*color-mix\(in srgb, var\(--card-color\) 18%, var\(--card-paper\)\)/,
    );
  });
  it("fits body text and subheaders together while keeping titles at the preferred size", () => {
    expect(styles).toMatch(
      /\.print-reference-card\s*\{[^}]*font-size:\s*var\(--print-card-text-size, 8pt\)/,
    );
    expect(sheetSource).toContain('"--preferred-print-card-text-size"');
    expect(sheetSource).toContain("printCardFontSizes(preferred)");
    expect(sheetSource).toContain(
      'element.style.setProperty("--print-card-text-size", `${preferred}pt`)',
    );
    expect(sheetSource).toContain(
      'element.style.setProperty("--print-card-body-size", `${size}pt`)',
    );
    expect(sheetSource).not.toContain(
      'element.style.setProperty("--print-card-text-size", `${size}pt`)',
    );
    expect(styles).toMatch(
      /\.print-card-body\s*\{[^}]*font-size:\s*var\(--print-card-body-size, 8pt\)/,
    );
    expect(styles).toMatch(
      /\.print-card-combat-band\s*\{[^}]*font-size:\s*var\(--print-card-body-size, 8pt\)/,
    );
    expect(styles).toMatch(
      /\.print-item-power-heading\s*\{[^}]*font-size:\s*var\(--print-card-body-size, 8pt\)/,
    );
    expect(styles).not.toMatch(
      /\.print-reference-card\.is-(?:compact|condensed)\s*\{[^}]*font-size:/,
    );
    expect(sheetSource).toContain(
      "element.dataset.fitOverflow = String(!fits)",
    );
    expect(styles).toContain('content: "Text exceeds card at minimum size"');
    expect(styles).toMatch(
      /\.print-item-stats\s*\{[^}]*font-size:\s*var\(--print-card-body-size, 8pt\)/,
    );
  });
  it("encloses item-power headings and rules in one usage-colored box", () => {
    const heading = styles.match(
      /\.print-item-power-heading\s*\{([^}]*)\}/,
    )?.[1];
    expect(heading).toContain("font-weight: 700");
    expect(heading).toContain("background: color-mix");
    expect(heading).toContain("border-radius: 0.025in 0.025in 0 0");
    expect(heading).toContain("display: grid");
    expect(heading).toContain("align-items: start");
    expect(styles).toMatch(
      /\.print-item-power-action\s*\{[^}]*align-items:\s*flex-start;/,
    );
    expect(styles).toMatch(
      /\.print-item-power-usage\s*\{[^}]*white-space:\s*nowrap;/,
    );
    expect(styles).toMatch(
      /\.print-item-power-keywords\s*\{[^}]*font-weight:\s*400;/,
    );
    expect(sheetSource).not.toContain("{power.usage} • {power.actionType}");
    expect(sheetSource).toContain('className="print-item-power-keywords"');
    expect(sheetSource).toContain('className="print-item-power-content"');
    expect(styles).toMatch(
      /\.print-item-power-heading\.has-action-icon\s*\{[^}]*grid-template-columns:\s*0\.1in minmax\(0, 1fr\)/,
    );
    for (const [usage, color] of [
      ["at-will", "#aaddaa"],
      ["encounter", "#ddbbbb"],
      ["daily", "#d3d3d3"],
    ]) {
      expect(styles).toContain(
        `.print-item-power-heading.usage-${usage} {\n  background: var(--item-power-heading-${usage}, ${color});`,
      );
    }
    expect(heading).toContain(
      "border-bottom: 1px solid var(--item-power-color)",
    );
    expect(heading).toContain("margin-bottom: 0;");
    expect(styles).toMatch(
      /\.print-item-power\s*\{[^}]*border:\s*1px solid var\(--item-power-color\)/,
    );
    expect(styles).toMatch(
      /\.print-item-power > \.print-item-rule-text\s*\{[^}]*padding-block:\s*0\.025in;/,
    );
    expect(heading).not.toMatch(/margin-left:|margin-right:/);
    expect(styles).toMatch(
      /\.print-item-body section \+ \.print-item-power,\s*\.print-item-body \.print-item-power \+ \.print-item-rule\s*\{[^}]*margin-top:\s*calc\(var\(--print-card-section-gap\) \* 2\)/,
    );
  });
  it("omits an empty action band and reflows the card rows", () => {
    expect(sheetSource).toContain("{!hasActionBand ? null : (");
    expect(sheetSource).toContain(
      'name={isPersonal(attackType) ? "attack-personal" : "sword"}',
    );
    expect(sheetSource).toContain(
      'name={isPersonal(attack.target) ? "attack-personal" : "target"}',
    );
    expect(sheetSource).not.toContain("&nbsp;");
    expect(styles).not.toContain(".print-card-action-band.is-empty");
    expect(styles).toMatch(
      /\.print-power-card\.no-action-band\s*\{[^}]*grid-template-rows:\s*auto minmax\(0, 1fr\) auto;/,
    );
    expect(styles).toMatch(
      /\.print-item-card\.no-subheader\s*\{[^}]*grid-template-rows:\s*auto minmax\(0, 1fr\) auto auto;/,
    );
  });
  it("keeps table text the same dark color as the card body", () => {
    expect(styles).toMatch(
      /\.print-card-body\s*\{[^}]*color:\s*var\(--card-ink\);/,
    );
    expect(styles).toMatch(
      /\.print-reference-card\s*\{[^}]*--card-ink:\s*#111;/,
    );
    // Dark card colors apply only to on-screen panel cards, never to print.
    expect(styles).toMatch(
      /@media screen \{\s*:root\[data-theme="dark"\] \.print-reference-card\.is-panel \{[^}]*--card-paper: #1b2130;/,
    );
    expect(styles).toMatch(
      /\.print-card-variant-table\s*\{[^}]*color:\s*inherit;/,
    );
    expect(styles).toMatch(
      /\.print-card-variant-table td\s*\{[^}]*color:\s*inherit;/,
    );
  });
  it("anchors weapon tables at the body bottom with normal-weight weapon names", () => {
    expect(styles).toMatch(
      /\.print-power-card \.print-card-body\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column/,
    );
    expect(styles).toMatch(
      /\.print-card-weapon-variants\s*\{[^}]*margin-top:\s*auto;[^}]*padding-top:\s*var\(--print-card-section-gap\)/,
    );
    expect(styles).toMatch(
      /\.print-card-variant-table tbody th\s*\{[^}]*font-weight:\s*normal/,
    );
  });
  it("uses soft row backgrounds without borders and content-sized weapon columns", () => {
    expect(styles).toMatch(
      /\.print-card-variant-table\s*\{[^}]*table-layout:\s*auto/,
    );
    expect(styles).toMatch(
      /\.print-card-variant-table td\s*\{[^}]*border:\s*0;/,
    );
    expect(styles).toMatch(
      /\.print-card-variant-table tbody tr:nth-child\(even\)\s*\{[^}]*background:\s*color-mix/,
    );
    expect(styles).not.toMatch(
      /\.print-card-variant-table th:first-child\s*\{[^}]*width:/,
    );
  });
  it("keeps wrapped weapon names and adjacent attack expressions distinct", () => {
    expect(styles).toMatch(
      /\.print-card-variant-table tbody th\s*\{[^}]*padding-left:\s*calc\(0\.02in \+ 0\.8em\);[^}]*text-indent:\s*-0\.8em;/,
    );
    expect(styles).toMatch(
      /\.print-card-variant-table :is\(th, td\) \+ :is\(th, td\)\s*\{[^}]*border-left:\s*1px solid/,
    );
    expect(styles).toMatch(
      /\.print-variant-bonus\s*\{[^}]*font-weight:\s*700;/,
    );
  });
  it("defines Letter and A4 pages with a fixed three-by-three card grid", () => {
    expect(styles).toMatch(/@page\s*\{[\s\S]*?size:\s*letter/);
    expect(styles).toMatch(/@page\s+a4sheet\s*\{[\s\S]*?size:\s*A4/);
    expect(letterStyles).toMatch(/@page\s*\{[\s\S]*?size:\s*letter/);
    expect(a4Styles).toMatch(/@page\s*\{[\s\S]*?size:\s*A4/);
    expect(styles).toMatch(
      /@media\s+print[\s\S]*?\.paper-a4\s*\{[\s\S]*?page:\s*a4sheet/,
    );
    expect(styles).toMatch(
      /\.print-card-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3,[\s\S]*?grid-template-rows:\s*repeat\(3,/,
    );
    expect(styles).toMatch(
      /\.print-reference-card\s*\{[\s\S]*?height:\s*3\.405in;[\s\S]*?overflow:\s*hidden;[\s\S]*?width:\s*2\.47in;/,
    );
    expect(styles).toMatch(
      /\.paper-a4 \.print-reference-card\s*\{[\s\S]*?height:\s*86\.8mm;[\s\S]*?width:\s*63mm;/,
    );
    // Print cuts only shown cards into 9-card pages; Edit mode's reveal of
    // hidden cards is screen-only (editControls is off while printing).
    expect(sheetSource).toMatch(
      /chunks\(\s*editControls\s*\?\s*resolvedLayout\.cards\s*:\s*resolvedLayout\.cards\.filter\(\(card\) => card\.shown\),\s*9,/,
    );
    expect(sheetSource).toContain("powerActionLabel(card.actionType)");
    expect(sheetSource).toContain("powerTextAtLevel(value, characterLevel)");
    expect(sheetSource).toContain('.replace(/\\bFortitude\\b/gi, "Fort")');
    expect(sheetSource).toContain('.replace(/\\bReflex\\b/gi, "Ref")');
    expect(styles).toMatch(
      /\.print-card-combat-band\s*\{[^}]*grid-template-columns:\s*var\(--print-card-header-first-column, max-content\)\s*minmax\(0, 1fr\)/,
    );
    // Headers show the formula against the defense, never the equipped total (D085).
    expect(sheetSource).toContain("`${formula} vs ${total.match(");
    expect(sheetSource).not.toContain("`$1 · ${formula} vs $2`");
    expect(sheetSource).not.toContain("`${attack.ordinal} · `");
    expect(sheetSource).toContain("const isUtility = classification.utility");
    expect(sheetSource).toContain("defaultPrintAttacks(card)");
    expect(sheetSource).toContain("fallbackPrintAttacks(card, selected)");
    expect(styles).toMatch(
      /\.print-card-combat-band > div\s*\{[\s\S]*?align-items:\s*flex-start/,
    );
    expect(styles).toMatch(
      /\.print-card-action-band,\s*\.print-card-combat-band\s*\{[\s\S]*?background:\s*color-mix/,
    );
    expect(styles).toMatch(
      /\.print-card-combat-band dd\s*\{[\s\S]*?overflow-wrap:\s*anywhere/,
    );
    expect(styles).toMatch(
      /\.print-power-card > header\s*\{[\s\S]*?background:\s*var\(--card-color\);[\s\S]*?color:\s*#fff/,
    );
    expect(styles).toMatch(
      /\.print-reference-card > header h3\s*\{[^}]*line-height:\s*1\.2;/,
    );
    expect(styles).toMatch(
      /\.print-card-type\s*\{[^}]*align-items:\s*center;[^}]*display:\s*flex;/,
    );
    expect(styles).toMatch(
      /\.print-reference-card > footer\s*\{[^}]*align-items:\s*center;/,
    );
    expect(styles).toMatch(
      /\.print-power-card\.utility-power\s*\{[\s\S]*?--card-color:\s*#000080/,
    );
    expect(styles).toMatch(
      /\.print-power-card\.usage-feature\s*\{[^}]*--card-color:\s*#5e3a78/,
    );
    // Feature/usage labels come from the shared sheet-model classification.
    expect(sheetSource).toContain("classifyPowerCard(card)");
    expect(sheetSource).toContain("classification.typeLabel");
    expect(styles).toMatch(
      /\.print-card-type\s*\{[\s\S]*?background:\s*var\(--card-footer-color, var\(--card-color\)\)/,
    );
    expect(styles).not.toMatch(/\.sheet-card(?![\w-])/);
    expect(styles).not.toMatch(/\n\.usage-(?:encounter|daily) > header/);
    expect(sheetSource).not.toContain("print-card-used");
    expect(styles).not.toContain(".print-card-used");
    // Action symbols are SVG, so no symbol font sizes them differently per OS.
    expect(styles).not.toContain("Noto Sans Symbols");
    expect(styles).toMatch(
      /\.print-reference-card\s*\{[\s\S]*?--print-card-section-gap:\s*0\.025in/,
    );
    expect(styles).toMatch(
      /\.print-reference-card\.is-compact\s*\{[\s\S]*?--print-card-section-gap:\s*0\.0125in/,
    );
    expect(styles).toMatch(
      /\.print-reference-card\.is-condensed\s*\{[\s\S]*?--print-card-section-gap:\s*0/,
    );
    expect(styles).toMatch(
      /\.print-card-rule-line\.starts-section\s*\{[\s\S]*?margin-top:\s*var\(--print-card-section-gap\)/,
    );
    expect(sheetSource).toContain(
      '(before === "trigger" && after === "effect")',
    );
    expect(sheetSource).toContain(
      "attackResolution.has(before) && attackResolution.has(after)",
    );
    expect(sheetSource).toContain(
      'variant.equipped && variant.hand === "main"',
    );
    expect(sheetSource).toContain("<PrintPowerVariants");
    expect(sheetSource).not.toContain(
      "attacks.length === 0 &&\n          printVariants.map",
    );
    expect(styles).toMatch(
      /\.print-card-weapon-variants\s*\{[\s\S]*?padding-top:\s*var\(--print-card-section-gap\)/,
    );
    expect(sheetSource).toContain("const typeLabel = classification.typeLabel");
    expect(sheetSource).not.toContain("print-power-frequency");
    expect(sheetSource).not.toContain("print-item-frequency");
    expect(sheetSource).not.toMatch(
      /function Print(?:Power|Item)Card[\s\S]*?card\.flavor/,
    );
  });

  it("keeps a revealed hidden card's header and type bar, blanking the body", () => {
    expect(appStyles).toMatch(
      /\.sheet-concealed-card > \.print-reference-card > :not\(header\)\s*\{\s*visibility:\s*hidden;/,
    );
    // The bottom type bar ("Encounter Power · Level 3") comes back.
    expect(appStyles).toMatch(
      /\.sheet-concealed-card \.print-reference-card \.print-card-type\s*\{\s*visibility:\s*visible;/,
    );
    expect(appStyles).not.toMatch(/\.sheet-concealed-card[^{]*footer/);
  });

  it("keeps View | Edit in place whether or not Edit mode's tools show", () => {
    // Packed from the start (not space-between), so the tools that follow the
    // control in Edit mode never move it; Print is pushed to the end.
    expect(styles).toMatch(
      /\.sheet-page\.is-print-preview \.print-preview-toolbar \{[^}]*justify-content: flex-start;/,
    );
    expect(styles).toMatch(
      /\.print-preview-toolbar-end \{[^}]*margin-inline-start: auto;/,
    );
    // Each segmented option reserves its bold (selected) width.
    expect(styles).toMatch(
      /\.segmented-control-text::after \{[^}]*content: attr\(data-text\);[^}]*font-weight: 800;[^}]*visibility: hidden;/,
    );
  });

  it("has no on-paper section controls or hidden-section strips (D099)", () => {
    expect(styles).not.toMatch(/\.sheet-section-edit|\.sheet-hidden-section/);
    expect(styles).toMatch(/\.sheet-pages-menu\.action-menu-options \{/);
  });
});
