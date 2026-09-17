import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const styles = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
const characterEditor = readFileSync(
  new URL("./CharacterEditorPage.tsx", import.meta.url),
  "utf8",
);
const equipmentWorkspace = readFileSync(
  new URL("./EquipmentWorkspace.tsx", import.meta.url),
  "utf8",
);
const entityCard = readFileSync(
  new URL("./EntityCard.tsx", import.meta.url),
  "utf8",
);
const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");

function channel(value: number): number {
  const normalized = value / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const value = Number.parseInt(hex.slice(1), 16);
  return (
    channel((value >> 16) & 0xff) * 0.2126 +
    channel((value >> 8) & 0xff) * 0.7152 +
    channel(value & 0xff) * 0.0722
  );
}

function contrast(foreground: string, background: string): number {
  const light = Math.max(luminance(foreground), luminance(background));
  const dark = Math.min(luminance(foreground), luminance(background));
  return (light + 0.05) / (dark + 0.05);
}

describe("release accessibility contract", () => {
  it("keeps every normal-text palette pair above WCAG AA contrast", () => {
    const pairs = [
      ["#1e2933", "#eef2f6"],
      ["#ffffff", "#1d3d5d"],
      ["#315f85", "#ffffff"],
      ["#52616e", "#eef2f6"],
      ["#ffffff", "#006400"],
      ["#ffffff", "#8b0000"],
      ["#111111", "#808080"],
      ["#ffffff", "#000080"],
      ["#211406", "#ff8c00"],
    ] as const;
    for (const [foreground, background] of pairs)
      expect(
        contrast(foreground, background),
        `${foreground} on ${background}`,
      ).toBeGreaterThanOrEqual(4.5);
  });

  it("does not force a desktop viewport and stacks dense layouts for tablets", () => {
    expect(styles.match(/body\s*\{[^}]*\}/)?.[0]).not.toContain("min-width");
    expect(styles).toMatch(
      /@media \(max-width: 60rem\)[\s\S]*?\.metadata-form,[\s\S]*?\.sheet-columns[\s\S]*?grid-template-columns: 1fr/,
    );
    expect(styles).toMatch(
      /@media \(max-width: 60rem\)[\s\S]*?\.builder-workspace,[\s\S]*?\.level-choice-workspace,[\s\S]*?grid-template-columns: 1fr/,
    );
    expect(styles).toMatch(
      /@media \(max-width: 48rem\)[\s\S]*?\.choice-selection-layout[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/,
    );
    expect(styles).toMatch(/\.candidate-detail:focus-visible/);
    expect(styles).toMatch(/\.level-choice-section:focus-visible/);
    expect(styles).toMatch(
      /@media \(max-width: 48rem\)[\s\S]*?\.skill-training-layout[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/,
    );
  });

  it("keeps navigation compact and ordinary detail content in document flow", () => {
    expect(characterEditor).toContain('className="level-rail"');
    expect(characterEditor).toContain('workspaceTab === "overview"');
    expect(characterEditor).toContain('workspaceTab === "equipment"');
    expect(characterEditor).toContain('workspaceTab === "diagnostics"');
    expect(characterEditor).toContain('className="build-overview"');
    expect(characterEditor).toContain("Show planned choices");
    expect(characterEditor).toContain("overview-checklist-pane overview-pane-");
    expect(characterEditor).toContain('pane === "Retraining"');
    expect(characterEditor).toContain("overviewPowerType(powerTone)");
    expect(characterEditor).toContain('className="overview-retraining-marker"');
    expect(characterEditor).toContain(
      "Retrained from ${retraining.fromName} at level ${retraining.choice.level}",
    );
    expect(characterEditor).toContain(
      'aria-sort={active ? sort.direction : "none"}',
    );
    expect(characterEditor).toContain('className="selection-sort-button"');
    expect(characterEditor).not.toContain("Stored features");
    expect(characterEditor).not.toContain("function OccurrenceTree");
    expect(characterEditor).not.toContain('aria-controls="build-timeline"');
    expect(characterEditor).not.toContain('aria-label="Close level plan"');
    expect(characterEditor).not.toContain('className="builder-secondary"');

    const candidateDetailRule = styles.match(
      /\.candidate-detail\s*\{([^}]*)\}/,
    )?.[1];
    const timelineRule = styles.match(/\.build-overview\s*\{([^}]*)\}/)?.[1];
    expect(candidateDetailRule).toBeDefined();
    expect(candidateDetailRule).not.toContain("max-height");
    expect(candidateDetailRule).not.toContain("overflow:");
    expect(timelineRule).toBeDefined();
    expect(timelineRule).not.toContain("max-height");
    expect(timelineRule).not.toContain("overflow:");
    expect(styles).toMatch(
      /\.selection-table-scroll\s*\{[^}]*max-height:[^}]*overflow: auto/,
    );
  });

  it("makes each theme power header its accessible disclosure control", () => {
    const candidateDetails = characterEditor.slice(
      characterEditor.indexOf("function CandidateDetail("),
      characterEditor.indexOf("function BaseAbilityScoreEditor"),
    );
    expect(candidateDetails).toContain("themePowers.flatMap");
    expect(candidateDetails).toContain("themePowerLevel={group.level ?? null}");
    expect(candidateDetails).not.toContain("theme-power-level");
    expect(candidateDetails).not.toContain("Theme power");
    expect(candidateDetails).toContain("isEmbeddedPower");
    expect(candidateDetails).toContain("<EmbeddedPowerCard");
    expect(entityCard).toMatch(
      /<details[\s\S]*?open[\s\S]*?<summary>\s*<EntityCardHeader[\s\S]*?<\/summary>/,
    );
    expect(entityCard).toContain("showSource={false}");
    expect(candidateDetails).toMatch(
      /if \(isEmbeddedPower\)[\s\S]*?return \([\s\S]*?<aside[\s\S]*?tabIndex={0}/,
    );
    expect(styles).toMatch(
      /\.theme-power-card > summary\s*\{[^}]*cursor: pointer/,
    );
    expect(styles).toMatch(
      /\.theme-power-card > summary:focus-visible\s*\{[^}]*outline:/,
    );
    expect(styles).toMatch(/\.theme-power-card\s*\{[^}]*padding: 0/);
    expect(styles).toMatch(/\.theme-power-card > summary\s*\{[^}]*margin: 0/);
    expect(styles).toMatch(
      /\.theme-power-card-body\s*\{[^}]*padding: 0 1rem 0\.85rem/,
    );
    expect(styles).toMatch(
      /\.theme-power-card > summary\s*\{[^}]*background: var\(--tone-soft\)[^}]*border-bottom: 1px solid var\(--tone\)[^}]*color: var\(--text\)/,
    );
    expect(styles).toMatch(
      /\.candidate-detail\[class\*="tone-"\] > header\s*\{[^}]*background: var\(--tone-soft\)[^}]*border-bottom: 1px solid var\(--tone\)[^}]*color: var\(--text\)/,
    );
    expect(styles).not.toMatch(
      /\.candidate-detail:is\([^)]*tone-at-will[^)]*\)\s*> header/,
    );
  });

  it("scopes collapsible descriptions to themes and puts every card source last", () => {
    const candidateDetails = characterEditor.slice(
      characterEditor.indexOf("function CandidateDetail("),
      characterEditor.indexOf("function BaseAbilityScoreEditor"),
    );
    expect(candidateDetails).toContain(
      'entity.type.trim().toLocaleLowerCase() === "theme"',
    );
    expect(candidateDetails).toContain("function ThemeCandidateDescription");
    expect(candidateDetails).toContain(
      "themeDescriptionParagraphs(description)",
    );
    expect(candidateDetails).toContain("paragraphs.slice(0, 1)");
    expect(candidateDetails).toContain("aria-controls={id}");
    expect(candidateDetails).toContain("aria-expanded={expanded}");
    expect(candidateDetails).toContain('{expanded ? "Less…" : "More…"}');
    expect(candidateDetails).toContain("key={entity.id}");
    expect(entityCard).toContain('["short description", "source"].includes(');
    expect(entityCard).toContain('className="detail-source-note"');
    expect(
      entityCard.indexOf('className="detail-source-note"'),
    ).toBeGreaterThan(entityCard.indexOf("{afterFields}"));
  });

  it("uses one entity-card design and flavortext preference everywhere", () => {
    const candidateDetails = characterEditor.slice(
      characterEditor.indexOf("function CandidateDetail("),
      characterEditor.indexOf("function BaseAbilityScoreEditor"),
    );
    for (const source of [candidateDetails, equipmentWorkspace]) {
      expect(source).toContain("EntityCardHeader");
      expect(source).toContain("EntityCardBody");
    }
    expect(entityCard).toContain('className="detail-heading-row"');
    expect(entityCard).toContain("primaryDetailTypeLabel(entity)");
    expect(entityCard).toContain(
      "<ActionTypeIcon decorative value={actionType} />",
    );
    expect(entityCard).toContain('contentSpecificValue(entity, "Action Type")');
    expect(entityCard).not.toContain('className="entity-card-attack-type"');
    expect(entityCard).toContain("itemCardLabel(entity)");
    expect(entityCard).toContain("itemCardIcon(entity)");
    expect(entityCard).toContain('className="entity-card-descriptors"');
    expect(entityCard).toContain('className="entity-card-rules"');
    expect(styles).toContain(".entity-card-heading-main .action-type-icon,");
    expect(styles).toMatch(
      /\.entity-card-heading-main > \.icon\s*\{[^}]*align-self: baseline[^}]*line-height: inherit/,
    );
    expect(styles).toMatch(/grid-template-columns: 4\.75rem minmax\(0, 1fr\)/);
    expect(entityCard).not.toContain("<h5>Description</h5>");
    expect(characterEditor).toContain("useContext(HideFlavortextContext)");
    expect(entityCard).toContain(
      "entity.flavor === undefined || hideFlavortext",
    );
    expect(app).toContain(
      "<HideFlavortextContext.Provider value={hideFlavortext}>",
    );
    expect(entityCard).toContain("groupClassSpecifics(fields)");
    expect(entityCard).toContain('type === "class" || type === "hybrid class"');
    expect(characterEditor).not.toContain("renderSpecifics");
    expect(equipmentWorkspace).not.toContain("renderSpecifics");
  });

  it("keeps table selection spatially stable and communicates it without checkmarks", () => {
    const tableSource = characterEditor.slice(
      characterEditor.indexOf("function CandidateSelectionTable"),
      characterEditor.indexOf("function ChoiceFlowSection"),
    );
    expect(tableSource).not.toContain("prioritizedCandidates");
    expect(tableSource).not.toContain('name="check"');
    expect(tableSource).toContain("candidate-selection-short");
    expect(tableSource).toContain("defaultCandidateSortFor(kind)");
    expect(characterEditor).toContain(
      '!["description", "short description"].includes(normalizedLabel)',
    );
    expect(tableSource).toContain("candidateHeaderIsSortable(label)");
    expect(tableSource).toContain('sortableHeader("summary", "Alignment")');
    expect(tableSource).toContain(
      'sortableHeader("deity-description", "Description")',
    );
    expect(tableSource).toContain("deityTableDescription(entity)");
    expect(styles).toMatch(
      /\.selection-table-scroll table\s*\{[^}]*table-layout: auto/,
    );
    expect(styles).toMatch(
      /\.selection-table-scroll thead th:first-child,[\s\S]*?\.selection-table-scroll tbody td:first-child[\s\S]*?width: 1%/,
    );
    expect(styles).toMatch(
      /\.candidate-selection-deity \.selection-table-scroll th:first-child,[\s\S]*?\.candidate-selection-deity \.selection-table-scroll td:nth-child\(2\)[\s\S]*?white-space: nowrap;[\s\S]*?width: 1%/,
    );
    expect(styles).toMatch(
      /\.candidate-selection-class \.selection-table-scroll th:nth-child\(2\),[\s\S]*?\.candidate-selection-background \.selection-table-scroll td:nth-child\(2\)[\s\S]*?width: 1%/,
    );
    expect(styles).toMatch(
      /\.equipment-table-scroll th:not\(:first-child\),[\s\S]*?\.equipment-table-scroll td:not\(:first-child\)[\s\S]*?white-space: nowrap;[\s\S]*?width: 1%/,
    );
    const equipmentWorkspaceRule = styles.match(
      /\.equipment-workspace\s*\{([^}]*)\}/,
    )?.[1];
    expect(equipmentWorkspaceRule).toContain("minmax(0, 1fr)");
    expect(equipmentWorkspaceRule).toContain("clamp(28rem, 41vw, 32rem)");
    expect(styles).toMatch(
      /@media \(max-width: 60rem\)[\s\S]*?\.equipment-workspace\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\)/,
    );
    expect(styles).toMatch(
      /\.candidate-selection-short[\s\S]*?\.selection-table-scroll\s*\{[\s\S]*?height: auto/,
    );
  });

  it("uses toggle semantics for clearable compact choices and radios for mandatory choices", () => {
    const compactChoices = characterEditor.slice(
      characterEditor.indexOf("function CompactChoiceButtons"),
      characterEditor.indexOf("function BuildPresetPanel"),
    );
    expect(compactChoices).toContain(
      '{ "aria-label": label, role: "radiogroup" }',
    );
    expect(compactChoices).toContain(
      '{ "aria-checked": selected, role: "radio" }',
    );
    expect(compactChoices).toContain('{ "aria-pressed": selected }');
    expect(compactChoices).toContain("if (selected && clearable)");
    expect(compactChoices).toContain("onClear();");
    expect(compactChoices).toContain('`${selected ? "is-selected" : ""}');
    expect(compactChoices).not.toContain("compact-choice-clear");
    expect(compactChoices).not.toContain('name="check"');
    expect(styles).toMatch(
      /\.compact-choice-options > button\.is-selected\s*\{[^}]*background: var\(--success-soft\)[^}]*border-left-color: var\(--success\)/,
    );

    const abilityChoices = characterEditor.slice(
      characterEditor.indexOf("function AbilityIncreaseEditor"),
      characterEditor.indexOf("function RepeatedChoiceGroup"),
    );
    expect(abilityChoices).toContain(
      "aria-pressed={selectedChoice !== undefined}",
    );
    expect(abilityChoices).toContain("const [pendingSlots, setPendingSlots]");
    expect(abilityChoices).toContain("abilityScoreWithPendingDelta(");
    expect(abilityChoices).toContain("[...optimisticSlots.values()].filter(");
    expect(abilityChoices).toContain("[...evaluatedSlots.values()].filter(");
    expect(abilityChoices).toContain('"ability-selected"');
    expect(abilityChoices).not.toContain('name="check"');
    expect(styles).toMatch(
      /\.ability-increase-grid button\.ability-selected\s*\{[^}]*background: var\(--success-soft\)[^}]*border-color: var\(--success\)/,
    );
    expect(styles).toMatch(
      /\.level-choice-section\.ability-increase-section > header\s*\{[^}]*margin: -1rem -1rem 1rem;[^}]*padding: 0\.75rem 1rem;/,
    );
    expect(styles).toMatch(
      /\.legacy-choice-list > \.level-choice-section\.ability-increase-section > header\s*\{[^}]*margin: -0\.75rem -0\.8rem 0\.7rem;[^}]*padding: 0\.65rem 0\.8rem;/,
    );
  });

  it("threads the selected-level rules evaluation into ability score editors", () => {
    expect(characterEditor).toContain("const selectedLevelRequest =");
    expect(characterEditor).toContain(
      "{ ...build, effectiveLevel: selectedLevel }",
    );
    expect(
      characterEditor.match(/evaluation=\{selectedLevelEvaluation\}/g),
    ).toHaveLength(2);
  });

  it("retains check glyphs for non-radio completion states", () => {
    const emptyLevelState = characterEditor.slice(
      characterEditor.indexOf('className="choice-empty-state"'),
      characterEditor.indexOf('className="level-choice-tabs-layout"'),
    );
    expect(emptyLevelState).toContain('<Icon name="check" />');
    expect(emptyLevelState).toContain("No choices need attention");
  });

  it("supports system color preference and explicit light or dark overrides", () => {
    expect(styles).toContain(':root[data-theme="dark"]');
    expect(styles).toContain("@media (prefers-color-scheme: dark)");
    expect(styles).toContain(":root:not([data-theme])");
    for (const [foreground, background] of [
      ["#f2f4f7", "#111727"],
      ["#b7c1d1", "#111727"],
      ["#7eaed2", "#111727"],
      ["#ffaaa1", "#482525"],
      ["#ffc36b", "#46351f"],
      ["#83d18b", "#203c2a"],
    ] as const)
      expect(
        contrast(foreground, background),
        `${foreground} on ${background}`,
      ).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps the legacy semantic palette and avoids pill-shaped chrome", () => {
    for (const token of [
      "--power-at-will: #006400",
      "--power-encounter: #8b0000",
      "--power-daily: #808080",
      "--power-utility: #000080",
      "--power-item: #ff8c00",
    ])
      expect(styles).toContain(token);
    expect(styles).not.toContain("border-radius: 999px");
  });

  it("routes loadout shop shortcuts through the existing Slot query", () => {
    expect(equipmentWorkspace).toContain(
      "const shopSlot = loadoutShopSlotFilter(slotId)",
    );
    expect(equipmentWorkspace).toContain("setSlot(shopSlot);");
    expect(equipmentWorkspace).toContain("setOffset(0);");
    expect(equipmentWorkspace).toContain('onTabChange("shop");');
    expect(equipmentWorkspace).not.toContain("slotFilter");
    expect(equipmentWorkspace).not.toContain("equipment-slot-filter");
    expect(equipmentWorkspace).not.toContain("shopItemSlotCandidates");
  });
});
