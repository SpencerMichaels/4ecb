import { isUserFacingSpecific, type ContentEntity } from "@4ecb/content-domain";
import type { LegacyRuleElement } from "@4ecb/character-domain";
import type { CharacterSheetModel, SheetValue } from "./index";
import type { EvaluatedStat } from "@4ecb/rules-engine";
import { defensiveStatTraits, type DefensiveTrait } from "./defensive-traits";
import { equippedItemPropertyReminders } from "./item-reminders";
import { overviewSenses } from "./senses";

export interface OverviewFeature {
  readonly id: string;
  readonly name: string;
  readonly group: string;
  readonly summary: string;
  readonly description: string;
  readonly fields: readonly SheetValue[];
  readonly source: string;
  readonly fullTextAvailable: boolean;
  /** A display heuristic, not a claim that every other benefit is calculated. */
  readonly playReminder?: boolean;
  readonly accessOnly?: boolean;
}
export interface OverviewInventory {
  readonly name: string;
  readonly quantity: number;
  readonly equipped: number;
  readonly slots: readonly string[];
  readonly fields: readonly SheetValue[];
}
export interface OverviewReminder extends SheetValue {
  readonly category?:
    | "Class features"
    | "Racial features"
    | "Feats"
    | "Item properties"
    | "Other reminders";
}
const reminderCategories: Readonly<
  Record<string, NonNullable<OverviewReminder["category"]>>
> = {
  "Class Feature": "Class features",
  "Racial Trait": "Racial features",
  Feat: "Feats",
};
const reminderCategory = (group: string) =>
  reminderCategories[group] ?? "Other reminders";
