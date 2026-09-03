import {
  createContext,
  Fragment,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  CharacterRepository,
  ContentPackRepository,
} from "@4ecb/browser-storage";
import {
  CharacterTransaction,
  type BuildOccurrence,
  type CharacterCommand,
  type CharacterRecord,
} from "@4ecb/character-domain";
import { isUserFacingSpecific, type ContentEntity } from "@4ecb/content-domain";
import { projectBuildForLegacyExport } from "@4ecb/legacy-dnd4e";
import {
  ABILITY_SCORE_NAMES,
  assessAbilityPointBuy,
  canMaterializeEvaluatedChoiceProvider,
  commandForEvaluatedChoice,
  findBuildChildIndex,
  pointBuyCostToRaise,
  projectBuildForEvaluation,
  type CandidateDecision,
  type EvaluatedCharacter,
  type EvaluatedChoice,
  type EvaluationInput,
} from "@4ecb/rules-engine";

import {
  applyBuildPresetCommand,
  candidateReason,
  choiceSelectionTableKind,
  choiceTableSummary,
  choicePresentationLabel,
  choiceForRepeatedCandidate,
  choicesAtLevel,
  contentSpecificValue,
  evaluationAtHorizon,
  groupChoicesByLegacyWorkflow,
  groupBackgroundChoiceCandidates,
  groupLevelChoices,
  groupDependentChoiceFlows,
  groupParameterizedCandidates,
  groupRepeatedCandidateScopes,
  groupRepeatedChoiceSlots,
  identityChoiceLabel,
  isCandidateSelectable,
  isCandidateVisible,
  isCharacterDetailChoice,
  isBuildPresetChoice,
  isOptionalRetrainingChoice,
  isUnresolvedChoice,
  legacyChoiceSection,
  planningHorizonCommand,
  selectedDefinitionId,
  selectedChoiceHasWarning,
  unresolveEvaluatedChoiceCommand,
} from "./builder-ui";
import { Icon, type IconName } from "./Icon";
import { OptimisticBuildSaveQueue } from "./optimistic-save";
import { RulesWorkerClient } from "./rules-client";
import {
  entityTypeIcon,
  entityVisualTone,
  powerActionIcon,
  powerAttackIcon,
  type LegacyVisualTone,
  visualToneClass,
} from "./visual-language";

const characters = new CharacterRepository();
const packs = new ContentPackRepository();
const ShowAllChoicesContext = createContext(false);
type InspectedOption = {
  readonly candidate: CandidateDecision;
  readonly entity: ContentEntity;
};

function evaluationCacheKey(
  profileRevision: string,
  input: EvaluationInput,
): string {
  return `${profileRevision}\0${JSON.stringify(input)}`;
}
const InspectCandidateContext = createContext<
  ((option: InspectedOption | undefined) => void) | undefined
>(undefined);

type SaveState =
  | { readonly phase: "loading"; readonly message: string }
  | { readonly phase: "saved"; readonly message: string }
  | { readonly phase: "saving"; readonly message: string }
  | { readonly phase: "failed"; readonly message: string };

function CommitNumberInput({
  value,
  min,
  max,
  label,
  disabled,
  onCommit,
}: {
  readonly value: number;
  readonly min: number;
  readonly max?: number;
  readonly label?: string;
  readonly disabled?: boolean;
  readonly onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);

  function commit() {
    const next = Number(draft);
    if (
      !Number.isInteger(next) ||
      next < min ||
      (max !== undefined && next > max)
    ) {
      setDraft(String(value));
      return;
    }
    if (next !== value) onCommit(next);
  }

  return (
    <input
      {...(label === undefined ? {} : { "aria-label": label })}
      disabled={disabled}
      type="number"
      min={min}
      {...(max === undefined ? {} : { max })}
      value={draft}
      onChange={(event) => setDraft(event.currentTarget.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          setDraft(String(value));
          event.currentTarget.blur();
        }
      }}
    />
  );
}

function OccurrenceTree({
  occurrence,
  byId,
}: {
  readonly occurrence: BuildOccurrence;
  readonly byId: ReadonlyMap<string, ContentEntity>;
}) {
  const definition =
    occurrence.identity.definitionId === undefined
      ? undefined
      : byId.get(occurrence.identity.definitionId.toLocaleLowerCase());
  return (
    <li>
      <span className={occurrence.unresolved ? "profile-warning" : undefined}>
        {definition?.name || occurrence.identity.name || "Unresolved choice"}
      </span>{" "}
      <small>{definition?.type || occurrence.identity.type}</small>
      {occurrence.children.length === 0 ? null : (
        <ul>
          {occurrence.children.map((child) => (
            <OccurrenceTree key={child.id} occurrence={child} byId={byId} />
          ))}
        </ul>
      )}
    </li>
  );
}

function selectedOccurrence(
  choice: EvaluatedChoice,
  evaluation: EvaluatedCharacter,
) {
  return choice.selectedOccurrenceId === undefined
    ? undefined
    : evaluation.occurrences.find(
        (occurrence) => occurrence.id === choice.selectedOccurrenceId,
      );
}

function choiceTitle(choice: EvaluatedChoice): string {
  const spellbook = /^Power\s+(Daily|Utility)\s+(\d+)$/i.exec(
    choice.spellbook ?? "",
  );
  if (spellbook !== null)
    return `${spellbook[1]![0]!.toLocaleUpperCase()}${spellbook[1]!.slice(1).toLocaleLowerCase()} Spell`;
  return choicePresentationLabel(choice.name || choice.type);
}

function timelineChoiceTitle(choice: EvaluatedChoice): string {
  const identityLabel = identityChoiceLabel(choice.type);
  if (identityLabel !== undefined) return identityLabel;
  return ["Class", "Race", "Background"].includes(legacyChoiceSection(choice))
    ? choicePresentationLabel(choice.type)
    : choiceTitle(choice);
}

const powerGroupLabels: Readonly<Record<LegacyVisualTone, string>> = {
  "at-will": "At-Will Powers",
  encounter: "Encounter Powers",
  daily: "Daily Powers",
  utility: "Utility Powers",
  item: "Item Powers",
  neutral: "Powers",
};

function repeatedChoiceGroupTitle(
  choices: readonly EvaluatedChoice[],
  byId: ReadonlyMap<string, ContentEntity>,
): string {
  if (!choices.every((choice) => choice.type.trim().toLowerCase() === "power"))
    return choiceTitle(choices[0]!);
  const tones = new Set(
    choices.flatMap((choice) =>
      choice.candidates.flatMap((candidate) => {
        if (candidate.reasons.includes("category")) return [];
        const entity = byId.get(candidate.definitionId.toLocaleLowerCase());
        return entity === undefined ? [] : [entityVisualTone(entity)];
      }),
    ),
  );
  tones.delete("neutral");
  return tones.size === 1 ? powerGroupLabels[[...tones][0]!] : "Powers";
}

function choiceSectionIcon(section: string): IconName {
  switch (section) {
    case "Class":
      return "class";
    case "Race":
      return "race";
    case "Background":
      return "background";
    case "Ability Scores":
      return "ability";
    case "Skills":
      return "skill";
    case "Powers":
      return "power";
    case "Spellbook":
      return "book";
    case "Feats":
      return "feat";
    case "Character Details":
      return "details";
    default:
      return "content";
  }
}

