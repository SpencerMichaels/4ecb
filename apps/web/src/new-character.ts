import {
  newNativeCharacterRecord,
  type BuildLevelFrame,
  type CharacterRecord,
} from "@4ecb/character-domain";
import type { ContentEntity } from "@4ecb/content-domain";
import type { ContentPackManifest } from "@4ecb/content-pack";

function levelDefinition(
  entities: readonly ContentEntity[],
  level: number,
): ContentEntity {
  const expected = `id_internal_level_${level}`;
  const definition = entities.find(
    (entity) => entity.id.toLocaleLowerCase() === expected,
  );
  if (
    definition === undefined ||
    definition.type.toLocaleLowerCase() !== "level"
  )
    throw new Error(`The active content profile has no level ${level} record.`);
  return definition;
}

export function createNativeCharacter(
  name: string,
  manifest: ContentPackManifest,
  entities: readonly ContentEntity[],
  options: {
    readonly id?: string;
    readonly occurrenceId?: string;
    readonly now?: string;
  } = {},
): CharacterRecord {
  const definition = levelDefinition(entities, 1);
  return newNativeCharacterRecord(
    name,
    {
      definitionId: definition.id,
      name: definition.name,
      type: definition.type,
    },
    { packId: manifest.packId, contentDigest: manifest.contentDigest },
    options,
  );
}

export function createLevelFrame(
  level: number,
  entities: readonly ContentEntity[],
  occurrenceId: string = `web:${crypto.randomUUID()}`,
): BuildLevelFrame {
  if (!Number.isInteger(level) || level < 1 || level > 30)
    throw new Error("Character levels must be integers from 1 through 30");
  const definition = levelDefinition(entities, level);
  return {
    level,
    root: {
      id: occurrenceId,
      identity: {
        definitionId: definition.id,
        name: definition.name,
        type: definition.type,
      },
      acquiredLevel: level,
      legality: "rules-legal",
      children: [],
      unresolved: false,
    },
  };
}
