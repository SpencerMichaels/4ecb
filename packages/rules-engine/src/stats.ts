import type { EquipmentState } from "./equipment";
import { traceCondition } from "./condition-trace";
import { equipmentPredicate } from "./equipment";
import { abilityModifier } from "./derived-values";

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
  /** Native `statmin="<Stat> <N>"`: applies only while the stat is at
   *  least N. */
  readonly statMinimum?: string;
  /** A conditional `textstring` (legacy StatBlock `statadd String=`): its
   *  value is literal text such as "+1d6", never a stat link. */
  readonly text?: boolean;
}

export interface EvaluatedContribution extends StatContribution {
  readonly numericValue?: number;
  readonly applied: boolean;
  readonly reason?:
    | "conditional"
    | "equipment"
    | "statmin"
    | "typed-stacking"
    | "zero-gate"
    | "zeroed"
    | "cycle";
}

export interface EvaluatedStat {
  readonly name: string;
  readonly value: number | string;
  readonly contributions: readonly EvaluatedContribution[];
}

function key(value: string): string {
  return value.trim().toLocaleLowerCase();
}

/** A contribution's bonus type for `AddStatValue`, or undefined when it is
 *  untyped. Native interns `type=""` as a real, empty type (see
 *  `StatAddRule.bonusType`), so only a missing type is untyped; types
 *  compare case-insensitively (the string table's `_wcsnicmp`). */
