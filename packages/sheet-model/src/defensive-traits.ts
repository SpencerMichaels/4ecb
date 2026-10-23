import type { EvaluatedStat } from "@4ecb/rules-engine";
import type { SheetValue } from "./index";
export interface DefensiveTrait extends SheetValue {
  readonly source?: string;
  readonly group?: string;
  /** The evaluated contributions the entry shows, for matching it to the
   *  reminders it makes redundant. */
  readonly provenanceIds?: readonly string[];
}

/** Legacy BasicUtils projects signed resist:* stats and separate save conditions.
 * Never add conditional contributions together: their circumstances and stacking
 * may differ. Equipment-inapplicable contributions must not become reminders. */
export function defensiveStatTraits(
  values: Readonly<Record<string, string>>,
  evaluated?: Readonly<Record<string, EvaluatedStat>>,
): DefensiveTrait[] {
  const result: DefensiveTrait[] = [];
  const seen = new Map<string, number>();
  const add = (
    label: string,
    value: string,
    source: string,
    provenanceIds: readonly string[] = [],
  ) => {
    const identity = `${label}:${value}:${source}`;
    const index = seen.get(identity);
    if (index === undefined) {
      seen.set(identity, result.length);
      result.push({
        label,
        value,
        source,
        ...(provenanceIds.length ? { provenanceIds } : {}),
      });
      return;
    }
    const existing = result[index]!;
    const merged = [
      ...new Set([...(existing.provenanceIds ?? []), ...provenanceIds]),
    ];
    if (merged.length) result[index] = { ...existing, provenanceIds: merged };
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
    const applied = (stat?.contributions ?? []).filter(
      (c) => c.applied && c.numericValue !== 0,
    );
    const source =
      [...new Set(applied.map((c) => c.providerName))].join(", ") ||
      (evaluated ? "Evaluated total" : "Legacy cache");
    const appliedIds = applied.map((c) => c.id);
    const resistance = (
      n: number,
      condition = "",
      provider = source,
      ids: readonly string[] = appliedIds,
    ) => {
      if (n !== 0)
        add(
          n > 0 ? "Resistance" : "Vulnerability",
          `${label} ${Math.abs(n)}${condition ? ` ${condition}` : ""}`,
          provider,
          ids,
        );
    };
    if (Number.isFinite(total) && total !== 0) {
      if (resist) resistance(total);
      else if (/^death /i.test(name.trim()))
        add(
          "Death saves",
          `${signed(total)} to death saves`,
          source,
          appliedIds,
        );
    } else if (resist && raw.trim() && !Number.isFinite(total)) {
      add("Resistance / vulnerability", `${label}: ${raw}`, source, appliedIds);
    }
    for (const contribution of stat?.contributions ?? []) {
      if (contribution.reason !== "conditional" || !contribution.condition)
        continue;
      const numeric = contribution.numericValue;
      if (numeric === 0) continue;
      const condition = contribution.condition;
      if (numeric === undefined) {
        add(
          resist
            ? "Resistance / vulnerability"
            : /^death /i.test(name.trim())
              ? "Death saves"
              : "Saving throws",
          `${resist ? `${label}: ${contribution.value}` : `${contribution.value} to ${/^death /i.test(name.trim()) ? "death saves" : "saves"}`} ${condition} (unresolved)`,
          contribution.providerName,
          [contribution.id],
        );
      } else if (resist)
        resistance(numeric, condition, contribution.providerName, [
          contribution.id,
        ]);
      else
        add(
          /^death /i.test(name.trim()) ? "Death saves" : "Saving throws",
          `${signed(numeric)} ${contribution.bonusType ? `${contribution.bonusType.toLowerCase()} ${numeric < 0 ? "penalty" : "bonus"} ` : ""}to ${/^death /i.test(name.trim()) ? "death saves" : "saves"} ${condition}`,
          contribution.providerName,
          [contribution.id],
        );
    }
  }
  return result;
}
