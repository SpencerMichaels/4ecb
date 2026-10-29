import { createContext, useContext, type ReactNode } from "react";

import type { BuildOccurrence, CharacterBuild } from "@4ecb/character-domain";
import type { ContentEntity } from "@4ecb/content-domain";
import { projectBuildForLegacyExport } from "@4ecb/legacy-dnd4e";
import {
  applyFieldOverlays,
  evaluatePowers,
  previewBeastCompanion,
  projectBuildForEvaluation,
  sharedRulesIndex,
  type EvaluatedCharacter,
  type FieldOverlay,
} from "@4ecb/rules-engine";
import {
  authoredSheetPowerCard,
  createSheetPowerCardFinder,
  creatureRecord,
  sheetCreatureCard,
  sheetBeastCompanionCard,
  sheetFamiliarCard,
  sheetItemCard,
  type SheetBeastCompanionCard,
  type SheetCard,
  type SheetCreatureCard,
  type SheetFamiliarCard,
  itemSetOf,
  sheetItemSetCard,
  type SheetItemSetCard,
} from "@4ecb/sheet-model";

import { entityCardSource } from "./EntityCard";
import { HideFlavortextContext } from "./HideFlavortextContext";
import { ShowEntitySourceContext } from "./ShowEntitySourceContext";
import { BeastCompanionCard } from "./BeastCompanionCard";
import { CreatureCard } from "./CreatureCard";
import { FamiliarCard } from "./FamiliarCard";
import { ItemCard } from "./ItemCard";
import { PowerCard, type CardTextPresentation } from "./PowerCard";
import {
  abbreviatePowerAbilities,
  renderPowerText,
} from "./PowerCardPresentation";

/**
 * How builder detail panes turn content into the shared printed cards: the
 * character's evaluated card exactly as the sheet prints it, at the level the
 * pane shows (the Build tab's viewed level, Equipment's current level).
 */
export interface BuilderCardSettings {
  readonly powerCardFor: (entity: ContentEntity) => SheetCard;
  /** A familiar with this character's defenses and companion bonuses. */
  readonly familiarCardFor: (entity: ContentEntity) => SheetFamiliarCard;
  /** A beast companion record as this character would have it: the chosen
   *  beast's evaluated card, or a candidate's preview. Undefined for a
   *  companion without a beast stat block. */
  readonly beastCardFor: (
    entity: ContentEntity,
  ) => SheetBeastCompanionCard | undefined;
  /** The creature an item's records carry (a mount, D110) as this
   *  character would have it; undefined for an item without a stat block, or
   *  an owner-relative one before the character is evaluated. */
  readonly creatureCardFor: (
    name: string,
    entities: readonly ContentEntity[],
  ) => SheetCreatureCard | undefined;
  /** Selects the power text tier shown on cards. */
  readonly characterLevel: number;
  readonly abbreviateAbilityValues: boolean;
  /** The item set card of a set piece, with this character's count. */
  readonly itemSetCardFor?: (
    piece: ContentEntity,
  ) => SheetItemSetCard | undefined;
  /** The paragon path the character has taken, at any level: detail panes
   *  show only its path-dependent benefits (a pact's Legendary Hexblade
   *  features). */
  readonly paragonPathId?: string;
  /** The character's `modify` overlays, so item cards show its weapons'
   *  modified fields (a Reaper's Blade scythe's High Crit). */
  readonly itemOverlays?: readonly FieldOverlay[];
}

/** The paragon path picked anywhere in the build, unless retrained away. */
export function buildParagonPathId(build: CharacterBuild): string | undefined {
  const occurrences: BuildOccurrence[] = [];
  const visit = (occurrence: BuildOccurrence) => {
    occurrences.push(occurrence);
    occurrence.children.forEach(visit);
  };
  for (const frame of build.levels) visit(frame.root);
  const replaced = new Set(
    occurrences.flatMap(({ replacesId }) =>
      replacesId === undefined ? [] : [replacesId],
    ),
  );
  return occurrences.findLast(
    (occurrence) =>
      !replaced.has(occurrence.id) &&
      occurrence.identity.definitionId !== undefined &&
      occurrence.identity.type.trim().toLocaleLowerCase() === "paragon path",
  )?.identity.definitionId;
}

export interface BuilderCardPreferences {
  readonly resolveAbilityChoices: boolean;
  readonly proficientEquipmentOnly: boolean;
  readonly abbreviateAbilityValues: boolean;
}

/** Evaluated cards for one character state. Powers the character does not
 * own (a Build candidate, a power granted by an item in the Shop) are
 * evaluated as though active, the way the sheet would print them. */
