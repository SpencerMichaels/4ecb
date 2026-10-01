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
const sheetSource = readFileSync(
  new URL("./CharacterSheetPage.tsx", import.meta.url),
  "utf8",
);

describe("print layout contract", () => {
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
      /\.print-card-combat-band\s*\{[\s\S]*?grid-template-columns:\s*max-content max-content minmax\(0, 1fr\)/,
    );
    expect(styles).toMatch(
      /\.print-card-attack-formula dd\s*\{[\s\S]*?white-space:\s*nowrap/,
    );
    expect(styles).toMatch(
      /\.print-card-combat-band\.is-long-target\s*\{[\s\S]*?grid-template-columns:\s*max-content minmax\(0, 1fr\);[\s\S]*?grid-template-rows:\s*auto auto/,
    );
    expect(styles).toMatch(
      /\.print-card-combat-band\.is-long-target \.print-card-attack-formula\s*\{[\s\S]*?border-bottom:\s*0/,
    );
    expect(sheetSource).toContain(
      'Attack{numbered ? ` ${attack.ordinal}` : ""} · {formula}',
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
      /\.print-power-card\.legacy-utility-color\s*\{[\s\S]*?--card-color:\s*#000080/,
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
