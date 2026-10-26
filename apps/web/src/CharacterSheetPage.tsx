import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import { CharacterRepository } from "@4ecb/browser-storage";
import {
  characterDisplayName,
  normalizeSheetLayout,
  withSheetCardsShown,
  withSheetSectionShown,
  type CharacterPortrait,
  type CharacterRecord,
  type SheetLayout,
  type SheetSectionId,
} from "@4ecb/character-domain";
import type { ContentPackManifest } from "@4ecb/content-pack";
import { appContentRuntime, type RulesRuntimeClient } from "./app-runtime";
import {
  projectBuildForEvaluation,
  type EvaluatedCharacter,
} from "@4ecb/rules-engine";
import {
  applySheetLayout,
  buildEvaluatedSheetModel,
  buildSheetModel,
  featureChoiceText,
  isSheetPlayCard,
  sortedPowerCards,
  type CharacterSheetModel,
  type SheetDeckCard,
  type SheetLayoutCard,
  type SheetValue,
} from "@4ecb/sheet-model";

import { contentProfileMatchesRevision } from "./profile-migration";
import { loadCharacter, persistCharacterDraft } from "./character-drafts";
import { Icon } from "./Icon";
import type { PaperSize } from "./paper-size";
import { PortraitImage } from "./PortraitEditor";
import { inventoryCategory } from "./equipment-ui";
import { PrintCharacterCard, PrintSkillsCard } from "./PrintPlayCards";
import { BeastCompanionCard } from "./BeastCompanionCard";
import { FamiliarCard } from "./FamiliarCard";
import { ItemCard } from "./ItemCard";
import { ItemSetCard } from "./ItemSetCard";
import { LoadingScreen } from "./LoadingScreen";
import { loadingStepDetail, useLoadingProgress } from "./use-loading-progress";
import { PowerCard } from "./PowerCard";
import { cardTextPresentation } from "./BuilderCards";
import { preferredPrintCardTextSize } from "./print-card-fit";
import { printWithFileName } from "./print-file-name";
import { SheetOverview, type SheetSectionControl } from "./SheetOverview";
import { SegmentedControl } from "./SegmentedControl";
import { SheetEditTarget, usePrinting } from "./SheetEditMenu";
import { sheetCardLabel, SHEET_SECTION_LABELS } from "./sheet-edit-labels";
import { useArmedAction } from "./useArmedAction";

const characters = new CharacterRepository();

/** Each holding's `showPowerCard` flag: whether it prints an item card. */
const holdingCardFlags = (record: CharacterRecord | undefined) =>
  new Map(
    (record?.build.inventory ?? []).map((entry) => [
      entry.id,
      entry.showPowerCard !== false,
    ]),
  );

