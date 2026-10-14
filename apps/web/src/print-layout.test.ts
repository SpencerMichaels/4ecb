import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const styles = ["./styles/primitives.css", "./styles.css"]
  .map((path) => readFileSync(new URL(path, import.meta.url), "utf8"))
  .join("\\n");
const letterStyles = readFileSync(
  new URL("../public/print-letter.css", import.meta.url),
  "utf8",
);
const a4Styles = readFileSync(
  new URL("../public/print-a4.css", import.meta.url),
  "utf8",
);
const sheetSource = ["./CharacterSheetPage.tsx", "./print-power-attacks.ts"]
  .map((path) => readFileSync(new URL(path, import.meta.url), "utf8"))
  .join("\n");

describe("print layout contract", () => {
  it("preserves an empty action band without a divider or an orphan attack-type icon", () => {
    expect(sheetSource).toContain(
      '!displayActionType && !attackType ? " is-empty" : ""',
    );
    expect(sheetSource).toContain(
      '{attackType ? <Icon name="sword" /> : null}',
    );
    expect(styles).toMatch(
      /\.print-card-action-band\.is-empty\s*\{[^}]*min-height:\s*0\.15in;/,
    );
    expect(styles).toMatch(
      /\.print-card-action-band\.is-empty > span\s*\{[^}]*border-right:\s*0;/,
    );
  });
  it("keeps table text the same dark color as the card body", () => {
    expect(styles).toMatch(/\.print-card-body\s*\{[^}]*color:\s*#111;/);
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
      /\.print-card-variant-table tbody tr:nth-child\(odd\)\s*\{[^}]*background:\s*color-mix/,
    );
    expect(styles).not.toMatch(
      /\.print-card-variant-table th:first-child\s*\{[^}]*width:/,
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
    expect(sheetSource).toContain("chunks(printableCards, 9)");
    expect(sheetSource).toContain('.replace(/\\s+action\\b/i, "")');
    expect(sheetSource).toContain(
      "powerTextAtLevel(field.value, characterLevel)",
    );
    expect(sheetSource).toContain('.replace(/\\bFortitude\\b/gi, "Fort")');
    expect(sheetSource).toContain('.replace(/\\bReflex\\b/gi, "Ref")');
    expect(styles).toMatch(
      /\.print-card-combat-band\s*\{[\s\S]*?grid-template-columns:\s*max-content minmax\(0, 1fr\)/,
    );
    expect(sheetSource).toContain("`$1 · ${formula} vs $2`");
    expect(sheetSource).not.toContain("`${attack.ordinal} · `");
    expect(sheetSource).toContain(
      'const isUtility = powerType?.trim().toLocaleLowerCase() === "utility"',
    );
    expect(sheetSource).toContain(
      "fallbackPrintAttacks(card, selectedPrintVariant)",
    );
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
      /\.print-power-card\.legacy-utility-color\s*\{[\s\S]*?--card-color:\s*#000080/,
    );
    expect(styles).toMatch(
      /\.print-power-card\.utility-power\s*\{[\s\S]*?--card-footer-color:\s*#000080/,
    );
    expect(styles).toMatch(
      /\.print-card-type\s*\{[\s\S]*?background:\s*var\(--card-footer-color, var\(--card-color\)\)/,
    );
    expect(styles).toContain(".sheet-card.usage-encounter > header");
    expect(styles).toContain(".sheet-card.usage-daily > header");
    expect(styles).not.toMatch(/\n\.usage-(?:encounter|daily) > header/);
    expect(sheetSource).not.toContain("print-card-used");
    expect(styles).not.toContain(".print-card-used");
    expect(styles).toMatch(
      /\.print-card-action-band \.action-type-icon > span\s*\{[\s\S]*?transform:\s*translateY\(0\.01in\)/,
    );
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
    expect(sheetSource).toContain(
      'const typeLabel = `${displayUsage}${isUtility ? " Utility" : ""} power`',
    );
    expect(sheetSource).not.toContain("print-power-frequency");
    expect(sheetSource).not.toContain("print-item-frequency");
    expect(sheetSource).not.toMatch(
      /function Print(?:Power|Item)Card[\s\S]*?card\.flavor/,
    );
  });
});
