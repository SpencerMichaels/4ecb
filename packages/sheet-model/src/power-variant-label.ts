import type { EvaluatedPower, PowerVariant } from "@4ecb/rules-engine";

/** The label of an implement power's no-implement row (D111, 2026-11-04). */
export const NO_IMPLEMENT_ROW_LABEL = "No implement";

const hasKeyword = (power: Pick<EvaluatedPower, "keywords">, name: string) =>
  power.keywords.some((keyword) => keyword.trim().toLocaleLowerCase() === name);

/**
 * The label a power card or creature card prints for one of a power's rows
 * (D111, 2026-11-04 amendment): the engine's Unarmed row of a power with
 * the Implement keyword is the attack made with no implement, so it reads
 * "No implement". A power that also has the Weapon keyword keeps
 * "Unarmed": its row is an unarmed weapon attack. The engine data keeps
 * "Unarmed" (legacy's row name, used for parity).
 */
export function powerVariantLabel(
  power: Pick<EvaluatedPower, "keywords">,
  variant: Pick<PowerVariant, "id" | "equipmentId">,
  label: string,
): string {
  const unarmed =
    variant.equipmentId === "unarmed" || variant.id.endsWith(":unarmed");
  return unarmed &&
    hasKeyword(power, "implement") &&
    !hasKeyword(power, "weapon")
    ? NO_IMPLEMENT_ROW_LABEL
    : label;
}
