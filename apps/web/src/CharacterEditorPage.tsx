import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  CharacterRepository,
  type ContentProfileDefinition,
} from "@4ecb/browser-storage";
import type { ContentPackManifest } from "@4ecb/content-pack";
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
  sameRulesInputs,
  selectedCandidateDetailLevels,
} from "./builder-evaluation-plan";
import {
  builderIssueGroups,
  contentNotInstalledIssue,
  contentUpdateIssue,
  evaluationFailedIssue,
  deityAlignmentIssue,
  withCharacterIssues,
  type BuilderIssue,
} from "./builder-diagnostics";
import { recordLoadDuration } from "./load-performance";
import {
  CharacterTransaction,
  adjustWalletCoins,
  type CoinAdjustment,
  ZERO_CURRENCY,
  characterDisplayName,
  characterWalletTextKey,
  currencyToCopper,
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
  projectBuildForEvaluation,
  type EvaluatedCharacter,
  type EvaluatedChoice,
  type EvaluationInput,
} from "@4ecb/rules-engine";

import {
  abilityScoreAdjustment,
  characterHeaderSubtitle,
  MAX_CHARACTER_LEVEL,
  classKeyAbilities,
  classKeyAbilitiesSentence,
  choiceSectionIcon,
  choiceSelectionTableKind,
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
  pickLegality,
  jumpToLevelCommand,
  levelChoiceProgress,
  levelRailChoiceStatus,
  legacyChoiceSection,
  planningEvaluationHorizon,
  planningHorizonCommand,
  repeatedChoiceGroupTitle,
  selectedDefinitionId,
  selectedChoiceIsHouseRule,
  shouldOmitIndividualChoiceHeading,
  unresolveEvaluatedChoiceCommand,
  type LegacyChoiceSection,
} from "./builder-ui";
import { CandidateInspectionScope } from "./builder-choice-context";
import { Icon, type IconName } from "./Icon";
import { UpdateButton } from "./PwaUpdate";
import { BuilderCharacterStats } from "./BuilderCharacterStats";
import { LevelPicker, type LevelPickerEntry } from "./LevelPicker";
import { LoadingPane, LoadingScreen } from "./LoadingScreen";
import { loadingStepDetail, useLoadingProgress } from "./use-loading-progress";
import { useFittedTableHeight } from "./use-fitted-table-height";
import { ContentUpdateDialog } from "./ContentUpdateDialog";
import { loadCharacter, persistCharacterDraft } from "./character-drafts";
import { needsContentUpdate } from "./content-update";
import { loadoutChangeCommand } from "./equipment-ui";
import { freebeeGiftCommand } from "./freebee-gifts";
import { type InspectedOption } from "./CandidateSelectionTable";
import { CandidateDetail } from "./CandidateDetail";
import { ChoiceAccordionItem } from "./ChoiceAccordionItem";
import { ActionMenu } from "./ActionMenu";
import { SetLevelDialog } from "./SetLevelDialog";
import {
  exportCharacterBackup,
  exportCharacterDnd4e,
} from "./character-export";
import { ToastRegion, useToasts } from "./Toasts";
import { RetrainingWorkspace } from "./RetrainingWorkspace";
import { CompanionNameFields, hasCompanionChoice } from "./CompanionNameFields";
import { RitualsWorkspace } from "./RitualsWorkspace";
import { BaseAbilityScoreEditor } from "./BaseAbilityScoreEditor";
import {
  AbilityIncreaseEditor,
  BackgroundChoiceGroup,
  BuildPresetPanel,
  ChoiceEditor,
  ChoiceFlowSection,
  RepeatedChoiceGroup,
  SkillTrainingEditor,
} from "./ChoiceEditors";
import {
  CharacterDetailsEditor,
  CharacterTextField,
} from "./CharacterDetailsEditor";
import {
  CharacterWallet,
  EquipmentWorkspace,
  type EquipmentWalletView,
} from "./EquipmentWorkspace";
import { OptimisticBuildSaveQueue } from "./optimistic-save";
import { useBuilderLibrarySummary } from "./use-builder-library-summary";
import { PortraitEditor } from "./PortraitEditor";
import { BuildVersion } from "./BuildVersion";
import {
  authoredBuilderCardSettings,
  BuilderCardContext,
  evaluatedBuilderCardSettings,
} from "./BuilderCards";
import type {
  BuilderNavigation,
  BuilderSectionSlug,
  BuilderWorkspaceTab,
} from "./routes";

const characters = new CharacterRepository();
type LevelChoiceTab = LegacyChoiceSection;

/** evaluationStatus while the rules worker has failed, before its message. */
const EVALUATION_FAILED_PREFIX = "Rules evaluation failed: ";

/** Level sections whose detail cards are mostly long text. */
const WIDE_DETAIL_SECTIONS: ReadonlySet<LevelChoiceTab> = new Set([
  "Class",
  "Race",
  "Background",
  "Theme",
]);
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
    case "other":
      return "Other";
    case "retraining": // its own tab now; routes redirect it there
    case undefined:
      return undefined;
  }
}