function ValueList({
  values,
  className = "",
}: {
  readonly values: readonly SheetValue[];
  readonly className?: string;
}) {
  return (
    <dl className={`sheet-values ${className}`}>
      {values.map((entry) => (
        <div key={entry.label}>
          <dt>{entry.label}</dt>
          <dd>{entry.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function PrintCard({
  card,
  model,
  name,
  portrait,
  characterLevel,
}: {
  readonly card: SheetDeckCard;
  readonly model: CharacterSheetModel;
  readonly name: string;
  readonly portrait: CharacterPortrait | undefined;
  readonly characterLevel: number;
}) {
  if (isSheetPlayCard(card))
    return card.kind === "play-character" ? (
      <PrintCharacterCard model={model} name={name} portrait={portrait} />
    ) : (
      <PrintSkillsCard model={model} />
    );
  if (card.kind === "beast") return <BeastCompanionCard card={card} />;
  if (card.kind === "familiar") return <FamiliarCard card={card} />;
  if (card.kind === "item-set") return <ItemSetCard card={card} />;
  return card.kind === "power" ? (
    <PowerCard card={card} characterLevel={characterLevel} />
  ) : (
    <ItemCard card={card} />
  );
}

function chunks<Value>(values: readonly Value[], size: number): Value[][] {
  const result: Value[][] = [];
  for (let index = 0; index < values.length; index += size)
    result.push(values.slice(index, index + size));
  return result;
}

export function CharacterSheetPage({
  characterId,
  manifests,
  printOnReady = false,
  openPrintPreview = false,
  resolveAbilityChoices = true,
  proficientEquipmentOnly = true,
  abbreviateAbilityValues = true,
  printCardTextSize = 8,
  countCoinWeight = true,
  paper = "letter",
  sheetEditing = false,
  onSheetModeChange,
}: {
  readonly characterId: string;
  readonly manifests: readonly ContentPackManifest[];
  readonly printOnReady?: boolean;
  readonly openPrintPreview?: boolean;
  readonly resolveAbilityChoices?: boolean;
  readonly proficientEquipmentOnly?: boolean;
  readonly abbreviateAbilityValues?: boolean;
  readonly printCardTextSize?: number;
  readonly countCoinWeight?: boolean;
  /** The app-wide paper size (a preference, not per-character data). */
  readonly paper?: PaperSize;
  /** The print preview's Edit mode (`?preview=1&edit=1`, D099). */
  readonly sheetEditing?: boolean;
  readonly onSheetModeChange?: (editing: boolean) => void;
}) {
  const [showPrintPreview, setShowPrintPreview] = useState(openPrintPreview);
  useEffect(() => {
    setShowPrintPreview(openPrintPreview);
  }, [characterId, openPrintPreview]);
  const [character, setCharacter] = useState<CharacterRecord>();
  const [content, setContent] =
    useState<Awaited<ReturnType<typeof appContentRuntime.getPack>>>();
  const [error, setError] = useState<string>();
  const [evaluationError, setEvaluationError] = useState<string>();
  const [evaluation, setEvaluation] = useState<EvaluatedCharacter>();
  const [evaluating, setEvaluating] = useState(false);
  const [contentLoaded, setContentLoaded] = useState(false);
  // Latched once the first sheet is ready, so settings changes that
  // re-evaluate keep the sheet on screen instead of reopening the loader.
  const [initialLoadSettled, setInitialLoadSettled] = useState(false);
  const [rulesClient, setRulesClient] = useState<RulesRuntimeClient>();
  const printRequested = useRef(false);
  // Sheet presentation lives apart from `character`, so changing it never
  // re-evaluates the character or rebuilds the sheet model (D099).
  const [sheetLayout, setSheetLayout] = useState<SheetLayout>();
  const [itemCardsShown, setItemCardsShown] = useState<
    ReadonlyMap<string, boolean>
  >(() => new Map());
  // Edit mode's "Show hidden" reveal: a per-visit view toggle, not saved.
  const [showHidden, setShowHidden] = useState(false);
  const printing = usePrinting();
  const resetAction = useArmedAction("sheet-reset-trigger");
  const [saveError, setSaveError] = useState<string>();
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const latestPresentation = useRef({ sheetLayout, itemCardsShown });
  latestPresentation.current = { sheetLayout, itemCardsShown };
  useEffect(() => {
    setError(undefined);
    setSheetLayout(undefined);
    setItemCardsShown(new Map());
    setSaveError(undefined);
    setInitialLoadSettled(false);
    setCharacter(undefined);
    setContent(undefined);
    setEvaluation(undefined);
    setEvaluationError(undefined);
    setContentLoaded(false);
    void (async () => {
      try {
        const loaded = await loadCharacter(characters, characterId);
        setCharacter(loaded);
        setSheetLayout(normalizeSheetLayout(loaded?.sheetLayout));
        setItemCardsShown(holdingCardFlags(loaded));
        if (loaded?.profileBinding !== undefined)
          setContent(
            await appContentRuntime.getPack(loaded.profileBinding.packId),
          );
      } catch (reason: unknown) {
        setError(reason instanceof Error ? reason.message : String(reason));
      } finally {
        setContentLoaded(true);
      }
    })();
  }, [characterId]);
  useEffect(() => {
    printRequested.current = false;
  }, [characterId, printOnReady]);
  const exactProfile = contentProfileMatchesRevision(
    character?.profileBinding,
    content?.manifest,
  );
  useEffect(() => {
    if (character === undefined || content === undefined || !exactProfile)
      return;
    let cancelled = false;
    setEvaluating(true);
    setEvaluation(undefined);
    setEvaluationError(undefined);
    void appContentRuntime
      .getRulesClient(
        content.manifest.packId,
        character.profileBinding?.contentDigest,
      )
      .then((client) => {
        if (!cancelled) setRulesClient(client);
        return client.evaluate({
          ...projectBuildForEvaluation(character.build, content.entities),
          // Sheets consume calculated powers, but never selectable choice
          // catalogs. Keep powers at their compatibility-default `true`.
          candidateDetailLevels: [],
        });
      })
      .then((result) => {
        if (cancelled) return;
        if (!result.converged) {
          setEvaluationError(
            "The rules engine did not converge, so the legacy cached sheet remains visible.",
          );
          return;
        }
        setEvaluation(result);
      })
      .catch((reason: unknown) => {
        if (!cancelled)
          setEvaluationError(
            reason instanceof Error ? reason.message : String(reason),
          );
      })
      .finally(() => {
        if (!cancelled) setEvaluating(false);
      });
    return () => {
      cancelled = true;
    };
  }, [character?.build, content, exactProfile]);
  const model = useMemo(() => {
    if (character === undefined) return undefined;
    const byId = new Map(
      (exactProfile ? (content?.entities ?? []) : []).map((entity) => [
        entity.id.toLocaleLowerCase(),
        entity,
      ]),
    );
    const options = {
      countCoinWeight,
      resolveAbilityChoices,
      proficientEquipmentOnly,
      inventoryCategory: (
        elements: Parameters<typeof inventoryCategory>[0]["elements"],
      ) => inventoryCategory({ elements }, byId),
    };
    return evaluation !== undefined && content !== undefined && exactProfile
      ? buildEvaluatedSheetModel(
          character.snapshot,
          character.build,
          evaluation,
          content.entities,
          options,
        )
      : buildSheetModel(
          character.snapshot,
          exactProfile ? content?.entities : undefined,
          options,
        );
  }, [
    character,
    content,
    evaluation,
    exactProfile,
    resolveAbilityChoices,
    proficientEquipmentOnly,
    countCoinWeight,
  ]);
  const evaluatedSheetReady =
    !exactProfile || evaluation !== undefined || evaluationError !== undefined;
  const initialLoadReady =
    initialLoadSettled || (contentLoaded && evaluatedSheetReady);
  useEffect(() => {
    if (initialLoadReady) setInitialLoadSettled(true);
  }, [initialLoadReady]);
  const loadingProgress = useLoadingProgress(
    character?.profileBinding?.packId,
    rulesClient,
    !initialLoadReady,
  );
  // Saves are silent and serialized (D098): only a failure shows, with a
  // retry that saves the whole current presentation.
  const savePresentation = useCallback(
    (changes: Parameters<CharacterRepository["updateMetadata"]>[1]) => {
      saveQueue.current = saveQueue.current
        .then(async () => {
          await persistCharacterDraft(characters, characterId);
          await characters.updateMetadata(characterId, changes);
          setSaveError(undefined);
        })
        .catch((reason: unknown) => {
          setSaveError(
            reason instanceof Error ? reason.message : String(reason),
          );
        });
    },
    [characterId],
  );
  const retrySave = useCallback(() => {
    const current = latestPresentation.current;
    savePresentation({
      sheetLayout: current.sheetLayout ?? null,
      itemCardsShown: Object.fromEntries(current.itemCardsShown),
    });
  }, [savePresentation]);
  const updateLayout = useCallback(
    (next: SheetLayout | undefined) => {
      setSheetLayout(next);
      savePresentation({ sheetLayout: next ?? null });
    },
    [savePresentation],
  );
  const showSection = useCallback(
    (section: SheetSectionId, shown: boolean) =>
      updateLayout(
        withSheetSectionShown(
          latestPresentation.current.sheetLayout,
          section,
          shown,
        ),
      ),
    [updateLayout],
  );
  const showCards = useCallback(
    (cards: readonly SheetLayoutCard[], shown: boolean) => {
      const holdingIds = cards.flatMap(({ holdingId }) =>
        holdingId === undefined ? [] : [holdingId],
      );
      const layoutCards = cards.filter(
        ({ holdingId }) => holdingId === undefined,
      );
      const current = latestPresentation.current;
      const nextLayout =
        layoutCards.length === 0
          ? current.sheetLayout
          : withSheetCardsShown(current.sheetLayout, layoutCards, shown);
      if (holdingIds.length > 0) {
        const nextFlags = new Map(current.itemCardsShown);
        for (const id of holdingIds) nextFlags.set(id, shown);
        setItemCardsShown(nextFlags);
      }
      if (layoutCards.length > 0) setSheetLayout(nextLayout);
      savePresentation({
        ...(layoutCards.length === 0
          ? {}
          : { sheetLayout: nextLayout ?? null }),
        ...(holdingIds.length === 0
          ? {}
          : {
              itemCardsShown: Object.fromEntries(
                holdingIds.map((id) => [id, shown]),
              ),
            }),
      });
    },
    [savePresentation],
  );
  // Defaults: no layout deltas, and every holding prints its card.
  const resetPresentation = useCallback(() => {
    const flags = latestPresentation.current.itemCardsShown;
    setSheetLayout(undefined);
    setItemCardsShown(new Map([...flags.keys()].map((id) => [id, true])));
    savePresentation({
      sheetLayout: null,
      itemCardsShown: Object.fromEntries(
        [...flags.keys()].map((id) => [id, true]),
      ),
    });
  }, [savePresentation]);
  const resolvedLayout = useMemo(
    () =>
      model === undefined
        ? undefined
        : applySheetLayout(model, sheetLayout, { itemCardsShown }),
    [model, sheetLayout, itemCardsShown],
  );
  const sectionControl = useCallback<SheetSectionControl>(
    (section, hidden) => {
      const label = SHEET_SECTION_LABELS[section];
      const menuLabel = `Section options for ${label}`;
      const items = [
        hidden
          ? {
              label: "Show section",
              onSelect: () => showSection(section, true),
            }
          : {
              label: "Hide section",
              onSelect: () => showSection(section, false),
            },
      ];
      if (!hidden)
        return (
          <div className="sheet-section-edit print-excluded">
            <SheetEditTarget
              className="sheet-section-edit-target"
              items={items}
              menuLabel={menuLabel}
            />
          </div>
        );
      return showHidden ? (
        <div className="sheet-hidden-section print-excluded">
          <SheetEditTarget
            className="sheet-hidden-section-target"
            hidden
            items={items}
            menuLabel={menuLabel}
          >
            <span className="sheet-hidden-section-label">Hidden · {label}</span>
          </SheetEditTarget>
        </div>
      ) : null;
    },
    [showHidden, showSection],
  );
  // A saved PDF is named "Ingi - Level 8.pdf", from the title and print path.
  const pdfTitle =
    character === undefined
      ? undefined
      : `${characterDisplayName(character) || "Unnamed character"} - Level ${character.build.effectiveLevel}`;
  useEffect(() => {
    if (pdfTitle === undefined) return;
    const previous = document.title;
    document.title = pdfTitle;
    return () => {
      document.title = previous;
    };
  }, [pdfTitle]);
  const print = useCallback(
    () => printWithFileName(pdfTitle ?? document.title),
    [pdfTitle],
  );
  useEffect(() => {
    if (
      !printOnReady ||
      printRequested.current ||
      model === undefined ||
      error !== undefined ||
      !contentLoaded ||
      !evaluatedSheetReady
    )
      return;
    printRequested.current = true;
    if (window.location.hash.endsWith("?print=1"))
      window.history.replaceState(
        null,
        "",
        window.location.hash.slice(0, -"?print=1".length),
      );
    let finalFrame: number | undefined;
    const initialFrame = window.requestAnimationFrame(() => {
      finalFrame = window.requestAnimationFrame(print);
    });
    return () => {
      window.cancelAnimationFrame(initialFrame);
      if (finalFrame !== undefined) window.cancelAnimationFrame(finalFrame);
    };
  }, [contentLoaded, error, evaluatedSheetReady, model, print, printOnReady]);
  const printPaper = paper;
  useEffect(() => {
    const link = document.createElement("link");
    link.dataset.printPaper = printPaper;
    link.href = `${import.meta.env.BASE_URL}print-${printPaper}.css`;
    link.media = "print";
    link.rel = "stylesheet";
    document.head.append(link);
    return () => link.remove();
  }, [printPaper]);
  if (error !== undefined)
    return (
      <main className="sheet-page" id="main-content">
        <div className="error">{error}</div>
      </main>
    );
  if (
    character === undefined ||
    model === undefined ||
    resolvedLayout === undefined ||
    !initialLoadReady
  )
    return (
      <LoadingScreen
        className="sheet-page"
        portraitUrl={character?.portrait?.renderedDataUrl}
        label={
          character === undefined || !characterDisplayName(character)
            ? "Generating character sheet…"
            : `Generating ${characterDisplayName(character)}'s character sheet…`
        }
        detail={
          character === undefined
            ? undefined
            : loadingStepDetail(contentLoaded, loadingProgress)
        }
      />
    );
  const boundManifest =
    character.profileBinding === undefined
      ? undefined
      : manifests.find(
          (manifest) => manifest.packId === character.profileBinding?.packId,
        );
  const profileMismatch =
    boundManifest !== undefined &&
    character.profileBinding?.contentDigest !== undefined &&
    boundManifest.contentDigest !== character.profileBinding.contentDigest;
  const characterName = characterDisplayName(character) || "Unnamed character";
  const identitySummary = model.identity
    .filter((entry) => ["Level", "Race", "Class"].includes(entry.label))
    .map((entry) => entry.value)
    .join(" · ");
  const recoveryHref =
    character.profileBinding === undefined ? "#/settings" : "#/characters";
  const recoveryLabel =
    character.profileBinding === undefined
      ? "Open game content settings"
      : "Review the character library";
  const sourceNotice =
    model.source === "authoritative-evaluation" ? undefined : model.source ===
      "native-empty" ? (
      <>
        <strong>No cached calculation snapshot.</strong> This character was
        created in the web builder and needs its exact content profile for an
        authoritative sheet.{" "}
        {boundManifest === undefined
          ? `The bound content profile (${character.profileBinding?.packId ?? "unknown"}) is missing; re-import it to restore evaluation.`
          : profileMismatch
            ? `The installed ${boundManifest.name} revision differs from the one bound to this character; preview and adopt it in the library before evaluation.`
            : evaluating
              ? "The rules engine is evaluating the bound profile…"
              : (evaluationError ??
                `The exact ${boundManifest.name} profile is installed, but evaluation is not available.`)}
      </>
    ) : (
      <>
        <strong>Legacy cached calculations.</strong> Values shown here were
        computed by the original builder because an exact modern evaluation is
        not available.{" "}
        {character.profileBinding === undefined
          ? "No content profile is bound, so card rules text may be limited."
          : boundManifest === undefined
            ? `The bound content profile (${character.profileBinding.packId}) is missing; re-import it to restore evaluation and full card text.`
            : profileMismatch
              ? `The installed ${boundManifest.name} revision differs from the one bound to this character; preview and adopt it in the library before evaluation.`
              : evaluating
                ? "The rules engine is evaluating the bound profile…"
                : (evaluationError ??
                  `The exact ${boundManifest.name} profile is installed, but evaluation is not available.`)}
      </>
    );
  const powerCards = sortedPowerCards(model.powers);
  const screenItems = resolvedLayout.deck.flatMap(({ card, group }) =>
    group === "items" && card.kind === "item" ? [card] : [],
  );
  const editing = showPrintPreview && sheetEditing;
  // Printing always drops Edit mode's controls and its hidden-card reveal.
  const editControls = editing && !printing;
  const revealHidden = editControls && showHidden;
  // Hidden cards leave the deck before it is cut into 9-card pages; "Show
  // hidden" keeps them in their deck position, dimmed, on screen only.
  const printCardPages = chunks(
    revealHidden
      ? resolvedLayout.cards
      : resolvedLayout.cards.filter((card) => card.shown),
    9,
  );
  const resetArmed = resetAction.isArmed("sheet");
  const resettable =
    sheetLayout !== undefined ||
    [...itemCardsShown.values()].some((shown) => !shown);
  const characterLevel =
    Number(
      model.identity.find((entry) => entry.label === "Level")?.value ??
        character.snapshot.levelCount,
    ) || 1;
  return (
    <main
      className={`sheet-page paper-${paper}${showPrintPreview ? " is-print-preview" : ""}${editing ? " is-sheet-editing" : ""}`}
      id="main-content"
      style={
        {
          "--preferred-print-card-text-size": String(
            preferredPrintCardTextSize(printCardTextSize),
          ),
        } as CSSProperties
      }
    >
      {showPrintPreview ? (
        <div className="print-preview-toolbar page-actions">
          {openPrintPreview ? (
            <button
              aria-label="Back"
              className="icon-only-button button-icon"
              title="Back"
              type="button"
              onClick={() => {
                if (window.history.length > 1) window.history.back();
                else
                  window.location.hash = `#/characters/${encodeURIComponent(characterId)}/edit`;
              }}
            >
              <Icon name="back" />
            </button>
          ) : (
            <button
              aria-label="Back to character view"
              className="icon-only-button button-icon"
              title="Back to character view"
              type="button"
              onClick={() => setShowPrintPreview(false)}
            >
              <Icon name="back" />
            </button>
          )}
          <SegmentedControl
            label="Sheet"
            options={[
              ["view", "View"],
              ["edit", "Edit"],
            ]}
            value={editing ? "edit" : "view"}
            onChange={(mode) => onSheetModeChange?.(mode === "edit")}
          />
          {editing ? (
            <span className="sheet-edit-tools">
              <label className="sheet-show-hidden">
                <input
                  checked={showHidden}
                  type="checkbox"
                  onChange={(event) =>
                    setShowHidden(event.currentTarget.checked)
                  }
                />
                <span>Show hidden</span>
              </label>
              <button
                aria-label={
                  resetArmed
                    ? "Confirm resetting the sheet to defaults"
                    : "Reset sheet to defaults"
                }
                className="danger-action"
                data-armed={resetArmed || undefined}
                data-sheet-reset-trigger="sheet"
                disabled={!resettable}
                type="button"
                onClick={() => {
                  if (!resetArmed) {
                    resetAction.arm("sheet");
                    return;
                  }
                  resetAction.disarm();
                  resetPresentation();
                }}
              >
                {resetArmed ? "Confirm reset" : "Reset sheet to defaults"}
              </button>
            </span>
          ) : null}
          <span className="print-preview-toolbar-end">
            <button
              aria-label="Print or save as PDF"
              className="icon-only-button button-icon"
              title="Print or save as PDF"
              type="button"
              onClick={print}
            >
              <Icon name="print" />
            </button>
          </span>
          {saveError === undefined ? null : (
            <div className="error sheet-layout-save-error" role="alert">
              <span>Couldn't save the sheet layout: {saveError}</span>
              <button type="button" onClick={retrySave}>
                Try again
              </button>
            </div>
          )}
        </div>
      ) : null}
      <div className="screen-sheet-view">
        <header className="view-sheet-header">
          <div className="view-sheet-identity">
            {character.portrait === undefined ? null : (
              <PortraitImage
                className="view-sheet-portrait"
                name={characterName}
                portrait={character.portrait}
              />
            )}
            <div>
              <p className="eyebrow">Character view</p>
              <h1>{characterName}</h1>
              <p>{identitySummary}</p>
            </div>
          </div>
          <div className="view-sheet-actions">
            <a href="#/characters">Characters</a>
            <a
              className="button-link"
              href={`#/characters/${encodeURIComponent(characterId)}/edit`}
            >
              Build
            </a>
            <button type="button" onClick={() => setShowPrintPreview(true)}>
              Print / save PDF
            </button>
          </div>
        </header>

        {/* An exact evaluation is the expected case and needs no notice. */}
        {sourceNotice === undefined ? null : (
          <aside
            className="view-source-status cache-warning"
            aria-live="polite"
          >
            <span>{sourceNotice}</span>
            <a href={recoveryHref}>{recoveryLabel}</a>
          </aside>
        )}

        <nav aria-label="Character view sections" className="view-section-nav">
          <a href="#view-summary">Summary</a>
          <a href="#view-powers">Powers</a>
          <a href="#view-equipment">Equipment</a>
          {model.learnedReferences.length === 0 ? null : (
            <a href="#view-learned-references">Rituals &amp; practices</a>
          )}
          <a href="#view-features">Features</a>
          <a href="#view-notes">Notes</a>
        </nav>

        <section className="view-sheet-section" id="view-summary">
          <header>
            <p className="eyebrow">At a glance</p>
            <h2>Summary</h2>
          </header>
          <div className="view-summary-grid">
            <section>
              <h3>Defenses</h3>
              <ValueList values={model.defenses} className="large-values" />
            </section>
            <section>
              <h3>Abilities</h3>
              <ValueList values={model.abilities} />
            </section>
            <section>
              <h3>Resources</h3>
              <ValueList values={model.resources} />
            </section>
            <section>
              <h3>Senses</h3>
              <ValueList values={model.senses} />
            </section>
            <section className="view-summary-skills">
              <h3>Skills</h3>
              <ValueList values={model.skills} />
            </section>
            <section className="view-summary-identity">
              <h3>Character</h3>
              <ValueList values={model.identity} />
            </section>
          </div>
        </section>

        {model.powers.length === 0 ? null : (
          <section className="view-sheet-section" id="view-powers">
            <header>
              <p className="eyebrow">Complete reference</p>
              <h2>Powers</h2>
            </header>
            <div className="view-card-grid">
              {powerCards.map((card, index) => (
                <PowerCard
                  key={`${card.name}-${index}`}
                  card={card}
                  characterLevel={characterLevel}
                  layout="panel"
                  panel={{
                    textPresentation: cardTextPresentation(
                      abbreviateAbilityValues,
                    ),
                  }}
                />
              ))}
            </div>
          </section>
        )}

        <section className="view-sheet-section" id="view-equipment">
          <header>
            <p className="eyebrow">Owned and equipped</p>
            <h2>Equipment</h2>
          </header>
          {model.equipment.length === 0 ? (
            <p className="view-empty-state">No equipment is recorded.</p>
          ) : (
            <ul className="view-equipment-list">
              {model.equipment.map((item) => (
                <li key={`${item.label}-${item.value}`}>
                  <strong>{item.label}</strong>
                  <span>{item.value}</span>
                </li>
              ))}
            </ul>
          )}
          {screenItems.length === 0 ? null : (
            <div className="view-item-reference">
              <h3>Item reference</h3>
              <div className="view-card-grid">
                {screenItems.map((card, index) => (
                  <ItemCard
                    key={`${card.name}-${index}`}
                    card={card}
                    layout="panel"
                  />
                ))}
              </div>
            </div>
          )}
        </section>

        {model.learnedReferences.length === 0 ? null : (
          <section className="view-sheet-section" id="view-learned-references">
            <header>
              <p className="eyebrow">Learned references</p>
              <h2>Rituals &amp; practices</h2>
            </header>
            <div className="view-card-grid">
              {model.learnedReferences.map((reference, index) => (
                <ItemCard
                  key={`${reference.kind}-${reference.id ?? reference.name}-${index}`}
                  card={reference.card}
                  layout="panel"
                  panel={{
                    ...(reference.origin?.kind === "granted"
                      ? {
                          subheading: (
                            <p className="candidate-relationship">
                              {reference.origin.provider
                                ? `Granted by ${reference.origin.provider}`
                                : "Granted"}
                            </p>
                          ),
                        }
                      : {}),
                    textPresentation: cardTextPresentation(
                      abbreviateAbilityValues,
                    ),
                  }}
                />
              ))}
            </div>
          </section>
        )}

        <section className="view-sheet-section" id="view-features">
          <header>
            <p className="eyebrow">Build reference</p>
            <h2>Features</h2>
          </header>
          <div className="view-feature-grid">
            {model.features.map((group) => (
              <section key={group.group}>
                <h3>{group.group}</h3>
                <ValueList
                  values={group.entries.map((entry) => {
                    const choice = featureChoiceText(entry.choices);
                    if (group.group === "Feat" && choice !== undefined)
                      return {
                        ...entry,
                        value: [entry.value, `Choices: ${choice}`]
                          .filter(Boolean)
                          .join("\n\n"),
                      };
                    return choice === undefined
                      ? entry
                      : { ...entry, label: `${entry.label}: ${choice}` };
                  })}
                />
              </section>
            ))}
          </div>
        </section>

        <section className="view-sheet-section" id="view-notes">
          <header>
            <p className="eyebrow">Character Profile</p>
            <h2>Notes</h2>
          </header>
          {model.notes.length === 0 ? (
            <p className="view-empty-state">No notes are recorded.</p>
          ) : (
            <dl className="view-notes-list">
              {model.notes.map((note) => (
                <div key={`${note.label}-${note.value}`}>
                  <dt>{note.label}</dt>
                  <dd>{note.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </section>
      </div>

      <div className="sheet-preview-pages">
        <SheetOverview
          model={model}
          name={characterName}
          portrait={character.portrait}
          paper={paper}
          hiddenSections={resolvedLayout.hiddenSections}
          {...(editControls ? { sectionControl } : {})}
        >
          {(firstCardPage) =>
            printCardPages.map((page, pageIndex) => (
              <section
                className="print-card-page print-page print-only"
                key={`print-card-page-${pageIndex}`}
              >
                <div className="print-card-grid">
                  {page.map(({ card, key }) => (
                    <PrintCard
                      card={card}
                      model={model}
                      name={characterName}
                      portrait={character.portrait}
                      characterLevel={characterLevel}
                      key={key}
                    />
                  ))}
                  {/* Edit overlays sit in the cards' grid areas, out of flow,
                      so the cards and their fitting never change. */}
                  {editControls
                    ? page.map((entry, index) => (
                        <SheetEditTarget
                          className="sheet-card-edit print-excluded"
                          hidden={!entry.shown}
                          items={[
                            entry.shown
                              ? {
                                  label: "Hide card",
                                  onSelect: () => showCards([entry], false),
                                }
                              : {
                                  label: "Show card",
                                  onSelect: () => showCards([entry], true),
                                },
                          ]}
                          key={`edit-${entry.key}`}
                          menuLabel={`Card options for ${sheetCardLabel(entry)}`}
                          // An absolutely positioned grid item's auto end
                          // line is the container's edge, so span one track.
                          style={{
                            gridColumn: `${(index % 3) + 1} / span 1`,
                            gridRow: `${Math.floor(index / 3) + 1} / span 1`,
                          }}
                        />
                      ))
                    : null}
                </div>
                <footer className="print-card-page-footer">
                  <span>Power &amp; Item Cards</span>
                  <span
                    className="print-card-footer-identity"
                    title={[
                      characterName,
                      ...["Race", "Class", "Level"].map(
                        (label) =>
                          model.identity.find((value) => value.label === label)
                            ?.value,
                      ),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  >
                    {characterName} ·{" "}
                    {["Race", "Class", "Level"]
                      .map(
                        (label) =>
                          model.identity.find((value) => value.label === label)
                            ?.value,
                      )
                      .filter(Boolean)
                      .join(" ")}
                  </span>
                  <span className="ov-page-number">
                    {firstCardPage + pageIndex}
                  </span>
                </footer>
              </section>
            ))
          }
        </SheetOverview>
      </div>
    </main>
  );
}
