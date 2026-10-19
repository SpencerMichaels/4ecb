import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { SheetCard } from "@4ecb/sheet-model";

import { PowerCard } from "./PowerCard";

const card: SheetCard = {
  id: "synthetic-strike",
  kind: "power",
  name: "Synthetic Strike",
  usage: "At-Will",
  actionType: "Standard Action",
  keywords: "Martial, Weapon",
  fields: [
    { label: "Attack Type", value: "Melee weapon" },
    { label: "Attack", value: "Strength vs. AC" },
    { label: "Hit", value: "1[W] + Strength modifier damage." },
  ],
};

describe("panel power card", () => {
  it("puts flavor directly under the name, before every band", () => {
    const markup = renderToStaticMarkup(
      createElement(PowerCard, {
        card,
        characterLevel: 1,
        layout: "panel",
        panel: { flavor: "A synthetic flourish." },
      }),
    );
    const flavor = markup.indexOf("print-card-flavor");
    expect(flavor).toBeGreaterThan(markup.indexOf("</header>"));
    expect(flavor).toBeLessThan(markup.indexOf("print-card-keyword-band"));
    expect(flavor).toBeLessThan(markup.indexOf("print-card-action-band"));
    expect(markup.indexOf("print-card-body")).toBeGreaterThan(flavor);
  });

  it("never shows flavor on printed cards", () => {
    const markup = renderToStaticMarkup(
      createElement(PowerCard, {
        card: { ...card, flavor: "A synthetic flourish." },
        characterLevel: 1,
      }),
    );
    expect(markup).not.toContain("A synthetic flourish.");
  });
});
