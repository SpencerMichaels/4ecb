import { parseLegacyCurrency } from "@4ecb/character-domain";
import type { ContentEntity } from "@4ecb/content-domain";
import type { SheetValue } from "./index";

export interface SheetEncumbrance {
  readonly carriedWeight?: number;
  readonly normalLimit?: number;
  readonly load?: "Normal" | "Heavy" | "Drag" | "Overloaded";
}
export interface WeightedHolding {
  readonly quantity: number;
  readonly definitions: readonly ContentEntity[];
  readonly override?: string | undefined;
  readonly complete?: boolean;
}
const field = (entity: ContentEntity, name: string) =>
  entity.specifics.find((s) => s.name.toLowerCase() === name.toLowerCase())
    ?.value ?? "";

/**
 * D20Workspace.LootWeight/CharLootWeight and UpdateLoot's stock Weight input.
 * A holding whose definitions the content lacks weighs nothing: native
 * LootWeight returns 0 when IsValidLoot fails (no base element), and a legacy
 * save's houserule placeholder has no Weight field, so an unknown item never
 * blanks the total.
 */
export function inventoryWeight(holdings: readonly WeightedHolding[]): number {
  let total = 0;
  for (const holding of holdings) {
    if (holding.quantity <= 0) continue;
    total += (inventoryItemWeight(holding) ?? 0) * holding.quantity;
  }
  return Math.trunc(total);
}

/** Per-copy weight, before quantity multiplication and stock-stat truncation. */
export function inventoryItemWeight(
  holding: WeightedHolding,
): number | undefined {
  const base = holding.definitions[0];
  if (base && field(base, "Category").toLowerCase() === "transportation")
    return 0;
  const override = holding.override?.trim();
  if (
    override !== undefined &&
    override !== "" &&
    Number.isFinite(Number(override)) &&
    Number(override) >= 0
  ) {
    return Number(override);
  }
  if (!base || holding.complete === false) return undefined;
  if (
    (base.type.toLowerCase() === "armor" && /barding/i.test(base.name)) ||
    /^(?:mount|companion|familiar) slot item$/i.test(
      field(base, "Magic Item Type"),
    )
  )
    return 0;
  // Native field parsing consumes leading integer digits/commas; custom
  // decimal weights are supported through the explicit override above.
  const weight = /^\d[\d,]*/.exec(field(base, "Weight"))?.[0];
  return weight ? Number(weight.replaceAll(",", "")) : 0;
}

export function inventoryHoldingWeight(
  holding: WeightedHolding,
): number | undefined {
  // Missing native weight contributes zero to encumbrance, but is not an
  // explicitly listed zero to display beside an item.
  const override = holding.override?.trim();
  const explicitOverride =
    override !== undefined &&
    override !== "" &&
    Number.isFinite(Number(override)) &&
    Number(override) >= 0;
  const base = holding.definitions[0];
  if (!explicitOverride && (!base || !/^\d[\d,]*/.test(field(base, "Weight"))))
    return undefined;
  const weight = inventoryItemWeight(holding);
  return weight === undefined ? undefined : weight * holding.quantity;
}

/** GearPageData: stock gear Weight + whole-pound carried coins, adjusted limit. */
export function sheetEncumbrance({
  gearWeight,
  strength,
  loadAdjustment = 0,
  weightDiscount = 0,
  currency,
  countCoinWeight = true,
}: {
  gearWeight: number | undefined;
  strength: number | undefined;
  loadAdjustment?: number;
  weightDiscount?: number;
  currency: readonly SheetValue[];
  countCoinWeight?: boolean;
}): SheetEncumbrance {
  let carriedWeight: number | undefined;
  const raw = currency.find((value) => value.label === "Carried")?.value;
  if (
    !countCoinWeight &&
    gearWeight !== undefined &&
    Number.isFinite(gearWeight)
  ) {
    carriedWeight = Math.max(0, gearWeight);
  } else if (
    gearWeight !== undefined &&
    Number.isFinite(gearWeight) &&
    raw !== undefined &&
    raw !== "—"
  ) {
    try {
      const coins = parseLegacyCurrency(raw);
      const coinWeight = Math.floor(
        (coins.cp + coins.sp + coins.gp + coins.pp + coins.ad / 10) / 50,
      );
      carriedWeight = Math.max(0, gearWeight) + coinWeight;
    } catch {
      /* Custom money remains unknown, never silently treated as zero. */
    }
  }
  const adjusted =
    strength === undefined || !Number.isFinite(strength)
      ? undefined
      : strength + loadAdjustment;
  return {
    ...(carriedWeight === undefined ? {} : { carriedWeight }),
    ...(adjusted === undefined
      ? {}
      : { normalLimit: adjusted * 10 + weightDiscount }),
    ...(adjusted === undefined || carriedWeight === undefined
      ? {}
      : {
          // Native Load thresholds do not include Weight Discount, unlike the
          // displayed normal limit. Preserve this recovered distinction.
          load:
            carriedWeight <= adjusted * 10
              ? ("Normal" as const)
              : carriedWeight <= adjusted * 20
                ? ("Heavy" as const)
                : carriedWeight <= adjusted * 50
                  ? ("Drag" as const)
                  : ("Overloaded" as const),
        }),
  };
}
