/**
 * The app surfaces the visual-review verifier reads, rendered statically
 * for a review character: the printed overview and reference pages, the
 * printed card deck, the on-screen feature list, and builder detail panes.
 */
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { ContentEntity } from "@4ecb/content-domain";
import type {
  CandidateDecision,
  EvaluatedCharacter,
  EvaluatedChoice,
} from "@4ecb/rules-engine";
import {
  creatureCardTitle,
  featureChoiceText,
  isSheetPlayCard,
  sheetCardDeck,
  type CharacterSheetModel,
  type SheetDeckCard,
} from "@4ecb/sheet-model";
import { characterDisplayName } from "@4ecb/character-domain";

import { AssociateCard } from "../src/AssociateCard";
import { BeastCompanionCard } from "../src/BeastCompanionCard";
import { CreatureCard } from "../src/CreatureCard";
import {
  BuilderCardContext,
  type BuilderCardSettings,
} from "../src/BuilderCards";
import { choicesAtLevel } from "../src/builder-ui";
import { CandidateDetail } from "../src/CandidateDetail";
import {
  ItemDetail,
  type InspectedItemDetail,
} from "../src/EquipmentWorkspace";
import { FamiliarCard } from "../src/FamiliarCard";
import { ItemCard } from "../src/ItemCard";
import { ItemSetCard } from "../src/ItemSetCard";
import { PowerCard } from "../src/PowerCard";
import { PrintCharacterCard, PrintSkillsCard } from "../src/PrintPlayCards";
import {
  references,
  SheetOverview,
  type ReferenceEntry,
} from "../src/SheetOverview";

import { textOf } from "./visual-review-assert";
import type { ReviewCharacter } from "./visual-review-context";

const render = (element: ReactElement) => renderToStaticMarkup(element);

export function characterName(c: ReviewCharacter): string {
  return characterDisplayName(c.record) || "Unnamed character";
}

/** CharacterSheetPage's card level. */
export function sheetLevel(model: CharacterSheetModel, fallback: number) {
  return (
    Number(
      model.identity.find((entry) => entry.label === "Level")?.value ??
        fallback,
    ) || 1
  );
}

export interface PrintedPages {
  readonly html: string;
  readonly text: string;
  readonly references: readonly ReferenceEntry[];
}

const printedPages = new WeakMap<CharacterSheetModel, PrintedPages>();

/** Page 1, continuations, reference pages (SheetOverview, as printed). */
export function printedPagesFor(
  c: ReviewCharacter,
  model: CharacterSheetModel = c.sheet,
): PrintedPages {
  let result = printedPages.get(model);
  if (result === undefined) {
    const html = render(
      createElement(SheetOverview, {
        model,
        name: characterName(c),
        portrait: undefined,
        paper: "letter",
      }),
    );
    result = { html, text: textOf(html), references: references(model) };
    printedPages.set(model, result);
  }
  return result;
}

export interface PrintedCard {
  readonly card: SheetDeckCard;
  /** "Play data", "Skills", or the card's name. */
  readonly label: string;
  readonly kind: string;
  readonly html: string;
  readonly text: string;
}

const decks = new WeakMap<CharacterSheetModel, readonly PrintedCard[]>();

/** CharacterSheetPage's PrintCard for one printable card. */
function printCardElement(
  card: SheetDeckCard,
  model: CharacterSheetModel,
  name: string,
  level: number,
): ReactElement {
  if (isSheetPlayCard(card))
    return card.kind === "play-character"
      ? createElement(PrintCharacterCard, { model, name, portrait: undefined })
      : createElement(PrintSkillsCard, { model });
  if (card.kind === "beast") return createElement(BeastCompanionCard, { card });
  if (card.kind === "familiar") return createElement(FamiliarCard, { card });
  if (card.kind === "associate") return createElement(AssociateCard, { card });
  if (card.kind === "creature") return createElement(CreatureCard, { card });
  if (card.kind === "item-set") return createElement(ItemSetCard, { card });
  return card.kind === "power"
    ? createElement(PowerCard, { card, characterLevel: level })
    : createElement(ItemCard, { card });
}

