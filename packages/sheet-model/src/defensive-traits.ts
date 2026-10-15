import type { EvaluatedStat } from "@4ecb/rules-engine";
import type { SheetValue } from "./index";
export interface DefensiveTrait extends SheetValue {
  readonly source?: string;
  readonly group?: string;
}

/** Legacy BasicUtils projects signed resist:* stats and separate save conditions.
 * Never add conditional contributions together: their circumstances and stacking
 * may differ. Equipment-inapplicable contributions must not become reminders. */
export function defensiveStatTraits(
  values: Readonly<Record<string, string>>,
  evaluated?: Readonly<Record<string, EvaluatedStat>>,
): DefensiveTrait[] {
  const result: DefensiveTrait[] = [];
  const seen = new Set<string>();
  const add = (label: string, value: string, source: string) => {
    const identity = `${label}:${value}:${source}`;
    if (!seen.has(identity)) result.push({ label, value, source });
    seen.add(identity);
  };
  const signed = (n: number) => `${n >= 0 ? "+" : ""}${n}`;
  for (const [name, raw] of Object.entries(values)) {
    const resist = /^resist\s*:\s*(.+)$/i.exec(name);
    const saves = /^(?:death )?saving throws?$/i.test(name.trim());
    if (!resist && !saves) continue;
    const total = Number(raw);
    const label = resist?.[1]?.replace(/^./, (s) => s.toUpperCase());
    const stat = Object.entries(evaluated ?? {}).find(
      ([key]) => key.trim().toLowerCase() === name.trim().toLowerCase(),
    )?.[1];
    const source =
      [
        ...new Set(
          (stat?.contributions ?? [])
            .filter((c) => c.applied && c.numericValue !== 0)
            .map((c) => c.providerName),
        ),
      ].join(", ") || (evaluated ? "Evaluated total" : "Legacy cache");
    const resistance = (n: number, condition = "", provider = source) => {
      if (n !== 0)
        add(
          n > 0 ? "Resistance" : "Vulnerability",
          `${label} ${Math.abs(n)}${condition ? ` ${condition}` : ""}`,
          provider,
        );
    };
    if (Number.isFinite(total) && total !== 0) {
      if (resist) resistance(total);
      else if (/^death /i.test(name.trim()))
        add("Death saves", signed(total), source);
    } else if (resist && raw.trim() && !Number.isFinite(total)) {
      add("Resistance / vulnerability", `${label}: ${raw}`, source);
    }
    for (const contribution of stat?.contributions ?? []) {
      if (contribution.reason !== "conditional" || !contribution.condition)
        continue;
      const numeric = contribution.numericValue;
      if (numeric === 0) continue;
      const condition = contribution.condition;
      if (numeric === undefined) {
        add(
          resist ? "Resistance / vulnerability" : "Saving throws",
          `${resist ? `${label}: ` : ""}${contribution.value} ${condition} (unresolved)`,
          contribution.providerName,
        );
      } else if (resist)
        resistance(numeric, condition, contribution.providerName);
      else
        add(
          /^death /i.test(name.trim()) ? "Death saves" : "Saving throws",
          `${signed(numeric)} ${contribution.bonusType ? `${contribution.bonusType} ${numeric < 0 ? "penalty" : "bonus"} ` : ""}${condition}`,
          contribution.providerName,
        );
    }
  }
  return result;
}
