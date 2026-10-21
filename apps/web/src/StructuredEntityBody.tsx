import { useMemo, type ReactNode } from "react";

import { isUserFacingSpecific, type ContentEntity } from "@4ecb/content-domain";

import { abilityAbbreviation } from "./ability-abbreviations";
import {
  classKeyAbilities,
  classTableMetadata,
  contentSpecificValue,
} from "./builder-ui";
import { Prose } from "./Prose";

/**
 * Race, class and background cards lead with their rules (the published
 * "Racial Traits"/"Class Traits" box: a compact stat grid, then granted traits
 * or features listed inside the card), with the lore after them. A trait
 * package (a hexblade pact, a cavalier virtue…) lists the class features it
 * swaps in. Fields this layout doesn't place still show, under "More".
 */
export type StructuredEntityKind =
  "race" | "class" | "background" | "trait package";

export function structuredEntityKind(
  entity: ContentEntity,
): StructuredEntityKind | undefined {
  const type = entity.type.trim().toLocaleLowerCase();
  if (type === "race") return "race";
  if (type === "class" || type === "hybrid class") return "class";
  if (type === "background") return "background";
  if (type === "trait package") return "trait package";
  return undefined;
}

/** A titled section of the card; the lore sections come last, so the rules
 * read first and the reader scrolls on for the rest. */
function CardSection({
  title,
  children,
}: {
  readonly title: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <section className="entity-card-section">
      <h5>{title}</h5>
      {children}
    </section>
  );
}

interface StatRow {
  readonly label: string;
  readonly value: string | undefined;
}

