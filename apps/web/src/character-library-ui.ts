import type { CharacterMetadata } from "@4ecb/browser-storage";
import type { ContentPackManifest } from "@4ecb/content-pack";

import {
  resolvedBoundProfile,
  shouldShowBoundProfileWarning,
} from "./bound-profile-resolution";
import { needsContentUpdate } from "./content-update";

/** "Level N Race Class": the identity line under a character's name in the
 *  library and the trash. */
export function characterIdentity(
  character: Pick<CharacterMetadata, "effectiveLevel" | "race" | "className">,
): string {
  return [
    `Level ${character.effectiveLevel}`,
    character.race,
    character.className,
  ]
    .filter(Boolean)
    .join(" ");
}

/** Trashed characters, most recently trashed first (ISO timestamps sort as
 *  text); any without a trash time go last. */
export function trashOrder<T extends Pick<CharacterMetadata, "deletedAt">>(
  characters: readonly T[],
): T[] {
  return [...characters].sort((a, b) =>
    (b.deletedAt ?? "").localeCompare(a.deletedAt ?? ""),
  );
}

/** "1 character" / "N characters". */
export function characterCount(count: number): string {
  return `${count} ${count === 1 ? "character" : "characters"}`;
}

/** The library table's sortable columns. */
export type LibrarySortColumn = "name" | "level" | "race" | "class" | "edited";

export interface LibrarySort {
  readonly column: LibrarySortColumn;
  readonly direction: "ascending" | "descending";
}

/** Edited, newest first: the order the library has always listed in. */
export const DEFAULT_LIBRARY_SORT: LibrarySort = {
  column: "edited",
  direction: "descending",
};

const LIBRARY_SORT_COLUMNS: readonly LibrarySortColumn[] = [
  "name",
  "level",
  "race",
  "class",
  "edited",
];

/** A header click: the active column flips direction; another column starts
 *  ascending, except Edited, which starts newest first. */
export function nextLibrarySort(
  current: LibrarySort,
  column: LibrarySortColumn,
): LibrarySort {
  if (current.column === column)
    return {
      column,
      direction: current.direction === "ascending" ? "descending" : "ascending",
    };
  return {
    column,
    direction: column === "edited" ? "descending" : "ascending",
  };
}

type LibraryRow = Pick<
  CharacterMetadata,
  "id" | "title" | "effectiveLevel" | "race" | "className" | "updatedAt"
>;

const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

/** Sorts the library table. Characters without a race or class sort after
 *  the rest in either direction; ties fall back to name, then id, so the
 *  order is stable. */
export function sortLibrary<T extends LibraryRow>(
  characters: readonly T[],
  sort: LibrarySort,
): T[] {
  const sign = sort.direction === "ascending" ? 1 : -1;
  const text = (character: T): string | undefined =>
    sort.column === "race"
      ? character.race
      : sort.column === "class"
        ? character.className
        : undefined;
  return [...characters].sort((a, b) => {
    let order = 0;
    if (sort.column === "level")
      order = (a.effectiveLevel - b.effectiveLevel) * sign;
    else if (sort.column === "edited")
      order = a.updatedAt.localeCompare(b.updatedAt) * sign;
    else if (sort.column === "name")
      order = collator.compare(a.title, b.title) * sign;
    else {
      const left = text(a);
      const right = text(b);
      if (left === undefined || right === undefined)
        order = left === right ? 0 : left === undefined ? 1 : -1;
      else order = collator.compare(left, right) * sign;
    }
    return (
      order || collator.compare(a.title, b.title) || a.id.localeCompare(b.id)
    );
  });
}

/** The filter box matches name, race and class, ignoring case. */
export function filterLibrary<T extends LibraryRow>(
  characters: readonly T[],
  filter: string,
): T[] {
  const wanted = filter.trim().toLocaleLowerCase();
  if (wanted === "") return [...characters];
  return characters.filter((character) =>
    [character.title, character.race, character.className]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase()
      .includes(wanted),
  );
}

/** The row to show in the detail pane: the remembered one while it is still
 *  in the library (even when the filter hides it), otherwise the first
 *  listed row, or the library's first when the filter matches nothing. */
export function librarySelection(
  library: readonly Pick<CharacterMetadata, "id">[],
  listed: readonly Pick<CharacterMetadata, "id">[],
  rememberedId: string | undefined,
): string | undefined {
  return library.some(({ id }) => id === rememberedId)
    ? rememberedId
    : (listed[0]?.id ?? library[0]?.id);
}

export const LIBRARY_VIEW_STORAGE_KEY = "4ecb.libraryView.v1";

export interface LibraryView {
  readonly sort: LibrarySort;
  readonly selectedId?: string;
}

/** The remembered sort and selection; anything unreadable (private window,
 *  blocked storage, an older shape) falls back to the default. */
export function readLibraryView(
  storage?: Pick<Storage, "getItem">,
): LibraryView {
  try {
    const raw = (storage ?? window.localStorage).getItem(
      LIBRARY_VIEW_STORAGE_KEY,
    );
    if (raw === null) return { sort: DEFAULT_LIBRARY_SORT };
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null)
      return { sort: DEFAULT_LIBRARY_SORT };
    const { sort, selectedId } = value as Record<string, unknown>;
    const column = (sort as Record<string, unknown> | undefined)?.column;
    const direction = (sort as Record<string, unknown> | undefined)?.direction;
    return {
      sort:
        LIBRARY_SORT_COLUMNS.includes(column as LibrarySortColumn) &&
        (direction === "ascending" || direction === "descending")
          ? { column: column as LibrarySortColumn, direction }
          : DEFAULT_LIBRARY_SORT,
      ...(typeof selectedId === "string" ? { selectedId } : {}),
    };
  } catch {
    return { sort: DEFAULT_LIBRARY_SORT };
  }
}

export function writeLibraryView(
  view: LibraryView,
  storage?: Pick<Storage, "setItem">,
): void {
  try {
    (storage ?? window.localStorage).setItem(
      LIBRARY_VIEW_STORAGE_KEY,
      JSON.stringify(view),
    );
  } catch {
    // Remembering the view is a convenience; blocked storage just forgets it.
  }
}

/** Whether the library should flag a waiting content update: the same
 *  `update` issue the builder raises (contentUpdateIssue), and not when the
 *  pinned content is missing, which the builder reports as an error
 *  instead. */
export function libraryNeedsContentUpdate(
  character: Pick<CharacterMetadata, "contentRevision">,
  installed: readonly ContentPackManifest[],
  activePackId: string | undefined,
): boolean {
  const binding = character.contentRevision;
  if (binding === undefined) return false;
  const pinned = installed.find(({ packId }) => packId === binding.packId);
  if (
    shouldShowBoundProfileWarning(
      resolvedBoundProfile(binding, pinned?.contentDigest),
    )
  )
    return false;
  return needsContentUpdate(
    binding,
    installed.find(({ packId }) => packId === activePackId),
  );
}
