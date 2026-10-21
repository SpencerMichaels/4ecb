import { useRef, type KeyboardEvent, type MouseEvent } from "react";

import type { CharacterLibraryEntry } from "@4ecb/browser-storage";

import { Icon } from "./Icon";
import { PortraitImage } from "./PortraitEditor";
import type { LibrarySort, LibrarySortColumn } from "./character-library-ui";
import { exactDateTime, relativeDay } from "./relative-time";

export function characterEditHref(id: string): string {
  return `#/characters/${encodeURIComponent(id)}/edit`;
}

const COLUMNS: readonly {
  readonly column: LibrarySortColumn;
  readonly label: string;
  readonly short?: string;
  readonly className?: string;
}[] = [
  { column: "name", label: "Name", className: "library-col-name" },
  {
    column: "level",
    label: "Level",
    short: "Lvl",
    className: "library-col-level",
  },
  { column: "race", label: "Race", className: "library-col-race" },
  { column: "class", label: "Class" },
  { column: "edited", label: "Edited", className: "library-col-edited" },
];

/** "today" -> "Today", for a table cell that starts a sentence of its own. */
function capitalized(text: string): string {
  return text.charAt(0).toLocaleUpperCase() + text.slice(1);
}

/**
 * The Characters page's table: sortable, filterable, one row per character.
 * A click (or the arrow keys on the focused name) selects a row for the
 * detail pane; Enter or a double-click opens the builder. Each name is a
 * real link to the builder, so middle-click and "open in new tab" work;
 * only the selected row's link is in the tab order (roving focus).
 */
export function CharacterLibraryTable({
  characters,
  totalCount,
  filter,
  sort,
  selectedId,
  updateIds,
  now,
  onFilterChange,
  onSortChange,
  onSelect,
}: {
  /** Already filtered and sorted. */
  readonly characters: readonly CharacterLibraryEntry[];
  /** Characters in the library before filtering. */
  readonly totalCount: number;
  readonly filter: string;
  readonly sort: LibrarySort;
  readonly selectedId: string | undefined;
  /** Characters with a content update waiting. */
  readonly updateIds: ReadonlySet<string>;
  readonly now: Date;
  readonly onFilterChange: (filter: string) => void;
  readonly onSortChange: (column: LibrarySortColumn) => void;
  readonly onSelect: (id: string) => void;
}) {
  const filterInput = useRef<HTMLInputElement>(null);
  const body = useRef<HTMLTableSectionElement>(null);
  // The one row in the tab order: the selection while it is listed, else the
  // first row.
  const focusId = characters.some(({ id }) => id === selectedId)
    ? selectedId
    : characters[0]?.id;

  const moveSelection = (event: KeyboardEvent, index: number): void => {
    const target =
      event.key === "ArrowDown"
        ? index + 1
        : event.key === "ArrowUp"
          ? index - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? characters.length - 1
              : undefined;
    if (target === undefined) return;
    event.preventDefault();
    const next =
      characters[Math.max(0, Math.min(characters.length - 1, target))];
    if (next === undefined) return;
    onSelect(next.id);
    body.current
      ?.querySelector<HTMLElement>(
        `[data-library-row="${CSS.escape(next.id)}"] .library-table-name a`,
      )
      ?.focus();
  };

  return (
    <section aria-label="Characters" className="library-table-column">
      <div className="selection-table-toolbar library-table-toolbar">
        <div className="selection-table-search">
          <label>
            <span className="visually-hidden">Filter characters</span>
            <input
              placeholder="Filter by name, race or class"
              ref={filterInput}
              type="search"
              value={filter}
              onChange={(event) => onFilterChange(event.currentTarget.value)}
            />
          </label>
          {filter === "" ? null : (
            <button
              aria-label="Clear filter"
              className="selection-table-search-clear"
              title="Clear filter"
              type="button"
              onClick={() => {
                onFilterChange("");
                filterInput.current?.focus();
              }}
            >
              <Icon name="remove" />
            </button>
          )}
        </div>
      </div>
      <div className="selection-table-scroll library-table-scroll">
        <table className="library-table">
          <thead>
            <tr>
              <th className="library-col-portrait" scope="col">
                <span className="visually-hidden">Portrait</span>
              </th>
              {COLUMNS.map(({ column, label, short, className }) => {
                const active = sort.column === column;
                return (
                  <th
                    aria-sort={active ? sort.direction : "none"}
                    className={className}
                    key={column}
                    scope="col"
                  >
                    <button
                      aria-label={`Sort by ${label}`}
                      className="selection-sort-button"
                      type="button"
                      onClick={() => onSortChange(column)}
                    >
                      {short === undefined ? (
                        label
                      ) : (
                        <abbr title={label}>{short}</abbr>
                      )}
                      <Icon name="chevron" />
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody ref={body}>
            {characters.length === 0 ? (
              <tr className="library-table-empty">
                <td colSpan={COLUMNS.length + 1}>
                  {totalCount === 0
                    ? "No characters yet."
                    : `No characters match “${filter.trim()}”.`}
                </td>
              </tr>
            ) : (
              characters.map((character, index) => {
                const selected = character.id === selectedId;
                const edited = relativeDay(character.updatedAt, now);
                const href = characterEditHref(character.id);
                return (
                  <tr
                    className={`selection-candidate-row${selected ? " selection-row-selected" : ""}`}
                    data-library-row={character.id}
                    key={character.id}
                    title="Click to preview; double-click to open the builder"
                    onClick={() => onSelect(character.id)}
                    onDoubleClick={() => {
                      window.location.hash = href;
                    }}
                    onMouseDown={(event) => {
                      // A double-click opens the row, not a word of its text.
                      if (event.detail > 1) event.preventDefault();
                    }}
                  >
                    <td className="library-col-portrait">
                      <span aria-hidden="true">
                        <PortraitImage
                          className="library-table-portrait"
                          name={character.title}
                          portrait={
                            character.renderedPortraitDataUrl === undefined
                              ? undefined
                              : {
                                  renderedDataUrl:
                                    character.renderedPortraitDataUrl,
                                }
                          }
                        />
                      </span>
                    </td>
                    <td className="library-col-name">
                      <span className="library-table-name">
                        <a
                          aria-current={selected || undefined}
                          aria-description="Arrow keys choose a character to preview. Enter opens the builder."
                          href={href}
                          tabIndex={character.id === focusId ? 0 : -1}
                          onClick={(event: MouseEvent) => {
                            // A plain click selects (the row handles it); a
                            // keyboard Enter (detail 0) or a modified click
                            // follows the link.
                            if (
                              event.detail > 0 &&
                              event.button === 0 &&
                              !event.ctrlKey &&
                              !event.metaKey &&
                              !event.shiftKey &&
                              !event.altKey
                            )
                              event.preventDefault();
                          }}
                          onFocus={() => {
                            if (!selected) onSelect(character.id);
                          }}
                          onKeyDown={(event) => moveSelection(event, index)}
                        >
                          {character.title}
                        </a>
                        {updateIds.has(character.id) ? (
                          <span
                            className="library-update-badge"
                            title="Game content has been updated. Open the character to review it."
                          >
                            Update
                          </span>
                        ) : null}
                      </span>
                    </td>
                    <td className="library-col-level">
                      {character.effectiveLevel}
                    </td>
                    <td className="library-col-race">{character.race}</td>
                    <td>{character.className}</td>
                    <td
                      className="library-col-edited"
                      title={exactDateTime(character.updatedAt)}
                    >
                      {edited === undefined ? null : capitalized(edited)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
