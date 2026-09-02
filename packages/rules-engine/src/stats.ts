import type { EquipmentState } from "./equipment";
import { equipmentPredicate } from "./equipment";

export interface StatContribution {
  readonly id: string;
  readonly stat: string;
  readonly value: string;
  readonly providerId: string;
  readonly providerName: string;
  readonly bonusType?: string;
  readonly condition?: string;
  readonly wearing?: string;
  readonly notWearing?: string;
  readonly zeroOnly?: boolean;
  readonly nonZeroOnly?: boolean;
  readonly halfPoint?: boolean;
}

export interface EvaluatedContribution extends StatContribution {
  readonly numericValue?: number;
  readonly applied: boolean;
  readonly reason?:
    "conditional" | "equipment" | "typed-stacking" | "zero-gate" | "cycle";
}

export interface EvaluatedStat {
  readonly name: string;
  readonly value: number | string;
  readonly contributions: readonly EvaluatedContribution[];
}

function key(value: string): string {
  return value.trim().toLocaleLowerCase();
}

export class StatAccumulator {
  readonly #contributions: StatContribution[] = [];
  readonly #aliases = new Map<string, string>();
  readonly #equipment: EquipmentState;

  constructor(equipment: EquipmentState = { items: [] }) {
    this.#equipment = equipment;
  }

  add(contribution: StatContribution): void {
    this.#contributions.push(contribution);
  }
  alias(name: string, alias: string): void {
    this.#aliases.set(key(alias), key(name));
  }

  evaluate(name: string): EvaluatedStat {
    return this.#evaluate(name, new Set());
  }

  allNames(): string[] {
    return [
      ...new Set(this.#contributions.map((contribution) => contribution.stat)),
    ];
  }

  #canonical(name: string): string {
    return this.#aliases.get(key(name)) ?? key(name);
  }

  #value(value: string, visiting: Set<string>): number | string | undefined {
    const trimmed = value.trim();
    if (/^[+-]?\d+(?:\.\d+)?$/.test(trimmed)) return Number(trimmed);
    const ability = /^([+-]?)ABILITYMOD\((.+)\)$/i.exec(trimmed);
    if (ability?.[2] !== undefined) {
      const score = this.#evaluate(ability[2], visiting).value;
      return typeof score === "number"
        ? (ability[1] === "-" ? -1 : 1) * Math.floor((score - 10) / 2)
        : undefined;
    }
    const link = /^([+-])(.+)$/.exec(trimmed);
    if (link?.[1] !== undefined && link[2] !== undefined) {
      const linked = this.#evaluate(link[2], visiting).value;
      return typeof linked === "number"
        ? link[1] === "-"
          ? -linked
          : linked
        : undefined;
    }
    if (
      this.#contributions.some(
        (contribution) =>
          this.#canonical(contribution.stat) === this.#canonical(trimmed),
      )
    )
      return this.#evaluate(trimmed, visiting).value;
    return trimmed;
  }

  #evaluate(name: string, visiting: Set<string>): EvaluatedStat {
    const canonical = this.#canonical(name);
    if (visiting.has(canonical)) return { name, value: 0, contributions: [] };
    const next = new Set(visiting);
    next.add(canonical);
    const candidates = this.#contributions.filter(
      (contribution) => this.#canonical(contribution.stat) === canonical,
    );
    const evaluated: EvaluatedContribution[] = [];
    let untyped = 0;
    const strings: string[] = [];
    const typed = new Map<
      string,
      Array<{ contribution: StatContribution; value: number }>
    >();
    for (const contribution of candidates) {
      const equipmentMatches =
        (contribution.wearing === undefined ||
          equipmentPredicate(this.#equipment, contribution.wearing)) &&
        (contribution.notWearing === undefined ||
          !equipmentPredicate(this.#equipment, contribution.notWearing));
      const raw = this.#value(contribution.value, next);
      if (!equipmentMatches) {
        evaluated.push({
          ...contribution,
          applied: false,
          reason: "equipment",
        });
        continue;
      }
      if (contribution.condition !== undefined) {
        evaluated.push({
          ...contribution,
          ...(typeof raw === "number" ? { numericValue: raw } : {}),
          applied: false,
          reason: "conditional",
        });
        continue;
      }
      if (typeof raw === "string") {
        strings.push(raw);
        evaluated.push({ ...contribution, applied: true });
        continue;
      }
      if (raw === undefined) {
        evaluated.push({ ...contribution, applied: false, reason: "cycle" });
        continue;
      }
      const numeric =
        contribution.halfPoint === true && raw !== 0
          ? raw + (raw > 0 ? 0.5 : -0.5)
          : raw;
      if (
        (contribution.zeroOnly === true && untyped !== 0) ||
        (contribution.nonZeroOnly === true && untyped === 0)
      ) {
        evaluated.push({
          ...contribution,
          numericValue: numeric,
          applied: false,
          reason: "zero-gate",
        });
        continue;
      }
      if (
        contribution.bonusType === undefined ||
        contribution.bonusType.trim().length === 0
      ) {
        untyped += numeric;
        evaluated.push({
          ...contribution,
          numericValue: numeric,
          applied: true,
        });
      } else {
        const group = key(contribution.bonusType);
        typed.set(group, [
          ...(typed.get(group) ?? []),
          { contribution, value: numeric },
        ]);
      }
    }
    for (const group of typed.values()) {
      const nonnegative = group.filter(({ value }) => value >= 0);
      const selected =
        nonnegative.length > 0
          ? nonnegative.sort((left, right) => right.value - left.value)[0]
          : group.sort((left, right) => left.value - right.value)[0];
      for (const entry of group) {
        const applied = entry === selected;
        if (applied) untyped += entry.value;
        evaluated.push({
          ...entry.contribution,
          numericValue: entry.value,
          applied,
          ...(applied ? {} : { reason: "typed-stacking" as const }),
        });
      }
    }
    return {
      name,
      value:
        strings.length > 0 &&
        candidates.every(
          (candidate) => typeof this.#value(candidate.value, next) === "string",
        )
          ? (strings.at(-1) ?? "")
          : Math.trunc(untyped),
      contributions: evaluated,
    };
  }
}
