import { useEffect, useRef, useState } from "react";

import type { CharacterCommand, CharacterRecord } from "@4ecb/character-domain";
import type { ContentEntity } from "@4ecb/content-domain";
import type { EvaluatedCharacter, EvaluatedChoice } from "@4ecb/rules-engine";

import {
  choiceSelectionTableKind,
  isUnresolvedChoice,
  MAX_CHARACTER_LEVEL,
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
  onDispatch,
}: {
  readonly name: string;
  readonly label: string;
  readonly value: string;
  readonly multiline?: boolean;
  readonly className?: string;
  readonly visuallyHideLabel?: boolean;
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
    <label className={className}>
      <span className={visuallyHideLabel ? "visually-hidden" : undefined}>
        {label}
      </span>
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

export function CharacterDetailsEditor({
  active,
  choices,
  evaluation,
  build,
  snapshotDetails,
  characterTitle,
  entities,
  byId,
  rollbackRevision,
  effectiveLevel,
  forcedAlignment,
  onLevelChange,
  onDispatch,
}: {
  readonly active: boolean;
  readonly choices: readonly EvaluatedChoice[];
  readonly evaluation: EvaluatedCharacter | undefined;
  readonly build: CharacterRecord["build"];
  readonly snapshotDetails: Readonly<Record<string, string>>;
  readonly characterTitle: string;
  readonly entities: readonly ContentEntity[];
  readonly byId: ReadonlyMap<string, ContentEntity>;
  readonly rollbackRevision: number;
  readonly effectiveLevel: number;
  readonly forcedAlignment:
    | {
        readonly classNames: readonly string[];
        readonly deityName: string;
        readonly alignmentName: string;
      }
    | undefined;
  readonly onLevelChange: (level: number) => void;
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
            <h4 className="selection-section-heading selection-section-heading--panel">
              Identity
            </h4>
            <div className="character-detail-fields character-detail-fields-compact">
              <label>
                Current level
                <select
                  aria-label="Current level"
                  value={effectiveLevel}
                  onChange={(event) =>
                    onLevelChange(Number(event.currentTarget.value))
                  }
                >
                  {Array.from({ length: MAX_CHARACTER_LEVEL }, (_, index) => (
                    <option key={index + 1} value={index + 1}>
                      {index + 1}
                    </option>
                  ))}
                </select>
              </label>
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
            <h4 className="selection-section-heading selection-section-heading--panel">
              Personal details
            </h4>
            {evaluation === undefined ? (
              <p className="field-help">
                Rules content is unavailable for gender, alignment, and deity.
              </p>
            ) : (
              <CandidateInspectionScope
                key={active ? "open" : "closed"}
                onInspect={setInspectedOption}
              >
                <div className="compact-detail-list">
                  {choices.map((choice) => {
                    const alignmentLocked =
                      forcedAlignment !== undefined &&
                      choice.type.trim().toLocaleLowerCase() === "alignment";
                    const tableChoice =
                      choiceSelectionTableKind(choice) !== undefined;
                    const unresolved =
                      choice.level <= effectiveLevel &&
                      isUnresolvedChoice(choice);
                    const unresolvedLabel = `${choice.type} requires a selection`;
                    return (
                      <div
                        className={`compact-detail-row${tableChoice ? " has-choice-heading" : ""}${unresolved ? " is-unresolved" : ""}`}
                        key={choice.id}
                      >
                        {tableChoice ? (
                          <div className="character-detail-choice-heading">
                            <h5 className="selection-subsection-heading">
                              {choice.type}
                            </h5>
                            {unresolved ? (
                              <span
                                aria-label={unresolvedLabel}
                                className="detail-choice-attention"
                                title={unresolvedLabel}
                              >
                                <Icon name="circle-help" />
                              </span>
                            ) : null}
                          </div>
                        ) : unresolved ? (
                          <span
                            aria-label={unresolvedLabel}
                            className="detail-choice-attention"
                            title={unresolvedLabel}
                          >
                            <Icon name="circle-help" />
                          </span>
                        ) : null}
                        <ChoiceEditor
                          choice={choice}
                          evaluation={evaluation}
                          build={build}
                          entities={entities}
                          byId={byId}
                          disabled={alignmentLocked}
                          {...(alignmentLocked
                            ? { selectedIcon: "lock" as const }
                            : {})}
                          selectionLabel={choice.type}
                          rollbackRevision={rollbackRevision}
                          onDispatch={onDispatch}
                        />
                        {alignmentLocked ? (
                          <p className="field-help deity-alignment-note">
                            As a {forcedAlignment.classNames.join(" and ")},
                            your alignment must match your deity's.{" "}
                            {forcedAlignment.deityName} is{" "}
                            {forcedAlignment.alignmentName}.
                          </p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </CandidateInspectionScope>
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
            <h4 className="selection-section-heading selection-section-heading--panel">
              Character information
            </h4>
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
              byId={byId}
              candidate={inspectedOption?.candidate}
              entity={inspectedOption?.entity}
            />
          </div>
        )}
      </div>
    </section>
  );
}
