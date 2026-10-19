import { useEffect, useRef, useState } from "react";

import type { CharacterCommand, CharacterRecord } from "@4ecb/character-domain";
import type { ContentEntity } from "@4ecb/content-domain";
import type { EvaluatedCharacter, EvaluatedChoice } from "@4ecb/rules-engine";

import {
  choiceSelectionTableKind,
  isUnresolvedChoice,
  selectedDefinitionId,
} from "./builder-ui";
import { CandidateInspectionScope } from "./builder-choice-context";
import { CandidateDetail } from "./CandidateDetail";
import { type InspectedOption } from "./CandidateSelectionTable";
import { ChoiceEditor } from "./ChoiceEditors";
import { Icon } from "./Icon";

export function CharacterTextField({
  name,
  label,
  value,
  multiline = false,
  className,
  visuallyHideLabel = false,
  inlineLabel = false,
  fitContent = false,
  onDispatch,
}: {
  readonly name: string;
  readonly label: string;
  readonly value: string;
  readonly multiline?: boolean;
  readonly className?: string;
  readonly visuallyHideLabel?: boolean;
  /** Label inside the field's frame, before the value ([Player  Ann]). */
  readonly inlineLabel?: boolean;
  /** Size a single-line field to its text instead of its container. */
  readonly fitContent?: boolean;
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

  const input = (
    <input
      {...(name === "Name" ? { maxLength: 120, required: true } : {})}
      size={fitContent ? 1 : undefined}
      value={draft}
      onBlur={() => commit(draft)}
      onChange={(event) => change(event.currentTarget.value)}
    />
  );

  return (
    <label
      className={
        [inlineLabel ? "inline-field" : undefined, className]
          .filter(Boolean)
          .join(" ") || undefined
      }
    >
      <span
        className={
          visuallyHideLabel
            ? "visually-hidden"
            : inlineLabel
              ? "inline-field-label"
              : undefined
        }
      >
        {label}
      </span>
      {multiline ? (
        <textarea
          rows={5}
          value={draft}
          onBlur={() => commit(draft)}
          onChange={(event) => change(event.currentTarget.value)}
        />
      ) : fitContent ? (
        // An invisible copy of the text (::after) shares the input's grid
        // cell, so the cell, and the input with it, is as wide as the text.
        <span className="text-field-fit" data-value={draft}>
          {input}
        </span>
      ) : (
        input
      )}
    </label>
  );
}

export function CharacterDetailsEditor({
  active,
  choices,
  evaluation,
  build,
  snapshotDetails,
  entities,
  byId,
  rollbackRevision,
  effectiveLevel,
  deityAlignment,
  alignmentHouseRuled,
  onDispatch,
}: {
  readonly active: boolean;
  readonly choices: readonly EvaluatedChoice[];
  readonly evaluation: EvaluatedCharacter | undefined;
  readonly build: CharacterRecord["build"];
  readonly snapshotDetails: Readonly<Record<string, string>>;
  readonly entities: readonly ContentEntity[];
  readonly byId: ReadonlyMap<string, ContentEntity>;
  readonly rollbackRevision: number;
  readonly effectiveLevel: number;
  readonly deityAlignment:
    | {
        readonly classNames: readonly string[];
        readonly deityName: string;
        readonly alignmentName: string;
      }
    | undefined;
  readonly alignmentHouseRuled: boolean;
  readonly onDispatch: (command: CharacterCommand) => void;
}) {
  const [inspectedOption, setInspectedOption] = useState<InspectedOption>();
  const [activeNote, setActiveNote] = useState(0);
  // Table choices (Deity) start collapsed to their current pick, so the
  // table doesn't crowd out the rest of the page.
  const [expandedTables, setExpandedTables] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const textValue = (name: string, detailName?: string) =>
    Object.hasOwn(build.textStrings, name)
      ? (build.textStrings[name] ?? "")
      : detailName === undefined
        ? ""
        : (snapshotDetails[detailName] ?? "");
  // The name is edited in the sidebar and the level beside it, so Details
  // keeps only the record-keeping fields.
  const playerFields = [
    {
      name: "Player",
      label: "Player",
      value: textValue("Player", "Player"),
    },
    {
      name: "Company",
      label: "Company",
      value: textValue("Company", "Company"),
    },
    { name: "RPGA", label: "RPGA #", value: textValue("RPGA", "RPGA") },
  ] as const;
  const physicalFields = [
    { name: "Age", label: "Age", value: textValue("Age", "Age") },
    { name: "Height", label: "Height", value: textValue("Height", "Height") },
    { name: "Weight", label: "Weight", value: textValue("Weight", "Weight") },
  ] as const;
  const noteFields = [
    {
      name: "NOTE_Personality Traits",
      tab: "Traits",
      label: "Personality traits",
      value: textValue("NOTE_Personality Traits", "Traits"),
    },
    {
      name: "NOTE_Mannerisms and Appearance",
      tab: "Appearance",
      label: "Mannerisms and appearance",
      value: textValue("NOTE_Mannerisms and Appearance", "Appearance"),
    },
    {
      name: "NOTE_Character Background",
      tab: "Background",
      label: "Character background",
      value: textValue("NOTE_Character Background"),
    },
    {
      name: "NOTE_Companions And Allies",
      tab: "Companions",
      label: "Companions and allies",
      value: textValue("NOTE_Companions And Allies", "Companions"),
    },
    {
      name: "NOTE_Session and Campaign Notes",
      tab: "Session",
      label: "Session and campaign notes",
      value: textValue("NOTE_Session and Campaign Notes", "Notes"),
    },
    {
      name: "NOTE_RPGA Notes",
      tab: "RPGA",
      label: "RPGA notes",
      value: textValue("NOTE_RPGA Notes"),
    },
  ] as const;
  const buttonChoices = choices.filter(
    (choice) => choiceSelectionTableKind(choice) === undefined,
  );
  const tableChoices = choices.filter(
    (choice) => choiceSelectionTableKind(choice) !== undefined,
  );
  const unresolved = (choice: EvaluatedChoice) =>
    choice.level <= effectiveLevel && isUnresolvedChoice(choice);
  const attention = (choice: EvaluatedChoice) =>
    unresolved(choice) ? (
      <span
        aria-label={`${choice.type} requires a selection`}
        className="detail-choice-attention"
        title={`${choice.type} requires a selection`}
      >
        <Icon name="circle-help" />
      </span>
    ) : null;
  const choiceEditor = (choice: EvaluatedChoice) => (
    <ChoiceEditor
      choice={choice}
      evaluation={evaluation!}
      build={build}
      entities={entities}
      byId={byId}
      disabled={false}
      selectionLabel={choice.type}
      rollbackRevision={rollbackRevision}
      onDispatch={onDispatch}
    />
  );

  return (
    <section
      aria-label="Character details"
      className="choice-pane character-details-pane"
    >
      {/* Its cards (deities) are long text: a wider detail pane. */}
      <div className="character-details-workspace is-wide-detail">
        <CandidateInspectionScope
          key={active ? "open" : "closed"}
          onInspect={setInspectedOption}
        >
          <div className="character-details-form">
            <section className="character-detail-group">
              <h4 className="selection-section-heading selection-section-heading--panel">
                Details
              </h4>
              <div className="character-detail-body">
                <div className="character-inline-fields">
                  {playerFields.map((field) => (
                    <CharacterTextField
                      key={field.name}
                      {...field}
                      inlineLabel
                      onDispatch={onDispatch}
                    />
                  ))}
                </div>
                {evaluation === undefined ? (
                  <p className="field-help">
                    Rules content is unavailable for gender, alignment, and
                    deity.
                  </p>
                ) : (
                  buttonChoices.map((choice) => (
                    <div
                      className={`character-detail-choice${unresolved(choice) ? " is-unresolved" : ""}`}
                      key={choice.id}
                    >
                      {choiceEditor(choice)}
                      {attention(choice)}
                      {deityAlignment !== undefined &&
                      choice.type.trim().toLocaleLowerCase() === "alignment" ? (
                        <p className="field-help deity-alignment-note">
                          {alignmentHouseRuled ? (
                            <span className="attention-badge">
                              <Icon name="house" /> House rule
                            </span>
                          ) : null}
                          <span>
                            As a {deityAlignment.classNames.join(" and ")}, your
                            alignment should match your deity's.{" "}
                            {deityAlignment.deityName} is{" "}
                            {deityAlignment.alignmentName}.
                          </span>
                        </p>
                      ) : null}
                    </div>
                  ))
                )}
                <div className="character-inline-fields">
                  {physicalFields.map((field) => (
                    <CharacterTextField
                      key={field.name}
                      {...field}
                      inlineLabel
                      onDispatch={onDispatch}
                    />
                  ))}
                </div>
              </div>
            </section>
            {evaluation === undefined
              ? null
              : tableChoices.map((choice) => {
                  const expanded = expandedTables.has(choice.id);
                  const pickedId = selectedDefinitionId(choice, evaluation);
                  const picked =
                    pickedId === undefined
                      ? undefined
                      : (byId.get(pickedId.toLocaleLowerCase())?.name ??
                        pickedId);
                  return (
                    <section
                      className={`character-detail-group${unresolved(choice) ? " is-unresolved" : ""}`}
                      key={choice.id}
                    >
                      <h4 className="selection-section-heading selection-section-heading--panel">
                        <button
                          aria-controls={`character-detail-table-${choice.id}`}
                          aria-expanded={expanded}
                          className="character-detail-toggle"
                          type="button"
                          onClick={() =>
                            setExpandedTables((current) => {
                              const next = new Set(current);
                              if (next.has(choice.id)) next.delete(choice.id);
                              else next.add(choice.id);
                              return next;
                            })
                          }
                        >
                          <Icon name="chevron" />
                          <span>{choice.type}</span>
                          <span className="character-detail-toggle-value">
                            {picked ?? "none chosen"}
                          </span>
                        </button>
                        {attention(choice)}
                      </h4>
                      {expanded ? (
                        <div
                          className="character-detail-body"
                          id={`character-detail-table-${choice.id}`}
                        >
                          {choiceEditor(choice)}
                        </div>
                      ) : null}
                    </section>
                  );
                })}
            <section className="character-detail-group">
              <h4 className="selection-section-heading selection-section-heading--panel">
                Notes
              </h4>
              {/* One note at a time; every field stays mounted (hidden when
                  not shown) so a pending edit still saves on a tab switch. */}
              <div
                aria-label="Notes"
                className="character-note-tabs"
                role="tablist"
              >
                {noteFields.map((field, index) => (
                  <button
                    aria-controls={`character-note-${index}`}
                    aria-selected={index === activeNote}
                    id={`character-note-tab-${index}`}
                    key={field.name}
                    role="tab"
                    tabIndex={index === activeNote ? 0 : -1}
                    title={field.label}
                    type="button"
                    onClick={() => setActiveNote(index)}
                    onKeyDown={(event) => {
                      const step =
                        event.key === "ArrowRight"
                          ? 1
                          : event.key === "ArrowLeft"
                            ? -1
                            : 0;
                      if (step === 0) return;
                      event.preventDefault();
                      const next =
                        (index + step + noteFields.length) % noteFields.length;
                      setActiveNote(next);
                      document
                        .getElementById(`character-note-tab-${next}`)
                        ?.focus();
                    }}
                  >
                    {field.tab}
                    {field.value.trim() === "" ? null : (
                      <>
                        <span
                          aria-hidden="true"
                          className="character-note-filled"
                        />
                        <span className="visually-hidden"> (has text)</span>
                      </>
                    )}
                  </button>
                ))}
              </div>
              {noteFields.map((field, index) => (
                <div
                  aria-labelledby={`character-note-tab-${index}`}
                  className="character-note-panel"
                  hidden={index !== activeNote}
                  id={`character-note-${index}`}
                  key={field.name}
                  role="tabpanel"
                >
                  <CharacterTextField
                    label={field.label}
                    multiline
                    name={field.name}
                    value={field.value}
                    visuallyHideLabel
                    onDispatch={onDispatch}
                  />
                </div>
              ))}
            </section>
          </div>
        </CandidateInspectionScope>
        {evaluation === undefined ? null : (
          <div className="shared-choice-detail">
            <CandidateDetail
              byId={byId}
              candidate={inspectedOption?.candidate}
              entity={inspectedOption?.entity}
              favoritable={inspectedOption?.favoritable === true}
            />
          </div>
        )}
      </div>
    </section>
  );
}
