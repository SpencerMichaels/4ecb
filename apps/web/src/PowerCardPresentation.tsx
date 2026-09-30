import { Fragment, type ReactNode } from "react";

import type { ContentEntity } from "@4ecb/content-domain";
import type { EvaluatedCharacter } from "@4ecb/rules-engine";
import { createEvaluatedPowerTextPersonalizer } from "@4ecb/sheet-model";

import { Prose } from "./Prose";

export interface PowerCardPresentation {
  readonly personalizePowerText: (text: string) => string;
  readonly abbreviateAbilityValues: boolean;
  readonly expandWeaponDice: boolean;
  readonly variants: readonly PowerVariantPresentation[];
}

export interface PowerVariantPresentation {
  readonly id: string;
  readonly equipmentName: string;
  readonly equipped?: boolean;
  readonly weaponDamage?: string;
  readonly hand?: "main" | "off";
  readonly pairedEquipmentName?: string;
  readonly attack?: string;
  readonly attackBonus?: number;
  readonly defense?: string;
  readonly damage?: string;
  readonly damageType?: string;
  readonly critical?: string;
  readonly brutal?: number;
}

export interface PowerCardDisplayOptions {
  readonly resolveAbilityChoices: boolean;
  readonly abbreviateAbilityValues: boolean;
  readonly expandWeaponDice: boolean;
}

export function createPowerCardPresentationFinder(
  evaluation: EvaluatedCharacter,
  content: readonly ContentEntity[],
  options: PowerCardDisplayOptions,
): (definitionId: string, name?: string) => PowerCardPresentation {
  const personalizePowerText = createEvaluatedPowerTextPersonalizer(
    evaluation,
    content,
    options.resolveAbilityChoices,
  );
  const powers = new Map(
    evaluation.powers.map((power) => [
      power.definitionId.toLocaleLowerCase(),
      power,
    ]),
  );
  const powersByName = new Map(
    evaluation.powers.map((power) => [power.name.toLocaleLowerCase(), power]),
  );
  return (definitionId, name) => ({
    personalizePowerText,
    abbreviateAbilityValues: options.abbreviateAbilityValues,
    expandWeaponDice: options.expandWeaponDice,
    variants:
      (
        powers.get(definitionId.toLocaleLowerCase()) ??
        (name === undefined
          ? undefined
          : powersByName.get(name.toLocaleLowerCase()))
      )?.variants ?? [],
  });
}

export function defaultPowerVariant(
  variants: readonly PowerVariantPresentation[],
): PowerVariantPresentation | undefined {
  return (
    variants.find(
      (variant) => variant.equipped === true && variant.hand === "main",
    ) ??
    variants.find((variant) => variant.equipped === true) ??
    variants[0]
  );
}

export function orderedPowerVariants(
  variants: readonly PowerVariantPresentation[],
): readonly PowerVariantPresentation[] {
  const rank = (variant: PowerVariantPresentation) =>
    variant.equipped === true
      ? variant.hand === "main"
        ? 0
        : variant.hand === "off"
          ? 1
          : 2
      : 3;
  return variants
    .map((variant, index) => ({ variant, index }))
    .sort(
      (left, right) =>
        rank(left.variant) - rank(right.variant) || left.index - right.index,
    )
    .map(({ variant }) => variant);
}

export function expandWeaponDice(
  value: string,
  weaponDamage: string | undefined,
): string {
  const weapon = weaponDamage?.match(/^(\d+)d(\d+)$/iu);
  if (weapon?.[1] === undefined || weapon[2] === undefined) return value;
  return value.replace(
    /\b(\d+)?\[W\]/giu,
    (match, count: string | undefined) => {
      const multiplier = count === undefined ? 1 : Number(count);
      if (!Number.isFinite(multiplier)) return match;
      return `${Number(weapon[1]) * multiplier}d${weapon[2]}`;
    },
  );
}

export function presentedPowerText(
  value: string,
  presentation: PowerCardPresentation | undefined,
  variant: PowerVariantPresentation | undefined,
): string {
  if (presentation === undefined) return value;
  const personalized = presentation.personalizePowerText(value);
  return presentation.expandWeaponDice
    ? expandWeaponDice(personalized, variant?.weaponDamage)
    : personalized;
}

const ABILITY_VALUE_PATTERN =
  /\b(?:your\s+)?(Strength|Constitution|Dexterity|Intelligence|Wisdom|Charisma)\s+modifier\s+\(([+-]\d+)\)|\b(Strength|Constitution|Dexterity|Intelligence|Wisdom|Charisma)\s+\(([+-]\d+)\)(?=\s+vs\.?\s)/giu;

