import type { ContentEntity } from "@4ecb/content-domain";

export const EXCEPTION_IDS = {
  diverseStudy: "ID_FMP_FEAT_651",
  diverseStudyClass: "ID_FMP_PSEUDO_CLASS_216",
  seekerFeature: "ID_FMP_CLASS_FEATURE_691",
  versatileMasterFeature: "ID_FMP_CLASS_FEATURE_1891",
  seekerClass: "ID_FMP_CLASS_104",
  versatileMasterPrerequisite: "ID_FMP_FEAT_1082",
  paragonMulticlassing: "ID_INTERNAL_PARAGON_PATH_PARAGON_MULTICLASSING",
  /** FromDilettante/FromMulticlassing: the half-elf Dilettante trait. */
  dilettante: "ID_FMP_RACIAL_TRAIT_643",
  cleverShotMastery: "ID_CDJ_CLASS_FEATURE_34501",
  rapidShotMastery: "ID_CDJ_CLASS_FEATURE_34502",
  aimedShotMastery: "ID_CDJ_CLASS_FEATURE_34503",
  // Striker features (native CalcStrikers/HasStrikerFeature): each hybrid
  // feature applies only to powers of its class.
  rangerClass: "ID_FMP_CLASS_5",
  rogueClass: "ID_FMP_CLASS_6",
  warlockClass: "ID_FMP_CLASS_7",
  huntersQuarry: "ID_FMP_CLASS_FEATURE_602",
  hybridHuntersQuarry: "ID_FMP_CLASS_FEATURE_1530",
  warlocksCurse: "ID_FMP_CLASS_FEATURE_605",
  hybridWarlocksCurse: "ID_FMP_CLASS_FEATURE_1533",
  sneakAttack: "ID_FMP_CLASS_FEATURE_322",
  hybridSneakAttack: "ID_FMP_CLASS_FEATURE_1531",
  dualImplementSpellcaster: "ID_FMP_FEAT_1127",
  /** IsValidPowerCombo: this power (an ally's attack) gets no variants. */
  coordinatedAssaultAttack: "ID_FMP_POWER_11615",
  /** WeaponBase/IsStaff: a staff used as a weapon is this Quarterstaff. */
  quarterstaff: "ID_FMP_WEAPON_10",
  /** DualWieldingConditional `DUAL-WIELDING:rapier-blade`: the rapier,
   *  matched as a substring of the weapon's ID. */
  rapier: "ID_FMP_WEAPON_29",
  largeRapier: "ID_INTERNAL_WEAPON_LARGE_RAPIER",
  /** ArenaTrainingImprovisedWeapon: the Arena Training class feature. */
  arenaTraining: "ID_FMP_CLASS_FEATURE_2893",
  /** MeetsItemRequirement: the Internal records two item Requirements need. */
  canUseComponents: "ID_INTERNAL_INTERNAL_CAN_USE_COMPONENTS",
  kiFocusUser: "ID_INTERNAL_INTERNAL_KI_FOCUS_USER",
  /** IsKiFocus: the mundane Ki Focus gear. */
  kiFocusGear: "ID_FMP_GEAR_115",
  /** PsionicConventionalist: power points lost by the swapped at-will. */
  psionicConventionalist: "ID_FMP_FEAT_2732",
} as const;

/**
 * Legacy MeetsItemRequirement: the two exact (case-insensitive) item
 * `Requirement` texts the native engine checks, each against an owned
 * Internal record. Every other Requirement passes, as does every item
 * `Prerequisite` (MeetsItemPrereq always succeeds).
 */
export const ITEM_REQUIREMENT_RECORDS: readonly {
  readonly requirement: string;
  readonly internalId: string;
}[] = [
  {
    requirement:
      "You must have the living construct racial trait to use this item.",
    internalId: EXCEPTION_IDS.canUseComponents,
  },
  {
    requirement: "Must be able to use Ki Focuses as an implement.",
    internalId: EXCEPTION_IDS.kiFocusUser,
  },
];

/** Whether the character (its owned definition IDs, lower case) meets an
 * item's Requirement, as legacy MeetsItemRequirement decides it. */
export function meetsItemRequirement(
  item: ContentEntity,
  ownedIds: ReadonlySet<string>,
): boolean {
  const requirement = field(item, "Requirement")?.trim().toLocaleLowerCase();
  if (requirement === undefined || requirement === "") return true;
  const known = ITEM_REQUIREMENT_RECORDS.find(
    (entry) => entry.requirement.toLocaleLowerCase() === requirement,
  );
  return known === undefined || owns(ownedIds, known.internalId);
}

