import type { CharacterRecord } from "@4ecb/character-domain";
import type { ContentEntity } from "@4ecb/content-domain";
import type { EvaluatedCharacter, EvaluatedChoice } from "@4ecb/rules-engine";

import {
  choicesAtLevel,
  choiceTitle,
  contextualTimelineChoiceTitle,
  groupOverviewChoices,
  isAbilityIncreaseChoiceType,
  isBuildPresetChoice,
  isCharacterDetailChoice,
  isCompanionOwnedChoice,
  isOptionalRetrainingChoice,
  isUnresolvedChoice,
  legacyChoiceSection,
  overviewPowerTone,
  overviewPowerType,
  selectedChoiceHasWarning,
  selectedOccurrence,
  type OverviewChoicePane,
} from "./builder-ui";
import { Icon } from "./Icon";
import { visualToneClass, type LegacyVisualTone } from "./visual-language";

const overviewPaneOrder = [
  "Character",
  "Ability Scores",
  "Companion",
  "Skills",
  "Powers",
  "Spellbook",
  "Feats",
  "Retraining",
  "Other",
] as const;

interface OverviewRetraining {
  readonly choice: EvaluatedChoice;
  readonly fromName: string;
  readonly toName: string;
  readonly selectedOccurrenceId: string;
}

export function CharacterOverview({
  build,
  evaluation,
  byId,
  selectedChoiceId,
  showPlanned,
  abilitySummary,
  abilityStatus,
  onShowPlannedChange,
  onNavigateChoice,
  onNavigateAbilities,
}: {
  readonly build: CharacterRecord["build"];
  readonly evaluation: EvaluatedCharacter | undefined;
  readonly byId: ReadonlyMap<string, ContentEntity>;
  readonly selectedChoiceId: string | undefined;
  readonly showPlanned: boolean;
  readonly abilitySummary: string;
  readonly abilityStatus: "complete" | "warning" | "unresolved";
  readonly onShowPlannedChange: (show: boolean) => void;
  readonly onNavigateChoice: (choice: EvaluatedChoice) => void;
  readonly onNavigateAbilities: () => void;
}) {
  if (evaluation === undefined)
    return <p className="overview-empty">Evaluating choices…</p>;

  const visibleChoices = build.levels.flatMap((frame) => {
    const planned = frame.level > build.effectiveLevel;
    return choicesAtLevel(frame.level, evaluation).filter(
      (choice) =>
        !isCharacterDetailChoice(choice) &&
        !isBuildPresetChoice(choice) &&
        !(
          ["Background", "Theme"].includes(legacyChoiceSection(choice)) &&
          choice.optional &&
          choice.selectedOccurrenceId === undefined
        ) &&
        (!isOptionalRetrainingChoice(choice) ||
          choice.selectedOccurrenceId !== undefined) &&
        (!planned ||
          (showPlanned && choice.selectedOccurrenceId !== undefined)),
    );
  });
  const occurrenceById = new Map(
    evaluation.occurrences.map((occurrence) => [occurrence.id, occurrence]),
  );
  const grouped = new Map(
    groupOverviewChoices(visibleChoices, (choice) => {
      if (isCompanionOwnedChoice(choice, occurrenceById, byId))
        return "Companion";
      if (
        choice.type.trim().toLocaleLowerCase() !== "replacement" ||
        isOptionalRetrainingChoice(choice)
      )
        return undefined;
      const replacedTypes = new Set(
        choice.replacementOptions?.flatMap((option) => {
          const type = byId
            .get(option.definitionId.toLocaleLowerCase())
            ?.type.trim()
            .toLocaleLowerCase();
          return type === undefined ? [] : [type];
        }) ?? [],
      );
      if (replacedTypes.size !== 1) return undefined;
      const [replacedType] = replacedTypes;
      if (replacedType === "power") return "Powers";
      if (replacedType === "feat") return "Feats";
      if (replacedType === "skill" || replacedType === "skill training")
        return "Skills";
      return undefined;
    }).map(({ pane, choices }) => [pane, choices]),
  );

  const selectedName = (choice: EvaluatedChoice) => {
    const selected = selectedOccurrence(choice, evaluation);
    return selected === undefined
      ? undefined
      : (byId.get(selected.definitionId.toLocaleLowerCase())?.name ??
          selected.definitionId);
  };
  const rowClass = (
    rowChoices: EvaluatedChoice | readonly EvaluatedChoice[],
    tone: LegacyVisualTone = "neutral",
  ) => {
    const choices = Array.isArray(rowChoices) ? rowChoices : [rowChoices];
    const planned = choices[0]!.level > build.effectiveLevel;
    const status = planned
      ? "planned"
      : choices.some((choice) => selectedChoiceHasWarning(choice, evaluation))
        ? "warning"
        : choices.some(isUnresolvedChoice)
          ? "unresolved"
          : "complete";
    return `overview-choice-${status} ${visualToneClass(tone)}`;
  };
  const choiceButton = (choice: EvaluatedChoice, label: string) => (
    <button
      aria-current={choice.id === selectedChoiceId ? "true" : undefined}
      aria-label={
        label === "—" ? `Open unresolved ${choiceTitle(choice)}` : undefined
      }
      type="button"
      onClick={() => onNavigateChoice(choice)}
    >
      {label}
    </button>
  );
  const selectedWithWarning = (choice: EvaluatedChoice, label: string) => (
    <>
      {selectedChoiceHasWarning(choice, evaluation) ? (
        <Icon name="warning" />
      ) : null}
      {label}
    </>
  );

  const abilityIncreaseGroups = new Map<string, EvaluatedChoice[]>();
  for (const choice of [
    ...(grouped.get("Ability Scores") ?? []),
    ...(grouped.get("Companion") ?? []),
  ]) {
    if (!isAbilityIncreaseChoiceType(choice.type)) continue;
    const companion = /^Companion\b/i.test(choice.type);
    const key = `${choice.level}:${companion ? "companion" : "character"}`;
    abilityIncreaseGroups.set(key, [
      ...(abilityIncreaseGroups.get(key) ?? []),
      choice,
    ]);
  }

  const retrainings = (grouped.get("Retraining") ?? []).flatMap(
    (choice): OverviewRetraining[] => {
      const selected = selectedOccurrence(choice, evaluation);
      if (selected?.replacesId === undefined) return [];
      const replacement = choice.replacementOptions?.find(
        (option) => option.replacesOccurrenceId === selected.replacesId,
      );
      if (replacement === undefined) return [];
      return [
        {
          choice,
          fromName:
            byId.get(replacement.definitionId.toLocaleLowerCase())?.name ??
            replacement.definitionId,
          toName:
            byId.get(selected.definitionId.toLocaleLowerCase())?.name ??
            selected.definitionId,
          selectedOccurrenceId: selected.id,
        },
      ];
    },
  );
  const retrainingByOccurrenceId = new Map<string, OverviewRetraining[]>();
  for (const retraining of retrainings)
    retrainingByOccurrenceId.set(retraining.selectedOccurrenceId, [
      ...(retrainingByOccurrenceId.get(retraining.selectedOccurrenceId) ?? []),
      retraining,
    ]);
  const retrainingMarkers = (choice: EvaluatedChoice) => {
    const occurrenceId = selectedOccurrence(choice, evaluation)?.id;
    if (occurrenceId === undefined) return null;
    return (retrainingByOccurrenceId.get(occurrenceId) ?? []).map(
      (retraining) => {
        const label = `Retrained from ${retraining.fromName} at level ${retraining.choice.level}`;
        return (
          <sup
            aria-label={label}
            className="overview-retraining-marker"
            key={retraining.choice.id}
            title={label}
          >
            R
          </sup>
        );
      },
    );
  };

  return (
    <aside aria-labelledby="timeline-heading" className="build-overview">
      <div className="timeline-heading">
        <h3 id="timeline-heading">Character overview</h3>
        <label className="overview-planned-toggle">
          <input
            checked={showPlanned}
            type="checkbox"
            onChange={(event) =>
              onShowPlannedChange(event.currentTarget.checked)
            }
          />
          Show planned choices
        </label>
      </div>
      <div className="overview-checklists">
        {overviewPaneOrder.map((pane: OverviewChoicePane) => {
          const choices = grouped.get(pane) ?? [];
          if (choices.length === 0 && pane !== "Ability Scores") return null;
          const showsLevel = pane !== "Character";
          const showsChoice = ![
            "Ability Scores",
            "Skills",
            "Feats",
            "Retraining",
          ].includes(pane);
          return (
            <section
              className={`overview-checklist-pane overview-pane-${pane.toLocaleLowerCase().replaceAll(" ", "-")}`}
              key={pane}
            >
              <h4 className="selection-section-heading selection-section-heading--compact">
                {pane}
              </h4>
              <div className="overview-checklist-scroll">
                <table>
                  <thead>
                    <tr>
                      {showsLevel ? <th scope="col">Level</th> : null}
                      {pane === "Retraining" ? (
                        <>
                          <th scope="col">From</th>
                          <th aria-label="to" scope="col">
                            →
                          </th>
                          <th scope="col">To</th>
                        </>
                      ) : showsChoice ? (
                        <th scope="col">
                          {pane === "Powers" ? "Type" : "Choice"}
                        </th>
                      ) : (
                        <th scope="col">
                          {pane === "Feats"
                            ? "Feat"
                            : pane === "Skills"
                              ? "Skill"
                              : "Selected"}
                        </th>
                      )}
                      {showsChoice && pane !== "Retraining" ? (
                        <th scope="col">
                          {pane === "Powers" ? "Power" : "Selected"}
                        </th>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody>
                    {pane === "Ability Scores" ? (
                      <tr
                        className={`overview-choice-${abilityStatus} tone-neutral`}
                      >
                        <td>1</td>
                        <td>
                          <button type="button" onClick={onNavigateAbilities}>
                            {abilitySummary}
                          </button>
                        </td>
                      </tr>
                    ) : null}
                    {pane === "Ability Scores"
                      ? [...abilityIncreaseGroups.values()]
                          .filter(
                            (increaseChoices) =>
                              !/^Companion\b/i.test(increaseChoices[0]!.type),
                          )
                          .map((increaseChoices) => {
                            const first = increaseChoices[0]!;
                            const values = increaseChoices.map(
                              (choice) => selectedName(choice) ?? "—",
                            );
                            return (
                              <tr
                                className={rowClass(increaseChoices)}
                                key={`ability-${first.id}`}
                              >
                                <td>{first.level}</td>
                                <td>
                                  {choiceButton(first, values.join(", "))}
                                </td>
                              </tr>
                            );
                          })
                      : null}
                    {pane === "Companion"
                      ? [...abilityIncreaseGroups.values()]
                          .filter((increaseChoices) =>
                            /^Companion\b/i.test(increaseChoices[0]!.type),
                          )
                          .map((increaseChoices) => {
                            const first = increaseChoices[0]!;
                            const values = increaseChoices.map(
                              (choice) => selectedName(choice) ?? "—",
                            );
                            return (
                              <tr
                                className={rowClass(increaseChoices)}
                                key={`ability-${first.id}`}
                              >
                                <td>{first.level}</td>
                                <td>{choiceButton(first, "Ability Scores")}</td>
                                <td>{values.join(", ")}</td>
                              </tr>
                            );
                          })
                      : null}
                    {choices
                      .filter(
                        (choice) =>
                          !["Ability Scores", "Companion"].includes(pane) ||
                          !isAbilityIncreaseChoiceType(choice.type),
                      )
                      .map((choice) => {
                        const planned = choice.level > build.effectiveLevel;
                        const value = selectedName(choice) ?? "—";
                        const powerTone =
                          pane === "Powers"
                            ? overviewPowerTone(choice, evaluation, byId)
                            : "neutral";
                        const displayValue = value;
                        const retraining =
                          pane === "Retraining"
                            ? retrainings.find(
                                (item) => item.choice.id === choice.id,
                              )
                            : undefined;
                        return (
                          <tr
                            className={rowClass(choice, powerTone)}
                            key={choice.id}
                          >
                            {showsLevel ? (
                              <td>
                                {choice.level}
                                {planned ? (
                                  <span className="visually-hidden">
                                    {" "}
                                    planned
                                  </span>
                                ) : null}
                              </td>
                            ) : null}
                            {pane === "Retraining" ? (
                              <>
                                <td>
                                  {choiceButton(
                                    choice,
                                    retraining?.fromName ?? "—",
                                  )}
                                </td>
                                <td
                                  aria-label="to"
                                  className="overview-retraining-arrow"
                                >
                                  →
                                </td>
                                <td>
                                  {choiceButton(
                                    choice,
                                    retraining?.toName ?? value,
                                  )}
                                </td>
                              </>
                            ) : showsChoice ? (
                              <td>
                                {choiceButton(
                                  choice,
                                  pane === "Powers"
                                    ? overviewPowerType(powerTone)
                                    : contextualTimelineChoiceTitle(
                                        choice,
                                        evaluation,
                                        byId,
                                      ),
                                )}
                              </td>
                            ) : null}
                            {pane === "Retraining" ? null : (
                              <td>
                                {showsChoice ? (
                                  selectedWithWarning(choice, displayValue)
                                ) : (
                                  <>{choiceButton(choice, displayValue)}</>
                                )}
                                {retrainingMarkers(choice)}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
      </div>
    </aside>
  );
}
