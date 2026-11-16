import { itemRulesTextTitle, type SheetCard } from "@4ecb/sheet-model";

import { ActionTypeIcon } from "./ActionTypeIcon";
import { CardSubheader } from "./CardSubheader";
import { DotList } from "./DotList";
import { Icon } from "./Icon";
import { Prose } from "./Prose";
import {
  CardPanelSubheading,
  CardText,
  type CardLayout,
  type CardPanelProps,
} from "./PowerCard";
import {
  nameWithBoundEnhancement,
  printItemPresentation,
  printItemPower,
  printItemPowerClauses,
} from "./print-item-presentation";
import { usePrintCardFit } from "./use-print-card-fit";

/** The one item card format, shared by the printed sheet and builder panes. */
export function ItemCard({
  card,
  layout = "print",
  panel = {},
  onFit,
}: {
  readonly card: SheetCard;
  readonly layout?: CardLayout;
  readonly panel?: CardPanelProps;
  /** A measuring copy's report: whether the card fits at the minimum
   *  text size. */
  readonly onFit?: (fits: boolean) => void;
}) {
  const cardRef = usePrintCardFit(layout === "print", onFit);
  const isPanel = layout === "panel";
  const textPresentation = panel.textPresentation;
  const item = printItemPresentation(card);
  // Beside its creature's card (a mount, D110) the description is the
  // creature's: its card shows it (in print, its tables only).
  const description =
    card.descriptionOnCreatureCard === true ? undefined : item.description;
  // After the rules (owner, 2026-11-16): a builder pane shows any
  // description the body leaves out, whole; a printed card only its
  // mechanics (an artifact's concordance and states, a cursed item's curse
  // rules), which a split card's rules half leaves to its second card.
  const trailingDescription =
    card.descriptionOnCreatureCard === true || card.part === "rules"
      ? undefined
      : isPanel
        ? description === undefined &&
          card.description?.trim() &&
          card.description !== card.flavor
          ? card.description
          : undefined
        : item.trailingDescription;
  const hasSubheader =
    item.statRows.length > 0 || item.weaponProperties.length > 0;
  if (card.part === "rules-text")
    return (
      <ItemRulesTextCard
        card={card}
        cardRef={cardRef}
        icon={item.icon}
        kind={item.kind}
        name={nameWithBoundEnhancement(item.name)}
        textPresentation={textPresentation}
      />
    );
  return (
    <article
      ref={cardRef}
      {...(isPanel
        ? {
            tabIndex: 0,
            ...(panel.headingId === undefined
              ? {}
              : { "aria-labelledby": panel.headingId }),
          }
        : {})}
      className={`print-reference-card print-item-card${isPanel ? " is-panel" : ""}${hasSubheader ? "" : " no-subheader"}`}
    >
      <header>
        <h3>
          <Icon name={item.icon} />
          <span
            {...(panel.headingId === undefined ? {} : { id: panel.headingId })}
          >
            {nameWithBoundEnhancement(item.name)}
          </span>
        </h3>
        {panel.headerAction}
      </header>
      {/* Like published power blocks: italic flavor right under the name. */}
      {panel.flavor === undefined ? null : (
        <p className="print-card-flavor">{panel.flavor}</p>
      )}
      <CardPanelSubheading subheading={panel.subheading} />
      {!hasSubheader ? null : (
        <CardSubheader
          rows={item.statRows}
          undivided={item.isRitual}
          labelFor={({ label }, row) =>
            label === "Proficiency" &&
            row.some((stat) => stat.label === "Range")
              ? "Prof"
              : label === "Critical"
                ? "Crit"
                : label
          }
          extra={
            item.weaponProperties.length > 0 ? (
              <div className="print-item-stat-row print-item-properties">
                <div>
                  <dt>Properties</dt>
                  <dd>
                    <Prose
                      value={item.weaponProperties
                        .map((field) => field.value)
                        .join(", ")}
                    />
                  </dd>
                </div>
              </div>
            ) : null
          }
        />
      )}
      <div className="print-card-body print-item-body">
        {item.leadFields.map((field) => (
          <section className="print-item-rule" key={field.label}>
            <div className="print-item-rule-text">
              <strong>{`${field.label}: `}</strong>
              <CardText
                value={field.value}
                textPresentation={textPresentation}
              />
            </div>
          </section>
        ))}
        {description ? (
          <CardText value={description} textPresentation={textPresentation} />
        ) : null}
        {item.rules.map((field, index) => {
          const power = printItemPower(field);
          return (
            <section
              className={
                power
                  ? `print-item-power${power.usage ? ` usage-${power.usage.toLocaleLowerCase()}` : ""}`
                  : "print-item-rule"
              }
              key={`${field.label}-${index}`}
            >
              {power ? (
                <div
                  className={`print-item-power-heading${power.usage ? ` usage-${power.usage.toLocaleLowerCase()}` : ""}${power.actionType ? " has-action-icon" : ""}`}
                >
                  {power.actionType ? (
                    <>
                      <ActionTypeIcon decorative value={power.actionType} />
                      <div className="print-item-power-content">
                        <div className="print-item-power-action">
                          <span>{power.actionType}</span>
                          <span className="print-item-power-usage">
                            • {power.usage}
                          </span>
                        </div>
                        {power.keywords ? (
                          <span className="print-item-power-keywords">
                            {power.keywords}
                          </span>
                        ) : null}
                      </div>
                    </>
                  ) : (
                    <span className="print-item-power-unparsed">
                      {power.title}
                    </span>
                  )}
                </div>
              ) : null}
              <div className="print-item-rule-text">
                <strong>{power ? null : `${field.label}: `}</strong>
                {power ? (
                  printItemPowerClauses(power.text).map(
                    (clause, clauseIndex) => (
                      <div
                        className={`print-item-power-clause${/^augment\b/i.test(clause.label) ? " is-augment" : ""}`}
                        key={clauseIndex}
                      >
                        {clause.label ? (
                          <strong>{clause.label}: </strong>
                        ) : null}
                        <CardText
                          value={clause.value}
                          textPresentation={textPresentation}
                        />
                      </div>
                    ),
                  )
                ) : (
                  <CardText
                    value={field.value}
                    textPresentation={textPresentation}
                  />
                )}
              </div>
            </section>
          );
        })}
        {trailingDescription === undefined ? null : (
          <CardText
            value={trailingDescription}
            textPresentation={textPresentation}
          />
        )}
      </div>
      <footer className="print-item-footer">
        <span>
          <DotList items={item.metadata} />
        </span>
        <span className="print-item-footer-details">
          <DotList items={item.footerDetails} />
        </span>
        {panel.source === undefined ? null : (
          <span className="print-card-source">{panel.source}</span>
        )}
      </footer>
      {panel.afterBody}
      <div className="print-card-type">
        <span>{item.kind}</span>
        <span>{item.level ? `Level ${item.level}` : ""}</span>
      </div>
    </article>
  );
}

/**
 * The second card of an item printed in two (`part: "rules-text"`): its
 * description's mechanics alone (an artifact's concordance and states, a
 * curse), titled "<name> — Concordance" or "— Curse"
 * (`itemRulesTextTitle`), in the item card's frame.
 */
function ItemRulesTextCard({
  card,
  cardRef,
  icon,
  kind,
  name,
  textPresentation,
}: {
  readonly card: SheetCard;
  readonly cardRef: ReturnType<typeof usePrintCardFit>;
  readonly icon: Parameters<typeof Icon>[0]["name"];
  readonly kind: string;
  readonly name: string;
  readonly textPresentation?: CardPanelProps["textPresentation"];
}) {
  return (
    <article
      ref={cardRef}
      className="print-reference-card print-item-card no-subheader"
      data-item-part="rules-text"
    >
      <header>
        <h3>
          <Icon name={icon} />
          <span>{itemRulesTextTitle(card, name)}</span>
        </h3>
      </header>
      <div className="print-card-body print-item-body">
        {card.rulesText === undefined ? null : (
          <CardText
            value={card.rulesText}
            textPresentation={textPresentation}
          />
        )}
      </div>
      <div className="print-card-type">
        <span>{kind}</span>
        <span />
      </div>
    </article>
  );
}