function typeKeyOf(contribution: StatContribution): string | undefined {
  return contribution.bonusType === undefined
    ? undefined
    : key(contribution.bonusType);
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
    const { value, contributions } = this.#run(name, new Set(), undefined);
    return { name, value, contributions };
  }

  allNames(): string[] {
    return [
      ...new Set(this.#contributions.map((contribution) => contribution.stat)),
    ];
  }

  #canonical(name: string): string {
    return this.#aliases.get(key(name)) ?? key(name);
  }

  /** A statadd value as native `ParseStatAdd` (~31955) reads it: a literal,
   *  or a link (`+X`, `-X`, `ABILITYMOD(X)`; a bare stat name) whose
   *  multiplier is ±1. Anything else is literal text. */
  #parse(value: string): ParsedValue {
    const trimmed = value.trim();
    if (/^[+-]?\d+(?:\.\d+)?$/.test(trimmed))
      return { kind: "number", value: Number(trimmed) };
    // Native ParseStatAdd: ABILITYMOD(X), MINONEMOD(X) (at least 1) and
    // HALFMOD(X) (halved) link X's ability modifier.
    const ability = /^([+-]?)(ABILITYMOD|MINONEMOD|HALFMOD)\((.+)\)$/i.exec(
      trimmed,
    );
    if (ability?.[3] !== undefined) {
      const modifier = ability[2]!.toLocaleUpperCase();
      return {
        kind: "link",
        stat: ability[3],
        sign: ability[1] === "-" ? -1 : 1,
        abilityModifier: true,
        ...(modifier === "MINONEMOD" ? { minimumOne: true } : {}),
        ...(modifier === "HALFMOD" ? { half: true } : {}),
        bare: false,
      };
    }
    const link = /^([+-])(.+)$/.exec(trimmed);
    if (link?.[1] !== undefined && link[2] !== undefined)
      return {
        kind: "link",
        stat: link[2],
        sign: link[1] === "-" ? -1 : 1,
        abilityModifier: false,
        bare: false,
      };
    if (
      this.#contributions.some(
        (contribution) =>
          this.#canonical(contribution.stat) === this.#canonical(trimmed),
      )
    )
      return {
        kind: "link",
        stat: trimmed,
        sign: 1,
        abilityModifier: false,
        bare: true,
      };
    return { kind: "text", value: trimmed };
  }

  /**
   * Native StatAddApplies (`-Module-.cs` ~36109): `statmin="<Stat> <N>"`
   * (split at the last space) holds unless the stat exists and its own
   * value is below N.
   */
  #meetsStatMinimum(
    contribution: StatContribution,
    visiting: Set<string>,
  ): boolean {
    const minimum = contribution.statMinimum?.trim();
    if (minimum === undefined || minimum.length === 0) return true;
    const space = minimum.lastIndexOf(" ");
    if (space < 0) return true;
    const stat = minimum.slice(0, space);
    const threshold = Number.parseInt(minimum.slice(space + 1).trim(), 10);
    const canonical = this.#canonical(stat);
    if (
      !this.#contributions.some(
        (candidate) => this.#canonical(candidate.stat) === canonical,
      )
    )
      return true;
    const value = this.#run(stat, visiting, undefined).value;
    return traceCondition(
      "statmin",
      `${contribution.providerName}|${contribution.stat}|${minimum}`,
      typeof value !== "number" ||
        value >= (Number.isNaN(threshold) ? 0 : threshold),
    );
  }

  /** The value a contribution shows on its own, its link evaluated as a
   *  stand-alone stat (native `CalculateStatValue` with no `type_max`).
   *  Divergence (D105): native's conditional reminder text
   *  (`BasicUtils.BuildConditionalString`) shows a linked statadd's
   *  stand-alone stat, or its ability modifier, without the link's sign
   *  and HALFMOD/MINONEMOD, misstating the bonus it summarises; this keeps
   *  them, as the total would. */
  #raw(
    contribution: StatContribution,
    visiting: Set<string>,
  ): number | string | undefined {
    if (contribution.text === true) return contribution.value;
    const parsed = this.#parse(contribution.value);
    if (parsed.kind !== "link") return parsed.value;
    const linked = this.#run(parsed.stat, visiting, undefined).value;
    if (typeof linked === "string") return parsed.bare ? linked : undefined;
    return linkValue(parsed, linked);
  }

  /**
   * Native `CalculateStatValue` (D20RulesEngine `-Module-.cs` ~36160) adds a
   * stat's statadds in order, each typed one through `AddStatValue`
   * (~36000) against a per-type cap list (`type_max`). A statlink is
   * evaluated by `CalculateStatAddValue` (~36137) with the PARENT's cap
   * list, so typed bonuses reached through a link share the parent's caps:
   * two untyped AC links to a stat whose bonuses are typed "Swordmage
   * Warding" add it once, and a skill's own feat bonus does not stack with
   * a feat bonus in its "Misc" stat (D103). The link's result (its own
   * gains over those caps, times ±1 or as an ability modifier) is then
   * added to the parent under the link's own type, if any.
   *
   * Without `shared` caps the stat starts its own list: a top-level
   * evaluation, the only one that reports contributions.
   */
  #run(
    name: string,
    visiting: Set<string>,
    shared: SharedCaps | undefined,
  ): {
    value: number | string;
    total: number;
    contributions: EvaluatedContribution[];
  } {
    const canonical = this.#canonical(name);
    if (visiting.has(canonical))
      return { value: 0, total: 0, contributions: [] };
    const next = new Set(visiting);
    next.add(canonical);
    const candidates = this.#contributions.filter(
      (contribution) => this.#canonical(contribution.stat) === canonical,
    );
    // A link (top-level evaluations start with nothing visited).
    if (visiting.size > 0)
      traceCondition("statlink", name, candidates.length > 0);
    const nested = shared !== undefined;
    const caps = shared?.caps ?? new Map<string, TypeCap>();
    const reports: Array<() => EvaluatedContribution> = [];
    let total = 0;
    const strings: string[] = [];
    // Native keeps zero/non-zero-gated statadds apart from the stat's sum
    // and adds one group once the sum is known. A linked stat's gated
    // statadds go to locals that are never added (CalculateStatValue
    // ~36239 rebinds its out-pointers only at the top level).
    const gates: { zero: GatedValue[]; nonZero: GatedValue[] } = {
      zero: [],
      nonZero: [],
    };
    // Native: an untyped literal 0 sets the stat to 0 and ends it (~36222).
    let zeroedAt: number | undefined;
    // Native half-point (~36246): each applying `half-point` statadd adds
    // its own value and flips a per-call toggle; every second one also adds
    // +1 under its own type (as a non-penalty `AddStatValue`). Two hybrid
    // classes' `+3`/`+4` half-point surges give 3 + 4 + 1.
    let halfPointPending = false;
    const halfPointBonus = (
      contribution: StatContribution,
      cell: CreditCell,
    ): number => {
      if (contribution.halfPoint !== true) return 0;
      halfPointPending = !halfPointPending;
      if (halfPointPending) return 0;
      const typeKey = typeKeyOf(contribution);
      if (typeKey === undefined) {
        cell.value += 1;
        return 1;
      }
      return addTyped(caps, typeKey, 1, false, cell);
    };
    for (const [position, contribution] of candidates.entries()) {
      const equipmentMatches =
        (contribution.wearing === undefined ||
          equipmentPredicate(this.#equipment, contribution.wearing)) &&
        (contribution.notWearing === undefined ||
          !equipmentPredicate(this.#equipment, contribution.notWearing));
      if (!equipmentMatches || contribution.condition !== undefined) {
        if (nested) continue;
        const raw = this.#raw(contribution, next);
        reports.push(() => ({
          ...contribution,
          ...(equipmentMatches && typeof raw === "number"
            ? { numericValue: raw }
            : {}),
          applied: false,
          reason: equipmentMatches ? "conditional" : "equipment",
        }));
        continue;
      }
      if (!this.#meetsStatMinimum(contribution, next)) {
        if (nested) continue;
        const raw = this.#raw(contribution, next);
        reports.push(() => ({
          ...contribution,
          ...(typeof raw === "number" ? { numericValue: raw } : {}),
          applied: false,
          reason: "statmin",
        }));
        continue;
      }
      if (contribution.zeroOnly === true || contribution.nonZeroOnly === true) {
        // A gated half-point still flips the toggle; its +1 joins the sum.
        const halfPoint = halfPointBonus(contribution, {
          value: 0,
          capped: false,
        });
        total += halfPoint;
        if (nested) {
          if (shared.credit !== undefined) shared.credit.value += halfPoint;
          continue;
        }
        // Native CalculateStatAddValue: a literal, or a link evaluated
        // against the parent's caps; added untyped and uncapped.
        const parsed = this.#parse(contribution.value);
        let value = 0;
        if (parsed.kind === "number") value = parsed.value;
        else if (parsed.kind === "link") {
          const linked = this.#run(parsed.stat, next, {
            caps,
            credit: undefined,
          }).value;
          if (typeof linked === "number") value = linkValue(parsed, linked);
        }
        (contribution.zeroOnly === true ? gates.zero : gates.nonZero).push({
          contribution,
          value,
          halfPoint,
        });
        continue;
      }
      const parsed: ParsedValue =
        contribution.text === true
          ? { kind: "text", value: contribution.value }
          : this.#parse(contribution.value);
      if (parsed.kind === "text") {
        strings.push(parsed.value);
        if (!nested) reports.push(() => ({ ...contribution, applied: true }));
        continue;
      }
      // What this contribution adds is credited to its own cell at the top
      // level, to the parent link's cell inside an untyped `+` link (whose
      // pieces reach the parent unchanged), and nowhere inside other links.
      const cell: CreditCell = nested
        ? (shared.credit ?? { value: 0, capped: false })
        : { value: 0, capped: false };
      const typeKey = typeKeyOf(contribution);
      let numeric: number;
      if (parsed.kind === "number") numeric = parsed.value;
      else {
        const transparent =
          typeKey === undefined &&
          parsed.sign === 1 &&
          !parsed.abilityModifier &&
          contribution.halfPoint !== true;
        const linked = this.#run(parsed.stat, next, {
          caps,
          credit: transparent ? cell : undefined,
        });
        if (typeof linked.value === "string") {
          if (parsed.bare) {
            strings.push(linked.value);
            if (!nested)
              reports.push(() => ({ ...contribution, applied: true }));
          } else if (!nested)
            reports.push(() => ({
              ...contribution,
              applied: false,
              reason: "cycle",
            }));
          continue;
        }
        if (transparent) {
          // Its pieces were added, and credited, inside the link; only the
          // linked stat's truncation is left to credit.
          total += linked.value;
          cell.value += linked.value - linked.total;
          if (!nested) reports.push(linkReport(contribution, cell));
          continue;
        }
        numeric = linkValue(parsed, linked.value);
      }
      const value = numeric;
      if (typeKey === undefined && parsed.kind === "number" && value === 0) {
        total = 0;
        zeroedAt = position;
        if (!nested)
          reports.push(() => ({
            ...contribution,
            numericValue: 0,
            applied: true,
          }));
        break;
      }
      if (typeKey === undefined) {
        total += value;
        cell.value += value;
        const halfPoint = halfPointBonus(contribution, cell);
        total += halfPoint;
        if (!nested)
          reports.push(() => ({
            ...contribution,
            numericValue: value + halfPoint,
            applied: true,
          }));
        continue;
      }
      if (parsed.kind === "number" && value === 0)
        total += zeroType(caps, typeKey, cell);
      // Native passes `penalty` for a negative statadd value: the literal,
      // or a `-` link's multiplier.
      const penalty = parsed.kind === "number" ? value < 0 : parsed.sign < 0;
      total += addTyped(caps, typeKey, value, penalty, cell);
      const halfPoint = halfPointBonus(contribution, cell);
      total += halfPoint;
      if (!nested)
        reports.push(() => {
          const applied = caps.get(typeKey)?.holder?.cell === cell;
          return {
            ...contribution,
            numericValue: value + halfPoint,
            applied,
            ...(applied ? {} : { reason: "typed-stacking" as const }),
          };
        });
    }
    if (zeroedAt !== undefined && !nested) {
      // Everything before the zero is undone, everything after unread.
      const before = reports.splice(0, reports.length - 1);
      const zero = reports.pop()!;
      reports.push(
        ...before.map((report) => () => {
          const result = report();
          return result.applied
            ? { ...result, applied: false, reason: "zeroed" as const }
            : result;
        }),
        zero,
        ...candidates.slice(zeroedAt + 1).map((contribution) => () => ({
          ...contribution,
          applied: false,
          reason: "zeroed" as const,
        })),
      );
    }
    if (!nested) {
      // Native CalculateStatValue (~36266): a stat whose sum is non-zero
      // adds its non-zero-gated statadds, else its zero-gated ones.
      const nonZero = Math.trunc(total) !== 0;
      const chosen = nonZero ? gates.nonZero : gates.zero;
      for (const entry of chosen) total += entry.value;
      for (const entry of [...gates.zero, ...gates.nonZero]) {
        const gated = chosen.includes(entry);
        const applied = gated || entry.halfPoint !== 0;
        traceCondition(
          entry.contribution.zeroOnly === true ? "zero" : "non-zero",
          `${entry.contribution.providerName}|${entry.contribution.stat}`,
          gated,
        );
        reports.push(() => ({
          ...entry.contribution,
          numericValue: (gated ? entry.value : 0) + entry.halfPoint,
          applied,
          ...(applied ? {} : { reason: "zero-gate" as const }),
        }));
      }
    }
    return {
      value:
        strings.length > 0 &&
        candidates.every(
          (candidate) => typeof this.#raw(candidate, next) === "string",
        )
          ? (strings.at(-1) ?? "")
          : Math.trunc(total),
      total,
      contributions: reports.map((report) => report()),
    };
  }
}

