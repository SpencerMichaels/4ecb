import { useContext } from "react";

import type { ContentEntity } from "@4ecb/content-domain";

import { BuilderCardContext, cardTextPresentation } from "./BuilderCards";
import { entityCardSource } from "./EntityCard";
import { ItemSetCard } from "./ItemSetCard";
import { ShowEntitySourceContext } from "./ShowEntitySourceContext";

/**
 * The item set card for an inspected set piece (Equipment and Shop detail
 * panes), with the character's evaluated piece count; nothing for an item
 * outside any set.
 */
export function BuilderItemSetCard({
  pieces,
  byId,
}: {
  /** The inspected item's components; the first set piece decides. */
  readonly pieces: readonly ContentEntity[];
  readonly byId: ReadonlyMap<string, ContentEntity>;
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
          subheading: <p className="candidate-relationship">Item set</p>,
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
