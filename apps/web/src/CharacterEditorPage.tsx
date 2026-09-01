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
  evaluateCharacter,
  findBuildChildIndex,
  projectBuildForEvaluation,
  type EvaluatedChoice,
} from "@4ecb/rules-engine";

const characters = new CharacterRepository();
const packs = new ContentPackRepository();

function CommitNumberInput({
  value,
  min,
  max,
  label,
  onCommit,
}: {
  readonly value: number;
  readonly min: number;
  readonly max?: number;
  readonly label?: string;
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

function ReplacementPicker({
  choice,
  buildProvider,
  providerEntity,
  byId,
  selectedOccurrence,
  onDispatch,
}: {
  readonly choice: EvaluatedChoice;
  readonly buildProvider: BuildOccurrence;
  readonly providerEntity: ContentEntity | undefined;
  readonly byId: ReadonlyMap<string, ContentEntity>;
  readonly selectedOccurrence:
    | {
        readonly definitionId: string;
        readonly replacesId?: string;
      }
    | undefined;
  readonly onDispatch: (command: CharacterCommand) => void;
}) {
  const options = choice.replacementOptions ?? [];
  const [targetId, setTargetId] = useState(
    selectedOccurrence?.replacesId ?? options[0]?.replacesOccurrenceId ?? "",
  );
  const target = options.find(
    (option) => option.replacesOccurrenceId === targetId,
  );
  return (
    <fieldset className="replacement-picker">
      <legend>{choice.name || "Retrain a previous choice"}</legend>
      <label>
        Replace
        <select
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
          value={selectedOccurrence?.definitionId ?? ""}
          disabled={target === undefined}
          onChange={(event) => {
            const candidate = byId.get(
              event.currentTarget.value.toLocaleLowerCase(),
            );
            if (candidate === undefined || target === undefined) return;
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
                  definitionId: candidate.id,
                  name: candidate.name,
                  type: candidate.type,
                },
                acquiredLevel: buildProvider.acquiredLevel,
                legality: "rules-legal",
                children: [],
                unresolved: false,
              },
            });
          }}
        >
          <option value="">Choose a replacement</option>
          {(target?.candidates ?? [])
            .filter((candidate) => candidate.eligible)
            .map((candidate) => (
              <option
                key={candidate.definitionId}
                value={candidate.definitionId}
              >
                {byId.get(candidate.definitionId.toLocaleLowerCase())?.name ??
                  candidate.definitionId}
              </option>
            ))}
        </select>
      </label>
    </fieldset>
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
  const [status, setStatus] = useState("Loading build…");
  const [error, setError] = useState<string>();
  const transaction = useRef<CharacterTransaction | undefined>(undefined);

  useEffect(() => {
    void characters
      .get(characterId)
      .then(async (loaded) => {
        if (loaded === undefined) throw new Error("Character not found");
        setCharacter(loaded);
        transaction.current = new CharacterTransaction(loaded.build);
        if (loaded.profileBinding !== undefined) {
          const pack = await packs.get(loaded.profileBinding.packId);
          if (pack !== undefined) setEntities(pack.entities);
        }
        setStatus("Build loaded. Changes are saved in this browser.");
      })
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : String(reason)),
      );
  }, [characterId]);

  const build = transaction.current?.current;
  const byId = useMemo(
    () =>
      new Map(
        entities.map((entity) => [entity.id.toLocaleLowerCase(), entity]),
      ),
    [entities],
  );
  const evaluation = useMemo(
    () =>
      build === undefined || entities.length === 0
        ? undefined
        : evaluateCharacter(
            projectBuildForEvaluation(build, entities),
            entities,
          ),
    [build, entities],
  );

  async function persist(next: ReturnType<CharacterTransaction["dispatch"]>) {
    const updated = await characters.updateBuild(characterId, next);
    setCharacter(updated);
    setRevision((value) => value + 1);
    setStatus("Saved locally.");
  }

  async function dispatch(command: CharacterCommand): Promise<void> {
    if (transaction.current === undefined) return;
    await persist(transaction.current.dispatch(command));
  }

  async function undo(): Promise<void> {
    if (transaction.current === undefined) return;
    await persist(transaction.current.undo());
  }

  async function redo(): Promise<void> {
    if (transaction.current === undefined) return;
    await persist(transaction.current.redo());
  }

  if (error !== undefined)
    return (
      <main className="editor-page" id="main-content">
        <div className="error">{error}</div>
      </main>
    );
  if (character === undefined || build === undefined)
    return (
      <main className="editor-page loading-state" id="main-content">
        Loading character build…
      </main>
    );

  return (
    <main className="editor-page" id="main-content">
      <header className="page-heading">
        <div>
          <p className="eyebrow">Rules-backed editor alpha</p>
          <h2>{character.title}</h2>
          <p>{status}</p>
        </div>
        <div className="heading-actions">
          <a href={`#/characters/${encodeURIComponent(characterId)}`}>
            View sheet
          </a>
          <button
            type="button"
            disabled={!transaction.current?.canUndo}
            onClick={() => void undo()}
          >
            Undo
          </button>
          <button
            type="button"
            disabled={!transaction.current?.canRedo}
            onClick={() => void redo()}
          >
            Redo
          </button>
        </div>
      </header>

      {entities.length === 0 ? (
        <div className="profile-warning">
          Install or restore this character&apos;s bound content profile to
          evaluate choices and calculations. Its authoritative history remains
          editable.
        </div>
      ) : null}

      <div className="editor-grid">
        <section className="panel">
          <h3>Evaluation horizon</h3>
          <label>
            Effective level{" "}
            <select
              value={build.effectiveLevel}
              onChange={(event) =>
                void dispatch({
                  kind: "set-effective-level",
                  level: Number(event.currentTarget.value),
                })
              }
            >
              {build.levels.map((frame) => (
                <option key={frame.level} value={frame.level}>
                  {frame.level}
                </option>
              ))}
            </select>
          </label>
          <div className="inline-actions">
            <button
              type="button"
              disabled={build.levels.length >= 30 || entities.length === 0}
              onClick={() => {
                const level = build.levels.length + 1;
                const definition = byId.get(
                  `id_internal_level_${level}`.toLocaleLowerCase(),
                );
                if (definition === undefined) {
                  setError(
                    `The active content profile has no level ${level} record.`,
                  );
                  return;
                }
                void dispatch({
                  kind: "add-level",
                  frame: {
                    level,
                    root: {
                      id: `web:${crypto.randomUUID()}`,
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
                  },
                });
              }}
            >
              Add level
            </button>
            <button
              type="button"
              disabled={build.levels.length <= 1}
              onClick={() => void dispatch({ kind: "remove-last-level" })}
            >
              Remove last level
            </button>
          </div>
          {evaluation === undefined ? null : (
            <dl className="report-facts">
              <div>
                <dt>Complete</dt>
                <dd>{evaluation.complete ? "Yes" : "No"}</dd>
              </div>
              <div>
                <dt>Rules legal</dt>
                <dd>{evaluation.legal ? "Yes" : "No"}</dd>
              </div>
              <div>
                <dt>Engine passes</dt>
                <dd>{evaluation.iterations}</dd>
              </div>
            </dl>
          )}
        </section>

        <section className="panel">
          <h3>Base ability scores</h3>
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
                    void dispatch({
                      kind: "set-base-ability",
                      ability,
                      value,
                    })
                  }
                />
              </label>
            ))}
          </div>
        </section>
      </div>

      <section className="panel editor-choices">
        <h3>Active choices</h3>
        {evaluation === undefined ? (
          <p>Content is unavailable.</p>
        ) : evaluation.choices.length === 0 ? (
          <p>No active choices at this level.</p>
        ) : (
          evaluation.choices.map((choice) => {
            const replacement = choice.type === "Replacement";
            const provider = evaluation.occurrences.find(
              (occurrence) => occurrence.id === choice.providerOccurrenceId,
            );
            const buildProvider = findOccurrence(
              build,
              choice.providerOccurrenceId,
            );
            const materializableGrant =
              buildProvider === undefined &&
              provider?.kind === "grant" &&
              provider.parentId !== undefined &&
              findOccurrence(build, provider.parentId) !== undefined;
            const selectedDefinitionId =
              choice.selectedOccurrenceId === undefined
                ? undefined
                : evaluation.occurrences.find(
                    (item) => item.id === choice.selectedOccurrenceId,
                  )?.definitionId;
            const selectedOccurrence =
              choice.selectedOccurrenceId === undefined
                ? undefined
                : evaluation.occurrences.find(
                    (item) => item.id === choice.selectedOccurrenceId,
                  );
            if (replacement && buildProvider !== undefined)
              return (
                <ReplacementPicker
                  key={choice.id}
                  choice={choice}
                  buildProvider={buildProvider}
                  providerEntity={
                    provider === undefined
                      ? undefined
                      : byId.get(provider.definitionId.toLocaleLowerCase())
                  }
                  byId={byId}
                  selectedOccurrence={selectedOccurrence}
                  onDispatch={(command) => void dispatch(command)}
                />
              );
            return (
              <label key={choice.id}>
                {choice.name || `Choose ${choice.type}`}
                <select
                  value={selectedDefinitionId ?? ""}
                  disabled={
                    (!materializableGrant && buildProvider === undefined) ||
                    replacement
                  }
                  onChange={(event) => {
                    const candidate = byId.get(
                      event.currentTarget.value.toLocaleLowerCase(),
                    );
                    if (candidate === undefined) return;
                    const selected: BuildOccurrence = {
                      id: `web:${crypto.randomUUID()}`,
                      identity: {
                        definitionId: candidate.id,
                        name: candidate.name,
                        type: candidate.type,
                      },
                      acquiredLevel:
                        buildProvider?.acquiredLevel ??
                        provider?.acquiredLevel ??
                        build.effectiveLevel,
                      legality: "rules-legal",
                      children: [],
                      unresolved: false,
                    };
                    const command = commandForEvaluatedChoice(
                      build,
                      choice,
                      evaluation.occurrences,
                      entities,
                      selected,
                      (index) =>
                        `web:placeholder:${index}:${crypto.randomUUID()}`,
                    );
                    if (command === undefined) {
                      setError(
                        "This generated choice is nested more deeply than the editor can materialize.",
                      );
                      return;
                    }
                    void dispatch(command);
                  }}
                >
                  <option value="">Unresolved</option>
                  {choice.candidates
                    .filter(
                      (candidate) =>
                        candidate.eligible ||
                        candidate.definitionId === selectedDefinitionId,
                    )
                    .map((candidate) => {
                      const definition = byId.get(
                        candidate.definitionId.toLocaleLowerCase(),
                      );
                      return (
                        <option
                          key={candidate.definitionId}
                          value={candidate.definitionId}
                        >
                          {definition?.name ?? candidate.definitionId}
                          {candidate.eligible
                            ? ""
                            : " (prerequisite unverified)"}
                        </option>
                      );
                    })}
                </select>
              </label>
            );
          })
        )}
      </section>

      <div className="editor-grid">
        <section className="panel">
          <h3>Level history</h3>
          {build.levels.map((frame) => (
            <details
              key={frame.level}
              open={frame.level === build.effectiveLevel}
            >
              <summary>Level {frame.level}</summary>
              <ul className="occurrence-tree">
                <OccurrenceTree occurrence={frame.root} byId={byId} />
              </ul>
            </details>
          ))}
        </section>
        <section className="panel">
          <h3>Diagnostics</h3>
          {evaluation === undefined || evaluation.diagnostics.length === 0 ? (
            <p>No evaluator diagnostics.</p>
          ) : (
            <ul className="diagnostic-list">
              {evaluation.diagnostics.map((diagnostic, index) => (
                <li key={`${diagnostic.code}-${index}`}>
                  <strong>{diagnostic.code}</strong>: {diagnostic.message}
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="panel inventory-editor">
          <h3>Inventory and equipment</h3>
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
                          onCommit={(quantity) => {
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
                            });
                          }}
                        />
                      </td>
                      <td>
                        <CommitNumberInput
                          label={`Equipped quantity for ${entry.name ?? entry.id}`}
                          max={entry.quantity}
                          value={entry.equippedQuantity}
                          min={0}
                          onCommit={(equippedQuantity) =>
                            void dispatch({
                              kind: "put-inventory",
                              entry: {
                                ...entry,
                                equippedQuantity,
                              },
                            })
                          }
                        />
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
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