type ParsedValue =
  | { readonly kind: "number"; readonly value: number }
  | { readonly kind: "text"; readonly value: string }
  | {
      readonly kind: "link";
      readonly stat: string;
      readonly sign: 1 | -1;
      readonly abilityModifier: boolean;
      /** MINONEMOD: the ability modifier, at least 1. */
      readonly minimumOne?: boolean;
      /** HALFMOD: half the ability modifier, rounded toward zero. */
      readonly half?: boolean;
      /** A stat name without a sign, which may also name a text stat. */
      readonly bare: boolean;
    };

/** Native CalculateStatAddValue (`-Module-.cs` ~36137): a link's value
 *  from its linked stat, times its ±1 multiplier. */
function linkValue(
  parsed: Extract<ParsedValue, { kind: "link" }>,
  linked: number,
): number {
  if (!parsed.abilityModifier) return parsed.sign * linked;
  let result = abilityModifier(linked);
  if (parsed.half === true) result = Math.trunc(result / 2);
  if (parsed.minimumOne === true && result < 1) result = 1;
  return parsed.sign * result;
}

/** What one top-level contribution has added to the stat. */
interface CreditCell {
  value: number;
  /** A typed piece under it lost to an earlier one of its type. */
  capped: boolean;
}

/** A native `StatMax`: the applied value of one bonus type, whether a 0 of
 *  it was applied, and whether a typed `value="0"` zeroed it for good. */
