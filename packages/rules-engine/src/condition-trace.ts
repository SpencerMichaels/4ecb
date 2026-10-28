import type { EquipmentState } from "./equipment";
import type { ExpressionContext } from "./expressions";

/**
 * The rule-language conditions the evaluator decides, as the opt-in
 * condition trace reports them (`pnpm audit:selectors`):
 *
 * - `selector`: a `wearing`/`not-wearing` operand (native HasLoot), the
 *   predicate's own result (not negated for `not-wearing`).
 * - `requires`: a `requires` expression (native MeetsRequires).
 * - `zero` / `non-zero`: whether a zero- or non-zero-gated statadd applied.
 * - `statmin`: whether a `statmin` threshold was met.
 * - `statlink`: whether a stat a statadd links to has any statadd.
 * - `select-category`: whether a choice candidate met the select's
 *   category filter; the operand is `<type>|<category>`.
 */
export type ConditionKind =
  | "selector"
  | "requires"
  | "zero"
  | "non-zero"
  | "statmin"
  | "statlink"
  | "select-category";

export interface ConditionTraceSink {
  condition?(kind: ConditionKind, operand: string, result: boolean): void;
  /** The final equipment state and expression context of one evaluation,
   *  so an audit can evaluate every operand against it. */
  evaluationState?(state: {
    readonly equipment: EquipmentState;
    readonly expressions: ExpressionContext;
  }): void;
}

let sink: ConditionTraceSink | undefined;

/** Installs (or with undefined removes) the process-wide condition trace.
 *  Evaluation never reads the trace; it is for private audits only. */
export function setConditionTrace(next: ConditionTraceSink | undefined): void {
  sink = next;
}

export function traceCondition(
  kind: ConditionKind,
  operand: string,
  result: boolean,
): boolean {
  sink?.condition?.(kind, operand, result);
  return result;
}

export function traceEvaluationState(
  equipment: EquipmentState,
  expressions: ExpressionContext,
): void {
  sink?.evaluationState?.({ equipment, expressions });
}

export function conditionTraceActive(): boolean {
  return sink !== undefined;
}
