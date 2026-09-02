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
import type { ContentEntity } from "@4ecb/content-domain";
import {
  commandForEvaluatedChoice,
  findBuildChildIndex,
  projectBuildForEvaluation,
  type EvaluatedCharacter,
  type EvaluatedChoice,
} from "@4ecb/rules-engine";

import {
  candidateReason,
  choicesAtLevel,
  isUnresolvedChoice,
  planningHorizonCommand,
} from "./builder-ui";
import { Icon } from "./Icon";
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

function ReplacementEditor({
  choice,
  evaluation,
  buildProvider,
  providerEntity,
  byId,
  disabled,
  onDispatch,
}: {
  readonly choice: EvaluatedChoice;
  readonly evaluation: EvaluatedCharacter;
  readonly buildProvider: BuildOccurrence;
  readonly providerEntity: ContentEntity | undefined;
  readonly byId: ReadonlyMap<string, ContentEntity>;
  readonly disabled: boolean;
  readonly onDispatch: (command: CharacterCommand) => void;
}) {
  const options = choice.replacementOptions ?? [];
  const selected = selectedOccurrence(choice, evaluation);
  const [targetId, setTargetId] = useState(
    selected?.replacesId ?? options[0]?.replacesOccurrenceId ?? "",
  );
  const [showAll, setShowAll] = useState(false);
  const target = options.find(
    (option) => option.replacesOccurrenceId === targetId,
  );
  const visible = (target?.candidates ?? []).filter(
    (candidate) =>
      showAll ||
      candidate.eligible ||
      candidate.definitionId === selected?.definitionId,
  );

  return (
    <div className="choice-editor-fields">
      <label>
        Replace
        <select
          disabled={disabled}
          value={targetId}
          onChange={(event) => setTargetId(event.currentTarget.value)}
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
          value={selected?.definitionId ?? ""}
          onChange={(event) => {
            const candidate = target?.candidates.find(
              (item) => item.definitionId === event.currentTarget.value,
            );
            const definition = byId.get(
              event.currentTarget.value.toLocaleLowerCase(),
            );
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
            <option key={candidate.definitionId} value={candidate.definitionId}>
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
        Unavailable options include their objective rules reason and are saved
        as a house-rule choice when selected.
      </p>
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
  onDispatch,
}: {
  readonly choice: EvaluatedChoice;
  readonly evaluation: EvaluatedCharacter;
  readonly build: CharacterRecord["build"];
  readonly entities: readonly ContentEntity[];
  readonly byId: ReadonlyMap<string, ContentEntity>;
  readonly disabled: boolean;
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
        onDispatch={onDispatch}
      />
    );

  const visibleCandidates = choice.candidates.filter(
    (candidate) =>
      showAll ||
      candidate.eligible ||
      candidate.definitionId === selected?.definitionId,
  );
  const editorDisabled =
    disabled ||
    (!materializableGrant && buildProvider === undefined) ||
    choice.type === "Replacement";

  return (
    <div className="choice-editor-fields">
      <label>
        Selection
        <select
          disabled={editorDisabled}
          value={selected?.definitionId ?? ""}
          onChange={(event) => {
            const candidate = choice.candidates.find(
              (item) => item.definitionId === event.currentTarget.value,
            );
            const definition = byId.get(
              event.currentTarget.value.toLocaleLowerCase(),
            );
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
          }}
        >
          <option value="">Unresolved</option>
          {visibleCandidates.map((candidate) => (
            <option key={candidate.definitionId} value={candidate.definitionId}>
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
        Valid choices are shown by default. This filter resets when you open a
        different choice; unavailable selections are explicit house rules.
      </p>
    </div>
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
  const transaction = useRef<CharacterTransaction | undefined>(undefined);
  const rulesClient = useRef<RulesWorkerClient | undefined>(undefined);
  const evaluationRevision = useRef(0);

  useEffect(() => {
    void characters
      .get(characterId)
      .then(async (loaded) => {
        if (loaded === undefined) throw new Error("Character not found");
        setCharacter(loaded);
        transaction.current = new CharacterTransaction(loaded.build);
        setVisibleHorizon(loaded.build.levels.length);
        setSelectedLevel(loaded.build.effectiveLevel);
        if (loaded.profileBinding !== undefined) {
          const pack = await packs.get(loaded.profileBinding.packId);
          if (pack !== undefined) setEntities(pack.entities);
        }
        setSaveState({ phase: "saved", message: "Saved locally" });
      })
      .catch((reason: unknown) =>
        setLoadError(reason instanceof Error ? reason.message : String(reason)),
      );
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
  useEffect(() => {
    if (levelChoices.some((choice) => choice.id === selectedChoiceId)) return;
    setSelectedChoiceId(
      levelChoices.find(isUnresolvedChoice)?.id ?? levelChoices[0]?.id,
    );
  }, [levelChoices, selectedChoiceId]);

  async function dispatch(command: CharacterCommand): Promise<void> {
    const active = transaction.current;
    if (active === undefined || saveState.phase === "saving") return;
    setSaveState({ phase: "saving", message: "Saving…" });
    let changed = false;
    try {
      const next = active.dispatch(command);
      changed = true;
      const updated = await characters.updateBuild(characterId, next);
      setCharacter(updated);
      setRevision((value) => value + 1);
      setSaveState({ phase: "saved", message: "Saved locally" });
    } catch (reason: unknown) {
      if (changed) active.undo();
      setRevision((value) => value + 1);
      setSaveState({
        phase: "failed",
        message: `Save failed: ${reason instanceof Error ? reason.message : String(reason)}`,
      });
    }
  }

  async function undo(): Promise<void> {
    const active = transaction.current;
    if (active === undefined || saveState.phase === "saving") return;
    setSaveState({ phase: "saving", message: "Saving undo…" });
    let changed = false;
    try {
      const next = active.undo();
      changed = true;
      const updated = await characters.updateBuild(characterId, next);
      setCharacter(updated);
      setRevision((value) => value + 1);
      setSaveState({ phase: "saved", message: "Undo saved locally" });
    } catch (reason: unknown) {
      if (changed) active.redo();
      setRevision((value) => value + 1);
      setSaveState({
        phase: "failed",
        message: `Undo was not saved: ${reason instanceof Error ? reason.message : String(reason)}`,
      });
    }
  }

  async function redo(): Promise<void> {
    const active = transaction.current;
    if (active === undefined || saveState.phase === "saving") return;
    setSaveState({ phase: "saving", message: "Saving redo…" });
    let changed = false;
    try {
      const next = active.redo();
      changed = true;
      const updated = await characters.updateBuild(characterId, next);
      setCharacter(updated);
      setRevision((value) => value + 1);
      setSaveState({ phase: "saved", message: "Redo saved locally" });
    } catch (reason: unknown) {
      if (changed) active.undo();
      setRevision((value) => value + 1);
      setSaveState({
        phase: "failed",
        message: `Redo was not saved: ${reason instanceof Error ? reason.message : String(reason)}`,
      });
    }
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
  const selectedChoice = levelChoices.find(
    (choice) => choice.id === selectedChoiceId,
  );

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
            disabled={saving || !transaction.current?.canUndo}
            onClick={() => void undo()}
          >
            <Icon name="undo" /> Undo
          </button>
          <button
            type="button"
            disabled={saving || !transaction.current?.canRedo}
            onClick={() => void redo()}
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
              disabled={saving}
              value={build.effectiveLevel}
              onChange={(event) => {
                const level = Number(event.currentTarget.value);
                setVisibleHorizon((current) => Math.max(current, level));
                setSelectedLevel(level);
                void dispatch({ kind: "set-effective-level", level });
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
                disabled={saving || entities.length === 0}
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
                    if (command !== undefined) void dispatch(command);
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
                      {choices.map((choice) => {
                        const selected = selectedOccurrence(
                          choice,
                          planningEvaluation!,
                        );
                        const resolvedName =
                          selected === undefined
                            ? undefined
                            : byId.get(
                                selected.definitionId.toLocaleLowerCase(),
                              )?.name;
                        const choiceWarning = choiceHasWarning(
                          choice,
                          planningEvaluation!,
                        );
                        return (
                          <li key={choice.id}>
                            <button
                              aria-current={
                                choice.id === selectedChoiceId
                                  ? "true"
                                  : undefined
                              }
                              className={
                                isUnresolvedChoice(choice)
                                  ? "choice-unresolved"
                                  : choiceWarning
                                    ? "choice-warning"
                                    : "choice-complete"
                              }
                              type="button"
                              onClick={() => {
                                setSelectedLevel(frame.level);
                                setSelectedChoiceId(choice.id);
                              }}
                            >
                              {isUnresolvedChoice(choice) || choiceWarning ? (
                                <Icon name="warning" />
                              ) : (
                                <Icon name="check" />
                              )}
                              <span>
                                {choiceTitle(choice)}
                                {resolvedName === undefined
                                  ? ""
                                  : ` · ${resolvedName}`}
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
              <h3 id="choice-pane-heading">
                {selectedChoice === undefined
                  ? `Level ${selectedLevel}`
                  : choiceTitle(selectedChoice)}
              </h3>
            </div>
            {unresolvedCount > 0 ? (
              <span className="attention-badge">
                {unresolvedCount} unresolved
              </span>
            ) : selectedChoice !== undefined &&
              choiceHasWarning(selectedChoice, planningEvaluation!) ? (
              <span className="attention-badge">
                <Icon name="warning" /> House rule
              </span>
            ) : (
              <span className="complete-badge">
                <Icon name="check" /> Complete
              </span>
            )}
          </header>
          {planningEvaluation === undefined ? (
            <p>Content is unavailable for planning.</p>
          ) : selectedChoice === undefined ? (
            <div className="choice-empty-state">
              <Icon name="check" />
              <h4>No choices need attention at level {selectedLevel}</h4>
              <p>
                Select another level from the timeline or review the completed
                history below.
              </p>
            </div>
          ) : (
            <ChoiceEditor
              key={selectedChoice.id}
              choice={selectedChoice}
              evaluation={planningEvaluation}
              build={build}
              entities={entities}
              byId={byId}
              disabled={saving}
              onDispatch={(command) => void dispatch(command)}
            />
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
                  disabled={saving}
                  value={build.baseAbilities[ability] ?? 10}
                  min={1}
                  max={30}
                  onCommit={(value) =>
                    void dispatch({ kind: "set-base-ability", ability, value })
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
                          disabled={saving}
                          label={`Owned quantity for ${entry.name ?? entry.id}`}
                          value={entry.quantity}
                          min={0}
                          onCommit={(quantity) =>
                            void dispatch({
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
                          disabled={saving}
                          label={`Equipped quantity for ${entry.name ?? entry.id}`}
                          max={entry.quantity}
                          value={entry.equippedQuantity}
                          min={0}
                          onCommit={(equippedQuantity) =>
                            void dispatch({
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