function StatGrid({ rows }: { readonly rows: readonly StatRow[] }) {
  const shown = rows.filter(
    (row): row is { label: string; value: string } =>
      row.value !== undefined && row.value.trim() !== "",
  );
  if (shown.length === 0) return null;
  return (
    <dl className="entity-stat-grid">
      {shown.map((row) => (
        <div key={row.label}>
          <dt>{row.label}</dt>
          <dd>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

interface Trait {
  readonly id: string;
  readonly name: string;
  readonly text: string;
}

function TraitList({
  heading,
  traits,
}: {
  readonly heading: string;
  readonly traits: readonly Trait[];
}) {
  if (traits.length === 0) return null;
  return (
    <section className="entity-trait-section">
      <h5>{heading}</h5>
      <ul className="entity-trait-list">
        {traits.map((trait) => (
          <li key={trait.id}>
            <strong>{trait.name}</strong>
            <Prose value={trait.text} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function traitOf(entity: ContentEntity): Trait {
  return {
    id: entity.id,
    name: entity.name,
    text:
      entity.description.trim() ||
      contentSpecificValue(entity, "Short Description") ||
      "",
  };
}

/** Lore fields shown as labelled paragraphs inside a folded section. */
function LoreFields({
  entity,
  names,
}: {
  readonly entity: ContentEntity;
  readonly names: readonly (readonly [field: string, label: string])[];
}) {
  return (
    <>
      {entity.description.trim() === "" ? null : (
        <Prose value={entity.description} />
      )}
      {names.map(([field, label]) => {
        const value = contentSpecificValue(entity, field);
        return value === undefined ? null : (
          <div className="entity-lore-field" key={field}>
            <h6>{label}</h6>
            <Prose value={value} />
          </div>
        );
      })}
    </>
  );
}

const normalized = (name: string) => name.trim().toLocaleLowerCase();

/** User-facing fields the layout didn't place, so nothing authored is lost. */
function MoreFields({
  entity,
  placed,
}: {
  readonly entity: ContentEntity;
  readonly placed: readonly string[];
}) {
  const placedNames = new Set(
    [...placed, "Short Description", "Source"].map(normalized),
  );
  const rest = entity.specifics.filter(
    (field) =>
      isUserFacingSpecific(field) &&
      field.value.trim() !== "" &&
      !placedNames.has(normalized(field.name)),
  );
  if (rest.length === 0) return null;
  return (
    <CardSection title="More">
      {rest.map((field) => (
        <div
          className="entity-lore-field"
          key={`${field.ordinal}-${field.name}`}
        >
          <h6>{field.name}</h6>
          <Prose value={field.value} />
        </div>
      ))}
    </CardSection>
  );
}

const RACE_STATS = [
  ["Ability Scores", "Ability scores"],
  ["Size", "Size"],
  ["Speed", "Speed"],
  ["Vision", "Vision"],
  ["Languages", "Languages"],
  ["Skill Bonuses", "Skill bonuses"],
  ["Average Height", "Height"],
  ["Average Weight", "Weight"],
] as const;
const RACE_LORE = [
  ["Characteristics", "Characteristics"],
  ["Physical Qualities", "Physical qualities"],
  ["Playing", "Playing"],
  ["Male Names", "Male names"],
  ["Female Names", "Female names"],
] as const;

function RaceBody({
  entity,
  references,
}: {
  readonly entity: ContentEntity;
  readonly references: ReadonlyMap<string, ContentEntity>;
}) {
  const traits = (contentSpecificValue(entity, "Racial Traits") ?? "")
    .split(",")
    .flatMap((id) => {
      const trait = references.get(normalized(id));
      return trait === undefined ? [] : [traitOf(trait)];
    });
  return (
    <>
      <StatGrid
        rows={RACE_STATS.map(([field, label]) => ({
          label,
          value: contentSpecificValue(entity, field),
        }))}
      />
      <TraitList heading="Racial traits" traits={traits} />
      <CardSection title={`About ${entity.name}`}>
        <LoreFields entity={entity} names={RACE_LORE} />
      </CardSection>
      <MoreFields
        entity={entity}
        placed={[
          ...RACE_STATS.map(([field]) => field),
          ...RACE_LORE.map(([field]) => field),
          "Racial Traits",
        ]}
      />
    </>
  );
}

const CLASS_STATS = [
  ["Hit Points at 1st Level", "HP at 1st"],
  ["Hit Points per Level Gained", "HP per level"],
  ["Healing Surges", "Healing surges"],
  ["Bonus to Defense", "Defenses"],
] as const;
const CLASS_PROFICIENCIES = [
  ["Armor Proficiencies", "Armor"],
  ["Weapon Proficiencies", "Weapons"],
  ["Implements", "Implements"],
  ["Trained Skills", "Trained"],
  ["Class Skills", "Class skills"],
  ["Build Options", "Builds"],
  ["Secondary Abilities", "Secondary"],
  ["Hybrid Talent Options", "Hybrid talents"],
] as const;
const CLASS_LORE = [
  ["Creating", "Creating"],
  ["Class Features", "Class features"],
  ["Powers", "Powers"],
  ["Implement", "Implement"],
  ["Supplemental", "Supplemental"],
] as const;

/**
 * Class features listed in `_PARSED_CLASS_FEATURE`: by id (trait packages) or
 * by name (classes: Channel Divinity, Lay on Hands…), preferring a named
 * record that belongs to the owner over a same-named one.
 */
function namedClassFeatures(
  owner: ContentEntity,
  references: ReadonlyMap<string, ContentEntity>,
): readonly Trait[] {
  const keys = (contentSpecificValue(owner, "_PARSED_CLASS_FEATURE") ?? "")
    .split(",")
    .map(normalized)
    .filter(Boolean);
  if (keys.length === 0) return [];
  const isFeature = (candidate: ContentEntity) =>
    normalized(candidate.type) === "class feature";
  const candidates = [...new Set(references.values())].filter(
    (candidate) =>
      isFeature(candidate) && keys.includes(normalized(candidate.name)),
  );
  const seen = new Set<string>();
  return keys.flatMap((key) => {
    const byId = references.get(key);
    const named = candidates.filter(
      (candidate) => normalized(candidate.name) === key,
    );
    const feature =
      byId !== undefined && isFeature(byId) && normalized(byId.id) === key
        ? byId
        : (named.find(
            (candidate) =>
              normalized(contentSpecificValue(candidate, "Class") ?? "") ===
              normalized(owner.id),
          ) ?? named[0]);
    if (feature === undefined || seen.has(feature.id)) return [];
    seen.add(feature.id);
    return [traitOf(feature)];
  });
}

function ClassBody({
  entity,
  references,
}: {
  readonly entity: ContentEntity;
  readonly references: ReadonlyMap<string, ContentEntity>;
}) {
  const metadata = classTableMetadata(entity);
  const summary = [
    metadata.role.label,
    metadata.powerSource.label,
    classKeyAbilities(entity).map(abilityAbbreviation).join(" "),
  ]
    .filter(Boolean)
    .join(" · ");
  const features = useMemo(
    () => namedClassFeatures(entity, references),
    [entity, references],
  );
  return (
    <>
      {summary === "" ? null : <p className="entity-card-summary">{summary}</p>}
      <StatGrid
        rows={CLASS_STATS.map(([field, label]) => ({
          label,
          value: contentSpecificValue(entity, field),
        }))}
      />
      <StatGrid
        rows={CLASS_PROFICIENCIES.map(([field, label]) => ({
          label,
          value: contentSpecificValue(entity, field),
        }))}
      />
      <TraitList heading="Class features" traits={features} />
      <CardSection title={`About ${entity.name}`}>
        <LoreFields entity={entity} names={CLASS_LORE} />
      </CardSection>
      <MoreFields
        entity={entity}
        placed={[
          ...CLASS_STATS.map(([field]) => field),
          ...CLASS_PROFICIENCIES.map(([field]) => field),
          ...CLASS_LORE.map(([field]) => field),
          "Role",
          "Power Source",
          "Key Abilities",
          "Power Name",
          "Trait Package",
        ]}
      />
    </>
  );
}

function TraitPackageBody({
  entity,
  references,
}: {
  readonly entity: ContentEntity;
  readonly references: ReadonlyMap<string, ContentEntity>;
}) {
  const features = useMemo(
    () => namedClassFeatures(entity, references),
    [entity, references],
  );
  return (
    <>
      {entity.description.trim() === "" ? null : (
        <Prose value={entity.description} />
      )}
      <TraitList heading="Benefits" traits={features} />
      <MoreFields entity={entity} placed={[]} />
    </>
  );
}

function BackgroundBody({ entity }: { readonly entity: ContentEntity }) {
  const benefit = contentSpecificValue(entity, "Benefit");
  const knowledge = contentSpecificValue(entity, "Common Knowledge");
  return (
    <>
      {entity.description.trim() === "" ? null : (
        <Prose value={entity.description} />
      )}
      {benefit === undefined ? null : (
        <section className="entity-benefit">
          <h5>Benefit</h5>
          <Prose value={benefit} />
        </section>
      )}
      <StatGrid
        rows={[
          {
            label: "Skills",
            value: contentSpecificValue(entity, "Associated Skills"),
          },
          {
            label: "Languages",
            value: contentSpecificValue(entity, "Associated Languages"),
          },
        ]}
      />
      {knowledge === undefined ? null : (
        <CardSection title="Common knowledge">
          <Prose value={knowledge} />
        </CardSection>
      )}
      <MoreFields
        entity={entity}
        placed={[
          "Benefit",
          "Common Knowledge",
          "Associated Skills",
          "Associated Languages",
          "Campaign",
          "type",
        ]}
      />
    </>
  );
}

/** Body of a race, class, background or trait package card (see
 * `structuredEntityKind`). */
export function StructuredEntityBody({
  entity,
  kind,
  references,
  hideFlavortext,
}: {
  readonly entity: ContentEntity;
  readonly kind: StructuredEntityKind;
  readonly references: ReadonlyMap<string, ContentEntity>;
  readonly hideFlavortext: boolean;
}) {
  const shortDescription = contentSpecificValue(entity, "Short Description");
  // A background's campaign and kind ("Forgotten Realms · Campaign").
  const context =
    kind === "background"
      ? [
          contentSpecificValue(entity, "Campaign"),
          contentSpecificValue(entity, "type"),
        ]
          .filter(Boolean)
          .join(" · ")
      : "";
  return (
    <div className="structured-entity-body">
      {entity.flavor === undefined || hideFlavortext ? null : (
        <p className="candidate-flavor entity-card-flavor">{entity.flavor}</p>
      )}
      {context === "" ? null : <p className="entity-card-context">{context}</p>}
      {shortDescription === undefined ? null : (
        <p className="entity-card-lede">{shortDescription}</p>
      )}
      {entity.printPrerequisites === undefined ? null : (
        <section>
          <h5>Prerequisites</h5>
          <Prose value={entity.printPrerequisites} />
        </section>
      )}
      {kind === "race" ? (
        <RaceBody entity={entity} references={references} />
      ) : kind === "class" ? (
        <ClassBody entity={entity} references={references} />
      ) : kind === "trait package" ? (
        <TraitPackageBody entity={entity} references={references} />
      ) : (
        <BackgroundBody entity={entity} />
      )}
    </div>
  );
}