interface TypeCap {
  value: number;
  zeroSeen: boolean;
  blocked: boolean;
  holder?: { readonly cell: CreditCell; readonly value: number };
}

interface GatedValue {
  readonly contribution: StatContribution;
  readonly value: number;
  /** The half-point +1 it added to the sum (native adds it ungated). */
  readonly halfPoint: number;
}

interface SharedCaps {
  readonly caps: Map<string, TypeCap>;
  readonly credit: CreditCell | undefined;
}

function linkReport(
  contribution: StatContribution,
  cell: CreditCell,
): () => EvaluatedContribution {
  return () => {
    const absorbed = cell.value === 0 && cell.capped;
    return {
      ...contribution,
      numericValue: cell.value,
      applied: !absorbed,
      ...(absorbed ? { reason: "typed-stacking" as const } : {}),
    };
  };
}

function capFor(caps: Map<string, TypeCap>, type: string): TypeCap {
  let cap = caps.get(type);
  if (cap === undefined) {
    cap = { value: 0, zeroSeen: false, blocked: false };
    caps.set(type, cap);
  }
  return cap;
}

/** Moves a type's applied value (and its credit) to a new holder. */
function hold(cap: TypeCap, value: number, cell: CreditCell | undefined): void {
  if (cap.holder !== undefined) cap.holder.cell.value -= cap.holder.value;
  cap.value = value;
  if (cell === undefined) delete cap.holder;
  else {
    cap.holder = { cell, value };
    cell.value += value;
  }
}

