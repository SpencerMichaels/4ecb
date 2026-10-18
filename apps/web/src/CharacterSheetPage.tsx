import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import { CharacterRepository } from "@4ecb/browser-storage";
import type {
  CharacterPortrait,
  CharacterRecord,
  SheetSettings,
} from "@4ecb/character-domain";
import type { ContentPackManifest } from "@4ecb/content-pack";
import { appContentRuntime } from "./app-runtime";
import {
  projectBuildForEvaluation,
  type EvaluatedCharacter,
} from "@4ecb/rules-engine";
import {
  buildEvaluatedSheetModel,
  buildSheetModel,
  type CharacterSheetModel,
  type SheetCard,
  type SheetLearnedReference,
  type SheetValue,
} from "@4ecb/sheet-model";

import { contentProfileMatchesRevision } from "./profile-migration";
import { PortraitImage } from "./PortraitEditor";
import { inventoryCategory } from "./equipment-ui";
import { sortedPowerCards } from "./power-card-order";
import {
  PrintCharacterCard,
  PrintSkillsCard,
  type PlayCardKind,
} from "./PrintPlayCards";
import { ItemCard } from "./ItemCard";
import { PowerCard } from "./PowerCard";
import { cardTextPresentation } from "./BuilderCards";
import { preferredPrintCardTextSize } from "./print-card-fit";
import { Prose } from "./Prose";
import { SheetOverview } from "./SheetOverview";

const characters = new CharacterRepository();

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

type PrintableCard = SheetCard | { readonly kind: PlayCardKind };

const isPlayCard = (
  card: PrintableCard,
): card is { readonly kind: PlayCardKind } =>
  card.kind === "play-character" || card.kind === "play-skills";

function PrintCard({
  card,
  model,
  name,
  portrait,
  blankHP,
  characterLevel,
  showEquippedAttackBonus,
  showPrintTitleActionIcon,
}: {
  readonly card: PrintableCard;
  readonly model: CharacterSheetModel;
  readonly name: string;
  readonly portrait: CharacterPortrait | undefined;
  readonly blankHP: boolean;
  readonly characterLevel: number;
  readonly showEquippedAttackBonus: boolean;
  readonly showPrintTitleActionIcon: boolean;
}) {
  if (isPlayCard(card))
    return card.kind === "play-character" ? (
      <PrintCharacterCard
        model={model}
        name={name}
        portrait={portrait}
        blankHP={blankHP}
      />
    ) : (
      <PrintSkillsCard model={model} />
    );
  return card.kind === "power" ? (
    <PowerCard
      card={card}
      characterLevel={characterLevel}
      showEquippedAttackBonus={showEquippedAttackBonus}
      showPrintTitleActionIcon={showPrintTitleActionIcon}
    />
  ) : (
    <ItemCard card={card} showActionIcons={showPrintTitleActionIcon} />
  );
}

function chunks<Value>(values: readonly Value[], size: number): Value[][] {
  const result: Value[][] = [];
  for (let index = 0; index < values.length; index += size)
    result.push(values.slice(index, index + size));
  return result;
}

const learnedReferenceLabels: Readonly<
  Record<SheetLearnedReference["kind"], string>
> = {
  ritual: "Ritual",
  "alchemical-formula": "Alchemical formula",
  "martial-practice": "Martial practice",
};

function LearnedReference({
  reference,
}: {
  readonly reference: SheetLearnedReference;
}) {
  return (
    <article className="learned-reference-card">
      <header>
        <div>
          <p className="eyebrow">{learnedReferenceLabels[reference.kind]}</p>
          <h3>{reference.name}</h3>
        </div>
        {reference.quantity > 1 ? <span>×{reference.quantity}</span> : null}
      </header>
      {reference.flavor === undefined ? null : (
        <div className="learned-reference-flavor">
          <Prose value={reference.flavor} />
        </div>
      )}
      {reference.prerequisites === undefined ? null : (
        <dl className="sheet-card-rules">
          <div>
            <dt>Prerequisite</dt>
            <dd>
              <Prose value={reference.prerequisites} />
            </dd>
          </div>
        </dl>
      )}
      {reference.fields.length === 0 ? null : (
        <dl className="sheet-card-rules">
          {reference.fields.map((field, index) => (
            <div key={`${field.label}-${field.value}-${index}`}>
              <dt>{field.label}</dt>
              <dd>
                <Prose value={field.value} />
              </dd>
            </div>
          ))}
        </dl>
      )}
      {reference.description === undefined ? null : (
        <Prose value={reference.description} />
      )}
      {reference.source === undefined ? null : (
        <footer>{reference.source}</footer>
      )}
    </article>
  );
}

