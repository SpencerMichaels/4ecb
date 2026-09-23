import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const styles = ["./styles/primitives.css", "./styles.css"]
  .map((path) => readFileSync(new URL(path, import.meta.url), "utf8"))
  .join("\\n");

describe("production item-card presentation", () => {
  it("uses compact flowing descriptor rows without a uniform grid", () => {
    const band = styles.match(
      /\.item-card-descriptors\s*\{(?<body>[\s\S]*?)\n\}/u,
    )?.groups?.body;
    const row = styles.match(
      /\.item-card-descriptor-row\s*\{(?<body>[\s\S]*?)\n\}/u,
    )?.groups?.body;
    expect(band).toContain("border-block: 1px solid var(--border)");
    expect(band).not.toContain("grid-template-columns");
    expect(row).toContain("display: flex");
    expect(row).toContain("flex-wrap: wrap");
    expect(styles).toMatch(
      /\.item-card-descriptor-row > div \+ div\s*\{[^}]*border-left:/su,
    );
  });

  it("keeps rules labels whole and compensates the rendered flavor line box", () => {
    expect(styles).toMatch(
      /\.entity-card-rules > div\s*\{[^}]*grid-template-columns: max-content minmax\(0, 1fr\)/su,
    );
    expect(styles).toMatch(
      /\.entity-card-rules dt\s*\{[^}]*overflow-wrap: normal;[^}]*white-space: nowrap;/su,
    );
    expect(styles).toMatch(
      /\.candidate-detail > \.composed-item-flavor\s*\{[^}]*--entity-card-flavor-padding: 0\.7rem 1rem 0\.645rem;/su,
    );
    expect(styles).toMatch(
      /\.candidate-detail\.composed-item-card > header\.primary-detail-heading\s*\{[^}]*--entity-card-header-margin-bottom: 0;/su,
    );
  });
});