export function evaluatedBuilderCardSettings(
  build: CharacterBuild,
  evaluation: EvaluatedCharacter,
  entities: readonly ContentEntity[],
  preferences: BuilderCardPreferences,
): BuilderCardSettings {
  const input = projectBuildForEvaluation(
    projectBuildForLegacyExport(build),
    entities,
  );
  const evaluationEntities = [...entities, ...(input.localEntities ?? [])];
  const powersFor = (activeDefinitionIds: readonly string[]) =>
    evaluatePowers({
      level: evaluation.level,
      activeDefinitionIds,
      inventory: input.inventory,
      stats: evaluation.stats,
      overlays: evaluation.overlays,
      ...(input.textStrings === undefined
        ? {}
        : { textStrings: input.textStrings }),
      entities: evaluationEntities,
    });
  const powers = powersFor(evaluation.activeDefinitionIds);
  const cardFor = createSheetPowerCardFinder(
    { ...evaluation, powers },
    entities,
    {
      resolveAbilityChoices: preferences.resolveAbilityChoices,
      proficientEquipmentOnly: preferences.proficientEquipmentOnly,
    },
  );
  const owned = new Map(
    powers.map((power) => [power.definitionId.toLocaleLowerCase(), power]),
  );
  const hypotheticalPower = (entity: ContentEntity) =>
    powersFor([...evaluation.activeDefinitionIds, entity.id]).find(
      (power) =>
        power.definitionId.toLocaleLowerCase() ===
        entity.id.toLocaleLowerCase(),
    );
  let contentById: Map<string, ContentEntity> | undefined;
  const paragonPathId = buildParagonPathId(build);
  return {
    ...(paragonPathId === undefined ? {} : { paragonPathId }),
    itemOverlays: evaluation.overlays,
    powerCardFor: (entity) =>
      cardFor(
        entity,
        owned.get(entity.id.toLocaleLowerCase()) ?? hypotheticalPower(entity),
      ),
    familiarCardFor: (entity) => sheetFamiliarCard(entity, evaluation.stats),
    creatureCardFor: (name, entities) => {
      const record = creatureRecord(entities);
      return record === undefined
        ? undefined
        : sheetCreatureCard({
            ...record,
            origin: { kind: "mount" },
            name,
            stats: evaluation.stats,
            level: evaluation.level,
          });
    },
    beastCardFor: (entity) => {
      const beast = previewBeastCompanion({
        entity,
        level: evaluation.level,
        stats: evaluation.stats,
        ...(evaluation.beastCompanion === undefined
          ? {}
          : { chosen: evaluation.beastCompanion }),
        fieldsOf: (record) => applyFieldOverlays(record, evaluation.overlays),
        content: sharedRulesIndex(evaluationEntities),
      });
      return beast === undefined
        ? undefined
        : sheetBeastCompanionCard(entity, beast, {
            textStrings: {
              ...evaluation.textStrings,
              ...input.textStrings,
            },
            powers,
          });
    },
    characterLevel: evaluation.level,
    abbreviateAbilityValues: preferences.abbreviateAbilityValues,
    itemSetCardFor: (piece) => {
      const lookup = (id: string) =>
        (contentById ??= new Map(
          evaluationEntities.map((entity) => [
            entity.id.toLocaleLowerCase(),
            entity,
          ]),
        )).get(id.trim().toLocaleLowerCase());
      const set = itemSetOf(piece, lookup);
      return set === undefined
        ? undefined
        : sheetItemSetCard(set, lookup, evaluation.itemSets, input.textStrings);
    },
  };
}

/** Used only until an evaluation is available: authored formulas. */
export function authoredBuilderCardSettings(
  characterLevel: number,
): BuilderCardSettings {
  return {
    powerCardFor: (entity) =>
      authoredSheetPowerCard(entity, abbreviatePowerAbilities),
    familiarCardFor: (entity) => sheetFamiliarCard(entity, {}),
    beastCardFor: () => undefined,
    // A published block prints its own numbers; an owner-relative one needs
    // the evaluated character.
    creatureCardFor: (name, entities) => {
      const record = creatureRecord(entities);
      return record === undefined || record.block.kind !== "fixed"
        ? undefined
        : sheetCreatureCard({
            ...record,
            origin: { kind: "mount" },
            name,
            stats: {},
            level: characterLevel,
          });
    },
    characterLevel,
    abbreviateAbilityValues: false,
  };
}

export const BuilderCardContext = createContext<BuilderCardSettings>(
  authoredBuilderCardSettings(1),
);

/** Applies the compact-ability-value display preference. Rules text keeps
 * [W]; the weapon table shows each weapon's damage. */
export function cardTextPresentation(
  abbreviateAbilityValues: boolean,
): CardTextPresentation {
  return abbreviateAbilityValues
    ? { renderText: (text: string) => renderPowerText(text, true) }
    : {};
}

function headingIdFor(entity: ContentEntity, suffix = ""): string {
  return `card-${entity.id.replaceAll(/[^a-zA-Z0-9_-]/g, "-")}${suffix}`;
}

