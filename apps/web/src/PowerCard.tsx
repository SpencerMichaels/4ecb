import type { ReactNode } from "react";

import {
  classifyPowerCard,
  powerActionLabel,
  type SheetCard,
  type SheetPowerAttack,
  type SheetValue,
} from "@4ecb/sheet-model";

import { ActionTypeIcon } from "./ActionTypeIcon";
import { Icon } from "./Icon";
import { PrintPowerVariants } from "./PrintPowerVariants";
import { printAdditionalEffect } from "./print-additional-effects";
import {
  defaultPrintAttacks,
  groupedPrintRules,
  printAttackHeader,
  printSustainActions,
} from "./print-power-attacks";
import { powerTextAtLevel } from "./power-level-text";
import { Prose } from "./Prose";
import { usePrintCardFit } from "./use-print-card-fit";

/**
 * The one power card format: fixed-size on the printed sheet ("print") and
 * fluid in builder detail panes ("panel"), from the same `SheetCard`.
 */
export type CardLayout = "print" | "panel";

const LEGACY_POWER_BODY_EXCLUDES = new Set([
  "power type",
  "power usage",
  "class",
  "level",
  "keywords",
  "action type",
  "attack type",
  "target",
  "targets",
  "display",
  "primary target",
]);

export function cardField(
  card: SheetCard,
  ...labels: string[]
): string | undefined {
  const wanted = new Set(labels.map((label) => label.toLocaleLowerCase()));
  return card.fields.find((field) =>
    wanted.has(field.label.trim().toLocaleLowerCase()),
  )?.value;
}

function PrintRuleLines({
  fields,
  characterLevel,
  separateFirst = false,
  textPresentation,
}: {
  readonly fields: readonly SheetValue[];
  readonly characterLevel: number;
  readonly separateFirst?: boolean;
  readonly textPresentation?: CardTextPresentation | undefined;
}) {
  const sameLogicalGroup = (previous: string, current: string): boolean => {
    const before = previous.trim().toLocaleLowerCase();
    const after = current.trim().toLocaleLowerCase();
    const attackResolution = new Set(["hit", "miss", "effect", "aftereffect"]);
    return (
      (before === "trigger" && after === "effect") ||
      (attackResolution.has(before) && attackResolution.has(after))
    );
  };
  return fields.map((field, index) => (
    <div
      className={`print-card-rule-line${(index === 0 ? separateFirst : !sameLogicalGroup(fields[index - 1]?.label ?? "", field.label)) ? " starts-section" : ""}`}
      key={`${field.label}-${index}`}
    >
      <strong>{field.label.trim()}:</strong>{" "}
      <CardText
        value={field.value}
        characterLevel={characterLevel}
        textPresentation={textPresentation}
      />
    </div>
  ));
}

const isPersonal = (value: string) => /^\s*personal\s*$/i.test(value);

function PrintAttackBand({
  attack,
  showEquippedAttackBonus,
  secondary = false,
}: {
  readonly attack: SheetPowerAttack;
  readonly showEquippedAttackBonus: boolean;
  readonly secondary?: boolean;
}) {
  const total = printAttackHeader(attack, showEquippedAttackBonus);
  return (
    <dl className={`print-card-combat-band${secondary ? " is-secondary" : ""}`}>
      <div className="print-card-attack-total">
        <Icon name="dices" />
        <dd>{total}</dd>
      </div>
      {!secondary || attack.target?.trim() ? (
        <div className="print-card-attack-target">
          {attack.target === undefined ? null : (
            <Icon
              name={isPersonal(attack.target) ? "attack-personal" : "target"}
            />
          )}
          <dd>{attack.target ?? ""}</dd>
        </div>
      ) : null}
    </dl>
  );
}

/** Builder display preferences applied to authored rules text. */
export interface CardTextPresentation {
  readonly transform?: (value: string) => string;
  readonly renderText?: (text: string) => ReactNode;
}

