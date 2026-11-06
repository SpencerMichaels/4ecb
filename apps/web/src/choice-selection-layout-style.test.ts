import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { choiceSelectionLayoutClass } from "./ChoiceEditors";
import { appStyles } from "./test-styles";

const choiceEditors = readFileSync(
  new URL("./ChoiceEditors.tsx", import.meta.url),
  "utf8",
);

function ruleAt(selector: string): {
  readonly at: number;
  readonly body: string;
} {
  const at = appStyles.indexOf(`\n${selector} {`);
  expect(at, `missing CSS rule ${selector}`).toBeGreaterThanOrEqual(0);
  return { at, body: appStyles.slice(at, appStyles.indexOf("}", at) + 1) };
}

// A choice editor lays its fields beside its own detail card. Where a shared
// pane shows the inspected option instead (Build, Details, Retraining), the
// card is not rendered; the two-column grid then squeezed the Details tab's
// Deity table (and Retraining's tables) into its narrow first column.
describe("choice editor layout with a shared detail pane", () => {
  it("marks the layout when the detail card is shown elsewhere", () => {
    expect(choiceSelectionLayoutClass({ detailShared: false })).toBe(
      "choice-selection-layout",
    );
    expect(choiceSelectionLayoutClass({ detailShared: true })).toBe(
      "choice-selection-layout is-detail-shared",
    );
    expect(
      choiceSelectionLayoutClass({ compact: true, detailShared: true }),
    ).toBe("choice-selection-layout is-detail-shared choice-selection-compact");
  });

  it("gives the fields the whole width, compact editors keeping their cap", () => {
    const base = ruleAt(".choice-selection-layout");
    const shared = ruleAt(".choice-selection-layout.is-detail-shared");
    const compact = ruleAt(".choice-selection-layout.choice-selection-compact");
    expect(base.body).toContain(
      "grid-template-columns: minmax(15rem, 0.6fr) minmax(20rem, 1fr)",
    );
    expect(shared.body).toContain("grid-template-columns: minmax(0, 1fr);");
    expect(shared.at).toBeGreaterThan(base.at);
    expect(compact.at).toBeGreaterThan(shared.at);
  });

  it("builds every editor's layout class from whether the detail is shared", () => {
    expect(choiceEditors).not.toContain('className="choice-selection-layout');
    expect(choiceEditors).not.toContain("className={`choice-selection-layout");
    const calls = choiceEditors.split(
      "className={choiceSelectionLayoutClass({",
    );
    // The replacement editor and the choice editor.
    expect(calls.length - 1).toBe(2);
    for (const call of calls.slice(1))
      expect(call.slice(0, call.indexOf("})}"))).toContain(
        "detailShared: inspectCandidate !== undefined",
      );
  });
});
