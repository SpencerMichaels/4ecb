import type { SheetCard } from "@4ecb/sheet-model";

import { ActionTypeIcon } from "./ActionTypeIcon";
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
  showActionIcons,
  layout = "print",
  panel = {},
}: {
  readonly card: SheetCard;
  readonly showActionIcons: boolean;
  readonly layout?: CardLayout;
  readonly panel?: CardPanelProps;
}) {
  const cardRef = usePrintCardFit(layout === "print");
  const isPanel = layout === "panel";
  const textPresentation = panel.textPresentation;
  const item = printItemPresentation(card);
  const hasSubheader =
    item.statRows.length > 0 || item.weaponProperties.length > 0;
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
        <div className="print-item-subheader">
          <dl className="print-item-stats">
            {item.statRows.map((row, rowIndex) => (
              <div className="print-item-stat-row" key={rowIndex}>
                {row.map(({ label, value }) => (
                  <div key={label}>
                    <dt>
                      {label === "Proficiency" &&
                      row.some((stat) => stat.label === "Range")
                        ? "Prof"
                        : label === "Critical"
                          ? "Crit"
                          : label}
                    </dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </div>
            ))}
            {item.weaponProperties.length > 0 ? (
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
            ) : null}
          </dl>
        </div>
      )}
      <div className="print-card-body print-item-body">
        {item.description ? (
          <CardText
            value={item.description}
            textPresentation={textPresentation}
          />
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
                  className={`print-item-power-heading${power.usage ? ` usage-${power.usage.toLocaleLowerCase()}` : ""}${power.actionType && showActionIcons ? " has-action-icon" : ""}`}
                >
                  {power.actionType ? (
                    <>
                      {showActionIcons ? (
                        <ActionTypeIcon decorative value={power.actionType} />
                      ) : null}
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
      </div>
      <footer className="print-item-footer">
        <span>{item.metadata}</span>
        <span className="print-item-footer-details">{item.footerDetails}</span>
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