/** Builder-only additions around the shared card; print passes none. */
export interface CardPanelProps {
  readonly headingId?: string;
  /** Relationship/availability badges under the title. */
  readonly subheading?: ReactNode;
  /** Shown first in the body; physical cards omit flavor. */
  readonly flavor?: string;
  /** Appended after the body (e.g. an unavailable reason). */
  readonly afterBody?: ReactNode;
  readonly textPresentation?: CardTextPresentation;
}

export function CardText({
  value,
  characterLevel,
  textPresentation,
}: {
  readonly value: string;
  readonly characterLevel?: number;
  readonly textPresentation?: CardTextPresentation | undefined;
}) {
  const leveled =
    characterLevel === undefined
      ? value
      : powerTextAtLevel(value, characterLevel);
  const transformed = textPresentation?.transform?.(leveled) ?? leveled;
  return textPresentation?.renderText === undefined ? (
    <Prose value={transformed} />
  ) : (
    <Prose value={transformed} renderText={textPresentation.renderText} />
  );
}

export function CardPanelSubheading({
  subheading,
}: {
  readonly subheading: ReactNode;
}) {
  return subheading === undefined || subheading === null ? null : (
    <div className="print-card-panel-subheading">{subheading}</div>
  );
}

export function PowerCard({
  card,
  characterLevel,
  showEquippedAttackBonus,
  showPrintTitleActionIcon,
  layout = "print",
  panel = {},
}: {
  readonly card: SheetCard;
  readonly characterLevel: number;
  readonly showEquippedAttackBonus: boolean;
  readonly showPrintTitleActionIcon: boolean;
  readonly layout?: CardLayout;
  readonly panel?: CardPanelProps;
}) {
  const cardRef = usePrintCardFit(layout === "print");
  const isPanel = layout === "panel";
  const textPresentation = panel.textPresentation;
  const attackType = cardField(card, "Attack Type")?.trim() ?? "";
  const classification = classifyPowerCard(card);
  const level = classification.level;
  const displayActionType = powerActionLabel(card.actionType);
  const sustainActions = printSustainActions(card.fields);
  const isUtility = classification.utility;
  const variants = card.variants ?? [];
  const printVariants = variants.filter(
    (variant) =>
      variant.damage !== undefined ||
      (variant.attack !== undefined && !variant.attack.includes("Unknown")),
  );
  const attacks = defaultPrintAttacks(card);
  const rules = card.fields.filter(
    (field) =>
      !LEGACY_POWER_BODY_EXCLUDES.has(field.label.trim().toLocaleLowerCase()),
  );
  const groupedRules = groupedPrintRules(rules, attacks);
  // Card frame color follows usage; an unknown usage keeps the at-will frame.
  const usageTone = classification.feature
    ? "feature"
    : (classification.usage ?? "at-will");
  const displayUsage = classification.usageLabel ?? "At-Will";
  const hasActionBand =
    Boolean(displayActionType) ||
    Boolean(attackType) ||
    sustainActions.length > 0;
  const typeLabel = classification.typeLabel;
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
      className={`print-reference-card print-power-card${isPanel ? " is-panel" : ""} usage-${usageTone}${card.keywords?.trim() ? " has-keywords" : ""}${isUtility ? " utility-power" : ""}${hasActionBand ? "" : " no-action-band"}`}
    >
      <header>
        <h3>
          {showPrintTitleActionIcon && card.actionType?.trim() ? (
            <ActionTypeIcon decorative value={card.actionType} />
          ) : null}
          <span
            {...(panel.headingId === undefined ? {} : { id: panel.headingId })}
          >
            {card.name}
          </span>
        </h3>
        {isUtility ? (
          <span
            className={`print-utility-usage-badge usage-${usageTone}`}
            aria-label={`${displayUsage} utility power`}
            title={displayUsage}
          >
            {usageTone === "encounter"
              ? "E"
              : usageTone === "daily"
                ? "D"
                : "W"}
          </span>
        ) : null}
      </header>
      {/* Like published power blocks: italic flavor right under the name. */}
      {panel.flavor === undefined ? null : (
        <p className="print-card-flavor">{panel.flavor}</p>
      )}
      <CardPanelSubheading subheading={panel.subheading} />
      {card.keywords?.trim() ? (
        <div className="print-card-keyword-band" aria-label="Keywords">
          <Icon name="key" />
          <span>{card.keywords.trim()}</span>
        </div>
      ) : null}
      {!hasActionBand ? null : (
        <div className="print-card-action-band">
          <span className="print-card-action-types">
            <span className="print-card-action-line">
              {showPrintTitleActionIcon && card.actionType?.trim() ? (
                <Icon name="timer" />
              ) : (
                <ActionTypeIcon decorative value={card.actionType} />
              )}
              {displayActionType}
            </span>
            {sustainActions.map((action) => (
              <span
                className="print-card-action-line"
                key={action}
                aria-label={`Sustain ${action}`}
                title={`Sustain ${action}`}
              >
                <Icon name="step-forward" />
                {action}
              </span>
            ))}
          </span>
          <span>
            {attackType ? (
              <Icon
                name={isPersonal(attackType) ? "attack-personal" : "sword"}
              />
            ) : null}
            {attackType}
          </span>
        </div>
      )}
      <div className="print-card-body">
        {attacks.length === 0 ? (
          <div className="print-card-leading-rules">
            {card.prerequisites === undefined ? null : (
              <p className="print-card-rule-line">
                <strong>Prerequisite:</strong> {card.prerequisites}
              </p>
            )}
            <PrintRuleLines
              fields={groupedRules.leading}
              characterLevel={characterLevel}
              separateFirst={card.prerequisites !== undefined}
              textPresentation={textPresentation}
            />
          </div>
        ) : null}
        {attacks.map((attack, attackIndex) => (
          <section className="print-card-attack-section" key={attack.id}>
            <PrintAttackBand
              attack={attack}
              showEquippedAttackBonus={showEquippedAttackBonus}
              secondary={attackIndex > 0}
            />
            <div className="print-card-attack-rules">
              {attackIndex === 0 ? (
                <>
                  {card.prerequisites === undefined ? null : (
                    <p className="print-card-rule-line">
                      <strong>Prerequisite:</strong> {card.prerequisites}
                    </p>
                  )}
                  <PrintRuleLines
                    fields={groupedRules.leading}
                    characterLevel={characterLevel}
                    separateFirst={card.prerequisites !== undefined}
                    textPresentation={textPresentation}
                  />
                </>
              ) : null}
              <PrintRuleLines
                fields={groupedRules.attacks.get(attack.ordinal) ?? []}
                characterLevel={characterLevel}
                separateFirst={
                  attackIndex === 0 &&
                  (card.prerequisites !== undefined ||
                    groupedRules.leading.length > 0)
                }
                textPresentation={textPresentation}
              />
            </div>
          </section>
        ))}
        {rules.length === 0 && card.description !== undefined ? (
          <CardText
            value={card.description}
            characterLevel={characterLevel}
            textPresentation={textPresentation}
          />
        ) : null}
        <PrintPowerVariants
          variants={printVariants}
          attackOrdinals={attacks.map((attack) => attack.ordinal)}
          implementPower={/\bimplement\b/i.test(card.keywords ?? "")}
        />
        {(card.additionalEffects ?? []).length === 0 ||
        printVariants.length > 0 ? null : (
          // Without a weapon table (which sits at the bottom), keep additional
          // effects at the bottom of the card like every other card.
          <div className="print-card-spacer" aria-hidden="true" />
        )}
        {(card.additionalEffects ?? []).length === 0 ? null : (
          <section className="print-card-additional has-effects">
            <strong>Additional effects</strong>
            {card.additionalEffects?.map((effect, index) => {
              const display = printAdditionalEffect(effect);
              return (
                <p
                  key={`${effect.provenanceId ?? effect.provider ?? "effect"}:${index}`}
                >
                  {display.name ? <strong>{display.name}: </strong> : null}
                  {display.text}
                </p>
              );
            })}
          </section>
        )}
      </div>
      {panel.afterBody}
      <div className="print-card-type">
        <span>{typeLabel}</span>
        {level === undefined ? null : <span>Level {level}</span>}
      </div>
    </article>
  );
}
