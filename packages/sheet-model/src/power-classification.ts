import type { ContentEntity } from "@4ecb/content-domain";

/**
 * The one place that decides how a power card is classified and labeled. The
 * builder detail pane, power tables, overview, printable cards, and the sheet
 * order all read this so their terminology and colors cannot drift apart.
 *
 * Mirrors the legacy `PowerCardFactory`: a Utility power type is its own card
 * type; otherwise the card type is the power usage with "(Special)" removed.
 * Rules-reference entries (authored as powers but with no action, such as
 * Divine Sanction) are cards of their own "Feature" type.
 */
export type PowerUsageCategory = "at-will" | "encounter" | "daily";

export type PowerCardTone =
  "feature" | "at-will" | "encounter" | "daily" | "utility" | "neutral";

export interface PowerClassificationInput {
  readonly usage?: string | undefined;
  readonly powerType?: string | undefined;
  readonly actionType?: string | undefined;
  readonly level?: string | undefined;
  readonly rulesItem?: string | undefined;
}

export interface PowerClassification {
  /** A rules reference rather than a usable power. */
  readonly feature: boolean;
  readonly usage: PowerUsageCategory | undefined;
  /** "At-Will", "Encounter", or "Daily"; absent when the usage is unknown. */
  readonly usageLabel: string | undefined;
  readonly utility: boolean;
  /** The authored usage is a nonstandard limit, e.g. "Encounter (Special)". */
  readonly special: boolean;
  readonly level: string | undefined;
  readonly tone: PowerCardTone;
  /** Full card-type footer text, e.g. "Encounter Utility power". */
  readonly typeLabel: string;
  /** Compact label opposite a card name, e.g. "Encounter 7". */
  readonly compactLabel: string;
}

const USAGE_LABELS: Readonly<Record<PowerUsageCategory, string>> = {
  "at-will": "At-Will",
  encounter: "Encounter",
  daily: "Daily",
};

export function powerUsageCategory(
  usage: string | undefined,
): PowerUsageCategory | undefined {
  const normalized = usage?.trim() ?? "";
  if (/^at[- ]?will\b/i.test(normalized)) return "at-will";
  if (/^encounter\b/i.test(normalized)) return "encounter";
  if (/^daily\b/i.test(normalized)) return "daily";
  return undefined;
}

export function classifyPower(
  input: PowerClassificationInput,
): PowerClassification {
  const powerType = input.powerType?.trim().toLocaleLowerCase() ?? "";
  const hasAction = Boolean(input.actionType?.trim());
  const feature =
    Boolean(input.rulesItem?.trim()) || (powerType === "feature" && !hasAction);
  const usage = feature ? undefined : powerUsageCategory(input.usage);
  const usageLabel = usage === undefined ? undefined : USAGE_LABELS[usage];
  const utility = !feature && powerType === "utility";
  const special = !feature && /\(special\)/i.test(input.usage ?? "");
  const level = input.level?.trim() || undefined;
  const tone: PowerCardTone = feature
    ? "feature"
    : utility
      ? "utility"
      : (usage ?? "neutral");
  const kind = [usageLabel, utility ? "Utility" : undefined]
    .filter((part) => part !== undefined)
    .join(" ");
  const typeLabel = feature
    ? "Feature"
    : `${kind ? `${kind} power` : "Power"}${special ? " (Special)" : ""}`;
  const compactLabel = feature
    ? "Feature"
    : [kind || "Power", level].filter(Boolean).join(" ");
  return {
    feature,
    usage,
    usageLabel,
    utility,
    special,
    level,
    tone,
    typeLabel,
    compactLabel,
  };
}

interface NamedValue {
  readonly value: string;
}

function lookup<Entry extends NamedValue>(
  entries: readonly Entry[],
  key: (entry: Entry) => string,
) {
  return (name: string) =>
    entries.find(
      (entry) =>
        key(entry).trim().toLocaleLowerCase() === name.toLocaleLowerCase(),
    )?.value;
}

export function classifyPowerEntity(
  entity: ContentEntity,
): PowerClassification {
  const field = lookup(entity.specifics, (entry) => entry.name);
  return classifyPower({
    usage: field("Power Usage"),
    powerType: field("Power Type"),
    actionType: field("Action Type"),
    level: field("Level"),
    rulesItem: field("Rules Item"),
  });
}

/** Classifies an evaluated sheet card; its usage and action are hoisted out
 * of the authored fields, the rest stay in `fields`/`referenceFields`. */
export function classifyPowerCard(card: {
  readonly usage?: string | undefined;
  readonly actionType?: string | undefined;
  readonly fields: readonly {
    readonly label: string;
    readonly value: string;
  }[];
  readonly referenceFields?:
    readonly { readonly label: string; readonly value: string }[] | undefined;
}): PowerClassification {
  const field = lookup(card.fields, (entry) => entry.label);
  const reference = lookup(card.referenceFields ?? [], (entry) => entry.label);
  return classifyPower({
    usage: card.usage,
    powerType: field("Power Type"),
    actionType: card.actionType,
    level: field("Level") ?? reference("Level"),
    rulesItem: field("Rules Item"),
  });
}

/**
 * Display label for an authored action type: "Standard", "Minor",
 * "Immediate Interrupt", "Free", "No Action". Free and No Action are distinct
 * actions (a No Action power works even when unable to take actions).
 */
export function powerActionLabel(
  value: string | undefined,
): string | undefined {
  const authored = value?.trim().replace(/\s+/g, " ");
  if (!authored) return undefined;
  if (/^no action\b/i.test(authored))
    return authored.replace(/^no action\b/i, "No Action");
  const label = authored
    .replace(/\s+action\b/i, "")
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase())
    .trim();
  return label || undefined;
}

/** Shared action hierarchy for power tables, cards, and sheet indexes. */
export function powerActionRank(value: string | undefined): number {
  const normalized = value?.trim().toLocaleLowerCase() ?? "";
  if (/^standard\b/.test(normalized)) return 0;
  if (/^move\b/.test(normalized)) return 1;
  if (/^minor\b/.test(normalized)) return 2;
  if (/^free\b/.test(normalized)) return 3;
  if (/^no action\b/.test(normalized)) return 4;
  if (/^(?:immediate|opportunity|reaction|interrupt)\b/.test(normalized))
    return 5;
  return 6;
}
