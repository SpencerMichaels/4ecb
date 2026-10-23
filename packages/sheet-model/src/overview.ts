import { isUserFacingSpecific, type ContentEntity } from "@4ecb/content-domain";
import type { LegacyRuleElement } from "@4ecb/character-domain";
import type { CharacterSheetModel, SheetValue } from "./index";
import {
  abilityModifier,
  bloodiedValue,
  halfLevel,
  healingSurgeValue,
  type CharacterOccurrence,
  type EvaluatedStat,
} from "@4ecb/rules-engine";
import { defensiveStatTraits, type DefensiveTrait } from "./defensive-traits";
import { equippedItemPropertyReminders } from "./item-reminders";
import { overviewSenses } from "./senses";
import { corePowerReminders } from "./core-power-reminders";
import { featureReferenceMetadata } from "./feature-reference";
import { featureChoiceText, type SheetFeatureChoice } from "./feature-choices";
import { featureRowTitle, soleClassName } from "./feature-titles";
import type { SheetDeityReference } from "./deity-reference";
import { godFragmentConstantBenefits } from "./god-fragment-card";

export interface OverviewFeature {
  readonly id: string;
  readonly name: string;
  /** The reference row's heading where it differs from the name: no
   *  "Level N" repeating its level tag, no sole class's name. */
  readonly title?: string;
  readonly group: string;
  readonly summary: string;
  readonly description: string;
  readonly fields: readonly SheetValue[];
  readonly source: string;
  readonly fullTextAvailable: boolean;
  readonly referenceGroup?: string;
  readonly level?: number;
  /** A display heuristic, not a claim that every other benefit is calculated. */
  readonly playReminder?: boolean;
  readonly accessOnly?: boolean;
  /** Choices made under the feature, shown after its name. */
  readonly choices?: readonly SheetFeatureChoice[];
  /** Its fields lead its body, before the description (a deity's domains). */
  readonly fieldsFirst?: boolean;
}

/** The deity's reference entry: "Domains: Love, Moon, Trickery", then its
 *  description. Page 1's identity table keeps just the name. */
