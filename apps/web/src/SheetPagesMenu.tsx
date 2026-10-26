import { useCallback, useId, useRef, useState } from "react";

import { SHEET_SECTION_IDS, type SheetSectionId } from "@4ecb/character-domain";

import { Icon } from "./Icon";
import { SHEET_SECTION_LABELS } from "./sheet-edit-labels";
import { useDismissiblePopover } from "./use-dismissible-popover";

/**
 * Edit mode's "Pages" toolbar menu (D099): one checkbox per sheet section,
 * page 1 summary included, in print order. Toggling saves at once and
 * silently; the menu stays open for the next pick.
 */
export function SheetPagesMenu({
  hiddenSections,
  onShowSection,
}: {
  readonly hiddenSections: ReadonlySet<SheetSectionId>;
  readonly onShowSection: (section: SheetSectionId, shown: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismissiblePopover({
    open,
    close,
    root,
    trigger,
    focusSelector: ".sheet-pages-menu input",
  });
  return (
    <div className="action-menu sheet-pages" ref={root}>
      <button
        aria-controls={menuId}
        aria-expanded={open}
        className="sheet-pages-trigger"
        ref={trigger}
        type="button"
        onClick={() => setOpen((current) => !current)}
      >
        <Icon name="sheet" />
        <span>Pages</span>
      </button>
      {open ? (
        <div
          aria-label="Pages to print"
          className="action-menu-options sheet-pages-menu"
          id={menuId}
          role="group"
        >
          {SHEET_SECTION_IDS.map((section) => (
            <label key={section}>
              <input
                checked={!hiddenSections.has(section)}
                type="checkbox"
                onChange={(event) =>
                  onShowSection(section, event.currentTarget.checked)
                }
              />
              <span>{SHEET_SECTION_LABELS[section]}</span>
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}
