import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import { CharacterRepository } from "@4ecb/browser-storage";
import type { CharacterRecord, SheetSettings } from "@4ecb/character-domain";
import type { ContentPackManifest } from "@4ecb/content-pack";
import { appContentRuntime } from "./app-runtime";
import {
  projectBuildForEvaluation,
  type EvaluatedCharacter,
} from "@4ecb/rules-engine";
import {
  buildEvaluatedSheetModel,
  buildSheetModel,
  type SheetCard,
  type SheetLearnedReference,
  type SheetPowerAttack,
  type SheetValue,
} from "@4ecb/sheet-model";

import { contentProfileMatchesRevision } from "./profile-migration";
import { ActionTypeIcon } from "./ActionTypeIcon";
import { Icon } from "./Icon";
import { PortraitImage } from "./PortraitEditor";
import { inventoryCategory } from "./equipment-ui";
import { sortedPowerCards } from "./power-card-order";
import { PrintPowerVariants } from "./PrintPowerVariants";
import { PrintConsumableTracker } from "./PrintConsumableTracker";
import { printAdditionalEffect } from "./print-additional-effects";
import {
  preferredPrintCardTextSize,
  printCardFontSizes,
  wrappedRowStarts,
} from "./print-card-fit";
import {
  printItemPresentation,
  printItemPower,
  printItemPowerClauses,
} from "./print-item-presentation";
import {
  defaultPrintAttacks,
  groupedPrintRules,
  printAttackHeader,
  printActionLabel,
  printSustainActions,
} from "./print-power-attacks";
import {
  defaultPowerVariant,
  PowerTextProse,
  PowerVariantPanel,
  powerVariantAttack,
  powerVariantLabel,
  powerVariantNotes,
  type PowerCardPresentation,
} from "./PowerCardPresentation";
import { Prose } from "./Prose";
import { SheetOverview } from "./SheetOverview";
import { powerTextAtLevel } from "./power-level-text";

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

function Card({
  card,
  characterLevel,
  abbreviateAbilityValues,
  expandWeaponDice,
}: {
  readonly card: SheetCard;
  readonly characterLevel: number;
  readonly abbreviateAbilityValues: boolean;
  readonly expandWeaponDice: boolean;
}) {
  const powerType = card.fields.find(
    (field) => field.label.trim().toLocaleLowerCase() === "power type",
  )?.value;
  const usage = (
    powerType?.trim().toLocaleLowerCase() === "utility"
      ? "utility"
      : (card.usage ?? "item")
  )
    .trim()
    .toLocaleLowerCase()
    .replace(/[^a-z]+/g, "-");
  const variants = card.variants ?? [];
  const [selectedVariantId, setSelectedVariantId] = useState(
    () => defaultPowerVariant(variants)?.id,
  );
  const selectedVariant =
    variants.find((variant) => variant.id === selectedVariantId) ??
    defaultPowerVariant(variants);
  const presentation: PowerCardPresentation | undefined =
    card.kind !== "power"
      ? undefined
      : {
          personalizePowerText: (value) => value,
          abbreviateAbilityValues,
          expandWeaponDice,
          variants,
        };
  const printVariants =
    variants.filter((variant) => variant.equipped).length > 0
      ? variants.filter((variant) => variant.equipped)
      : selectedVariant === undefined
        ? []
        : [selectedVariant];
  return (
    <article className={`sheet-card ${card.kind}-card usage-${usage}`}>
      <header>
        <h3>{card.name}</h3>
        <span>
          {card.usage ?? (card.kind === "item" ? "Magic item" : "Power")}
        </span>
      </header>
      {(card.actionType ?? card.keywords) === undefined ? null : (
        <p className="card-meta">
          <strong>{card.actionType}</strong>
          {card.keywords === undefined ? null : ` · ${card.keywords}`}
        </p>
      )}
      {selectedVariant === undefined &&
      (card.attack ?? card.damage) !== undefined ? (
        <dl className="card-combat">
          <div>
            <dt>Attack</dt>
            <dd>{card.attack ?? "—"}</dd>
          </div>
          <div>
            <dt>Damage</dt>
            <dd>{card.damage ?? "—"}</dd>
          </div>
        </dl>
      ) : null}
      {selectedVariant === undefined ? null : (
        <div className="screen-power-variants">
          <PowerVariantPanel
            variants={variants}
            selected={selectedVariant}
            onSelect={setSelectedVariantId}
          />
        </div>
      )}
      {printVariants.length === 0 ? null : (
        <ul className="print-power-variants">
          {printVariants.map((variant) => (
            <li key={variant.id}>
              <strong>{powerVariantLabel(variant)}:</strong>{" "}
              {powerVariantAttack(variant)}; {variant.damage ?? "—"} damage
              {powerVariantNotes(variant) === undefined
                ? null
                : `; ${powerVariantNotes(variant)}`}
            </li>
          ))}
        </ul>
      )}
      {card.flavor === undefined ? null : (
        <div className="sheet-card-flavor">
          <Prose value={card.flavor} />
        </div>
      )}
      {card.prerequisites === undefined ? null : (
        <dl className="sheet-card-rules">
          <div>
            <dt>Prerequisite</dt>
            <dd>
              <Prose value={card.prerequisites} />
            </dd>
          </div>
        </dl>
      )}
      {card.fields.length === 0 ? null : (
        <dl className="sheet-card-rules">
          {card.fields.map((field, index) => {
            const value =
              card.kind === "power"
                ? powerTextAtLevel(field.value, characterLevel)
                : field.value;
            return (
              <div key={`${field.label}-${field.value}-${index}`}>
                <dt>{field.label}</dt>
                <dd>
                  {presentation === undefined ? (
                    <Prose value={value} />
                  ) : (
                    <>
                      <span className="screen-power-text">
                        <PowerTextProse
                          value={value}
                          presentation={presentation}
                          variant={selectedVariant}
                        />
                      </span>
                      <span className="print-power-text">
                        <Prose value={value} />
                      </span>
                    </>
                  )}
                </dd>
              </div>
            );
          })}
        </dl>
      )}
      {card.description === undefined ? null : (
        <Prose value={card.description} />
      )}
      {card.calculationWarnings?.map((warning, index) => (
        <p className="status warning screen-only" key={index}>
          {warning}
        </p>
      ))}
      {card.source === undefined ? null : <footer>{card.source}</footer>}
    </article>
  );
}

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

