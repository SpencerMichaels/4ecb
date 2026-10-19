import { useEffect, useId, useRef, useState } from "react";

import { Icon } from "./Icon";

export interface LevelPickerTier {
  readonly id: string;
  readonly label: string;
  readonly firstLevel: number;
  readonly lastLevel: number;
}

export interface LevelPickerEntry {
  readonly level: number;
  /** Same status vocabulary as the former level rail (`level-rail-*`). */
  readonly status: string;
  readonly statusLabel: string;
}

/**
 * Level navigation for the Build tab. Switching levels is rare (most play
 * fills in the newest level), so the plan lives behind the "Level N ▾"
 * heading: a dropdown tier-by-level grid that keeps each level's status.
 */
export function LevelPicker({
  tiers,
  entries,
  selectedLevel,
  disabled = false,
  onSelect,
}: {
  readonly tiers: readonly LevelPickerTier[];
  readonly entries: readonly LevelPickerEntry[];
  readonly selectedLevel: number;
  readonly disabled?: boolean;
  readonly onSelect: (level: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    // Start keyboard users on the current level.
    root.current
      ?.querySelector<HTMLButtonElement>(
        '.level-picker-panel [aria-current="step"]',
      )
      ?.focus();
    const dismissOutside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const dismissWithEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("keydown", dismissWithEscape);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("keydown", dismissWithEscape);
    };
  }, [open]);

  return (
    <div className="level-picker" ref={root}>
      <h3 className="level-picker-heading">
        <button
          aria-controls={panelId}
          aria-expanded={open}
          aria-label={`Level ${selectedLevel}, change level`}
          className="level-picker-trigger"
          disabled={disabled}
          ref={trigger}
          title="Change level"
          type="button"
          onClick={() => setOpen((current) => !current)}
        >
          <span>Level {selectedLevel}</span>
          <Icon name="chevron" />
        </button>
      </h3>
      {!open ? null : (
        <div
          aria-label="Level plan"
          className="level-picker-panel"
          id={panelId}
          role="group"
        >
          <LevelGrid
            tiers={tiers}
            entries={entries}
            currentLevel={selectedLevel}
            onChoose={(level) => {
              setOpen(false);
              onSelect(level);
            }}
          />
        </div>
      )}
    </div>
  );
}

/**
 * The tier-by-level grid (Heroic / Paragon / Epic) with each level's plan
 * status, shared by the Build tab's level picker and the Set level dialog.
 * `currentLevel` is marked as the current step; `chosenLevel`, when given,
 * is the pending pick.
 */
export function LevelGrid({
  tiers,
  entries,
  currentLevel,
  chosenLevel,
  onChoose,
}: {
  readonly tiers: readonly LevelPickerTier[];
  readonly entries: readonly LevelPickerEntry[];
  readonly currentLevel: number;
  readonly chosenLevel?: number;
  readonly onChoose: (level: number) => void;
}) {
  const byLevel = new Map(entries.map((entry) => [entry.level, entry]));
  return (
    <div className="level-grid">
      {tiers.map((tier) => (
        <section className="level-picker-tier" key={tier.id}>
          <h4>{tier.label}</h4>
          <ol>
            {Array.from(
              { length: tier.lastLevel - tier.firstLevel + 1 },
              (_, index) => tier.firstLevel + index,
            ).map((level) => {
              const entry = byLevel.get(level);
              const status = entry?.status ?? "future";
              const label = entry?.statusLabel ?? "no choices made";
              return (
                <li key={level}>
                  <button
                    aria-current={level === currentLevel ? "step" : undefined}
                    {...(chosenLevel === undefined
                      ? {}
                      : { "aria-pressed": level === chosenLevel })}
                    aria-label={`Level ${level}, ${label}`}
                    className={`level-rail-button level-rail-${status}`}
                    title={`Level ${level}: ${label}`}
                    type="button"
                    onClick={() => onChoose(level)}
                  >
                    <span>{level}</span>
                    <span aria-hidden="true" className="level-rail-status" />
                  </button>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
