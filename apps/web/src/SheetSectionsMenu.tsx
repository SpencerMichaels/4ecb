import {
  useCallback,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
} from "react";

import type { SheetSectionId } from "@4ecb/character-domain";

import { Icon } from "./Icon";
import { SHEET_SECTION_LABELS } from "./sheet-edit-labels";
import { useDismissiblePopover } from "./use-dismissible-popover";

/** `order` with `section` moved to just before `before` (or to the end). */
function moved(
  order: readonly SheetSectionId[],
  section: SheetSectionId,
  before: SheetSectionId | undefined,
): SheetSectionId[] {
  const rest = order.filter((id) => id !== section);
  const index = before === undefined ? rest.length : rest.indexOf(before);
  return [...rest.slice(0, index), section, ...rest.slice(index)];
}

/**
 * Edit mode's "Sections" toolbar menu (D099): one row per sheet section in
 * print order, each with an ordinary checkbox (none locked). Rows reorder
 * by dragging, or with Alt+Up / Alt+Down on a focused row. Every change
 * saves at once and silently; the menu stays open for the next one.
 */
export function SheetSectionsMenu({
  hiddenSections,
  sectionOrder,
  onShowSection,
  onReorder,
}: {
  readonly hiddenSections: ReadonlySet<SheetSectionId>;
  readonly sectionOrder: readonly SheetSectionId[];
  readonly onShowSection: (section: SheetSectionId, shown: boolean) => void;
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
    onReorder(moved(sectionOrder, section, before));
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
              draggable
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
              onDragStart={(event) => {
                setDragged(section);
                if (event.dataTransfer) {
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", section);
                }
              }}
              onDrop={(event) => {
                event.preventDefault();
                if (dragged !== undefined && dragged !== section) {
                  const index = sectionOrder.indexOf(section);
                  const before = dropPosition(event)
                    ? sectionOrder[index + 1]
                    : section;
                  if (before !== dragged)
                    onReorder(moved(sectionOrder, dragged, before));
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
              <span aria-hidden="true" className="sheet-sections-handle">
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
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
