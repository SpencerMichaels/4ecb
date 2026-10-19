import { readdirSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const styles = ["./styles/primitives.css", "./styles.css"]
  .map((path) => readFileSync(new URL(path, import.meta.url), "utf8"))
  .join("\\n");
const characterEditor = readFileSync(
  new URL("./CharacterEditorPage.tsx", import.meta.url),
  "utf8",
);
const characterSheet = readFileSync(
  new URL("./CharacterSheetPage.tsx", import.meta.url),
  "utf8",
);
const builderCards = readFileSync(
  new URL("./BuilderCards.tsx", import.meta.url),
  "utf8",
);
const candidateDetail = readFileSync(
  new URL("./CandidateDetail.tsx", import.meta.url),
  "utf8",
);
const baseAbilityScoreEditor = readFileSync(
  new URL("./BaseAbilityScoreEditor.tsx", import.meta.url),
  "utf8",
);
const choiceEditors = readFileSync(
  new URL("./ChoiceEditors.tsx", import.meta.url),
  "utf8",
);
const characterDetailsEditor = readFileSync(
  new URL("./CharacterDetailsEditor.tsx", import.meta.url),
  "utf8",
);
const candidateSelectionTable = readFileSync(
  new URL("./CandidateSelectionTable.tsx", import.meta.url),
  "utf8",
);
const equipmentWorkspace = readFileSync(
  new URL("./EquipmentWorkspace.tsx", import.meta.url),
  "utf8",
);
const shopWorkspace = readFileSync(
  new URL("./ShopWorkspace.tsx", import.meta.url),
  "utf8",
);
const entityCard = readFileSync(
  new URL("./EntityCard.tsx", import.meta.url),
  "utf8",
);
const hideFlavortextContext = readFileSync(
  new URL("./HideFlavortextContext.ts", import.meta.url),
  "utf8",
);
const icon = readFileSync(new URL("./Icon.tsx", import.meta.url), "utf8");
const builderChoiceContext = readFileSync(
  new URL("./builder-choice-context.tsx", import.meta.url),
  "utf8",
);
const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const characterLibrary = readFileSync(
  new URL("./CharacterLibraryPage.tsx", import.meta.url),
  "utf8",
);
const settingsPage = readFileSync(
  new URL("./SettingsPage.tsx", import.meta.url),
  "utf8",
);

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
  it("persists the gold normalization preference under Display", () => {
    expect(settingsPage).toContain("Keep large amounts in gold");
    expect(settingsPage).toContain("checked={keepLargeAmountsInGold}");
    expect(app).toContain("KEEP_LARGE_AMOUNTS_IN_GOLD_STORAGE_KEY");
    expect(app).toContain(
      'localStorage.setItem(KEEP_LARGE_AMOUNTS_IN_GOLD_STORAGE_KEY, "1")',
    );
    expect(characterEditor).toContain("keepLargeAmountsInGold,");
  });

  it("keeps interactive power-card presentation options enabled by default", () => {
    expect(settingsPage).toContain("Count coin weight");
    expect(settingsPage).toContain("checked={countCoinWeight}");
    expect(app).toContain(
      'localStorage.getItem(COUNT_COIN_WEIGHT_STORAGE_KEY) !== "0"',
    );
    expect(app).toContain(
      'localStorage.setItem(COUNT_COIN_WEIGHT_STORAGE_KEY, "0")',
    );
    expect(app).toContain("countCoinWeight={countCoinWeight}");
    expect(settingsPage).toContain(
      "Use the best ability in power descriptions",
    );
    expect(settingsPage).toContain("checked={resolveAbilityChoices}");
    expect(app).toContain("RESOLVE_ABILITY_CHOICES_STORAGE_KEY");
    expect(app).toContain(
      'localStorage.setItem(RESOLVE_ABILITY_CHOICES_STORAGE_KEY, "0")',
    );
    expect(app).toContain("resolveAbilityChoices={resolveAbilityChoices}");
    expect(settingsPage).toContain(
      "Show ability values compactly in calculated power details",
    );
    // Cards keep [W]; the weapon table shows weapon-specific damage (D079).
    expect(settingsPage).not.toContain("Replace [W]");
    expect(app).toContain("ABBREVIATE_ABILITY_VALUES_STORAGE_KEY");
    expect(app).not.toContain("EXPAND_WEAPON_DICE_STORAGE_KEY");
    expect(settingsPage).not.toContain("Color utility powers");
    expect(settingsPage).toContain(
      "Show equipped weapon to-hit bonus in attack headers",
    );
    expect(settingsPage).toContain("checked={showEquippedAttackBonus}");
    expect(app).toContain(
      'localStorage.getItem(SHOW_EQUIPPED_ATTACK_BONUS_STORAGE_KEY) !== "0"',
    );
    expect(app).toContain(
      'localStorage.setItem(SHOW_EQUIPPED_ATTACK_BONUS_STORAGE_KEY, "0")',
    );
    expect(app).toContain("showEquippedAttackBonus={showEquippedAttackBonus}");
    expect(settingsPage).toContain("Show action icons on printed cards");
    expect(settingsPage).toContain("Printed card text size");
    expect(settingsPage).toContain('type="range"');
    expect(settingsPage).toContain("checked={showPrintTitleActionIcon}");
    expect(app).toContain(
      'localStorage.getItem(SHOW_PRINT_TITLE_ACTION_ICON_STORAGE_KEY) !== "0"',
    );
    expect(app).toContain(
      'localStorage.setItem(SHOW_PRINT_TITLE_ACTION_ICON_STORAGE_KEY, "0")',
    );
    expect(app).toContain(
      "showPrintTitleActionIcon={showPrintTitleActionIcon}",
    );
    // Builder details render the sheet's evaluated cards (D079).
    expect(characterEditor).toContain("evaluatedBuilderCardSettings(");
    expect(builderCards).toContain("createSheetPowerCardFinder(");
    expect(characterEditor).toContain("<BuilderCardContext.Provider");
    expect(builderCards).toContain("renderPowerText(text, true)");
    expect(builderCards).not.toContain("expandWeaponDice");
    // The screen sheet uses the same shared cards, not a third renderer.
    expect(characterSheet).not.toContain("function Card(");
    expect(characterSheet).toContain('layout="panel"');
  });

  it("keeps browser View navigation and print presentation distinct", () => {
    expect(characterSheet).toContain('className="screen-sheet-view"');
    expect(characterSheet).toContain('aria-label="Character view sections"');
    for (const section of [
      "view-summary",
      "view-powers",
      "view-equipment",
      "view-learned-references",
      "view-features",
      "view-notes",
    ])
      expect(characterSheet).toContain(section);
    expect(characterSheet).not.toContain("tab=overview");
    expect(characterSheet).toContain("Print / save PDF");
    expect(characterSheet).toContain("setShowPrintPreview(true)");
    expect(characterSheet).toContain(
      'className="print-preview-toolbar page-actions"',
    );
    // Print options are app settings (paper) or gone; none on the sheet.
    expect(characterSheet).not.toContain("view-print-options");
    expect(characterSheet).toContain('aria-label="Print or save as PDF"');
    expect(characterSheet).toContain("model.learnedReferences.map");
    expect(characterSheet).toContain("<SheetOverview");
    const overview = readFileSync(
      new URL("./SheetOverview.tsx", import.meta.url),
      "utf8",
    );
    expect(overview).toContain('title="Character summary"');
    expect(overview).toContain('title="Play scratchpad"');
    expect(overview).toContain('const title = "Character reference"');
    expect(overview).toContain("title={title}");
    expect(overview).toContain('scope="row"');
    expect(characterSheet).toContain("print-card-grid");
    expect(styles).toMatch(
      /@media print[\s\S]*\.screen-sheet-view,[\s\S]*display: none !important/,
    );
    expect(styles).toMatch(
      /@media print[\s\S]*\.print-only\s*\{[^}]*display: block/,
    );
    expect(styles).toMatch(
      /\.sheet-page\.is-print-preview \.screen-sheet-view\s*\{[^}]*display: none/,
    );
    expect(styles).toMatch(
      /\.sheet-page\.is-print-preview \.print-only:not\(\.print-excluded\)\s*\{[^}]*display: block/,
    );
  });

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
      /@media \(max-width: 60rem\)[\s\S]*?\.sheet-columns[\s\S]*?grid-template-columns: 1fr/,
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

  it("uses one builder gutter between the rail, tabs, choices, and detail pane", () => {
    expect(styles).toMatch(
      /\.builder-workspace\s*\{[^}]*--builder-workspace-gutter: 1rem;[^}]*gap: var\(--builder-workspace-gutter\)/,
    );
    expect(styles).toMatch(
      /\.level-choice-tabs-layout\s*\{[^}]*display: grid;[^}]*gap: var\(--builder-workspace-gutter\)/,
    );
    expect(styles).toMatch(
      /\.level-choice-workspace\s*\{[^}]*gap: var\(--builder-workspace-gutter\)/,
    );
    expect(styles).toMatch(
      /\.level-choice-tab-bar\s*\{[^}]*border: 1px solid var\(--border\)/,
    );
    expect(styles).not.toMatch(
      /\.level-choice-tab-bar\s*\{[^}]*border-bottom: 0/,
    );
  });

  it("keeps navigation compact and ordinary detail content in document flow", () => {
    // Level navigation is one picker in the character sidebar (all tabs).
    expect(characterEditor).toContain("<LevelPicker");
    expect(characterEditor).not.toContain('className="level-rail"');
    expect(characterEditor).not.toContain('workspaceTab === "overview"');
    expect(characterEditor).toContain('navigation.workspace === "equipment"');
    // Diagnostics opens from the status badges, not a tab.
    expect(characterEditor).toContain('workspace: "diagnostics"');
    expect(characterEditor).not.toContain(
      '<Icon name="warning" /> Diagnostics',
    );
    expect(candidateSelectionTable).toContain(
      'aria-sort={active ? sort.direction : "none"}',
    );
    expect(candidateSelectionTable).toContain(
      'className="selection-sort-button"',
    );
    const sortButtonRule = styles.match(
      /\.selection-sort-button\s*\{([^}]*)\}/,
    )?.[1];
    const sortIconRule = styles.match(
      /\.selection-sort-button\s*>\s*\.icon\s*\{([^}]*)\}/,
    )?.[1];
    expect(sortButtonRule).toContain("display: inline-flex");
    expect(sortButtonRule).toContain("gap: 0.3rem");
    expect(sortButtonRule).not.toContain("width: 100%");
    expect(sortIconRule).toContain("block-size: 0.7rem");
    expect(sortIconRule).toContain("inline-size: 0.7rem");
    expect(sortIconRule).toContain("flex: none");
    expect(sortIconRule).not.toContain("margin-left: auto");
    expect(characterEditor).not.toContain("Stored features");
    expect(characterEditor).not.toContain("function OccurrenceTree");
    expect(characterEditor).not.toContain('aria-controls="build-timeline"');
    expect(characterEditor).not.toContain('aria-label="Close level plan"');
    expect(characterEditor).not.toContain('className="builder-secondary"');

    const levelRailButtonRule = styles.match(
      /(?:^|\n)\.level-rail-button\s*\{([^}]*)\}/,
    )?.[1];
    const candidateDetailRule = styles.match(
      /\.candidate-detail\s*\{([^}]*)\}/,
    )?.[1];
    expect(levelRailButtonRule).toContain("display: flex");
    expect(levelRailButtonRule).not.toContain("flex-direction: column");
    expect(levelRailButtonRule).toContain("min-height: 1.425rem");
    expect(candidateDetailRule).toBeDefined();
    expect(candidateDetailRule).not.toContain("max-height");
    expect(candidateDetailRule).not.toContain("overflow:");
    expect(styles).not.toMatch(/\.candidate-flavor\s*\{[^}]*border-bottom:/);
    expect(styles).not.toContain(".build-overview");
    expect(styles).toMatch(
      /\.selection-table-scroll\s*\{[^}]*max-height:[^}]*overflow: auto/,
    );
  });

  it("keeps per-level Next navigation in the choice pane", () => {
    const workspaceStart = characterEditor.indexOf(
      'className="level-choice-workspace"',
    );
    const choiceWorkspace = characterEditor.slice(
      workspaceStart,
      characterEditor.indexOf(
        'className="shared-choice-detail"',
        workspaceStart,
      ),
    );
    // No Next button; level tab tables fill the window instead.
    expect(choiceWorkspace).not.toContain("level-choice-navigation");
    expect(characterEditor).toContain("useFittedTableHeight(levelChoicePage)");
    expect(styles).toMatch(
      /\.level-choice-tab-panel \.selection-table-scroll\s*\{[^}]*height: var\(--fitted-table-height,/,
    );
  });

  it("reuses the required deity choice below Class starting presets", () => {
    expect(characterEditor).toContain(
      "levelChoices.filter(isRequiredClassDeityChoice)",
    );
    const classPanel = characterEditor.slice(
      characterEditor.indexOf("activeChoiceSection.choices.map"),
      characterEditor.indexOf(
        'className="shared-choice-detail"',
        characterEditor.indexOf("activeChoiceSection.choices.map"),
      ),
    );
    expect(classPanel.indexOf("<BuildPresetPanel")).toBeGreaterThan(-1);
    expect(
      classPanel.indexOf('className="class-deity-choice"'),
    ).toBeGreaterThan(classPanel.indexOf("<BuildPresetPanel"));
    expect(classPanel).toContain("renderPrimaryChoice(");
    expect(classPanel).toContain("deityChoice");
    expect(characterEditor).toContain("choices={characterDetailChoices}");
    expect(characterEditor).toContain(
      '{ section: "Class" as const, choices: requiredClassDeityChoices }',
    );
  });

  it("explains deity alignment and marks a mismatch as a house rule", () => {
    expect(characterEditor).toContain("deityAlignmentConstraint(");
    expect(characterEditor).toContain("deityAlignmentIssue(");
    expect(characterEditor).not.toContain("pendingForcedAlignmentKey");
    expect(characterDetailsEditor).not.toContain("disabled={alignment");
    expect(characterDetailsEditor).toContain(
      "alignment should match your deity's.",
    );
    expect(characterDetailsEditor).toContain("{alignmentHouseRuled ? (");
    expect(styles).toContain(
      'button:not(:disabled):not([aria-disabled="true"]):hover',
    );
    expect(styles).toMatch(
      /button\[aria-disabled="true"\]\s*\{[^}]*cursor:\s*not-allowed/,
    );
  });

  it("keeps sidebar identity editable and changes the level from a tab-bar menu", () => {
    const header = characterEditor.slice(
      characterEditor.indexOf('<header className="builder-sidebar-identity">'),
      characterEditor.indexOf('<div className="builder-sidebar-panel">'),
    );
    expect(header.length).toBeGreaterThan(0);
    const details = characterDetailsEditor.slice(
      characterDetailsEditor.indexOf("export function CharacterDetailsEditor("),
    );

    expect(header).toContain('className="builder-character-name"');
    expect(header).toContain('label="Character name"');
    expect(header).toContain('name="Name"');
    expect(header).toContain("characterHeaderSubtitle(");
    // The sidebar only shows the level; changing it (rare, build-wide) is
    // the tab bar's Change level menu: Level up, or Set level… (a dialog
    // with the level plan grid, confirmed by its primary button).
    expect(header).toContain("build.effectiveLevel,");
    expect(header).not.toContain("<select");
    expect(characterEditor).toContain('icon="change-level"');
    expect(characterEditor).toContain('label="Change level"');
    expect(characterEditor).toContain(
      "changeCurrentLevel(build.effectiveLevel + 1)",
    );
    expect(characterEditor).toContain("<SetLevelDialog");
    expect(header).not.toContain("Experience");
    expect(header).not.toContain("snapshot.details.XP");
    // Details holds neither the level nor the name (both in the sidebar).
    expect(details).not.toContain("changeCurrentLevel");
    expect(details).not.toContain('name: "Name"');
    expect(styles).toMatch(
      /\.builder-sidebar-identity \.portrait-trigger\s*\{[^}]*height: 9rem;[^}]*width: 9rem;/,
    );
    expect(styles).toMatch(/\.builder-character-facts\s*\{[^}]*margin: 0;/);
    expect(styles).toMatch(
      /\.builder-character-name input\s*\{[^}]*background: transparent;[^}]*border: 0;[^}]*border-bottom: 1px solid transparent;/,
    );
    expect(styles).toMatch(
      /\.builder-character-name\s*\{[^}]*font-size: 1\.5rem;/,
    );
    expect(styles).toMatch(
      /\.builder-character-name input:hover:not\(:focus-visible\)\s*\{[^}]*box-shadow: inset 0 -1px var\(--border-strong\)/,
    );
    expect(styles).toMatch(
      /\.builder-character-name input:focus-visible\s*\{[^}]*box-shadow: inset 0 -3px var\(--focus\)[^}]*outline: none/,
    );
    expect(styles).toMatch(
      /\.builder-layout\s*\{[^}]*grid-template-columns: var\(--builder-sidebar-width\) minmax\(0, 1fr\);/,
    );
    expect(styles).toMatch(/\.builder-sidebar\s*\{[^}]*position: sticky;/);
    expect(styles).not.toContain(".builder-heading {");
    expect(styles).toMatch(/\.builder-tabs\s*\{[^}]*overflow-x: auto/);
  });

  it("renders theme and granted powers as the shared printed power card", () => {
    const candidateDetails = candidateDetail.slice(
      candidateDetail.indexOf("export function CandidateDetail("),
    );
    expect(candidateDetails).toContain("themePowers.flatMap");
    expect(candidateDetails).toContain("<BuilderPowerCard");
    expect(candidateDetails).toContain("<BuilderItemCard");
    // Theme powers sit under their theme with no "Theme power" label.
    expect(candidateDetails).not.toContain("Theme power · Level");
    expect(candidateDetails).not.toContain("EmbeddedPowerCard");
    expect(builderCards).toContain('layout="panel"');
    expect(styles).toMatch(
      /\.print-reference-card\.is-panel\s*\{[^}]*height: auto/,
    );
  });

  it("balances entity headers without dropping meaningful status labels", () => {
    expect(candidateDetail).toContain(
      "relationship === undefined && !isUnavailable ? undefined",
    );
    expect(candidateDetail).toContain('className="candidate-relationship"');
    expect(candidateDetail).toContain('className="candidate-unavailable"');
    expect(styles).toMatch(/\.entity-kind\s*\{[^}]*margin-bottom: 0;/);
  });

  it("scopes collapsible descriptions to themes and puts every card source last", () => {
    const candidateDetails = candidateDetail.slice(
      candidateDetail.indexOf("export function CandidateDetail("),
    );
    expect(candidateDetails).toContain(
      'entity.type.trim().toLocaleLowerCase() === "theme"',
    );
    expect(candidateDetails).toContain("function ThemeCandidateDescription");
    expect(candidateDetails).toContain("proseBlocks(description)");
    expect(candidateDetails).toContain("blocks.slice(0, 1)");
    expect(candidateDetails).toContain("aria-controls={id}");
    expect(candidateDetails).toContain("aria-expanded={expanded}");
    expect(candidateDetails).toContain('{expanded ? "Less…" : "More…"}');
    expect(candidateDetails).toContain("key={entity.id}");
    expect(entityCard).toContain('["short description", "source"].includes(');
    expect(entityCard).toContain('className="detail-source-note"');
    expect(
      entityCard.indexOf('className="detail-source-note"'),
    ).toBeGreaterThan(entityCard.indexOf("{afterFields}"));
    expect(styles).toMatch(
      /\.prose-blocks > \.prose-paragraph\s*\{[^}]*text-indent: 1\.5em/,
    );
    expect(styles).toMatch(/\.prose-blocks > h6\s*\{[^}]*text-indent: 0/);
    expect(styles).toMatch(
      /\.prose-blocks > :is\(ol, ul\)\s*\{[^}]*text-indent: 0/,
    );
  });

  it("uses one entity-card design and flavortext preference everywhere", () => {
    const candidateDetails = candidateDetail.slice(
      candidateDetail.indexOf("export function CandidateDetail("),
    );
    expect(candidateDetails).toContain("reference-entity-card");
    expect(candidateDetails).toContain("primaryDetailTypeLabel(entity)");
    expect(candidateDetails).toContain("EntityCardBody");
    expect(equipmentWorkspace).toContain("<BuilderItemCard");
    expect(equipmentWorkspace).toContain("<BuilderPowerCard");
    expect(entityCard).toContain('className="detail-heading-row"');
    expect(entityCard).toContain("primaryDetailTypeLabel(entity)");
    expect(entityCard).toContain(
      "<EntityCardLeadingIcon entity={entity} physicalBase={physicalBase} />",
    );
    expect(entityCard).toContain('contentSpecificValue(entity, "Action Type")');
    expect(entityCard).not.toContain('className="entity-card-attack-type"');
    expect(entityCard).toContain("itemCardLabel(entity, physicalBase)");
    expect(entityCard).toContain("itemCardIcon(entity, physicalBase)");
    // Power and item rules render only through PowerCard/ItemCard (D079).
    expect(entityCard).not.toContain('className="entity-card-descriptors"');
    expect(entityCard).not.toContain('className="entity-card-rules"');
    expect(styles).toContain(".entity-card-heading-main .action-type-icon,");
    expect(styles).toMatch(
      /\.entity-card-heading-main > \.icon\s*\{[^}]*align-self: baseline[^}]*line-height: inherit/,
    );
    expect(entityCard).not.toContain("<h5>Description</h5>");
    expect(builderCards).toContain("useContext(HideFlavortextContext)");
    expect(entityCard).toContain(
      "entity.flavor === undefined || hideFlavortext",
    );
    expect(hideFlavortextContext).toContain(
      "export const HideFlavortextContext = createContext(false)",
    );
    expect(entityCard).not.toContain("createContext(false)");
    expect(app).toContain(
      "<HideFlavortextContext.Provider value={hideFlavortext}>",
    );
    expect(entityCard).toContain("groupClassSpecifics(fields)");
    expect(entityCard).toContain('type === "class" || type === "hybrid class"');
    expect(characterEditor).not.toContain("renderSpecifics");
    expect(equipmentWorkspace).not.toContain("renderSpecifics");
  });

  it("keeps table selection spatially stable and exposes removable selection chips", () => {
    const tableSource = candidateSelectionTable.slice(
      candidateSelectionTable.indexOf(
        "export function CandidateSelectionTable",
      ),
    );
    expect(tableSource).not.toContain("prioritizedCandidates");
    expect(tableSource).not.toContain('name="check"');
    expect(tableSource).toContain("candidate-selection-short");
    expect(tableSource).toContain("defaultCandidateSortFor(kind)");
    // Selections float in the table (collapsed sections and other pages
    // included) instead of being listed in a separate summary.
    expect(tableSource).not.toContain("SelectionSummary");
    expect(tableSource).toContain("offPageSelectedRows(true)");
    expect(tableSource).toContain("offPageSelectedRows(false)");
    // Many-pick tables (backgrounds) narrow to their selections on demand
    // instead of pinning some selected rows and not others.
    expect(tableSource).toContain("candidate-selection-unpinned");
    expect(tableSource).toContain('<Icon name="list-checks" />');
    expect(choiceEditors).toContain(
      'selectedOnlyToggle={kind === "background"}',
    );
    expect(tableSource).not.toContain("locateCandidate");
    expect(tableSource).not.toContain("scrollIntoView");
    expect(styles).not.toMatch(
      /\.selection-table-controls\s*\{[^}]*position:\s*sticky/,
    );
    expect(styles).not.toContain(".selection-summary");
    expect(tableSource).toContain('sortableHeader("power-source", "Power")');
    expect(tableSource).not.toContain('sortableHeader("action", "Action")');
    expect(tableSource).toContain('sortableHeader("attack", "Type")');
    expect(tableSource).toContain("powerTableActionLabel(entity)");
    expect(tableSource).toContain("powerTableAttackLabel(entity)");
    expect(tableSource).toContain("powerTableAttackTitle(entity)");
    expect(tableSource).not.toContain("<ActionTypeIcon");
    expect(tableSource).not.toContain("<AttackMetadataIcon");
    expect(styles).toMatch(
      /\.selection-table-scroll thead\s*\{[^}]*background: var\(--legacy-neutral\)/,
    );
    expect(styles).toMatch(
      /\.selection-table-scroll thead th\s*\{[^}]*background: var\(--legacy-neutral\)[^}]*position:\s*sticky[^}]*top:\s*0[^}]*z-index:\s*3/,
    );
    expect(styles).toMatch(
      /\.selection-table-scroll tbody \.table-section-row th\s*\{[^}]*background: var\(--brand-navy\)[^}]*position:\s*sticky[^}]*top:\s*var\(--selection-table-header-height\)[^}]*z-index:\s*2/,
    );
    expect(styles).toMatch(
      /\.selection-table-scroll table\s*\{[^}]*border-collapse: separate[^}]*border-spacing: 0/,
    );
    expect(candidateSelectionTable).toContain(
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
      /\.candidate-selection-power :is\(th, td\):nth-child\(n \+ 2\):nth-child\(-n \+ 5\)\s*\{[^}]*text-align: left/,
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
    expect(equipmentWorkspaceRule).toContain("var(--panel-card-width)");
    expect(styles).toMatch(
      /@media \(max-width: 60rem\)[\s\S]*?\.equipment-workspace\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\)/,
    );
    expect(styles).toMatch(
      /\.candidate-selection-short[\s\S]*?\.selection-table-scroll\s*\{[\s\S]*?height: auto/,
    );

    const backgroundSource = choiceEditors.slice(
      choiceEditors.indexOf("export function BackgroundChoiceGroup"),
      choiceEditors.indexOf("export function SkillTrainingEditor"),
    );
    expect(backgroundSource).toContain("<RepeatedCandidateTableEditor");
    expect(backgroundSource).toContain('kind="background"');
    expect(backgroundSource).not.toContain("<ChoiceEditor");
    expect(backgroundSource).not.toContain("Add another background");
    expect(choiceEditors).toContain("selectionLimit={choices.length}");
  });

  it("uses toggle semantics for clearable compact and ability choices", () => {
    const compactChoices = choiceEditors.slice(
      choiceEditors.indexOf("function CompactChoiceButtons"),
      choiceEditors.indexOf("export function BuildPresetPanel"),
    );
    expect(compactChoices).toContain(
      '{ "aria-label": label, role: "radiogroup" }',
    );
    expect(compactChoices).toContain(
      '{ "aria-checked": selected, role: "radio" }',
    );
    expect(compactChoices).toContain('{ "aria-pressed": selected }');
    expect(compactChoices).toContain("if (selected && clearable && !disabled)");
    expect(compactChoices).toContain("onClear();");
    expect(compactChoices).toContain('`${selected ? "is-selected" : ""}');
    expect(compactChoices).not.toContain("compact-choice-clear");
    expect(compactChoices).not.toContain('name="check"');
    expect(styles).toMatch(
      /\.compact-choice-options > button\.is-selected\s*\{\s*background: var\(--selected-soft\);\s*\}/,
    );

    const baseAbilities = baseAbilityScoreEditor.slice(
      baseAbilityScoreEditor.indexOf("export function BaseAbilityScoreEditor"),
    );
    expect(baseAbilities).toContain(
      "<KeyAbilitiesSummary sentence={keyAbilitiesSentence} />",
    );
    expect(baseAbilities).toContain(
      '<h5 className="visually-hidden" id="base-abilities">',
    );
    expect(baseAbilities).toContain("Ability score point buy");
    expect(baseAbilities).not.toContain(">Point buy</h5>");
    expect(baseAbilities).toContain(
      '<span className="ability-base ability-column-label">Base</span>',
    );
    expect(baseAbilities).toContain(
      'className="ability-point-buy-row ability-point-buy-header"',
    );
    expect(baseAbilities).toContain('aria-hidden="true"');
    expect(baseAbilities).toContain('className="ability-name"');
    expect(baseAbilities).toContain("<KeyAbilityName");
    expect(baseAbilities).toContain("aria-label={decrement.ariaLabel}");
    expect(baseAbilities).toContain("title={decrement.title}");
    expect(baseAbilities).toContain("disabled={decrement.disabled}");
    expect(baseAbilities).toContain("aria-label={increment.ariaLabel}");
    expect(baseAbilities).toContain("title={increment.title}");
    expect(baseAbilities).toContain("disabled={increment.disabled}");
    expect(baseAbilities).not.toContain("Next +1:");
    expect(baseAbilities).toContain(
      'aria-label="Reset ability scores to the default point-buy allocation"',
    );
    expect(baseAbilities).toMatch(/>\s*Reset\s*<\/button>/);
    expect(baseAbilities).not.toContain("Reset point buy");
    expect(baseAbilityScoreEditor).toContain('type="number"');
    expect(baseAbilityScoreEditor).toContain('event.key === "Enter"');
    expect(baseAbilityScoreEditor).toContain('event.key === "Escape"');
    expect(baseAbilities).toContain("className={`race-ability-choice");
    expect(baseAbilities).toContain("aria-pressed={");
    expect(baseAbilities).not.toContain('type="radio"');
    expect(characterEditor).toContain(
      "(candidate !== undefined && !isCandidateSelectable(candidate))",
    );
    expect(characterEditor).toContain(
      "candidate === undefined || candidate.eligible",
    );
    expect(styles).toMatch(
      /\.race-ability-choice\.is-selected\s*\{(?![^}]*border-left-color)[^}]*background: var\(--selected-soft\)/,
    );
    expect(styles).toMatch(
      /\.ability-stepper input\s*\{[^}]*appearance: textfield/,
    );
    expect(styles).toMatch(
      /\.ability-editor\s*\{[^}]*grid-template-columns: max-content auto max-content max-content minmax\(0, 1fr\)/,
    );
    expect(styles).toMatch(/\.ability-editor\s*\{[^}]*gap: 0\.65rem 0\.9rem/);
    expect(styles).toMatch(
      /\.ability-point-buy-row\s*\{[^}]*grid-column: 1 \/ 5[^}]*grid-template-columns: subgrid/,
    );
    expect(styles).toMatch(/\.ability-base\s*\{[^}]*grid-column: 2/);
    expect(styles).toMatch(/\.ability-race\s*\{[^}]*grid-column: 3/);
    expect(styles).toMatch(/\.ability-total\s*\{[^}]*grid-column: 4/);
    expect(styles).toMatch(
      /\.ability-race,[\s\S]*?\.ability-total\s*\{[^}]*justify-items: center[^}]*text-align: center/,
    );
    expect(styles).toMatch(
      /\.ability-stepper input::-webkit-inner-spin-button,[\s\S]*?\.ability-stepper input::-webkit-outer-spin-button\s*\{[^}]*appearance: none[^}]*margin: 0/,
    );
    expect(styles).toMatch(
      /\.key-ability-marker\s*\{[^}]*color: var\(--muted\)/,
    );

    const abilityChoices = choiceEditors.slice(
      choiceEditors.indexOf("export function AbilityIncreaseEditor"),
      choiceEditors.indexOf("export function RepeatedChoiceGroup"),
    );
    expect(abilityChoices).toContain(
      "aria-pressed={selectedChoice !== undefined}",
    );
    expect(abilityChoices).toContain(
      "<KeyAbilitiesSummary sentence={keyAbilitiesSentence} />",
    );
    expect(abilityChoices).toMatch(
      /<KeyAbilityName marked=\{keyAbility\}>[\s\S]*?definition\?\.name[\s\S]*?<\/KeyAbilityName>[\s\S]*?className="ability-option-score"/,
    );
    expect(abilityChoices).toContain("const [pendingSlots, setPendingSlots]");
    expect(abilityChoices).toContain("abilityScoreWithPendingDelta(");
    expect(abilityChoices).toContain("[...optimisticSlots.values()].filter(");
    expect(abilityChoices).toContain("[...evaluatedSlots.values()].filter(");
    expect(abilityChoices).toContain('"ability-selected"');
    expect(abilityChoices).not.toContain('name="check"');
    expect(styles).toMatch(
      /\.ability-increase-grid button\.ability-selected\s*\{[^}]*background: var\(--selected-soft\)[^}]*border-color: var\(--selected\)/,
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
      "{ ...evaluationBuild, effectiveLevel: selectedLevel }",
    );
    expect(
      characterEditor.match(/evaluation=\{selectedLevelEvaluation\}/g),
    ).toHaveLength(2);
  });

  it("retains check glyphs for non-radio completion states", () => {
    const emptyStart = characterEditor.indexOf(
      'className="choice-empty-state"',
    );
    const emptyLevelState = characterEditor.slice(
      emptyStart,
      characterEditor.indexOf("</div>", emptyStart),
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

  it("keeps the legacy semantic palette and uses no pill-shaped chrome", () => {
    for (const token of [
      "--power-at-will: #006400",
      "--power-encounter: #8b0000",
      "--power-daily: #808080",
      "--power-utility: #000080",
      "--power-item: #ff8c00",
    ])
      expect(styles).toContain(token);
    // Shop filter chips square off like every other builder button.
    expect(styles).toMatch(
      /\.shop-filter-chip,[\s\S]*?\.shop-filter-button\s*\{[^}]*border-radius: 2px;/,
    );
    expect(styles).not.toContain("border-radius: 999px");
  });

  it("keeps loadout slots compact and leaves shopping to the Shop tab", () => {
    expect(equipmentWorkspace).toContain(
      'aria-label={workspace === "equipment" ? "Equipment" : "Shop"}',
    );
    expect(equipmentWorkspace).not.toContain('id="equipment-heading"');
    expect(equipmentWorkspace).toContain('className="loadout-slot-label"');
    expect(equipmentWorkspace).not.toContain("loadoutShopSlotFilter");
    expect(equipmentWorkspace).not.toContain("loadout-slot-shop");
    expect(equipmentWorkspace).not.toContain("Shop for ${label} items");
    expect(styles).toContain(
      "grid-template-columns: max-content minmax(0, 18rem)",
    );
    expect(styles).toContain("grid-template-columns: subgrid");
    expect(styles).toContain("max-inline-size: 18rem");
  });

  it("keeps Equipment and Shop icons decorative while retaining text labels", () => {
    expect(icon).toContain("handbag: Handbag");
    expect(icon).toContain('"shopping-cart": ShoppingCart');
    expect(icon).toContain('"scroll-text": ScrollText');
    expect(icon).toContain('aria-hidden="true"');
    expect(characterEditor).toContain('<Icon name="handbag" /> Inventory');
    expect(characterEditor).toContain('<Icon name="sword" /> Loadout');
    expect(characterEditor).toContain('<Icon name="shopping-cart" /> Shop');
    expect(equipmentWorkspace).not.toContain("equipment-view-toggle");
  });

  it("keeps Shop filtering local, labeled, and independent of acquisition", () => {
    expect(shopWorkspace).toContain('type="search"');
    expect(shopWorkspace).toContain('placeholder="Search all items…"');
    expect(shopWorkspace).toContain("aria-pressed={affordable}");
    expect(shopWorkspace).toContain("aria-pressed={proficient}");
    expect(shopWorkspace).toContain("aria-label={`Buy ${displayName}`}");
    expect(shopWorkspace).toContain("aria-label={`Give ${displayName}`}");
    expect(shopWorkspace).toContain('role="radiogroup"');
    expect(shopWorkspace).toContain('className="shop-result-tools"');
    expect(shopWorkspace).toContain('className="shop-physical-choice"');
    expect(shopWorkspace).toContain('aria-label="Not proficient"');
    expect(shopWorkspace).toContain("setInspectedEntityId(entity.id)");
    expect(shopWorkspace).toContain('"is-selected"');
    expect(equipmentWorkspace).toContain('id="funds-wallet-adjustment"');
    // Quick adjust changes the typed coin rather than re-minting the wallet.
    expect(equipmentWorkspace).toContain("parseCoinAdjustment(adjustment)");
    expect(characterEditor).toContain(
      "adjustWalletCoins(carried, stored, coins)",
    );
    expect(equipmentWorkspace).toContain("onAdjustMoney(coins, location)");
    // Quick adjust is a field in the funds grid, not a popup.
    expect(equipmentWorkspace).toContain('className="funds-adjust-form"');
    expect(equipmentWorkspace).not.toContain("funds-wallet-adjust-options");
    expect(equipmentWorkspace).toContain("applyAdjustment()");
    // One wallet, in the character sidebar (CharacterWallet).
    expect(equipmentWorkspace.match(/<FundsPane/g)).toHaveLength(1);
    expect(characterEditor).toContain("<CharacterWallet");
    expect(equipmentWorkspace).toContain(
      "Adjust funds, for example -15 gp or 20pp",
    );
    // Coin counts are edited in place; there is no edit-funds dialog.
    expect(equipmentWorkspace).not.toContain('aria-label="Edit funds"');
    expect(equipmentWorkspace).not.toContain("function WalletDialog");
    expect(equipmentWorkspace).toContain(
      "className={`stat-tile funds-coin-tile",
    );
    expect(equipmentWorkspace).toContain("startCoinEdit(denomination)");
    expect(equipmentWorkspace).toContain(
      "onSetWallet(walletWithCoinCount(wallet, editing.coin, count, location))",
    );
    expect(characterEditor).toContain("onSetWallet={setWalletAmounts}");
    expect(equipmentWorkspace).not.toContain(
      'className="inventory-wallet-label"',
    );
    expect(styles).not.toContain(".funds-wallet-adjust");
    // Funds stay in view through the sticky character sidebar instead.
    expect(styles).not.toContain(".shop-funds");
    expect(styles).toMatch(/\.builder-sidebar\s*\{[^}]*position: sticky;/s);
    expect(styles).not.toMatch(
      /\.shared-choice-detail\.shop-rail\s*\{[^}]*position: sticky;/s,
    );
    expect(equipmentWorkspace).toContain(
      "` is-adjusted is-${walletPulse.direction}`",
    );
    expect(styles).toContain(
      ".inventory-wallet-denominations > div.is-adjusted.is-decrease",
    );
    expect(styles).toContain("animation: wallet-denomination-decreased");
    expect(styles).toMatch(
      /\.shop-toolbar\s*\{[^}]*grid-template-columns: max-content minmax\(8rem, 1fr\) minmax\(8rem, 1\.35fr\)/s,
    );
    expect(styles).toMatch(
      /\.shop-result-tools\s*\{[^}]*display: flex;[^}]*flex-wrap: wrap;/s,
    );
    const browseIndex = shopWorkspace.indexOf(
      '<span className="inline-field-label">Type</span>',
    );
    const slotIndex = shopWorkspace.indexOf(
      '<span className="inline-field-label">Slot</span>',
    );
    const subtypeIndex = shopWorkspace.indexOf(
      '<span className="inline-field-label">Subtype</span>',
    );
    const resultToolsIndex = shopWorkspace.indexOf(
      '<div className="shop-result-tools">',
    );
    const searchIndex = shopWorkspace.indexOf(
      '<label className="shop-search">',
    );
    expect(browseIndex).toBeGreaterThan(-1);
    expect(slotIndex).toBeGreaterThan(browseIndex);
    expect(subtypeIndex).toBeGreaterThan(slotIndex);
    expect(resultToolsIndex).toBeGreaterThan(subtypeIndex);
    expect(searchIndex).toBeGreaterThan(resultToolsIndex);
    expect(styles).toMatch(
      /\.shop-table tbody tr\.is-selected[^{]*\{[^}]*box-shadow: inset 3px 0 var\(--accent\)/s,
    );
    expect(styles).toMatch(
      /\.shop-toolbar > label,[\s\S]*?\.shop-physical-tools label\s*\{[^}]*color: var\(--muted\);[^}]*font-size: 0\.6875rem;[^}]*font-weight: 800;[^}]*letter-spacing: 0\.05em;[^}]*text-transform: uppercase;/s,
    );
  });

  it("gives every candidate table a focused, per-choice illegal-options toggle", () => {
    expect(builderChoiceContext).not.toContain("ShowAllChoicesContext");
    expect(candidateSelectionTable).toContain(
      "readonly onToggleShowIllegal?: () => void;",
    );
    const toggleButton = candidateSelectionTable.slice(
      candidateSelectionTable.indexOf("{onToggleShowIllegal === undefined"),
      candidateSelectionTable.indexOf(
        '<span className="selection-table-count">',
      ),
    );
    expect(toggleButton).toContain(
      'className="icon-only-button button-icon selection-illegal-toggle"',
    );
    expect(toggleButton).toContain("aria-pressed={showIllegal === true}");
    expect(toggleButton).toContain("Show illegal options");
    expect(toggleButton).toContain(
      "options the rules do not allow you to pick",
    );
    expect(toggleButton).toContain('<Icon name="scale" />');
    expect(styles).toMatch(
      /\.selection-illegal-toggle\[aria-pressed="true"\]\s*\{[^}]*background: var\(--power-item-soft\);/,
    );
    for (const factory of [
      "ReplacementEditor",
      "ChoiceEditor",
      "RepeatedCandidateTableEditor",
    ] as const) {
      const start = choiceEditors.indexOf(`function ${factory}(`);
      expect(start).toBeGreaterThan(-1);
      const body = choiceEditors.slice(start);
      expect(body).toContain("const [showAll, setShowAll] = useState(false);");
      expect(body).toContain("onToggleShowIllegal={() => setShowAll");
    }
  });
  it("navigates without an app header through per-page icon actions", () => {
    expect(app).not.toContain('className="app-header"');
    expect(styles).not.toContain(".app-header");
    expect(characterLibrary).toContain('<h1 className="app-brand">');
    expect(characterLibrary).toContain('href="#/settings"');
    expect(settingsPage).toContain('aria-label="Close settings"');
    expect(characterEditor).toContain('aria-label="Character sheet"');
    expect(characterEditor).toContain('aria-label="Close character"');
  });
  it("merges carried and stored funds by default, with a switch when separate", () => {
    expect(settingsPage).toContain("Merge carried and stored funds");
    expect(app).toContain(
      'localStorage.getItem(MERGE_FUNDS_STORAGE_KEY) !== "0"',
    );
    expect(app).toContain("mergeFunds={mergeFunds}");
    expect(characterEditor).toContain("mergeFunds={mergeFunds}");
    expect(equipmentWorkspace).toContain('aria-label="Funds location"');
    expect(equipmentWorkspace).toContain("{mergeFunds ? null : (");
  });
  it("keeps every dialog on the shared contract, without nagging labels", () => {
    const sources = readdirSync(new URL(".", import.meta.url))
      .filter((name) => name.endsWith(".tsx") && !name.includes(".test."))
      .map((name) => [
        name,
        readFileSync(new URL(`./${name}`, import.meta.url), "utf8"),
      ]);
    for (const [name, source] of sources) {
      // Declining is "Cancel": "Not now" and "Maybe later" are nag patterns.
      expect(source, name).not.toMatch(/>\s*(Not now|Maybe later)\s*</i);
      if (!source!.includes("<dialog")) continue;
      expect(source, name).toContain("dialog-shell");
      expect(source, name).toContain('className="button-icon dialog-close"');
      expect(source, name).toContain('aria-label="Close"');
      // One heading: no eyebrow label repeating it above the title.
      expect(source, name).not.toContain('className="eyebrow"');
    }
    expect(styles).toMatch(/\.dialog-shell::backdrop\s*\{/);
    expect(styles).toMatch(
      /\.dialog-footer-start\s*\{[^}]*margin-inline-end:\s*auto;/,
    );
    expect(styles).not.toMatch(
      /\.(portrait|content-update|preset-replace|shop-physical)-dialog::backdrop/,
    );
  });

  it("returns Settings to the page it was opened from, also on Esc", () => {
    const settings = readFileSync(
      new URL("./SettingsPage.tsx", import.meta.url),
      "utf8",
    );
    expect(settings).toContain("href={closeHref}");
    expect(settings).toContain("window.location.hash = closeHref;");
    expect(settings).not.toContain("Advanced content options");
  });
});