export interface SheetOverview {
  readonly level: number;
  readonly abilities: readonly {
    readonly name: string;
    readonly score: string;
    readonly modifier: string;
    readonly check: string;
  }[];
  readonly skills: readonly {
    readonly name: string;
    readonly ability: string;
    readonly bonus: string;
    readonly trained: boolean | undefined;
  }[];
  readonly saves: string;
  readonly defensiveTraits: readonly DefensiveTrait[];
  readonly bloodied: string;
  readonly vision: string;
  readonly features: readonly OverviewFeature[];
  readonly inventory: readonly OverviewInventory[];
  readonly reminders: readonly OverviewReminder[];
}
const key = (s: string) => s.trim().toLowerCase();
const signed = (n: number) => `${n >= 0 ? "+" : ""}${n}`;
function hasPlayReminder(summary: string, description: string): boolean {
  const text = `${summary} ${description}`;
  // Ally-facing benefits remain manual even when their prerequisite is a loadout.
  if (/\b(?:ally|allies)\b/i.test(text)) return true;
  const withoutLoadoutConditions = text.replace(
    /\b(?:while|when|if)\s+(?:you\s+(?:are\s+)?)?(?:wearing|wielding|equipped)\b[^.;]*/gi,
    "",
  );
  // Require an in-play condition, choice, or changed action. Passive proficiency,
  // training, numeric bonuses and power grants alone are not useful reminders.
  return /\b(?:when|whenever|if|unless|trigger|bloodied|combat advantage|opportunity|reroll|draw|shift(?:s|ing)?|push|pull|slide|teleport|spend|forgo|give up|once per)\b/i.test(
    withoutLoadoutConditions,
  );
}
function accessOnly(
  entity: ContentEntity | undefined,
  benefit: string,
): boolean {
  const selectorOnly = Boolean(
    entity?.rules.length &&
    entity.rules.every((rule) => /^(?:grant|select)$/i.test(rule.name)),
  );
  // Access and shared-use prose is not an independent benefit. Do not mistake
  // "once per encounter" for an effect when all native rules grant/select powers.
  // Keep mixed benefits, including manual effects absent from native statements.
  const independentBenefit =
    /[+-]\s*\d|\b(?:bonus(?!\s+(?:feat|power)\b)|penalty|damage|hit points|healing surge|saving throws?|attack rolls?|defenses?|AC|speed|shift(?:s|ing)?|push|pull|slide|teleport|reroll|draw|sheathe|resistan(?:ce|t)|immunity|combat advantage|opportunity attacks?)\b|\b(?:ally|allies|target)\b[^.!?]*\b(?:gain|gains|move|moves|act|acts|take|takes|make|makes)\b/i.test(
      benefit,
    );
  if (selectorOnly && !independentBenefit) return true;
  // A grant plus an independent conditional/numeric benefit is not a wrapper.
  if (
    /\b(?:when|whenever|if|while|unless|until|penalty|bonus(?!\s+(?:feat|power)\b))\b|[+-]\s*\d/i.test(
      benefit,
    )
  )
    return false;
  const statements = benefit
    .split(/(?:[.!?]\s+|\n+)/)
    .map((s) => s.trim())
    .filter(Boolean);
  const explicitGrant =
    /\b(?:gain|learn|granted|have|use)\b[^.!?]*\b(?:power|ability|feature)\b/i.test(
      benefit,
    );
  return (
    (selectorOnly || explicitGrant) &&
    statements.length > 0 &&
    statements.every((statement) =>
      /^(?:(?:once per (?:turn|round|encounter|day)|at will)[,:]?\s*)?(?:choose|select|(?:you\s+)?(?:gain|learn|are granted|have)|you(?: (?:can|may|must))? (?:choose|select|use))\b/i.test(
        statement,
      ),
    )
  );
}
const skillAbilities: Readonly<Record<string, string>> = {
  Acrobatics: "DEX",
  Arcana: "INT",
  Athletics: "STR",
  Bluff: "CHA",
  Diplomacy: "CHA",
  Dungeoneering: "WIS",
  Endurance: "CON",
  Heal: "WIS",
  History: "INT",
  Insight: "WIS",
  Intimidate: "CHA",
  Nature: "WIS",
  Perception: "WIS",
  Religion: "INT",
  Stealth: "DEX",
  Streetwise: "CHA",
  Thievery: "DEX",
};
export function withSheetOverview(
  model: CharacterSheetModel,
  input: {
    level: number;
    stats: Readonly<Record<string, string>>;
    evaluatedStats?: Readonly<Record<string, EvaluatedStat>>;
    selections: readonly LegacyRuleElement[];
    content: readonly ContentEntity[];
    inventory: readonly OverviewInventory[];
  },
): CharacterSheetModel {
  const stats = new Map(
    Object.entries(input.stats).map(([name, value]) => [key(name), value]),
  );
  const stat = (...names: string[]) =>
    names
      .map((name) => stats.get(key(name)))
      .find((value) => value !== undefined && value.trim() !== "");
  const number = (s: string | undefined) =>
    s !== undefined && /^[-+]?\d+(?:\.\d+)?$/.test(s.trim())
      ? Number(s)
      : undefined;
  const definitions = new Map(
    input.content.map((entity) => [key(entity.id), entity]),
  );
  const features: OverviewFeature[] = [];
  const seen = new Set<string>();
  for (const group of model.features)
    for (const entry of group.entries) {
      if (group.group === "Language") continue;
      const selected = input.selections.filter(
        (rule) =>
          key(rule.type) === key(group.group) &&
          key(rule.name) === key(entry.label),
      );
      const candidates = selected.flatMap((rule) =>
        rule.id
          ? [definitions.get(key(rule.id))].filter(
              (e): e is ContentEntity => e !== undefined,
            )
          : [],
      );
      const entity = candidates[0];
      const id = entity?.id ?? `${group.group}:${entry.label}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const summary =
        entity?.specifics.find(
          (field) => key(field.name) === "short description",
        )?.value || entry.value;
      const description =
        entity?.description.trim() ||
        entity?.specifics
          .find((field) => key(field.name) === "full text")
          ?.value.trim() ||
        "";
      const benefit =
        entity?.specifics
          .find((field) => key(field.name) === "benefit")
          ?.value.trim() ||
        description.split(/\bBenefit:\s*/i).at(-1) ||
        description;
      const fields =
        entity?.specifics
          .filter(
            (field) =>
              isUserFacingSpecific(field) &&
              field.value.trim() &&
              !/^(?:short description|full text|level|type|class|power|powers|associated powers|associated power info|tier|source)$/i.test(
                field.name.trim(),
              ) &&
              field.value.trim() !== description,
          )
          .map((field) => ({ label: field.name.trim(), value: field.value })) ??
        [];
      if (
        entity?.prerequisites?.trim() &&
        !fields.some((field) => /^prerequisites?$/i.test(field.label))
      )
        fields.unshift({ label: "Prerequisite", value: entity.prerequisites });
      features.push({
        id,
        name: entry.label,
        group: group.group,
        summary,
        description: description || summary,
        fields,
        source: entity?.source ?? "",
        fullTextAvailable: Boolean(description || fields.length),
        playReminder:
          !accessOnly(entity, benefit || summary) &&
          hasPlayReminder(summary, benefit),
        accessOnly: accessOnly(entity, benefit || summary),
      });
    }
  const defensiveTraits = defensiveStatTraits(
    input.stats,
    input.evaluatedStats,
  );
  // Preserve whole authored clauses rather than reducing prose immunities to an
  // invented numeric stat or dropping conditions from the preceding sentence.
  const selfDefense =
    /\byou (?:are|become) immune\b|\byou (?:have|gain) (?:immunity|vulnerability)\b/i;
  for (const feature of features) {
    if (selfDefense.test(feature.description))
      defensiveTraits.push({
        label: feature.name,
        value: feature.description,
        source: feature.name,
        group: /immune|immunity/i.test(feature.description)
          ? "Immunities"
          : "Vulnerabilities",
      });
    for (const field of feature.fields)
      if (
        /^(?:immunities|immunity|resistances|vulnerabilities)$/i.test(
          field.label,
        )
      )
        defensiveTraits.push({
          ...field,
          source: feature.name,
          group: field.label,
        });
  }
  for (const item of input.inventory.filter((item) => item.equipped > 0))
    for (const field of item.fields)
      if (
        /^(?:immunities|immunity|resistances|vulnerabilities)$/i.test(
          field.label,
        ) ||
        (/^property$/i.test(field.label) && selfDefense.test(field.value))
      )
        defensiveTraits.push({
          label: `${item.name} · ${field.label}`,
          value: field.value,
          source: item.name,
          group: /^property$/i.test(field.label)
            ? /immune|immunity/i.test(field.value)
              ? "Immunities"
              : "Vulnerabilities"
            : field.label,
        });
  const reminders: OverviewReminder[] = [];
  const reminderByFeature = new Map<string, number>();
  const reminderKeys = new Set<string>();
  const addReminder = (
    label: string,
    value: string,
    category: OverviewReminder["category"] = "Other reminders",
  ) => {
    const identity = `${label}:${value}`;
    if (!value.trim() || reminderKeys.has(identity)) return;
    reminderKeys.add(identity);
    reminders.push({ label, value, category });
  };
  for (const feature of features)
    if (
      ["Feat", "Class Feature", "Racial Trait"].includes(feature.group) &&
      feature.playReminder
    ) {
      addReminder(
        feature.name,
        feature.summary || feature.description,
        reminderCategory(feature.group),
      );
      const index = reminders.findIndex(
        (reminder) =>
          reminder.label === feature.name &&
          reminder.value === (feature.summary || feature.description),
      );
      if (index >= 0) reminderByFeature.set(feature.id, index);
    }
  for (const reminder of equippedItemPropertyReminders(
    input.inventory,
    input.content,
  ))
    addReminder(reminder.label, reminder.value, "Item properties");
  const seenEffects = new Set<string>();
  for (const power of model.powers)
    for (const effect of power.additionalEffects ?? []) {
      // Legacy caches repeat a source suffix on every affected power. Resolve
      // only against known selected features, never an arbitrary parenthesis.
      const namedFeatures = features.filter(
        (feature) =>
          key(effect.provider ?? "") === key(feature.name) ||
          [` - ${feature.name}`, ` (${feature.name})`].some((suffix) =>
            key(effect.text).replace(/[.]$/, "").endsWith(key(suffix)),
          ),
      );
      const feature =
        features.find((feature) => effect.provenanceId === feature.id) ??
        (namedFeatures.length === 1 ? namedFeatures[0] : undefined);
      if (feature && !feature.accessOnly) {
        const existing = reminderByFeature.get(feature.id);
        const canonical = {
          label: feature.name,
          value: feature.summary || feature.description,
          category: reminderCategory(feature.group),
        };
        if (existing !== undefined) reminders[existing] = canonical;
        else {
          addReminder(canonical.label, canonical.value, canonical.category);
          const index = reminders.findIndex(
            (reminder) =>
              reminder.label === canonical.label &&
              reminder.value === canonical.value,
          );
          if (index >= 0) reminderByFeature.set(feature.id, index);
        }
        continue;
      }
      const identity = `${effect.provenanceId ?? key(effect.provider ?? feature?.name ?? "")}:${key(effect.text)}`;
      if (seenEffects.has(identity)) continue;
      seenEffects.add(identity);
      // An access-only feature can still be the known source of an evaluated
      // conditional effect. Keep that effect's text, but do not lose its category
      // merely because the feature's own description is only a power grant.
      addReminder(
        effect.provider ?? feature?.name ?? power.name,
        effect.text,
        feature ? reminderCategory(feature.group) : "Other reminders",
      );
    }
  reminders.sort(
    (a, b) =>
      Number(/\ball(?:y|ies)\b/i.test(b.value)) -
      Number(/\ball(?:y|ies)\b/i.test(a.value)),
  );
  const hp = number(stat("Hit Points"));
  const saves = stat("Saving Throws", "Saving Throw Bonus", "Saving Throw");
  const savesNumber = saves === undefined ? 0 : number(saves);
  // The native stat is an additive bonus, not the displayed surge total
  // (legacy PanelModelHitPoints.Update: HP / 4 + Healing Surge Value).
  const surgeBonus = stat("Healing Surge Value");
  const surgeNumber = surgeBonus === undefined ? 0 : number(surgeBonus);
  const surgeValue =
    hp === undefined || surgeNumber === undefined
      ? "—"
      : String(Math.floor(hp / 4) + surgeNumber);
  return {
    ...model,
    resources: [
      ...model.resources.filter(
        ({ label }) => key(label) !== "healing surge value",
      ),
      { label: "Healing Surge Value", value: surgeValue },
    ],
    overview: {
      level: input.level,
      defensiveTraits: defensiveTraits.filter(
        (entry, index, entries) =>
          entries.findIndex(
            (other) =>
              other.label === entry.label &&
              other.value === entry.value &&
              other.source === entry.source,
          ) === index,
      ),
      abilities: model.abilities.map(({ label, value }) => {
        const score = number(value);
        const mod =
          number(stat(`${label} modifier`)) ??
          (score === undefined ? undefined : Math.floor((score - 10) / 2));
        return {
          name: label,
          score: value,
          modifier: mod === undefined ? "—" : signed(mod),
          check:
            mod === undefined ? "—" : signed(mod + Math.floor(input.level / 2)),
        };
      }),
      skills: model.skills.map(({ label, value }) => {
        const trained = number(stat(`${label} Trained`));
        return {
          name: label,
          ability: skillAbilities[label] ?? "",
          bonus: number(value) === undefined ? value : signed(Number(value)),
          trained:
            trained !== undefined
              ? trained > 0
              : input.selections.some(
                    (rule) =>
                      key(rule.type) === "skill training" &&
                      key(rule.name) === key(label),
                  )
                ? true
                : undefined,
        };
      }),
      saves: savesNumber === undefined ? (saves ?? "—") : signed(savesNumber),
      bloodied:
        stat("Bloodied Value", "Bloodied") ??
        (hp === undefined ? "—" : String(Math.floor(hp / 2))),
      vision: overviewSenses(input.selections, input.content, input.stats),
      features,
      inventory: input.inventory.filter((item) => item.quantity > 0),
      reminders,
    },
  };
}
