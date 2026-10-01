import { useEffect, useMemo, useRef, useState } from "react";

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
import { powerTextAtLevel } from "./power-level-text";
import { powerAttackIcon } from "./visual-language";

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

const LEGACY_ITEM_BODY_EXCLUDES = new Set([
  "level",
  "gold",
  "enhancement",
  "magic item type",
  "critical",
  "weapon",
  "armor",
  "property",
  "key ability",
  "internalonly",
  "weaponequiv",
  "enchantequiv",
  "granted powers",
  "item slot",
  "full text",
  "description",
  "equipped",
  "count",
  "weight",
  "range",
  "damage",
  "proficiency bonus",
  "weapon category",
  "hands required",
  "group",
]);

function cardField(card: SheetCard, ...labels: string[]): string | undefined {
  const wanted = new Set(labels.map((label) => label.toLocaleLowerCase()));
  return card.fields.find((field) =>
    wanted.has(field.label.trim().toLocaleLowerCase()),
  )?.value;
}

function lastCardField(
  card: SheetCard,
  ...labels: string[]
): string | undefined {
  const wanted = new Set(labels.map((label) => label.toLocaleLowerCase()));
  return [...card.fields]
    .reverse()
    .find((field) => wanted.has(field.label.trim().toLocaleLowerCase()))?.value;
}

function printCardDensity(card: SheetCard): string {
  const length = card.fields.reduce(
    (total, field) => total + field.label.length + field.value.length,
    0,
  );
  return length > 1_350 ? "is-condensed" : length > 850 ? "is-compact" : "";
}

function abbreviatedAbility(ability: string): string {
  const abbreviation = new Map([
    ["strength", "STR"],
    ["constitution", "CON"],
    ["dexterity", "DEX"],
    ["intelligence", "INT"],
    ["wisdom", "WIS"],
    ["charisma", "CHA"],
  ]).get(ability.trim().toLocaleLowerCase());
  return abbreviation ?? ability.toLocaleUpperCase();
}

function abbreviatedAttackTotal(value: string): string {
  return value
    .replace(/\bFortitude\b/gi, "Fort")
    .replace(/\bReflex\b/gi, "Ref");
}

function authoredAttackOrdinal(label: string): number | undefined {
  const normalized = label.trim().toLocaleLowerCase();
  if (normalized === "attack" || normalized === "primary attack") return 1;
  if (normalized === "secondary attack") return 2;
  if (normalized === "tertiary attack") return 3;
  if (normalized === "quaternary attack") return 4;
  return undefined;
}

function groupedPrintRules(fields: readonly SheetValue[]): {
  readonly leading: readonly SheetValue[];
  readonly attacks: ReadonlyMap<number, readonly SheetValue[]>;
} {
  const leading: SheetValue[] = [];
  const attacks = new Map<number, SheetValue[]>();
  let currentAttack: number | undefined;
  for (const field of fields) {
    const ordinal = authoredAttackOrdinal(field.label);
    if (ordinal !== undefined) {
      currentAttack = ordinal;
      if (!attacks.has(ordinal)) attacks.set(ordinal, []);
      continue;
    }
    if (currentAttack === undefined) leading.push(field);
    else attacks.get(currentAttack)?.push(field);
  }
  return { leading, attacks };
}

function PrintRuleLines({
  fields,
  characterLevel,
}: {
  readonly fields: readonly SheetValue[];
  readonly characterLevel: number;
}) {
  return fields.map((field, index) => (
    <div key={`${field.label}-${index}`}>
      <strong>{field.label.trim()}:</strong>{" "}
      <Prose value={powerTextAtLevel(field.value, characterLevel)} />
    </div>
  ));
}

function PrintAttackBand({
  attack,
  numbered,
}: {
  readonly attack: SheetPowerAttack;
  readonly numbered: boolean;
}) {
  const formula = `${abbreviatedAbility(attack.ability)}${attack.powerBonus === 0 ? "" : attack.powerBonus > 0 ? `+${attack.powerBonus}` : attack.powerBonus}`;
  return (
    <dl className="print-card-combat-band">
      <div className="print-card-attack-formula">
        <Icon name="sword" />
        <dd>
          ATTACK{numbered ? ` ${attack.ordinal}` : ""} · {formula}
        </dd>
      </div>
      <div className="print-card-attack-total">
        <dd>{abbreviatedAttackTotal(attack.attack)}</dd>
      </div>
      <div className="print-card-attack-target">
        <Icon name="target" />
        <dd>{attack.target ?? "—"}</dd>
      </div>
    </dl>
  );
}

