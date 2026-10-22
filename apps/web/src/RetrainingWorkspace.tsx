import { useEffect, useRef, useState } from "react";

import type { CharacterCommand, CharacterRecord } from "@4ecb/character-domain";
import type { ContentEntity } from "@4ecb/content-domain";
import type {
  CandidateDecision,
  EvaluatedCharacter,
  EvaluatedChoice,
} from "@4ecb/rules-engine";

import { CandidateDetail } from "./CandidateDetail";
import type { InspectedOption } from "./CandidateSelectionTable";
import { CandidateInspectionScope } from "./builder-choice-context";
import {
  isOptionalRetrainingChoice,
  retrainingCategory,
  selectedOccurrence,
  unresolveEvaluatedChoiceCommand,
  type RetrainingCategory,
} from "./builder-ui";
import { ChoiceAccordionItem } from "./ChoiceAccordionItem";
import { ChoiceEditor } from "./ChoiceEditors";
import { Icon } from "./Icon";

const CATEGORIES: readonly RetrainingCategory[] = ["skill", "feat", "power"];

/**
 * What a level can retrain. A character with a beast companion choice can
 * change the beast instead (Martial Power p. 42), so the option is always
 * there for it, empty at a level with nothing to change.
 */
export function retrainingCategories(
  evaluation: EvaluatedCharacter,
): readonly RetrainingCategory[] {
  return evaluation.choices.some(
    (choice) => choice.type.trim().toLocaleLowerCase() === "companion",
  )
    ? [...CATEGORIES, "companion"]
    : CATEGORIES;
}

export interface LevelRetrain {
  readonly choice: EvaluatedChoice;
  readonly category: RetrainingCategory | undefined;
  readonly from: string;
  readonly to: string;
  readonly toId: string | undefined;
}

function entityName(
  definitionId: string | undefined,
  byId: ReadonlyMap<string, ContentEntity>,
): string {
  if (definitionId === undefined) return "";
  return byId.get(definitionId.toLocaleLowerCase())?.name ?? definitionId;
}

/** The retrain made at a level (one per level), if any. */
export function levelRetrain(
  choices: readonly EvaluatedChoice[],
  evaluation: EvaluatedCharacter,
  byId: ReadonlyMap<string, ContentEntity>,
): LevelRetrain | undefined {
  for (const choice of choices) {
    const selected = selectedOccurrence(choice, evaluation);
    if (selected === undefined) continue;
    const replacedId =
      evaluation.occurrences.find(({ id }) => id === selected.replacesId)
        ?.definitionId ??
      choice.replacementOptions?.find(
        (option) => option.replacesOccurrenceId === selected.replacesId,
      )?.definitionId;
    return {
      choice,
      category: retrainingCategory(
        replacedId === undefined
          ? undefined
          : byId.get(replacedId.toLocaleLowerCase())?.type,
      ),
      from: entityName(replacedId, byId),
      to: entityName(selected.definitionId, byId),
      toId: selected.definitionId,
    };
  }
  return undefined;
}

/**
 * The Retraining tab: an overview of every level that can retrain (one
 * retrain per level). Clicking a row shows its replacement in the details
 * pane; double-clicking it, or its edit button, opens that level's
 * retraining in a dialog, so the overview never pushes the editor away.
 */
