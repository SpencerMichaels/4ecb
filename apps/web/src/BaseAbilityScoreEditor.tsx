import { useEffect, useState } from "react";

import type { CharacterCommand, CharacterRecord } from "@4ecb/character-domain";
import type { ContentEntity } from "@4ecb/content-domain";
import {
  ABILITY_SCORE_NAMES,
  assessAbilityPointBuy,
  type EvaluatedCharacter,
  type EvaluatedChoice,
} from "@4ecb/rules-engine";

import {
  abilityScoreDisplay,
  pointBuyStepControl,
  raceAbilityScoreCells,
} from "./builder-ui";
import { KeyAbilitiesSummary, KeyAbilityName } from "./KeyAbilityMarker";

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

export function BaseAbilityScoreEditor({
  build,
  evaluation,
  pendingBonusDeltas,
  keyAbilities,
  keyAbilitiesSentence,
  race,
  raceAbilityChoice,
  raceAbilitySelectionId,
  byId,
  onRaceAbilitySelection,
  onDispatch,
}: {
  readonly build: CharacterRecord["build"];
  readonly evaluation: EvaluatedCharacter;
  readonly pendingBonusDeltas: Readonly<Record<string, number>>;
  readonly keyAbilities: readonly string[];
  readonly keyAbilitiesSentence: string | undefined;
  readonly race: ContentEntity | undefined;
  readonly raceAbilityChoice: EvaluatedChoice | undefined;
  readonly raceAbilitySelectionId: string | undefined;
  readonly byId: ReadonlyMap<string, ContentEntity>;
  readonly onRaceAbilitySelection: (
    choice: EvaluatedChoice,
    definitionId: string | undefined,
  ) => void;
  readonly onDispatch: (command: CharacterCommand) => void;
}) {
  const assessment = assessAbilityPointBuy(build.baseAbilities);
  const raceCells = raceAbilityScoreCells(race, raceAbilityChoice, byId);
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
          <h5 className="visually-hidden" id="base-abilities">
            Ability score point buy
          </h5>
          <KeyAbilitiesSummary sentence={keyAbilitiesSentence} />
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
        <div
          className="ability-point-buy-row ability-point-buy-header"
          aria-hidden="true"
        >
          <span className="ability-base ability-column-label">Base</span>
          <span className="ability-race ability-column-label">Race</span>
          <span className="ability-total ability-column-label">Total</span>
        </div>
        {ABILITY_SCORE_NAMES.map((ability) => {
          const value = build.baseAbilities[ability] ?? 10;
          const decrement = pointBuyStepControl(ability, value, "decrement");
          const increment = pointBuyStepControl(ability, value, "increment");
          const { total } = abilityScoreDisplay(
            evaluation,
            ability,
            value,
            pendingBonusDeltas[ability] ?? 0,
          );
          const raceCell = raceCells[ability];
          return (
            <div className="ability-point-buy-row" key={ability}>
              <KeyAbilityName
                className="ability-name"
                marked={keyAbilities.some(
                  (keyAbility) =>
                    keyAbility.toLocaleLowerCase() ===
                    ability.toLocaleLowerCase(),
                )}
              >
                {ability}
              </KeyAbilityName>
              <div className="ability-stepper">
                <button
                  aria-label={decrement.ariaLabel}
                  disabled={decrement.disabled}
                  title={decrement.title}
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
                  aria-label={increment.ariaLabel}
                  disabled={increment.disabled}
                  title={increment.title}
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
              <span className="ability-race">
                {raceCell.kind === "none" ? (
                  "—"
                ) : raceCell.kind === "static" ? (
                  raceCell.value > 0 ? (
                    `+${raceCell.value}`
                  ) : (
                    raceCell.value
                  )
                ) : (
                  <button
                    aria-label={`${ability} racial bonus (${raceCell.value > 0 ? "+" : ""}${raceCell.value})`}
                    aria-pressed={
                      raceAbilitySelectionId === raceCell.definitionId
                    }
                    className={`race-ability-choice${raceAbilitySelectionId === raceCell.definitionId ? " is-selected" : ""}`}
                    disabled={
                      raceAbilityChoice === undefined || !raceCell.selectable
                    }
                    type="button"
                    onClick={() => {
                      if (raceAbilityChoice === undefined) return;
                      onRaceAbilitySelection(
                        raceAbilityChoice,
                        raceAbilitySelectionId === raceCell.definitionId
                          ? undefined
                          : raceCell.definitionId,
                      );
                    }}
                  >
                    {raceCell.value > 0 ? `+${raceCell.value}` : raceCell.value}
                  </button>
                )}
              </span>
              <span className="ability-total">{total}</span>
            </div>
          );
        })}
      </div>
      <footer className="ability-point-buy-footer">
        <p>
          Raising 8–12 costs 1 point; 13–15 costs 2; 16 costs 3; and 17 costs 4.
          Only one score may start below 10.
        </p>
        <button
          aria-label="Reset ability scores to the default point-buy allocation"
          type="button"
          onClick={() => onDispatch(resetCommands)}
        >
          Reset
        </button>
      </footer>
    </section>
  );
}