/**
 * Exact (case-insensitive) record names native branches key on, where the
 * legacy engine compares names rather than IDs.
 */
export const EXCEPTION_NAMES = {
  /** ShouldChooseDeity excludes this class. */
  warpriest: "Warpriest",
  /** Power SpecialCase: fixed 1d10/2d10 damage. */
  bondOfCensure: "Bond of Censure",
  /** Strength-modifier-only damage (power SpecialCase hit-line prefix). */
  knockdownAssault: "Knockdown Assault",
  /** IsRangedPower: also a ranged power. */
  stabAndShoot: "Stab and Shoot",
  /** DualImplementSpellcaster looks the feat up by name. */
  dualImplementSpellcaster: "Dual Implement Spellcaster",
  /** Prerequisite AnyClassSpecific: counted as class-specific multiclass feats. */
  studentOfThePlague: "Student of the Plague",
  adeptDilettante: "Adept Dilettante",
  /** IsPsionicClass / AnyClassMoreSpecific: `_PARSED_CLASS_FEATURE` names it. */
  psionicAugmentation: "Psionic Augmentation",
  /** Prerequisite HealingInfusion: power names with this prefix. */
  healingInfusionPrefix: "Healing Infusion:",
  /** WeaponBase: an unarmed melee power uses the "Unarmed Weapon" text's
   * weapon, else this one. */
  unarmedWeaponText: "Unarmed Weapon",
  unarmedAttack: "Unarmed Attack",
  /** CalcStrikers: Sneak Attack's weapon groups, weapon names (compared
   * with the record's own name) and the text string that adds more. */
  sneakAttackGroups: "light blade,sling",
  sneakAttackWeapons: "hand crossbow,shortbow",
  sneakAttackWeaponsText: "Sneak Attack Weapons",
  /** IsMonkWeapon: weapons a "monk weapon" requirement accepts (or a
   * staff); IsDagger also compares the name. */
  club: "Club",
  dagger: "Dagger",
  spear: "Spear",
  monkUnarmedStrike: "Monk Unarmed Strike",
  /** IsRestricted "spiked chain" compares the weapon's name. */
  spikedChain: "Spiked Chain",
  /** IsStaff: implement records named as staffs. */
  staffImplement: "Implement, Staff",
  staffImplementAlternate: "Staff Implement",
  /** LootImplement: an `_ImplementForClass` item of this class is an
   * "instrument". */
  bardClass: "Bard",
  /** SmallWithNonSmallWeapon: a Small size without One Size Larger uses a
   * non-small versatile weapon two-handed. */
  smallSize: "Small",
  oneSizeLarger: "One Size Larger",
  /** ItemSlot/CanUseLargeWeapons: Large weapons need Oversized (or One Size
   * Larger); Ambidextrous holds a one-handed item off-hand. */
  oversized: "Oversized",
  ambidextrous: "Ambidextrous",
  /** Prerequisite MoreThanOneClass: this Class (or any CountsAsClass). */
  hybridClass: "Hybrid",
  /** InternalizeElement: a prerequisite token "assassin" never matches a
   * Background of that name (only the class and its features). */
  assassinBackground: "assassin",
  /** AttackPowerModRepl: powers whose `+N` attack bonus becomes +4 at 11th
   * level and +6 at 21st (Dragon's Wrath: +6 at 21st only) by name. */
  bloodDrain: "Blood Drain",
  razorStorm: "Razor Storm",
  dragonBreath: "Dragon Breath",
  dragonsWrath: "Dragon's Wrath",
  /** CalcBonuses: the "If you are a dwarf, …" rider needs this element. */
  dwarf: "Dwarf",
  /** HigherLevelDamage: at 21st level its damage becomes "twice
   * intelligence modifier damage." by name. */
  chillingCloud: "Chilling Cloud",
} as const;

/**
 * RulesElementEncounterUses (D20Workspace.cs ~1880): a power whose Special
 * field is exactly one of these (case-insensitive) has 2 uses per encounter,
 * 3 from 16th level (Healing Word, Inspiring Word, healing infusions...).
 */
