import { useEffect, useRef, useState } from "react";

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
 * play fills in the newest level), so the plan lives behind the Build tab's
 * "Level N" heading: a modal tier-by-level grid keeping each level's status.
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
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const byLevel = new Map(entries.map((entry) => [entry.level, entry]));

  useEffect(() => {
    const current = dialog.current;
    if (open && current !== null && !current.open) current.showModal();
  }, [open]);

  const close = () => {
    dialog.current?.close();
    setOpen(false);
    trigger.current?.focus();
  };

  return (
    <>
      <h3 className="level-picker-heading">
        <button
          aria-haspopup="dialog"
          aria-label={`Level ${selectedLevel}, change level`}
          className="level-picker-trigger"
          disabled={disabled}
          ref={trigger}
          title="Change level"
          type="button"
          onClick={() => setOpen(true)}
        >
          <span>Level {selectedLevel}</span>
          <Icon name="chevron" />
        </button>
      </h3>
      {!open ? null : (
        <dialog
          aria-labelledby="level-picker-title"
          className="level-picker-dialog dialog-shell dialog-shell--branded"
          ref={dialog}
          onCancel={(event) => {
            event.preventDefault();
            close();
          }}
          onClick={(event) => {
            // A click on the backdrop lands on the dialog element itself.
            if (event.target === event.currentTarget) close();
          }}
        >
          <header>
            <div>
              <p className="eyebrow">Level plan</p>
              <h2 id="level-picker-title">Choose a level</h2>
            </div>
            <button
              aria-label="Close level plan"
              className="button-icon dialog-close"
              type="button"
              onClick={close}
            >
              <Icon name="remove" />
            </button>
          </header>
          <div className="level-picker-body">
            {tiers.map((tier) => (
              <section className="level-picker-tier" key={tier.id}>
                <h3>{tier.label}</h3>
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
                            close();
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
        </dialog>
      )}
    </>
  );
}
