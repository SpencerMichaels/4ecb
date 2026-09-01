import type { ContentEntity } from "@4ecb/content-domain";

export const EXCEPTION_IDS = {
  diverseStudy: "ID_FMP_FEAT_651",
  diverseStudyClass: "ID_FMP_PSEUDO_CLASS_216",
  seekerFeature: "ID_FMP_CLASS_FEATURE_691",
  versatileMasterFeature: "ID_FMP_CLASS_FEATURE_1891",
  seekerClass: "ID_FMP_CLASS_104",
  versatileMasterPrerequisite: "ID_FMP_FEAT_1082",
  paragonMulticlassing: "ID_INTERNAL_PARAGON_PATH_PARAGON_MULTICLASSING",
} as const;

function owns(ownedIds: ReadonlySet<string>, id: string): boolean {
  return ownedIds.has(id.toLocaleLowerCase());
}
function field(entity: ContentEntity, name: string): string | undefined {
  return entity.specifics.find(
    (specific) =>
      specific.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
  )?.value;
}

export function isUniversalSkill(
  candidate: ContentEntity,
  requestedCategoryType: string,
): boolean {
  return (
    candidate.type.toLocaleLowerCase() === "skill" &&
    requestedCategoryType.toLocaleLowerCase() === "class" &&
    (field(candidate, "UniversalClassSkill")?.length ?? 0) > 0
  );
}

export function diverseStudyException(
  candidate: ContentEntity,
  requestedCategory: string,
  ownedIds: ReadonlySet<string>,
): boolean {
  return (
    owns(ownedIds, EXCEPTION_IDS.diverseStudy) &&
    requestedCategory.toLocaleLowerCase() ===
      EXCEPTION_IDS.diverseStudyClass.toLocaleLowerCase() &&
    candidate.type.toLocaleLowerCase() === "power"
  );
}

export function seekerException(
  candidate: ContentEntity,
  providerId: string | undefined,
  categoryTerms: readonly string[],
  ownedIds: ReadonlySet<string>,
): boolean {
  if (!owns(ownedIds, EXCEPTION_IDS.seekerFeature) || providerId === undefined)
    return false;
  const encounterOrDaily = categoryTerms.some((term) =>
    ["encounter", "daily"].includes(term.toLocaleLowerCase()),
  );
  return (
    encounterOrDaily &&
    candidate.type.toLocaleLowerCase() === "power" &&
    field(candidate, "Class") !== undefined
  );
}

export function versatileMasterException(
  candidate: ContentEntity,
  providerId: string | undefined,
  ownedIds: ReadonlySet<string>,
): boolean {
  return (
    providerId?.toLocaleLowerCase() ===
      EXCEPTION_IDS.versatileMasterFeature.toLocaleLowerCase() &&
    owns(ownedIds, EXCEPTION_IDS.versatileMasterPrerequisite) &&
    candidate.type.toLocaleLowerCase() === "power" &&
    field(candidate, "Class") !== undefined
  );
}

export function isCustomChoiceException(candidate: ContentEntity): boolean {
  return (
    ["feat", "power"].includes(candidate.type.toLocaleLowerCase()) &&
    candidate.attributes.some(
      (attribute) =>
        attribute.name.toLocaleLowerCase() === "legality" &&
        attribute.value.toLocaleLowerCase() === "houserule",
    )
  );
}
