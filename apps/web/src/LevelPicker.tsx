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
 * Level navigation for the builder sidebar. Switching levels is rare (most
 * play fills in the newest level), so the plan lives behind one button: a
 * tier-by-level grid that keeps each level's completion status.
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
  const byLevel = new Map(entries.map((entry) => [entry.level, entry]));
  const selected = byLevel.get(selectedLevel);

  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => {
      if (
        event instanceof KeyboardEvent
          ? event.key === "Escape"
          : !root.current?.contains(event.target as Node)
      )
        setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <div className="level-picker" ref={root}>
      <button
        aria-controls={panelId}
        aria-expanded={open}
        className="level-picker-toggle"
        disabled={disabled}
        title={
          selected === undefined
            ? undefined
            : `Level ${selectedLevel}: ${selected.statusLabel}`
        }
        type="button"
        onClick={() => setOpen((current) => !current)}
      >
        <span
          aria-hidden="true"
          className={`level-rail-status level-rail-${selected?.status ?? "future"}`}
        />
        <span>Level {selectedLevel}</span>
        <Icon name="chevron" />
      </button>
      {open ? (
        <div
          aria-label="Level plan"
          className="level-picker-panel"
          id={panelId}
          role="group"
        >
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
                        aria-current={
                          level === selectedLevel ? "step" : undefined
                        }
                        aria-label={`Level ${level}, ${label}`}
                        className={`level-rail-button level-rail-${status}`}
                        title={`Level ${level}: ${label}`}
                        type="button"
                        onClick={() => {
                          setOpen(false);
                          onSelect(level);
                        }}
                      >
                        <span>{level}</span>
                        <span
                          aria-hidden="true"
                          className="level-rail-status"
                        />
                      </button>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </div>
      ) : null}
    </div>
  );
}