export function RetrainingWorkspace({
  evaluation,
  build,
  entities,
  byId,
  rollbackRevision,
  selectedLevel,
  onSelectLevel,
  onRequestDetails,
  onDispatch,
}: {
  readonly evaluation: EvaluatedCharacter | undefined;
  readonly build: CharacterRecord["build"];
  readonly entities: readonly ContentEntity[];
  readonly byId: ReadonlyMap<string, ContentEntity>;
  readonly rollbackRevision: number;
  readonly selectedLevel: number;
  readonly onSelectLevel: (level: number) => void;
  readonly onRequestDetails: (choiceId: string | undefined) => void;
  readonly onDispatch: (command: CharacterCommand) => void;
}) {
  const [editingLevel, setEditingLevel] = useState<number>();
  if (evaluation === undefined)
    return (
      <section aria-label="Retraining" className="choice-pane">
        <p className="choice-empty-state">Evaluating retraining options…</p>
      </section>
    );
  const choicesByLevel = new Map<number, EvaluatedChoice[]>();
  for (const choice of evaluation.choices) {
    if (!isOptionalRetrainingChoice(choice)) continue;
    if (choice.level > build.effectiveLevel) continue;
    choicesByLevel.set(choice.level, [
      ...(choicesByLevel.get(choice.level) ?? []),
      choice,
    ]);
  }
  const levels = [...choicesByLevel.keys()].sort((a, b) => a - b);
  const selected = choicesByLevel.has(selectedLevel)
    ? selectedLevel
    : undefined;
  const selectedRetrain =
    selected === undefined
      ? undefined
      : levelRetrain(choicesByLevel.get(selected) ?? [], evaluation, byId);
  const selectedEntity =
    selectedRetrain?.toId === undefined
      ? undefined
      : byId.get(selectedRetrain.toId.toLocaleLowerCase());

  return (
    <section aria-label="Retraining" className="choice-pane">
      <div className="retraining-content">
        {levels.length === 0 ? (
          <div className="choice-empty-state">
            <h4>Nothing to retrain yet</h4>
            <p>Retraining opens from level 2.</p>
          </div>
        ) : (
          <div className="level-choice-workspace retraining-workspace">
            <div className="level-choice-page">
              <table className="retraining-levels">
                <thead>
                  <tr>
                    <th scope="col" title="Level">
                      Lvl
                    </th>
                    <th scope="col">Kind</th>
                    <th scope="col">Replaced</th>
                    <th scope="col">With</th>
                    <th scope="col">
                      <span className="visually-hidden">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {levels.map((rowLevel) => {
                    const retrain = levelRetrain(
                      choicesByLevel.get(rowLevel) ?? [],
                      evaluation,
                      byId,
                    );
                    return (
                      <tr
                        aria-selected={rowLevel === selected}
                        className={`table-clickable-row${rowLevel === selected ? " is-selected" : ""}`}
                        key={rowLevel}
                        title="Double-click to edit this level's retraining"
                        onClick={() => onSelectLevel(rowLevel)}
                        onDoubleClick={() => setEditingLevel(rowLevel)}
                      >
                        <td>{rowLevel}</td>
                        <td>
                          {retrain?.category === undefined ? (
                            <span className="retraining-none">—</span>
                          ) : (
                            `${retrain.category[0]!.toLocaleUpperCase()}${retrain.category.slice(1)}`
                          )}
                        </td>
                        <td>{retrain?.from}</td>
                        <td>
                          <strong>{retrain?.to}</strong>
                        </td>
                        <td>
                          <div className="character-card-actions retraining-row-actions">
                            <button
                              aria-label={`Edit the level ${rowLevel} retraining`}
                              className="character-card-action"
                              title="Edit retraining"
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                onSelectLevel(rowLevel);
                                setEditingLevel(rowLevel);
                              }}
                            >
                              <Icon name="edit" />
                            </button>
                            <button
                              aria-label={`Remove the level ${rowLevel} retrain`}
                              className="character-card-action"
                              disabled={retrain === undefined}
                              title="Remove retrain"
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                if (retrain === undefined) return;
                                const command = unresolveEvaluatedChoiceCommand(
                                  build,
                                  retrain.choice,
                                  evaluation,
                                  entities,
                                  `web:placeholder:retraining:${crypto.randomUUID()}`,
                                );
                                if (command !== undefined) onDispatch(command);
                              }}
                            >
                              <Icon name="remove" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="shared-choice-detail">
              <CandidateDetail
                byId={byId}
                candidate={
                  selectedRetrain?.toId === undefined
                    ? undefined
                    : ownedDecision(selectedRetrain.toId)
                }
                entity={selectedEntity}
              />
            </div>
          </div>
        )}
      </div>
      {editingLevel === undefined ? null : (
        <RetrainingDialog
          level={editingLevel}
          choices={choicesByLevel.get(editingLevel) ?? []}
          evaluation={evaluation}
          build={build}
          entities={entities}
          byId={byId}
          rollbackRevision={rollbackRevision}
          onRequestDetails={onRequestDetails}
          onDispatch={onDispatch}
          onClose={() => setEditingLevel(undefined)}
        />
      )}
    </section>
  );
}

/** A definition the character has, as a decision the details pane can show. */
function ownedDecision(definitionId: string): CandidateDecision {
  return {
    definitionId,
    eligible: true,
    sourceEntitled: true,
    rulesLegal: true,
    activeDefinition: true,
    activeOccurrenceIds: [],
    providerOccurrenceIds: [],
    reasons: [],
  };
}

/** One level's retraining: the skill / feat / power accordion beside the
 *  details card. Changes apply as they are made, so it only has a close x. */
