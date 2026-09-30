import {
  Fragment,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { CharacterRepository } from "@4ecb/browser-storage";
import { appContentRuntime, type RulesRuntimeClient } from "./app-runtime";
import {
  resolvedBoundProfile,
  shouldShowBoundProfileWarning,
  type BoundProfileResolution,
} from "./bound-profile-resolution";
import {
  currentCandidateDetailLevels,
  evaluationDispatchOrder,
  planningCandidateDetailLevels,
  publishEvaluationResult,
  selectedCandidateDetailLevels,
} from "./builder-evaluation-plan";
import { builderIssueGroups, type BuilderIssue } from "./builder-diagnostics";
import { recordLoadDuration } from "./load-performance";
import {
  CharacterTransaction,
  adjustWalletCurrency,
  characterWalletTextKey,
  formatLegacyCurrency,
  resolveCharacterWallet,
  type EquipmentSlotId,
  type CharacterBuild,
  type CharacterCommand,
  type CharacterRecord,
} from "@4ecb/character-domain";
import type { ContentEntity } from "@4ecb/content-domain";
import { projectBuildForLegacyExport } from "@4ecb/legacy-dnd4e";
import {
  ABILITY_SCORE_NAMES,
  assessAbilityPointBuy,
  commandForEvaluatedChoice,
  evaluatePowers,
  projectBuildForEvaluation,
  type EvaluatedCharacter,
  type EvaluatedChoice,
  type EvaluationInput,
} from "@4ecb/rules-engine";

import {
  abilityScoreAdjustment,
  characterHeaderSubtitle,
  classKeyAbilities,
  classKeyAbilitiesSentence,
  choiceSectionComplete,
  choiceSectionIcon,
  choiceSectionId,
  choicesAtLevel,
  contextualChoiceTitle,
  deityAlignmentConstraint,
  evaluationAtHorizon,
  findOccurrence,
  groupChoicesByLegacyWorkflow,
  groupDependentChoiceFlows,
  groupLevelChoices,
  groupRepeatedChoiceSlots,
  isCandidateSelectable,
  isCharacterDetailChoice,
  isBuildPresetChoice,
  isAbilityIncreaseChoiceType,
  isOptionalRetrainingChoice,
  isRequiredClassDeityChoice,
  isUnresolvedChoice,
  jumpToLevelCommand,
  levelChoiceProgress,
  levelRailChoiceStatus,
  legacyChoiceSection,
  nextLevelChoiceDestination,
  planningEvaluationHorizon,
  planningHorizonCommand,
  selectedDefinitionId,
  selectedChoiceHasWarning,
  selectedChoiceIsHouseRule,
  shouldOmitIndividualChoiceHeading,
  unresolveEvaluatedChoiceCommand,
  type LegacyChoiceSection,
} from "./builder-ui";
import { CandidateInspectionScope } from "./builder-choice-context";
import { Icon, type IconName } from "./Icon";
import { BuilderHeaderStats } from "./BuilderHeaderStats";
import { loadoutChangeCommand } from "./equipment-ui";
import { type InspectedOption } from "./CandidateSelectionTable";
import { CharacterOverview } from "./CharacterOverview";
import { CandidateDetail } from "./CandidateDetail";
import { BaseAbilityScoreEditor } from "./BaseAbilityScoreEditor";
import {
  AbilityIncreaseEditor,
  BackgroundChoiceGroup,
  BuildPresetPanel,
  ChoiceEditor,
  ChoiceFlowSection,
  RepeatedChoiceGroup,
  RetrainingControls,
  SkillTrainingEditor,
} from "./ChoiceEditors";
import {
  CharacterDetailsEditor,
  CharacterTextField,
} from "./CharacterDetailsEditor";
import { HideFlavortextContext } from "./HideFlavortextContext";
import { EquipmentWorkspace } from "./EquipmentWorkspace";
import { OptimisticBuildSaveQueue } from "./optimistic-save";
import { PortraitEditor } from "./PortraitEditor";
import {
  createBuildPowerCardPresentationFinder,
  createPowerCardPresentationFinder,
} from "./PowerCardPresentation";
import type {
  BuilderNavigation,
  BuilderSectionSlug,
  BuilderWorkspaceTab,
} from "./routes";

const characters = new CharacterRepository();
const buildPowerPresentationFor = createBuildPowerCardPresentationFinder();
type LevelChoiceTab = LegacyChoiceSection | "Retraining";
type CharacterTierId = "heroic" | "paragon" | "epic";
const CHARACTER_TIERS: readonly {
  readonly id: CharacterTierId;
  readonly label: string;
  readonly firstLevel: number;
  readonly lastLevel: number;
}[] = [
  { id: "heroic", label: "Heroic", firstLevel: 1, lastLevel: 10 },
  { id: "paragon", label: "Paragon", firstLevel: 11, lastLevel: 20 },
  { id: "epic", label: "Epic", firstLevel: 21, lastLevel: 30 },
];

type SaveState =
  | { readonly phase: "loading"; readonly message: string }
  | { readonly phase: "saved"; readonly message: string }
  | { readonly phase: "saving"; readonly message: string }
  | { readonly phase: "failed"; readonly message: string };

function saveStateIconName(phase: SaveState["phase"]): IconName {
  if (phase === "saved") return "save-check";
  if (phase === "failed") return "save-off";
  return "save-pen";
}

function levelChoiceTabSlug(section: LevelChoiceTab): BuilderSectionSlug {
  switch (section) {
    case "Class":
      return "class";
    case "Race":
      return "race";
    case "Background":
      return "background";
    case "Theme":
      return "theme";
    case "Ability Scores":
      return "ability-scores";
    case "Companion":
      return "companion";
    case "Skills":
      return "skills";
    case "Powers":
      return "powers";
    case "Spellbook":
      return "spellbook";
    case "Feats":
      return "feats";
    case "Retraining":
      return "retraining";
    case "Character Details":
    case "Other":
      return "other";
  }
}

function levelChoiceTabForSlug(
  section: BuilderSectionSlug | undefined,
): LevelChoiceTab | undefined {
  switch (section) {
    case "class":
      return "Class";
    case "race":
      return "Race";
    case "background":
      return "Background";
    case "theme":
      return "Theme";
    case "ability-scores":
      return "Ability Scores";
    case "companion":
      return "Companion";
    case "skills":
      return "Skills";
    case "powers":
      return "Powers";
    case "spellbook":
      return "Spellbook";
    case "feats":
      return "Feats";
    case "retraining":
      return "Retraining";
    case "other":
      return "Other";
    case undefined:
      return undefined;
  }
}

function characterTierAtLevel(level: number): CharacterTierId {
  if (level >= 21) return "epic";
  if (level >= 11) return "paragon";
  return "heroic";
}

export function CharacterEditorPage({
  characterId,
  navigation,
  onNavigate,
  keepLargeAmountsInGold,
  resolveAbilityChoices,
  abbreviateAbilityValues,
  expandWeaponDice,
}: {
  readonly characterId: string;
  readonly navigation: BuilderNavigation;
  readonly onNavigate: (
    characterId: string,
    navigation: BuilderNavigation,
    replace?: boolean,
  ) => void;
  readonly keepLargeAmountsInGold: boolean;
  readonly resolveAbilityChoices: boolean;
  readonly abbreviateAbilityValues: boolean;
  readonly expandWeaponDice: boolean;
}) {
  const hideFlavortext = useContext(HideFlavortextContext);
  const [character, setCharacter] = useState<CharacterRecord>();
  const [entities, setEntities] = useState<readonly ContentEntity[]>([]);
  const [boundProfileResolution, setBoundProfileResolution] =
    useState<BoundProfileResolution>("pending");
  const [, setRevision] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>({
    phase: "loading",
    message: "Loading build…",
  });
  const [loadError, setLoadError] = useState<string>();
  const [currentEvaluationResult, setCurrentEvaluation] =
    useState<EvaluatedCharacter>();
  const [planningEvaluationResult, setPlanningEvaluation] =
    useState<EvaluatedCharacter>();
  const [selectedLevelEvaluationResult, setSelectedLevelEvaluation] =
    useState<EvaluatedCharacter>();
  const [evaluationStatus, setEvaluationStatus] = useState("Loading rules…");
  const [readyPackId, setReadyPackId] = useState<string>();
  const [selectedLevel, setSelectedLevel] = useState(
    navigation.workspace === "build" ? (navigation.level ?? 1) : 1,
  );
  const [showPlannedOverview, setShowPlannedOverview] = useState(false);
  const [expandedTiers, setExpandedTiers] = useState<
    ReadonlySet<CharacterTierId>
  >(new Set(["heroic"]));
  const [selectedChoiceId, setSelectedChoiceId] = useState<string>();
  const [selectedSectionByLevel, setSelectedSectionByLevel] = useState<
    Readonly<Partial<Record<number, LevelChoiceTab>>>
  >({});
  const workspaceTab: BuilderWorkspaceTab = navigation.workspace;
  const navigationLevel =
    navigation.workspace === "build" ? navigation.level : undefined;
  const navigationSection =
    navigation.workspace === "build" ? navigation.section : undefined;
  const [inspectedOption, setInspectedOption] = useState<InspectedOption>();
  const [rollbackRevision, setRollbackRevision] = useState(0);
  const [
    pendingLevelOneAbilitySelections,
    setPendingLevelOneAbilitySelections,
  ] = useState<ReadonlyMap<string, string | undefined>>(new Map());
  const [expandedReplacementChoiceId, setExpandedReplacementChoiceId] =
    useState<string>();
  const transaction = useRef<CharacterTransaction | undefined>(undefined);
  const saveQueue = useRef<
    OptimisticBuildSaveQueue<CharacterRecord> | undefined
  >(undefined);
  const rulesClient = useRef<RulesRuntimeClient | undefined>(undefined);
  const evaluationRevision = useRef(0);
  const characterLoadStartedAt = useRef(performance.now());
  const firstEvaluationRecorded = useRef(false);
  const pendingForcedAlignmentKey = useRef<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    const startedAt = performance.now();
    setCharacter(undefined);
    setEntities([]);
    setBoundProfileResolution("pending");
    setLoadError(undefined);
    characterLoadStartedAt.current = startedAt;
    firstEvaluationRecorded.current = false;
    void characters
      .get(characterId)
      .then(async (loaded) => {
        recordLoadDuration("character-record-ready", startedAt, {
          characterId,
        });
        if (loaded === undefined) throw new Error("Character not found");
        if (cancelled) return;
        setCharacter(loaded);
        transaction.current = new CharacterTransaction(loaded.build);
        saveQueue.current = new OptimisticBuildSaveQueue(
          loaded.build,
          (next) => characters.updateBuild(characterId, next),
          (result) => result.build,
          {
            onSaving: (pendingCount) => {
              if (cancelled) return;
              setSaveState({
                phase: "saving",
                message:
                  pendingCount === 1
                    ? "Saving…"
                    : `Saving ${pendingCount} changes…`,
              });
            },
            onCommit: (updated) => {
              if (!cancelled) setCharacter(updated);
            },
            onSaved: (message) => {
              if (!cancelled) setSaveState({ phase: "saved", message });
            },
            onFailure: (reason, lastPersistedBuild, rolledBackCount) => {
              if (cancelled) return;
              transaction.current = new CharacterTransaction(
                lastPersistedBuild,
              );
              setRevision((value) => value + 1);
              setRollbackRevision((value) => value + 1);
              setSaveState({
                phase: "failed",
                message: `Save failed; rolled back ${rolledBackCount} ${
                  rolledBackCount === 1 ? "change" : "changes"
                }: ${reason instanceof Error ? reason.message : String(reason)}`,
              });
            },
          },
        );
        setSelectedLevel(loaded.build.effectiveLevel);
        setExpandedTiers(
          new Set([characterTierAtLevel(loaded.build.effectiveLevel)]),
        );
        setSaveState({ phase: "saved", message: "Saved locally" });
        if (loaded.profileBinding === undefined) {
          setBoundProfileResolution(resolvedBoundProfile(undefined, undefined));
          return;
        }
        const pack = await appContentRuntime.getPack(
          loaded.profileBinding.packId,
        );
        if (cancelled) return;
        const resolution = resolvedBoundProfile(
          loaded.profileBinding,
          pack?.manifest.contentDigest,
        );
        if (resolution === "available") setEntities(pack?.entities ?? []);
        setBoundProfileResolution(resolution);
      })
      .catch((reason: unknown) => {
        if (!cancelled)
          setLoadError(
            reason instanceof Error ? reason.message : String(reason),
          );
      });
    return () => {
      cancelled = true;
      saveQueue.current = undefined;
    };
  }, [characterId]);

  useEffect(() => {
    if (navigation.workspace !== "build" || character === undefined) return;
    const level = navigationLevel ?? character.build.effectiveLevel;
    setSelectedLevel(level);
    setExpandedTiers((current) => {
      const tier = characterTierAtLevel(level);
      return current.has(tier) ? current : new Set([...current, tier]);
    });
    const section = levelChoiceTabForSlug(navigationSection);
    if (section !== undefined)
      setSelectedSectionByLevel((current) =>
        current[level] === section ? current : { ...current, [level]: section },
      );
  }, [character, navigationLevel, navigationSection, navigation.workspace]);

  const packId = character?.profileBinding?.packId;
  const contentDigest = character?.profileBinding?.contentDigest;
  useEffect(() => {
    rulesClient.current = undefined;
    setReadyPackId(undefined);
    setCurrentEvaluation(undefined);
    setPlanningEvaluation(undefined);
    setSelectedLevelEvaluation(undefined);
    if (packId === undefined || boundProfileResolution !== "available") return;
    let cancelled = false;
    void appContentRuntime
      .getRulesClient(packId, contentDigest)
      .then((client) => {
        if (cancelled) return;
        rulesClient.current = client;
        setReadyPackId(packId);
      })
      .catch((reason: unknown) => {
        if (!cancelled)
          setLoadError(
            reason instanceof Error ? reason.message : String(reason),
          );
      });
    return () => {
      cancelled = true;
      rulesClient.current = undefined;
    };
  }, [boundProfileResolution, contentDigest, packId]);

  const build = transaction.current?.current;
  const planningHorizon =
    build === undefined
      ? selectedLevel
      : planningEvaluationHorizon(build, selectedLevel);
  const abilityPointBuy = assessAbilityPointBuy(build?.baseAbilities ?? {});
  const abilityScoresIncomplete = !abilityPointBuy.complete;
  const abilityScoresHouseRuled =
    abilityPointBuy.complete && !abilityPointBuy.legal;
  const currentEvaluation = evaluationAtHorizon(
    currentEvaluationResult,
    build?.effectiveLevel,
  );
  const planningEvaluation = evaluationAtHorizon(
    planningEvaluationResult,
    planningHorizon,
  );
  const selectedLevelEvaluation = evaluationAtHorizon(
    selectedLevelEvaluationResult,
    selectedLevel,
  );
  const byId = useMemo(
    () =>
      new Map(
        entities.map((entity) => [entity.id.toLocaleLowerCase(), entity]),
      ),
    [entities],
  );
  const currentEvaluationWithPowers = useMemo(() => {
    if (build === undefined || currentEvaluation === undefined)
      return undefined;
    const input = projectBuildForEvaluation(
      projectBuildForLegacyExport(build),
      entities,
    );
    return {
      ...currentEvaluation,
      powers: evaluatePowers({
        level: currentEvaluation.level,
        activeDefinitionIds: currentEvaluation.activeDefinitionIds,
        inventory: input.inventory,
        stats: currentEvaluation.stats,
        overlays: currentEvaluation.overlays,
        ...(input.textStrings === undefined
          ? {}
          : { textStrings: input.textStrings }),
        entities: [...entities, ...(input.localEntities ?? [])],
      }),
    };
  }, [build, currentEvaluation, entities]);
  const currentPowerPresentationFor = useMemo(() => {
    if (
      build === undefined ||
      currentEvaluation === undefined ||
      currentEvaluationWithPowers === undefined
    )
      return undefined;
    const input = projectBuildForEvaluation(
      projectBuildForLegacyExport(build),
      entities,
    );
    const evaluationEntities = [...entities, ...(input.localEntities ?? [])];
    const evaluationEntitiesById = new Map(
      evaluationEntities.map((entity) => [
        entity.id.toLocaleLowerCase(),
        entity,
      ]),
    );
    return createPowerCardPresentationFinder(
      currentEvaluationWithPowers,
      entities,
      {
        resolveAbilityChoices,
        abbreviateAbilityValues,
        expandWeaponDice,
      },
      (definitionId, name) => {
        if (
          evaluationEntitiesById
            .get(definitionId.toLocaleLowerCase())
            ?.type.trim()
            .toLocaleLowerCase() !== "power"
        )
          return undefined;
        return evaluatePowers({
          level: currentEvaluation.level,
          activeDefinitionIds: [
            ...currentEvaluation.activeDefinitionIds,
            definitionId,
          ],
          inventory: input.inventory,
          stats: currentEvaluation.stats,
          overlays: currentEvaluation.overlays,
          ...(input.textStrings === undefined
            ? {}
            : { textStrings: input.textStrings }),
          entities: evaluationEntities,
        }).find(
          (power) =>
            power.definitionId.toLocaleLowerCase() ===
              definitionId.toLocaleLowerCase() ||
            (name !== undefined &&
              power.name.toLocaleLowerCase() === name.toLocaleLowerCase()),
        );
      },
    );
  }, [
    abbreviateAbilityValues,
    build,
    currentEvaluation,
    currentEvaluationWithPowers,
    entities,
    expandWeaponDice,
    resolveAbilityChoices,
  ]);
  const carriedWallet =
    build === undefined
      ? undefined
      : resolveCharacterWallet(build, "carried").amount;
  const storedWallet =
    build === undefined
      ? undefined
      : resolveCharacterWallet(build, "stored").amount;
  const characterDetailLevelKey = [
    ...new Set(
      (planningEvaluation?.choices ?? [])
        .filter(isCharacterDetailChoice)
        .map((choice) => choice.level),
    ),
  ]
    .sort((left, right) => left - right)
    .join(",");

  useEffect(() => {
    const client = rulesClient.current;
    if (
      build === undefined ||
      entities.length === 0 ||
      packId === undefined ||
      readyPackId !== packId ||
      client === undefined
    )
      return;
    const revision = evaluationRevision.current + 1;
    evaluationRevision.current = revision;
    setEvaluationStatus("Evaluating current build and plan…");
    const project = (
      projectedBuild: CharacterBuild,
      role: "planning" | "current" | "selected",
    ): EvaluationInput => {
      const startedAt = performance.now();
      const input = projectBuildForEvaluation(projectedBuild, entities);
      recordLoadDuration("build-projection", startedAt, {
        role,
        level: projectedBuild.effectiveLevel,
      });
      return input;
    };
    // Dispatch order determines which evaluation the single rules worker
    // finishes first; see evaluationDispatchOrder. Reuse (which result a tied
    // consumer receives) is unchanged from before this reordering.
    const dispatchOrder = evaluationDispatchOrder(
      build.effectiveLevel,
      selectedLevel,
      planningHorizon,
    );
    const distinctCurrentRequest = dispatchOrder.includes("current")
      ? client.evaluate({
          ...project(projectBuildForLegacyExport(build), "current"),
          candidateDetailLevels: currentCandidateDetailLevels(
            workspaceTab,
            build.effectiveLevel,
            selectedLevel,
          ),
          includePowers: false,
        })
      : undefined;
    const distinctSelectedRequest = dispatchOrder.includes("selected")
      ? client.evaluate({
          ...project({ ...build, effectiveLevel: selectedLevel }, "selected"),
          candidateDetailLevels: selectedCandidateDetailLevels(
            workspaceTab,
            selectedLevel,
          ),
          includePowers: false,
        })
      : undefined;
    const planningRequest = client.evaluate({
      ...project({ ...build, effectiveLevel: planningHorizon }, "planning"),
      candidateDetailLevels: planningCandidateDetailLevels(
        workspaceTab,
        selectedLevel,
        characterDetailLevelKey.split(",").filter(Boolean).map(Number),
      ),
      candidateDetailReplacementChoiceIds:
        expandedReplacementChoiceId === undefined
          ? []
          : [expandedReplacementChoiceId],
      includePowers: false,
    });
    const currentRequest = distinctCurrentRequest ?? planningRequest;
    const selectedLevelRequest =
      distinctSelectedRequest ??
      (selectedLevel === build.effectiveLevel
        ? currentRequest
        : planningRequest);
    const publish = (
      request: Promise<EvaluatedCharacter>,
      setter: (evaluation: EvaluatedCharacter) => void,
    ) =>
      publishEvaluationResult(
        request,
        () => evaluationRevision.current === revision,
        setter,
        (evaluation) => {
          if (firstEvaluationRecorded.current) return;
          firstEvaluationRecorded.current = true;
          recordLoadDuration(
            "character-first-evaluation",
            characterLoadStartedAt.current,
            { characterId, level: evaluation.level },
          );
        },
      );
    const currentPublished = publish(currentRequest, setCurrentEvaluation);
    const planningPublished = publish(planningRequest, setPlanningEvaluation);
    const selectedPublished = publish(
      selectedLevelRequest,
      setSelectedLevelEvaluation,
    );
    void Promise.all([currentPublished, planningPublished, selectedPublished])
      .then(() => {
        if (evaluationRevision.current === revision)
          setEvaluationStatus("Rules up to date");
      })
      .catch((reason: unknown) => {
        if (evaluationRevision.current !== revision) return;
        setEvaluationStatus(
          `Rules evaluation failed: ${reason instanceof Error ? reason.message : String(reason)}`,
        );
      });
  }, [
    build,
    characterId,
    characterDetailLevelKey,
    contentDigest,
    entities,
    expandedReplacementChoiceId,
    packId,
    planningHorizon,
    readyPackId,
    selectedLevel,
    workspaceTab,
  ]);

  const levelChoices = useMemo(
    () => choicesAtLevel(selectedLevel, planningEvaluation),
    [planningEvaluation, selectedLevel],
  );
  const characterDetailChoices = useMemo(
    () =>
      groupChoicesByLegacyWorkflow(
        (planningEvaluation?.choices ?? []).filter(isCharacterDetailChoice),
      ).flatMap(({ choices }) => choices),
    [planningEvaluation],
  );
  const unresolvedCharacterDetailChoices = useMemo(
    () =>
      characterDetailChoices.filter(
        (choice) =>
          choice.level <= (build?.effectiveLevel ?? selectedLevel) &&
          isUnresolvedChoice(choice),
      ),
    [build?.effectiveLevel, characterDetailChoices, selectedLevel],
  );
  const requiredClassDeityChoices = useMemo(
    () => levelChoices.filter(isRequiredClassDeityChoice),
    [levelChoices],
  );
  const forcedAlignment = useMemo(
    () =>
      planningEvaluation === undefined
        ? undefined
        : deityAlignmentConstraint(planningEvaluation, entities),
    [entities, planningEvaluation],
  );
  const mechanicalLevelChoices = useMemo(
    () => levelChoices.filter((choice) => !isCharacterDetailChoice(choice)),
    [levelChoices],
  );
  const buildPresetChoices = useMemo(
    () => mechanicalLevelChoices.filter(isBuildPresetChoice),
    [mechanicalLevelChoices],
  );
  const retrainingChoices = useMemo(
    () => mechanicalLevelChoices.filter(isOptionalRetrainingChoice),
    [mechanicalLevelChoices],
  );
  const primaryLevelChoices = useMemo(
    () =>
      mechanicalLevelChoices.filter(
        (choice) =>
          !isOptionalRetrainingChoice(choice) && !isBuildPresetChoice(choice),
      ),
    [mechanicalLevelChoices],
  );
  const evaluatedLevelOneAbilityChoices = useMemo(
    () =>
      choicesAtLevel(1, selectedLevelEvaluation).filter(
        (choice) =>
          choice.type.trim().toLocaleLowerCase() === "race ability bonus",
      ),
    [selectedLevelEvaluation],
  );
  const raceAbilityChoice = evaluatedLevelOneAbilityChoices[0];
  const evaluatedRaceAbilitySelectionId =
    raceAbilityChoice === undefined || selectedLevelEvaluation === undefined
      ? undefined
      : selectedDefinitionId(raceAbilityChoice, selectedLevelEvaluation);
  const raceAbilitySelectionId =
    raceAbilityChoice !== undefined &&
    pendingLevelOneAbilitySelections.has(raceAbilityChoice.id)
      ? pendingLevelOneAbilitySelections.get(raceAbilityChoice.id)
      : evaluatedRaceAbilitySelectionId;
  const selectedRaceEntity = (() => {
    if (selectedLevelEvaluation === undefined) return undefined;
    const providerOccurrence =
      raceAbilityChoice === undefined
        ? undefined
        : selectedLevelEvaluation.occurrences.find(
            (occurrence) =>
              occurrence.id === raceAbilityChoice.providerOccurrenceId,
          );
    if (providerOccurrence !== undefined)
      return byId.get(providerOccurrence.definitionId.toLocaleLowerCase());
    for (const occurrence of selectedLevelEvaluation.occurrences) {
      const entity = byId.get(occurrence.definitionId.toLocaleLowerCase());
      if (entity?.type.trim().toLocaleLowerCase() === "race") return entity;
    }
    return undefined;
  })();
  useEffect(() => {
    setPendingLevelOneAbilitySelections((current) => {
      const next = new Map(current);
      let changed = false;
      for (const [choiceId, definitionId] of next) {
        const choice = evaluatedLevelOneAbilityChoices.find(
          (candidate) => candidate.id === choiceId,
        );
        if (
          choice === undefined ||
          selectedDefinitionId(choice, selectedLevelEvaluation!) ===
            definitionId
        ) {
          next.delete(choiceId);
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [
    evaluatedLevelOneAbilityChoices,
    rollbackRevision,
    selectedLevelEvaluation,
  ]);
  const pendingLevelOneAbilityDeltas = Object.fromEntries(
    ABILITY_SCORE_NAMES.map((ability) => {
      let delta = 0;
      for (const [
        choiceId,
        optimisticDefinitionId,
      ] of pendingLevelOneAbilitySelections) {
        const choice = evaluatedLevelOneAbilityChoices.find(
          (candidate) => candidate.id === choiceId,
        );
        const evaluatedDefinitionId =
          choice === undefined || selectedLevelEvaluation === undefined
            ? undefined
            : selectedDefinitionId(choice, selectedLevelEvaluation);
        delta +=
          abilityScoreAdjustment(
            optimisticDefinitionId === undefined
              ? undefined
              : byId.get(optimisticDefinitionId.toLocaleLowerCase()),
            ability,
          ) -
          abilityScoreAdjustment(
            evaluatedDefinitionId === undefined
              ? undefined
              : byId.get(evaluatedDefinitionId.toLocaleLowerCase()),
            ability,
          );
      }
      return [ability, delta] as const;
    }),
  );
  const groupedLevelChoices = groupLevelChoices(primaryLevelChoices);
  const repeatedChoiceGroups = groupRepeatedChoiceSlots(
    groupedLevelChoices.ordinary,
  );
  const repeatedGroupByChoiceId = new Map(
    repeatedChoiceGroups.flatMap((group) =>
      group.map((choice) => [choice.id, group] as const),
    ),
  );
  const dependentChoiceFlows = groupDependentChoiceFlows(
    groupedLevelChoices.ordinary.filter(
      (choice) => !repeatedGroupByChoiceId.has(choice.id),
    ),
  ).filter((flow) => flow.length > 1);
  const dependentFlowByChoiceId = new Map(
    dependentChoiceFlows.flatMap((flow) =>
      flow.map((choice) => [choice.id, flow] as const),
    ),
  );
  const presentationChoices = primaryLevelChoices.filter((choice) => {
    if (groupedLevelChoices.backgrounds.includes(choice))
      return choice === groupedLevelChoices.backgrounds[0];
    if (groupedLevelChoices.skillTraining.includes(choice))
      return choice === groupedLevelChoices.skillTraining[0];
    const repeated = repeatedGroupByChoiceId.get(choice.id);
    if (repeated !== undefined) return choice === repeated[0];
    const flow = dependentFlowByChoiceId.get(choice.id);
    return flow === undefined || choice === flow[0];
  });
  const legacyChoiceSections = (() => {
    const sections = groupChoicesByLegacyWorkflow(presentationChoices);
    if (requiredClassDeityChoices.length === 0) return sections;
    const hasClassSection = sections.some(({ section }) => section === "Class");
    if (!hasClassSection)
      return [
        { section: "Class" as const, choices: requiredClassDeityChoices },
        ...sections,
      ];
    return sections.map((group) =>
      group.section === "Class"
        ? {
            ...group,
            choices: [...group.choices, ...requiredClassDeityChoices],
          }
        : group,
    );
  })();
  const abilitySectionIndex = legacyChoiceSections.findIndex(({ section }) =>
    [
      "Ability Scores",
      "Companion",
      "Skills",
      "Powers",
      "Spellbook",
      "Feats",
    ].includes(section),
  );
  const displayedChoiceSections =
    selectedLevel !== 1 ||
    legacyChoiceSections.some(({ section }) => section === "Ability Scores")
      ? legacyChoiceSections
      : [
          ...legacyChoiceSections.slice(
            0,
            abilitySectionIndex < 0
              ? legacyChoiceSections.length
              : abilitySectionIndex,
          ),
          { section: "Ability Scores" as const, choices: [] },
          ...legacyChoiceSections.slice(
            abilitySectionIndex < 0
              ? legacyChoiceSections.length
              : abilitySectionIndex,
          ),
        ];
  const levelSectionTabs: readonly LevelChoiceTab[] = [
    ...displayedChoiceSections.map(({ section }) => section),
    ...(retrainingChoices.length === 0 ? [] : (["Retraining"] as const)),
  ];
  const selectedChoiceSection = displayedChoiceSections.find(({ choices }) =>
    choices.some((choice) => choice.id === selectedChoiceId),
  )?.section;
  const preferredLevelSection =
    displayedChoiceSections.find(
      ({ section, choices }) =>
        (section === "Ability Scores" &&
          selectedLevel === 1 &&
          abilityScoresIncomplete) ||
        choices.some(isUnresolvedChoice),
    )?.section ?? levelSectionTabs[0];
  const requestedLevelSection =
    selectedSectionByLevel[selectedLevel] ??
    (selectedChoiceSection === undefined ? undefined : selectedChoiceSection);
  const activeLevelSection =
    requestedLevelSection !== undefined &&
    levelSectionTabs.includes(requestedLevelSection)
      ? requestedLevelSection
      : preferredLevelSection;
  const activeChoiceSection = displayedChoiceSections.find(
    ({ section }) => section === activeLevelSection,
  );
  const activeSectionChoices =
    activeLevelSection === "Retraining"
      ? retrainingChoices
      : (activeChoiceSection?.choices ?? []);
  const activeSectionRequiredChoices =
    activeLevelSection === "Retraining"
      ? retrainingChoices
      : [
          ...primaryLevelChoices.filter(
            (choice) => legacyChoiceSection(choice) === activeLevelSection,
          ),
          ...(activeLevelSection === "Class" ? requiredClassDeityChoices : []),
        ];
  const activeSectionComplete = choiceSectionComplete(
    activeSectionRequiredChoices,
    activeLevelSection === "Ability Scores" &&
      selectedLevel === 1 &&
      abilityScoresIncomplete
      ? 1
      : 0,
  );
  const nextLevelMechanicalChoices = choicesAtLevel(
    selectedLevel + 1,
    planningEvaluation,
  ).filter(
    (choice) =>
      !isCharacterDetailChoice(choice) && !isBuildPresetChoice(choice),
  );
  const nextLevelPrimaryChoices = nextLevelMechanicalChoices.filter(
    (choice) => !isOptionalRetrainingChoice(choice),
  );
  const nextLevelSectionTabs: readonly LevelChoiceTab[] = [
    ...groupChoicesByLegacyWorkflow(nextLevelPrimaryChoices).map(
      ({ section }) => section,
    ),
    ...(nextLevelMechanicalChoices.some(isOptionalRetrainingChoice)
      ? (["Retraining"] as const)
      : []),
  ];
  const nextChoiceDestination =
    activeLevelSection === undefined
      ? undefined
      : nextLevelChoiceDestination(
          selectedLevel,
          activeLevelSection,
          levelSectionTabs,
          nextLevelSectionTabs,
          build?.effectiveLevel ?? 0,
        );
  const classChoicePlacementId = activeChoiceSection?.choices.find((choice) =>
    ["class", "hybrid class"].includes(choice.type.trim().toLocaleLowerCase()),
  )?.id;
  useEffect(() => {
    if (activeSectionChoices.some((choice) => choice.id === selectedChoiceId))
      return;
    setSelectedChoiceId(
      activeSectionChoices.find(isUnresolvedChoice)?.id ??
        activeSectionChoices[0]?.id,
    );
  }, [activeSectionChoices, selectedChoiceId]);

  useEffect(() => {
    if (
      character === undefined ||
      navigation.workspace !== "build" ||
      (navigationLevel !== undefined && navigationLevel !== selectedLevel)
    )
      return;
    const canonicalSection =
      activeLevelSection === undefined
        ? undefined
        : levelChoiceTabSlug(activeLevelSection);
    // Skip when the URL already matches: replacing history with an identical
    // target can otherwise oscillate against the effect that reads the URL's
    // section back into selectedSectionByLevel, looping the two indefinitely.
    if (
      navigationLevel === selectedLevel &&
      navigationSection === canonicalSection
    )
      return;
    const canonical: BuilderNavigation = {
      workspace: "build",
      level: selectedLevel,
      ...(canonicalSection === undefined ? {} : { section: canonicalSection }),
    };
    onNavigate(characterId, canonical, true);
  }, [
    activeLevelSection,
    character,
    characterId,
    navigationLevel,
    navigationSection,
    navigation.workspace,
    onNavigate,
    selectedLevel,
  ]);

  useEffect(() => {
    setInspectedOption(undefined);
    setExpandedReplacementChoiceId(undefined);
  }, [selectedLevel]);

  function dispatch(command: CharacterCommand): void {
    const active = transaction.current;
    const queue = saveQueue.current;
    if (active === undefined || queue === undefined) return;
    try {
      const next = active.dispatch(command);
      setEvaluationStatus("Evaluating current build and plan…");
      setRevision((value) => value + 1);
      queue.enqueue(next, "Saved locally");
    } catch (reason: unknown) {
      setSaveState({
        phase: "failed",
        message: `Change rejected: ${reason instanceof Error ? reason.message : String(reason)}`,
      });
    }
  }

  useEffect(() => {
    if (forcedAlignment === undefined || planningEvaluation === undefined) {
      pendingForcedAlignmentKey.current = undefined;
      return;
    }
    const dispatchKey = `${forcedAlignment.alignmentChoice.id}\0${forcedAlignment.deityName}\0${forcedAlignment.alignmentCandidate.definitionId}`;
    if (
      selectedDefinitionId(
        forcedAlignment.alignmentChoice,
        planningEvaluation,
      ) === forcedAlignment.alignmentCandidate.definitionId
    ) {
      pendingForcedAlignmentKey.current = undefined;
      return;
    }
    if (
      build === undefined ||
      pendingForcedAlignmentKey.current === dispatchKey
    )
      return;
    const definition = byId.get(
      forcedAlignment.alignmentCandidate.definitionId.toLocaleLowerCase(),
    );
    const provider = planningEvaluation.occurrences.find(
      (occurrence) =>
        occurrence.id === forcedAlignment.alignmentChoice.providerOccurrenceId,
    );
    const buildProvider = findOccurrence(
      build,
      forcedAlignment.alignmentChoice.providerOccurrenceId,
    );
    if (definition === undefined) return;
    const command = commandForEvaluatedChoice(
      build,
      forcedAlignment.alignmentChoice,
      planningEvaluation.occurrences,
      entities,
      {
        id: `web:${crypto.randomUUID()}`,
        identity: {
          definitionId: definition.id,
          name: definition.name,
          type: definition.type,
        },
        acquiredLevel:
          buildProvider?.acquiredLevel ??
          provider?.acquiredLevel ??
          planningEvaluation.level,
        legality: forcedAlignment.alignmentCandidate.eligible
          ? "rules-legal"
          : "houserule",
        children: [],
        unresolved: false,
      },
      (index) => `web:placeholder:${index}:${crypto.randomUUID()}`,
    );
    if (command !== undefined) {
      pendingForcedAlignmentKey.current = dispatchKey;
      dispatch(command);
    }
  }, [build, byId, entities, forcedAlignment, planningEvaluation]);

  function selectRaceAbilityBonus(
    choice: EvaluatedChoice,
    definitionId: string | undefined,
  ): void {
    if (selectedLevelEvaluation === undefined || build === undefined) return;
    let command: CharacterCommand | undefined;
    if (definitionId === undefined) {
      command = unresolveEvaluatedChoiceCommand(
        build,
        choice,
        selectedLevelEvaluation,
        entities,
        `web:placeholder:${crypto.randomUUID()}`,
      );
    } else {
      const candidate = choice.candidates.find(
        (item) => item.definitionId === definitionId,
      );
      const definition = byId.get(definitionId.toLocaleLowerCase());
      const provider = selectedLevelEvaluation.occurrences.find(
        (occurrence) => occurrence.id === choice.providerOccurrenceId,
      );
      const buildProvider = findOccurrence(build, choice.providerOccurrenceId);
      if (
        definition === undefined ||
        (candidate !== undefined && !isCandidateSelectable(candidate))
      )
        return;
      command = commandForEvaluatedChoice(
        build,
        choice,
        selectedLevelEvaluation.occurrences,
        entities,
        {
          id: `web:${crypto.randomUUID()}`,
          identity: {
            definitionId: definition.id,
            name: definition.name,
            type: definition.type,
          },
          acquiredLevel:
            buildProvider?.acquiredLevel ??
            provider?.acquiredLevel ??
            selectedLevelEvaluation.level,
          legality:
            candidate === undefined || candidate.eligible
              ? "rules-legal"
              : "houserule",
          children: [],
          unresolved: false,
        },
        (index) => `web:placeholder:${index}:${crypto.randomUUID()}`,
      );
    }
    if (command === undefined) return;
    setPendingLevelOneAbilitySelections((current) => {
      const next = new Map(current);
      next.set(choice.id, definitionId);
      return next;
    });
    dispatch(command);
  }

  function undo(): void {
    const active = transaction.current;
    const queue = saveQueue.current;
    if (active === undefined || queue === undefined || !active.canUndo) return;
    const next = active.undo();
    setEvaluationStatus("Evaluating current build and plan…");
    setRevision((value) => value + 1);
    queue.enqueue(next, "Undo saved locally");
  }

  function redo(): void {
    const active = transaction.current;
    const queue = saveQueue.current;
    if (active === undefined || queue === undefined || !active.canRedo) return;
    const next = active.redo();
    setEvaluationStatus("Evaluating current build and plan…");
    setRevision((value) => value + 1);
    queue.enqueue(next, "Redo saved locally");
  }

  if (loadError !== undefined)
    return (
      <main className="editor-page" id="main-content">
        <div className="error" role="alert">
          {loadError}
        </div>
      </main>
    );
  if (character === undefined || build === undefined)
    return (
      <main className="editor-page loading-state" id="main-content">
        Loading character build…
      </main>
    );

  const saving = saveState.phase === "saving";
  const entityOfType = (type: string) =>
    currentEvaluation?.occurrences
      .map((occurrence) =>
        byId.get(occurrence.definitionId.toLocaleLowerCase()),
      )
      .find(
        (entity) =>
          entity?.type.toLocaleLowerCase() === type.toLocaleLowerCase(),
      );
  const race = entityOfType("Race")?.name ?? character.snapshot.details.Race;
  const selectedClass = entityOfType("Class") ?? entityOfType("Hybrid Class");
  const selectedClassKeyAbilities = classKeyAbilities(selectedClass);
  const keyAbilitiesSentence = classKeyAbilitiesSentence(
    selectedClass,
    selectedClassKeyAbilities,
  );
  const builderIssues = builderIssueGroups({
    evaluation: planningEvaluation,
    byId,
    effectiveLevel: build.effectiveLevel,
    planningHorizon,
    abilityScoresIncomplete,
    abilityScoresHouseRuled,
  });
  const totalUnresolved = builderIssues.unresolved.length;
  const warningCount = builderIssues.warnings.length;
  const errorCount = builderIssues.errors.length;
  const houseRuleCount = builderIssues.houseRules.length;
  const navigateToDiagnosticIssue = (issue: BuilderIssue): void => {
    if (issue.target?.kind === "abilities") {
      setSelectedLevel(1);
      setSelectedSectionByLevel((current) => ({
        ...current,
        1: "Ability Scores",
      }));
      onNavigate(characterId, {
        workspace: "build",
        level: 1,
        section: "ability-scores",
      });
      return;
    }
    const target = issue.target;
    if (target?.kind !== "choice") return;
    const choice = planningEvaluation?.choices.find(
      (candidate) => candidate.id === target.choiceId,
    );
    if (choice === undefined) return;
    if (isCharacterDetailChoice(choice)) {
      setSelectedChoiceId(choice.id);
      onNavigate(characterId, { workspace: "details" });
      return;
    }
    const section = isOptionalRetrainingChoice(choice)
      ? "Retraining"
      : legacyChoiceSection(choice);
    setSelectedLevel(choice.level);
    setSelectedChoiceId(choice.id);
    setSelectedSectionByLevel((current) => ({
      ...current,
      [choice.level]: section,
    }));
    onNavigate(characterId, {
      workspace: "build",
      level: choice.level,
      section: levelChoiceTabSlug(section),
    });
  };
  const activateLevelSection = (section: LevelChoiceTab): void => {
    setSelectedSectionByLevel((current) => ({
      ...current,
      [selectedLevel]: section,
    }));
    setInspectedOption(undefined);
    const sectionChoices =
      section === "Retraining"
        ? retrainingChoices
        : (displayedChoiceSections.find((group) => group.section === section)
            ?.choices ?? []);
    setSelectedChoiceId(
      sectionChoices.find(isUnresolvedChoice)?.id ?? sectionChoices[0]?.id,
    );
    onNavigate(characterId, {
      workspace: "build",
      level: selectedLevel,
      section: levelChoiceTabSlug(section),
    });
  };

  const selectLevel = (
    level: number,
    requestedSection?: LevelChoiceTab,
  ): void => {
    try {
      const command = planningHorizonCommand(
        build,
        level,
        entities,
        (addedLevel) => `web:level:${addedLevel}:${crypto.randomUUID()}`,
      );
      if (command !== undefined) dispatch(command);
      const choices = choicesAtLevel(level, planningEvaluation).filter(
        (choice) =>
          (!isCharacterDetailChoice(choice) ||
            isRequiredClassDeityChoice(choice)) &&
          !isBuildPresetChoice(choice),
      );
      const retraining = choices.filter(isOptionalRetrainingChoice);
      const primary = choices.filter(
        (choice) => !isOptionalRetrainingChoice(choice),
      );
      const ordered = groupChoicesByLegacyWorkflow(primary).flatMap(
        ({ choices: sectionChoices }) => sectionChoices,
      );
      const rememberedSection =
        requestedSection ?? selectedSectionByLevel[level];
      const destinationChoices =
        rememberedSection === "Retraining"
          ? retraining
          : rememberedSection === undefined
            ? ordered
            : ordered.filter(
                (choice) =>
                  (isRequiredClassDeityChoice(choice)
                    ? "Class"
                    : legacyChoiceSection(choice)) === rememberedSection,
              );
      setSelectedLevel(level);
      setSelectedChoiceId(
        destinationChoices.find(isUnresolvedChoice)?.id ??
          destinationChoices[0]?.id,
      );
      if (requestedSection !== undefined)
        setSelectedSectionByLevel((current) => ({
          ...current,
          [level]: requestedSection,
        }));
      onNavigate(characterId, {
        workspace: "build",
        level,
        ...(rememberedSection === undefined
          ? {}
          : { section: levelChoiceTabSlug(rememberedSection) }),
      });
    } catch (reason: unknown) {
      setSaveState({
        phase: "failed",
        message: reason instanceof Error ? reason.message : String(reason),
      });
    }
  };

  const advanceToNextChoiceSection = (): void => {
    if (!activeSectionComplete || nextChoiceDestination === undefined) return;
    if (nextChoiceDestination.level === selectedLevel)
      activateLevelSection(nextChoiceDestination.section);
    else
      selectLevel(nextChoiceDestination.level, nextChoiceDestination.section);
    requestAnimationFrame(() =>
      document
        .getElementById(
          `level-${nextChoiceDestination.level}-${levelChoiceTabSlug(nextChoiceDestination.section)}-tab`,
        )
        ?.focus(),
    );
  };

  const changeCurrentLevel = (level: number): void => {
    try {
      if (level > build.levels.length) {
        dispatch(
          jumpToLevelCommand(
            build,
            level,
            entities,
            (addedLevel) => `web:level:${addedLevel}:${crypto.randomUUID()}`,
          ),
        );
      } else {
        dispatch({ kind: "set-effective-level", level });
      }
      setSelectedLevel(level);
      setExpandedTiers(new Set([characterTierAtLevel(level)]));
      if (workspaceTab === "build")
        onNavigate(characterId, { workspace: "build", level }, true);
    } catch (reason: unknown) {
      setSaveState({
        phase: "failed",
        message: reason instanceof Error ? reason.message : String(reason),
      });
    }
  };

  const renderPrimaryChoice = (
    choice: EvaluatedChoice,
    omitIndividualHeading = false,
  ) => {
    if (planningEvaluation === undefined) return null;
    if (groupedLevelChoices.backgrounds.includes(choice))
      return choice === groupedLevelChoices.backgrounds[0] ? (
        <BackgroundChoiceGroup
          key="backgrounds"
          choices={groupedLevelChoices.backgrounds}
          evaluation={planningEvaluation}
          build={build}
          entities={entities}
          byId={byId}
          rollbackRevision={rollbackRevision}
          onDispatch={dispatch}
        />
      ) : null;
    if (groupedLevelChoices.skillTraining.includes(choice))
      return choice === groupedLevelChoices.skillTraining[0] ? (
        <SkillTrainingEditor
          key="skill-training"
          choices={groupedLevelChoices.skillTraining}
          evaluation={planningEvaluation}
          build={build}
          entities={entities}
          byId={byId}
          rollbackRevision={rollbackRevision}
          onDispatch={dispatch}
        />
      ) : null;
    const repeated = repeatedGroupByChoiceId.get(choice.id);
    if (repeated !== undefined)
      return choice !== repeated[0] ? null : repeated.every((item) =>
          isAbilityIncreaseChoiceType(item.type),
        ) ? (
        selectedLevelEvaluation === undefined ? null : (
          <AbilityIncreaseEditor
            key={choice.id}
            choices={repeated}
            evaluation={selectedLevelEvaluation}
            build={build}
            entities={entities}
            byId={byId}
            keyAbilities={selectedClassKeyAbilities}
            keyAbilitiesSentence={keyAbilitiesSentence}
            rollbackRevision={rollbackRevision}
            onDispatch={dispatch}
          />
        )
      ) : (
        <RepeatedChoiceGroup
          key={choice.id}
          choices={repeated}
          evaluation={planningEvaluation}
          build={build}
          entities={entities}
          byId={byId}
          rollbackRevision={rollbackRevision}
          onDispatch={dispatch}
        />
      );
    const flow = dependentFlowByChoiceId.get(choice.id);
    if (flow !== undefined)
      return choice === flow[0] ? (
        <ChoiceFlowSection
          key={choice.id}
          choices={flow}
          evaluation={planningEvaluation}
          build={build}
          entities={entities}
          byId={byId}
          rollbackRevision={rollbackRevision}
          onDispatch={dispatch}
        />
      ) : null;
    const houseRule = selectedChoiceIsHouseRule(choice, planningEvaluation);
    return (
      <section
        {...(omitIndividualHeading
          ? {
              "aria-label": contextualChoiceTitle(
                choice,
                planningEvaluation,
                byId,
              ),
            }
          : { "aria-labelledby": `${choiceSectionId(choice.id)}-heading` })}
        className={`level-choice-section${selectedLevel <= build.effectiveLevel && isUnresolvedChoice(choice) ? " choice-section-incomplete" : ""}`}
        id={choiceSectionId(choice.id)}
        key={choice.id}
        tabIndex={-1}
      >
        {omitIndividualHeading ? null : (
          <header>
            <div>
              <h4
                className="selection-section-heading"
                id={`${choiceSectionId(choice.id)}-heading`}
              >
                {contextualChoiceTitle(choice, planningEvaluation, byId)}
              </h4>
            </div>
            {houseRule ? (
              <span className="attention-badge">
                <Icon name="house" /> House rule
              </span>
            ) : isUnresolvedChoice(choice) ? (
              <span className="visually-hidden">Incomplete</span>
            ) : null}
          </header>
        )}
        <ChoiceEditor
          choice={choice}
          evaluation={planningEvaluation}
          build={build}
          entities={entities}
          byId={byId}
          disabled={false}
          hideSelectionLabel
          keyAbilities={
            legacyChoiceSection(choice) === "Ability Scores"
              ? selectedClassKeyAbilities
              : []
          }
          rollbackRevision={rollbackRevision}
          {...(choice.type.trim().toLocaleLowerCase() === "race ability bonus"
            ? {
                onOptimisticSelectionChange: (
                  definitionId: string | undefined,
                ) =>
                  setPendingLevelOneAbilitySelections((current) => {
                    const next = new Map(current);
                    next.set(choice.id, definitionId);
                    return next;
                  }),
              }
            : {})}
          onDispatch={dispatch}
        />
      </section>
    );
  };

  const diagnosticGroups: readonly {
    title: string;
    description: string;
    issues: readonly BuilderIssue[];
  }[] = [
    {
      title: "Unresolved choices",
      description:
        "Required choices that must be completed for the character's current level.",
      issues: builderIssues.unresolved,
    },
    {
      title: "Errors",
      description: "Problems that prevent reliable rules evaluation.",
      issues: builderIssues.errors,
    },
    {
      title: "Warnings",
      description:
        "Rules the evaluator preserved but cannot fully verify or calculate.",
      issues: builderIssues.warnings,
    },
    {
      title: "House rules",
      description:
        "Intentional departures from standard character-building rules.",
      issues: builderIssues.houseRules,
    },
  ];

  return (
    <main
      aria-busy={saving}
      className="editor-page modern-builder"
      id="main-content"
    >
      <header className="builder-heading">
        <div className="builder-character-heading">
          <PortraitEditor
            compact
            name={character.title}
            portrait={character.portrait}
            onSave={async (portrait) => {
              setCharacter(
                await characters.updateMetadata(characterId, { portrait }),
              );
            }}
          />
          <div>
            <h2 className="builder-character-name-heading">
              <CharacterTextField
                className="builder-character-name"
                label="Character name"
                name="Name"
                value={build.textStrings.Name || character.title}
                visuallyHideLabel
                onDispatch={dispatch}
              />
            </h2>
            <p className="builder-character-facts">
              {characterHeaderSubtitle(
                race,
                selectedClass?.name || character.snapshot.details.Class,
                build.effectiveLevel,
              )}
            </p>
          </div>
        </div>
        <BuilderHeaderStats evaluation={currentEvaluation} />
      </header>

      {shouldShowBoundProfileWarning(boundProfileResolution) ? (
        <div className="profile-warning panel-warning">
          <Icon name="warning" /> Install or restore this character&apos;s bound
          content profile to evaluate choices. Its authoritative history remains
          editable.
        </div>
      ) : null}

      {evaluationStatus.startsWith("Rules evaluation failed") ? (
        <div className="error" role="alert">
          {evaluationStatus}
        </div>
      ) : null}

      <div className="builder-tabs-bar">
        <div
          aria-label="Character editor sections"
          className="builder-tabs"
          role="tablist"
        >
          <button
            aria-selected={workspaceTab === "build"}
            role="tab"
            type="button"
            onClick={() =>
              onNavigate(characterId, {
                workspace: "build",
                level: selectedLevel,
                ...(activeLevelSection === undefined
                  ? {}
                  : { section: levelChoiceTabSlug(activeLevelSection) }),
              })
            }
          >
            <Icon name="level" /> Build
          </button>
          <button
            aria-selected={workspaceTab === "overview"}
            role="tab"
            type="button"
            onClick={() => onNavigate(characterId, { workspace: "overview" })}
          >
            <Icon name="book" /> Overview
          </button>
          <button
            aria-selected={workspaceTab === "details"}
            role="tab"
            type="button"
            onClick={() => onNavigate(characterId, { workspace: "details" })}
          >
            <Icon name="details" /> Character details
            {unresolvedCharacterDetailChoices.length > 0 ? (
              <span
                aria-label="Character details has unresolved required choices"
                className="tab-attention"
                title="Character details has unresolved required choices"
              >
                <Icon name="circle-help" />
              </span>
            ) : null}
          </button>
          <button
            aria-selected={workspaceTab === "equipment"}
            role="tab"
            type="button"
            onClick={() =>
              onNavigate(characterId, {
                workspace: "equipment",
              })
            }
          >
            <Icon name="item" /> Equipment
          </button>
          <button
            aria-selected={workspaceTab === "shop"}
            role="tab"
            type="button"
            onClick={() => onNavigate(characterId, { workspace: "shop" })}
          >
            <Icon name="shopping-cart" /> Shop
          </button>
          <a
            aria-selected="false"
            className="builder-tab"
            href={`#/characters/${encodeURIComponent(characterId)}`}
            role="tab"
          >
            <Icon name="sheet" /> Character sheet
          </a>
          <button
            aria-selected={workspaceTab === "diagnostics"}
            role="tab"
            type="button"
            onClick={() =>
              onNavigate(characterId, { workspace: "diagnostics" })
            }
          >
            <Icon name="warning" /> Diagnostics
          </button>
        </div>
        <div aria-label="Builder status" className="builder-status">
          {totalUnresolved > 0 ? (
            <span
              aria-label={`${totalUnresolved} unresolved ${totalUnresolved === 1 ? "choice" : "choices"}`}
              className="builder-health builder-health-attention"
              title={`${totalUnresolved} unresolved ${totalUnresolved === 1 ? "choice" : "choices"}`}
            >
              <Icon name="circle-help" />
              <span aria-hidden="true">{totalUnresolved}</span>
            </span>
          ) : null}
          {warningCount > 0 ? (
            <span
              aria-label={`${warningCount} ${warningCount === 1 ? "warning" : "warnings"}`}
              className="builder-health builder-health-warning"
              title={`${warningCount} ${warningCount === 1 ? "warning" : "warnings"}`}
            >
              <Icon name="warning" />
              <span aria-hidden="true">{warningCount}</span>
            </span>
          ) : null}
          {errorCount > 0 ? (
            <span
              aria-label={`${errorCount} ${errorCount === 1 ? "error" : "errors"}`}
              className="builder-health builder-health-error"
              title={`${errorCount} ${errorCount === 1 ? "evaluation error" : "evaluation errors"}`}
            >
              <Icon name="circle-x" />
              <span aria-hidden="true">{errorCount}</span>
            </span>
          ) : null}
          {houseRuleCount > 0 ? (
            <span
              aria-label={`${houseRuleCount} ${houseRuleCount === 1 ? "house rule" : "house rules"}`}
              className="builder-health builder-health-house-rule"
              title={`${houseRuleCount} ${houseRuleCount === 1 ? "house rule" : "house rules"}`}
            >
              <Icon name="house" />
              <span aria-hidden="true">{houseRuleCount}</span>
            </span>
          ) : null}
          <span
            aria-live={saveState.phase === "failed" ? "assertive" : "polite"}
            className={`save-status save-${saveState.phase}`}
            role={saveState.phase === "failed" ? "alert" : "status"}
            title={saveState.message}
          >
            <Icon name={saveStateIconName(saveState.phase)} />
            <span className="visually-hidden">{saveState.message}</span>
          </span>
          <button
            aria-label="Undo"
            className="icon-only-button button-icon"
            type="button"
            disabled={!transaction.current?.canUndo}
            title="Undo"
            onClick={undo}
          >
            <Icon name="undo" />
          </button>
          <button
            aria-label="Redo"
            className="icon-only-button button-icon"
            type="button"
            disabled={!transaction.current?.canRedo}
            title="Redo"
            onClick={redo}
          >
            <Icon name="redo" />
          </button>
        </div>
      </div>

      <div
        className="builder-workspace"
        hidden={workspaceTab !== "build" && workspaceTab !== "overview"}
      >
        <nav
          aria-label="Level plan"
          className="level-rail"
          hidden={workspaceTab !== "build"}
        >
          <ol className="level-tier-list">
            {CHARACTER_TIERS.map((tier) => {
              const expanded = expandedTiers.has(tier.id);
              return (
                <li className="level-tier" key={tier.id}>
                  <button
                    aria-expanded={expanded}
                    className="level-tier-toggle"
                    type="button"
                    onClick={() =>
                      setExpandedTiers((current) => {
                        const next = new Set(current);
                        if (next.has(tier.id)) next.delete(tier.id);
                        else next.add(tier.id);
                        return next;
                      })
                    }
                  >
                    <Icon name="chevron" />
                    <span>{tier.label}</span>
                  </button>
                  {expanded ? (
                    <ol>
                      {Array.from(
                        { length: tier.lastLevel - tier.firstLevel + 1 },
                        (_, index) => tier.firstLevel + index,
                      ).map((level) => {
                        const choices = choicesAtLevel(
                          level,
                          planningEvaluation,
                        );
                        const timelineChoices = choices.filter(
                          (choice) =>
                            !isOptionalRetrainingChoice(choice) &&
                            (!isCharacterDetailChoice(choice) ||
                              isRequiredClassDeityChoice(choice)) &&
                            !isBuildPresetChoice(choice),
                        );
                        const progress = levelChoiceProgress(timelineChoices);
                        const unresolved =
                          timelineChoices.filter(isUnresolvedChoice).length +
                          (level === 1 && abilityScoresIncomplete ? 1 : 0);
                        const warnings =
                          timelineChoices.filter((choice) =>
                            selectedChoiceHasWarning(
                              choice,
                              planningEvaluation!,
                            ),
                          ).length +
                          (level === 1 && abilityScoresHouseRuled ? 1 : 0);
                        const choiceStatus = levelRailChoiceStatus(
                          timelineChoices,
                          level <= build.effectiveLevel,
                          level === 1 && abilityScoresIncomplete ? 1 : 0,
                        );
                        const status =
                          choiceStatus === "complete" && warnings > 0
                            ? "warning"
                            : choiceStatus;
                        const statusLabel =
                          status === "future"
                            ? "no choices made"
                            : status === "planned-complete"
                              ? `all ${progress.required} choices complete`
                              : status === "planned-partial"
                                ? `${progress.completed} of ${progress.required} choices complete`
                                : status === "incomplete"
                                  ? `${unresolved} unresolved`
                                  : status === "warning"
                                    ? `${warnings} warnings`
                                    : "complete";
                        return (
                          <li key={level}>
                            <button
                              aria-current={
                                level === selectedLevel ? "step" : undefined
                              }
                              aria-label={`Level ${level}, ${statusLabel}`}
                              title={`Level ${level}: ${statusLabel}`}
                              className={`level-rail-button level-rail-${status}`}
                              disabled={entities.length === 0}
                              type="button"
                              onClick={() => selectLevel(level)}
                            >
                              <span>{level}</span>
                              <span
                                aria-hidden="true"
                                className="level-rail-status"
                              />
                            </button>
                          </li>
                        );
                      })}
                    </ol>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </nav>

        <div className="overview-pane" hidden={workspaceTab !== "overview"}>
          <CharacterOverview
            abilityStatus={
              abilityScoresIncomplete
                ? "unresolved"
                : abilityScoresHouseRuled
                  ? "warning"
                  : "complete"
            }
            abilitySummary={
              abilityPointBuy.legal
                ? "Point buy complete"
                : abilityScoresHouseRuled
                  ? "House rule"
                  : `${abilityPointBuy.remaining ?? 22} ${abilityPointBuy.remaining === 1 ? "point" : "points"} left`
            }
            build={build}
            byId={byId}
            evaluation={planningEvaluation}
            selectedChoiceId={selectedChoiceId}
            showPlanned={showPlannedOverview}
            onNavigateAbilities={() => {
              setSelectedLevel(1);
              setSelectedSectionByLevel((current) => ({
                ...current,
                1: "Ability Scores",
              }));
              onNavigate(characterId, {
                workspace: "build",
                level: 1,
                section: "ability-scores",
              });
            }}
            onNavigateChoice={(choice) => {
              setSelectedLevel(choice.level);
              setSelectedChoiceId(choice.id);
              setSelectedSectionByLevel((current) => ({
                ...current,
                [choice.level]: isOptionalRetrainingChoice(choice)
                  ? "Retraining"
                  : legacyChoiceSection(choice),
              }));
              onNavigate(characterId, {
                workspace: "build",
                level: choice.level,
                section: levelChoiceTabSlug(
                  isOptionalRetrainingChoice(choice)
                    ? "Retraining"
                    : legacyChoiceSection(choice),
                ),
              });
            }}
            onShowPlannedChange={setShowPlannedOverview}
          />
        </div>

        <section
          aria-label={`Level ${selectedLevel}`}
          className="choice-pane"
          hidden={workspaceTab !== "build"}
        >
          {planningEvaluation === undefined ? (
            <p>
              {entities.length === 0
                ? "Content is unavailable for planning."
                : `Evaluating choices through level ${planningHorizon}…`}
            </p>
          ) : levelChoices.length === 0 && selectedLevel !== 1 ? (
            <div className="choice-empty-state">
              <Icon name="check" />
              <h4>No choices need attention at level {selectedLevel}</h4>
              <p>
                Select another level from the timeline or review the completed
                history below.
              </p>
            </div>
          ) : (
            <div className="level-choice-tabs-layout">
              <div className="level-choice-tab-bar">
                <h3>Level {selectedLevel}</h3>
                <div
                  aria-label={`Level ${selectedLevel} choice sections`}
                  className="level-choice-tabs"
                  role="tablist"
                >
                  {levelSectionTabs.map((section, index) => {
                    const sectionChoices =
                      section === "Retraining"
                        ? retrainingChoices
                        : (displayedChoiceSections.find(
                            (group) => group.section === section,
                          )?.choices ?? []);
                    const incomplete =
                      selectedLevel <= build.effectiveLevel &&
                      ((section === "Ability Scores" &&
                        selectedLevel === 1 &&
                        abilityScoresIncomplete) ||
                        sectionChoices.some(isUnresolvedChoice));
                    const warning =
                      (section === "Ability Scores" &&
                        selectedLevel === 1 &&
                        abilityScoresHouseRuled) ||
                      sectionChoices.some((choice) =>
                        selectedChoiceHasWarning(choice, planningEvaluation),
                      );
                    const tabId = `level-${selectedLevel}-${levelChoiceTabSlug(section)}-tab`;
                    const panelId = `level-${selectedLevel}-${levelChoiceTabSlug(section)}-panel`;
                    return (
                      <button
                        aria-controls={panelId}
                        aria-selected={section === activeLevelSection}
                        className={`${incomplete ? "choice-tab-incomplete" : ""}${warning ? " choice-tab-warning" : ""}`}
                        id={tabId}
                        key={section}
                        role="tab"
                        tabIndex={section === activeLevelSection ? 0 : -1}
                        type="button"
                        onClick={() => activateLevelSection(section)}
                        onKeyDown={(event) => {
                          const direction =
                            event.key === "ArrowRight"
                              ? 1
                              : event.key === "ArrowLeft"
                                ? -1
                                : 0;
                          const targetIndex =
                            event.key === "Home"
                              ? 0
                              : event.key === "End"
                                ? levelSectionTabs.length - 1
                                : direction === 0
                                  ? -1
                                  : (index +
                                      direction +
                                      levelSectionTabs.length) %
                                    levelSectionTabs.length;
                          if (targetIndex < 0) return;
                          event.preventDefault();
                          const target = levelSectionTabs[targetIndex]!;
                          activateLevelSection(target);
                          requestAnimationFrame(() =>
                            document
                              .getElementById(
                                `level-${selectedLevel}-${levelChoiceTabSlug(target)}-tab`,
                              )
                              ?.focus(),
                          );
                        }}
                      >
                        <Icon
                          name={
                            section === "Retraining"
                              ? "undo"
                              : choiceSectionIcon(section)
                          }
                        />
                        <span>{section}</span>
                        {warning ? (
                          <>
                            <Icon name="warning" />
                            <span className="visually-hidden">Warning</span>
                          </>
                        ) : incomplete ? (
                          <>
                            <span
                              aria-hidden="true"
                              className="choice-tab-status"
                            />
                            <span className="visually-hidden">Incomplete</span>
                          </>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="level-choice-workspace">
                <CandidateInspectionScope
                  key={`${workspaceTab === "build" ? "open" : "closed"}:${selectedLevel}:${activeLevelSection ?? "empty"}`}
                  onInspect={setInspectedOption}
                >
                  <div className="level-choice-page">
                    {activeLevelSection === "Retraining" ? (
                      <section
                        aria-labelledby={`level-${selectedLevel}-retraining-tab`}
                        className="level-choice-tab-panel"
                        id={`level-${selectedLevel}-retraining-panel`}
                        role="tabpanel"
                      >
                        <RetrainingControls
                          choices={retrainingChoices}
                          evaluation={planningEvaluation}
                          build={build}
                          entities={entities}
                          byId={byId}
                          rollbackRevision={rollbackRevision}
                          onRequestDetails={setExpandedReplacementChoiceId}
                          onDispatch={dispatch}
                        />
                        <footer className="level-choice-navigation">
                          <button
                            disabled={
                              !activeSectionComplete ||
                              nextChoiceDestination === undefined
                            }
                            title={
                              !activeSectionComplete
                                ? "Complete the required choices in this section to continue"
                                : nextChoiceDestination === undefined
                                  ? "No next section at the character's current level"
                                  : undefined
                            }
                            type="button"
                            onClick={advanceToNextChoiceSection}
                          >
                            Next
                          </button>
                        </footer>
                      </section>
                    ) : activeChoiceSection === undefined ? null : (
                      <section
                        aria-labelledby={`level-${selectedLevel}-${levelChoiceTabSlug(activeChoiceSection.section)}-tab`}
                        className="level-choice-tab-panel"
                        id={`level-${selectedLevel}-${levelChoiceTabSlug(activeChoiceSection.section)}-panel`}
                        role="tabpanel"
                      >
                        <div className="legacy-choice-list">
                          {activeChoiceSection.section === "Ability Scores" &&
                          selectedLevel === 1 ? (
                            selectedLevelEvaluation === undefined ? null : (
                              <BaseAbilityScoreEditor
                                build={build}
                                evaluation={selectedLevelEvaluation}
                                pendingBonusDeltas={
                                  pendingLevelOneAbilityDeltas
                                }
                                keyAbilities={selectedClassKeyAbilities}
                                keyAbilitiesSentence={keyAbilitiesSentence}
                                race={selectedRaceEntity}
                                raceAbilityChoice={raceAbilityChoice}
                                raceAbilitySelectionId={raceAbilitySelectionId}
                                byId={byId}
                                onRaceAbilitySelection={selectRaceAbilityBonus}
                                onDispatch={dispatch}
                              />
                            )
                          ) : null}
                          {activeChoiceSection.choices.map((choice) =>
                            selectedLevel === 1 &&
                            choice.type.trim().toLocaleLowerCase() ===
                              "race ability bonus" ? null : (
                              <Fragment key={choice.id}>
                                {isRequiredClassDeityChoice(choice)
                                  ? null
                                  : renderPrimaryChoice(
                                      choice,
                                      shouldOmitIndividualChoiceHeading(
                                        choice,
                                        activeChoiceSection.choices.length,
                                        selectedLevel,
                                      ),
                                    )}
                                {activeChoiceSection.section === "Class" &&
                                selectedLevel === 1 &&
                                choice.id === classChoicePlacementId ? (
                                  <>
                                    <BuildPresetPanel
                                      choices={buildPresetChoices}
                                      levelChoices={mechanicalLevelChoices}
                                      evaluation={planningEvaluation}
                                      build={build}
                                      entities={entities}
                                      byId={byId}
                                      onDispatch={dispatch}
                                    />
                                    {requiredClassDeityChoices.length ===
                                    0 ? null : (
                                      <div className="class-deity-choice">
                                        {requiredClassDeityChoices.map(
                                          (deityChoice) => (
                                            <Fragment key={deityChoice.id}>
                                              {renderPrimaryChoice(
                                                deityChoice,
                                                false,
                                              )}
                                            </Fragment>
                                          ),
                                        )}
                                      </div>
                                    )}
                                  </>
                                ) : null}
                              </Fragment>
                            ),
                          )}
                        </div>
                        <footer className="level-choice-navigation">
                          <button
                            disabled={
                              !activeSectionComplete ||
                              nextChoiceDestination === undefined
                            }
                            title={
                              !activeSectionComplete
                                ? "Complete the required choices in this section to continue"
                                : nextChoiceDestination === undefined
                                  ? "No next section at the character's current level"
                                  : undefined
                            }
                            type="button"
                            onClick={advanceToNextChoiceSection}
                          >
                            Next
                          </button>
                        </footer>
                      </section>
                    )}
                  </div>
                  <div className="shared-choice-detail">
                    <CandidateDetail
                      byId={byId}
                      candidate={inspectedOption?.candidate}
                      entity={inspectedOption?.entity}
                      powerPresentationFor={buildPowerPresentationFor}
                    />
                  </div>
                </CandidateInspectionScope>
              </div>
            </div>
          )}
        </section>
      </div>

      <div hidden={workspaceTab !== "details"}>
        <CharacterDetailsEditor
          active={workspaceTab === "details"}
          choices={characterDetailChoices}
          evaluation={planningEvaluation}
          build={build}
          snapshotDetails={character.snapshot.details}
          characterTitle={character.title}
          entities={entities}
          byId={byId}
          rollbackRevision={rollbackRevision}
          effectiveLevel={build.effectiveLevel}
          forcedAlignment={forcedAlignment}
          onLevelChange={changeCurrentLevel}
          onDispatch={dispatch}
        />
      </div>

      <section
        aria-labelledby="diagnostics-heading"
        className="choice-pane standalone-workspace-pane"
        hidden={workspaceTab !== "diagnostics"}
      >
        <header>
          <h3 id="diagnostics-heading">Diagnostics</h3>
        </header>
        <div className="standalone-workspace-content diagnostics-workspace">
          {planningEvaluation === undefined ? (
            <p>Evaluating character…</p>
          ) : diagnosticGroups.every(({ issues }) => issues.length === 0) ? (
            <p>No build issues.</p>
          ) : (
            diagnosticGroups.map(({ title, description, issues }) =>
              issues.length === 0 ? null : (
                <section className="diagnostic-group" key={title}>
                  <header>
                    <h4>
                      {title} <span>{issues.length}</span>
                    </h4>
                    <p>{description}</p>
                  </header>
                  <ul className="diagnostic-list">
                    {issues.map((issue) => (
                      <li key={issue.key}>
                        <div>
                          <strong>{issue.title}</strong>
                          <p>{issue.detail}</p>
                          <p className="diagnostic-effect">
                            <strong>Effect:</strong> {issue.effect}
                          </p>
                        </div>
                        {issue.target === undefined ? null : (
                          <button
                            className="secondary-button"
                            type="button"
                            onClick={() => navigateToDiagnosticIssue(issue)}
                          >
                            Review
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              ),
            )
          )}
        </div>
      </section>

      <div hidden={workspaceTab !== "equipment" && workspaceTab !== "shop"}>
        {carriedWallet === undefined || storedWallet === undefined ? null : (
          <EquipmentWorkspace
            build={build}
            entities={entities}
            byId={byId}
            activeDefinitionIds={currentEvaluation?.activeDefinitionIds ?? []}
            hideFlavortext={hideFlavortext}
            keepLargeAmountsInGold={keepLargeAmountsInGold}
            powerPresentationFor={currentPowerPresentationFor}
            workspace={workspaceTab === "shop" ? "shop" : "equipment"}
            loadoutView={
              navigation.workspace === "equipment" &&
              navigation.loadout === true
            }
            shopCategory={
              navigation.workspace === "shop"
                ? (navigation.category ?? "items")
                : "items"
            }
            onLoadoutViewChange={(loadout) =>
              onNavigate(characterId, {
                workspace: "equipment",
                ...(loadout ? { loadout: true } : {}),
              })
            }
            onShopCategoryChange={(category) =>
              onNavigate(characterId, { workspace: "shop", category })
            }
            wallet={{
              carried: {
                copper: carriedWallet.cp,
                silver: carriedWallet.sp,
                gold: carriedWallet.gp,
                platinum: carriedWallet.pp,
                astral: carriedWallet.ad,
              },
              stored: {
                copper: storedWallet.cp,
                silver: storedWallet.sp,
                gold: storedWallet.gp,
                platinum: storedWallet.pp,
                astral: storedWallet.ad,
              },
            }}
            onPutInventory={(entry) =>
              dispatch({ kind: "put-inventory", entry })
            }
            onPurchase={(entry, priceCopper) =>
              dispatch({
                kind: "purchase-inventory",
                entry,
                priceCopper,
                keepLargeAmountsInGold,
              })
            }
            onSell={(entry, priceCopper, percentage) =>
              dispatch({
                kind: "sell-inventory",
                entryId: entry.id,
                priceCopper,
                percentage,
                keepLargeAmountsInGold,
              })
            }
            onEquipSlot={(entryId, slots, currentEntryId, currentSlots) => {
              const slotIds = slots as readonly EquipmentSlotId[];
              const displacedSlotIds = (currentSlots ??
                slots) as readonly EquipmentSlotId[];
              const command = loadoutChangeCommand(
                build.inventory.filter(({ quantity }) => quantity > 0),
                byId,
                entryId,
                slotIds,
                currentEntryId,
                displacedSlotIds,
              );
              if (command !== undefined) dispatch(command);
            }}
            onSetWallet={(nextWallet) => {
              const amount = (location: "carried" | "stored") => ({
                cp: Math.max(0, Math.trunc(nextWallet[location].copper)),
                sp: Math.max(0, Math.trunc(nextWallet[location].silver)),
                gp: Math.max(0, Math.trunc(nextWallet[location].gold)),
                pp: Math.max(0, Math.trunc(nextWallet[location].platinum)),
                ad: Math.max(0, Math.trunc(nextWallet[location].astral)),
              });
              dispatch({
                kind: "batch",
                commands: (["carried", "stored"] as const).map((location) => ({
                  kind: "set-text" as const,
                  name: characterWalletTextKey(build.effectiveLevel, location),
                  value: formatLegacyCurrency(amount(location)),
                })),
              });
            }}
            onAdjustMoney={(deltaCopper) => {
              const activeBuild = transaction.current?.current;
              if (activeBuild === undefined)
                return "Character funds are not available";
              let adjusted: ReturnType<typeof adjustWalletCurrency>;
              try {
                adjusted = adjustWalletCurrency(
                  resolveCharacterWallet(activeBuild, "carried").amount,
                  resolveCharacterWallet(activeBuild, "stored").amount,
                  deltaCopper,
                  keepLargeAmountsInGold,
                );
              } catch (reason: unknown) {
                return reason instanceof Error
                  ? reason.message
                  : "Currency adjustment was rejected";
              }
              dispatch({
                kind: "batch",
                commands: [
                  {
                    kind: "set-text",
                    name: characterWalletTextKey(
                      activeBuild.effectiveLevel,
                      "carried",
                    ),
                    value: formatLegacyCurrency(adjusted.carried),
                  },
                  {
                    kind: "set-text",
                    name: characterWalletTextKey(
                      activeBuild.effectiveLevel,
                      "stored",
                    ),
                    value: formatLegacyCurrency(adjusted.stored),
                  },
                ],
              });
              return undefined;
            }}
          />
        )}
      </div>
    </main>
  );
}