function PrintPowerCard({
  card,
  characterLevel,
}: {
  readonly card: SheetCard;
  readonly characterLevel: number;
}) {
  const attackType = cardField(card, "Attack Type") ?? "";
  const target = cardField(card, "Target", "Targets", "Primary Target");
  const level = cardField(card, "Level");
  const className = cardField(card, "Class");
  const powerType = cardField(card, "Power Type");
  const authoredAttackField = cardField(card, "Attack", "Primary Attack");
  const displayActionType = card.actionType?.replace(/\s+action\b/i, "").trim();
  const isUtility =
    powerType?.trim().toLocaleLowerCase() === "utility" ||
    (authoredAttackField === undefined &&
      (card.attack === undefined || card.attack.includes("Unknown")));
  const variants = card.variants ?? [];
  const candidateVariants =
    variants.filter((variant) => variant.equipped).length > 0
      ? variants.filter((variant) => variant.equipped)
      : variants.slice(0, 1);
  const printVariants = candidateVariants.filter(
    (variant) =>
      variant.damage !== undefined ||
      (variant.attack !== undefined && !variant.attack.includes("Unknown")),
  );
  const selectedPrintVariant = candidateVariants[0];
  const fallbackAbility =
    selectedPrintVariant?.ability ??
    authoredAttackField?.match(
      /\b(Strength|Constitution|Dexterity|Intelligence|Wisdom|Charisma)\b/i,
    )?.[1] ??
    "Ability";
  const fallbackPowerBonus =
    selectedPrintVariant?.powerBonus ??
    Number(authoredAttackField?.match(/\+\s*(\d+)/)?.[1] ?? 0);
  const attacks: readonly SheetPowerAttack[] =
    selectedPrintVariant?.attacks ??
    (isUtility
      ? []
      : [
          {
            id: `${card.id ?? card.name}:attack-1`,
            ordinal: 1,
            ability: fallbackAbility,
            powerBonus: fallbackPowerBonus,
            attack:
              selectedPrintVariant?.attack ?? card.attack ?? "— vs defense",
            ...(target === undefined ? {} : { target }),
          },
        ]);
  const rules = card.fields.filter(
    (field) =>
      !LEGACY_POWER_BODY_EXCLUDES.has(field.label.trim().toLocaleLowerCase()),
  );
  const groupedRules = groupedPrintRules(rules);
  const usage = (card.usage ?? "utility")
    .trim()
    .toLocaleLowerCase()
    .replace(/[^a-z]+/g, "-");
  return (
    <article
      className={`print-reference-card print-power-card usage-${usage} ${printCardDensity(card)}`}
    >
      <header>
        <h3>{card.name}</h3>
        <span aria-label="Used" className="print-card-used" />
      </header>
      <div className="print-card-keywords">
        <span>Keywords</span>
        <strong>{card.keywords}</strong>
      </div>
      <div className="print-card-action-band">
        <span>
          <ActionTypeIcon decorative value={card.actionType} />
          {displayActionType}
        </span>
        <span>
          <Icon name={powerAttackIcon(attackType)} />
          {attackType}
        </span>
      </div>
      <div className="print-card-body">
        {isUtility ? (
          <div className="print-power-frequency" aria-label="Power frequency">
            {(["At-Will", "Encounter", "Daily"] as const).map((frequency) => (
              <span key={frequency}>
                <i>{card.usage === frequency ? "✓" : ""}</i>
                {frequency}
              </span>
            ))}
          </div>
        ) : null}
        {card.prerequisites === undefined ? null : (
          <p>
            <strong>Prerequisite:</strong> {card.prerequisites}
          </p>
        )}
        <div className="print-card-leading-rules">
          <PrintRuleLines
            fields={groupedRules.leading}
            characterLevel={characterLevel}
          />
        </div>
        {attacks.map((attack) => (
          <section className="print-card-attack-section" key={attack.id}>
            <PrintAttackBand attack={attack} numbered={attacks.length > 1} />
            <div className="print-card-attack-rules">
              <PrintRuleLines
                fields={groupedRules.attacks.get(attack.ordinal) ?? []}
                characterLevel={characterLevel}
              />
            </div>
          </section>
        ))}
        {rules.length === 0 && card.description !== undefined ? (
          <Prose value={card.description} />
        ) : null}
        {attacks.length === 0 &&
          printVariants.map((variant) => (
            <p className="print-card-variant" key={variant.id}>
              <strong>{powerVariantLabel(variant)}:</strong>{" "}
              {powerVariantAttack(variant)}
              {variant.damage === undefined
                ? null
                : `, ${variant.damage} damage`}
            </p>
          ))}
      </div>
      <div className="print-card-additional">Additional effects</div>
      <footer>
        <span>{className}</span>
        <span>{level === undefined ? "" : `Level ${level}`}</span>
        <span>{card.source}</span>
      </footer>
      <div className="print-card-type">
        {isUtility ? "Utility" : (card.usage ?? "At-Will")} power
      </div>
    </article>
  );
}