function cardField(card: SheetCard, ...labels: string[]): string | undefined {
  const wanted = new Set(labels.map((label) => label.toLocaleLowerCase()));
  return card.fields.find((field) =>
    wanted.has(field.label.trim().toLocaleLowerCase()),
  )?.value;
}

function usePrintCardFit() {
  const cardRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const element = cardRef.current;
    const body = element?.querySelector<HTMLElement>(".print-card-body");
    if (element === null || body === undefined || body === null) return;
    const fit = () => {
      // Hidden print cards have no measurable geometry. ResizeObserver reruns
      // this when the preview or print media makes them visible.
      if (element.clientHeight === 0 || element.getClientRects().length === 0)
        return;
      const preferred = preferredPrintCardTextSize(
        getComputedStyle(element)
          .getPropertyValue("--preferred-print-card-text-size")
          .trim(),
      );
      element.style.setProperty("--print-card-text-size", `${preferred}pt`);
      let fits = false;
      for (const size of printCardFontSizes(preferred)) {
        element.style.setProperty("--print-card-body-size", `${size}pt`);
        element.classList.toggle("is-compact", size <= 7 && size > 6.5);
        element.classList.toggle("is-condensed", size <= 6.5);
        // Restore intrinsic sizing before sharing the widest first cell between
        // the action/range and primary attack/target rows. Never measure the
        // previously assigned width, which would prevent shrinking on refit.
        element.style.removeProperty("--print-card-header-first-column");
        const firstHeaderCells = [
          element.querySelector<HTMLElement>(
            ".print-card-action-band > span:first-child",
          ),
          element.querySelector<HTMLElement>(
            ".print-card-combat-band:not(.is-secondary) > div:first-child",
          ),
        ].filter((cell): cell is HTMLElement => cell !== null);
        if (firstHeaderCells.length > 0)
          element.style.setProperty(
            "--print-card-header-first-column",
            `${Math.max(...firstHeaderCells.map((cell) => cell.getBoundingClientRect().width))}px`,
          );
        for (const row of element.querySelectorAll<HTMLElement>(
          ".print-card-combat-band.is-secondary, .print-item-stat-row",
        )) {
          const cells = [...row.children];
          // Measure the natural layout with separators restored each time.
          cells.forEach((cell) => cell.classList.remove("starts-wrapped-row"));
          const starts = wrappedRowStarts(
            cells.map((cell) => cell.getBoundingClientRect().top),
          );
          cells.forEach((cell, index) =>
            cell.classList.toggle("starts-wrapped-row", starts[index] === true),
          );
        }
        if (
          body.clientHeight > 0 &&
          body.scrollHeight <= body.clientHeight + 1 &&
          body.scrollWidth <= body.clientWidth + 1 &&
          element.scrollHeight <= element.clientHeight + 1 &&
          element.scrollWidth <= element.clientWidth + 1 &&
          [
            ...element.querySelectorAll<HTMLElement>(
              ".print-card-action-band > span, .print-card-combat-band > div",
            ),
          ].every((cell) => cell.scrollWidth <= cell.clientWidth + 1)
        ) {
          fits = true;
          break;
        }
      }
      element.dataset.fitOverflow = String(!fits);
    };
    const observer = new ResizeObserver(fit);
    observer.observe(body);
    window.addEventListener("beforeprint", fit);
    fit();
    return () => {
      observer.disconnect();
      window.removeEventListener("beforeprint", fit);
    };
  });
  return cardRef;
}

