import {
  SHEET_REFERENCE_GROUP_IDS,
  type SheetReferenceGroupId,
  type SheetSectionId,
} from "@4ecb/character-domain";
import {
  isSheetPlayCard,
  SHEET_DECK_GROUPS,
  type ResolvedSheetLayout,
  type SheetDeckGroup,
  type SheetLayoutCard,
} from "@4ecb/sheet-model";

import { Icon } from "./Icon";
import { useArmedAction } from "./useArmedAction";

const REFERENCE_GROUP_LABELS: Readonly<Record<SheetReferenceGroupId, string>> =
  {
    features: "Feature reference",
    items: "Item reference",
    "power-index": "Power index",
    rituals: "Rituals & practices",
    profile: "Character profile",
  };

const DECK_GROUP_LABELS: Readonly<Record<SheetDeckGroup, string>> = {
  play: "Play cards",
  companions: "Companions",
  powers: "Powers",
  items: "Items",
};

const DECK_GROUP_EMPTY: Readonly<Record<SheetDeckGroup, string>> = {
  play: "No play cards.",
  companions: "No companion cards.",
  powers: "No power cards.",
  items: "No item cards.",
};

/** The editor's name for a deck card. */
export function sheetCardLabel(entry: SheetLayoutCard): string {
  const { card } = entry;
  if (isSheetPlayCard(card))
    return card.kind === "play-character" ? "Play data" : "Skills";
  return card.name;
}

export interface SheetContentsSections {
  /** Optional sections in print order, with whether they have content. */
  readonly sections: readonly {
    readonly id: SheetSectionId;
    readonly label: string;
    readonly empty: boolean;
  }[];
}

/** The optional sections in print order, labelled for the editor. */
export function sheetContentsSections(
  referenceEntryCounts: readonly number[],
): SheetContentsSections["sections"] {
  return [
    { id: "scratchpad", label: "Play scratchpad", empty: false },
    ...SHEET_REFERENCE_GROUP_IDS.map((group, index) => ({
      id: `reference:${group}` as const,
      label: REFERENCE_GROUP_LABELS[group],
      empty: (referenceEntryCounts[index] ?? 0) === 0,
    })),
    { id: "session-notes", label: "Session notes", empty: false },
  ];
}

/**
 * Edit mode's "Sheet contents" panel (D099): which sections and cards the
 * printed sheet includes. Hidden things stay listed, unchecked; every
 * control is present whatever the character has.
 */
export function SheetContentsPanel({
  layout,
  sections,
  open,
  resettable,
  onClose,
  onSectionShown,
  onCardsShown,
  onReset,
}: {
  readonly layout: ResolvedSheetLayout;
  readonly sections: SheetContentsSections["sections"];
  /** Whether the narrow-screen drawer is open (wide screens always show it). */
  readonly open: boolean;
  /** Whether anything differs from the default sheet. */
  readonly resettable: boolean;
  readonly onClose: () => void;
  readonly onSectionShown: (section: SheetSectionId, shown: boolean) => void;
  readonly onCardsShown: (
    cards: readonly SheetLayoutCard[],
    shown: boolean,
  ) => void;
  readonly onReset: () => void;
}) {
  const resetAction = useArmedAction("sheet-reset-trigger");
  const resetArmed = resetAction.isArmed("sheet");
  return (
    <aside
      aria-label="Sheet contents"
      className="sheet-contents-panel"
      data-open={open || undefined}
      id="sheet-contents-panel"
    >
      <header className="sheet-contents-header">
        <h2>Sheet contents</h2>
        <button
          aria-label="Close sheet contents"
          className="icon-only-button button-icon sheet-contents-close"
          title="Close sheet contents"
          type="button"
          onClick={onClose}
        >
          <Icon name="remove" />
        </button>
      </header>
      <fieldset className="sheet-contents-group">
        <legend>Pages</legend>
        <ul className="sheet-contents-list">
          <li>
            <label>
              <input checked disabled type="checkbox" />
              <span>Page 1 summary</span>
            </label>
            <span className="sheet-contents-hint">Always printed</span>
          </li>
          {sections.map(({ id, label, empty }) => (
            <li key={id}>
              <label>
                <input
                  checked={!layout.hiddenSections.has(id)}
                  type="checkbox"
                  onChange={(event) =>
                    onSectionShown(id, event.currentTarget.checked)
                  }
                />
                <span>{label}</span>
              </label>
              {empty ? (
                <span className="sheet-contents-hint">Nothing to print</span>
              ) : null}
            </li>
          ))}
        </ul>
      </fieldset>
      {SHEET_DECK_GROUPS.map((group) => {
        const cards = layout.cards.filter((card) => card.group === group);
        const label = DECK_GROUP_LABELS[group];
        return (
          <fieldset className="sheet-contents-group" key={group}>
            <legend>{label}</legend>
            <div className="sheet-contents-bulk">
              <button
                aria-label={`Show all ${label.toLocaleLowerCase()}`}
                disabled={cards.every((card) => card.shown)}
                type="button"
                onClick={() =>
                  onCardsShown(
                    cards.filter((card) => !card.shown),
                    true,
                  )
                }
              >
                Show all
              </button>
              <button
                aria-label={`Hide all ${label.toLocaleLowerCase()}`}
                disabled={cards.every((card) => !card.shown)}
                type="button"
                onClick={() =>
                  onCardsShown(
                    cards.filter((card) => card.shown),
                    false,
                  )
                }
              >
                Hide all
              </button>
            </div>
            {cards.length === 0 ? (
              <p className="sheet-contents-empty">{DECK_GROUP_EMPTY[group]}</p>
            ) : (
              <ul className="sheet-contents-list">
                {cards.map((card) => (
                  <li key={card.key}>
                    <label>
                      <input
                        checked={card.shown}
                        type="checkbox"
                        onChange={(event) =>
                          onCardsShown([card], event.currentTarget.checked)
                        }
                      />
                      <span>{sheetCardLabel(card)}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </fieldset>
        );
      })}
      <div className="sheet-contents-reset">
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
            onReset();
          }}
        >
          {resetArmed ? "Confirm reset" : "Reset sheet to defaults"}
        </button>
      </div>
    </aside>
  );
}