function PrintItemCard({ card }: { readonly card: SheetCard }) {
  const physicalStats = [
    ["Damage", cardField(card, "Damage")],
    ["Proficient", cardField(card, "Proficiency Bonus", "Proficient")],
    ["Group", cardField(card, "Group")],
    ["Range", cardField(card, "Range")],
    ["AC bonus", cardField(card, "AC Bonus")],
    ["Check", cardField(card, "Check")],
    ["Speed", cardField(card, "Speed")],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));
  const quantity = cardField(card, "Quantity");
  const magicStats = [
    ["Enhancement", lastCardField(card, "Enhancement")],
    ["Level", lastCardField(card, "Level")],
    ["Critical", lastCardField(card, "Critical")],
    ["Type", lastCardField(card, "Magic Item Type", "Type")],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));
  const stats: [string, string][] = [
    ...physicalStats.slice(0, 4),
    ...(physicalStats.length >= 4 || quantity === undefined
      ? []
      : [["Quantity", quantity] as [string, string]]),
    ...magicStats,
  ].slice(0, 8);
  const properties = card.fields.filter(
    (field) => field.label.trim().toLocaleLowerCase() === "property",
  );
  const rules = card.fields.filter((field) => {
    const label = field.label.trim().toLocaleLowerCase();
    return !LEGACY_ITEM_BODY_EXCLUDES.has(label) && label !== "quantity";
  });
  const frequencyText = rules.map((field) => field.value).join(" ");
  return (
    <article
      className={`print-reference-card print-item-card ${printCardDensity(card)}`}
    >
      <header>
        <h3>{card.name}</h3>
      </header>
      <dl className="print-item-stats">
        {stats.slice(0, 8).map(([label, value]) => (
          <div key={label}>
            <dd>{value}</dd>
            <dt>{label}</dt>
          </div>
        ))}
      </dl>
      <div className="print-card-body print-item-body">
        {properties.length === 0 ? null : (
          <section>
            <span>Properties</span>
            {properties.map((field, index) => (
              <Prose key={`${field.value}-${index}`} value={field.value} />
            ))}
          </section>
        )}
        {rules.map((field, index) => (
          <div key={`${field.label}-${index}`}>
            <strong>{field.label}:</strong> <Prose value={field.value} />
          </div>
        ))}
        {rules.length === 0 && card.description !== undefined ? (
          <Prose value={card.description} />
        ) : null}
      </div>
      <div className="print-item-frequency" aria-label="Power frequency">
        {(["At-Will", "Encounter", "Daily"] as const).map((frequency) => (
          <span key={frequency}>
            <i>{frequencyText.includes(frequency) ? "✓" : ""}</i>
            {frequency}
          </span>
        ))}
      </div>
      <footer>
        <span>{cardField(card, "Item Slot")}</span>
        <span>{cardField(card, "Weight")}</span>
        <span>{lastCardField(card, "Gold") ?? card.source}</span>
      </footer>
      <div className="print-card-type">Magic item</div>
    </article>
  );
}

