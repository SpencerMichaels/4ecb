import type { ContentEntity, RuleStatement } from "@4ecb/content-domain";
import type { LegacyRuleElement } from "@4ecb/character-domain";
import type { CharacterOccurrence } from "@4ecb/rules-engine";
import type { SheetCard } from "./index";

const key = (value: string) => value.trim().toLowerCase();
const field = (entity: ContentEntity, name: string) =>
  entity.specifics.find((f) => key(f.name) === key(name))?.value.trim() ?? "";
const attribute = (node: RuleStatement, name: string) =>
  node.attributes.find((a) => key(a.name) === key(name))?.value.trim() ?? "";
const ids = (value: string) =>
  value
    .split(/[,\s]+/)
    .filter(Boolean)
    .map(key);

export interface CorePowerReminder {
  readonly featureId: string;
  readonly featureName: string;
  readonly powerId: string;
  readonly label: string;
  readonly value: string;
}

/** Discover owned core powers through class grants, never through power names. */
export function corePowerReminders(input: {
  readonly selections: readonly LegacyRuleElement[];
  readonly content: readonly ContentEntity[];
  readonly powers: readonly SheetCard[];
  readonly occurrences?: readonly CharacterOccurrence[];
  readonly className?: string | undefined;
}): readonly CorePowerReminder[] {
  const byId = new Map(input.content.map((e) => [key(e.id), e]));
  const selected = new Set(
    input.selections.flatMap((s) => (s.id ? [key(s.id)] : [])),
  );
  const roots = input.selections
    .filter(
      (s) =>
        key(s.type) === "class" &&
        s.id &&
        (!input.className || key(s.name) === key(input.className)),
    )
    .map((s) => key(s.id!));
  const coreFeatures = new Set<string>();
  // Legacy fallback follows only explicit automatic grants through class-owned
  // containers/features, never feat, theme or ordinary power selections.
  const visited = new Set<string>();
  const visit = (id: string) => {
    if (visited.has(id)) return;
    visited.add(id);
    const entity = byId.get(id);
    if (
      !entity ||
      !["class", "grants", "class feature"].includes(key(entity.type))
    )
      return;
    if (key(entity.type) === "class feature") {
      if (!selected.has(id) || field(entity, "Level") !== "1") return;
      coreFeatures.add(id);
    }
    for (const rule of entity.rules) {
      if (key(rule.name) !== "grant") continue;
      const level = attribute(rule, "Level");
      if (level && (!/^\d+$/.test(level) || Number(level) > 1)) continue;
      const target = key(attribute(rule, "name"));
      if (target) visit(target);
    }
  };
  roots.forEach(visit);
  // Evaluated ancestry also covers active subclass choices/replacements. Require
  // level-one grant provenance; a multiclass feat must not masquerade as a class.
  if (input.occurrences) {
    coreFeatures.clear();
    const occurrences = new Map(input.occurrences.map((o) => [o.id, o]));
    for (const occurrence of input.occurrences) {
      const entity = byId.get(key(occurrence.definitionId));
      if (
        !entity ||
        key(entity.type) !== "class feature" ||
        occurrence.kind !== "grant" ||
        occurrence.acquiredLevel > 1 ||
        field(entity, "Level") !== "1" ||
        !selected.has(key(entity.id))
      )
        continue;
      const seen = new Set<string>();
      let parent = occurrence.parentId
        ? occurrences.get(occurrence.parentId)
        : undefined;
      while (parent && !seen.has(parent.id)) {
        seen.add(parent.id);
        const owner = byId.get(key(parent.definitionId));
        if (
          !owner ||
          !["class", "grants", "class feature", "build"].includes(
            key(owner.type),
          )
        )
          break;
        if (roots.includes(key(owner.id))) {
          coreFeatures.add(key(entity.id));
          break;
        }
        parent = parent.parentId ? occurrences.get(parent.parentId) : undefined;
      }
    }
  }
  return [...coreFeatures].flatMap((id) => {
    const feature = byId.get(id)!;
    const granted = new Set([
      ...ids(field(feature, "Powers")),
      ...ids(field(feature, "_DisplayPowers")),
      ...feature.rules
        .filter(
          (r) =>
            key(r.name) === "grant" && key(attribute(r, "type")) === "power",
        )
        .map((r) => key(attribute(r, "name"))),
    ]);
    return input.powers.flatMap((power) => {
      if (!power.id) return [];
      const definition = byId.get(key(power.id));
      if (
        !definition ||
        (!granted.has(key(power.id)) &&
          !ids(field(definition, "_ParentFeature")).includes(id))
      )
        return [];
      // Candidate discovery is structural; usefulness is deliberately narrower:
      // non-attack feature powers with ongoing target-dependent mechanics.
      if (
        (power.attack && !/\bUnknown\b/i.test(power.attack)) ||
        power.fields.some(
          (f) =>
            /^(?:(?:primary|secondary) )?attack$/i.test(f.label) &&
            f.value.trim(),
        )
      )
        return [];
      const effects = power.fields
        .filter((f) => /^effect$/i.test(f.label))
        .map((f) => f.value.trim())
        .filter(Boolean);
      const text = effects.join("\n\n");
      const persistent = (text.match(/[^.!?\n]+[.!?]?/g) ?? []).some(
        (sentence) =>
          /\b(?:until|lasts?|remains?|ends?)\b/i.test(sentence) &&
          !/^\s*you (?:are|become|take|can't|cannot)\b/i.test(sentence),
      );
      if (!/\b(?:target|enem(?:y|ies)|creature)\b/i.test(text) || !persistent)
        return [];
      const short =
        field(definition, "Short Description") ||
        field(feature, "Short Description");
      const usefulShort =
        /\b(?:target|enem(?:y|ies)|creature|quarry)\b/i.test(short) &&
        /\b(?:damage|mark|designate|roll|bonus|penalty)\b/i.test(short) &&
        !/\b(?:gain|use)\b.*\bpower\b/i.test(short);
      const mechanics = usefulShort
        ? short
        : power.fields
            .filter((f) =>
              /^(?:effect|special|requirement|trigger|sustain\b.*)$/i.test(
                f.label,
              ),
            )
            .map((f) => f.value.trim())
            .filter(Boolean)
            .join("\n\n");
      const extra = [
        ...new Set(
          input.powers
            .flatMap((p) => p.additionalEffects ?? [])
            .filter((effect) => !effect.cardOnly)
            .filter(
              (effect) =>
                key(effect.provider ?? "") === key(feature.name) ||
                key(effect.provenanceId ?? "") === id,
            )
            .map((effect) => effect.text)
            .filter((value) => !mechanics.includes(value)),
        ),
      ];
      return [
        {
          featureId: feature.id,
          featureName: feature.name,
          powerId: power.id,
          label: power.name,
          value: [mechanics, ...extra].join("\n\n"),
        },
      ];
    });
  });
}