export function BuilderPowerCard({
  entity,
  headingSuffix,
  subheading,
  headerAction,
}: {
  readonly entity: ContentEntity;
  readonly headingSuffix?: string;
  readonly subheading?: ReactNode;
  readonly headerAction?: ReactNode;
}) {
  const settings = useContext(BuilderCardContext);
  const hideFlavortext = useContext(HideFlavortextContext);
  const showSource = useContext(ShowEntitySourceContext);
  const card = settings.powerCardFor(entity);
  return (
    <PowerCard
      card={card}
      characterLevel={settings.characterLevel}
      layout="panel"
      panel={{
        headingId: headingIdFor(entity, headingSuffix),
        subheading,
        headerAction,
        ...(showSource
          ? { source: `Source: ${entityCardSource(entity)}` }
          : {}),
        ...(hideFlavortext || card.flavor === undefined
          ? {}
          : { flavor: card.flavor }),
        textPresentation: cardTextPresentation(
          settings.abbreviateAbilityValues,
        ),
      }}
    />
  );
}

export function BuilderItemCard({
  name,
  entities,
  headingSuffix,
  subheading,
  headerAction,
}: {
  readonly name: string;
  readonly entities: readonly ContentEntity[];
  readonly headingSuffix?: string;
  readonly subheading?: ReactNode;
  readonly headerAction?: ReactNode;
}) {
  const settings = useContext(BuilderCardContext);
  const hideFlavortext = useContext(HideFlavortextContext);
  const showSource = useContext(ShowEntitySourceContext);
  const entity = entities.at(-1);
  if (entity === undefined) return null;
  // A composed item (e.g. a magic armor on a base armor) cites each source.
  const sources = [...new Set(entities.map(entityCardSource))];
  const card = sheetItemCard({
    name,
    entities,
    overlays: settings.itemOverlays,
  });
  return (
    <ItemCard
      card={card}
      layout="panel"
      panel={{
        headingId: headingIdFor(entity, headingSuffix),
        subheading,
        headerAction,
        ...(showSource
          ? {
              source: `${sources.length === 1 ? "Source" : "Sources"}: ${sources.join("; ")}`,
            }
          : {}),
        ...(hideFlavortext || card.flavor === undefined
          ? {}
          : { flavor: card.flavor }),
        textPresentation: cardTextPresentation(
          settings.abbreviateAbilityValues,
        ),
      }}
    />
  );
}

/** The creature an item carries (a mount's stat block, D110), as the
 *  sheet prints it, beside the item's own card. */
export function BuilderCreatureCard({
  name,
  entities,
  headingSuffix = "-creature",
}: {
  readonly name: string;
  readonly entities: readonly ContentEntity[];
  readonly headingSuffix?: string;
}) {
  const settings = useContext(BuilderCardContext);
  const showSource = useContext(ShowEntitySourceContext);
  const card = settings.creatureCardFor(name, entities);
  const entity = entities.at(-1);
  if (card === undefined || entity === undefined) return null;
  return (
    <div className="candidate-card-panel">
      <CreatureCard
        card={card}
        layout="panel"
        panel={{
          headingId: headingIdFor(entity, headingSuffix),
          ...(showSource
            ? { source: `Source: ${entityCardSource(entity)}` }
            : {}),
        }}
      />
    </div>
  );
}

export function BuilderFamiliarCard({
  entity,
  headingSuffix,
  subheading,
  headerAction,
}: {
  readonly entity: ContentEntity;
  readonly headingSuffix?: string;
  readonly subheading?: ReactNode;
  readonly headerAction?: ReactNode;
}) {
  const settings = useContext(BuilderCardContext);
  const showSource = useContext(ShowEntitySourceContext);
  return (
    <FamiliarCard
      card={settings.familiarCardFor(entity)}
      layout="panel"
      panel={{
        headingId: headingIdFor(entity, headingSuffix),
        subheading,
        headerAction,
        ...(showSource
          ? { source: `Source: ${entityCardSource(entity)}` }
          : {}),
        textPresentation: cardTextPresentation(
          settings.abbreviateAbilityValues,
        ),
      }}
    />
  );
}

export function BuilderBeastCompanionCard({
  card,
  entity,
  headingSuffix,
  subheading,
  headerAction,
}: {
  readonly card: SheetBeastCompanionCard;
  readonly entity: ContentEntity;
  readonly headingSuffix?: string;
  readonly subheading?: ReactNode;
  readonly headerAction?: ReactNode;
}) {
  const settings = useContext(BuilderCardContext);
  const showSource = useContext(ShowEntitySourceContext);
  return (
    <BeastCompanionCard
      card={card}
      layout="panel"
      panel={{
        headingId: headingIdFor(entity, headingSuffix),
        subheading,
        headerAction,
        ...(showSource
          ? { source: `Source: ${entityCardSource(entity)}` }
          : {}),
        textPresentation: cardTextPresentation(
          settings.abbreviateAbilityValues,
        ),
      }}
    />
  );
}