function PrintCard({
  card,
  characterLevel,
}: {
  readonly card: SheetCard;
  readonly characterLevel: number;
}) {
  return card.kind === "power" ? (
    <PrintPowerCard card={card} characterLevel={characterLevel} />
  ) : (
    <PrintItemCard card={card} />
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
}: {
  readonly characterId: string;
  readonly manifests: readonly ContentPackManifest[];
  readonly printOnReady?: boolean;
  readonly resolveAbilityChoices?: boolean;
  readonly abbreviateAbilityValues?: boolean;
  readonly expandWeaponDice?: boolean;
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
    return evaluation !== undefined && content !== undefined && exactProfile
      ? buildEvaluatedSheetModel(
          character.snapshot,
          character.build,
          evaluation,
          content.entities,
          { resolveAbilityChoices },
        )
      : buildSheetModel(
          character.snapshot,
          exactProfile ? content?.entities : undefined,
          { resolveAbilityChoices },
        );
  }, [character, content, evaluation, exactProfile, resolveAbilityChoices]);
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
  const hp = character.sheetSettings.blankHitPoints
    ? model.resources.map((value) =>
        value.label === "Hit Points" ? { ...value, value: "" } : value,
      )
    : model.resources;
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
  const printableCards = [
    ...(character.sheetSettings.includePowerCards ? model.powers : []),
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
              {model.powers.map((card, index) => (
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
            <p className="eyebrow">Character record</p>
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

      <article className="print-sheet print-page summary-sheet print-only">
        <header className="sheet-title">
          <div className="sheet-title-identity">
            {character.portrait === undefined ? null : (
              <PortraitImage
                className="sheet-portrait"
                name={characterName}
                portrait={character.portrait}
              />
            )}
            <div>
              <p className="eyebrow">Character sheet</p>
              <h2>{characterName}</h2>
            </div>
          </div>
          <p>{identitySummary}</p>
        </header>
        <section className="identity-block">
          <ValueList values={model.identity} />
        </section>
        <div className="print-dashboard">
          <div className="print-dashboard-column">
            <section className="print-panel print-abilities-panel">
              <h3>Ability scores</h3>
              <ValueList values={model.abilities} />
            </section>
            <section className="print-panel print-resources-panel">
              <h3>Health &amp; resources</h3>
              <ValueList values={hp} />
            </section>
          </div>
          <div className="print-dashboard-column">
            <section className="print-panel print-defenses-panel">
              <h3>Defenses</h3>
              <ValueList values={model.defenses} className="large-values" />
            </section>
            <section className="print-panel print-senses-panel">
              <h3>Movement &amp; senses</h3>
              <ValueList values={model.senses} />
            </section>
          </div>
          <section className="print-panel print-skills-panel">
            <h3>Skills</h3>
            <ValueList values={model.skills} />
          </section>
          <section className="print-panel print-features-panel">
            <h3>Features &amp; feats</h3>
            {model.features.map((group) => (
              <div className="print-feature-index" key={group.group}>
                <h4>{group.group}</h4>
                <p>{group.entries.map((entry) => entry.label).join(" · ")}</p>
              </div>
            ))}
          </section>
        </div>
      </article>

      <article className="print-sheet print-page reference-sheet print-only">
        <header className="sheet-title compact-sheet-title">
          <div>
            <p className="eyebrow">Character reference</p>
            <h2>{characterName}</h2>
          </div>
          <p>{identitySummary}</p>
        </header>
        <div className="print-reference-columns">
          <div>
            <section className="print-panel">
              <h3>Power index</h3>
              <ul className="print-index-list">
                {model.powers.map((power) => (
                  <li key={power.id ?? power.name}>
                    <strong>{power.name}</strong>
                    <span>{power.usage ?? power.actionType}</span>
                  </li>
                ))}
              </ul>
            </section>
            <section className="print-panel">
              <h3>Equipment</h3>
              <ul className="print-index-list">
                {model.equipment.map((item) => (
                  <li key={`${item.label}-${item.value}`}>
                    <strong>{item.label}</strong>
                    <span>{item.value}</span>
                  </li>
                ))}
              </ul>
            </section>
            {model.learnedReferences.length === 0 ? null : (
              <section className="print-panel">
                <h3>Rituals &amp; practices</h3>
                <ul className="print-index-list">
                  {model.learnedReferences.map((reference) => (
                    <li
                      key={`${reference.kind}-${reference.id ?? reference.name}`}
                    >
                      <strong>{reference.name}</strong>
                      <span>{reference.fields[0]?.value}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
          <div className="print-notes-column">
            {character.portrait === undefined ? null : (
              <PortraitImage
                className="print-reference-portrait"
                name={characterName}
                portrait={character.portrait}
              />
            )}
            {model.notes.map((note) => (
              <section
                className="print-panel print-note-panel"
                key={note.label}
              >
                <h3>{note.label}</h3>
                <p>{note.value}</p>
              </section>
            ))}
          </div>
        </div>
      </article>

      {printCardPages.map((page, pageIndex) => (
        <section
          className="print-card-page print-page print-only"
          key={`print-card-page-${pageIndex}`}
        >
          <div className="print-card-grid">
            {page.map((card, index) => (
              <PrintCard
                card={card}
                characterLevel={characterLevel}
                key={`${card.kind}-${card.id ?? card.name}-${index}`}
              />
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
