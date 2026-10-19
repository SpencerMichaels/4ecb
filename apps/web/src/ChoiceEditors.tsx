import { useContext, useEffect, useMemo, useRef, useState } from "react";

import type {
  BuildOccurrence,
  CharacterCommand,
  CharacterRecord,
} from "@4ecb/character-domain";
import type { ContentEntity } from "@4ecb/content-domain";
import {
  canMaterializeEvaluatedChoiceProvider,
  commandForEvaluatedChoice,
  findBuildChildIndex,
  type CandidateDecision,
  type EvaluatedCharacter,
  type EvaluatedChoice,
} from "@4ecb/rules-engine";

import {
  abilityScoreWithPendingDelta,
  buildPresetPlan,
  type BuildPresetPlan,
  type BuildPresetReplacement,
  candidateReason,
  choiceForRepeatedCandidate,
  choicePresentationLabel,
  choiceSectionId,
  choiceSelectionTableKind,
  choiceTitle,
  conventionalOptionOrder,
  contextualChoiceName,
  contextualChoiceTitle,
  findOccurrence,
  groupBackgroundChoiceCandidates,
  groupParameterizedCandidates,
  groupRepeatedCandidateScopes,
  isAbilityIncreaseChoiceType,
  isCandidateSelectable,
  isCandidateVisible,
  isUnresolvedChoice,
  pickLegality,
  repeatedChoiceGroupTitle,
  selectedChoiceIsHouseRule,
  selectedDefinitionId,
  selectedOccurrence,
  retrainingCategory,
  unresolveEvaluatedChoiceCommand,
  type ChoiceSelectionTableKind,
} from "./builder-ui";
import { InspectCandidateContext } from "./builder-choice-context";
import { CandidateDetail } from "./CandidateDetail";
import { CandidateSelectionTable } from "./CandidateSelectionTable";
import { Icon } from "./Icon";
import { KeyAbilitiesSummary, KeyAbilityName } from "./KeyAbilityMarker";