export function CharacterSheetPage({
  characterId,
  manifests,
  printOnReady = false,
  openPrintPreview = false,
  resolveAbilityChoices = true,
  abbreviateAbilityValues = true,
  showEquippedAttackBonus = true,
  showPrintTitleActionIcon = true,
  printCardTextSize = 8,
  countCoinWeight = true,
}: {
  readonly characterId: string;
  readonly manifests: readonly ContentPackManifest[];
  readonly printOnReady?: boolean;
  readonly openPrintPreview?: boolean;
  readonly resolveAbilityChoices?: boolean;
  readonly abbreviateAbilityValues?: boolean;
  readonly showEquippedAttackBonus?: boolean;
  readonly showPrintTitleActionIcon?: boolean;
  readonly printCardTextSize?: number;
  readonly countCoinWeight?: boolean;
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
  const printRequested = useRef(false);
  useEffect(() => {
    setError(undefined);
    setCharacter(undefined);
    setContent(undefined);
    setEvaluation(undefined);
    setEvaluationError(undefined);
    setContentLoaded(false);
    void (async () => {
      try {
        const loaded = await characters.get(characterId);
        setCharacter(loaded);
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
      .then((client) =>
        client.evaluate({
          ...projectBuildForEvaluation(character.build, content.entities),
          // Sheets consume calculated powers, but never selectable choice
          // catalogs. Keep powers at their compatibility-default `true`.
          candidateDetailLevels: [],
        }),
      )
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
    countCoinWeight,
  ]);
  const evaluatedSheetReady =
    !exactProfile || evaluation !== undefined || evaluationError !== undefined;
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
      finalFrame = window.requestAnimationFrame(() => window.print());
    });
    return () => {
      window.cancelAnimationFrame(initialFrame);
      if (finalFrame !== undefined) window.cancelAnimationFrame(finalFrame);
    };
  }, [contentLoaded, error, evaluatedSheetReady, model, printOnReady]);
  const printPaper = character?.sheetSettings.paper;
  useEffect(() => {
    if (printPaper === undefined) return;
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
  if (character === undefined || model === undefined)
    return (
      <main className="sheet-page loading-state" id="main-content">
        Loading character…
      </main>
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
  async function setting<Key extends keyof SheetSettings>(
    name: Key,
    value: SheetSettings[Key],
  ): Promise<void> {
    const updated = await characters.updateMetadata(characterId, {
      sheetSettings: { [name]: value },
    });
    setCharacter(updated);
  }
  const characterName =
    character.snapshot.details.name || character.title || "Unnamed character";
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
    model.source === "authoritative-evaluation" && evaluation !== undefined ? (
      <>
        <strong>Authoritative rules evaluation.</strong> Values, selections,
        inventory, and power variants were regenerated from the exact bound
        profile. The character is{" "}
        {evaluation.complete ? "complete" : "incomplete"}
        {" and "}
        {evaluation.legal ? "rules legal" : "has legality findings"}.
      </>
    ) : model.source === "native-empty" ? (
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
  // Like the legacy builder, the special Action Point and Second Wind cards
  // follow the play-data cards.
  const specialCardRank = (card: SheetCard) =>
    ["action point", "second wind"].indexOf(card.name.trim().toLowerCase());
  const specialCards = powerCards
    .filter((card) => card.universal && specialCardRank(card) >= 0)
    .sort((a, b) => specialCardRank(a) - specialCardRank(b));
  const printableCards: PrintableCard[] = [
    ...(character.sheetSettings.includePowerCards
      ? [
          { kind: "play-character" as const },
          { kind: "play-skills" as const },
          ...specialCards,
          ...powerCards.filter((card) => !specialCards.includes(card)),
        ]
      : []),
    ...(character.sheetSettings.includeItemCards ? model.items : []),
  ];
  const printCardPages = chunks(printableCards, 9);
  const characterLevel =
    Number(
      model.identity.find((entry) => entry.label === "Level")?.value ??
        character.snapshot.levelCount,
    ) || 1;
  return (
    <main
      className={`sheet-page paper-${character.sheetSettings.paper} ${character.sheetSettings.monochrome ? "sheet-monochrome" : ""} ${showPrintPreview ? "is-print-preview" : ""}`}
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
        <div className="print-preview-toolbar">
          {openPrintPreview ? (
            <button
              type="button"
              onClick={() => {
                if (window.history.length > 1) window.history.back();
                else
                  window.location.hash = `#/characters/${encodeURIComponent(characterId)}/edit`;
              }}
            >
              ← Back
            </button>
          ) : (
            <button type="button" onClick={() => setShowPrintPreview(false)}>
              ← Back to character view
            </button>
          )}
          <div>
            <strong>Print preview</strong>
            <span>
              {character.sheetSettings.paper === "a4" ? "A4" : "US Letter"}
              {character.sheetSettings.monochrome
                ? " · Monochrome"
                : " · Color"}
            </span>
          </div>
          <button type="button" onClick={() => window.print()}>
            Print / save PDF
          </button>
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

        <details className="view-print-options">
          <summary>Print options</summary>
          <fieldset>
            <legend>Printed sheet</legend>
            <label>
              Paper{" "}
              <select
                value={character.sheetSettings.paper}
                onChange={(event) =>
                  void setting(
                    "paper",
                    event.currentTarget.value as "letter" | "a4",
                  )
                }
              >
                <option value="letter">US Letter</option>
                <option value="a4">A4</option>
              </select>
            </label>
            <label>
              <input
                type="checkbox"
                checked={character.sheetSettings.blankHitPoints}
                onChange={(event) =>
                  void setting("blankHitPoints", event.currentTarget.checked)
                }
              />{" "}
              Blank hit points
            </label>
            <label>
              <input
                type="checkbox"
                checked={character.sheetSettings.includePowerCards}
                onChange={(event) =>
                  void setting("includePowerCards", event.currentTarget.checked)
                }
              />{" "}
              Power cards
            </label>
            <label>
              <input
                type="checkbox"
                checked={character.sheetSettings.includeItemCards}
                onChange={(event) =>
                  void setting("includeItemCards", event.currentTarget.checked)
                }
              />{" "}
              Item cards
            </label>
            <label>
              <input
                type="checkbox"
                checked={character.sheetSettings.monochrome}
                onChange={(event) =>
                  void setting("monochrome", event.currentTarget.checked)
                }
              />{" "}
              Monochrome
            </label>
          </fieldset>
        </details>

        <aside
          className={
            model.source === "authoritative-evaluation"
              ? "view-source-status status"
              : "view-source-status cache-warning"
          }
          aria-live="polite"
        >
          <span>{sourceNotice}</span>
          {model.source === "authoritative-evaluation" ? null : (
            <a href={recoveryHref}>{recoveryLabel}</a>
          )}
        </aside>

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
                  showEquippedAttackBonus={showEquippedAttackBonus}
                  showPrintTitleActionIcon
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
          {model.items.length === 0 ? null : (
            <div className="view-item-reference">
              <h3>Item reference</h3>
              <div className="view-card-grid">
                {model.items.map((card, index) => (
                  <ItemCard
                    key={`${card.name}-${index}`}
                    card={card}
                    showActionIcons
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
            <div className="view-reference-grid">
              {model.learnedReferences.map((reference, index) => (
                <LearnedReference
                  key={`${reference.kind}-${reference.id ?? reference.name}-${index}`}
                  reference={reference}
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
                <ValueList values={group.entries} />
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

      <SheetOverview
        model={model}
        name={characterName}
        portrait={character.portrait}
        paper={character.sheetSettings.paper}
        monochrome={character.sheetSettings.monochrome}
        blankHP={character.sheetSettings.blankHitPoints}
      >
        {(firstCardPage) =>
          printCardPages.map((page, pageIndex) => (
            <section
              className="print-card-page print-page print-only"
              key={`print-card-page-${pageIndex}`}
            >
              <div className="print-card-grid">
                {page.map((card, index) => (
                  <PrintCard
                    card={card}
                    model={model}
                    name={characterName}
                    portrait={character.portrait}
                    blankHP={character.sheetSettings.blankHitPoints}
                    characterLevel={characterLevel}
                    showEquippedAttackBonus={showEquippedAttackBonus}
                    showPrintTitleActionIcon={showPrintTitleActionIcon}
                    key={`${card.kind}-${isPlayCard(card) ? "" : (card.id ?? card.name)}-${index}`}
                  />
                ))}
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
    </main>
  );
}
