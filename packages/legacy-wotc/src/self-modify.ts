import {
  getAttribute,
  legacyListContains,
  type RuleStatement,
  type SpecificField,
} from "@4ecb/content-domain";

/** The rule attributes native SharedStatAdd.HasConditions tests. */
const CONDITION_ATTRIBUTES = ["requires", "wearing", "not-wearing"] as const;

/**
 * Whether a `modify name="this"` statement is one native ParseOneRule
 * applies to the record itself while loading the database: no `type`, and
 * none of the HasConditions attributes (an empty one counts as absent).
 * Native ProcessModify skips exactly these at run time; a "this" modify with
 * conditions is applied there instead, to the providing record.
 */
export function isLoadTimeSelfModify(statement: RuleStatement): boolean {
  if (statement.name.toLocaleLowerCase() !== "modify") return false;
  const target = getAttribute(statement.attributes, "name");
  if (target?.toLocaleLowerCase() !== "this") return false;
  if (getAttribute(statement.attributes, "type") !== undefined) return false;
  return CONDITION_ATTRIBUTES.every(
    (name) => (getAttribute(statement.attributes, name) ?? "") === "",
  );
}

export interface SelfModifiedRecord {
  readonly specifics: SpecificField[];
  readonly prerequisites: string | undefined;
}

/**
 * Native ParseOneRule's load-time shortcut (D20RulesEngine ParseOneRule, the
 * `modify` branch after the mandatory-attribute check): an unconditional
 * `modify name="this"` writes its `value` into the record's own field, for
 * every character and the compendium alike. "Prereqs" replaces the record's
 * prerequisites; any other field goes through UpdateSpecificField, which
 * replaces the first same-named field or appends a new one. Only `value` is
 * written (a list-addition or die-increase "this" modify does nothing here).
 *
 * Deliberate D091 difference: native replaces the field with each value in
 * turn, so a record whose authored field already lists several values and
 * then repeats each in its own modify (Faervian's `_ImplementForPower`, five
 * power sources) keeps only the last. The item text ("used as an implement
 * by any class that has powers with the Implement keyword") wants them all,
 * so a value the authored field already contains as a list entry
 * (ListContains) leaves the field alone. Every other official this-modify
 * either equals its field or fills a missing one, so this changes nothing
 * else.
 */
export function applyLoadTimeSelfModifies(
  specifics: readonly SpecificField[],
  prerequisites: string | undefined,
  rules: readonly RuleStatement[],
): SelfModifiedRecord {
  const fields = [...specifics];
  let prereqs = prerequisites;
  for (const statement of rules) {
    if (!isLoadTimeSelfModify(statement)) continue;
    const field = getAttribute(statement.attributes, "Field");
    const value = getAttribute(statement.attributes, "value");
    if (field === undefined || value === undefined) continue;
    if (field.toLocaleLowerCase() === "prereqs") {
      prereqs = value === "" ? undefined : value;
      continue;
    }
    const index = fields.findIndex(
      (specific) =>
        specific.name.toLocaleLowerCase() === field.toLocaleLowerCase(),
    );
    const existing = index < 0 ? undefined : fields[index];
    if (existing === undefined) {
      fields.push({
        name: field,
        value,
        extraAttributes: [],
        ordinal: Math.max(-1, ...fields.map((s) => s.ordinal)) + 1,
      });
    } else if (
      existing.value !== value &&
      (existing.value.trim().toLocaleLowerCase() === "any" ||
        !legacyListContains(existing.value, value))
    ) {
      fields[index] = { ...existing, value };
    }
  }
  return { specifics: fields, prerequisites: prereqs };
}