function PrintRuleLines({
  fields,
  characterLevel,
  separateFirst = false,
}: {
  readonly fields: readonly SheetValue[];
  readonly characterLevel: number;
  readonly separateFirst?: boolean;
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
      <Prose value={powerTextAtLevel(field.value, characterLevel)} />
    </div>
  ));
}

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
          {attack.target === undefined ? null : <Icon name="target" />}
          <dd>{attack.target ?? ""}</dd>
        </div>
      ) : null}
    </dl>
  );
}

function PrintPowerCard({
  card,
  characterLevel,
  colorUtilityPowersBlue,
  showEquippedAttackBonus,
  showPrintTitleActionIcon,
}: {
  readonly card: SheetCard;
  readonly characterLevel: number;
  readonly colorUtilityPowersBlue: boolean;
  readonly showEquippedAttackBonus: boolean;
  readonly showPrintTitleActionIcon: boolean;
}) {
  const cardRef = usePrintCardFit();
  const attackType = cardField(card, "Attack Type")?.trim() ?? "";
  const level = cardField(card, "Level");
  const powerType = cardField(card, "Power Type");
  const displayActionType = printActionLabel(card.actionType);
  const sustainActions = printSustainActions(card.fields);
  const isUtility = powerType?.trim().toLocaleLowerCase() === "utility";
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
  const usageTone = /^encounter/i.test(card.usage ?? "")
    ? "encounter"
    : /^daily/i.test(card.usage ?? "")
      ? "daily"
      : "at-will";
  const displayUsage =
    usageTone === "encounter"
      ? "Encounter"
      : usageTone === "daily"
        ? "Daily"
        : "At-Will";
  const typeLabel = `${displayUsage}${isUtility ? " Utility" : ""} power`;
  return (
    <article
      ref={cardRef}
      className={`print-reference-card print-power-card usage-${usageTone}${card.keywords?.trim() ? " has-keywords" : ""}${isUtility ? " utility-power" : ""}${isUtility && colorUtilityPowersBlue ? " legacy-utility-color" : ""}`}
    >
      <header>
        <h3>
          {showPrintTitleActionIcon && card.actionType?.trim() ? (
            <ActionTypeIcon decorative value={card.actionType} />
          ) : null}
          <span>{card.name}</span>
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
      {card.keywords?.trim() ? (
        <div className="print-card-keyword-band" aria-label="Keywords">
          <Icon name="key" />
          <span>{card.keywords.trim()}</span>
        </div>
      ) : null}
      <div
        className={`print-card-action-band${!displayActionType && !attackType && sustainActions.length === 0 ? " is-empty" : ""}`}
      >
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
          {attackType ? <Icon name="sword" /> : null}
          {attackType}
        </span>
      </div>
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
              />
            </div>
          </section>
        ))}
        {rules.length === 0 && card.description !== undefined ? (
          <Prose value={card.description} />
        ) : null}
        <PrintPowerVariants
          variants={printVariants}
          attackOrdinals={attacks.map((attack) => attack.ordinal)}
        />
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
      <div className="print-card-type">
        <span>{typeLabel}</span>
        {level === undefined ? null : <span>Level {level}</span>}
      </div>
    </article>
  );
}

