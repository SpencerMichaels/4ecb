import { useEffect, useRef, useState } from "react";

import { Icon } from "./Icon";
import {
  LevelGrid,
  type LevelPickerEntry,
  type LevelPickerTier,
} from "./LevelPicker";

/**
 * Sets the character's current level from the Heroic / Paragon / Epic grid
 * (the Build tab's level plan). A momentous change, so a pick is confirmed
 * with the primary button rather than applied on click.
 */
export function SetLevelDialog({
  name,
  currentLevel,
  tiers,
  entries,
  onSet,
  onCancel,
}: {
  readonly name: string;
  readonly currentLevel: number;
  readonly tiers: readonly LevelPickerTier[];
  readonly entries: readonly LevelPickerEntry[];
  readonly onSet: (level: number) => void;
  readonly onCancel: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [chosen, setChosen] = useState(currentLevel);
  useEffect(() => {
    const current = dialog.current;
    if (current !== null && !current.open) current.showModal();
  }, []);
  return (
    <dialog
      aria-labelledby="set-level-title"
      className="set-level-dialog dialog-shell"
      ref={dialog}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <header>
        <h2 id="set-level-title">Set level</h2>
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
      <div className="set-level-body">
        <p>
          {name} is level {currentLevel}. If you lower the level, choices for
          the levels above it are kept as a plan.
        </p>
        <LevelGrid
          tiers={tiers}
          entries={entries}
          currentLevel={currentLevel}
          chosenLevel={chosen}
          onChoose={setChosen}
        />
      </div>
      <footer>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button
          className="button-primary"
          disabled={chosen === currentLevel}
          type="button"
          onClick={() => onSet(chosen)}
        >
          Set level {chosen}
        </button>
      </footer>
    </dialog>
  );
}
