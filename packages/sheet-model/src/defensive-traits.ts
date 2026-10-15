import type { EvaluatedStat } from "@4ecb/rules-engine";
import type { SheetValue } from "./index";

/** Legacy BasicUtils projects signed resist:* stats and separate save conditions.
 * Never add conditional contributions together: their circumstances and stacking
 * may differ. Equipment-inapplicable contributions must not become reminders. */
export function defensiveStatTraits(
  values: Readonly<Record<string, string>>,
  evaluated?: Readonly<Record<string, EvaluatedStat>>,
): SheetValue[] {
  const result: SheetValue[] = [];
  const seen = new Set<string>();
  const add = (label: string, value: string) => {
    const identity = `${label}:${value}`;
    if (!seen.has(identity)) result.push({ label, value });
    seen.add(identity);
  };
  const signed = (n: number) => `${n >= 0 ? "+" : ""}${n}`;
  for (const [name, raw] of Object.entries(values)) {
    const resist = /^resist\s*:\s*(.+)$/i.exec(name);
    const saves = /^(?:death )?saving throws?$/i.test(name.trim());
    if (!resist && !saves) continue;
    const total = Number(raw);
    const label = resist?.[1]?.replace(/^./, (s) => s.toUpperCase());
    const resistance = (n: number, condition = "") => {
      if (n !== 0)
        add(
          n > 0 ? "Resistance" : "Vulnerability",
          `${label} ${Math.abs(n)}${condition ? ` ${condition}` : ""}`,
        );
    };
    if (Number.isFinite(total) && total !== 0) {
      if (resist) resistance(total);
      else if (/^death /i.test(name.trim())) add("Death saves", signed(total));
    } else if (resist && raw.trim() && !Number.isFinite(total)) {
      add("Resistance / vulnerability", `${label}: ${raw}`);
    }
    const stat = Object.entries(evaluated ?? {}).find(
      ([key]) => key.trim().toLowerCase() === name.trim().toLowerCase(),
    )?.[1];
    for (const contribution of stat?.contributions ?? []) {
      if (contribution.reason !== "conditional" || !contribution.condition)
        continue;
      const numeric = contribution.numericValue;
      if (numeric === 0) continue;
      const condition = contribution.condition;
      if (numeric === undefined) {
        add(
          resist ? "Resistance / vulnerability" : "Saving throws",
          `${resist ? `${label}: ` : ""}${contribution.value} ${condition} (unresolved; ${contribution.providerName})`,
        );
      } else if (resist)
        resistance(numeric, `${condition} (${contribution.providerName})`);
      else
        add(
          /^death /i.test(name.trim()) ? "Death saves" : "Saving throws",
          `${signed(numeric)} ${contribution.bonusType ? `${contribution.bonusType} ${numeric < 0 ? "penalty" : "bonus"} ` : ""}${condition} (${contribution.providerName})`,
        );
    }
  }
  return result;
}