export function CompactChoiceButtons({
  label,
  hideLabel = false,
  options,
  keyAbilities = [],
  selectedId,
  disabled,
  onChoose,
  onInspect,
  onClear,
}: {
  readonly label: string;
  /** Keeps `label` as the accessible name without rendering a visible
   * legend — for callers that already show it as their own heading. */
  readonly hideLabel?: boolean;
  readonly options: readonly {
    readonly id: string;
    readonly label: string;
    readonly selectable: boolean;
    readonly unavailableReason?: string;
  }[];
  readonly keyAbilities?: readonly string[];
  readonly selectedId: string;
  readonly disabled: boolean;
  readonly onChoose: (id: string) => void;
  readonly onInspect?: (id: string) => void;
  readonly onClear?: () => void;
}) {
  const clearable = onClear !== undefined;
  return (
    <fieldset className="compact-choice-picker">
      <legend
        className={
          hideLabel ? "visually-hidden" : "selection-subsection-heading"
        }
      >
        {label}
      </legend>
      <div
        className="compact-choice-options"
        {...(clearable ? {} : { "aria-label": label, role: "radiogroup" })}
      >
        {options.map((option) => {
          const selected = option.id === selectedId;
          const blocked =
            disabled || (!option.selectable && !(clearable && selected));
          const keyAbility = keyAbilities.some(
            (ability) =>
              ability.toLocaleLowerCase() === option.label.toLocaleLowerCase(),
          );
          return (
            <button
              aria-disabled={blocked}
              {...(clearable
                ? { "aria-pressed": selected }
                : { "aria-checked": selected, role: "radio" })}
              className={
                `${selected ? "is-selected" : ""}${keyAbility ? " has-key-ability" : ""}`.trim() ||
                undefined
              }
              key={option.id}
              title={option.unavailableReason}
              type="button"
              onClick={() => {
                if (selected && clearable && !disabled) {
                  onClear();
                  return;
                }
                onInspect?.(option.id);
                if (!blocked) onChoose(option.id);
              }}
            >
              <KeyAbilityName
                className="compact-choice-label"
                marked={keyAbility}
              >
                {option.label}
              </KeyAbilityName>
              {option.unavailableReason === undefined ? null : (
                <small>{option.unavailableReason}</small>
              )}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function BuildPresetPanel({
  choices,
  levelChoices,
  evaluation,
  build,
  entities,
  byId,
  onDispatch,
}: {
  readonly choices: readonly EvaluatedChoice[];
  readonly levelChoices: readonly EvaluatedChoice[];
  readonly evaluation: EvaluatedCharacter;
  readonly build: CharacterRecord["build"];
  readonly entities: readonly ContentEntity[];
  readonly byId: ReadonlyMap<string, ContentEntity>;
  readonly onDispatch: (command: CharacterCommand) => void;
}) {
  const inspectCandidate = useContext(InspectCandidateContext);
  const presets = useMemo(
    () =>
      choices.flatMap((choice) =>
        choice.candidates.flatMap((candidate) => {
          const entity = byId.get(candidate.definitionId.toLocaleLowerCase());
          return candidate.eligible && entity !== undefined
            ? [{ candidate, entity }]
            : [];
        }),
      ),
    [byId, choices],
  );
  const [applyStatus, setApplyStatus] = useState<string>();
  // A preset whose application would replace existing picks, awaiting OK.
  const [pending, setPending] = useState<{
    readonly name: string;
    readonly plan: BuildPresetPlan;
  }>();

  if (presets.length === 0) return null;
  const inspect = (definitionId: string) => {
    const preset = presets.find(
      ({ candidate }) => candidate.definitionId === definitionId,
    );
    inspectCandidate?.(
      preset === undefined ? undefined : { ...preset, favoritable: true },
    );
  };
  const apply = (plan: BuildPresetPlan) => {
    const applied =
      plan.command.kind === "batch" ? plan.command.commands.length : 1;
    setApplyStatus(
      `${applied} ${applied === 1 ? "choice" : "choices"} applied.`,
    );
    onDispatch(plan.command);
  };
  // Like any table: a click shows a preset, a double-click (or Enter)
  // applies it — straight away when it only fills empty choices, after a
  // confirmation when it would replace picks already made.
  const choose = (definitionId: string) => {
    const preset = presets.find(
      ({ candidate }) => candidate.definitionId === definitionId,
    );
    if (preset === undefined) return;
    inspect(definitionId);
    const plan = buildPresetPlan(
      build,
      preset.entity,
      levelChoices,
      evaluation,
      entities,
      (id, index) => `web:preset:${id}:${index}:${crypto.randomUUID()}`,
    );
    if (plan === undefined) {
      setApplyStatus(`${preset.entity.name} is already applied.`);
      return;
    }
    if (plan.replaced.length > 0) {
      setPending({ name: preset.entity.name, plan });
      return;
    }
    apply(plan);
  };
  return (
    <section aria-label="Starting presets" className="build-presets">
      <div className="build-presets-content">
        <CandidateSelectionTable
          kind="preset"
          candidates={presets.map(({ candidate }) => candidate)}
          featGroups={[]}
          selectedIds={new Set()}
          expandedGroupKey=""
          byId={byId}
          disabled={false}
          onExpandGroup={() => undefined}
          onInspect={(candidate) => {
            setApplyStatus(undefined);
            inspect(candidate.definitionId);
          }}
          onToggle={choose}
        />
        {applyStatus === undefined ? null : (
          <p aria-live="polite" className="build-preset-status">
            {applyStatus}
          </p>
        )}
      </div>
      {pending === undefined ? null : (
        <PresetReplaceDialog
          name={pending.name}
          replaced={pending.plan.replaced}
          onCancel={() => setPending(undefined)}
          onConfirm={() => {
            apply(pending.plan);
            setPending(undefined);
          }}
        />
      )}
    </section>
  );
}

/** Confirms a preset that would overwrite picks the character already has. */
function PresetReplaceDialog({
  name,
  replaced,
  onCancel,
  onConfirm,
}: {
  readonly name: string;
  readonly replaced: readonly BuildPresetReplacement[];
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const current = dialog.current;
    if (current !== null && !current.open) current.showModal();
  }, []);
  return (
    <dialog
      aria-labelledby="preset-replace-title"
      className="preset-replace-dialog dialog-shell"
      ref={dialog}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <header>
        <h2 id="preset-replace-title">Apply {name}?</h2>
        <button
          aria-label="Close"
          className="button-icon dialog-close"
          title="Close"
          type="button"
          onClick={onCancel}
        >
          <Icon name="remove" />
        </button>
      </header>
      <div className="preset-replace-body">
        <p>
          This replaces {replaced.length}{" "}
          {replaced.length === 1 ? "choice" : "choices"} you already made:
        </p>
        <ul>
          {replaced.map(({ from, to }) => (
            <li key={`${from}->${to}`}>
              {from} → <strong>{to}</strong>
            </li>
          ))}
        </ul>
      </div>
      <footer>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button className="button-primary" type="button" onClick={onConfirm}>
          Replace and apply
        </button>
      </footer>
    </dialog>
  );
}

/** A replace target (something the character has) as a table row. */
function targetDecision(
  option: NonNullable<EvaluatedChoice["replacementOptions"]>[number],
): CandidateDecision {
  return {
    definitionId: option.definitionId,
    eligible: true,
    sourceEntitled: true,
    rulesLegal: true,
    activeDefinition: true,
    activeOccurrenceIds: [option.replacesOccurrenceId],
    providerOccurrenceIds: [],
    reasons: [],
  };
}

/** The table kind for a list of powers, feats, backgrounds or other options. */
function replacementTableKind(
  definitionIds: readonly string[],
  byId: ReadonlyMap<string, ContentEntity>,
): ChoiceSelectionTableKind {
  const types = definitionIds.map(
    (id) =>
      byId.get(id.toLocaleLowerCase())?.type.trim().toLocaleLowerCase() ?? "",
  );
  if (types.every((type) => type.includes("power"))) return "power";
  if (types.every((type) => type.includes("feat"))) return "feat";
  if (types.every((type) => type === "background")) return "background";
  return "option";
}

function ReplacementEditor({
  choice,
  evaluation,
  build,
  entities,
  buildProvider,
  providerEntity,
  byId,
  disabled,
  targetType,
  rollbackRevision,
  onDispatch,
}: {
  readonly choice: EvaluatedChoice;
  readonly evaluation: EvaluatedCharacter;
  readonly build: CharacterRecord["build"];
  readonly entities: readonly ContentEntity[];
  readonly buildProvider: BuildOccurrence;
  readonly providerEntity: ContentEntity | undefined;
  readonly byId: ReadonlyMap<string, ContentEntity>;
  readonly disabled: boolean;
  readonly targetType?: string;
  readonly rollbackRevision: number;
  readonly onDispatch: (command: CharacterCommand) => void;
}) {
  const allOptions = choice.replacementOptions ?? [];
  const selected = selectedOccurrence(choice, evaluation);
  const options =
    targetType === undefined
      ? allOptions
      : allOptions.filter(
          (option) =>
            option.replacesOccurrenceId === selected?.replacesId ||
            retrainingCategory(
              byId.get(option.definitionId.toLocaleLowerCase())?.type,
            ) === targetType,
        );
  const [targetId, setTargetId] = useState(selected?.replacesId ?? "");
  const [showAll, setShowAll] = useState(false);
  const inspectCandidate = useContext(InspectCandidateContext);
  const [optimisticSelectedId, setOptimisticSelectedId] = useState(
    selected?.definitionId ?? "",
  );
  const [perusedId, setPerusedId] = useState(selected?.definitionId ?? "");
  const [perusingTarget, setPerusingTarget] = useState(false);
  const [expandedReplacementGroupKey, setExpandedReplacementGroupKey] =
    useState("");
  const target = options.find(
    (option) => option.replacesOccurrenceId === targetId,
  );
  const visible = (target?.candidates ?? []).filter((candidate) =>
    isCandidateVisible(candidate, showAll, selected?.definitionId),
  );
  const selectedValue = visible.some(
    (candidate) => candidate.definitionId === optimisticSelectedId,
  )
    ? optimisticSelectedId
    : "";
  const targetOption = options.find(
    (option) => option.replacesOccurrenceId === targetId,
  );
  const detailCandidate = perusingTarget
    ? targetOption === undefined
      ? undefined
      : targetDecision(targetOption)
    : (target?.candidates ?? []).find(
        (candidate) =>
          candidate.definitionId === perusedId &&
          isCandidateVisible(candidate, showAll, selected?.definitionId),
      );
  const detailEntity =
    detailCandidate === undefined
      ? undefined
      : byId.get(detailCandidate.definitionId.toLocaleLowerCase());
  const replacementKind = replacementTableKind(
    visible.map(({ definitionId }) => definitionId),
    byId,
  );
  // What can be given up, as table rows with details (not bare buttons).
  const targetCandidates = options.map(targetDecision);
  const targetKind = replacementTableKind(
    options.map(({ definitionId }) => definitionId),
    byId,
  );
  // Feat tables draw their rows from groups, so owned feats need them too.
  const targetFeatGroups =
    targetKind === "feat"
      ? groupParameterizedCandidates(
          targetCandidates,
          (definitionId) =>
            byId.get(definitionId.toLocaleLowerCase())?.name ?? definitionId,
        )
      : [];
  const replacementFeatGroups =
    replacementKind === "feat"
      ? groupParameterizedCandidates(
          visible,
          (definitionId) =>
            byId.get(definitionId.toLocaleLowerCase())?.name ?? definitionId,
        )
      : [];

  const inspect = (
    candidate: CandidateDecision | undefined,
    favoritable = false,
  ): void => {
    if (candidate === undefined || inspectCandidate === undefined) return;
    const entity = byId.get(candidate.definitionId.toLocaleLowerCase());
    if (entity !== undefined)
      inspectCandidate({ candidate, entity, favoritable });
  };

  useEffect(() => {
    setOptimisticSelectedId("");
    setPerusedId("");
    setPerusingTarget(false);
    setExpandedReplacementGroupKey("");
  }, [rollbackRevision]);

  useEffect(() => {
    setTargetId(selected?.replacesId ?? "");
    setOptimisticSelectedId(selected?.definitionId ?? "");
    setPerusedId(selected?.definitionId ?? "");
    setPerusingTarget(false);
    setExpandedReplacementGroupKey("");
  }, [choice.id, evaluation, selected?.definitionId, selected?.replacesId]);

  useEffect(() => {
    if (
      perusingTarget ||
      visible.some((candidate) => candidate.definitionId === perusedId)
    )
      return;
    setPerusedId(
      visible.find(
        (candidate) => candidate.definitionId === optimisticSelectedId,
      )?.definitionId ??
        visible[0]?.definitionId ??
        "",
    );
  }, [
    optimisticSelectedId,
    perusedId,
    perusingTarget,
    showAll,
    targetId,
    visible,
  ]);

  const selectReplacement = (
    replacementTarget: NonNullable<
      EvaluatedChoice["replacementOptions"]
    >[number],
    candidate: CandidateDecision,
  ): void => {
    const definition = byId.get(candidate.definitionId.toLocaleLowerCase());
    if (definition === undefined || !isCandidateSelectable(candidate)) return;
    setPerusingTarget(false);
    setOptimisticSelectedId(candidate.definitionId);
    setPerusedId(candidate.definitionId);
    inspect(candidate);
    onDispatch({
      kind: "retrain",
      parentId: buildProvider.id,
      index: findBuildChildIndex(
        buildProvider,
        providerEntity,
        choice.ruleOrdinal,
        choice.index,
      ),
      replacesId: replacementTarget.replacesOccurrenceId,
      replacement: {
        id: `web:${crypto.randomUUID()}`,
        identity: {
          definitionId: definition.id,
          name: definition.name,
          type: definition.type,
        },
        acquiredLevel: buildProvider.acquiredLevel,
        legality: pickLegality(candidate),
        children: [],
        unresolved: false,
      },
    });
  };

  const chooseTarget = (nextTargetId: string): void => {
    setTargetId(nextTargetId);
    setPerusingTarget(true);
    const option = options.find(
      (item) => item.replacesOccurrenceId === nextTargetId,
    );
    setPerusedId(option?.definitionId ?? "");
    inspect(option === undefined ? undefined : targetDecision(option));
  };

  const clearReplacement = (): void => {
    if (selected === undefined) return;
    const command = unresolveEvaluatedChoiceCommand(
      build,
      choice,
      evaluation,
      entities,
      `web:placeholder:${crypto.randomUUID()}`,
    );
    if (command === undefined) return;
    setOptimisticSelectedId("");
    setPerusedId("");
    inspectCandidate?.(undefined);
    onDispatch(command);
  };

  return (
    <div className="choice-selection-layout">
      <div className="choice-editor-fields">
        <div className="replacement-targets">
          <CandidateSelectionTable
            kind={targetKind}
            nameColumnLabel="Replace"
            expandSections
            candidates={targetCandidates}
            featGroups={targetFeatGroups}
            selectedIds={
              new Set(
                targetOption === undefined ? [] : [targetOption.definitionId],
              )
            }
            expandedGroupKey=""
            byId={byId}
            disabled={disabled}
            onExpandGroup={() => undefined}
            onInspect={(candidate) => {
              const option = options.find(
                (item) => item.definitionId === candidate.definitionId,
              );
              if (option === undefined) return;
              setPerusingTarget(true);
              setPerusedId(option.definitionId);
              inspect(targetDecision(option));
            }}
            onToggle={(definitionId) => {
              const option = options.find(
                (item) => item.definitionId === definitionId,
              );
              if (option !== undefined)
                chooseTarget(option.replacesOccurrenceId);
            }}
          />
        </div>
        {target === undefined ? null : (
          <CandidateSelectionTable
            evaluation={evaluation}
            kind={replacementKind}
            {...(replacementKind === "option"
              ? { nameColumnLabel: "Replacement" }
              : {})}
            candidates={visible}
            featGroups={replacementFeatGroups}
            selectedIds={new Set(selectedValue === "" ? [] : [selectedValue])}
            expandedGroupKey={expandedReplacementGroupKey}
            byId={byId}
            disabled={disabled}
            showIllegal={showAll}
            onExpandGroup={setExpandedReplacementGroupKey}
            onInspect={(candidate) => {
              setPerusingTarget(false);
              setPerusedId(candidate.definitionId);
              inspect(candidate, true);
            }}
            onToggle={(definitionId) => {
              // Picking the selected replacement again clears it.
              if (
                definitionId.toLocaleLowerCase() ===
                selectedValue.toLocaleLowerCase()
              ) {
                clearReplacement();
                return;
              }
              const candidate = target.candidates.find(
                (item) => item.definitionId === definitionId,
              );
              if (candidate !== undefined) selectReplacement(target, candidate);
            }}
            onToggleShowIllegal={() => setShowAll((current) => !current)}
          />
        )}
      </div>
      {inspectCandidate === undefined ? (
        <CandidateDetail
          candidate={detailCandidate}
          entity={detailEntity}
          byId={byId}
        />
      ) : null}
    </div>
  );
}

export function ChoiceEditor({
  choice,
  evaluation,
  build,
  entities,
  byId,
  disabled,
  compact = false,
  hideSelectionLabel = false,
  selectionLabel = "Selection",
  keyAbilities = [],
  replacementTargetType,
  rollbackRevision,
  onOptimisticSelectionChange,
  onDispatch,
}: {
  readonly choice: EvaluatedChoice;
  readonly evaluation: EvaluatedCharacter;
  readonly build: CharacterRecord["build"];
  readonly entities: readonly ContentEntity[];
  readonly byId: ReadonlyMap<string, ContentEntity>;
  readonly disabled: boolean;
  readonly compact?: boolean;
  readonly hideSelectionLabel?: boolean;
  readonly selectionLabel?: string;
  readonly keyAbilities?: readonly string[];
  readonly replacementTargetType?: string;
  readonly rollbackRevision: number;
  readonly onOptimisticSelectionChange?: (
    definitionId: string | undefined,
  ) => void;
  readonly onDispatch: (command: CharacterCommand) => void;
}) {
  const provider = evaluation.occurrences.find(
    (occurrence) => occurrence.id === choice.providerOccurrenceId,
  );
  const buildProvider = findOccurrence(build, choice.providerOccurrenceId);
  const materializableProvider = canMaterializeEvaluatedChoiceProvider(
    build,
    choice,
    evaluation.occurrences,
    entities,
  );
  const selected = selectedOccurrence(choice, evaluation);
  const [showAll, setShowAll] = useState(false);
  const inspectCandidate = useContext(InspectCandidateContext);
  const [optimisticSelectedId, setOptimisticSelectedId] = useState(
    selected?.definitionId ?? "",
  );
  const [perusedId, setPerusedId] = useState(selected?.definitionId ?? "");
  const [stagedGroupKey, setStagedGroupKey] = useState<string>();

  const visibleCandidates = choice.candidates.filter((candidate) =>
    isCandidateVisible(candidate, showAll, selected?.definitionId),
  );
  const normalizedChoiceType = choice.type.trim().toLocaleLowerCase();
  const selectionTableKind = choiceSelectionTableKind(choice);
  const candidateName = (definitionId: string) => {
    const definition = byId.get(definitionId.toLocaleLowerCase());
    return definition?.name ?? definitionId;
  };
  const presentationGroups =
    normalizedChoiceType === "feat"
      ? groupParameterizedCandidates(visibleCandidates, (definitionId) => {
          return candidateName(definitionId);
        })
      : normalizedChoiceType === "background choice"
        ? groupBackgroundChoiceCandidates(visibleCandidates, candidateName)
        : [];
  const groupedPresentation =
    normalizedChoiceType === "background choice" ||
    presentationGroups.some((group) => group.parameterLabel !== undefined);
  const selectedPresentationGroup = presentationGroups.find((group) =>
    group.options.some(
      ({ candidate }) => candidate.definitionId === optimisticSelectedId,
    ),
  );
  const displayedGroupKey =
    stagedGroupKey ?? selectedPresentationGroup?.key ?? "";
  const displayedGroup = presentationGroups.find(
    (group) => group.key === displayedGroupKey,
  );
  const selectedValue = visibleCandidates.some(
    (candidate) => candidate.definitionId === optimisticSelectedId,
  )
    ? optimisticSelectedId
    : "";
  const detailCandidate = choice.candidates.find(
    (candidate) =>
      candidate.definitionId === perusedId &&
      isCandidateVisible(candidate, showAll, selected?.definitionId),
  );
  const editorDisabled =
    disabled || !materializableProvider || choice.type === "Replacement";

  useEffect(() => {
    setOptimisticSelectedId("");
    setPerusedId("");
    setStagedGroupKey(undefined);
  }, [rollbackRevision]);

  useEffect(() => setStagedGroupKey(undefined), [showAll]);

  useEffect(() => {
    setOptimisticSelectedId(selected?.definitionId ?? "");
    setPerusedId(selected?.definitionId ?? "");
    setStagedGroupKey(undefined);
  }, [choice.id, evaluation, selected?.definitionId]);

  useEffect(() => {
    if (
      visibleCandidates.some(
        (candidate) => candidate.definitionId === perusedId,
      )
    )
      return;
    setPerusedId(
      visibleCandidates.find(
        (candidate) => candidate.definitionId === optimisticSelectedId,
      )?.definitionId ??
        visibleCandidates[0]?.definitionId ??
        "",
    );
  }, [optimisticSelectedId, perusedId, showAll, visibleCandidates]);

  if (choice.type === "Replacement" && buildProvider !== undefined)
    return (
      <ReplacementEditor
        choice={choice}
        evaluation={evaluation}
        build={build}
        entities={entities}
        buildProvider={buildProvider}
        providerEntity={
          provider === undefined
            ? undefined
            : byId.get(provider.definitionId.toLocaleLowerCase())
        }
        byId={byId}
        disabled={disabled}
        {...(replacementTargetType === undefined
          ? {}
          : { targetType: replacementTargetType })}
        rollbackRevision={rollbackRevision}
        onDispatch={onDispatch}
      />
    );

  const selectDefinition = (definitionId: string): void => {
    const candidate = choice.candidates.find(
      (item) => item.definitionId === definitionId,
    );
    const definition = byId.get(definitionId.toLocaleLowerCase());
    if (
      candidate === undefined ||
      definition === undefined ||
      !isCandidateSelectable(candidate)
    )
      return;
    setOptimisticSelectedId(definitionId);
    setPerusedId(definitionId);
    inspectCandidate?.({
      candidate,
      entity: definition,
      favoritable: selectionTableKind !== undefined,
    });
    const occurrence: BuildOccurrence = {
      id: `web:${crypto.randomUUID()}`,
      identity: {
        definitionId: definition.id,
        name: definition.name,
        type: definition.type,
      },
      acquiredLevel:
        buildProvider?.acquiredLevel ??
        provider?.acquiredLevel ??
        evaluation.level,
      legality: pickLegality(candidate),
      children: [],
      unresolved: false,
    };
    const command = commandForEvaluatedChoice(
      build,
      choice,
      evaluation.occurrences,
      entities,
      occurrence,
      (index) => `web:placeholder:${index}:${crypto.randomUUID()}`,
    );
    if (command !== undefined) {
      onOptimisticSelectionChange?.(definitionId);
      onDispatch(command);
    }
  };

  const clearSelection = (): void => {
    if (selected === undefined) return;
    const command = unresolveEvaluatedChoiceCommand(
      build,
      choice,
      evaluation,
      entities,
      `web:placeholder:${crypto.randomUUID()}`,
    );
    if (command === undefined) return;
    setOptimisticSelectedId("");
    setPerusedId("");
    setStagedGroupKey(undefined);
    inspectCandidate?.(undefined);
    onOptimisticSelectionChange?.(undefined);
    onDispatch(command);
  };

  return (
    <div
      className={`choice-selection-layout${compact ? " choice-selection-compact" : ""}`}
    >
      <div className="choice-editor-fields">
        {selectionTableKind !== undefined ? (
          <CandidateSelectionTable
            evaluation={evaluation}
            kind={selectionTableKind}
            {...(selectionTableKind === "option"
              ? { nameColumnLabel: choiceTitle(choice) }
              : {})}
            candidates={visibleCandidates}
            featGroups={selectionTableKind === "feat" ? presentationGroups : []}
            selectedIds={new Set(selectedValue === "" ? [] : [selectedValue])}
            expandedGroupKey={displayedGroupKey}
            byId={byId}
            disabled={editorDisabled}
            showIllegal={showAll}
            onExpandGroup={setStagedGroupKey}
            onInspect={(candidate) => {
              setPerusedId(candidate.definitionId);
              const entity = byId.get(
                candidate.definitionId.toLocaleLowerCase(),
              );
              if (entity !== undefined)
                inspectCandidate?.({ candidate, entity, favoritable: true });
            }}
            onToggle={(definitionId) =>
              // Picking the selected row again deselects it, as in
              // multi-select tables.
              definitionId.toLocaleLowerCase() ===
              selectedValue.toLocaleLowerCase()
                ? clearSelection()
                : selectDefinition(definitionId)
            }
            onToggleShowIllegal={() => setShowAll((current) => !current)}
          />
        ) : groupedPresentation ? (
          <>
            <CompactChoiceButtons
              label={
                hideSelectionLabel
                  ? "Options"
                  : normalizedChoiceType === "background choice"
                    ? "Benefit type"
                    : "Feat"
              }
              options={presentationGroups.map((group) => ({
                id: group.key,
                label: `${group.label}${group.parameterLabel === undefined ? "" : "…"}`,
                selectable: true,
              }))}
              keyAbilities={keyAbilities}
              selectedId={displayedGroupKey}
              disabled={editorDisabled}
              onClear={clearSelection}
              onChoose={(groupKey) => {
                const group = presentationGroups.find(
                  (candidate) => candidate.key === groupKey,
                );
                setStagedGroupKey(groupKey);
                if (group === undefined) return;
                const exact = group.options.length === 1;
                const definitionId = group.options[0]!.candidate.definitionId;
                setPerusedId(definitionId);
                const definition = byId.get(definitionId.toLocaleLowerCase());
                if (definition !== undefined)
                  inspectCandidate?.({
                    candidate: group.options[0]!.candidate,
                    entity: definition,
                  });
                if (exact) selectDefinition(definitionId);
              }}
            />
            {displayedGroup?.parameterLabel === undefined ? null : (
              <CompactChoiceButtons
                label={displayedGroup.parameterLabel}
                options={displayedGroup.options.map(({ candidate, label }) => ({
                  id: candidate.definitionId,
                  label,
                  selectable: isCandidateSelectable(candidate),
                  ...(candidate.eligible
                    ? {}
                    : {
                        unavailableReason: candidateReason(candidate.reasons),
                      }),
                }))}
                keyAbilities={keyAbilities}
                selectedId={
                  displayedGroup.options.some(
                    ({ candidate }) =>
                      candidate.definitionId === optimisticSelectedId,
                  )
                    ? optimisticSelectedId
                    : ""
                }
                disabled={editorDisabled}
                onClear={clearSelection}
                onInspect={(definitionId) => {
                  setPerusedId(definitionId);
                  const candidate = displayedGroup.options.find(
                    (option) => option.candidate.definitionId === definitionId,
                  )?.candidate;
                  const entity = byId.get(definitionId.toLocaleLowerCase());
                  if (candidate !== undefined && entity !== undefined)
                    inspectCandidate?.({ candidate, entity });
                }}
                onChoose={selectDefinition}
              />
            )}
          </>
        ) : (
          <CompactChoiceButtons
            label={hideSelectionLabel ? choiceTitle(choice) : selectionLabel}
            options={conventionalOptionOrder(
              choice.type,
              visibleCandidates,
              (candidate) => candidateName(candidate.definitionId),
            ).map((candidate) => ({
              id: candidate.definitionId,
              label:
                byId.get(candidate.definitionId.toLocaleLowerCase())?.name ??
                candidate.definitionId,
              selectable: isCandidateSelectable(candidate),
              ...(candidate.eligible
                ? {}
                : { unavailableReason: candidateReason(candidate.reasons) }),
            }))}
            keyAbilities={keyAbilities}
            selectedId={selectedValue}
            disabled={editorDisabled}
            onClear={clearSelection}
            onInspect={(definitionId) => {
              setPerusedId(definitionId);
              const candidate = visibleCandidates.find(
                (item) => item.definitionId === definitionId,
              );
              const entity = byId.get(definitionId.toLocaleLowerCase());
              if (candidate !== undefined && entity !== undefined)
                inspectCandidate?.({ candidate, entity });
            }}
            onChoose={selectDefinition}
          />
        )}
      </div>
      {compact || inspectCandidate !== undefined ? null : (
        <CandidateDetail
          candidate={detailCandidate}
          byId={byId}
          favoritable={selectionTableKind !== undefined}
          entity={
            detailCandidate === undefined
              ? undefined
              : byId.get(detailCandidate.definitionId.toLocaleLowerCase())
          }
        />
      )}
    </div>
  );
}

export function ChoiceFlowSection({
  choices,
  evaluation,
  build,
  entities,
  byId,
  rollbackRevision,
  onDispatch,
}: {
  readonly choices: readonly EvaluatedChoice[];
  readonly evaluation: EvaluatedCharacter;
  readonly build: CharacterRecord["build"];
  readonly entities: readonly ContentEntity[];
  readonly byId: ReadonlyMap<string, ContentEntity>;
  readonly rollbackRevision: number;
  readonly onDispatch: (command: CharacterCommand) => void;
}) {
  const root = choices[0]!;
  const selectedRoot = selectedOccurrence(root, evaluation);
  const selectedRootEntity =
    selectedRoot?.definitionId === undefined
      ? undefined
      : byId.get(selectedRoot.definitionId.toLocaleLowerCase());
  const unresolved = choices.some(isUnresolvedChoice);
  const houseRule = choices.some((choice) =>
    selectedChoiceIsHouseRule(choice, evaluation),
  );
  return (
    <section
      aria-labelledby={`${choiceSectionId(root.id)}-heading`}
      className={`level-choice-section grouped-choice-section choice-flow-section${unresolved && root.level <= build.effectiveLevel ? " choice-section-incomplete" : ""}`}
      id={choiceSectionId(root.id)}
      tabIndex={-1}
    >
      <header>
        <div>
          <h4
            className="selection-section-heading"
            id={`${choiceSectionId(root.id)}-heading`}
          >
            {contextualChoiceName(root, evaluation, (reference) =>
              byId.get(reference.trim().toLocaleLowerCase()),
            ) ??
              (choices.length > 1 && selectedRootEntity !== undefined
                ? selectedRootEntity.name
                : choiceTitle(root))}
          </h4>
        </div>
        {houseRule ? (
          <span className="attention-badge">
            <Icon name="house" /> House rule
          </span>
        ) : unresolved ? (
          <span className="visually-hidden">Incomplete</span>
        ) : null}
      </header>
      <div className="choice-flow-list">
        {choices.map((choice, index) => (
          <section
            aria-labelledby={`${choiceSectionId(choice.id)}-step-heading`}
            className="choice-flow-step"
            id={index === 0 ? undefined : choiceSectionId(choice.id)}
            key={choice.id}
          >
            <div className="choice-flow-step-heading">
              <span aria-hidden="true">{index + 1}</span>
              <h5
                className="selection-subsection-heading"
                id={`${choiceSectionId(choice.id)}-step-heading`}
              >
                {index === 0
                  ? choicePresentationLabel(choice.type)
                  : contextualChoiceTitle(choice, evaluation, byId)}
              </h5>
            </div>
            <ChoiceEditor
              choice={choice}
              evaluation={evaluation}
              build={build}
              entities={entities}
              byId={byId}
              disabled={false}
              hideSelectionLabel
              rollbackRevision={rollbackRevision}
              onDispatch={onDispatch}
            />
          </section>
        ))}
      </div>
    </section>
  );
}

function repeatedSlotLabel(choice: EvaluatedChoice, index: number): string {
  if (isAbilityIncreaseChoiceType(choice.type))
    return index === 0
      ? "First ability"
      : index === 1
        ? "Second ability"
        : `Ability ${index + 1}`;
  return `${choicePresentationLabel(choice.type)} ${index + 1}`;
}

const abilityOrder = [
  "Strength",
  "Constitution",
  "Dexterity",
  "Intelligence",
  "Wisdom",
  "Charisma",
] as const;

export function AbilityIncreaseEditor({
  choices,
  evaluation,
  build,
  entities,
  byId,
  keyAbilities,
  keyAbilitiesSentence,
  rollbackRevision,
  onDispatch,
}: {
  readonly choices: readonly EvaluatedChoice[];
  readonly evaluation: EvaluatedCharacter;
  readonly build: CharacterRecord["build"];
  readonly entities: readonly ContentEntity[];
  readonly byId: ReadonlyMap<string, ContentEntity>;
  readonly keyAbilities: readonly string[];
  readonly keyAbilitiesSentence: string | undefined;
  readonly rollbackRevision: number;
  readonly onDispatch: (command: CharacterCommand) => void;
}) {
  const evaluatedSlots = useMemo(
    () =>
      new Map(
        choices.map((choice) => [
          choice.id,
          selectedDefinitionId(choice, evaluation),
        ]),
      ),
    [choices, evaluation],
  );
  const [pendingSlots, setPendingSlots] = useState<
    Map<string, string | undefined>
  >(new Map());
  const choiceKey = choices.map((choice) => choice.id).join("\0");
  const evaluatedSlotKey = choices
    .map((choice) => `${choice.id}:${evaluatedSlots.get(choice.id) ?? ""}`)
    .join("\0");
  const optimisticSlots = new Map(evaluatedSlots);
  for (const [choiceId, definitionId] of pendingSlots)
    optimisticSlots.set(choiceId, definitionId);

  useEffect(() => setPendingSlots(new Map()), [rollbackRevision]);
  useEffect(() => {
    setPendingSlots((current) => {
      const next = new Map(current);
      let changed = false;
      for (const [choiceId, definitionId] of next) {
        if (
          !evaluatedSlots.has(choiceId) ||
          evaluatedSlots.get(choiceId) === definitionId
        ) {
          next.delete(choiceId);
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [choiceKey, evaluatedSlotKey, evaluatedSlots]);

  const candidateIds = [
    ...new Set(
      choices.flatMap((choice) =>
        choice.candidates.map((candidate) => candidate.definitionId),
      ),
    ),
  ].sort((left, right) => {
    const leftName = byId.get(left.toLocaleLowerCase())?.name ?? left;
    const rightName = byId.get(right.toLocaleLowerCase())?.name ?? right;
    const leftRank = abilityOrder.indexOf(
      leftName as (typeof abilityOrder)[number],
    );
    const rightRank = abilityOrder.indexOf(
      rightName as (typeof abilityOrder)[number],
    );
    return (
      (leftRank < 0 ? abilityOrder.length : leftRank) -
        (rightRank < 0 ? abilityOrder.length : rightRank) ||
      leftName.localeCompare(rightName)
    );
  });
  const occupiedChoiceIds = new Set(
    [...optimisticSlots].flatMap(([choiceId, definitionId]) =>
      definitionId === undefined ? [] : [choiceId],
    ),
  );
  const chosenCount = occupiedChoiceIds.size;

  return (
    <section
      aria-labelledby={`${choiceSectionId(choices[0]!.id)}-heading`}
      className={`level-choice-section ability-increase-section${chosenCount < choices.length && choices[0]!.level <= build.effectiveLevel ? " choice-section-incomplete" : ""}`}
      id={choiceSectionId(choices[0]!.id)}
      tabIndex={-1}
    >
      <header>
        <div>
          <h4
            className="selection-section-heading"
            id={`${choiceSectionId(choices[0]!.id)}-heading`}
          >
            Choose {choices.length} ability scores
          </h4>
          <KeyAbilitiesSummary sentence={keyAbilitiesSentence} />
        </div>
        <strong className="ability-choice-count" aria-live="polite">
          {chosenCount} of {choices.length} chosen
        </strong>
      </header>
      <div className="ability-increase-grid">
        {candidateIds.map((definitionId) => {
          const definition = byId.get(definitionId.toLocaleLowerCase());
          const selectedChoice = choices.find(
            (choice) => optimisticSlots.get(choice.id) === definitionId,
          );
          const targetChoice = choiceForRepeatedCandidate(
            choices,
            occupiedChoiceIds,
            definitionId,
            false,
          );
          const targetCandidate = targetChoice?.candidates.find(
            (candidate) => candidate.definitionId === definitionId,
          );
          const disabled =
            selectedChoice === undefined &&
            (chosenCount >= choices.length ||
              targetChoice === undefined ||
              targetCandidate === undefined);
          const keyAbility = keyAbilities.some(
            (ability) =>
              ability.toLocaleLowerCase() ===
              definition?.name.trim().toLocaleLowerCase(),
          );
          const scoreDelta =
            [...optimisticSlots.values()].filter(
              (selectedId) => selectedId === definitionId,
            ).length -
            [...evaluatedSlots.values()].filter(
              (selectedId) => selectedId === definitionId,
            ).length;
          const displayedScore =
            definition === undefined
              ? "—"
              : (abilityScoreWithPendingDelta(
                  evaluation,
                  definition.name,
                  scoreDelta,
                ) ?? "—");
          return (
            <button
              aria-pressed={selectedChoice !== undefined}
              className={
                selectedChoice === undefined ? undefined : "ability-selected"
              }
              disabled={disabled}
              key={definitionId}
              type="button"
              onClick={() => {
                if (selectedChoice !== undefined) {
                  const command = unresolveEvaluatedChoiceCommand(
                    build,
                    selectedChoice,
                    evaluation,
                    entities,
                    `web:placeholder:ability:${crypto.randomUUID()}`,
                  );
                  if (command === undefined) return;
                  setPendingSlots((current) => {
                    const next = new Map(current);
                    next.set(selectedChoice.id, undefined);
                    return next;
                  });
                  onDispatch(command);
                  return;
                }
                if (
                  targetChoice === undefined ||
                  targetCandidate === undefined ||
                  definition === undefined
                )
                  return;
                const provider = evaluation.occurrences.find(
                  (occurrence) =>
                    occurrence.id === targetChoice.providerOccurrenceId,
                );
                const buildProvider = findOccurrence(
                  build,
                  targetChoice.providerOccurrenceId,
                );
                const occurrence: BuildOccurrence = {
                  id: `web:${crypto.randomUUID()}`,
                  identity: {
                    definitionId: definition.id,
                    name: definition.name,
                    type: definition.type,
                  },
                  acquiredLevel:
                    buildProvider?.acquiredLevel ??
                    provider?.acquiredLevel ??
                    evaluation.level,
                  legality: pickLegality(targetCandidate),
                  children: [],
                  unresolved: false,
                };
                const command = commandForEvaluatedChoice(
                  build,
                  targetChoice,
                  evaluation.occurrences,
                  entities,
                  occurrence,
                  (index) => `web:placeholder:${index}:${crypto.randomUUID()}`,
                );
                if (command === undefined) return;
                setPendingSlots((current) => {
                  const next = new Map(current);
                  next.set(targetChoice.id, definitionId);
                  return next;
                });
                onDispatch(command);
              }}
            >
              <KeyAbilityName marked={keyAbility}>
                {definition?.name ?? definitionId}
              </KeyAbilityName>
              {definition === undefined ? null : (
                <span className="ability-option-score">{displayedScore}</span>
              )}
            </button>
          );
        })}
      </div>
      {chosenCount < choices.length ? null : (
        <p className="field-help">Clear one ability before choosing another.</p>
      )}
    </section>
  );
}

export function RepeatedChoiceGroup({
  choices,
  evaluation,
  build,
  entities,
  byId,
  rollbackRevision,
  onDispatch,
}: {
  readonly choices: readonly EvaluatedChoice[];
  readonly evaluation: EvaluatedCharacter;
  readonly build: CharacterRecord["build"];
  readonly entities: readonly ContentEntity[];
  readonly byId: ReadonlyMap<string, ContentEntity>;
  readonly rollbackRevision: number;
  readonly onDispatch: (command: CharacterCommand) => void;
}) {
  const root = choices[0]!;
  const candidateKind = choiceSelectionTableKind(root);
  const tableKind =
    candidateKind === "feat" ||
    candidateKind === "power" ||
    candidateKind === "feature"
      ? candidateKind
      : undefined;
  const chosen = choices.filter(
    (choice) => choice.selectedOccurrenceId !== undefined,
  ).length;
  const houseRule = choices.some((choice) =>
    selectedChoiceIsHouseRule(choice, evaluation),
  );
  return (
    <section
      aria-labelledby={`${choiceSectionId(root.id)}-heading`}
      className={`level-choice-section grouped-choice-section${chosen < choices.length && root.level <= build.effectiveLevel ? " choice-section-incomplete" : ""}`}
      id={choiceSectionId(root.id)}
      tabIndex={-1}
    >
      <header>
        <div>
          <h4
            className="selection-section-heading"
            id={`${choiceSectionId(root.id)}-heading`}
          >
            {candidateKind === "feature"
              ? contextualChoiceTitle(root, evaluation, byId)
              : repeatedChoiceGroupTitle(choices, byId)}
          </h4>
        </div>
        {houseRule ? (
          <span className="attention-badge">
            <Icon name="house" /> House rule
          </span>
        ) : (
          <span className="choice-count">
            {chosen} of {choices.length} chosen
          </span>
        )}
      </header>
      <div className="grouped-choice-list">
        {tableKind === undefined ? (
          choices.map((choice, index) => (
            <section
              className="grouped-choice-item"
              id={index === 0 ? undefined : choiceSectionId(choice.id)}
              key={choice.id}
            >
              <ChoiceEditor
                choice={choice}
                evaluation={evaluation}
                build={build}
                entities={entities}
                byId={byId}
                disabled={false}
                compact={isAbilityIncreaseChoiceType(choice.type)}
                selectionLabel={repeatedSlotLabel(choice, index)}
                rollbackRevision={rollbackRevision}
                onDispatch={onDispatch}
              />
            </section>
          ))
        ) : (
          <RepeatedCandidateTableEditor
            kind={tableKind}
            choices={choices}
            evaluation={evaluation}
            build={build}
            entities={entities}
            byId={byId}
            rollbackRevision={rollbackRevision}
            onDispatch={onDispatch}
          />
        )}
      </div>
    </section>
  );
}

function RepeatedCandidateTableEditor({
  kind,
  choices,
  evaluation,
  build,
  entities,
  byId,
  rollbackRevision,
  onDispatch,
}: {
  readonly kind: "feat" | "power" | "feature" | "background";
  readonly choices: readonly EvaluatedChoice[];
  readonly evaluation: EvaluatedCharacter;
  readonly build: CharacterRecord["build"];
  readonly entities: readonly ContentEntity[];
  readonly byId: ReadonlyMap<string, ContentEntity>;
  readonly rollbackRevision: number;
  readonly onDispatch: (command: CharacterCommand) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const inspectCandidate = useContext(InspectCandidateContext);
  const evaluatedSlots = new Map(
    choices.map((choice) => [
      choice.id,
      selectedDefinitionId(choice, evaluation),
    ]),
  );
  const [optimisticSlots, setOptimisticSlots] = useState(evaluatedSlots);
  const [expandedGroupKey, setExpandedGroupKey] = useState("");
  const choiceKey = choices.map((choice) => choice.id).join("\0");

  useEffect(() => setOptimisticSlots(new Map()), [rollbackRevision]);
  useEffect(
    () =>
      setOptimisticSlots(
        new Map(
          choices.map((choice) => [
            choice.id,
            selectedDefinitionId(choice, evaluation),
          ]),
        ),
      ),
    [choiceKey, evaluation],
  );

  const selectedIds = new Set(
    [...optimisticSlots.values()].filter(
      (definitionId): definitionId is string => definitionId !== undefined,
    ),
  );
  const occupiedChoiceIds = new Set(
    [...optimisticSlots].flatMap(([choiceId, definitionId]) =>
      definitionId === undefined ? [] : [choiceId],
    ),
  );
  const candidateIds = [
    ...new Set(
      choices.flatMap((choice) =>
        choice.candidates.map((candidate) => candidate.definitionId),
      ),
    ),
  ];
  const candidates = candidateIds.flatMap((definitionId) => {
    const decisions = choices.flatMap((choice) =>
      choice.candidates
        .filter((candidate) => candidate.definitionId === definitionId)
        .map((candidate) => ({ candidate, choice })),
    );
    if (
      !decisions.some(({ candidate, choice }) =>
        isCandidateVisible(
          candidate,
          showAll,
          selectedDefinitionId(choice, evaluation),
        ),
      )
    )
      return [];
    const candidate =
      decisions.find(({ candidate }) => candidate.eligible)?.candidate ??
      decisions.find(({ candidate }) => !candidate.reasons.includes("category"))
        ?.candidate;
    return candidate === undefined ? [] : [candidate];
  });
  const featGroups =
    kind === "feat"
      ? groupParameterizedCandidates(
          candidates,
          (definitionId) =>
            byId.get(definitionId.toLocaleLowerCase())?.name ?? definitionId,
        )
      : [];

  const toggle = (definitionId: string): void => {
    const selectedChoice = choices.find(
      (choice) => optimisticSlots.get(choice.id) === definitionId,
    );
    if (selectedChoice !== undefined) {
      const command = unresolveEvaluatedChoiceCommand(
        build,
        selectedChoice,
        evaluation,
        entities,
        `web:placeholder:table:${crypto.randomUUID()}`,
      );
      if (command === undefined) return;
      setOptimisticSlots((current) => {
        const next = new Map(current);
        next.set(selectedChoice.id, undefined);
        return next;
      });
      inspectCandidate?.(undefined);
      onDispatch(command);
      return;
    }
    const targetChoice = choiceForRepeatedCandidate(
      choices,
      occupiedChoiceIds,
      definitionId,
      showAll,
    );
    const candidate = targetChoice?.candidates.find(
      (item) => item.definitionId === definitionId,
    );
    const definition = byId.get(definitionId.toLocaleLowerCase());
    if (
      targetChoice === undefined ||
      candidate === undefined ||
      definition === undefined ||
      !isCandidateSelectable(candidate)
    )
      return;
    const provider = evaluation.occurrences.find(
      (occurrence) => occurrence.id === targetChoice.providerOccurrenceId,
    );
    const buildProvider = findOccurrence(
      build,
      targetChoice.providerOccurrenceId,
    );
    const command = commandForEvaluatedChoice(
      build,
      targetChoice,
      evaluation.occurrences,
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
          evaluation.level,
        legality: pickLegality(candidate),
        children: [],
        unresolved: false,
      },
      (index) => `web:placeholder:${index}:${crypto.randomUUID()}`,
    );
    if (command === undefined) return;
    setOptimisticSlots((current) => {
      const next = new Map(current);
      next.set(targetChoice.id, definitionId);
      return next;
    });
    inspectCandidate?.({ candidate, entity: definition, favoritable: true });
    onDispatch(command);
  };

  return (
    <CandidateSelectionTable
      evaluation={evaluation}
      kind={kind}
      candidates={candidates}
      featGroups={featGroups}
      selectedIds={selectedIds}
      expandedGroupKey={expandedGroupKey}
      byId={byId}
      disabled={false}
      selectionLimit={choices.length}
      selectedOnlyToggle={kind === "background"}
      showIllegal={showAll}
      onExpandGroup={setExpandedGroupKey}
      onInspect={(candidate) => {
        const entity = byId.get(candidate.definitionId.toLocaleLowerCase());
        if (entity !== undefined)
          inspectCandidate?.({ candidate, entity, favoritable: true });
      }}
      onToggle={toggle}
      onToggleShowIllegal={() => setShowAll((current) => !current)}
    />
  );
}

export function BackgroundChoiceGroup({
  choices,
  evaluation,
  build,
  entities,
  byId,
  rollbackRevision,
  onDispatch,
}: {
  readonly choices: readonly EvaluatedChoice[];
  readonly evaluation: EvaluatedCharacter;
  readonly build: CharacterRecord["build"];
  readonly entities: readonly ContentEntity[];
  readonly byId: ReadonlyMap<string, ContentEntity>;
  readonly rollbackRevision: number;
  readonly onDispatch: (command: CharacterCommand) => void;
}) {
  const chosenCount = choices.filter(
    (choice) => choice.selectedOccurrenceId !== undefined,
  ).length;

  return (
    <section
      className={`level-choice-section grouped-choice-section${choices.some(isUnresolvedChoice) && choices[0]!.level <= build.effectiveLevel ? " choice-section-incomplete" : ""}`}
      id={choiceSectionId(choices[0]!.id)}
      tabIndex={-1}
    >
      <header>
        <h4 className="selection-section-heading">Backgrounds</h4>
        <span className="choice-count">{chosenCount} chosen</span>
      </header>
      <div className="grouped-choice-list">
        <RepeatedCandidateTableEditor
          kind="background"
          choices={choices}
          evaluation={evaluation}
          build={build}
          entities={entities}
          byId={byId}
          rollbackRevision={rollbackRevision}
          onDispatch={onDispatch}
        />
      </div>
    </section>
  );
}

export function SkillTrainingEditor({
  choices,
  evaluation,
  build,
  entities,
  byId,
  rollbackRevision,
  onDispatch,
}: {
  readonly choices: readonly EvaluatedChoice[];
  readonly evaluation: EvaluatedCharacter;
  readonly build: CharacterRecord["build"];
  readonly entities: readonly ContentEntity[];
  readonly byId: ReadonlyMap<string, ContentEntity>;
  readonly rollbackRevision: number;
  readonly onDispatch: (command: CharacterCommand) => void;
}) {
  const evaluatedSlots = new Map(
    choices.map((choice) => [
      choice.id,
      selectedDefinitionId(choice, evaluation),
    ]),
  );
  const showAll = false;
  const inspectCandidate = useContext(InspectCandidateContext);
  const [optimisticSlots, setOptimisticSlots] = useState(evaluatedSlots);
  const choiceKey = choices.map((choice) => choice.id).join("\0");

  useEffect(() => setOptimisticSlots(new Map()), [rollbackRevision]);
  useEffect(
    () =>
      setOptimisticSlots(
        new Map(
          choices.map((choice) => [
            choice.id,
            selectedDefinitionId(choice, evaluation),
          ]),
        ),
      ),
    [choiceKey, evaluation],
  );

  const candidateIds = [
    ...new Set(
      choices.flatMap((choice) =>
        choice.candidates.map((candidate) => candidate.definitionId),
      ),
    ),
  ];
  const candidateRows = candidateIds.flatMap((definitionId) => {
    const decisions = choices.flatMap((choice) =>
      choice.candidates
        .filter((candidate) => candidate.definitionId === definitionId)
        .map((candidate) => ({ candidate, choice })),
    );
    if (
      !decisions.some(({ candidate, choice }) =>
        isCandidateVisible(
          candidate,
          showAll,
          selectedDefinitionId(choice, evaluation),
        ),
      )
    )
      return [];
    const candidate =
      decisions.find(({ candidate }) => candidate.eligible)?.candidate ??
      decisions.find(({ candidate }) => !candidate.reasons.includes("category"))
        ?.candidate;
    return candidate === undefined
      ? []
      : [
          {
            candidate,
            decisions,
            definition: byId.get(definitionId.toLocaleLowerCase()),
            definitionId,
          },
        ];
  });
  const [perusedId, setPerusedId] = useState(
    [...evaluatedSlots.values()].find(
      (definitionId): definitionId is string => definitionId !== undefined,
    ) ?? candidateRows[0]?.definitionId,
  );
  useEffect(() => {
    if (candidateRows.some((row) => row.definitionId === perusedId)) return;
    setPerusedId(
      [...optimisticSlots.values()].find(
        (definitionId): definitionId is string =>
          definitionId !== undefined &&
          candidateRows.some((row) => row.definitionId === definitionId),
      ) ?? candidateRows[0]?.definitionId,
    );
  }, [candidateRows, optimisticSlots, perusedId]);
  const chosenCount = [...optimisticSlots.values()].filter(
    (definitionId) => definitionId !== undefined,
  ).length;
  const occupiedChoiceIds = new Set(
    [...optimisticSlots].flatMap(([choiceId, definitionId]) =>
      definitionId === undefined ? [] : [choiceId],
    ),
  );
  const selectedDefinitionIds = new Set(
    [...optimisticSlots.values()].filter(
      (definitionId): definitionId is string => definitionId !== undefined,
    ),
  );
  const skillScopes = groupRepeatedCandidateScopes(choices);
  const scopeTitle = (scope: (typeof skillScopes)[number]): string => {
    const candidateNames = scope.candidateIds.map(
      (definitionId) =>
        byId.get(definitionId.toLocaleLowerCase())?.name ?? definitionId,
    );
    if (candidateNames.length <= 3) return candidateNames.join(" or ");
    const provider = evaluation.occurrences.find(
      (occurrence) => occurrence.id === scope.choices[0]?.providerOccurrenceId,
    );
    const providerName =
      provider === undefined
        ? "Class"
        : (byId.get(provider.definitionId.toLocaleLowerCase())?.name ??
          "Class");
    return `${providerName} skills`;
  };

  return (
    <section
      className={`level-choice-section skill-training-section${chosenCount < choices.length && choices[0]!.level <= build.effectiveLevel ? " choice-section-incomplete" : ""}`}
      id={choiceSectionId(choices[0]!.id)}
      tabIndex={-1}
    >
      <header>
        <h4 className="selection-section-heading">Skill Training</h4>
        <strong className="skill-choice-count" aria-live="polite">
          {chosenCount} out of {choices.length} skills chosen
        </strong>
      </header>
      <div className="skill-training-layout">
        <div className="skill-training-controls">
          {skillScopes.map((scope) => {
            const scopeChosen = scope.choices.filter(
              (choice) => optimisticSlots.get(choice.id) !== undefined,
            ).length;
            return (
              <section
                aria-label={scopeTitle(scope)}
                className="skill-scope"
                key={scope.key}
              >
                {/* A lone scope would only repeat the section's own count
                    ("3 out of 3 skills chosen"); several get their own
                    heading so each pick shows where it comes from. */}
                {skillScopes.length === 1 ? null : (
                  <header>
                    <h5 className="selection-subsection-heading">
                      {scopeTitle(scope)}
                    </h5>
                    <span>
                      {scopeChosen} of {scope.choices.length} chosen
                    </span>
                  </header>
                )}
                <div className="skill-toggle-list">
                  {candidateRows
                    .filter(({ definitionId }) =>
                      scope.candidateIds.includes(definitionId),
                    )
                    .map(({ decisions, definition, definitionId }) => {
                      const scopeDecisions = decisions.filter(({ choice }) =>
                        scope.choices.includes(choice),
                      );
                      const trainedChoice = scope.choices.find(
                        (choice) =>
                          optimisticSlots.get(choice.id) === definitionId,
                      );
                      const chosenElsewhere =
                        trainedChoice === undefined &&
                        selectedDefinitionIds.has(definitionId);
                      const targetChoice = chosenElsewhere
                        ? undefined
                        : choiceForRepeatedCandidate(
                            scope.choices,
                            occupiedChoiceIds,
                            definitionId,
                            showAll,
                            true,
                          );
                      const targetCandidate = targetChoice?.candidates.find(
                        (candidate) => candidate.definitionId === definitionId,
                      );
                      const reason = scopeDecisions
                        .map(({ candidate }) => candidate)
                        .find(
                          (candidate) =>
                            !candidate.reasons.includes("category"),
                        );
                      const inspectedCandidate =
                        scopeDecisions.find(
                          ({ candidate }) => candidate.eligible,
                        )?.candidate ?? scopeDecisions[0]?.candidate;
                      return (
                        <button
                          aria-pressed={trainedChoice !== undefined}
                          className={
                            trainedChoice === undefined
                              ? undefined
                              : "skill-trained"
                          }
                          disabled={
                            trainedChoice === undefined &&
                            targetChoice === undefined
                          }
                          key={definitionId}
                          type="button"
                          onFocus={() => {
                            setPerusedId(definitionId);
                            if (
                              definition !== undefined &&
                              inspectedCandidate !== undefined
                            )
                              inspectCandidate?.({
                                candidate: inspectedCandidate,
                                entity: definition,
                              });
                          }}
                          onClick={() => {
                            setPerusedId(definitionId);
                            if (
                              definition !== undefined &&
                              inspectedCandidate !== undefined
                            )
                              inspectCandidate?.({
                                candidate: inspectedCandidate,
                                entity: definition,
                              });
                            if (trainedChoice !== undefined) {
                              const command = unresolveEvaluatedChoiceCommand(
                                build,
                                trainedChoice,
                                evaluation,
                                entities,
                                `web:placeholder:skill:${crypto.randomUUID()}`,
                              );
                              if (command === undefined) return;
                              setOptimisticSlots((current) => {
                                const next = new Map(current);
                                next.set(trainedChoice.id, undefined);
                                return next;
                              });
                              onDispatch(command);
                              return;
                            }
                            if (
                              targetChoice === undefined ||
                              targetCandidate === undefined ||
                              definition === undefined
                            )
                              return;
                            const provider = evaluation.occurrences.find(
                              (occurrence) =>
                                occurrence.id ===
                                targetChoice.providerOccurrenceId,
                            );
                            const buildProvider = findOccurrence(
                              build,
                              targetChoice.providerOccurrenceId,
                            );
                            const occurrence: BuildOccurrence = {
                              id: `web:${crypto.randomUUID()}`,
                              identity: {
                                definitionId: definition.id,
                                name: definition.name,
                                type: definition.type,
                              },
                              acquiredLevel:
                                buildProvider?.acquiredLevel ??
                                provider?.acquiredLevel ??
                                evaluation.level,
                              legality: pickLegality(targetCandidate),
                              children: [],
                              unresolved: false,
                            };
                            const command = commandForEvaluatedChoice(
                              build,
                              targetChoice,
                              evaluation.occurrences,
                              entities,
                              occurrence,
                              (index) =>
                                `web:placeholder:${index}:${crypto.randomUUID()}`,
                            );
                            if (command === undefined) return;
                            setOptimisticSlots((current) => {
                              const next = new Map(current);
                              next.set(targetChoice.id, definitionId);
                              return next;
                            });
                            onDispatch(command);
                          }}
                        >
                          <span>{definition?.name ?? definitionId}</span>
                          <span className="skill-toggle-status">
                            {trainedChoice !== undefined
                              ? "Trained"
                              : chosenElsewhere
                                ? "Chosen in another group"
                                : targetChoice === undefined &&
                                    scopeChosen === scope.choices.length
                                  ? "Clear a skill in this group to choose"
                                  : reason?.eligible === false
                                    ? candidateReason(reason.reasons)
                                    : "Available"}
                          </span>
                        </button>
                      );
                    })}
                </div>
              </section>
            );
          })}
        </div>
        {inspectCandidate === undefined ? (
          <CandidateDetail
            byId={byId}
            candidate={
              candidateRows.find((row) => row.definitionId === perusedId)
                ?.candidate
            }
            entity={
              candidateRows.find((row) => row.definitionId === perusedId)
                ?.definition
            }
          />
        ) : null}
      </div>
    </section>
  );
}
