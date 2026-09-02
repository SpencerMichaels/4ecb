import { useEffect, useMemo, useRef, useState } from "react";

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
import {
  commandForEvaluatedChoice,
  findBuildChildIndex,
  projectBuildForEvaluation,
  type CandidateDecision,
  type EvaluatedCharacter,
  type EvaluatedChoice,
} from "@4ecb/rules-engine";

import {
  candidateReason,
  choiceForSkillCandidate,
  choicesAtLevel,
  groupLevelChoices,
  groupParameterizedCandidates,
  isCandidateVisible,
  isUnresolvedChoice,
  planningHorizonCommand,
  selectedDefinitionId,
  unresolveEvaluatedChoiceCommand,
} from "./builder-ui";
import { Icon } from "./Icon";
import { OptimisticBuildSaveQueue } from "./optimistic-save";
import { RulesWorkerClient } from "./rules-client";

const characters = new CharacterRepository();
const packs = new ContentPackRepository();

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
  return choice.name || `Choose ${choice.type}`;
}

function choiceHasWarning(
  choice: EvaluatedChoice,
  evaluation: EvaluatedCharacter,
): boolean {
  const selected = selectedOccurrence(choice, evaluation);
  if (selected === undefined) return false;
  if (selected.legality === "houserule") return true;
  const decisions = [
    ...choice.candidates,
    ...(choice.replacementOptions ?? []).flatMap((option) => option.candidates),
  ];
  return decisions.some(
    (candidate) =>
      candidate.definitionId === selected.definitionId && !candidate.eligible,
  );
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
  return (
    <aside
      aria-labelledby={headingId}
      className="candidate-detail"
      tabIndex={0}
    >
      <header>
        <div>
          <p className="eyebrow">{entity.type}</p>
          <h4 id={headingId}>{entity.name}</h4>
        </div>
        <span
          className={
            candidate.eligible ? "candidate-legal" : "candidate-unavailable"
          }
        >
          {candidate.eligible ? "Rules-legal" : "Unavailable"}
        </span>
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

function ReplacementEditor({
  choice,
  evaluation,
  buildProvider,
  providerEntity,
  byId,
  disabled,
  rollbackRevision,
  onDispatch,
}: {
  readonly choice: EvaluatedChoice;
  readonly evaluation: EvaluatedCharacter;
  readonly buildProvider: BuildOccurrence;
  readonly providerEntity: ContentEntity | undefined;
  readonly byId: ReadonlyMap<string, ContentEntity>;
  readonly disabled: boolean;
  readonly rollbackRevision: number;
  readonly onDispatch: (command: CharacterCommand) => void;
}) {
  const options = choice.replacementOptions ?? [];
  const selected = selectedOccurrence(choice, evaluation);
  const [targetId, setTargetId] = useState(
    selected?.replacesId ?? options[0]?.replacesOccurrenceId ?? "",
  );
  const [showAll, setShowAll] = useState(false);
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
          reasons: [],
        }
    : (target?.candidates ?? []).find(
        (candidate) =>
          candidate.definitionId === perusedId &&
          isCandidateVisible(candidate, showAll, selected?.definitionId),
      );

  useEffect(() => {
    setOptimisticSelectedId("");
    setPerusedId("");
    setPerusingTarget(false);
  }, [rollbackRevision]);

  useEffect(() => {
    setTargetId(selected?.replacesId ?? options[0]?.replacesOccurrenceId ?? "");
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
        <label>
          With
          <select
            disabled={disabled || target === undefined}
            value={selectedValue}
            onFocus={() => {
              setPerusingTarget(false);
              setPerusedId(selectedValue || visible[0]?.definitionId || "");
            }}
            onChange={(event) => {
              const definitionId = event.currentTarget.value;
              setPerusingTarget(false);
              setOptimisticSelectedId(definitionId);
              setPerusedId(definitionId);
              const candidate = target?.candidates.find(
                (item) => item.definitionId === definitionId,
              );
              const definition = byId.get(definitionId.toLocaleLowerCase());
              if (
                candidate === undefined ||
                definition === undefined ||
                target === undefined
              )
                return;
              onDispatch({
                kind: "retrain",
                parentId: buildProvider.id,
                index: findBuildChildIndex(
                  buildProvider,
                  providerEntity,
                  choice.ruleOrdinal,
                  choice.index,
                ),
                replacesId: target.replacesOccurrenceId,
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
            }}
          >
            <option value="">Choose a replacement</option>
            {visible.map((candidate) => (
              <option
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
        <label className="show-all-control">
          <input
            checked={showAll}
            disabled={disabled}
            type="checkbox"
            onChange={(event) => setShowAll(event.currentTarget.checked)}
          />
          Show all options for this choice
        </label>
        <p className="field-help">
          Unavailable same-category options include their objective rules reason
          and are saved as a house-rule choice when selected.
        </p>
      </div>
      <CandidateDetail
        candidate={detailCandidate}
        entity={
          detailCandidate === undefined
            ? undefined
            : byId.get(detailCandidate.definitionId.toLocaleLowerCase())
        }
      />
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
  rollbackRevision,
  onDispatch,
}: {
  readonly choice: EvaluatedChoice;
  readonly evaluation: EvaluatedCharacter;
  readonly build: CharacterRecord["build"];
  readonly entities: readonly ContentEntity[];
  readonly byId: ReadonlyMap<string, ContentEntity>;
  readonly disabled: boolean;
  readonly rollbackRevision: number;
  readonly onDispatch: (command: CharacterCommand) => void;
}) {
  const provider = evaluation.occurrences.find(
    (occurrence) => occurrence.id === choice.providerOccurrenceId,
  );
  const buildProvider = findOccurrence(build, choice.providerOccurrenceId);
  const materializableGrant =
    buildProvider === undefined &&
    provider?.kind === "grant" &&
    provider.parentId !== undefined &&
    findOccurrence(build, provider.parentId) !== undefined;
  const selected = selectedOccurrence(choice, evaluation);
  const [showAll, setShowAll] = useState(false);
  const [optimisticSelectedId, setOptimisticSelectedId] = useState(
    selected?.definitionId ?? "",
  );
  const [perusedId, setPerusedId] = useState(selected?.definitionId ?? "");
  const [stagedGroupKey, setStagedGroupKey] = useState<string>();

  const visibleCandidates = choice.candidates.filter((candidate) =>
    isCandidateVisible(candidate, showAll, selected?.definitionId),
  );
  const presentationGroups =
    choice.type.toLocaleLowerCase() === "feat"
      ? groupParameterizedCandidates(visibleCandidates, (definitionId) => {
          const definition = byId.get(definitionId.toLocaleLowerCase());
          return definition?.name ?? definitionId;
        })
      : [];
  const hasParameterizedGroups = presentationGroups.some(
    (group) => group.parameterLabel !== undefined,
  );
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
    disabled ||
    (!materializableGrant && buildProvider === undefined) ||
    choice.type === "Replacement";

  useEffect(() => {
    setOptimisticSelectedId("");
    setPerusedId("");
    setStagedGroupKey(undefined);
  }, [rollbackRevision]);

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
        rollbackRevision={rollbackRevision}
        onDispatch={onDispatch}
      />
    );

  const selectDefinition = (definitionId: string): void => {
    setOptimisticSelectedId(definitionId);
    setPerusedId(definitionId);
    const candidate = choice.candidates.find(
      (item) => item.definitionId === definitionId,
    );
    const definition = byId.get(definitionId.toLocaleLowerCase());
    if (candidate === undefined || definition === undefined) return;
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

  return (
    <div className="choice-selection-layout">
      <div className="choice-editor-fields">
        {hasParameterizedGroups ? (
          <>
            <label>
              Feat
              <select
                disabled={editorDisabled}
                value={displayedGroupKey}
                onChange={(event) => {
                  const group = presentationGroups.find(
                    (candidate) => candidate.key === event.currentTarget.value,
                  );
                  setStagedGroupKey(event.currentTarget.value);
                  if (group === undefined) return;
                  const exact = group.options.length === 1;
                  const definitionId = group.options[0]!.candidate.definitionId;
                  setPerusedId(definitionId);
                  if (exact) selectDefinition(definitionId);
                }}
              >
                <option value="">Choose a feat</option>
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
                  onFocus={() =>
                    setPerusedId(
                      displayedGroup.options.find(
                        ({ candidate }) =>
                          candidate.definitionId === optimisticSelectedId,
                      )?.candidate.definitionId ??
                        displayedGroup.options[0]?.candidate.definitionId ??
                        "",
                    )
                  }
                  onChange={(event) =>
                    selectDefinition(event.currentTarget.value)
                  }
                >
                  <option value="">Choose {displayedGroup.label}</option>
                  {displayedGroup.options.map(({ candidate, label }) => (
                    <option
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
            Selection
            <select
              disabled={editorDisabled}
              value={selectedValue}
              onFocus={() =>
                setPerusedId(
                  selectedValue || visibleCandidates[0]?.definitionId || "",
                )
              }
              onChange={(event) => selectDefinition(event.currentTarget.value)}
            >
              <option value="">Unresolved</option>
              {visibleCandidates.map((candidate) => (
                <option
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
        <label className="show-all-control">
          <input
            checked={showAll}
            disabled={disabled}
            type="checkbox"
            onChange={(event) => {
              setShowAll(event.currentTarget.checked);
              setStagedGroupKey(undefined);
            }}
          />
          Show all options for this choice
        </label>
        <p className="field-help">
          Valid choices are shown by default. This filter resets when you open a
          different choice; unavailable same-category selections are explicit
          house rules.
        </p>
      </div>
      <CandidateDetail
        candidate={detailCandidate}
        entity={
          detailCandidate === undefined
            ? undefined
            : byId.get(detailCandidate.definitionId.toLocaleLowerCase())
        }
      />
    </div>
  );
}

function choiceSectionId(choiceId: string): string {
  return `choice-section-${choiceId.replaceAll(/[^a-zA-Z0-9_-]/g, "-")}`;
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
  const selectedCount = choices.reduce(
    (highest, choice, index) =>
      choice.selectedOccurrenceId === undefined ? highest : index + 1,
    1,
  );
  const [revealedCount, setRevealedCount] = useState(selectedCount);

  useEffect(() => {
    const requestedIndex = choices.findIndex(
      (choice) => choice.id === requestedChoiceId,
    );
    setRevealedCount((current) =>
      Math.max(current, selectedCount, requestedIndex + 1),
    );
  }, [choices, requestedChoiceId, selectedCount]);

  return (
    <section
      className="level-choice-section grouped-choice-section"
      id={choiceSectionId(choices[0]!.id)}
      tabIndex={-1}
    >
      <header>
        <div>
          <p className="eyebrow">Background</p>
          <h4>Choose background</h4>
        </div>
        <span className="choice-count">
          {
            choices.filter(
              (choice) => choice.selectedOccurrenceId !== undefined,
            ).length
          }{" "}
          chosen
        </span>
      </header>
      <div className="grouped-choice-list">
        {choices.slice(0, revealedCount).map((choice, index) => (
          <section
            aria-labelledby={`${choiceSectionId(choice.id)}-heading`}
            className="grouped-choice-item"
            id={index === 0 ? undefined : choiceSectionId(choice.id)}
            key={choice.id}
          >
            {index === 0 ? null : (
              <h5 id={`${choiceSectionId(choice.id)}-heading`}>
                Additional background {index + 1}
              </h5>
            )}
            <ChoiceEditor
              choice={choice}
              evaluation={evaluation}
              build={build}
              entities={entities}
              byId={byId}
              disabled={false}
              rollbackRevision={rollbackRevision}
              onDispatch={onDispatch}
            />
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
  const [showAll, setShowAll] = useState(false);
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

  return (
    <section
      className="level-choice-section skill-training-section"
      id={choiceSectionId(choices[0]!.id)}
      tabIndex={-1}
    >
      <header>
        <div>
          <p className="eyebrow">Skills</p>
          <h4>Skill Training</h4>
        </div>
        <strong className="skill-choice-count" aria-live="polite">
          {chosenCount} out of {choices.length} skills chosen
        </strong>
      </header>
      <div className="skill-training-layout">
        <div className="skill-training-controls">
          <div className="skill-toggle-list">
            {candidateRows.map(({ decisions, definition, definitionId }) => {
              const trainedChoice = choices.find(
                (choice) => optimisticSlots.get(choice.id) === definitionId,
              );
              const targetChoice = choiceForSkillCandidate(
                choices,
                occupiedChoiceIds,
                definitionId,
                showAll,
              );
              const targetCandidate = targetChoice?.candidates.find(
                (candidate) => candidate.definitionId === definitionId,
              );
              const reason = decisions
                .map(({ candidate }) => candidate)
                .find((candidate) => !candidate.reasons.includes("category"));
              const disabled =
                trainedChoice === undefined && targetChoice === undefined;
              return (
                <button
                  aria-pressed={trainedChoice !== undefined}
                  className={
                    trainedChoice === undefined ? undefined : "skill-trained"
                  }
                  disabled={disabled}
                  key={definitionId}
                  type="button"
                  onFocus={() => setPerusedId(definitionId)}
                  onClick={() => {
                    setPerusedId(definitionId);
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
                  {trainedChoice !== undefined ? (
                    <strong>Trained</strong>
                  ) : reason?.eligible === false ? (
                    <small>{candidateReason(reason.reasons)}</small>
                  ) : (
                    <small>Available</small>
                  )}
                </button>
              );
            })}
          </div>
          <label className="show-all-control">
            <input
              checked={showAll}
              type="checkbox"
              onChange={(event) => setShowAll(event.currentTarget.checked)}
            />
            Show unavailable same-category skills
          </label>
          {chosenCount < choices.length ? null : (
            <p className="field-help">
              Untrain a skill before choosing another.
            </p>
          )}
        </div>
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
  const [currentEvaluation, setCurrentEvaluation] =
    useState<EvaluatedCharacter>();
  const [planningEvaluation, setPlanningEvaluation] =
    useState<EvaluatedCharacter>();
  const [evaluationStatus, setEvaluationStatus] = useState("Loading rules…");
  const [readyPackId, setReadyPackId] = useState<string>();
  const [visibleHorizon, setVisibleHorizon] = useState(1);
  const [selectedLevel, setSelectedLevel] = useState(1);
  const [selectedChoiceId, setSelectedChoiceId] = useState<string>();
  const [rollbackRevision, setRollbackRevision] = useState(0);
  const transaction = useRef<CharacterTransaction | undefined>(undefined);
  const saveQueue = useRef<
    OptimisticBuildSaveQueue<CharacterRecord> | undefined
  >(undefined);
  const rulesClient = useRef<RulesWorkerClient | undefined>(undefined);
  const evaluationRevision = useRef(0);

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
  useEffect(() => {
    rulesClient.current?.terminate();
    rulesClient.current = undefined;
    setReadyPackId(undefined);
    setCurrentEvaluation(undefined);
    setPlanningEvaluation(undefined);
    if (packId === undefined) return;
    const client = new RulesWorkerClient();
    rulesClient.current = client;
    let cancelled = false;
    void client
      .initialize(packId, character?.profileBinding?.contentDigest)
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
  }, [character?.profileBinding?.contentDigest, packId]);

  const build = transaction.current?.current;
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
    const currentRequest = client.evaluate(
      projectBuildForEvaluation(build, entities),
    );
    const planningRequest =
      build.effectiveLevel === build.levels.length
        ? currentRequest
        : client.evaluate(
            projectBuildForEvaluation(
              { ...build, effectiveLevel: build.levels.length },
              entities,
            ),
          );
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
  }, [build, entities, packId, readyPackId]);

  useEffect(() => {
    if (build === undefined) return;
    if (visibleHorizon > build.levels.length)
      setVisibleHorizon(build.levels.length);
    if (visibleHorizon < build.effectiveLevel)
      setVisibleHorizon(build.effectiveLevel);
    if (selectedLevel > Math.min(visibleHorizon, build.levels.length))
      setSelectedLevel(Math.min(visibleHorizon, build.levels.length));
  }, [build, selectedLevel, visibleHorizon]);

  const levelChoices = choicesAtLevel(selectedLevel, planningEvaluation);
  const groupedLevelChoices = groupLevelChoices(levelChoices);
  useEffect(() => {
    if (levelChoices.some((choice) => choice.id === selectedChoiceId)) return;
    setSelectedChoiceId(
      levelChoices.find(isUnresolvedChoice)?.id ?? levelChoices[0]?.id,
    );
  }, [levelChoices, selectedChoiceId]);

  function dispatch(command: CharacterCommand): void {
    const active = transaction.current;
    const queue = saveQueue.current;
    if (active === undefined || queue === undefined) return;
    try {
      const next = active.dispatch(command);
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
    setRevision((value) => value + 1);
    queue.enqueue(next, "Undo saved locally");
  }

  function redo(): void {
    const active = transaction.current;
    const queue = saveQueue.current;
    if (active === undefined || queue === undefined || !active.canRedo) return;
    const next = active.redo();
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
  const unresolvedCount = levelChoices.filter(isUnresolvedChoice).length;
  const totalUnresolved = (planningEvaluation?.choices ?? []).filter(
    (choice) => isUnresolvedChoice(choice) && choice.level <= visibleHorizon,
  ).length;
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
        choiceHasWarning(choice, planningEvaluation),
    ).length ?? 0;
  const warningCount = Math.max(
    diagnosticWarningCount,
    plannedHouseRuleCount,
    plannedChoiceWarningCount,
  );
  const selectedLevelHasWarning =
    planningEvaluation !== undefined &&
    levelChoices.some((choice) => choiceHasWarning(choice, planningEvaluation));

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

      <div className="builder-workspace">
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
              const grouped = groupLevelChoices(choices);
              const summaries = choices.flatMap((choice) => {
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
                return [{ label: choiceTitle(choice), choices: [choice] }];
              });
              const unresolved = choices.filter(isUnresolvedChoice).length;
              const choiceWarnings = choices.filter((choice) =>
                choiceHasWarning(choice, planningEvaluation!),
              ).length;
              return (
                <li
                  className={
                    frame.level === selectedLevel
                      ? "timeline-selected"
                      : undefined
                  }
                  key={frame.level}
                >
                  <button
                    className="timeline-level-button"
                    type="button"
                    onClick={() => {
                      setSelectedLevel(frame.level);
                      setSelectedChoiceId(
                        choices.find(isUnresolvedChoice)?.id ?? choices[0]?.id,
                      );
                    }}
                  >
                    <span>Level {frame.level}</span>
                    {frame.level > build.effectiveLevel ? (
                      <small>Planned</small>
                    ) : null}
                    <strong>
                      {unresolved > 0
                        ? `${unresolved} unresolved`
                        : choiceWarnings > 0
                          ? `${choiceWarnings} warning`
                          : "Complete"}
                    </strong>
                  </button>
                  {choices.length === 0 ? (
                    <p className="timeline-empty">No decisions at this level</p>
                  ) : (
                    <ul className="timeline-choices">
                      {summaries.map((summary) => {
                        const summaryUnresolved =
                          summary.choices.filter(isUnresolvedChoice).length;
                        const summaryWarning = summary.choices.some((choice) =>
                          choiceHasWarning(choice, planningEvaluation!),
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
                                summaryUnresolved > 0
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
                              {summaryUnresolved > 0 || summaryWarning ? (
                                <Icon name="warning" />
                              ) : (
                                <Icon name="check" />
                              )}
                              <span>
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

        <section aria-labelledby="choice-pane-heading" className="choice-pane">
          <header>
            <div>
              <p className="eyebrow">
                Level {selectedLevel}
                {selectedLevel > build.effectiveLevel
                  ? " · planned"
                  : " · current"}
              </p>
              <h3 id="choice-pane-heading">Level {selectedLevel} choices</h3>
            </div>
            {unresolvedCount > 0 ? (
              <span className="attention-badge">
                {unresolvedCount} unresolved
              </span>
            ) : selectedLevelHasWarning ? (
              <span className="attention-badge">
                <Icon name="warning" /> Review warnings
              </span>
            ) : (
              <span className="complete-badge">
                <Icon name="check" /> Complete
              </span>
            )}
          </header>
          {planningEvaluation === undefined ? (
            <p>Content is unavailable for planning.</p>
          ) : levelChoices.length === 0 ? (
            <div className="choice-empty-state">
              <Icon name="check" />
              <h4>No choices need attention at level {selectedLevel}</h4>
              <p>
                Select another level from the timeline or review the completed
                history below.
              </p>
            </div>
          ) : (
            <div className="level-choice-page">
              {levelChoices.map((choice) => {
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
                const warning = choiceHasWarning(choice, planningEvaluation);
                return (
                  <section
                    aria-labelledby={`${choiceSectionId(choice.id)}-heading`}
                    className="level-choice-section"
                    id={choiceSectionId(choice.id)}
                    key={choice.id}
                    tabIndex={-1}
                  >
                    <header>
                      <div>
                        <p className="eyebrow">{choice.type}</p>
                        <h4 id={`${choiceSectionId(choice.id)}-heading`}>
                          {choiceTitle(choice)}
                        </h4>
                      </div>
                      {isUnresolvedChoice(choice) ? (
                        <span className="attention-badge">Unresolved</span>
                      ) : warning ? (
                        <span className="attention-badge">
                          <Icon name="warning" /> House rule
                        </span>
                      ) : (
                        <span className="complete-badge">
                          <Icon name="check" /> Complete
                        </span>
                      )}
                    </header>
                    <ChoiceEditor
                      choice={choice}
                      evaluation={planningEvaluation}
                      build={build}
                      entities={entities}
                      byId={byId}
                      disabled={false}
                      rollbackRevision={rollbackRevision}
                      onDispatch={dispatch}
                    />
                  </section>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <section
        aria-label="Additional character editing"
        className="builder-secondary"
      >
        <details className="panel" open>
          <summary>Base ability scores</summary>
          <div className="ability-editor">
            {[
              "Strength",
              "Constitution",
              "Dexterity",
              "Intelligence",
              "Wisdom",
              "Charisma",
            ].map((ability) => (
              <label key={ability}>
                {ability}
                <CommitNumberInput
                  value={build.baseAbilities[ability] ?? 10}
                  min={1}
                  max={30}
                  onCommit={(value) =>
                    dispatch({ kind: "set-base-ability", ability, value })
                  }
                />
              </label>
            ))}
          </div>
        </details>
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
