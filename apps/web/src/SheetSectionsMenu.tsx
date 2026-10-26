import {
  useCallback,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
} from "react";

import {
  isSheetCopyableSection,
  type SheetCopyableSectionId,
  type SheetSectionId,
} from "@4ecb/character-domain";

import { Icon } from "./Icon";
import { SHEET_SECTION_LABELS } from "./sheet-edit-labels";
import { movedBefore } from "./SheetEditTarget";
import { useDismissiblePopover } from "./use-dismissible-popover";

/**
 * Edit mode's "Sections" toolbar menu (D099): one row per sheet section in
 * print order, each with an ordinary checkbox (none locked). Rows reorder
 * by dragging their grip, or with Alt+Up / Alt+Down on a focused row; the
 * scratchpad and session notes rows also set how many copies print. Every
 * change saves at once and silently; the menu stays open for the next one.
 */
export function SheetSectionsMenu({
  hiddenSections,
  sectionOrder,
  sectionCopies,
  onShowSection,
  onCopies,
  onReorder,
}: {
  readonly hiddenSections: ReadonlySet<SheetSectionId>;
  readonly sectionOrder: readonly SheetSectionId[];
  readonly sectionCopies: Readonly<Record<SheetCopyableSectionId, number>>;
  readonly onShowSection: (section: SheetSectionId, shown: boolean) => void;
  readonly onCopies: (section: SheetCopyableSectionId, count: number) => void;
  readonly onReorder: (order: readonly SheetSectionId[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const hintId = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismissiblePopover({
    open,
    close,
    root,
    trigger,
    focusSelector: ".sheet-sections-menu input",
  });
  const [dragged, setDragged] = useState<SheetSectionId>();
  const [drop, setDrop] = useState<{
    readonly section: SheetSectionId;
    readonly after: boolean;
  }>();
  // A row moved from the keyboard keeps focus once React has moved it.
  const [refocus, setRefocus] = useState<SheetSectionId>();
  useLayoutEffect(() => {
    if (refocus === undefined) return;
    root.current
      ?.querySelector<HTMLInputElement>(
        `.sheet-sections-row[data-section="${refocus}"] input`,
      )
      ?.focus();
    setRefocus(undefined);
  }, [refocus]);

  const endDrag = () => {
    setDragged(undefined);
    setDrop(undefined);
  };
  const dropPosition = (event: ReactDragEvent<HTMLElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    return event.clientY > box.top + box.height / 2;
  };
  const moveBy = (section: SheetSectionId, step: -1 | 1) => {
    const index = sectionOrder.indexOf(section);
    const target = index + step;
    if (target < 0 || target >= sectionOrder.length) return;
    const before = step < 0 ? sectionOrder[target] : sectionOrder[target + 1];
    onReorder(movedBefore(sectionOrder, section, before));
    setRefocus(section);
  };

  return (
    <div className="action-menu sheet-sections" ref={root}>
      <button
        aria-controls={menuId}
        aria-expanded={open}
        className="sheet-sections-trigger"
        ref={trigger}
        type="button"
        onClick={() => setOpen((current) => !current)}
      >
        <Icon name="sheet" />
        <span>Sections</span>
      </button>
      {open ? (
        <div
          aria-describedby={hintId}
          aria-label="Sections to print"
          className="action-menu-options sheet-sections-menu"
          id={menuId}
          role="group"
        >
          <span className="visually-hidden" id={hintId}>
            Drag a row, or press Alt+Up or Alt+Down on it, to change the print
            order.
          </span>
          {sectionOrder.map((section) => (
            <div
              className="sheet-sections-row"
              data-dragging={dragged === section || undefined}
              data-drop={
                drop?.section === section
                  ? drop.after
                    ? "after"
                    : "before"
                  : undefined
              }
              data-section={section}
              key={section}
              onDragEnd={endDrag}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node))
                  setDrop((current) =>
                    current?.section === section ? undefined : current,
                  );
              }}
              onDragOver={(event) => {
                if (dragged === undefined) return;
                event.preventDefault();
                if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
                const after = dropPosition(event);
                setDrop((current) =>
                  current?.section === section && current.after === after
                    ? current
                    : { section, after },
                );
              }}
              onDrop={(event) => {
                event.preventDefault();
                if (dragged !== undefined && dragged !== section) {
                  const index = sectionOrder.indexOf(section);
                  const before = dropPosition(event)
                    ? sectionOrder[index + 1]
                    : section;
                  if (before !== dragged)
                    onReorder(movedBefore(sectionOrder, dragged, before));
                }
                endDrag();
              }}
              onKeyDown={(event) => {
                if (
                  !event.altKey ||
                  (event.key !== "ArrowUp" && event.key !== "ArrowDown")
                )
                  return;
                event.preventDefault();
                moveBy(section, event.key === "ArrowUp" ? -1 : 1);
              }}
            >
              {/* Only the grip drags (the whole row as its image), so the
                  checkbox and copies field keep ordinary pointer input. */}
              <span
                aria-hidden="true"
                className="sheet-sections-handle"
                draggable
                onDragStart={(event) => {
                  setDragged(section);
                  const row = event.currentTarget.closest(
                    ".sheet-sections-row",
                  );
                  if (event.dataTransfer) {
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", section);
                    if (row) event.dataTransfer.setDragImage(row, 12, 12);
                  }
                }}
              >
                <Icon name="grip" />
              </span>
              <label>
                <input
                  checked={!hiddenSections.has(section)}
                  type="checkbox"
                  onChange={(event) =>
                    onShowSection(section, event.currentTarget.checked)
                  }
                />
                <span>{SHEET_SECTION_LABELS[section]}</span>
              </label>
              {isSheetCopyableSection(section) ? (
                <CopiesStepper
                  count={sectionCopies[section]}
                  label={SHEET_SECTION_LABELS[section]}
                  onChange={(count) => onCopies(section, count)}
                />
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * A compact copies field: − and + buttons around a number. At least 1 (the
 * row's checkbox prints none); a typed whole number saves at once, and
 * anything else reverts to the saved count when the field loses focus.
 */
function CopiesStepper({
  count,
  label,
  onChange,
}: {
  readonly count: number;
  readonly label: string;
  readonly onChange: (count: number) => void;
}) {
  const [draft, setDraft] = useState<string>();
  return (
    <span className="sheet-sections-copies">
      <button
        aria-label={`Fewer copies of ${label}`}
        disabled={count <= 1}
        title={`Fewer copies of ${label}`}
        type="button"
        onClick={() => onChange(count - 1)}
      >
        −
      </button>
      <input
        aria-label={`Copies of ${label}`}
        inputMode="numeric"
        min={1}
        step={1}
        type="number"
        value={draft ?? String(count)}
        onBlur={() => setDraft(undefined)}
        onChange={(event) => {
          const text = event.currentTarget.value;
          setDraft(text);
          if (/^\d+$/.test(text) && Number(text) >= 1) onChange(Number(text));
        }}
      />
      <button
        aria-label={`More copies of ${label}`}
        title={`More copies of ${label}`}
        type="button"
        onClick={() => onChange(count + 1)}
      >
        +
      </button>
    </span>
  );
}