export function renderPowerText(
  value: string,
  abbreviateAbilityValues: boolean,
): ReactNode {
  if (!abbreviateAbilityValues) return value;
  const matches = [...value.matchAll(ABILITY_VALUE_PATTERN)];
  if (matches.length === 0) return value;
  const nodes: ReactNode[] = [];
  let cursor = 0;
  for (const [index, match] of matches.entries()) {
    const start = match.index;
    const ability = match[1] ?? match[3] ?? "Ability";
    const modifier = match[2] ?? match[4] ?? "";
    const preceding = value.slice(cursor, start);
    const followsAddition = /\+\s*$/u.test(preceding);
    const displayedPreceding =
      followsAddition && modifier.startsWith("-")
        ? preceding.replace(/\+\s*$/u, "- ")
        : preceding;
    const displayedModifier =
      followsAddition && /^[+-]/u.test(modifier) ? modifier.slice(1) : modifier;
    if (displayedPreceding.length > 0) nodes.push(displayedPreceding);
    nodes.push(
      <abbr
        className="power-value-abbreviation"
        key={`${start}-${index}`}
        title={`${ability} modifier`}
      >
        {displayedModifier}
      </abbr>,
    );
    cursor = start + match[0].length;
  }
  if (cursor < value.length) nodes.push(value.slice(cursor));
  return nodes.map((node, index) => <Fragment key={index}>{node}</Fragment>);
}

export function PowerTextInline({
  value,
  presentation,
  variant,
}: {
  readonly value: string;
  readonly presentation?: PowerCardPresentation | undefined;
  readonly variant?: PowerVariantPresentation | undefined;
}) {
  const displayed = presentedPowerText(value, presentation, variant);
  return (
    <>
      {renderPowerText(
        displayed,
        presentation?.abbreviateAbilityValues === true,
      )}
    </>
  );
}

export function PowerTextProse({
  value,
  presentation,
  variant,
}: {
  readonly value: string;
  readonly presentation?: PowerCardPresentation | undefined;
  readonly variant?: PowerVariantPresentation | undefined;
}) {
  const displayed = presentedPowerText(value, presentation, variant);
  return (
    <Prose
      value={displayed}
      renderText={(text) =>
        renderPowerText(text, presentation?.abbreviateAbilityValues === true)
      }
    />
  );
}

export function powerVariantLabel(variant: PowerVariantPresentation): string {
  const details = [
    variant.hand === "main"
      ? "Main hand"
      : variant.hand === "off"
        ? "Off hand"
        : variant.equipped === true
          ? "Equipped"
          : "Inventory",
    variant.pairedEquipmentName === undefined
      ? undefined
      : `paired with ${variant.pairedEquipmentName}`,
  ].filter((value) => value !== undefined);
  return `${variant.equipmentName} · ${details.join(" · ")}`;
}

export function powerVariantAttack(variant: PowerVariantPresentation): string {
  if (variant.attack !== undefined) return variant.attack;
  return variant.attackBonus === undefined
    ? "—"
    : `${variant.attackBonus >= 0 ? "+" : ""}${variant.attackBonus} vs ${variant.defense ?? "defense"}`;
}

export function powerVariantNotes(
  variant: PowerVariantPresentation,
): string | undefined {
  const notes = [
    variant.damageType,
    variant.critical === undefined
      ? undefined
      : `Critical: ${variant.critical}`,
    variant.brutal === undefined ? undefined : `Brutal ${variant.brutal}`,
  ].filter((value) => value !== undefined && value.length > 0);
  return notes.length === 0 ? undefined : notes.join(" · ");
}

export function PowerVariantPanel({
  variants,
  selected,
  onSelect,
}: {
  readonly variants: readonly PowerVariantPresentation[];
  readonly selected: PowerVariantPresentation;
  readonly onSelect: (id: string) => void;
}) {
  const ordered = orderedPowerVariants(variants);
  const showNotes = ordered.some(
    (variant) => powerVariantNotes(variant) !== undefined,
  );
  const selectedNotes = powerVariantNotes(selected);
  return (
    <section className="power-variant-panel" aria-label="Weapon calculation">
      {variants.length <= 1 ? null : (
        <label className="power-variant-selector">
          <span>Using</span>
          <select
            value={selected.id}
            onChange={(event) => onSelect(event.currentTarget.value)}
          >
            {ordered.map((variant) => (
              <option key={variant.id} value={variant.id}>
                {powerVariantLabel(variant)}
              </option>
            ))}
          </select>
        </label>
      )}
      <dl className="power-variant-summary">
        <div>
          <dt>Attack</dt>
          <dd>{powerVariantAttack(selected)}</dd>
        </div>
        <div>
          <dt>Damage</dt>
          <dd>{selected.damage ?? "—"}</dd>
        </div>
      </dl>
      {selectedNotes === undefined ? null : (
        <p className="power-variant-notes">{selectedNotes}</p>
      )}
      {variants.length <= 1 ? null : (
        <details className="power-variant-comparison">
          <summary>Compare weapons</summary>
          <div className="detail-table-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">Weapon</th>
                  <th scope="col">Attack</th>
                  <th scope="col">Damage</th>
                  {showNotes ? <th scope="col">Notes</th> : null}
                </tr>
              </thead>
              <tbody>
                {ordered.map((variant) => (
                  <tr key={variant.id}>
                    <th scope="row">
                      <button
                        aria-pressed={variant.id === selected.id}
                        className="power-variant-choice"
                        type="button"
                        onClick={() => onSelect(variant.id)}
                      >
                        {powerVariantLabel(variant)}
                      </button>
                    </th>
                    <td>{powerVariantAttack(variant)}</td>
                    <td>{variant.damage ?? "—"}</td>
                    {showNotes ? (
                      <td>{powerVariantNotes(variant) ?? "—"}</td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}