/** Native `SetStatToZero` (~36063): a typed literal 0 removes the type's
 *  applied value and keeps the type at 0. Returns what the stat gains. */
function zeroType(
  caps: Map<string, TypeCap>,
  type: string,
  cell: CreditCell,
): number {
  const cap = capFor(caps, type);
  if (cap.blocked) return 0;
  const removed = cap.value;
  hold(cap, 0, cell);
  cap.blocked = true;
  return -removed;
}

/** Native `AddStatValue` (~36000). Returns what the stat gains. */
function addTyped(
  caps: Map<string, TypeCap>,
  type: string,
  toAdd: number,
  penalty: boolean,
  cell: CreditCell,
): number {
  const cap = capFor(caps, type);
  if (cap.blocked) return 0;
  const current = cap.value;
  if (!penalty) {
    if (toAdd > current || (current === 0 && !cap.zeroSeen)) {
      hold(cap, toAdd, cell);
      if (toAdd === 0) cap.zeroSeen = true;
      if (current !== 0) cell.capped = true;
      return toAdd - current;
    }
    cell.capped = true;
    return 0;
  }
  if (toAdd < 0) {
    if ((current < 0 || (current === 0 && !cap.zeroSeen)) && toAdd < current) {
      hold(cap, toAdd, cell);
      return toAdd - current;
    }
    cell.capped = true;
    return 0;
  }
  cap.zeroSeen = true;
  if (current < 0) {
    hold(cap, 0, undefined);
    return -current;
  }
  return 0;
}