/** The printed card deck in order, each card rendered: the default deck,
 *  or `entries` (a resolved layout's deck, such as one with a split
 *  creature). */
export function printedDeck(
  c: ReviewCharacter,
  model: CharacterSheetModel = c.sheet,
  entries?: readonly { readonly card: SheetDeckCard }[],
): readonly PrintedCard[] {
  let result = entries === undefined ? decks.get(model) : undefined;
  if (result === undefined) {
    const level = sheetLevel(model, c.build.effectiveLevel);
    const name = characterName(c);
    result = (
      entries ?? sheetCardDeck(model).filter(({ defaultShown }) => defaultShown)
    ).map(({ card }) => {
      const html = render(printCardElement(card, model, name, level));
      return {
        card,
        label: isSheetPlayCard(card)
          ? card.kind === "play-character"
            ? "Play data"
            : "Skills"
          : card.kind === "creature"
            ? creatureCardTitle(card)
            : card.name,
        kind: card.kind,
        html,
        text: textOf(html),
      };
    });
    if (entries === undefined) decks.set(model, result);
  }
  return result;
}

export function printedCard(
  c: ReviewCharacter,
  name: string,
  model: CharacterSheetModel = c.sheet,
): PrintedCard {
  const found = printedDeck(c, model).find(
    (card) => card.label.toLocaleLowerCase() === name.toLocaleLowerCase(),
  );
  if (found === undefined)
    throw new Error(`${c.slug}: no printed card named ${name}`);
  return found;
}

/** The on-screen sheet's feature list rows (CharacterSheetPage). */
export function onScreenFeatureLabels(
  model: CharacterSheetModel,
): readonly string[] {
  return model.features.flatMap((group) =>
    group.entries.map((entry) => {
      const choice = featureChoiceText(entry.choices);
      return choice === undefined || group.group === "Feat"
        ? entry.label
        : `${entry.label}: ${choice}`;
    }),
  );
}

/** A builder detail pane (CandidateDetail) with this character's cards. */
export function candidateDetailHtml(
  c: ReviewCharacter,
  entity: ContentEntity,
  candidate: CandidateDecision | undefined = {
    definitionId: entity.id,
    eligible: true,
    rulesLegal: true,
    reasons: [],
  } as unknown as CandidateDecision,
  cards: BuilderCardSettings = c.cards(),
): string {
  return render(
    createElement(
      BuilderCardContext.Provider,
      { value: cards },
      createElement(CandidateDetail, {
        candidate,
        entity,
        byId: c.context.byId,
      }),
    ),
  );
}

/** The Equipment / Shop item detail pane (ItemDetail). */
export function itemDetailHtml(
  c: ReviewCharacter,
  item: InspectedItemDetail,
  options: {
    readonly note?: string;
    readonly partyPieces?: boolean;
    readonly cards?: BuilderCardSettings;
  } = {},
): string {
  return render(
    createElement(
      BuilderCardContext.Provider,
      { value: options.cards ?? c.cards() },
      createElement(ItemDetail, {
        item,
        byId: c.context.byId,
        ...(options.note === undefined ? {} : { note: options.note }),
        ...(options.partyPieces === true
          ? { onSetItemSetPartyPieces: () => undefined }
          : {}),
      }),
    ),
  );
}

/** The Build tab's choices at a level (with candidate details). */
export function choicesAt(
  c: ReviewCharacter,
  level: number,
  evaluation: EvaluatedCharacter = c.atLevels([level]),
): readonly EvaluatedChoice[] {
  return choicesAtLevel(level, evaluation);
}

export function selectedDefinition(
  c: ReviewCharacter,
  choice: EvaluatedChoice,
  evaluation: EvaluatedCharacter,
): ContentEntity | undefined {
  const occurrence = evaluation.occurrences.find(
    ({ id }) => id === choice.selectedOccurrenceId,
  );
  return occurrence === undefined
    ? undefined
    : c.context.byId.get(occurrence.definitionId.toLocaleLowerCase());
}

export const entityName = (
  c: ReviewCharacter,
  id: string | undefined,
): string =>
  id === undefined
    ? "(none)"
    : (c.context.byId.get(id.toLocaleLowerCase())?.name ?? id);
