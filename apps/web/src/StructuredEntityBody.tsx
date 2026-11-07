import { useMemo, type ReactNode } from "react";

import { isUserFacingSpecific, type ContentEntity } from "@4ecb/content-domain";
import { entityCardFields } from "@4ecb/sheet-model";

import { contentSpecificValue } from "./builder-ui";
import { namedClassFeatures } from "./detail-stack";
import {
  CardFieldLines,
  EntityAliases,
  EntityPrerequisites,
} from "./EntityCard";
import { Prose } from "./Prose";

/**
 * Race, class and background cards lead with their rules (the published
 * "Racial Traits"/"Class Traits" box: a compact stat grid, then granted traits
 * or features listed inside the card), with the lore after them; a class's
 * long feature list comes after its lore instead. Fields this layout doesn't
 * place still show, under "More".
 */
export type StructuredEntityKind = "race" | "class" | "background";

export function structuredEntityKind(
  entity: ContentEntity,
): StructuredEntityKind | undefined {
  const type = entity.type.trim().toLocaleLowerCase();
  if (type === "race") return "race";
  if (type === "class" || type === "hybrid class") return "class";
  if (type === "background") return "background";
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

const CLASS_LORE = [
  ["Creating", "Creating"],
  ["Class Features", "Class features"],
  ["Powers", "Powers"],
  ["Implement", "Implement"],
  ["Supplemental", "Supplemental"],
] as const;

function ClassBody({
  entity,
  references,
}: {
  readonly entity: ContentEntity;
  readonly references: ReadonlyMap<string, ContentEntity>;
}) {
  const features = useMemo(
    () => namedClassFeatures(entity, references).map(traitOf),
    [entity, references],
  );
  // Role, source, hit points, surges and defenses are the card's
  // subheader (`EntitySubheader`); its body lines lead the body.
  const placement = entityCardFields(entity);
  return (
    <>
      <CardFieldLines fields={placement?.body ?? []} />
      {/* The lore before the long feature list, so it isn't buried. */}
      <CardSection title={`About ${entity.name}`}>
        <LoreFields entity={entity} names={CLASS_LORE} />
      </CardSection>
      <TraitList heading="Class features" traits={features} />
      <MoreFields
        entity={entity}
        placed={[
          ...(placement?.placed ?? []),
          ...CLASS_LORE.map(([field]) => field),
          "Trait Package",
        ]}
      />
    </>
  );
}

function BackgroundBody({ entity }: { readonly entity: ContentEntity }) {
  const benefit = contentSpecificValue(entity, "Benefit");
  const knowledge = contentSpecificValue(entity, "Common Knowledge");
  // Campaign · Type are the card's subheader (`EntitySubheader`); its
  // Skills and Languages lines lead the body, after the prerequisite.
  const placement = entityCardFields(entity);
  return (
    <>
      <CardFieldLines fields={placement?.body ?? []} />
      {entity.description.trim() === "" ? null : (
        <Prose value={entity.description} />
      )}
      {benefit === undefined ? null : (
        <section className="entity-benefit">
          <h5>Benefit</h5>
          <Prose value={benefit} />
        </section>
      )}
      {knowledge === undefined ? null : (
        <CardSection title="Common knowledge">
          <Prose value={knowledge} />
        </CardSection>
      )}
      <MoreFields
        entity={entity}
        placed={[...(placement?.placed ?? []), "Benefit", "Common Knowledge"]}
      />
    </>
  );
}

/** Body of a race, class or background card (see `structuredEntityKind`). */
export function StructuredEntityBody({
  entity,
  kind,
  references,
  hideFlavortext,
  prerequisiteMetThrough,
  prerequisiteLines,
}: {
  readonly entity: ContentEntity;
  readonly kind: StructuredEntityKind;
  readonly references: ReadonlyMap<string, ContentEntity>;
  readonly hideFlavortext: boolean;
  /** Names of what meets its prerequisite through a counts-as alternate. */
  readonly prerequisiteMetThrough?: readonly string[];
  /** The evaluation's `prerequisiteLines` (renamed records, D116). */
  readonly prerequisiteLines?: Readonly<Record<string, string>> | undefined;
}) {
  const shortDescription = contentSpecificValue(entity, "Short Description");
  // A class's role and power source are its subheader's "Role · Source",
  // so its lede is the short description alone.
  const description = shortDescription?.trim() ?? "";
  return (
    <div className="structured-entity-body">
      <EntityAliases entity={entity} />
      {entity.flavor === undefined || hideFlavortext ? null : (
        <p className="candidate-flavor entity-card-flavor">{entity.flavor}</p>
      )}
      {description === "" ? null : (
        <p className="entity-card-lede">{description}</p>
      )}
      <EntityPrerequisites
        entity={entity}
        renamedLines={prerequisiteLines}
        {...(prerequisiteMetThrough === undefined
          ? {}
          : { metThrough: prerequisiteMetThrough })}
      />
      {kind === "race" ? (
        <RaceBody entity={entity} references={references} />
      ) : kind === "class" ? (
        <ClassBody entity={entity} references={references} />
      ) : (
        <BackgroundBody entity={entity} />
      )}
    </div>
  );
}