function CandidateDetail({
  candidate,
  entity,
}: {
  readonly candidate: CandidateDecision | undefined;
  readonly entity: ContentEntity | undefined;
}) {
  if (candidate === undefined || entity === undefined)
    return (
      <aside className="candidate-detail candidate-detail-empty">
        <p className="eyebrow">Option details</p>
        <h4>Choose an option to inspect it</h4>
        <p>
          Move through the selection control with the keyboard or pointer to
          review normalized content before choosing.
        </p>
      </aside>
    );

  const headingId = `candidate-${entity.id.replaceAll(/[^a-zA-Z0-9_-]/g, "-")}`;
  const visibleSpecifics = entity.specifics.filter(isUserFacingSpecific);
  const tone = visualToneClass(entityVisualTone(entity));
  return (
    <aside
      aria-labelledby={headingId}
      className={`candidate-detail ${tone}`}
      tabIndex={0}
    >
      <header>
        <div>
          <p className="eyebrow entity-kind">
            <Icon name={entityTypeIcon(entity.type)} /> {entity.type}
          </p>
          <h4 id={headingId}>{entity.name}</h4>
        </div>
        {candidate.eligible ? null : (
          <span className="candidate-unavailable">Unavailable</span>
        )}
      </header>
      {candidate.eligible ? null : (
        <p className="candidate-reason">{candidateReason(candidate.reasons)}</p>
      )}
      <dl className="candidate-facts">
        <div>
          <dt>Source</dt>
          <dd>{entity.source || "Not specified"}</dd>
        </div>
      </dl>
      {entity.printPrerequisites === undefined ? null : (
        <section>
          <h5>Prerequisites</h5>
          <p className="preserve-lines">{entity.printPrerequisites}</p>
        </section>
      )}
      {entity.flavor === undefined ? null : (
        <p className="candidate-flavor">{entity.flavor}</p>
      )}
      {entity.description.length === 0 ? null : (
        <section>
          <h5>Description</h5>
          <p className="preserve-lines">{entity.description}</p>
        </section>
      )}
      {visibleSpecifics.length === 0 ? null : (
        <section>
          <h5>Details</h5>
          <dl className="candidate-fields">
            {visibleSpecifics.map((field) => (
              <div key={`${field.ordinal}-${field.name}`}>
                <dt>{field.name || "Detail"}</dt>
                <dd className="preserve-lines">{field.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </aside>
  );
}

function BaseAbilityScoreEditor({
  build,
  onDispatch,
}: {
  readonly build: CharacterRecord["build"];
  readonly onDispatch: (command: CharacterCommand) => void;
}) {
  const assessment = assessAbilityPointBuy(build.baseAbilities);
  const pointStatus =
    assessment.reason === "missing"
      ? "Ability scores incomplete"
      : assessment.reason !== undefined || assessment.spent === undefined
        ? "Custom scores · House rule"
        : `${assessment.spent} out of 22 points spent${assessment.spent > 22 ? " · House rule" : ""}`;
  const resetCommands: CharacterCommand = {
    kind: "batch",
    commands: ABILITY_SCORE_NAMES.map((ability, index) => ({
      kind: "set-base-ability" as const,
      ability,
      value: index === 0 ? 8 : 10,
    })),
  };
  return (
    <section
      className={`level-choice-section base-ability-choice${assessment.complete ? "" : " choice-section-incomplete"}`}
      aria-labelledby="base-abilities"
    >
      <header>
        <div>
          <h5 id="base-abilities">Point buy</h5>
          <p className="field-help">Scores shown before racial increases</p>
        </div>
        <span
          className={
            assessment.legal
              ? "complete-badge"
              : assessment.complete
                ? "attention-badge"
                : "choice-count"
          }
        >
          {pointStatus}
        </span>
      </header>
      <div className="ability-editor">
        {ABILITY_SCORE_NAMES.map((ability) => {
          const value = build.baseAbilities[ability] ?? 10;
          const raiseCost = pointBuyCostToRaise(value);
          return (
            <div className="ability-point-buy-row" key={ability}>
              <span className="ability-name">{ability}</span>
              <div className="ability-stepper">
                <button
                  aria-label={`Decrease ${ability}`}
                  disabled={value <= 8}
                  type="button"
                  onClick={() =>
                    onDispatch({
                      kind: "set-base-ability",
                      ability,
                      value: value - 1,
                    })
                  }
                >
                  −
                </button>
                <CommitNumberInput
                  label={ability}
                  value={value}
                  min={1}
                  max={30}
                  onCommit={(next) =>
                    onDispatch({
                      kind: "set-base-ability",
                      ability,
                      value: next,
                    })
                  }
                />
                <button
                  aria-label={`Increase ${ability}`}
                  disabled={value >= 18}
                  type="button"
                  onClick={() =>
                    onDispatch({
                      kind: "set-base-ability",
                      ability,
                      value: value + 1,
                    })
                  }
                >
                  +
                </button>
              </div>
              <small>
                {raiseCost === undefined
                  ? value > 18
                    ? "Outside point-buy range"
                    : "Maximum"
                  : `Next +1: ${raiseCost} ${raiseCost === 1 ? "point" : "points"}`}
              </small>
            </div>
          );
        })}
      </div>
      <footer className="ability-point-buy-footer">
        <p>
          Raising 8–12 costs 1 point; 13–15 costs 2; 16 costs 3; and 17 costs 4.
          Only one score may start below 10.
        </p>
        <button type="button" onClick={() => onDispatch(resetCommands)}>
          Reset point buy
        </button>
      </footer>
    </section>
  );
}

function retrainingCategory(type: string | undefined): string | undefined {
  const normalized = type?.trim().toLocaleLowerCase();
  if (normalized === "skill training" || normalized === "skill") return "skill";
  if (normalized === "feat" || normalized === "power") return normalized;
  return undefined;
}

function BuildPresetPanel({
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
  const [selectedPresetId, setSelectedPresetId] = useState(
    presets[0]?.entity.id ?? "",
  );
  const [applyStatus, setApplyStatus] = useState<string>();
  const selectedPreset = presets.find(
    ({ entity }) => entity.id === selectedPresetId,
  );

  useEffect(() => {
    const selected = presets.find(
      ({ entity }) => entity.id === selectedPresetId,
    );
    const next = selected ?? presets[0];
    setSelectedPresetId(next?.entity.id ?? "");
    inspectCandidate?.(next);
  }, [inspectCandidate, presets, selectedPresetId]);

  if (presets.length === 0) return null;
  return (
    <section className="build-presets" aria-labelledby="build-presets-heading">
      <label htmlFor="starting-preset" id="build-presets-heading">
        Starting preset
      </label>
      <div className="build-preset-control">
        <select
          id="starting-preset"
          value={selectedPresetId}
          onFocus={() => {
            if (selectedPreset !== undefined)
              inspectCandidate?.(selectedPreset);
          }}
          onChange={(event) => {
            const selected = presets.find(
              ({ entity }) => entity.id === event.currentTarget.value,
            );
            setSelectedPresetId(event.currentTarget.value);
            setApplyStatus(undefined);
            inspectCandidate?.(selected);
          }}
        >
          {presets.map(({ entity }) => (
            <option key={entity.id} value={entity.id}>
              {entity.name}
            </option>
          ))}
        </select>
        <button
          disabled={selectedPreset === undefined}
          type="button"
          onClick={() => {
            if (selectedPreset === undefined) return;
            const command = applyBuildPresetCommand(
              build,
              selectedPreset.entity,
              levelChoices,
              evaluation,
              entities,
              (definitionId, index) =>
                `web:preset:${definitionId}:${index}:${crypto.randomUUID()}`,
            );
            if (command === undefined) {
              setApplyStatus("No open choices match this preset.");
              return;
            }
            const applied =
              command.kind === "batch" ? command.commands.length : 1;
            setApplyStatus(
              `${applied} ${applied === 1 ? "choice" : "choices"} applied.`,
            );
            onDispatch(command);
          }}
        >
          Apply
        </button>
      </div>
      {applyStatus === undefined ? null : (
        <p aria-live="polite" className="build-preset-status">
          {applyStatus}
        </p>
      )}
    </section>
  );
}

function ReplacementEditor({
  choice,
  evaluation,
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
  const showAll = useContext(ShowAllChoicesContext);
  const inspectCandidate = useContext(InspectCandidateContext);
  const [optimisticSelectedId, setOptimisticSelectedId] = useState(
    selected?.definitionId ?? "",
  );
  const [perusedId, setPerusedId] = useState(selected?.definitionId ?? "");
  const [perusingTarget, setPerusingTarget] = useState(false);
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
      : {
          definitionId: targetOption.definitionId,
          eligible: true,
          sourceEntitled: true,
          rulesLegal: true,
          activeDefinition: true,
          activeOccurrenceIds: [targetOption.replacesOccurrenceId],
          providerOccurrenceIds: [],
          reasons: [],
        }
    : (target?.candidates ?? []).find(
        (candidate) =>
          candidate.definitionId === perusedId &&
          isCandidateVisible(candidate, showAll, selected?.definitionId),
      );
  const detailEntity =
    detailCandidate === undefined
      ? undefined
      : byId.get(detailCandidate.definitionId.toLocaleLowerCase());

  const inspect = (candidate: CandidateDecision | undefined): void => {
    if (candidate === undefined || inspectCandidate === undefined) return;
    const entity = byId.get(candidate.definitionId.toLocaleLowerCase());
    if (entity !== undefined) inspectCandidate({ candidate, entity });
  };

  useEffect(() => {
    setOptimisticSelectedId("");
    setPerusedId("");
    setPerusingTarget(false);
  }, [rollbackRevision]);

  useEffect(() => {
    setTargetId(selected?.replacesId ?? "");
    setOptimisticSelectedId(selected?.definitionId ?? "");
    setPerusedId(selected?.definitionId ?? "");
    setPerusingTarget(false);
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
        legality: candidate.eligible ? "rules-legal" : "houserule",
        children: [],
        unresolved: false,
      },
    });
  };

  return (
    <div className="choice-selection-layout">
      <div className="choice-editor-fields">
        <label>
          Replace
          <select
            disabled={disabled}
            value={targetId}
            onFocus={() => {
              setPerusingTarget(true);
              const option = options.find(
                (item) => item.replacesOccurrenceId === targetId,
              );
              setPerusedId(option?.definitionId ?? "");
              inspect(
                option === undefined
                  ? undefined
                  : {
                      definitionId: option.definitionId,
                      eligible: true,
                      sourceEntitled: true,
                      rulesLegal: true,
                      activeDefinition: true,
                      activeOccurrenceIds: [option.replacesOccurrenceId],
                      providerOccurrenceIds: [],
                      reasons: [],
                    },
              );
            }}
            onChange={(event) => {
              const nextTargetId = event.currentTarget.value;
              setTargetId(nextTargetId);
              setPerusingTarget(true);
              setPerusedId(
                options.find(
                  (option) => option.replacesOccurrenceId === nextTargetId,
                )?.definitionId ?? "",
              );
              const option = options.find(
                (item) => item.replacesOccurrenceId === nextTargetId,
              );
              inspect(
                option === undefined
                  ? undefined
                  : {
                      definitionId: option.definitionId,
                      eligible: true,
                      sourceEntitled: true,
                      rulesLegal: true,
                      activeDefinition: true,
                      activeOccurrenceIds: [option.replacesOccurrenceId],
                      providerOccurrenceIds: [],
                      reasons: [],
                    },
              );
              const nextVisible = (option?.candidates ?? []).filter(
                (candidate) =>
                  isCandidateVisible(
                    candidate,
                    showAll,
                    selected?.definitionId,
                  ),
              );
              if (
                option !== undefined &&
                option.candidates.length === 1 &&
                nextVisible.length === 1
              )
                selectReplacement(option, nextVisible[0]!);
            }}
          >
            <option value="">Choose an earlier selection</option>
            {options.map((option) => (
              <option
                key={option.replacesOccurrenceId}
                value={option.replacesOccurrenceId}
              >
                {byId.get(option.definitionId.toLocaleLowerCase())?.name ??
                  option.definitionId}
              </option>
            ))}
          </select>
        </label>
        {target === undefined ||
        (target.candidates.length === 1 && visible.length === 1) ? null : (
          <label>
            With
            <select
              disabled={disabled}
              value={selectedValue}
              onFocus={() => {
                setPerusingTarget(false);
                setPerusedId(selectedValue || visible[0]?.definitionId || "");
                inspect(
                  target.candidates.find(
                    (candidate) =>
                      candidate.definitionId ===
                      (selectedValue || visible[0]?.definitionId),
                  ),
                );
              }}
              onChange={(event) => {
                const candidate = target.candidates.find(
                  (item) => item.definitionId === event.currentTarget.value,
                );
                if (candidate !== undefined)
                  selectReplacement(target, candidate);
              }}
            >
              <option value="">Choose a replacement</option>
              {visible.map((candidate) => (
                <option
                  disabled={!isCandidateSelectable(candidate)}
                  key={candidate.definitionId}
                  value={candidate.definitionId}
                >
                  {byId.get(candidate.definitionId.toLocaleLowerCase())?.name ??
                    candidate.definitionId}
                  {candidate.eligible
                    ? ""
                    : ` — unavailable: ${candidateReason(candidate.reasons)}`}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {inspectCandidate === undefined ? (
        <CandidateDetail candidate={detailCandidate} entity={detailEntity} />
      ) : null}
    </div>
  );
}

function ChoiceEditor({
  choice,
  evaluation,
  build,
  entities,
  byId,
  disabled,
  compact = false,
  hideSelectionLabel = false,
  selectionLabel = "Selection",
  replacementTargetType,
  rollbackRevision,
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
  readonly replacementTargetType?: string;
  readonly rollbackRevision: number;
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
  const showAll = useContext(ShowAllChoicesContext);
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
    inspectCandidate?.({ candidate, entity: definition });
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
      legality: candidate.eligible ? "rules-legal" : "houserule",
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
    if (command !== undefined) onDispatch(command);
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
    onDispatch(command);
  };

  return (
    <div
      className={`choice-selection-layout${compact ? " choice-selection-compact" : ""}`}
    >
      <div className="choice-editor-fields">
        {selectionTableKind !== undefined ? (
          <CandidateSelectionTable
            kind={selectionTableKind}
            candidates={visibleCandidates}
            featGroups={selectionTableKind === "feat" ? presentationGroups : []}
            selectedIds={new Set(selectedValue === "" ? [] : [selectedValue])}
            expandedGroupKey={displayedGroupKey}
            byId={byId}
            disabled={editorDisabled}
            onExpandGroup={setStagedGroupKey}
            onInspect={(candidate) => {
              setPerusedId(candidate.definitionId);
              const entity = byId.get(
                candidate.definitionId.toLocaleLowerCase(),
              );
              if (entity !== undefined)
                inspectCandidate?.({ candidate, entity });
            }}
            onToggle={selectDefinition}
            onClear={clearSelection}
          />
        ) : groupedPresentation ? (
          <>
            <label>
              {hideSelectionLabel
                ? null
                : normalizedChoiceType === "background choice"
                  ? "Benefit type"
                  : "Feat"}
              <select
                aria-label={
                  normalizedChoiceType === "background choice"
                    ? "Benefit type"
                    : "Feat"
                }
                disabled={editorDisabled}
                value={displayedGroupKey}
                onChange={(event) => {
                  const group = presentationGroups.find(
                    (candidate) => candidate.key === event.currentTarget.value,
                  );
                  setStagedGroupKey(event.currentTarget.value);
                  if (group === undefined) {
                    if (event.currentTarget.value === "") clearSelection();
                    return;
                  }
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
              >
                <option value="">
                  {normalizedChoiceType === "background choice"
                    ? "Choose a benefit type"
                    : "Choose a feat"}
                </option>
                {presentationGroups.map((group) => (
                  <option key={group.key} value={group.key}>
                    {group.label}
                    {group.parameterLabel === undefined ? "" : "…"}
                  </option>
                ))}
              </select>
            </label>
            {displayedGroup?.parameterLabel === undefined ? null : (
              <label>
                {displayedGroup.parameterLabel}
                <select
                  disabled={editorDisabled}
                  value={
                    displayedGroup.options.some(
                      ({ candidate }) =>
                        candidate.definitionId === optimisticSelectedId,
                    )
                      ? optimisticSelectedId
                      : ""
                  }
                  onFocus={() => {
                    const definitionId =
                      displayedGroup.options.find(
                        ({ candidate }) =>
                          candidate.definitionId === optimisticSelectedId,
                      )?.candidate.definitionId ??
                      displayedGroup.options[0]?.candidate.definitionId ??
                      "";
                    setPerusedId(definitionId);
                    const candidate = displayedGroup.options.find(
                      (option) =>
                        option.candidate.definitionId === definitionId,
                    )?.candidate;
                    const entity = byId.get(definitionId.toLocaleLowerCase());
                    if (candidate !== undefined && entity !== undefined)
                      inspectCandidate?.({ candidate, entity });
                  }}
                  onChange={(event) => {
                    const definitionId = event.currentTarget.value;
                    if (definitionId === "") clearSelection();
                    else selectDefinition(definitionId);
                  }}
                >
                  <option value="">Choose {displayedGroup.label}</option>
                  {displayedGroup.options.map(({ candidate, label }) => (
                    <option
                      disabled={!isCandidateSelectable(candidate)}
                      key={candidate.definitionId}
                      value={candidate.definitionId}
                    >
                      {label}
                      {candidate.eligible
                        ? ""
                        : ` — unavailable: ${candidateReason(candidate.reasons)}`}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </>
        ) : (
          <label>
            {hideSelectionLabel ? null : <span>{selectionLabel}</span>}
            <select
              aria-label={selectionLabel}
              disabled={editorDisabled}
              value={selectedValue}
              onFocus={() => {
                const definitionId =
                  selectedValue || visibleCandidates[0]?.definitionId || "";
                setPerusedId(definitionId);
                const candidate = visibleCandidates.find(
                  (item) => item.definitionId === definitionId,
                );
                const entity = byId.get(definitionId.toLocaleLowerCase());
                if (candidate !== undefined && entity !== undefined)
                  inspectCandidate?.({ candidate, entity });
              }}
              onChange={(event) => {
                const definitionId = event.currentTarget.value;
                if (definitionId === "") clearSelection();
                else selectDefinition(definitionId);
              }}
            >
              <option value="">Unresolved</option>
              {visibleCandidates.map((candidate) => (
                <option
                  disabled={!isCandidateSelectable(candidate)}
                  key={candidate.definitionId}
                  value={candidate.definitionId}
                >
                  {byId.get(candidate.definitionId.toLocaleLowerCase())?.name ??
                    candidate.definitionId}
                  {candidate.eligible
                    ? ""
                    : ` — unavailable: ${candidateReason(candidate.reasons)}`}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {compact || inspectCandidate !== undefined ? null : (
        <CandidateDetail
          candidate={detailCandidate}
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

function choiceSectionId(choiceId: string): string {
  return `choice-section-${choiceId.replaceAll(/[^a-zA-Z0-9_-]/g, "-")}`;
}

type FeatPresentationGroup = ReturnType<
  typeof groupParameterizedCandidates
>[number];

function MetadataIcon({
  kind,
  value,
}: {
  readonly kind: "action" | "attack";
  readonly value: string | undefined;
}) {
  const label =
    value ||
    (kind === "action" ? "Action not specified" : "Attack type not specified");
  return (
    <span className="selection-metadata-icon" aria-label={label} title={label}>
      <Icon
        name={
          kind === "action" ? powerActionIcon(value) : powerAttackIcon(value)
        }
      />
    </span>
  );
}

function CandidateSelectionTable({
  kind,
  candidates,
  featGroups,
  selectedIds,
  expandedGroupKey,
  byId,
  disabled,
  selectionLimit,
  onExpandGroup,
  onInspect,
  onToggle,
  onClear,
}: {
  readonly kind: "feat" | "power";
  readonly candidates: readonly CandidateDecision[];
  readonly featGroups: readonly FeatPresentationGroup[];
  readonly selectedIds: ReadonlySet<string>;
  readonly expandedGroupKey: string;
  readonly byId: ReadonlyMap<string, ContentEntity>;
  readonly disabled: boolean;
  readonly selectionLimit?: number;
  readonly onExpandGroup: (key: string) => void;
  readonly onInspect: (candidate: CandidateDecision) => void;
  readonly onToggle: (definitionId: string) => void;
  readonly onClear: () => void;
}) {
  const rowLimit = 150;
  const [filter, setFilter] = useState("");
  const normalizedFilter = filter.trim().toLocaleLowerCase();
  const entityFor = (candidate: CandidateDecision) =>
    byId.get(candidate.definitionId.toLocaleLowerCase());
  const matchesFilter = (candidate: CandidateDecision, label?: string) => {
    if (normalizedFilter === "") return true;
    const entity = entityFor(candidate);
    return [
      label,
      entity?.name,
      entity?.printPrerequisites,
      entity === undefined ? undefined : choiceTableSummary(entity, kind),
      entity === undefined
        ? undefined
        : contentSpecificValue(entity, "Action Type"),
      entity === undefined
        ? undefined
        : contentSpecificValue(entity, "Attack Type"),
    ].some((value) => value?.toLocaleLowerCase().includes(normalizedFilter));
  };
  const visibleCandidates = candidates.filter((candidate) =>
    matchesFilter(candidate),
  );
  const visibleFeatGroups = featGroups.filter(
    (group) =>
      group.label.toLocaleLowerCase().includes(normalizedFilter) ||
      group.options.some(({ candidate, label }) =>
        matchesFilter(candidate, label),
      ),
  );
  const prioritizedCandidates = [
    ...visibleCandidates.filter((candidate) =>
      selectedIds.has(candidate.definitionId),
    ),
    ...visibleCandidates.filter(
      (candidate) => !selectedIds.has(candidate.definitionId),
    ),
  ];
  const displayedCandidates = prioritizedCandidates.slice(0, rowLimit);
  const prioritizedFeatGroups = [
    ...visibleFeatGroups.filter((group) =>
      group.options.some(({ candidate }) =>
        selectedIds.has(candidate.definitionId),
      ),
    ),
    ...visibleFeatGroups.filter(
      (group) =>
        !group.options.some(({ candidate }) =>
          selectedIds.has(candidate.definitionId),
        ),
    ),
  ];
  const displayedFeatGroups = prioritizedFeatGroups.slice(0, rowLimit);
  const totalRows =
    kind === "power" ? visibleCandidates.length : visibleFeatGroups.length;
  const shownRows = Math.min(totalRows, rowLimit);

  const candidateRow = (
    candidate: CandidateDecision,
    label: string,
    nested = false,
  ) => {
    const entity = entityFor(candidate);
    const selected = selectedIds.has(candidate.definitionId);
    const summary =
      entity === undefined ? undefined : choiceTableSummary(entity, kind);
    const unavailable = !candidate.eligible;
    const tone =
      entity === undefined
        ? "tone-neutral"
        : visualToneClass(entityVisualTone(entity));
    return (
      <tr
        className={`${tone}${selected ? " selection-row-selected" : ""}${unavailable ? " selection-row-unavailable" : ""}`}
        key={candidate.definitionId}
      >
        <td className={nested ? "selection-table-nested" : undefined}>
          <button
            aria-pressed={selected}
            disabled={
              disabled ||
              !isCandidateSelectable(candidate) ||
              (!selected &&
                selectionLimit !== undefined &&
                selectedIds.size >= selectionLimit)
            }
            type="button"
            onClick={() => onToggle(candidate.definitionId)}
            onFocus={() => onInspect(candidate)}
            onMouseEnter={() => onInspect(candidate)}
          >
            {selected ? <Icon name="check" /> : null}
            <span>{label}</span>
          </button>
          {unavailable ? (
            <small>{candidateReason(candidate.reasons)}</small>
          ) : null}
        </td>
        {kind === "feat" ? (
          <>
            <td>{entity?.printPrerequisites || "—"}</td>
            <td>
              <span className="selection-table-summary">{summary || "—"}</span>
            </td>
          </>
        ) : (
          <>
            <td>
              <MetadataIcon
                kind="action"
                value={
                  entity === undefined
                    ? undefined
                    : contentSpecificValue(entity, "Action Type")
                }
              />
            </td>
            <td>
              <MetadataIcon
                kind="attack"
                value={
                  entity === undefined
                    ? undefined
                    : contentSpecificValue(entity, "Attack Type")
                }
              />
            </td>
            <td>
              <span className="selection-table-summary">{summary || "—"}</span>
            </td>
          </>
        )}
      </tr>
    );
  };

  return (
    <div className={`candidate-selection-table candidate-selection-${kind}`}>
      <div className="selection-table-toolbar">
        <label>
          <span className="visually-hidden">
            Filter {kind === "feat" ? "feats" : "powers"}
          </span>
          <input
            placeholder={`Filter ${kind === "feat" ? "feats" : "powers"}`}
            type="search"
            value={filter}
            onChange={(event) => setFilter(event.currentTarget.value)}
          />
        </label>
        <button
          disabled={disabled || selectedIds.size === 0}
          type="button"
          onClick={onClear}
        >
          Clear
        </button>
        <span className="selection-table-count">
          {shownRows === totalRows
            ? `${totalRows} shown`
            : `${shownRows} of ${totalRows} shown`}
        </span>
      </div>
      <div className="selection-table-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">{kind === "feat" ? "Feat" : "Power"}</th>
              {kind === "feat" ? (
                <>
                  <th scope="col">Prerequisites</th>
                  <th scope="col">Description</th>
                </>
              ) : (
                <>
                  <th scope="col">
                    <span
                      className="selection-metadata-icon"
                      aria-label="Action type"
                      title="Action type"
                    >
                      <Icon name="clock" />
                    </span>
                  </th>
                  <th scope="col">
                    <span
                      className="selection-metadata-icon"
                      aria-label="Attack type"
                      title="Attack type"
                    >
                      <Icon name="attack-versatile" />
                    </span>
                  </th>
                  <th scope="col">Description</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {kind === "power"
              ? displayedCandidates.map((candidate) =>
                  candidateRow(
                    candidate,
                    entityFor(candidate)?.name ?? candidate.definitionId,
                  ),
                )
              : displayedFeatGroups.map((group) => {
                  if (group.parameterLabel === undefined) {
                    const candidate = group.options[0]!.candidate;
                    return candidateRow(candidate, group.label);
                  }
                  const selected = group.options.some(({ candidate }) =>
                    selectedIds.has(candidate.definitionId),
                  );
                  const expanded =
                    expandedGroupKey === group.key ||
                    selected ||
                    normalizedFilter !== "";
                  const representative =
                    group.options.find(({ candidate }) =>
                      selectedIds.has(candidate.definitionId),
                    )?.candidate ?? group.options[0]!.candidate;
                  const matchingOptions = group.options.filter(
                    ({ candidate, label }) => matchesFilter(candidate, label),
                  );
                  return (
                    <Fragment key={group.key}>
                      <tr className="selection-family-row">
                        <td>
                          <button
                            aria-expanded={expanded}
                            type="button"
                            onClick={() =>
                              onExpandGroup(expanded ? "" : group.key)
                            }
                            onFocus={() => onInspect(representative)}
                            onMouseEnter={() => onInspect(representative)}
                          >
                            {selected ? <Icon name="check" /> : null}
                            <span>{group.label}…</span>
                          </button>
                        </td>
                        <td colSpan={2}>Choose {group.parameterLabel}</td>
                      </tr>
                      {expanded
                        ? matchingOptions.map(({ candidate, label }) =>
                            candidateRow(candidate, label, true),
                          )
                        : null}
                    </Fragment>
                  );
                })}
            {totalRows > shownRows ? (
              <tr className="selection-table-more">
                <td colSpan={kind === "feat" ? 3 : 4}>
                  Filter the table to see the remaining {totalRows - shownRows}{" "}
                  options.
                </td>
              </tr>
            ) : null}
            {(kind === "power"
              ? visibleCandidates.length
              : visibleFeatGroups.length) === 0 ? (
              <tr>
                <td colSpan={kind === "feat" ? 3 : 4}>
                  No matching {kind === "feat" ? "feats" : "powers"}.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ChoiceFlowSection({
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
  const warning = choices.some((choice) =>
    selectedChoiceHasWarning(choice, evaluation),
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
          <h4 id={`${choiceSectionId(root.id)}-heading`}>
            {choices.length > 1 && selectedRootEntity !== undefined
              ? selectedRootEntity.name
              : choiceTitle(root)}
          </h4>
        </div>
        {warning ? (
          <span className="attention-badge">
            <Icon name="warning" /> House rule
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
              <h5 id={`${choiceSectionId(choice.id)}-step-heading`}>
                {index === 0
                  ? choicePresentationLabel(choice.type)
                  : choiceTitle(choice)}
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
  if (choice.type.startsWith("Ability Increase"))
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

function AbilityIncreaseEditor({
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
        <h4 id={`${choiceSectionId(choices[0]!.id)}-heading`}>
          Choose {choices.length} ability scores
        </h4>
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
                  setOptimisticSlots((current) => {
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
                  legality: targetCandidate.eligible
                    ? "rules-legal"
                    : "houserule",
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
                setOptimisticSlots((current) => {
                  const next = new Map(current);
                  next.set(targetChoice.id, definitionId);
                  return next;
                });
                onDispatch(command);
              }}
            >
              <span>{definition?.name ?? definitionId}</span>
              {selectedChoice === undefined ? null : <Icon name="check" />}
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

function RepeatedChoiceGroup({
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
  const tableKind = choiceSelectionTableKind(root);
  const chosen = choices.filter(
    (choice) => choice.selectedOccurrenceId !== undefined,
  ).length;
  const warning = choices.some((choice) =>
    selectedChoiceHasWarning(choice, evaluation),
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
          <h4 id={`${choiceSectionId(root.id)}-heading`}>
            {repeatedChoiceGroupTitle(choices, byId)}
          </h4>
        </div>
        {warning ? (
          <span className="attention-badge">
            <Icon name="warning" /> House rule
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
                compact={choice.type.startsWith("Ability Increase")}
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
  readonly kind: "feat" | "power";
  readonly choices: readonly EvaluatedChoice[];
  readonly evaluation: EvaluatedCharacter;
  readonly build: CharacterRecord["build"];
  readonly entities: readonly ContentEntity[];
  readonly byId: ReadonlyMap<string, ContentEntity>;
  readonly rollbackRevision: number;
  readonly onDispatch: (command: CharacterCommand) => void;
}) {
  const showAll = useContext(ShowAllChoicesContext);
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
        legality: candidate.eligible ? "rules-legal" : "houserule",
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
    inspectCandidate?.({ candidate, entity: definition });
    onDispatch(command);
  };

  const clear = (): void => {
    const commands = choices.flatMap((choice) => {
      if (optimisticSlots.get(choice.id) === undefined) return [];
      const command = unresolveEvaluatedChoiceCommand(
        build,
        choice,
        evaluation,
        entities,
        `web:placeholder:table:${crypto.randomUUID()}`,
      );
      return command === undefined ? [] : [command];
    });
    if (commands.length === 0) return;
    setOptimisticSlots(
      new Map(choices.map((choice) => [choice.id, undefined])),
    );
    inspectCandidate?.(undefined);
    onDispatch(
      commands.length === 1 ? commands[0]! : { kind: "batch", commands },
    );
  };

  return (
    <CandidateSelectionTable
      kind={kind}
      candidates={candidates}
      featGroups={featGroups}
      selectedIds={selectedIds}
      expandedGroupKey={expandedGroupKey}
      byId={byId}
      disabled={false}
      selectionLimit={choices.length}
      onExpandGroup={setExpandedGroupKey}
      onInspect={(candidate) => {
        const entity = byId.get(candidate.definitionId.toLocaleLowerCase());
        if (entity !== undefined) inspectCandidate?.({ candidate, entity });
      }}
      onToggle={toggle}
      onClear={clear}
    />
  );
}

function RetrainingControls({
  choices,
  evaluation,
  build,
  entities,
  byId,
  rollbackRevision,
  onRequestDetails,
  onDispatch,
}: {
  readonly choices: readonly EvaluatedChoice[];
  readonly evaluation: EvaluatedCharacter;
  readonly build: CharacterRecord["build"];
  readonly entities: readonly ContentEntity[];
  readonly byId: ReadonlyMap<string, ContentEntity>;
  readonly rollbackRevision: number;
  readonly onRequestDetails: (choiceId: string | undefined) => void;
  readonly onDispatch: (command: CharacterCommand) => void;
}) {
  const inspectCandidate = useContext(InspectCandidateContext);
  const selectedChoice = choices.find(
    (choice) => choice.selectedOccurrenceId !== undefined,
  );
  const selected =
    selectedChoice === undefined
      ? undefined
      : selectedOccurrence(selectedChoice, evaluation);
  const replaced = (selectedChoice?.replacementOptions ?? []).find(
    (option) => option.replacesOccurrenceId === selected?.replacesId,
  );
  const selectedCategory = retrainingCategory(
    replaced === undefined
      ? undefined
      : byId.get(replaced.definitionId.toLocaleLowerCase())?.type,
  );
  const [active, setActive] = useState<{
    readonly choiceId: string;
    readonly category: string;
  }>();
  useEffect(() => {
    const next =
      selectedChoice !== undefined && selectedCategory !== undefined
        ? { choiceId: selectedChoice.id, category: selectedCategory }
        : undefined;
    setActive(next);
    onRequestDetails(next?.choiceId);
  }, [onRequestDetails, rollbackRevision, selectedCategory, selectedChoice]);

  const categories = ["skill", "feat", "power"].filter((category) =>
    choices.some((choice) =>
      (choice.replacementOptions ?? []).some(
        (option) =>
          retrainingCategory(
            byId.get(option.definitionId.toLocaleLowerCase())?.type,
          ) === category,
      ),
    ),
  );
  const activeChoice =
    choices.find((choice) => choice.id === active?.choiceId) ?? selectedChoice;
  if (activeChoice === undefined || active === undefined)
    return (
      <div className="retraining-actions" aria-label="Optional retraining">
        {categories.map((category) => (
          <button
            className="progressive-choice-button"
            key={category}
            type="button"
            onClick={() => {
              const next = {
                choiceId: choices[0]!.id,
                category,
              };
              setActive(next);
              onRequestDetails(next.choiceId);
            }}
          >
            Retrain a {category}…
          </button>
        ))}
      </div>
    );

  return (
    <section
      aria-labelledby={`${choiceSectionId(activeChoice.id)}-heading`}
      className="level-choice-section retraining-section"
      id={choiceSectionId(activeChoice.id)}
      tabIndex={-1}
    >
      <header>
        <div>
          <p className="eyebrow">Optional retraining</p>
          <h4 id={`${choiceSectionId(activeChoice.id)}-heading`}>
            {active.category[0]!.toLocaleUpperCase() + active.category.slice(1)}{" "}
            retraining
          </h4>
        </div>
        {selectedChoice === undefined ? (
          <button
            type="button"
            onClick={() => {
              setActive(undefined);
              onRequestDetails(undefined);
            }}
          >
            Cancel
          </button>
        ) : (
          <div className="optional-choice-actions">
            <button
              aria-label="Remove retraining"
              className="remove-optional-choice icon-only-button"
              title="Remove retraining"
              type="button"
              onClick={() => {
                const command = unresolveEvaluatedChoiceCommand(
                  build,
                  selectedChoice,
                  evaluation,
                  entities,
                  `web:placeholder:retraining:${crypto.randomUUID()}`,
                );
                if (command === undefined) return;
                setActive(undefined);
                onRequestDetails(undefined);
                inspectCandidate?.(undefined);
                onDispatch(command);
              }}
            >
              <Icon name="remove" />
            </button>
          </div>
        )}
      </header>
      <ChoiceEditor
        choice={activeChoice}
        evaluation={evaluation}
        build={build}
        entities={entities}
        byId={byId}
        disabled={false}
        replacementTargetType={active.category}
        rollbackRevision={rollbackRevision}
        onDispatch={onDispatch}
      />
    </section>
  );
}

function BackgroundChoiceGroup({
  choices,
  evaluation,
  build,
  entities,
  byId,
  rollbackRevision,
  requestedChoiceId,
  onDispatch,
}: {
  readonly choices: readonly EvaluatedChoice[];
  readonly evaluation: EvaluatedCharacter;
  readonly build: CharacterRecord["build"];
  readonly entities: readonly ContentEntity[];
  readonly byId: ReadonlyMap<string, ContentEntity>;
  readonly rollbackRevision: number;
  readonly requestedChoiceId: string | undefined;
  readonly onDispatch: (command: CharacterCommand) => void;
}) {
  const inspectCandidate = useContext(InspectCandidateContext);
  const [pendingRemovalIds, setPendingRemovalIds] = useState<
    ReadonlySet<string>
  >(new Set());
  const chosenCount = choices.filter(
    (choice) =>
      choice.selectedOccurrenceId !== undefined &&
      !pendingRemovalIds.has(choice.id),
  ).length;
  const selectedCount = choices.reduce(
    (highest, choice, index) =>
      choice.selectedOccurrenceId === undefined ||
      pendingRemovalIds.has(choice.id)
        ? highest
        : index + 1,
    1,
  );
  const [revealedCount, setRevealedCount] = useState(selectedCount);

  useEffect(() => {
    const requestedIndex = choices.findIndex(
      (choice) =>
        choice.id === requestedChoiceId && !pendingRemovalIds.has(choice.id),
    );
    setRevealedCount((current) =>
      Math.max(current, selectedCount, requestedIndex + 1),
    );
  }, [choices, pendingRemovalIds, requestedChoiceId, selectedCount]);

  useEffect(() => {
    setPendingRemovalIds((current) => {
      const pending = [...current].filter((choiceId) =>
        choices.some(
          (choice) =>
            choice.id === choiceId && choice.selectedOccurrenceId !== undefined,
        ),
      );
      return pending.length === current.size ? current : new Set(pending);
    });
  }, [choices]);

  return (
    <section
      className={`level-choice-section grouped-choice-section${choices.some(isUnresolvedChoice) && choices[0]!.level <= build.effectiveLevel ? " choice-section-incomplete" : ""}`}
      id={choiceSectionId(choices[0]!.id)}
      tabIndex={-1}
    >
      <header>
        <h4>Backgrounds</h4>
        <span className="choice-count">{chosenCount} chosen</span>
      </header>
      <div className="grouped-choice-list">
        {choices.slice(0, revealedCount).map((choice, index) => (
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
              selectionLabel={
                index === 0
                  ? "Background"
                  : `Additional background ${index + 1}`
              }
              rollbackRevision={rollbackRevision}
              onDispatch={onDispatch}
            />
            {index === 0 || !choice.optional ? null : (
              <button
                aria-label="Remove background"
                className="remove-optional-choice icon-only-button"
                disabled={pendingRemovalIds.has(choice.id)}
                title="Remove background"
                type="button"
                onClick={() => {
                  if (choice.selectedOccurrenceId !== undefined) {
                    const command = unresolveEvaluatedChoiceCommand(
                      build,
                      choice,
                      evaluation,
                      entities,
                      `web:placeholder:background:${crypto.randomUUID()}`,
                    );
                    if (command === undefined) return;
                    setPendingRemovalIds(
                      (current) => new Set([...current, choice.id]),
                    );
                    inspectCandidate?.(undefined);
                    onDispatch(command);
                  }
                  setRevealedCount((current) =>
                    index === current - 1 ? Math.max(1, current - 1) : current,
                  );
                }}
              >
                <Icon name="remove" />
              </button>
            )}
          </section>
        ))}
      </div>
      {revealedCount >= choices.length ? null : (
        <button
          className="progressive-choice-button"
          type="button"
          onClick={() =>
            setRevealedCount((current) => Math.min(choices.length, current + 1))
          }
        >
          Add another background…
        </button>
      )}
    </section>
  );
}

function SkillTrainingEditor({
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
  const showAll = useContext(ShowAllChoicesContext);
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
        <h4>Skill Training</h4>
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
              <section className="skill-scope" key={scope.key}>
                <header>
                  <h5>{scopeTitle(scope)}</h5>
                  <span>
                    {scopeChosen} of {scope.choices.length} chosen
                  </span>
                </header>
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
                              legality: targetCandidate.eligible
                                ? "rules-legal"
                                : "houserule",
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

function CharacterTextField({
  name,
  label,
  value,
  multiline = false,
  onDispatch,
}: {
  readonly name: string;
  readonly label: string;
  readonly value: string;
  readonly multiline?: boolean;
  readonly onDispatch: (command: CharacterCommand) => void;
}) {
  const [draft, setDraft] = useState(value);
  const pendingCommit = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  useEffect(() => setDraft(value), [value]);
  useEffect(
    () => () => {
      if (pendingCommit.current !== undefined)
        clearTimeout(pendingCommit.current);
    },
    [],
  );

  const commit = (next: string) => {
    if (pendingCommit.current !== undefined) {
      clearTimeout(pendingCommit.current);
      pendingCommit.current = undefined;
    }
    const committed = name === "Name" ? next.trim() : next;
    if (name === "Name" && committed.length === 0) {
      setDraft(value);
      return;
    }
    if (committed !== draft) setDraft(committed);
    if (committed !== value)
      onDispatch({ kind: "set-text", name, value: committed });
  };
  const change = (next: string) => {
    setDraft(next);
    if (pendingCommit.current !== undefined)
      clearTimeout(pendingCommit.current);
    pendingCommit.current = setTimeout(() => commit(next), 500);
  };

  return (
    <label>
      {label}
      {multiline ? (
        <textarea
          rows={5}
          value={draft}
          onBlur={() => commit(draft)}
          onChange={(event) => change(event.currentTarget.value)}
        />
      ) : (
        <input
          {...(name === "Name" ? { maxLength: 120, required: true } : {})}
          value={draft}
          onBlur={() => commit(draft)}
          onChange={(event) => change(event.currentTarget.value)}
        />
      )}
    </label>
  );
}

function CharacterDetailsEditor({
  choices,
  evaluation,
  build,
  snapshotDetails,
  characterTitle,
  entities,
  byId,
  rollbackRevision,
  onDispatch,
}: {
  readonly choices: readonly EvaluatedChoice[];
  readonly evaluation: EvaluatedCharacter | undefined;
  readonly build: CharacterRecord["build"];
  readonly snapshotDetails: Readonly<Record<string, string>>;
  readonly characterTitle: string;
  readonly entities: readonly ContentEntity[];
  readonly byId: ReadonlyMap<string, ContentEntity>;
  readonly rollbackRevision: number;
  readonly onDispatch: (command: CharacterCommand) => void;
}) {
  const [inspectedOption, setInspectedOption] = useState<InspectedOption>();
  const textValue = (name: string, detailName?: string) =>
    Object.hasOwn(build.textStrings, name)
      ? (build.textStrings[name] ?? "")
      : detailName === undefined
        ? ""
        : (snapshotDetails[detailName] ?? "");
  const textFields = [
    {
      name: "Name",
      label: "Character name",
      value: textValue("Name", "name") || characterTitle,
    },
    {
      name: "Player",
      label: "Player name",
      value: textValue("Player", "Player"),
    },
    {
      name: "Company",
      label: "Adventuring company",
      value: textValue("Company", "Company"),
    },
    { name: "RPGA", label: "RPGA number", value: textValue("RPGA", "RPGA") },
  ] as const;
  const physicalFields = [
    { name: "Age", label: "Age", value: textValue("Age", "Age") },
    { name: "Height", label: "Height", value: textValue("Height", "Height") },
    { name: "Weight", label: "Weight", value: textValue("Weight", "Weight") },
  ] as const;
  const noteFields = [
    {
      name: "NOTE_Personality Traits",
      label: "Personality traits",
      value: textValue("NOTE_Personality Traits", "Traits"),
    },
    {
      name: "NOTE_Mannerisms and Appearance",
      label: "Mannerisms and appearance",
      value: textValue("NOTE_Mannerisms and Appearance", "Appearance"),
    },
    {
      name: "NOTE_Character Background",
      label: "Character background",
      value: textValue("NOTE_Character Background"),
    },
    {
      name: "NOTE_Companions And Allies",
      label: "Companions and allies",
      value: textValue("NOTE_Companions And Allies", "Companions"),
    },
    {
      name: "NOTE_Session and Campaign Notes",
      label: "Session and campaign notes",
      value: textValue("NOTE_Session and Campaign Notes", "Notes"),
    },
    {
      name: "NOTE_RPGA Notes",
      label: "RPGA notes",
      value: textValue("NOTE_RPGA Notes"),
    },
  ] as const;

  return (
    <section
      aria-labelledby="character-details-heading"
      className="choice-pane character-details-pane"
    >
      <header>
        <div>
          <p className="eyebrow">Character identity</p>
          <h3 id="character-details-heading">Character details</h3>
        </div>
      </header>
      <div className="character-details-workspace">
        <div className="character-details-form">
          <section className="character-detail-group">
            <h4>Identity</h4>
            <div className="character-detail-fields character-detail-fields-compact">
              {textFields.map((field) => (
                <CharacterTextField
                  key={field.name}
                  {...field}
                  onDispatch={onDispatch}
                />
              ))}
            </div>
          </section>
          <section className="character-detail-group">
            <h4>Personal details</h4>
            {evaluation === undefined ? (
              <p className="field-help">
                Rules content is unavailable for gender, alignment, and deity.
              </p>
            ) : (
              <InspectCandidateContext.Provider value={setInspectedOption}>
                <div className="compact-detail-list">
                  {choices.map((choice) => (
                    <div className="compact-detail-row" key={choice.id}>
                      <ChoiceEditor
                        choice={choice}
                        evaluation={evaluation}
                        build={build}
                        entities={entities}
                        byId={byId}
                        disabled={false}
                        selectionLabel={choice.type}
                        rollbackRevision={rollbackRevision}
                        onDispatch={onDispatch}
                      />
                    </div>
                  ))}
                </div>
              </InspectCandidateContext.Provider>
            )}
            <div className="character-detail-fields character-physical-fields">
              {physicalFields.map((field) => (
                <CharacterTextField
                  key={field.name}
                  {...field}
                  onDispatch={onDispatch}
                />
              ))}
            </div>
          </section>
          <section className="character-detail-group">
            <h4>Character information</h4>
            <div className="character-detail-fields character-note-fields">
              {noteFields.map((field) => (
                <CharacterTextField
                  key={field.name}
                  {...field}
                  multiline
                  onDispatch={onDispatch}
                />
              ))}
            </div>
          </section>
        </div>
        {evaluation === undefined ? null : (
          <div className="shared-choice-detail">
            <CandidateDetail
              candidate={inspectedOption?.candidate}
              entity={inspectedOption?.entity}
            />
          </div>
        )}
      </div>
    </section>
  );
}

export function CharacterEditorPage({
  characterId,
}: {
  readonly characterId: string;
}) {
  const [character, setCharacter] = useState<CharacterRecord>();
  const [entities, setEntities] = useState<readonly ContentEntity[]>([]);
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
  const [evaluationStatus, setEvaluationStatus] = useState("Loading rules…");
  const [readyPackId, setReadyPackId] = useState<string>();
  const [visibleHorizon, setVisibleHorizon] = useState(1);
  const [selectedLevel, setSelectedLevel] = useState(1);
  const [selectedChoiceId, setSelectedChoiceId] = useState<string>();
  const [workspaceTab, setWorkspaceTab] = useState<"build" | "details">(
    "build",
  );
  const [showAllChoices, setShowAllChoices] = useState(false);
  const [inspectedOption, setInspectedOption] = useState<InspectedOption>();
  const [rollbackRevision, setRollbackRevision] = useState(0);
  const [expandedReplacementChoiceId, setExpandedReplacementChoiceId] =
    useState<string>();
  const transaction = useRef<CharacterTransaction | undefined>(undefined);
  const saveQueue = useRef<
    OptimisticBuildSaveQueue<CharacterRecord> | undefined
  >(undefined);
  const rulesClient = useRef<RulesWorkerClient | undefined>(undefined);
  const evaluationRevision = useRef(0);
  const evaluationCache = useRef(new Map<string, EvaluatedCharacter>());

  useEffect(() => {
    let cancelled = false;
    void characters
      .get(characterId)
      .then(async (loaded) => {
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
        setVisibleHorizon(loaded.build.levels.length);
        setSelectedLevel(loaded.build.effectiveLevel);
        setSaveState({ phase: "saved", message: "Saved locally" });
        if (loaded.profileBinding !== undefined) {
          const pack = await packs.get(loaded.profileBinding.packId);
          if (!cancelled && pack !== undefined) setEntities(pack.entities);
        }
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

  const packId = character?.profileBinding?.packId;
  const contentDigest = character?.profileBinding?.contentDigest;
  useEffect(() => {
    rulesClient.current?.terminate();
    rulesClient.current = undefined;
    evaluationCache.current.clear();
    setReadyPackId(undefined);
    setCurrentEvaluation(undefined);
    setPlanningEvaluation(undefined);
    if (packId === undefined) return;
    const client = new RulesWorkerClient();
    rulesClient.current = client;
    let cancelled = false;
    void client
      .initialize(packId, contentDigest)
      .then(() => {
        if (!cancelled) setReadyPackId(packId);
      })
      .catch((reason: unknown) => {
        if (!cancelled)
          setLoadError(
            reason instanceof Error ? reason.message : String(reason),
          );
      });
    return () => {
      cancelled = true;
      client.terminate();
      if (rulesClient.current === client) rulesClient.current = undefined;
    };
  }, [contentDigest, packId]);

  const build = transaction.current?.current;
  const currentEvaluation = evaluationAtHorizon(
    currentEvaluationResult,
    build?.effectiveLevel,
  );
  const planningEvaluation = evaluationAtHorizon(
    planningEvaluationResult,
    build?.levels.length,
  );
  const byId = useMemo(
    () =>
      new Map(
        entities.map((entity) => [entity.id.toLocaleLowerCase(), entity]),
      ),
    [entities],
  );

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
    const evaluateCached = async (
      input: EvaluationInput,
    ): Promise<EvaluatedCharacter> => {
      const cache = evaluationCache.current;
      const profileRevision = `${packId}\0${contentDigest ?? ""}`;
      const cacheKey = evaluationCacheKey(profileRevision, input);
      const cached = cache.get(cacheKey);
      if (cached !== undefined) {
        cache.delete(cacheKey);
        cache.set(cacheKey, cached);
        return cached;
      }
      const evaluated = await client.evaluate(input);
      cache.set(cacheKey, evaluated);
      while (cache.size > 3) cache.delete(cache.keys().next().value!);
      return evaluated;
    };
    const planningRequest = evaluateCached({
      ...projectBuildForEvaluation(
        { ...build, effectiveLevel: build.levels.length },
        entities,
      ),
      candidateDetailLevels: [selectedLevel],
      candidateDetailReplacementChoiceIds:
        expandedReplacementChoiceId === undefined
          ? []
          : [expandedReplacementChoiceId],
    });
    const currentRequest =
      build.effectiveLevel === build.levels.length
        ? planningRequest
        : evaluateCached({
            ...projectBuildForEvaluation(
              projectBuildForLegacyExport(build),
              entities,
            ),
            candidateDetailLevels: [],
          });
    void Promise.all([currentRequest, planningRequest])
      .then(([current, planning]) => {
        if (evaluationRevision.current !== revision) return;
        setCurrentEvaluation(current);
        setPlanningEvaluation(planning);
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
    contentDigest,
    entities,
    expandedReplacementChoiceId,
    packId,
    readyPackId,
    selectedLevel,
  ]);

  useEffect(() => {
    if (build === undefined) return;
    if (visibleHorizon > build.levels.length)
      setVisibleHorizon(build.levels.length);
    if (visibleHorizon < build.effectiveLevel)
      setVisibleHorizon(build.effectiveLevel);
    if (selectedLevel > Math.min(visibleHorizon, build.levels.length))
      setSelectedLevel(Math.min(visibleHorizon, build.levels.length));
  }, [build, selectedLevel, visibleHorizon]);

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
  const legacyChoiceSections =
    groupChoicesByLegacyWorkflow(presentationChoices);
  const abilitySectionIndex = legacyChoiceSections.findIndex(({ section }) =>
    ["Ability Scores", "Skills", "Powers", "Spellbook", "Feats"].includes(
      section,
    ),
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
  useEffect(() => {
    if (primaryLevelChoices.some((choice) => choice.id === selectedChoiceId))
      return;
    setSelectedChoiceId(
      primaryLevelChoices.find(isUnresolvedChoice)?.id ??
        primaryLevelChoices[0]?.id,
    );
  }, [primaryLevelChoices, selectedChoiceId]);

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
  const role = selectedClass?.specifics.find(
    (specific) => specific.name.toLocaleLowerCase() === "role",
  )?.value;
  const abilityPointBuy = assessAbilityPointBuy(build.baseAbilities);
  const abilityScoresIncomplete = !abilityPointBuy.complete;
  const abilityScoresHouseRuled =
    abilityPointBuy.complete && !abilityPointBuy.legal;
  const unresolvedCount =
    selectedLevel > build.effectiveLevel
      ? 0
      : mechanicalLevelChoices.filter(
          (choice) =>
            !isBuildPresetChoice(choice) && isUnresolvedChoice(choice),
        ).length + (selectedLevel === 1 && abilityScoresIncomplete ? 1 : 0);
  const totalUnresolved =
    (planningEvaluation?.choices ?? []).filter(
      (choice) =>
        isUnresolvedChoice(choice) &&
        !isBuildPresetChoice(choice) &&
        choice.level <= build.effectiveLevel,
    ).length + (build.effectiveLevel >= 1 && abilityScoresIncomplete ? 1 : 0);
  const diagnosticWarningCount =
    planningEvaluation?.diagnostics.filter(
      (diagnostic) => diagnostic.severity !== "info",
    ).length ?? 0;
  const plannedHouseRuleCount =
    planningEvaluation?.occurrences.filter(
      (occurrence) =>
        occurrence.legality === "houserule" &&
        occurrence.acquiredLevel <= visibleHorizon,
    ).length ?? 0;
  const plannedChoiceWarningCount =
    planningEvaluation?.choices.filter(
      (choice) =>
        choice.level <= visibleHorizon &&
        selectedChoiceHasWarning(choice, planningEvaluation),
    ).length ?? 0;
  const warningCount = Math.max(
    diagnosticWarningCount,
    plannedHouseRuleCount,
    plannedChoiceWarningCount,
    abilityScoresHouseRuled ? 1 : 0,
  );
  const selectedLevelHasWarning =
    planningEvaluation !== undefined &&
    (mechanicalLevelChoices.some((choice) =>
      selectedChoiceHasWarning(choice, planningEvaluation),
    ) ||
      (selectedLevel === 1 && abilityScoresHouseRuled));

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
          requestedChoiceId={selectedChoiceId}
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
          item.type.startsWith("Ability Increase"),
        ) ? (
        <AbilityIncreaseEditor
          key={choice.id}
          choices={repeated}
          evaluation={planningEvaluation}
          build={build}
          entities={entities}
          byId={byId}
          rollbackRevision={rollbackRevision}
          onDispatch={dispatch}
        />
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
    const warning = selectedChoiceHasWarning(choice, planningEvaluation);
    return (
      <section
        {...(omitIndividualHeading
          ? { "aria-label": choiceTitle(choice) }
          : { "aria-labelledby": `${choiceSectionId(choice.id)}-heading` })}
        className={`level-choice-section${selectedLevel <= build.effectiveLevel && isUnresolvedChoice(choice) ? " choice-section-incomplete" : ""}`}
        id={choiceSectionId(choice.id)}
        key={choice.id}
        tabIndex={-1}
      >
        {omitIndividualHeading ? null : (
          <header>
            <div>
              <h4 id={`${choiceSectionId(choice.id)}-heading`}>
                {choiceTitle(choice)}
              </h4>
            </div>
            {warning ? (
              <span className="attention-badge">
                <Icon name="warning" /> House rule
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
          rollbackRevision={rollbackRevision}
          onDispatch={dispatch}
        />
      </section>
    );
  };

  return (
    <main
      aria-busy={saving}
      className="editor-page modern-builder"
      id="main-content"
    >
      <header className="builder-heading">
        <div>
          <p className="eyebrow">Build workspace</p>
          <h2>{character.title}</h2>
          <p className="evaluation-status">{evaluationStatus}</p>
        </div>
        <div className="builder-actions">
          <span
            aria-live="polite"
            className={`save-status save-${saveState.phase}`}
            role={saveState.phase === "failed" ? "alert" : "status"}
          >
            <Icon
              name={
                saveState.phase === "failed"
                  ? "warning"
                  : saveState.phase === "saving"
                    ? "clock"
                    : "check"
              }
            />
            {saveState.message}
          </span>
          <a
            className="button-link secondary-link"
            href={`#/characters/${encodeURIComponent(characterId)}`}
          >
            <Icon name="sheet" /> Sheet
          </a>
          <button
            type="button"
            disabled={!transaction.current?.canUndo}
            onClick={undo}
          >
            <Icon name="undo" /> Undo
          </button>
          <button
            type="button"
            disabled={!transaction.current?.canRedo}
            onClick={redo}
          >
            <Icon name="redo" /> Redo
          </button>
        </div>
      </header>

      {entities.length === 0 ? (
        <div className="profile-warning panel-warning">
          <Icon name="warning" /> Install or restore this character&apos;s bound
          content profile to evaluate choices. Its authoritative history remains
          editable.
        </div>
      ) : null}

      <section
        aria-labelledby="overview-heading"
        className="character-overview"
      >
        <div className="overview-title">
          <h3 id="overview-heading">Character overview</h3>
          <label className="current-level-control">
            Current level
            <select
              value={build.effectiveLevel}
              onChange={(event) => {
                const level = Number(event.currentTarget.value);
                setVisibleHorizon((current) => Math.max(current, level));
                setSelectedLevel(level);
                dispatch({ kind: "set-effective-level", level });
              }}
            >
              {build.levels.map((frame) => (
                <option key={frame.level} value={frame.level}>
                  {frame.level}
                </option>
              ))}
            </select>
          </label>
        </div>
        <dl>
          <div>
            <dt>Race</dt>
            <dd>{race || "Not chosen"}</dd>
          </div>
          <div>
            <dt>Class</dt>
            <dd>
              {selectedClass?.name ||
                character.snapshot.details.Class ||
                "Not chosen"}
            </dd>
          </div>
          <div>
            <dt>Role</dt>
            <dd>{role || character.snapshot.details.Role || "—"}</dd>
          </div>
          <div>
            <dt>Experience</dt>
            <dd>
              {character.snapshot.details.Experience ||
                character.snapshot.details.XP ||
                "—"}
            </dd>
          </div>
          <div>
            <dt>Plan</dt>
            <dd>Through level {build.levels.length}</dd>
          </div>
          <div
            className={totalUnresolved > 0 ? "overview-attention" : undefined}
          >
            <dt>Unresolved</dt>
            <dd>{totalUnresolved}</dd>
          </div>
          <div className={warningCount > 0 ? "overview-attention" : undefined}>
            <dt>Warnings</dt>
            <dd>{warningCount}</dd>
          </div>
        </dl>
      </section>

      <div
        aria-label="Character editor sections"
        className="builder-tabs"
        role="tablist"
      >
        <button
          aria-selected={workspaceTab === "build"}
          role="tab"
          type="button"
          onClick={() => setWorkspaceTab("build")}
        >
          <Icon name="level" /> Build
        </button>
        <button
          aria-selected={workspaceTab === "details"}
          role="tab"
          type="button"
          onClick={() => setWorkspaceTab("details")}
        >
          <Icon name="details" /> Character details
          {characterDetailChoices.some(isUnresolvedChoice) ? (
            <span className="tab-attention">Needs attention</span>
          ) : null}
        </button>
      </div>

      <div className="builder-workspace" hidden={workspaceTab !== "build"}>
        <aside aria-labelledby="timeline-heading" className="build-timeline">
          <div className="timeline-heading">
            <div>
              <p className="eyebrow">Level plan</p>
              <h3 id="timeline-heading">
                Choices through level {visibleHorizon}
              </h3>
            </div>
            <label>
              Show plan through
              <select
                disabled={entities.length === 0}
                value={visibleHorizon}
                onChange={(event) => {
                  const target = Number(event.currentTarget.value);
                  setVisibleHorizon(target);
                  if (selectedLevel > target) setSelectedLevel(target);
                  try {
                    const command = planningHorizonCommand(
                      build,
                      target,
                      entities,
                      (level) => `web:level:${level}:${crypto.randomUUID()}`,
                    );
                    if (command !== undefined) dispatch(command);
                  } catch (reason: unknown) {
                    setSaveState({
                      phase: "failed",
                      message:
                        reason instanceof Error
                          ? reason.message
                          : String(reason),
                    });
                  }
                }}
              >
                {Array.from(
                  { length: 31 - build.effectiveLevel },
                  (_, index) => index + build.effectiveLevel,
                ).map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="field-help timeline-help">
            Lowering this view hides future levels for this session; it never
            deletes saved choices. Current calculations stay at level{" "}
            {build.effectiveLevel}.
          </p>
          <ol className="timeline-levels">
            {build.levels.slice(0, visibleHorizon).map((frame) => {
              const choices = choicesAtLevel(frame.level, planningEvaluation);
              const timelineChoices = choices.filter(
                (choice) =>
                  !isOptionalRetrainingChoice(choice) &&
                  !isCharacterDetailChoice(choice) &&
                  !isBuildPresetChoice(choice),
              );
              const orderedTimelineChoices = groupChoicesByLegacyWorkflow(
                timelineChoices,
              ).flatMap(({ choices: sectionChoices }) => sectionChoices);
              const grouped = groupLevelChoices(timelineChoices);
              const repeatedGroups = groupRepeatedChoiceSlots(grouped.ordinary);
              const repeatedByChoiceId = new Map(
                repeatedGroups.flatMap((group) =>
                  group.map((choice) => [choice.id, group] as const),
                ),
              );
              const flows = groupDependentChoiceFlows(
                grouped.ordinary.filter(
                  (choice) => !repeatedByChoiceId.has(choice.id),
                ),
              );
              const flowByChoiceId = new Map(
                flows.flatMap((flow) =>
                  flow.map((choice) => [choice.id, flow] as const),
                ),
              );
              const summaries = orderedTimelineChoices.flatMap((choice) => {
                const identityLabel = identityChoiceLabel(choice.type);
                if (grouped.backgrounds.includes(choice))
                  return choice === grouped.backgrounds[0]
                    ? [
                        {
                          label: "Backgrounds",
                          choices: grouped.backgrounds,
                        },
                      ]
                    : [];
                if (grouped.skillTraining.includes(choice))
                  return choice === grouped.skillTraining[0]
                    ? [
                        {
                          label: "Skill Training",
                          choices: grouped.skillTraining,
                        },
                      ]
                    : [];
                const repeated = repeatedByChoiceId.get(choice.id);
                if (repeated !== undefined)
                  return choice === repeated[0]
                    ? [
                        {
                          label: repeatedChoiceGroupTitle(repeated, byId),
                          choices: repeated,
                        },
                      ]
                    : [];
                const flow = flowByChoiceId.get(choice.id);
                if (flow !== undefined)
                  return choice === flow[0]
                    ? [
                        {
                          label: identityLabel ?? timelineChoiceTitle(choice),
                          choices: flow,
                        },
                      ]
                    : [];
                return [
                  {
                    label: timelineChoiceTitle(choice),
                    choices: [choice],
                  },
                ];
              });
              const unresolved =
                frame.level > build.effectiveLevel
                  ? 0
                  : timelineChoices.filter(isUnresolvedChoice).length +
                    (frame.level === 1 && abilityScoresIncomplete ? 1 : 0);
              const choiceWarnings =
                timelineChoices.filter((choice) =>
                  selectedChoiceHasWarning(choice, planningEvaluation!),
                ).length +
                (frame.level === 1 && abilityScoresHouseRuled ? 1 : 0);
              return (
                <li
                  className={[
                    frame.level === selectedLevel ? "timeline-selected" : "",
                    unresolved > 0 ? "timeline-incomplete" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  key={frame.level}
                >
                  <button
                    className="timeline-level-button"
                    type="button"
                    onClick={() => {
                      setSelectedLevel(frame.level);
                      setSelectedChoiceId(
                        orderedTimelineChoices.find(isUnresolvedChoice)?.id ??
                          orderedTimelineChoices[0]?.id,
                      );
                    }}
                  >
                    <span>Level {frame.level}</span>
                    {frame.level > build.effectiveLevel ? (
                      <small>Planned</small>
                    ) : unresolved > 0 ? (
                      <span className="visually-hidden">
                        {unresolved} unresolved
                      </span>
                    ) : choiceWarnings > 0 ? (
                      <Icon name="warning" />
                    ) : (
                      <Icon name="check" />
                    )}
                  </button>
                  {planningEvaluation === undefined && frame.level !== 1 ? (
                    <p className="timeline-empty">Evaluating choices…</p>
                  ) : timelineChoices.length === 0 && frame.level !== 1 ? (
                    <p className="timeline-empty">No decisions at this level</p>
                  ) : (
                    <ul className="timeline-choices">
                      {frame.level === 1 ? (
                        <li>
                          <button
                            className={
                              abilityScoresIncomplete
                                ? "choice-unresolved"
                                : abilityScoresHouseRuled
                                  ? "choice-warning"
                                  : "choice-complete"
                            }
                            type="button"
                            onClick={() => {
                              setSelectedLevel(1);
                              requestAnimationFrame(() => {
                                document
                                  .getElementById("base-abilities")
                                  ?.scrollIntoView({ block: "start" });
                              });
                            }}
                          >
                            <Icon name="ability" />
                            <span>
                              Ability Scores ·{" "}
                              {abilityPointBuy.legal
                                ? "Point buy complete"
                                : abilityScoresHouseRuled
                                  ? "House rule"
                                  : `${abilityPointBuy.remaining ?? 22} ${abilityPointBuy.remaining === 1 ? "point" : "points"} left`}
                            </span>
                          </button>
                        </li>
                      ) : null}
                      {summaries.map((summary) => {
                        const summaryUnresolved =
                          frame.level > build.effectiveLevel
                            ? 0
                            : summary.choices.filter(isUnresolvedChoice).length;
                        const summaryWarning = summary.choices.some((choice) =>
                          selectedChoiceHasWarning(choice, planningEvaluation!),
                        );
                        const selectedNames = summary.choices.flatMap(
                          (choice) => {
                            const selected = selectedOccurrence(
                              choice,
                              planningEvaluation!,
                            );
                            if (selected === undefined) return [];
                            return [
                              byId.get(
                                selected.definitionId.toLocaleLowerCase(),
                              )?.name ?? selected.definitionId,
                            ];
                          },
                        );
                        const targetChoice =
                          summary.choices.find(isUnresolvedChoice) ??
                          summary.choices[0]!;
                        return (
                          <li key={summary.choices[0]!.id}>
                            <button
                              aria-current={
                                summary.choices.some(
                                  (choice) => choice.id === selectedChoiceId,
                                )
                                  ? "true"
                                  : undefined
                              }
                              className={
                                frame.level > build.effectiveLevel
                                  ? "choice-planned"
                                  : summaryUnresolved > 0
                                    ? "choice-unresolved"
                                    : summaryWarning
                                      ? "choice-warning"
                                      : "choice-complete"
                              }
                              type="button"
                              onClick={() => {
                                setSelectedLevel(frame.level);
                                setSelectedChoiceId(targetChoice.id);
                                requestAnimationFrame(() => {
                                  const section = document.getElementById(
                                    choiceSectionId(summary.choices[0]!.id),
                                  );
                                  section?.scrollIntoView({ block: "start" });
                                  section?.focus({ preventScroll: true });
                                });
                              }}
                            >
                              <span>
                                <Icon
                                  name={choiceSectionIcon(
                                    legacyChoiceSection(summary.choices[0]!),
                                  )}
                                />
                                {summary.label}
                                {selectedNames.length === 0
                                  ? ""
                                  : ` · ${selectedNames.join(", ")}`}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ol>
        </aside>

        <section
          aria-labelledby="choice-pane-heading"
          className={`choice-pane${selectedLevel <= build.effectiveLevel && unresolvedCount > 0 ? " choice-pane-incomplete" : ""}`}
        >
          <header>
            <h3 id="choice-pane-heading">Level {selectedLevel}</h3>
            <div className="choice-pane-actions">
              <label className="show-all-control">
                <input
                  checked={showAllChoices}
                  type="checkbox"
                  onChange={(event) =>
                    setShowAllChoices(event.currentTarget.checked)
                  }
                />
                Show unavailable options
              </label>
              {planningEvaluation === undefined ? (
                <span className="attention-badge">Evaluating…</span>
              ) : selectedLevelHasWarning ? (
                <span className="attention-badge">
                  <Icon name="warning" /> Review warnings
                </span>
              ) : null}
            </div>
          </header>
          <ShowAllChoicesContext.Provider value={showAllChoices}>
            {planningEvaluation === undefined ? (
              <p>
                {entities.length === 0
                  ? "Content is unavailable for planning."
                  : `Evaluating choices through level ${build.levels.length}…`}
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
              <div className="level-choice-workspace">
                <InspectCandidateContext.Provider value={setInspectedOption}>
                  <div className="level-choice-page">
                    {displayedChoiceSections.map(({ section, choices }) => (
                      <section
                        className={`legacy-choice-group${selectedLevel <= build.effectiveLevel && (choices.some(isUnresolvedChoice) || (section === "Ability Scores" && selectedLevel === 1 && abilityScoresIncomplete)) ? " choice-group-incomplete" : ""}`}
                        key={section}
                      >
                        <header>
                          <div className="legacy-choice-title">
                            <Icon name={choiceSectionIcon(section)} />
                            <h4>{section}</h4>
                          </div>
                          <span className="choice-count">
                            {section === "Ability Scores" && selectedLevel === 1
                              ? "6 scores"
                              : `${choices.length} ${choices.length === 1 ? "choice" : "choices"}`}
                          </span>
                        </header>
                        <div className="legacy-choice-list">
                          {section === "Class" && selectedLevel === 1 ? (
                            <BuildPresetPanel
                              choices={buildPresetChoices}
                              levelChoices={mechanicalLevelChoices}
                              evaluation={planningEvaluation}
                              build={build}
                              entities={entities}
                              byId={byId}
                              onDispatch={dispatch}
                            />
                          ) : null}
                          {section === "Ability Scores" &&
                          selectedLevel === 1 ? (
                            <BaseAbilityScoreEditor
                              build={build}
                              onDispatch={dispatch}
                            />
                          ) : null}
                          {choices.map((choice) =>
                            renderPrimaryChoice(choice, choices.length === 1),
                          )}
                        </div>
                      </section>
                    ))}
                    {retrainingChoices.length === 0 ? null : (
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
                    )}
                  </div>
                </InspectCandidateContext.Provider>
                <div className="shared-choice-detail">
                  <CandidateDetail
                    candidate={inspectedOption?.candidate}
                    entity={inspectedOption?.entity}
                  />
                </div>
              </div>
            )}
          </ShowAllChoicesContext.Provider>
        </section>
      </div>

      <div hidden={workspaceTab !== "details"}>
        <CharacterDetailsEditor
          choices={characterDetailChoices}
          evaluation={planningEvaluation}
          build={build}
          snapshotDetails={character.snapshot.details}
          characterTitle={character.title}
          entities={entities}
          byId={byId}
          rollbackRevision={rollbackRevision}
          onDispatch={dispatch}
        />
      </div>

      <section
        aria-label="Additional character editing"
        className="builder-secondary"
      >
        <details className="panel">
          <summary>Diagnostics and legality</summary>
          {currentEvaluation === undefined ||
          currentEvaluation.diagnostics.length === 0 ? (
            <p>No evaluator diagnostics.</p>
          ) : (
            <ul className="diagnostic-list">
              {currentEvaluation.diagnostics.map((diagnostic, index) => (
                <li key={`${diagnostic.code}-${index}`}>
                  <strong>{diagnostic.code}</strong>: {diagnostic.message}
                </li>
              ))}
            </ul>
          )}
        </details>
        <details className="panel">
          <summary>Complete level history</summary>
          {build.levels.map((frame) => (
            <details key={frame.level} open={frame.level === selectedLevel}>
              <summary>
                Level {frame.level}
                {frame.level > build.effectiveLevel ? " (planned)" : ""}
              </summary>
              <ul className="occurrence-tree">
                <OccurrenceTree occurrence={frame.root} byId={byId} />
              </ul>
            </details>
          ))}
        </details>
        <details className="panel inventory-editor">
          <summary>Inventory and equipment</summary>
          {build.inventory.filter((entry) => entry.quantity > 0).length ===
          0 ? (
            <p>No carried inventory.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Owned</th>
                  <th>Equipped</th>
                </tr>
              </thead>
              <tbody>
                {build.inventory
                  .filter((entry) => entry.quantity > 0)
                  .map((entry) => (
                    <tr key={entry.id}>
                      <th scope="row">
                        {entry.name ||
                          entry.elements
                            .map((element) =>
                              element.definitionId === undefined
                                ? element.name
                                : (byId.get(
                                    element.definitionId.toLocaleLowerCase(),
                                  )?.name ?? element.name),
                            )
                            .filter(Boolean)
                            .join(" + ")}
                      </th>
                      <td>
                        <CommitNumberInput
                          label={`Owned quantity for ${entry.name ?? entry.id}`}
                          value={entry.quantity}
                          min={0}
                          onCommit={(quantity) =>
                            dispatch({
                              kind: "put-inventory",
                              entry: {
                                ...entry,
                                quantity,
                                equippedQuantity: Math.min(
                                  entry.equippedQuantity,
                                  quantity,
                                ),
                              },
                            })
                          }
                        />
                      </td>
                      <td>
                        <CommitNumberInput
                          label={`Equipped quantity for ${entry.name ?? entry.id}`}
                          max={entry.quantity}
                          value={entry.equippedQuantity}
                          min={0}
                          onCommit={(equippedQuantity) =>
                            dispatch({
                              kind: "put-inventory",
                              entry: { ...entry, equippedQuantity },
                            })
                          }
                        />
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </details>
      </section>
    </main>
  );
}

function findOccurrence(
  build: CharacterRecord["build"],
  id: string,
): BuildOccurrence | undefined {
  const visit = (occurrence: BuildOccurrence): BuildOccurrence | undefined =>
    occurrence.id === id
      ? occurrence
      : occurrence.children.map(visit).find((value) => value !== undefined);
  return [...build.levels.map((frame) => frame.root), ...build.grabbag]
    .map(visit)
    .find((value) => value !== undefined);
}