function PrintItemCard({
  card,
  showActionIcons,
}: {
  readonly card: SheetCard;
  readonly showActionIcons: boolean;
}) {
  const cardRef = usePrintCardFit();
  const item = printItemPresentation(card);
  return (
    <article
      ref={cardRef}
      className={`print-reference-card print-item-card${item.consumableTracker ? " has-consumable-tracker" : ""}`}
    >
      <header>
        <h3>
          <Icon name={item.icon} />
          <span>{item.name}</span>
        </h3>
      </header>
      <div className="print-item-subheader">
        <dl
          className={`print-item-stats${item.weaponProperties.length > 0 ? " has-properties" : ""}`}
        >
          {item.statRows.map((row, rowIndex) => (
            <div className="print-item-stat-row" key={rowIndex}>
              {row.map(({ label, value }) => (
                <div key={label}>
                  <dt>
                    {label === "Proficiency"
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
      <div className="print-card-body print-item-body">
        {item.description ? <Prose value={item.description} /> : null}
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
                        <Prose value={clause.value} />
                      </div>
                    ),
                  )
                ) : (
                  <Prose value={field.value} />
                )}
              </div>
            </section>
          );
        })}
      </div>
      {item.consumableTracker ? (
        <PrintConsumableTracker tracker={item.consumableTracker} />
      ) : null}
      <footer className="print-item-footer">
        <span>{item.metadata}</span>
        <span className="print-item-footer-details">{item.footerDetails}</span>
      </footer>
      <div className="print-card-type">
        <span>{item.kind}</span>
        <span>{item.level ? `Level ${item.level}` : ""}</span>
      </div>
    </article>
  );
}

function PrintCard({
  card,
  characterLevel,
  colorUtilityPowersBlue,
  showEquippedAttackBonus,
  showPrintTitleActionIcon,
}: {
  readonly card: SheetCard;
  readonly characterLevel: number;
  readonly colorUtilityPowersBlue: boolean;
  readonly showEquippedAttackBonus: boolean;
  readonly showPrintTitleActionIcon: boolean;
}) {
  return card.kind === "power" ? (
    <PrintPowerCard
      card={card}
      characterLevel={characterLevel}
      colorUtilityPowersBlue={colorUtilityPowersBlue}
      showEquippedAttackBonus={showEquippedAttackBonus}
      showPrintTitleActionIcon={showPrintTitleActionIcon}
    />
  ) : (
    <PrintItemCard card={card} showActionIcons={showPrintTitleActionIcon} />
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
  resolveAbilityChoices = true,
  abbreviateAbilityValues = true,
  expandWeaponDice = true,
  colorUtilityPowersBlue = false,
  showEquippedAttackBonus = true,
  showPrintTitleActionIcon = true,
  printCardTextSize = 8,
  countCoinWeight = true,
}: {
  readonly characterId: string;
  readonly manifests: readonly ContentPackManifest[];
  readonly printOnReady?: boolean;
  readonly resolveAbilityChoices?: boolean;
  readonly abbreviateAbilityValues?: boolean;
  readonly expandWeaponDice?: boolean;
  readonly colorUtilityPowersBlue?: boolean;
  readonly showEquippedAttackBonus?: boolean;
  readonly showPrintTitleActionIcon?: boolean;
  readonly printCardTextSize?: number;
  readonly countCoinWeight?: boolean;
}) {
  const [showPrintPreview, setShowPrintPreview] = useState(false);
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
  const printableCards = [
    ...(character.sheetSettings.includePowerCards ? powerCards : []),
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
          <button type="button" onClick={() => setShowPrintPreview(false)}>
            ← Back to character view
          </button>
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
              href={`#/characters/${encodeURIComponent(characterId)}/edit?tab=overview`}
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
                <Card
                  key={`${card.name}-${index}`}
                  card={card}
                  characterLevel={characterLevel}
                  abbreviateAbilityValues={abbreviateAbilityValues}
                  expandWeaponDice={expandWeaponDice}
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
                  <Card
                    key={`${card.name}-${index}`}
                    card={card}
                    characterLevel={characterLevel}
                    abbreviateAbilityValues={false}
                    expandWeaponDice={false}
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
                    characterLevel={characterLevel}
                    colorUtilityPowersBlue={colorUtilityPowersBlue}
                    showEquippedAttackBonus={showEquippedAttackBonus}
                    showPrintTitleActionIcon={showPrintTitleActionIcon}
                    key={`${card.kind}-${card.id ?? card.name}-${index}`}
                  />
                ))}
              </div>
              <footer className="print-card-page-footer">
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
                <span>Power &amp; Item Cards</span>
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