export const TWICE_PER_ENCOUNTER_SPECIALS: readonly string[] = [
  "You can use this power twice per encounter, but only once per round. At 16th level, you can use this power three times per encounter.",
  "You can use this power twice per encounter, but only once per round. At 16th level, you can use inspiring word three times per encounter.",
  "You can use a healing infusion power twice per encounter, but only once per round. At 16th level, you can use a healing infusion power three times per encounter, but only once per round.",
  "You can use this power twice per encounter, but only once per round. At 16th level, you can use this power three times per encounter, but only once per round.",
];

/** Exact class name excluded by the recovered native deity-choice predicate. */
export const DEITY_CHOICE_EXCLUDED_CLASS_NAME = EXCEPTION_NAMES.warpriest;

const archeryMasteryPowers = new Map([
  [EXCEPTION_IDS.cleverShotMastery.toLocaleLowerCase(), "ID_FMP_POWER_13586"],
  [EXCEPTION_IDS.rapidShotMastery.toLocaleLowerCase(), "ID_FMP_POWER_13587"],
  [EXCEPTION_IDS.aimedShotMastery.toLocaleLowerCase(), "ID_FMP_POWER_13585"],
]);

function owns(ownedIds: ReadonlySet<string>, id: string): boolean {
  return ownedIds.has(id.toLocaleLowerCase());
}
function field(entity: ContentEntity, name: string): string | undefined {
  return entity.specifics.find(
    (specific) =>
      specific.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
  )?.value;
}

function containsChannelDivinity(value: string | undefined): boolean {
  return value?.toLocaleLowerCase().includes("channel divinity") ?? false;
}

/**
 * Reproduces D20Workspace.ShouldChooseDeity for the active Class and Hybrid
 * Class definitions. The native implementation is metadata-driven except for
 * its case-insensitive Warpriest name exclusion.
 */
export function shouldChooseDeity(
  activeDefinitions: readonly ContentEntity[],
): boolean {
  return activeDefinitions.some(
    (definition) =>
      ["class", "hybrid class"].includes(
        definition.type.trim().toLocaleLowerCase(),
      ) &&
      definition.name.trim().toLocaleLowerCase() !==
        DEITY_CHOICE_EXCLUDED_CLASS_NAME.toLocaleLowerCase() &&
      (containsChannelDivinity(field(definition, "_PARSED_CLASS_FEATURE")) ||
        containsChannelDivinity(field(definition, "Hybrid Talent Options"))),
  );
}

function requiresMatchingDeityAlignment(definition: ContentEntity): boolean {
  const supplemental = field(definition, "Supplemental")
    ?.replace(/[’‘]/g, "'")
    .toLocaleLowerCase();
  return (
    supplemental?.includes(
      "alignment identical to the alignment of your patron deity",
    ) === true ||
    supplemental?.includes("alignment must match your deity's") === true
  );
}

/**
 * Finds active deity-choosing classes whose authored rule requires the
 * character's alignment to equal the deity's. Hybrid classes inherit this
 * requirement through their authored `_BaseClass` link.
 */
export function matchingDeityAlignmentClasses(
  activeDefinitions: readonly ContentEntity[],
  definitions: readonly ContentEntity[],
): readonly ContentEntity[] {
  const byId = new Map(
    definitions.map((definition) => [
      definition.id.trim().toLocaleLowerCase(),
      definition,
    ]),
  );
  return activeDefinitions.filter((definition) => {
    if (!shouldChooseDeity([definition])) return false;
    if (requiresMatchingDeityAlignment(definition)) return true;
    if (definition.type.trim().toLocaleLowerCase() !== "hybrid class")
      return false;
    const baseClassId = field(definition, "_BaseClass");
    const baseClass =
      baseClassId === undefined
        ? undefined
        : byId.get(baseClassId.trim().toLocaleLowerCase());
    return baseClass !== undefined && requiresMatchingDeityAlignment(baseClass);
  });
}

export function archeryMasteryPowerId(
  provider: ContentEntity,
): string | undefined {
  return archeryMasteryPowers.get(provider.id.toLocaleLowerCase());
}

export function isLeveledRangerAtWillAttack(candidate: ContentEntity): boolean {
  return (
    candidate.type.toLocaleLowerCase() === "power" &&
    field(candidate, "Class")?.toLocaleLowerCase() ===
      EXCEPTION_IDS.rangerClass.toLocaleLowerCase() &&
    field(candidate, "Power Usage")?.toLocaleLowerCase() === "at-will" &&
    field(candidate, "Power Type")?.toLocaleLowerCase() === "attack" &&
    (field(candidate, "Level")?.trim().length ?? 0) > 0
  );
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