export function CharacterEditorPage({
  characterId,
  navigation,
  onNavigate,
  mergeFunds,
  resolveAbilityChoices,
  proficientEquipmentOnly = true,
  abbreviateAbilityValues,
  activeManifest,
  activeProfile,
}: {
  readonly characterId: string;
  readonly navigation: BuilderNavigation;
  readonly onNavigate: (
    characterId: string,
    navigation: BuilderNavigation,
    replace?: boolean,
  ) => void;
  readonly mergeFunds: boolean;
  readonly resolveAbilityChoices: boolean;
  readonly proficientEquipmentOnly?: boolean;
  readonly abbreviateAbilityValues: boolean;
  readonly activeManifest?: ContentPackManifest;
  readonly activeProfile?: ContentProfileDefinition;
}) {
  const [reloadKey, setReloadKey] = useState(0);
  const [reviewingContentUpdate, setReviewingContentUpdate] = useState(false);
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
  // Latched once the first evaluation (or a reason none can run) arrives, so
  // later re-evaluations update in place instead of reopening the loader.
  const [initialLoadSettled, setInitialLoadSettled] = useState(false);
  const [currentEvaluationResult, setCurrentEvaluation] =
    useState<EvaluatedCharacter>();
  const [planningEvaluationResult, setPlanningEvaluation] =
    useState<EvaluatedCharacter>();
  const [selectedLevelEvaluationResult, setSelectedLevelEvaluation] =
    useState<EvaluatedCharacter>();
  const [evaluationStatus, setEvaluationStatus] = useState("Loading rules…");
  const [readyPackId, setReadyPackId] = useState<string>();
  // Mirrors rulesClient once ready, so the loader can render its progress.
  const [readyRulesClient, setReadyRulesClient] =
    useState<RulesRuntimeClient>();
  const [selectedLevel, setSelectedLevel] = useState(
    navigation.workspace === "build" ? (navigation.level ?? 1) : 1,
  );
  const [selectedChoiceId, setSelectedChoiceId] = useState<string>();
  // The accordion item the user opened (or null: all folded) on one level
  // tab; elsewhere, and after a tab change or Review jump, the default rules.
  const [settingLevel, setSettingLevel] = useState(false);
  const toasts = useToasts();
  // Exports read the stored record: wait for pending saves, and store a new
  // character that was never changed (exporting it is a deliberate ask).
  // A .dnd4e export evaluates the character in a fresh rules worker, which
  // takes a while; the Export button spins until the download starts.
  const [exporting, setExporting] = useState(false);
  const exportFrom = (write: (id: string) => Promise<void>): void => {
    setExporting(true);
    void (async () => {
      await saveQueue.current?.whenIdle();
      await persistCharacterDraft(characters, characterId);
      await write(characterId);
    })()
      .catch((reason: unknown) =>
        toasts.push({
          tone: "error",
          title: `Couldn't export ${character?.title ?? "the character"}`,
          messages: [reason instanceof Error ? reason.message : String(reason)],
        }),
      )
      .finally(() => setExporting(false));
  };
  const [accordionOverride, setAccordionOverride] = useState<{
    readonly tab: string;
    readonly key: string | null;
  }>();
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
  // Level tab tables fill the window; the Next button is gone.
  const levelChoicePage = useRef<HTMLDivElement>(null);
  useFittedTableHeight(levelChoicePage);
  const saveQueue = useRef<
    OptimisticBuildSaveQueue<CharacterRecord> | undefined
  >(undefined);
  const rulesClient = useRef<RulesRuntimeClient | undefined>(undefined);
  const evaluationRevision = useRef(0);
  // The build each published current-level evaluation was computed from,
  // so the library summary is written only for the build that was saved.
  const evaluatedBuilds = useRef(
    new WeakMap<EvaluatedCharacter, CharacterBuild>(),
  );
  const characterLoadStartedAt = useRef(performance.now());
  const firstEvaluationRecorded = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const startedAt = performance.now();
    setCharacter(undefined);
    setEntities([]);
    setBoundProfileResolution("pending");
    setLoadError(undefined);
    setInitialLoadSettled(false);
    characterLoadStartedAt.current = startedAt;
    firstEvaluationRecorded.current = false;
    void loadCharacter(characters, characterId)
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
          async (next) => {
            // A new character is first stored with its first change.
            await persistCharacterDraft(characters, characterId);
            return characters.updateBuild(characterId, next);
          },
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
  }, [characterId, reloadKey]);

  useEffect(() => {
    if (navigation.workspace !== "retraining" || character === undefined)
      return;
    if (navigation.level !== undefined) setSelectedLevel(navigation.level);
  }, [character, navigation]);

  useEffect(() => {
    if (navigation.workspace !== "build" || character === undefined) return;
    const level = navigationLevel ?? character.build.effectiveLevel;
    setSelectedLevel(level);
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
    setReadyRulesClient(undefined);
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
        setReadyRulesClient(client);
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
  // What evaluation sees: the build, kept as the previous object while edits
  // only touch text evaluation never reads, so those don't re-run it.
  const evaluationBuildRef = useRef(build);
  if (
    build === undefined ||
    evaluationBuildRef.current === undefined ||
    !sameRulesInputs(evaluationBuildRef.current, build)
  )
    evaluationBuildRef.current = build;
  const evaluationBuild = evaluationBuildRef.current;
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
  const initialLoadReady =
    initialLoadSettled ||
    (build !== undefined &&
      boundProfileResolution !== "pending" &&
      // Open once the current level is evaluated; a further planning
      // horizon keeps loading behind the Build tab's choice pane.
      (boundProfileResolution !== "available" ||
        entities.length === 0 ||
        currentEvaluation !== undefined ||
        evaluationStatus.startsWith(EVALUATION_FAILED_PREFIX)));
  useEffect(() => {
    if (initialLoadReady) setInitialLoadSettled(true);
  }, [initialLoadReady]);
  const loadingProgress = useLoadingProgress(
    packId,
    readyRulesClient,
    !initialLoadReady || planningEvaluation === undefined,
  );
  const byId = useMemo(
    () =>
      new Map(
        entities.map((entity) => [entity.id.toLocaleLowerCase(), entity]),
      ),
    [entities],
  );
  const cardPreferences = useMemo(
    () => ({
      resolveAbilityChoices,
      proficientEquipmentOnly,
      abbreviateAbilityValues,
    }),
    [abbreviateAbilityValues, proficientEquipmentOnly, resolveAbilityChoices],
  );
  const equipmentCardSettings = useMemo(
    () =>
      build === undefined || currentEvaluation === undefined
        ? undefined
        : evaluatedBuilderCardSettings(
            build,
            currentEvaluation,
            entities,
            cardPreferences,
          ),
    [build, cardPreferences, currentEvaluation, entities],
  );
  // The Build tab shows the same evaluated cards at the level being viewed.
  const buildEvaluation = selectedLevelEvaluation ?? currentEvaluation;
  const buildCardSettings = useMemo(
    () =>
      build === undefined || buildEvaluation === undefined
        ? authoredBuilderCardSettings(selectedLevel)
        : evaluatedBuilderCardSettings(
            build,
            buildEvaluation,
            entities,
            cardPreferences,
          ),
    [build, buildEvaluation, cardPreferences, entities, selectedLevel],
  );
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
      evaluationBuild === undefined ||
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
      evaluationBuild.effectiveLevel,
      selectedLevel,
      planningHorizon,
    );
    const distinctCurrentRequest = dispatchOrder.includes("current")
      ? client.evaluate({
          ...project(projectBuildForLegacyExport(evaluationBuild), "current"),
          candidateDetailLevels: currentCandidateDetailLevels(
            workspaceTab,
            evaluationBuild.effectiveLevel,
            selectedLevel,
          ),
          includePowers: false,
        })
      : undefined;
    const distinctSelectedRequest = dispatchOrder.includes("selected")
      ? client.evaluate({
          ...project(
            { ...evaluationBuild, effectiveLevel: selectedLevel },
            "selected",
          ),
          candidateDetailLevels: selectedCandidateDetailLevels(
            workspaceTab,
            selectedLevel,
          ),
          includePowers: false,
        })
      : undefined;
    const planningRequest = client.evaluate({
      ...project(
        { ...evaluationBuild, effectiveLevel: planningHorizon },
        "planning",
      ),
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
      (selectedLevel === evaluationBuild.effectiveLevel
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
    const currentPublished = publish(currentRequest, (evaluation) => {
      evaluatedBuilds.current.set(evaluation, evaluationBuild);
      setCurrentEvaluation(evaluation);
    });
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
          `${EVALUATION_FAILED_PREFIX}${reason instanceof Error ? reason.message : String(reason)}`,
        );
      });
  }, [
    evaluationBuild,
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

  useBuilderLibrarySummary({
    characters,
    character,
    evaluation: currentEvaluation,
    evaluatedBuild:
      currentEvaluation === undefined
        ? undefined
        : evaluatedBuilds.current.get(currentEvaluation),
    entities,
    saved: saveState.phase === "saved",
  });

  // Free items (legacy GiveFreebees): once the current level is evaluated
  // for exactly this build, give any FREEBEE item not yet marked as given.
  // It joins the edit that entitled the character to it, so undo removes
  // both together; the marker keeps a removed gift from coming back.
  useEffect(() => {
    if (build === undefined || currentEvaluation === undefined) return;
    if (evaluatedBuilds.current.get(currentEvaluation) !== evaluationBuild)
      return;
    if (currentEvaluation.level !== build.effectiveLevel) return;
    const command = freebeeGiftCommand(build, currentEvaluation, byId);
    if (command !== undefined) amend(command);
  }, [build, byId, currentEvaluation, evaluationBuild]);

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
  const deityAlignment = useMemo(
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
  const levelSectionTabs: readonly LevelChoiceTab[] =
    displayedChoiceSections.map(({ section }) => section);
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
  const activeSectionChoices = activeChoiceSection?.choices ?? [];
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
      // Until the level's choices are evaluated, the default section is
      // only a placeholder (the injected Ability Scores tab); writing it to
      // the URL would pin it as if the user had picked it.
      planningEvaluation === undefined ||
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
    planningEvaluation,
    selectedLevel,
  ]);

  // Clear the details while rendering the new level, before its tables mount
  // and show their selection; an effect would run after them and erase it.
  const [inspectedLevel, setInspectedLevel] = useState(selectedLevel);
  if (inspectedLevel !== selectedLevel) {
    setInspectedLevel(selectedLevel);
    setInspectedOption(undefined);
  }

  function dispatch(command: CharacterCommand): void {
    const active = transaction.current;
    const queue = saveQueue.current;
    if (active === undefined || queue === undefined) return;
    try {
      const previous = active.current;
      const next = active.dispatch(command);
      if (!sameRulesInputs(previous, next))
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

  /** Applies a follow-up into the current undo step (see CharacterTransaction.amend). */
  function amend(command: CharacterCommand): void {
    const active = transaction.current;
    const queue = saveQueue.current;
    if (active === undefined || queue === undefined) return;
    try {
      const previous = active.current;
      const next = active.amend(command);
      if (!sameRulesInputs(previous, next))
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
            candidate === undefined ? "rules-legal" : pickLegality(candidate),
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
    const previous = active.current;
    const next = active.undo();
    if (!sameRulesInputs(previous, next))
      setEvaluationStatus("Evaluating current build and plan…");
    setRevision((value) => value + 1);
    queue.enqueue(next, "Undo saved locally");
  }

  function redo(): void {
    const active = transaction.current;
    const queue = saveQueue.current;
    if (active === undefined || queue === undefined || !active.canRedo) return;
    const previous = active.current;
    const next = active.redo();
    if (!sameRulesInputs(previous, next))
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
  if (character === undefined || build === undefined || !initialLoadReady)
    return (
      <LoadingScreen
        className="editor-page"
        portraitUrl={character?.portrait?.renderedDataUrl}
        label={
          character === undefined
            ? "Loading character…"
            : `Loading ${characterDisplayName(character) || "character"}…`
        }
        detail={
          character === undefined
            ? undefined
            : loadingStepDetail(
                boundProfileResolution !== "pending",
                loadingProgress,
              )
        }
      />
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
  // The import-time snapshot is only a fallback while no evaluation exists;
  // once one does, a removed race/class must not resurface from it.
  const race =
    currentEvaluation === undefined
      ? character.snapshot.details.Race
      : entityOfType("Race")?.name;
  const selectedClass = entityOfType("Class") ?? entityOfType("Hybrid Class");
  const selectedClassKeyAbilities = classKeyAbilities(selectedClass);
  const keyAbilitiesSentence = classKeyAbilitiesSentence(
    selectedClass,
    selectedClassKeyAbilities,
  );
  const alignmentIssue =
    deityAlignment === undefined || planningEvaluation === undefined
      ? undefined
      : deityAlignmentIssue(deityAlignment, planningEvaluation, byId);
  const contentMissing = shouldShowBoundProfileWarning(boundProfileResolution);
  const evaluationFailure = evaluationStatus.startsWith(
    EVALUATION_FAILED_PREFIX,
  )
    ? evaluationStatus.slice(EVALUATION_FAILED_PREFIX.length)
    : undefined;
  const builderIssues = withCharacterIssues(
    builderIssueGroups({
      evaluation: planningEvaluation,
      byId,
      effectiveLevel: build.effectiveLevel,
      planningHorizon,
      abilityScoresIncomplete,
      abilityScoresHouseRuled,
    }),
    [
      // One cause, one issue: missing content outranks "content updated".
      ...(contentMissing
        ? [
            contentNotInstalledIssue(
              character.title,
              activeManifest !== undefined,
            ),
          ]
        : needsContentUpdate(character.profileBinding, activeManifest)
          ? [contentUpdateIssue(character.title)]
          : []),
      ...(evaluationFailure === undefined
        ? []
        : [evaluationFailedIssue(evaluationFailure)]),
      ...(alignmentIssue === undefined ? [] : [alignmentIssue]),
    ],
  );
  const totalUnresolved = builderIssues.unresolved.length;
  const warningCount = builderIssues.warnings.length;
  const errorCount = builderIssues.errors.length;
  const houseRuleCount = builderIssues.houseRules.length;
  const contentUpdate = builderIssues.updates[0];
  const navigateToDiagnosticIssue = (issue: BuilderIssue): void => {
    setAccordionOverride(undefined);
    if (issue.target?.kind === "settings") {
      window.location.hash = "#/settings";
      return;
    }
    if (issue.target?.kind === "content-update") {
      setReviewingContentUpdate(true);
      return;
    }
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
    if (isOptionalRetrainingChoice(choice)) {
      setSelectedLevel(choice.level);
      onNavigate(characterId, { workspace: "retraining", level: choice.level });
      return;
    }
    const section = legacyChoiceSection(choice);
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
    setAccordionOverride(undefined);
    setSelectedSectionByLevel((current) => ({
      ...current,
      [selectedLevel]: section,
    }));
    setInspectedOption(undefined);
    const sectionChoices =
      displayedChoiceSections.find((group) => group.section === section)
        ?.choices ?? [];
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
    setAccordionOverride(undefined);
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
      const primary = choices.filter(
        (choice) => !isOptionalRetrainingChoice(choice),
      );
      const ordered = groupChoicesByLegacyWorkflow(primary).flatMap(
        ({ choices: sectionChoices }) => sectionChoices,
      );
      const rememberedSection =
        requestedSection ?? selectedSectionByLevel[level];
      const destinationChoices =
        rememberedSection === undefined
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
      if (workspaceTab === "build")
        onNavigate(characterId, { workspace: "build", level }, true);
    } catch (reason: unknown) {
      setSaveState({
        phase: "failed",
        message: reason instanceof Error ? reason.message : String(reason),
      });
    }
  };

  // The choices a level-tab unit renders together (a repeated group shares
  // one table, a dependent flow one section…), keyed by its first choice.
  const unitChoicesFor = (
    choice: EvaluatedChoice,
  ): readonly EvaluatedChoice[] => {
    if (groupedLevelChoices.backgrounds.includes(choice))
      return groupedLevelChoices.backgrounds;
    if (groupedLevelChoices.skillTraining.includes(choice))
      return groupedLevelChoices.skillTraining;
    return (
      repeatedGroupByChoiceId.get(choice.id) ??
      dependentFlowByChoiceId.get(choice.id) ?? [choice]
    );
  };
  // A tab with two or more table choices shows at most one table at a time:
  // each table unit folds to an accordion heading (title, picks, status),
  // and the open heading folds away again. Unless the user picks a heading,
  // the open one is the tab's selected choice (first unresolved on arrival,
  // never moved by selecting), so the page doesn't jump on its own. At level
  // 1 the Class tab's starting presets are an item too, closed by default.
  const presetsInAccordion =
    activeLevelSection === "Class" &&
    selectedLevel === 1 &&
    buildPresetChoices.some((choice) =>
      choice.candidates.some((candidate) => candidate.eligible),
    );
  const accordionUnits = (() => {
    if (activeChoiceSection === undefined) return [];
    const seen = new Set<string>();
    const units: (readonly EvaluatedChoice[])[] = [];
    for (const choice of activeChoiceSection.choices) {
      if (
        selectedLevel === 1 &&
        choice.type.trim().toLocaleLowerCase() === "race ability bonus"
      )
        continue;
      const unit = unitChoicesFor(choice);
      if (seen.has(unit[0]!.id)) continue;
      seen.add(unit[0]!.id);
      if (
        unit !== groupedLevelChoices.skillTraining &&
        !unit.every((item) => isAbilityIncreaseChoiceType(item.type)) &&
        unit.some((item) => choiceSelectionTableKind(item) !== undefined)
      )
        units.push(unit);
    }
    return units.length + (presetsInAccordion ? 1 : 0) >= 2 ? units : [];
  })();
  const accordionTabKey = `${selectedLevel}:${activeLevelSection ?? ""}`;
  const unitUnresolved = (unit: readonly EvaluatedChoice[]) =>
    unit.some(
      (item) => item.level <= build.effectiveLevel && isUnresolvedChoice(item),
    );
  const defaultAccordionKey = (accordionUnits.find((unit) =>
    unit.some((item) => item.id === selectedChoiceId),
  ) ??
    accordionUnits.find(unitUnresolved) ??
    accordionUnits[0])?.[0]?.id;
  const openAccordionKey =
    accordionOverride?.tab === accordionTabKey
      ? accordionOverride.key
      : defaultAccordionKey;
  const toggleAccordion = (key: string, firstChoiceId?: string) => {
    if (openAccordionKey === key) {
      setAccordionOverride({ tab: accordionTabKey, key: null });
      // No table is left to fill the details pane, so empty it.
      setInspectedOption(undefined);
      return;
    }
    setAccordionOverride({ tab: accordionTabKey, key });
    if (firstChoiceId !== undefined) setSelectedChoiceId(firstChoiceId);
  };
  const renderAccordionItem = ({
    key,
    title,
    picks,
    status,
    onToggle,
    children,
  }: {
    readonly key: string;
    readonly title: string;
    readonly picks: string;
    readonly status?: "complete" | "unresolved" | "house-rule" | undefined;
    readonly onToggle: () => void;
    readonly children: ReactNode;
  }) => {
    return (
      <ChoiceAccordionItem
        key={`accordion:${key}`}
        open={openAccordionKey === key}
        title={title}
        picks={picks}
        status={status}
        onToggle={onToggle}
      >
        {children}
      </ChoiceAccordionItem>
    );
  };
  const renderPrimaryChoice = (
    choice: EvaluatedChoice,
    omitIndividualHeading = false,
  ) => {
    const element = renderPrimaryChoiceUnit(choice, omitIndividualHeading);
    if (element === null || planningEvaluation === undefined) return element;
    const unit = accordionUnits.find((candidate) => candidate.includes(choice));
    if (unit === undefined) return element;
    const picks = unit.flatMap((item) => {
      const definitionId = selectedDefinitionId(item, planningEvaluation);
      return definitionId === undefined
        ? []
        : [byId.get(definitionId.toLocaleLowerCase())?.name ?? definitionId];
    });
    return renderAccordionItem({
      key: unit[0]!.id,
      title:
        unit === groupedLevelChoices.backgrounds
          ? "Background"
          : repeatedGroupByChoiceId.has(unit[0]!.id)
            ? repeatedChoiceGroupTitle(unit, byId)
            : contextualChoiceTitle(unit[0]!, planningEvaluation, byId),
      picks: picks.length === 0 ? "none chosen" : picks.join(", "),
      status: unit.some((item) =>
        selectedChoiceIsHouseRule(item, planningEvaluation),
      )
        ? "house-rule"
        : unitUnresolved(unit)
          ? "unresolved"
          : picks.length > 0
            ? "complete"
            : undefined,
      onToggle: () => toggleAccordion(unit[0]!.id, unit[0]!.id),
      children: element,
    });
  };
  const renderPrimaryChoiceUnit = (
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
  ];
  const renderIssueList = (issues: readonly BuilderIssue[]) => (
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
  );

  // The level picker shows progress only (done, unresolved, planned).
  // Warnings, errors and house rules live in the tab bar's badges and their
  // pages, whose Review buttons jump to the choice.
  const levelPlanEntries: readonly LevelPickerEntry[] =
    planningEvaluation === undefined
      ? []
      : Array.from(
          { length: MAX_CHARACTER_LEVEL },
          (_, index) => index + 1,
        ).map((level) => {
          const choices = choicesAtLevel(level, planningEvaluation);
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
          const status = levelRailChoiceStatus(
            timelineChoices,
            level <= build.effectiveLevel,
            level === 1 && abilityScoresIncomplete ? 1 : 0,
          );
          const statusLabel =
            status === "future"
              ? "no choices made"
              : status === "planned-complete"
                ? `all ${progress.required} choices complete`
                : status === "planned-partial"
                  ? `${progress.completed} of ${progress.required} choices complete`
                  : status === "incomplete"
                    ? `${unresolved} unresolved`
                    : "complete";
          return { level, status, statusLabel };
        });

  const equipmentWallet: EquipmentWalletView | undefined =
    carriedWallet === undefined || storedWallet === undefined
      ? undefined
      : {
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
        };
  const setWalletAmounts = (nextWallet: EquipmentWalletView): void => {
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
  };
  const adjustMoney = (
    coins: CoinAdjustment,
    location: "carried" | "stored" | undefined,
  ): string | undefined => {
    const activeBuild = transaction.current?.current;
    if (activeBuild === undefined) return "Character funds are not available";
    const carried = resolveCharacterWallet(activeBuild, "carried").amount;
    const stored = resolveCharacterWallet(activeBuild, "stored").amount;
    let adjusted: ReturnType<typeof adjustWalletCoins>;
    try {
      // Quick adjust changes the coin typed; it never re-mints the wallet.
      if (location === undefined)
        // Merged funds: spend carried coins first, then stored.
        adjusted = adjustWalletCoins(carried, stored, coins);
      else {
        // Separate funds: adjust only the location the wallet shows.
        const one = adjustWalletCoins(
          location === "carried" ? carried : stored,
          ZERO_CURRENCY,
          coins,
        ).carried;
        adjusted =
          location === "carried"
            ? { carried: one, stored }
            : { carried, stored: one };
      }
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
          name: characterWalletTextKey(activeBuild.effectiveLevel, "carried"),
          value: formatLegacyCurrency(adjusted.carried),
        },
        {
          kind: "set-text",
          name: characterWalletTextKey(activeBuild.effectiveLevel, "stored"),
          value: formatLegacyCurrency(adjusted.stored),
        },
      ],
    });
    return undefined;
  };

  const levelPicker = (
    <LevelPicker
      disabled={entities.length === 0}
      entries={levelPlanEntries}
      selectedLevel={selectedLevel}
      tiers={CHARACTER_TIERS}
      onSelect={(level) => selectLevel(level)}
    />
  );

  return (
    <BuilderCardContext.Provider value={buildCardSettings}>
      <main
        aria-busy={saving}
        className="editor-page modern-builder"
        id="main-content"
      >
        <div className="builder-layout">
          <aside aria-label="Character" className="builder-sidebar">
            <header className="builder-sidebar-identity">
              <PortraitEditor
                name={character.title}
                portrait={character.portrait}
                onSave={async (portrait) => {
                  await persistCharacterDraft(characters, characterId);
                  setCharacter(
                    await characters.updateMetadata(characterId, { portrait }),
                  );
                }}
              />
              <h2 className="builder-character-name-heading">
                <CharacterTextField
                  className="builder-character-name"
                  fitContent
                  label="Character name"
                  name="Name"
                  value={characterDisplayName({
                    build,
                    title: character.title,
                  })}
                  visuallyHideLabel
                  onDispatch={dispatch}
                />
              </h2>
              {/* Race, class and level; the level changes from the tab
                  bar's Change level menu (a rare, build-wide change). */}
              <p className="builder-character-facts">
                {characterHeaderSubtitle(
                  race,
                  currentEvaluation === undefined
                    ? character.snapshot.details.Class
                    : selectedClass?.name,
                  build.effectiveLevel,
                )}
              </p>
            </header>
            <div className="builder-sidebar-panel">
              <BuilderCharacterStats evaluation={currentEvaluation} />
              {equipmentWallet !== undefined ? (
                <CharacterWallet
                  wallet={equipmentWallet}
                  mergeFunds={mergeFunds}
                  onSetWallet={setWalletAmounts}
                  onAdjustMoney={adjustMoney}
                />
              ) : null}
            </div>
            <BuildVersion />
          </aside>
          <div className="builder-main">
            {settingLevel ? (
              <SetLevelDialog
                name={
                  characterDisplayName({ build, title: character.title }) ||
                  "This character"
                }
                currentLevel={build.effectiveLevel}
                tiers={CHARACTER_TIERS}
                entries={levelPlanEntries}
                onCancel={() => setSettingLevel(false)}
                onSet={(level) => {
                  setSettingLevel(false);
                  changeCurrentLevel(level);
                }}
              />
            ) : null}
            {reviewingContentUpdate &&
            character !== undefined &&
            activeManifest !== undefined ? (
              <ContentUpdateDialog
                character={character}
                target={activeManifest}
                activeProfile={activeProfile}
                rulesClient={readyRulesClient}
                onClose={() => setReviewingContentUpdate(false)}
                onUpdated={() => {
                  setReviewingContentUpdate(false);
                  setReloadKey((key) => key + 1);
                }}
              />
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
                  aria-selected={workspaceTab === "details"}
                  role="tab"
                  type="button"
                  onClick={() =>
                    onNavigate(characterId, { workspace: "details" })
                  }
                >
                  <Icon name="details" /> Details
                  {unresolvedCharacterDetailChoices.length > 0 ? (
                    <span
                      aria-label="Details has unresolved required choices"
                      className="tab-attention"
                      title="Details has unresolved required choices"
                    >
                      <Icon name="circle-help" />
                    </span>
                  ) : null}
                </button>
                <button
                  aria-selected={
                    navigation.workspace === "equipment" &&
                    navigation.loadout === true
                  }
                  role="tab"
                  type="button"
                  onClick={() =>
                    onNavigate(characterId, {
                      workspace: "equipment",
                      loadout: true,
                    })
                  }
                >
                  <Icon name="sword" /> Loadout
                </button>
                <button
                  aria-selected={
                    navigation.workspace === "equipment" &&
                    navigation.loadout !== true
                  }
                  role="tab"
                  type="button"
                  onClick={() =>
                    onNavigate(characterId, { workspace: "equipment" })
                  }
                >
                  <Icon name="handbag" /> Inventory
                </button>
                <button
                  aria-selected={workspaceTab === "shop"}
                  role="tab"
                  type="button"
                  onClick={() => onNavigate(characterId, { workspace: "shop" })}
                >
                  <Icon name="shopping-cart" /> Shop
                </button>
                <button
                  aria-selected={workspaceTab === "rituals"}
                  role="tab"
                  type="button"
                  onClick={() =>
                    onNavigate(characterId, { workspace: "rituals" })
                  }
                >
                  <Icon name="book-marked" /> Rituals
                </button>
                {/* Least used, so last. */}
                <button
                  aria-selected={workspaceTab === "retraining"}
                  role="tab"
                  type="button"
                  onClick={() =>
                    onNavigate(characterId, {
                      workspace: "retraining",
                      level: selectedLevel,
                    })
                  }
                >
                  <Icon name="undo" /> Retraining
                </button>
              </div>
              <div aria-label="Builder status" className="builder-status">
                {totalUnresolved > 0 ? (
                  <button
                    aria-label={`${totalUnresolved} unresolved ${totalUnresolved === 1 ? "choice" : "choices"}, open diagnostics`}
                    className="builder-health builder-health-attention"
                    title={`${totalUnresolved} unresolved ${totalUnresolved === 1 ? "choice" : "choices"}`}
                    type="button"
                    onClick={() =>
                      onNavigate(characterId, { workspace: "diagnostics" })
                    }
                  >
                    <Icon name="circle-help" />
                    <span aria-hidden="true">{totalUnresolved}</span>
                  </button>
                ) : null}
                {warningCount > 0 ? (
                  <button
                    aria-label={`${warningCount} ${warningCount === 1 ? "warning" : "warnings"}, open diagnostics`}
                    className="builder-health builder-health-warning"
                    title={`${warningCount} ${warningCount === 1 ? "warning" : "warnings"}`}
                    type="button"
                    onClick={() =>
                      onNavigate(characterId, { workspace: "diagnostics" })
                    }
                  >
                    <Icon name="warning" />
                    <span aria-hidden="true">{warningCount}</span>
                  </button>
                ) : null}
                {errorCount > 0 ? (
                  <button
                    aria-label={`${errorCount} ${errorCount === 1 ? "error" : "errors"}, open diagnostics`}
                    className="builder-health builder-health-error"
                    title={`${errorCount} ${errorCount === 1 ? "evaluation error" : "evaluation errors"}`}
                    type="button"
                    onClick={() =>
                      onNavigate(characterId, { workspace: "diagnostics" })
                    }
                  >
                    <Icon name="circle-x" />
                    <span aria-hidden="true">{errorCount}</span>
                  </button>
                ) : null}
                {contentUpdate === undefined ? null : (
                  <button
                    aria-label="Game content update available, review it"
                    className="builder-health builder-health-update"
                    title="Review the game content update. Until you apply it, rules, powers and items stay as they were."
                    type="button"
                    onClick={() => navigateToDiagnosticIssue(contentUpdate)}
                  >
                    <Icon name="archive-restore" />
                  </button>
                )}
                {houseRuleCount > 0 ? (
                  <button
                    aria-label={`${houseRuleCount} ${houseRuleCount === 1 ? "house rule" : "house rules"}, open house rules`}
                    className="builder-health builder-health-house-rule"
                    title={`${houseRuleCount} ${houseRuleCount === 1 ? "house rule" : "house rules"}`}
                    type="button"
                    onClick={() =>
                      onNavigate(characterId, { workspace: "house-rules" })
                    }
                  >
                    <Icon name="house" />
                    <span aria-hidden="true">{houseRuleCount}</span>
                  </button>
                ) : null}
                <span
                  aria-live={
                    saveState.phase === "failed" ? "assertive" : "polite"
                  }
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
                <span aria-hidden="true" className="builder-actions-divider" />
                <ActionMenu
                  icon="change-level"
                  label="Change level"
                  menuLabel="Change level"
                  triggerClassName="icon-only-button button-icon"
                  items={[
                    {
                      label:
                        build.effectiveLevel >= MAX_CHARACTER_LEVEL
                          ? `Level up (${MAX_CHARACTER_LEVEL} is the highest)`
                          : `Level up to ${build.effectiveLevel + 1}`,
                      disabled:
                        entities.length === 0 ||
                        build.effectiveLevel >= MAX_CHARACTER_LEVEL,
                      onSelect: () =>
                        changeCurrentLevel(build.effectiveLevel + 1),
                    },
                    {
                      label: "Set level…",
                      disabled: entities.length === 0,
                      onSelect: () => setSettingLevel(true),
                    },
                  ]}
                />
                <a
                  aria-label="Character sheet"
                  className="icon-only-button button-icon"
                  href={`#/characters/${encodeURIComponent(characterId)}?preview=1`}
                  title="Character sheet"
                >
                  <Icon name="sheet" />
                </a>
                <ActionMenu
                  icon="export"
                  label="Export"
                  {...(exporting
                    ? { busyLabel: `Exporting ${character.title}…` }
                    : {})}
                  menuLabel={`Export ${character.title} as`}
                  triggerClassName="icon-only-button button-icon"
                  items={[
                    {
                      label: ".4ecb",
                      onSelect: () => exportFrom(exportCharacterBackup),
                    },
                    {
                      label: ".dnd4e",
                      onSelect: () => exportFrom(exportCharacterDnd4e),
                    },
                  ]}
                />
                <UpdateButton />
                <a
                  aria-label="Settings"
                  className="icon-only-button button-icon"
                  href="#/settings"
                  title="Settings"
                >
                  <Icon name="settings" />
                </a>
                <a
                  aria-label="Close character"
                  className="icon-only-button button-icon"
                  href="#/characters"
                  title="Close character"
                >
                  <Icon name="remove" />
                </a>
              </div>
            </div>

            <div
              className="builder-workspace builder-tab-content"
              hidden={workspaceTab !== "build"}
            >
              <section
                aria-label={`Level ${selectedLevel}`}
                className="choice-pane"
                hidden={workspaceTab !== "build"}
              >
                {planningEvaluation === undefined && entities.length === 0 ? (
                  <p>Content is unavailable for planning.</p>
                ) : planningEvaluation === undefined ? (
                  <div className="level-choice-tabs-layout">
                    <div className="level-choice-tab-bar">{levelPicker}</div>
                    <LoadingPane
                      label={`Evaluating choices through level ${planningHorizon}…`}
                      detail={
                        loadingProgress.evaluationPercent === undefined
                          ? undefined
                          : `${loadingProgress.evaluationPercent}%`
                      }
                    />
                  </div>
                ) : levelChoices.length === 0 && selectedLevel !== 1 ? (
                  <div className="level-choice-tabs-layout">
                    <div className="level-choice-tab-bar">{levelPicker}</div>
                    <div className="choice-empty-state">
                      <Icon name="check" />
                      <h4>
                        No choices need attention at level {selectedLevel}
                      </h4>
                      <p>
                        Choose another level from the Level {selectedLevel} menu
                        above.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="level-choice-tabs-layout">
                    <div className="level-choice-tab-bar">
                      {levelPicker}
                      <div
                        aria-label={`Level ${selectedLevel} choice sections`}
                        className="level-choice-tabs"
                        role="tablist"
                      >
                        {levelSectionTabs.map((section, index) => {
                          const sectionChoices =
                            displayedChoiceSections.find(
                              (group) => group.section === section,
                            )?.choices ?? [];
                          const incomplete =
                            selectedLevel <= build.effectiveLevel &&
                            ((section === "Ability Scores" &&
                              selectedLevel === 1 &&
                              abilityScoresIncomplete) ||
                              sectionChoices.some(isUnresolvedChoice));
                          const tabId = `level-${selectedLevel}-${levelChoiceTabSlug(section)}-tab`;
                          const panelId = `level-${selectedLevel}-${levelChoiceTabSlug(section)}-panel`;
                          return (
                            <button
                              aria-controls={panelId}
                              aria-selected={section === activeLevelSection}
                              className={
                                incomplete ? "choice-tab-incomplete" : undefined
                              }
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
                              <Icon name={choiceSectionIcon(section)} />
                              <span>{section}</span>
                              {/* Progress only: warnings and house rules
                                  live in the tab bar's badges. */}
                              {incomplete ? (
                                <>
                                  <span
                                    aria-hidden="true"
                                    className="choice-tab-status"
                                  />
                                  <span className="visually-hidden">
                                    Incomplete
                                  </span>
                                </>
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    {/* Sections whose cards are long text get a wider
                        detail pane (see .is-wide-detail). */}
                    <div
                      className={`level-choice-workspace${activeLevelSection !== undefined && WIDE_DETAIL_SECTIONS.has(activeLevelSection) ? " is-wide-detail" : ""}`}
                    >
                      <CandidateInspectionScope
                        key={`${workspaceTab === "build" ? "open" : "closed"}:${selectedLevel}:${activeLevelSection ?? "empty"}:${openAccordionKey ?? "none"}`}
                        onInspect={setInspectedOption}
                      >
                        <div
                          className="level-choice-page"
                          ref={levelChoicePage}
                        >
                          {activeChoiceSection === undefined ? null : (
                            <section
                              aria-labelledby={`level-${selectedLevel}-${levelChoiceTabSlug(activeChoiceSection.section)}-tab`}
                              className="level-choice-tab-panel"
                              id={`level-${selectedLevel}-${levelChoiceTabSlug(activeChoiceSection.section)}-panel`}
                              role="tabpanel"
                            >
                              <div className="legacy-choice-list">
                                {activeChoiceSection.section ===
                                  "Ability Scores" && selectedLevel === 1 ? (
                                  selectedLevelEvaluation ===
                                  undefined ? null : (
                                    <BaseAbilityScoreEditor
                                      build={build}
                                      evaluation={selectedLevelEvaluation}
                                      pendingBonusDeltas={
                                        pendingLevelOneAbilityDeltas
                                      }
                                      keyAbilities={selectedClassKeyAbilities}
                                      keyAbilitiesSentence={
                                        keyAbilitiesSentence
                                      }
                                      race={selectedRaceEntity}
                                      raceAbilityChoice={raceAbilityChoice}
                                      raceAbilitySelectionId={
                                        raceAbilitySelectionId
                                      }
                                      byId={byId}
                                      onRaceAbilitySelection={
                                        selectRaceAbilityBonus
                                      }
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
                                              activeChoiceSection.choices
                                                .length,
                                              selectedLevel,
                                            ),
                                          )}
                                      {activeChoiceSection.section ===
                                        "Class" &&
                                      selectedLevel === 1 &&
                                      choice.id === classChoicePlacementId ? (
                                        <>
                                          {presetsInAccordion
                                            ? renderAccordionItem({
                                                key: "presets",
                                                title: "Starting presets",
                                                picks: "optional",
                                                onToggle: () =>
                                                  toggleAccordion("presets"),
                                                children: (
                                                  <BuildPresetPanel
                                                    choices={buildPresetChoices}
                                                    levelChoices={
                                                      mechanicalLevelChoices
                                                    }
                                                    evaluation={
                                                      planningEvaluation
                                                    }
                                                    build={build}
                                                    entities={entities}
                                                    byId={byId}
                                                    onDispatch={dispatch}
                                                  />
                                                ),
                                              })
                                            : null}
                                          {requiredClassDeityChoices.length ===
                                          0 ? null : (
                                            <div className="class-deity-choice">
                                              {requiredClassDeityChoices.map(
                                                (deityChoice) => (
                                                  <Fragment
                                                    key={deityChoice.id}
                                                  >
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
                                {activeChoiceSection.section === "Companion" &&
                                hasCompanionChoice(
                                  activeChoiceSection.choices,
                                ) ? (
                                  <CompanionNameFields
                                    build={build}
                                    onDispatch={dispatch}
                                  />
                                ) : null}
                              </div>
                            </section>
                          )}
                        </div>
                        <div className="shared-choice-detail">
                          <CandidateDetail
                            byId={byId}
                            candidate={inspectedOption?.candidate}
                            entity={inspectedOption?.entity}
                            favoritable={inspectedOption?.favoritable === true}
                          />
                        </div>
                      </CandidateInspectionScope>
                    </div>
                  </div>
                )}
              </section>
            </div>

            <div
              className="builder-workspace builder-tab-content"
              hidden={workspaceTab !== "retraining"}
            >
              {workspaceTab === "retraining" ? (
                <RetrainingWorkspace
                  evaluation={planningEvaluation}
                  build={build}
                  entities={entities}
                  byId={byId}
                  rollbackRevision={rollbackRevision}
                  selectedLevel={selectedLevel}
                  onSelectLevel={(level) => {
                    setSelectedLevel(level);
                    onNavigate(characterId, { workspace: "retraining", level });
                  }}
                  onRequestDetails={setExpandedReplacementChoiceId}
                  onDispatch={dispatch}
                />
              ) : null}
            </div>

            <div
              className="builder-tab-content"
              hidden={workspaceTab !== "details"}
            >
              <CharacterDetailsEditor
                active={workspaceTab === "details"}
                choices={characterDetailChoices}
                evaluation={planningEvaluation}
                build={build}
                snapshotDetails={character.snapshot.details}
                entities={entities}
                byId={byId}
                rollbackRevision={rollbackRevision}
                effectiveLevel={build.effectiveLevel}
                deityAlignment={deityAlignment}
                alignmentHouseRuled={alignmentIssue !== undefined}
                onDispatch={dispatch}
              />
            </div>

            <section
              aria-labelledby="diagnostics-heading"
              className="choice-pane standalone-workspace-pane builder-tab-content"
              hidden={workspaceTab !== "diagnostics"}
            >
              <header>
                <h3 id="diagnostics-heading">Diagnostics</h3>
              </header>
              <div className="standalone-workspace-content diagnostics-workspace">
                {planningEvaluation === undefined ? (
                  <p>Evaluating character…</p>
                ) : diagnosticGroups.every(
                    ({ issues }) => issues.length === 0,
                  ) ? (
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
                        {renderIssueList(issues)}
                      </section>
                    ),
                  )
                )}
              </div>
            </section>

            <section
              aria-labelledby="house-rules-heading"
              className="choice-pane standalone-workspace-pane builder-tab-content"
              hidden={workspaceTab !== "house-rules"}
            >
              <header>
                <h3 id="house-rules-heading">House rules</h3>
              </header>
              <div className="standalone-workspace-content diagnostics-workspace">
                {planningEvaluation === undefined ? (
                  <p>Evaluating character…</p>
                ) : builderIssues.houseRules.length === 0 ? (
                  <p>This character follows the standard rules.</p>
                ) : (
                  <>
                    <p className="field-help">
                      Intentional departures from the standard
                      character-building rules. They stay active and are kept on
                      export.
                    </p>
                    {renderIssueList(builderIssues.houseRules)}
                  </>
                )}
              </div>
            </section>

            <div
              className="builder-tab-content"
              hidden={workspaceTab !== "equipment" && workspaceTab !== "shop"}
            >
              {equipmentWallet === undefined ? null : (
                <BuilderCardContext.Provider
                  value={equipmentCardSettings ?? buildCardSettings}
                >
                  <EquipmentWorkspace
                    build={build}
                    entities={entities}
                    byId={byId}
                    activeDefinitionIds={
                      currentEvaluation?.activeDefinitionIds ?? []
                    }
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
                    onShopCategoryChange={(category) =>
                      onNavigate(characterId, { workspace: "shop", category })
                    }
                    wallet={equipmentWallet}
                    onPutInventory={(entry) =>
                      dispatch({ kind: "put-inventory", entry })
                    }
                    onPurchase={(entry, priceCopper) =>
                      dispatch({
                        kind: "purchase-inventory",
                        entry,
                        priceCopper,
                      })
                    }
                    onSell={(entry, priceCopper, percentage) =>
                      dispatch({
                        kind: "sell-inventory",
                        entryId: entry.id,
                        priceCopper,
                        percentage,
                      })
                    }
                    onEquipSlot={(
                      entryId,
                      slots,
                      currentEntryId,
                      currentSlots,
                    ) => {
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
                  />
                </BuilderCardContext.Provider>
              )}
            </div>

            <div
              className="builder-tab-content"
              hidden={workspaceTab !== "rituals"}
            >
              {workspaceTab !== "rituals" ||
              carriedWallet === undefined ||
              storedWallet === undefined ? null : (
                <BuilderCardContext.Provider
                  value={equipmentCardSettings ?? buildCardSettings}
                >
                  <RitualsWorkspace
                    build={build}
                    entities={entities}
                    byId={byId}
                    evaluation={currentEvaluation}
                    walletCopper={
                      currencyToCopper(carriedWallet) +
                      currencyToCopper(storedWallet)
                    }
                    category={
                      navigation.workspace === "rituals"
                        ? navigation.category
                        : undefined
                    }
                    onCategoryChange={(category) =>
                      onNavigate(characterId, {
                        workspace: "rituals",
                        ...(category === undefined ? {} : { category }),
                      })
                    }
                    onLearn={(entry, priceCopper) =>
                      dispatch({ kind: "learn-known", entry, priceCopper })
                    }
                    onRemove={(id) => dispatch({ kind: "remove-known", id })}
                  />
                </BuilderCardContext.Provider>
              )}
            </div>
          </div>
        </div>
        <ToastRegion toasts={toasts.toasts} onDismiss={toasts.dismiss} />
      </main>
    </BuilderCardContext.Provider>
  );
}
