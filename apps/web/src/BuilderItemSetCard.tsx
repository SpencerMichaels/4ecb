import { useContext, useEffect, useId, useState } from "react";

import type { ContentEntity } from "@4ecb/content-domain";

import { BuilderCardContext, cardTextPresentation } from "./BuilderCards";
import { entityCardSource } from "./EntityCard";
import { ItemSetCard } from "./ItemSetCard";
import { ShowEntitySourceContext } from "./ShowEntitySourceContext";

/**
 * The party's pieces of a group set, as typed: empty clears the count (unset),
 * a non-negative whole number sets it; anything else is rejected.
 */
export function parsePartyPieces(
  draft: string,
): { readonly pieces: number | undefined } | undefined {
  const value = draft.trim();
  if (value === "") return { pieces: undefined };
  return /^\d+$/u.test(value)
    ? { pieces: Number.parseInt(value, 10) }
    : undefined;
}

/** The "Party pieces" field of a group set's builder card. */
export function PartyPiecesField({
  value,
  onChange,
}: {
  readonly value: number | undefined;
  readonly onChange: (pieces: number | undefined) => void;
}) {
  const saved = value === undefined ? "" : String(value);
  const [draft, setDraft] = useState(saved);
  const [invalid, setInvalid] = useState(false);
  useEffect(() => {
    setDraft(saved);
    setInvalid(false);
  }, [saved]);
  const hintId = useId();
  const commit = (input: HTMLInputElement) => {
    const parsed = input.validity.badInput
      ? undefined
      : parsePartyPieces(input.value);
    if (parsed === undefined) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    if (parsed.pieces !== value) onChange(parsed.pieces);
    else setDraft(saved);
  };
  return (
    <div className="item-set-party-pieces">
      <label>
        <span>Party pieces</span>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          value={draft}
          aria-describedby={hintId}
          aria-invalid={invalid}
          onChange={(event) => setDraft(event.currentTarget.value)}
          onBlur={(event) => commit(event.currentTarget)}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") {
              setDraft(saved);
              setInvalid(false);
            }
          }}
        />
      </label>
      <p className="item-set-party-pieces-hint" id={hintId}>
        {invalid
          ? "Enter a whole number of pieces, 0 or more, or leave it empty."
          : "Pieces of this set you and your allies wield, yours included. Leave empty if unknown."}
      </p>
    </div>
  );
}

/**
 * The item set card for an inspected set piece (Equipment and Shop detail
 * panes), with the character's evaluated piece count; nothing for an item
 * outside any set. A group set's card carries the "Party pieces" field.
 */
export function BuilderItemSetCard({
  pieces,
  byId,
  onSetPartyPieces,
}: {
  /** The inspected item's components; the first set piece decides. */
  readonly pieces: readonly ContentEntity[];
  readonly byId: ReadonlyMap<string, ContentEntity>;
  /** Sets (or, with undefined, clears) a group set's party count. */
  readonly onSetPartyPieces?: (
    setId: string,
    pieces: number | undefined,
  ) => void;
}) {
  const settings = useContext(BuilderCardContext);
  const showSource = useContext(ShowEntitySourceContext);
  const card = pieces
    .map((piece) => settings.itemSetCardFor?.(piece))
    .find((candidate) => candidate !== undefined);
  if (card === undefined) return null;
  const set = byId.get(card.id.toLocaleLowerCase());
  return (
    <div className="candidate-card-panel">
      <ItemSetCard
        card={card}
        layout="panel"
        panel={{
          headingId: `item-set-${card.id.replaceAll(/[^a-zA-Z0-9_-]/g, "-")}`,
          subheading: (
            <>
              <p className="candidate-relationship">Item set</p>
              {card.group && onSetPartyPieces !== undefined ? (
                <PartyPiecesField
                  value={card.partyPieces}
                  onChange={(next) => onSetPartyPieces(card.id, next)}
                />
              ) : null}
            </>
          ),
          ...(showSource && set !== undefined
            ? { source: `Source: ${entityCardSource(set)}` }
            : {}),
          textPresentation: cardTextPresentation(
            settings.abbreviateAbilityValues,
          ),
        }}
      />
    </div>
  );
}