function deityFeature(deity: SheetDeityReference): OverviewFeature {
  const domains = deity.domains.map(({ name }) => name.trim()).join(", ");
  return {
    id: deity.id,
    name: deity.name,
    group: "Deity",
    summary: deity.description,
    description: deity.description,
    fields: domains ? [{ label: "Domains", value: domains }] : [],
    source: deity.source,
    fullTextAvailable: true,
    playReminder: false,
    fieldsFirst: true,
  };
}
export interface OverviewInventory {
  readonly itemType?: string | undefined;
  readonly baseItemType?: string | undefined;
  /** Total weight of the listed quantity, not a per-copy weight. */
  readonly weight?: number | undefined;
  readonly name: string;
  readonly quantity: number;
  readonly equipped: number;
  readonly slots: readonly string[];
  readonly fields: readonly SheetValue[];
  /** Optional UI-provided classification, shared with the builder inventory. */
  readonly category?: string;
}
export interface OverviewReminder extends SheetValue {
  /** What was chosen under the reminder's feature ("Eladrin"). */
  readonly choice?: string;
  /** Distinct authored benefits; paragraphs inside one benefit stay together. */
  readonly elements?: readonly string[];
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
  /** Page-one candidates before expanded core-power reference descriptions. */
  readonly summaryReminders?: readonly OverviewReminder[];
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
    occurrences?: readonly CharacterOccurrence[];
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
  const referenceMetadata = featureReferenceMetadata(input);
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
              (field.value.trim() !== description ||
                (key(group.group) === "background" &&
                  key(field.name) === "benefit")),
          )
          .map((field) => ({ label: field.name.trim(), value: field.value })) ??
        [];
      if (
        entity?.prerequisites?.trim() &&
        !fields.some((field) => /^prerequisites?$/i.test(field.label))
      )
        fields.unshift({ label: "Prerequisite", value: entity.prerequisites });
      // A group's own choice row (Background benefit) has no entity; the
      // chosen benefit's text is its benefit.
      if (entity === undefined && entry.choices?.length && entry.value.trim())
        fields.push({ label: "Benefit", value: entry.value });
      // A chosen god fragment's constant benefit is the feature's benefit;
      // its ability is a power card of its own.
      for (const choice of entry.choices ?? []) {
        const chosen = definitions.get(key(choice.id));
        const constant =
          chosen === undefined
            ? undefined
            : godFragmentConstantBenefits(chosen);
        if (constant !== undefined)
          fields.push({ label: "Constant Benefits", value: constant });
      }
      features.push({
        id,
        name: entry.label,
        group: group.group,
        summary,
        description: description || summary,
        fields,
        source: entity?.source ?? "",
        fullTextAvailable: Boolean(description || fields.length),
        ...(entity ? referenceMetadata.get(key(entity.id)) : undefined),
        playReminder:
          !accessOnly(entity, benefit || summary) &&
          hasPlayReminder(summary, benefit),
        accessOnly: accessOnly(entity, benefit || summary),
        ...(entry.choices === undefined ? {} : { choices: entry.choices }),
      });
    }
  if (model.deity !== undefined) features.push(deityFeature(model.deity));
  // Rules Item powers are authored reference entities, not invokable actions.
  // Project their complete text beside features, using explicit origin metadata
  // before grant ancestry; never infer the category from a power/publication name.
  const rulesReferences: OverviewFeature[] = [];
  const originTypes = new Map([
    ["class", "Class Feature"],
    ["race", "Racial Trait"],
    ["theme", "Theme"],
    ["background", "Background"],
    ["paragon path", "Paragon Path"],
    ["epic destiny", "Epic Destiny"],
  ]);
  for (const power of model.powers) {
    const rules = power.fields.filter(
      (field) => key(field.label) === "rules item" && field.value.trim(),
    );
    if (!rules.length) continue;
    const id = power.id ?? `rules:${power.name}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const entity = power.id ? definitions.get(key(power.id)) : undefined;
    const originFields = [
      ...(entity?.specifics.map((field) => ({
        name: field.name,
        value: field.value,
      })) ?? []),
      ...power.fields.map((field) => ({
        name: field.label,
        value: field.value,
      })),
    ];
    const declared = originFields.flatMap((field) =>
      originTypes.has(key(field.name))
        ? field.value.split(/[,;|\s]+/).flatMap((token) => {
            const root = definitions.get(key(token));
            const group =
              root && key(root.name) !== "any class"
                ? originTypes.get(key(root.type))
                : undefined;
            return group ? [group] : [];
          })
        : [],
    )[0];
    const provenance = power.id
      ? referenceMetadata.get(key(power.id))
      : undefined;
    const group = declared ?? provenance?.referenceGroup ?? "Other features";
    const description = rules.map((field) => field.value).join("\n\n");
    rulesReferences.push({
      id,
      name: power.name,
      group: "Rules Item",
      referenceGroup: group,
      ...(provenance?.level === undefined ? {} : { level: provenance.level }),
      description,
      summary: description,
      fields: power.fields.filter(
        (field) =>
          field.value.trim() &&
          !/^(?:rules item|class|race|theme|background|paragon path|epic destiny|power type|power usage|display|level|attack type|target|range)$/i.test(
            field.label.trim(),
          ),
      ),
      source: power.source ?? entity?.source ?? "",
      fullTextAvailable: true,
      playReminder: false,
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
    elements?: readonly string[],
    choice?: string,
  ) => {
    const identity = `${label}:${value}`;
    if (!value.trim() || reminderKeys.has(identity)) return;
    reminderKeys.add(identity);
    reminders.push({
      label,
      value,
      category,
      ...(elements && elements.length > 1 ? { elements } : {}),
      ...(choice === undefined ? {} : { choice }),
    });
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
        undefined,
        featureChoiceText(feature.choices),
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
    addReminder(
      reminder.label,
      reminder.value,
      "Item properties",
      reminder.elements,
    );
  const seenEffects = new Set<string>();
  for (const power of model.powers)
    for (const effect of power.additionalEffects ?? []) {
      if (effect.cardOnly) continue;
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
        const choice = featureChoiceText(feature.choices);
        const canonical = {
          label: feature.name,
          value: feature.summary || feature.description,
          category: reminderCategory(feature.group),
          ...(choice === undefined ? {} : { choice }),
        };
        if (existing !== undefined) reminders[existing] = canonical;
        else {
          addReminder(
            canonical.label,
            canonical.value,
            canonical.category,
            undefined,
            choice,
          );
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
  const summaryReminders = [...reminders];
  const corePowers = corePowerReminders({
    ...input,
    powers: model.powers,
    className: model.identity.find((entry) => entry.label === "Class")?.value,
  });
  const powerLabels = new Set(corePowers.map((power) => key(power.label)));
  const replacedFeatures = new Set(
    corePowers
      .filter(
        (power) =>
          features.find((feature) => feature.id === power.featureId)
            ?.accessOnly || key(power.featureName) === key(power.label),
      )
      .map((power) => key(power.featureName)),
  );
  for (let index = reminders.length - 1; index >= 0; index--)
    if (
      reminders[index]!.category === "Class features" &&
      (powerLabels.has(key(reminders[index]!.label)) ||
        replacedFeatures.has(key(reminders[index]!.label)))
    )
      reminders.splice(index, 1);
  for (const power of corePowers)
    // The feature may have already inserted this label/text before consolidation.
    if (
      !reminders.some((r) => r.label === power.label && r.value === power.value)
    )
      reminders.push({
        label: power.label,
        value: power.value,
        category: "Class features",
      });
  reminders.sort(
    (a, b) =>
      Number(/\ball(?:y|ies)\b/i.test(b.value)) -
      Number(/\ball(?:y|ies)\b/i.test(a.value)),
  );
  summaryReminders.sort(
    (a, b) =>
      Number(/\ball(?:y|ies)\b/i.test(b.value)) -
      Number(/\ball(?:y|ies)\b/i.test(a.value)),
  );
  const soleClass = soleClassName(input.selections);
  const hp = number(stat("Hit Points"));
  const saves = stat("Saving Throws", "Saving Throw Bonus", "Saving Throw");
  const savesNumber = saves === undefined ? 0 : number(saves);
  const surgeBonus = stat("Healing Surge Value");
  const surgeNumber = surgeBonus === undefined ? 0 : number(surgeBonus);
  const surgeTotal =
    surgeNumber === undefined ? undefined : healingSurgeValue(hp, surgeNumber);
  const surgeValue = surgeTotal === undefined ? "—" : String(surgeTotal);
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
          (score === undefined ? undefined : abilityModifier(score));
        return {
          name: label,
          score: value,
          modifier: mod === undefined ? "—" : signed(mod),
          check: mod === undefined ? "—" : signed(mod + halfLevel(input.level)),
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
      bloodied: String(
        bloodiedValue(hp) ?? stat("Bloodied Value", "Bloodied") ?? "—",
      ),
      vision: overviewSenses(input.selections, input.content, input.stats),
      features: [...features, ...rulesReferences].map((feature) => {
        const title = featureRowTitle(feature.name, {
          level: feature.level,
          classFeature:
            (feature.referenceGroup ?? feature.group) === "Class Feature",
          soleClass,
        });
        return feature.level === undefined || title === feature.name
          ? feature
          : { ...feature, title };
      }),
      inventory: input.inventory.filter((item) => item.quantity > 0),
      reminders,
      ...(corePowers.length ? { summaryReminders } : {}),
    },
  };
}