function RetrainingDialog({
  level,
  onClose,
  ...props
}: Omit<Parameters<typeof LevelRetraining>[0], "level"> & {
  readonly level: number;
  readonly onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [inspected, setInspected] = useState<InspectedOption>();
  useEffect(() => {
    const current = dialog.current;
    if (current !== null && !current.open) current.showModal();
  }, []);
  return (
    <dialog
      aria-labelledby="retraining-dialog-title"
      className="retraining-dialog dialog-shell"
      ref={dialog}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header>
        <h2 id="retraining-dialog-title">Level {level} retraining</h2>
        <button
          aria-label="Close"
          className="button-icon dialog-close"
          title="Close"
          type="button"
          onClick={onClose}
        >
          <Icon name="remove" />
        </button>
      </header>
      <div className="retraining-dialog-body">
        <CandidateInspectionScope onInspect={setInspected}>
          <LevelRetraining level={level} {...props} />
          <div className="retraining-dialog-detail">
            <CandidateDetail
              byId={props.byId}
              candidate={inspected?.candidate}
              entity={inspected?.entity}
              favoritable={inspected?.favoritable === true}
            />
          </div>
        </CandidateInspectionScope>
      </div>
    </dialog>
  );
}

function LevelRetraining({
  level,
  choices,
  evaluation,
  build,
  entities,
  byId,
  rollbackRevision,
  onRequestDetails,
  onDispatch,
}: {
  readonly level: number;
  readonly choices: readonly EvaluatedChoice[];
  readonly evaluation: EvaluatedCharacter;
  readonly build: CharacterRecord["build"];
  readonly entities: readonly ContentEntity[];
  readonly byId: ReadonlyMap<string, ContentEntity>;
  readonly rollbackRevision: number;
  readonly onRequestDetails: (choiceId: string | undefined) => void;
  readonly onDispatch: (command: CharacterCommand) => void;
}) {
  const retrain = levelRetrain(choices, evaluation, byId);
  // Opens on the kind already retrained; nothing opens on its own otherwise.
  const [open, setOpen] = useState<RetrainingCategory | undefined>(
    retrain?.category,
  );
  const [pending, setPending] = useState<CharacterCommand>();
  // Remounts the open editor to drop its optimistic pick after a Cancel.
  const [resetKey, setResetKey] = useState(0);
  const choice = retrain?.choice ?? choices[0];

  useEffect(() => {
    onRequestDetails(open === undefined ? undefined : choice?.id);
  }, [choice?.id, onRequestDetails, open]);
  useEffect(() => () => onRequestDetails(undefined), [onRequestDetails]);

  const hasOptions = (category: RetrainingCategory) =>
    choices.some((item) =>
      (item.replacementOptions ?? []).some(
        (option) =>
          retrainingCategory(
            byId.get(option.definitionId.toLocaleLowerCase())?.type,
          ) === category,
      ),
    );

  return (
    <div className="retraining-level" aria-label={`Level ${level} retraining`}>
      {retrainingCategories(evaluation).map((category) => {
        const isRetrained = retrain?.category === category;
        return (
          <ChoiceAccordionItem
            key={category}
            open={open === category}
            title={`Retrain a ${category}`}
            picks={isRetrained ? `${retrain.from} → ${retrain.to}` : ""}
            status={isRetrained ? "complete" : undefined}
            onToggle={() =>
              setOpen((current) =>
                current === category ? undefined : category,
              )
            }
          >
            {choice === undefined || !hasOptions(category) ? (
              <p className="retraining-empty">
                {category === "companion"
                  ? `No beast companion can be retrained at level ${level}.`
                  : `No ${category}s can be retrained at level ${level}.`}
              </p>
            ) : (
              <div className="retraining-editor">
                <ChoiceEditor
                  key={`${category}:${resetKey}`}
                  choice={choice}
                  evaluation={evaluation}
                  build={build}
                  entities={entities}
                  byId={byId}
                  disabled={false}
                  replacementTargetType={category}
                  rollbackRevision={rollbackRevision}
                  onDispatch={(command) => {
                    // A retrain of another kind replaces this level's retrain.
                    if (
                      command.kind === "retrain" &&
                      retrain !== undefined &&
                      retrain.category !== category
                    ) {
                      setPending(command);
                      return;
                    }
                    onDispatch(command);
                  }}
                />
              </div>
            )}
          </ChoiceAccordionItem>
        );
      })}
      {pending === undefined || retrain === undefined ? null : (
        <ReplaceRetrainDialog
          retrain={retrain}
          onCancel={() => {
            setPending(undefined);
            setResetKey((key) => key + 1);
          }}
          onConfirm={() => {
            onDispatch(pending);
            setPending(undefined);
          }}
        />
      )}
    </div>
  );
}

function ReplaceRetrainDialog({
  retrain,
  onCancel,
  onConfirm,
}: {
  readonly retrain: LevelRetrain;
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
      aria-labelledby="replace-retrain-title"
      className="replace-retrain-dialog dialog-shell"
      ref={dialog}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <header>
        <h2 id="replace-retrain-title">Replace this level&apos;s retrain?</h2>
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
      <p className="replace-retrain-body">
        Only one retrain is allowed per level, so{" "}
        <strong>
          {retrain.from} → {retrain.to}
        </strong>{" "}
        will be removed.
      </p>
      <footer>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button className="button-primary" type="button" onClick={onConfirm}>
          Replace
        </button>
      </footer>
    </dialog>
  );
}
