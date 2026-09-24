import {
  createContext,
  Fragment,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import type { ContentEntity } from "@4ecb/content-domain";
import type { CandidateDecision } from "@4ecb/rules-engine";

import {
  backgroundAssociatedSkills,
  candidateReason,
  candidateTableTypeGroup,
  choiceTableSummary,
  classTableMetadata,
  contentSpecificValue,
  deityTableDescription,
  type groupParameterizedCandidates,
  isCandidateSelectable,
  powerTableActionLabel,
  powerTableAttackLabel,
  powerTableAttackTitle,
  powerTableLevel,
  type ChoiceSelectionTableKind,
} from "./builder-ui";
import {
  firstSelectedCandidateId,
  initialCandidateScrollTop,
} from "./candidate-table-initialization";
import {
  candidatePageForRow,
  candidatePageWindow,
  candidateSectionOnPage,
} from "./candidate-table-paging";
import { Icon } from "./Icon";
import { SelectionSummary } from "./SelectionSummary";
import { useVerticalOverflow } from "./useVerticalOverflow";
import { entityVisualTone, visualToneClass } from "./visual-language";

export type InspectedOption = {
  readonly candidate: CandidateDecision;
  readonly entity: ContentEntity;
};

export const InitializeCandidateInspectionContext = createContext<
  ((option: InspectedOption | undefined) => void) | undefined
>(undefined);

const CANDIDATE_FAVORITES_KEY = "4ecb:candidate-favorites:v1";
let candidateFavoritesSnapshot: ReadonlySet<string> | undefined;
const candidateFavoriteListeners = new Set<() => void>();

function storedCandidateFavorites(): ReadonlySet<string> {
  try {
    const stored = JSON.parse(
      localStorage.getItem(CANDIDATE_FAVORITES_KEY) ?? "[]",
    );
    return new Set(
      Array.isArray(stored)
        ? stored.filter((value): value is string => typeof value === "string")
        : [],
    );
  } catch {
    return new Set();
  }
}

function currentCandidateFavorites(): ReadonlySet<string> {
  candidateFavoritesSnapshot ??= storedCandidateFavorites();
  return candidateFavoritesSnapshot;
}

function useCandidateFavorites(): ReadonlySet<string> {
  return useSyncExternalStore((listener) => {
    candidateFavoriteListeners.add(listener);
    return () => candidateFavoriteListeners.delete(listener);
  }, currentCandidateFavorites);
}

function toggleCandidateFavorite(definitionId: string): void {
  const next = new Set(currentCandidateFavorites());
  const key = definitionId.toLocaleLowerCase();
  if (next.has(key)) next.delete(key);
  else next.add(key);
  candidateFavoritesSnapshot = next;
  localStorage.setItem(
    CANDIDATE_FAVORITES_KEY,
    JSON.stringify([...next].sort()),
  );
  for (const listener of candidateFavoriteListeners) listener();
}

const candidateReferenceIndexes = new WeakMap<
  ReadonlyMap<string, ContentEntity>,
  ReadonlyMap<string, ContentEntity>
>();

export function candidateReferenceIndex(
  byId: ReadonlyMap<string, ContentEntity>,
): ReadonlyMap<string, ContentEntity> {
  const existing = candidateReferenceIndexes.get(byId);
  if (existing !== undefined) return existing;
  const index = new Map<string, ContentEntity>();
  for (const entity of byId.values()) {
    index.set(entity.id.trim().toLocaleLowerCase(), entity);
    const name = entity.name.trim().toLocaleLowerCase();
    if (!index.has(name)) index.set(name, entity);
  }
  candidateReferenceIndexes.set(byId, index);
  return index;
}

type FeatPresentationGroup = ReturnType<
  typeof groupParameterizedCandidates
>[number];

function candidateTableNoun(
  kind: ChoiceSelectionTableKind,
  plural: boolean,
): string {
  const nouns: Readonly<
    Record<ChoiceSelectionTableKind, readonly [string, string]>
  > = {
    feat: ["Feat", "feats"],
    power: ["Power", "powers"],
    deity: ["Deity", "deities"],
    class: ["Class", "classes"],
    feature: ["Class Feature", "class features"],
    preset: ["Preset", "presets"],
    background: ["Background", "backgrounds"],
    option: ["Option", "options"],
  };
  return nouns[kind][plural ? 1 : 0];
}

type CandidateSortColumn =
  | "name"
  | "level"
  | "action"
  | "attack"
  | "summary"
  | "role"
  | "power-source"
  | "associated-skills"
  | "deity-description";
type CandidateSortDirection = "ascending" | "descending";

function defaultCandidateSortFor(kind: ChoiceSelectionTableKind): {
  readonly column: CandidateSortColumn;
  readonly direction: CandidateSortDirection;
} {
  return kind === "power"
    ? { column: "level", direction: "descending" }
    : { column: "name", direction: "ascending" };
}

function candidateHeaderIsSortable(label: string): boolean {
  const normalizedLabel = label.trim().toLocaleLowerCase();
  return !["description", "short description"].includes(normalizedLabel);
}

function compareCandidateSortValues(
  left: string | number | undefined,
  right: string | number | undefined,
): number {
  if (left === undefined) return right === undefined ? 0 : 1;
  if (right === undefined) return -1;
  if (typeof left === "number" && typeof right === "number")
    return left - right;
  return String(left).localeCompare(String(right), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

export function CandidateSelectionTable({
  kind,
  candidates,
  featGroups,
  selectedIds,
  expandedGroupKey,
  byId,
  disabled,
  selectionLimit,
  nameColumnLabel,
  showIllegal,
  onExpandGroup,
  onInspect,
  onToggle,
  onRemove,
  onClear,
  onToggleShowIllegal,
}: {
  readonly kind: ChoiceSelectionTableKind;
  readonly candidates: readonly CandidateDecision[];
  readonly featGroups: readonly FeatPresentationGroup[];
  readonly selectedIds: ReadonlySet<string>;
  readonly expandedGroupKey: string;
  readonly byId: ReadonlyMap<string, ContentEntity>;
  readonly disabled: boolean;
  readonly selectionLimit?: number;
  readonly nameColumnLabel?: string;
  readonly showIllegal?: boolean;
  readonly onExpandGroup: (key: string) => void;
  readonly onInspect: (candidate: CandidateDecision) => void;
  readonly onToggle: (definitionId: string) => void;
  readonly onRemove: (definitionId: string) => void;
  readonly onClear?: () => void;
  readonly onToggleShowIllegal?: () => void;
}) {
  const initializeInspection = useContext(InitializeCandidateInspectionContext);
  const [filter, setFilter] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  // Undefined only for the first render, which opens on the page containing
  // the initially selected row.
  const [requestedPage, setRequestedPage] = useState<number>();
  const [sort, setSort] = useState<{
    readonly column: CandidateSortColumn;
    readonly direction: CandidateSortDirection;
  }>(() => defaultCandidateSortFor(kind));
  useEffect(
    () => setSort(defaultCandidateSortFor(kind)),
    [kind, nameColumnLabel],
  );
  const [typeExpansion, setTypeExpansion] = useState<
    ReadonlyMap<string, boolean>
  >(new Map());
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const tableContentRef = useRef<HTMLTableElement>(null);
  const initialSelectedIdRef = useRef(firstSelectedCandidateId(selectedIds));
  const initialSelectedRowRef = useRef<HTMLTableRowElement>(null);
  const initializedRef = useRef(false);
  const tableHasVerticalOverflow = useVerticalOverflow(
    tableScrollRef,
    tableContentRef,
  );
  const favoriteIds = useCandidateFavorites();
  const normalizedFilter = filter.trim().toLocaleLowerCase();
  const entityFor = (candidate: CandidateDecision) =>
    byId.get(candidate.definitionId.toLocaleLowerCase());
  const referenceIndex = candidateReferenceIndex(byId);
  const typeGroupFor = (candidate: CandidateDecision) => {
    const entity = entityFor(candidate);
    return entity === undefined || (kind !== "feat" && kind !== "power")
      ? { key: "other", label: "Other", order: 900 }
      : candidateTableTypeGroup(entity, kind, (reference) =>
          referenceIndex.get(reference.trim().toLocaleLowerCase()),
        );
  };
  const matchesFilter = (candidate: CandidateDecision, label?: string) => {
    if (normalizedFilter === "") return true;
    const entity = entityFor(candidate);
    return [
      label,
      entity?.name,
      entity?.printPrerequisites,
      entity === undefined ? undefined : choiceTableSummary(entity, kind),
      entity === undefined || kind !== "deity"
        ? undefined
        : deityTableDescription(entity),
      entity === undefined
        ? undefined
        : contentSpecificValue(entity, "Action Type"),
      entity === undefined
        ? undefined
        : contentSpecificValue(entity, "Attack Type"),
      entity === undefined ? undefined : contentSpecificValue(entity, "Level"),
      entity === undefined ? undefined : backgroundAssociatedSkills(entity),
    ].some((value) => value?.toLocaleLowerCase().includes(normalizedFilter));
  };
  const isFavorite = (candidate: CandidateDecision) =>
    favoriteIds.has(candidate.definitionId.toLocaleLowerCase());
  const candidateLabel = (candidate: CandidateDecision) =>
    entityFor(candidate)?.name ?? candidate.definitionId;
  const selectedItems = [...selectedIds].map((definitionId) => {
    const entity = byId.get(definitionId.toLocaleLowerCase());
    return {
      id: definitionId,
      label: entity?.name ?? definitionId,
      ...(entity === undefined ? {} : { entity }),
    };
  });
  useLayoutEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const initialSelectedId = initialSelectedIdRef.current;
    const initialCandidate = candidates.find(
      (candidate) => candidate.definitionId === initialSelectedId,
    );
    const initialEntity =
      initialCandidate === undefined
        ? undefined
        : byId.get(initialCandidate.definitionId.toLocaleLowerCase());
    initializeInspection?.(
      initialCandidate === undefined || initialEntity === undefined
        ? undefined
        : { candidate: initialCandidate, entity: initialEntity },
    );

    const viewport = tableScrollRef.current;
    const row = initialSelectedRowRef.current;
    if (viewport === null || row === null) return;
    const header = tableContentRef.current?.tHead;
    viewport.scrollTop = initialCandidateScrollTop({
      currentScrollTop: viewport.scrollTop,
      viewportTop: viewport.getBoundingClientRect().top,
      rowTop: row.getBoundingClientRect().top,
      stickyHeaderHeight: header?.getBoundingClientRect().height ?? 0,
    });
  }, [byId, candidates, initializeInspection]);
  const sortValue = (
    candidate: CandidateDecision,
    column: CandidateSortColumn,
    label = candidateLabel(candidate),
  ): string | number | undefined => {
    const entity = entityFor(candidate);
    if (column === "name") return label;
    if (entity === undefined) return undefined;
    if (column === "level") return powerTableLevel(entity);
    if (column === "action") return contentSpecificValue(entity, "Action Type");
    if (column === "attack") return contentSpecificValue(entity, "Attack Type");
    if (column === "role") return classTableMetadata(entity).role.label;
    if (column === "power-source")
      return classTableMetadata(entity).powerSource.label;
    if (column === "associated-skills")
      return backgroundAssociatedSkills(entity);
    return choiceTableSummary(entity, kind);
  };
  const compareCandidates = (
    left: CandidateDecision,
    right: CandidateDecision,
    leftLabel = candidateLabel(left),
    rightLabel = candidateLabel(right),
  ) => {
    const leftValue = sortValue(left, sort.column, leftLabel);
    const rightValue = sortValue(right, sort.column, rightLabel);
    if (leftValue === undefined && rightValue !== undefined) return 1;
    if (rightValue === undefined && leftValue !== undefined) return -1;
    const primary = compareCandidateSortValues(leftValue, rightValue);
    const directed = sort.direction === "ascending" ? primary : -primary;
    return (
      directed ||
      compareCandidateSortValues(
        sortValue(left, "name", leftLabel),
        sortValue(right, "name", rightLabel),
      )
    );
  };
  const sortableHeader = (
    column: CandidateSortColumn,
    label: string,
    contents: ReactNode = label,
  ) => {
    if (!candidateHeaderIsSortable(label))
      return (
        <th key={column} scope="col">
          {contents}
        </th>
      );
    const active = sort.column === column;
    return (
      <th aria-sort={active ? sort.direction : "none"} key={column} scope="col">
        <button
          aria-label={`Sort by ${label}`}
          className="selection-sort-button"
          type="button"
          onClick={() => {
            setRequestedPage(0);
            setSort((current) => ({
              column,
              direction:
                current.column === column && current.direction === "ascending"
                  ? "descending"
                  : "ascending",
            }));
          }}
        >
          {contents}
          <Icon name="chevron" />
        </button>
      </th>
    );
  };
  const isVisible = (candidate: CandidateDecision, label?: string) =>
    (!favoritesOnly || isFavorite(candidate)) &&
    matchesFilter(candidate, label);
  const visibleCandidates = candidates.filter((candidate) =>
    isVisible(candidate),
  );
  const visibleFeatGroups = featGroups.filter(
    (group) =>
      (!favoritesOnly ||
        group.options.some(({ candidate }) => isFavorite(candidate))) &&
      (group.label.toLocaleLowerCase().includes(normalizedFilter) ||
        group.options.some(({ candidate, label }) =>
          isVisible(candidate, label),
        )),
  );
  const displayedCandidates = visibleCandidates;
  const displayedFeatGroups = visibleFeatGroups;
  const totalRows =
    kind === "feat" ? visibleFeatGroups.length : visibleCandidates.length;

  const typeSections = new Map<
    string,
    {
      readonly key: string;
      readonly label: string;
      readonly order: number;
      readonly candidates: CandidateDecision[];
      readonly featGroups: FeatPresentationGroup[];
    }
  >();
  const sectionFor = (candidate: CandidateDecision) => {
    const group = typeGroupFor(candidate);
    const existing = typeSections.get(group.key);
    if (existing !== undefined) return existing;
    const section = { ...group, candidates: [], featGroups: [] };
    typeSections.set(group.key, section);
    return section;
  };
  for (const candidate of displayedCandidates)
    sectionFor(candidate).candidates.push(candidate);
  for (const group of displayedFeatGroups)
    sectionFor(group.options[0]!.candidate).featGroups.push(group);
  const sortedTypeSections = [...typeSections.values()].sort(
    (left, right) =>
      left.order - right.order || left.label.localeCompare(right.label),
  );
  const candidateRow = (
    candidate: CandidateDecision,
    label: string,
    nested = false,
    rowKey = candidate.definitionId,
  ) => {
    const entity = entityFor(candidate);
    const selected = selectedIds.has(candidate.definitionId);
    const summary =
      entity === undefined ? undefined : choiceTableSummary(entity, kind);
    const deityDescription =
      entity === undefined || kind !== "deity"
        ? undefined
        : deityTableDescription(entity);
    const classMetadata =
      entity === undefined || kind !== "class"
        ? undefined
        : classTableMetadata(entity);
    const unavailable = !candidate.eligible;
    const selectionBlocked =
      disabled ||
      !isCandidateSelectable(candidate) ||
      (!selected &&
        selectionLimit !== undefined &&
        selectedIds.size >= selectionLimit);
    const tone =
      entity === undefined
        ? "tone-neutral"
        : visualToneClass(entityVisualTone(entity));
    return (
      <tr
        className={`${tone}${selected ? " selection-row-selected" : ""}${unavailable ? " selection-row-unavailable" : ""}`}
        key={rowKey}
        ref={
          candidate.definitionId === initialSelectedIdRef.current
            ? initialSelectedRowRef
            : undefined
        }
      >
        <td className={nested ? "selection-table-nested" : undefined}>
          <div className="selection-table-name">
            <button
              aria-label={`${isFavorite(candidate) ? "Remove" : "Add"} ${label} ${isFavorite(candidate) ? "from" : "to"} favorites`}
              aria-pressed={isFavorite(candidate)}
              className="selection-favorite-toggle"
              title={isFavorite(candidate) ? "Remove favorite" : "Add favorite"}
              type="button"
              onClick={() => toggleCandidateFavorite(candidate.definitionId)}
            >
              <Icon name="favorite" />
            </button>
            <button
              aria-description={
                selectionBlocked
                  ? "Click to inspect. This item cannot currently be selected."
                  : "Click to inspect. Double-click or press Enter to select."
              }
              aria-pressed={selected}
              className="selection-candidate-toggle"
              title={
                selectionBlocked
                  ? "Click for details"
                  : "Click for details; double-click to select"
              }
              type="button"
              onClick={() => onInspect(candidate)}
              onDoubleClick={() => {
                if (!selectionBlocked) onToggle(candidate.definitionId);
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter" || selectionBlocked) return;
                event.preventDefault();
                onInspect(candidate);
                onToggle(candidate.definitionId);
              }}
            >
              <span>{label}</span>
            </button>
          </div>
          {unavailable ? (
            <small>{candidateReason(candidate.reasons)}</small>
          ) : null}
        </td>
        {kind === "power" ? (
          <>
            <td>
              {entity === undefined ? "—" : (powerTableLevel(entity) ?? "—")}
            </td>
            <td
              title={
                entity === undefined
                  ? undefined
                  : contentSpecificValue(entity, "Action Type")
              }
            >
              {entity === undefined
                ? "—"
                : (powerTableActionLabel(entity) ?? "—")}
            </td>
            <td
              title={
                entity === undefined ? undefined : powerTableAttackTitle(entity)
              }
            >
              {entity === undefined
                ? "—"
                : (powerTableAttackLabel(entity) ?? "—")}
            </td>
            <td>
              <span className="selection-table-summary">{summary || "—"}</span>
            </td>
          </>
        ) : kind === "class" ? (
          <>
            <td title={classMetadata?.role.description}>
              {classMetadata?.role.label || "—"}
            </td>
            <td title={classMetadata?.powerSource.description}>
              {classMetadata?.powerSource.label || "—"}
            </td>
            <td>
              <span className="selection-table-summary">{summary || "—"}</span>
            </td>
          </>
        ) : kind === "background" ? (
          <>
            <td>
              {entity === undefined
                ? "—"
                : (backgroundAssociatedSkills(entity) ?? "—")}
            </td>
            <td>
              <span className="selection-table-summary">{summary || "—"}</span>
            </td>
          </>
        ) : kind === "deity" ? (
          <>
            <td>
              <span className="selection-table-summary">{summary || "—"}</span>
            </td>
            <td>
              <span className="selection-table-summary">
                {deityDescription || "—"}
              </span>
            </td>
          </>
        ) : (
          <td>
            <span className="selection-table-summary">{summary || "—"}</span>
          </td>
        )}
      </tr>
    );
  };

  // Flatten the expanded, sorted sections into result rows so paging can bound
  // mounted rows while filtering, grouping, and sorting still cover every
  // candidate. Rows are render thunks so off-page rows are never built.
  type ResultRow = {
    readonly candidateId?: string;
    readonly render: () => ReactNode;
  };
  let resultRowCount = 0;
  const resultSections = sortedTypeSections.map((section, sectionIndex) => {
    const selected =
      section.candidates.some((candidate) =>
        selectedIds.has(candidate.definitionId),
      ) ||
      section.featGroups.some((group) =>
        group.options.some(({ candidate }) =>
          selectedIds.has(candidate.definitionId),
        ),
      );
    const expanded =
      normalizedFilter !== "" ||
      (typeExpansion.get(section.key) ?? (selected || sectionIndex === 0));
    const rows: ResultRow[] = [];
    if (expanded && kind !== "feat") {
      for (const candidate of [...section.candidates].sort((left, right) =>
        compareCandidates(left, right),
      ))
        rows.push({
          candidateId: candidate.definitionId,
          render: () =>
            candidateRow(
              candidate,
              entityFor(candidate)?.name ?? candidate.definitionId,
            ),
        });
    } else if (expanded) {
      for (const group of [...section.featGroups].sort((left, right) =>
        compareCandidates(
          left.options[0]!.candidate,
          right.options[0]!.candidate,
          left.label,
          right.label,
        ),
      )) {
        if (group.parameterLabel === undefined) {
          const candidate = group.options[0]!.candidate;
          rows.push({
            candidateId: candidate.definitionId,
            render: () => candidateRow(candidate, group.label),
          });
          continue;
        }
        const selected = group.options.some(({ candidate }) =>
          selectedIds.has(candidate.definitionId),
        );
        const expanded =
          expandedGroupKey === group.key || selected || normalizedFilter !== "";
        const representative =
          group.options.find(({ candidate }) =>
            selectedIds.has(candidate.definitionId),
          )?.candidate ?? group.options[0]!.candidate;
        const familyLabelMatches = group.label
          .toLocaleLowerCase()
          .includes(normalizedFilter);
        rows.push({
          render: () => (
            <tr className="selection-family-row" key={`family:${group.key}`}>
              <td>
                <button
                  aria-expanded={expanded}
                  type="button"
                  onClick={() => {
                    onInspect(representative);
                    onExpandGroup(expanded ? "" : group.key);
                  }}
                >
                  <span>{group.label}…</span>
                </button>
              </td>
              <td>Choose {group.parameterLabel}</td>
            </tr>
          ),
        });
        if (!expanded) continue;
        const matchingOptions = group.options.filter(
          ({ candidate, label }) =>
            (!favoritesOnly || isFavorite(candidate)) &&
            (familyLabelMatches || matchesFilter(candidate, label)),
        );
        for (const { candidate, label } of [...matchingOptions].sort(
          (left, right) =>
            compareCandidates(
              left.candidate,
              right.candidate,
              left.label,
              right.label,
            ),
        ))
          rows.push({
            candidateId: candidate.definitionId,
            render: () =>
              candidateRow(
                candidate,
                label,
                true,
                `${group.key}:${candidate.definitionId}`,
              ),
          });
      }
    }
    const start = resultRowCount;
    resultRowCount += rows.length;
    return { section, expanded, rows, start };
  });
  const initialSelectedId = initialSelectedIdRef.current;
  const pageWindow = candidatePageWindow(
    resultRowCount,
    requestedPage ??
      candidatePageForRow(
        initialSelectedId === undefined
          ? -1
          : resultSections
              .flatMap(({ rows }) => rows)
              .findIndex((row) => row.candidateId === initialSelectedId),
      ),
  );
  // Pin the opening page so later expansion or selection changes that move the
  // initially selected row do not move the user to another page.
  useLayoutEffect(() => {
    if (requestedPage === undefined) setRequestedPage(pageWindow.page);
  }, [requestedPage, pageWindow.page]);
  const showPage = (page: number) => {
    setRequestedPage(page);
    if (tableScrollRef.current !== null) tableScrollRef.current.scrollTop = 0;
  };

  return (
    <div
      className={`candidate-selection-table candidate-selection-${kind}${totalRows <= 6 ? " candidate-selection-short" : ""}`}
    >
      <div className="selection-table-controls">
        <div className="selection-table-toolbar">
          <label>
            <span className="visually-hidden">
              Filter {candidateTableNoun(kind, true)}
            </span>
            <input
              placeholder={`Filter ${candidateTableNoun(kind, true)}`}
              type="search"
              value={filter}
              onChange={(event) => {
                setFilter(event.currentTarget.value);
                setRequestedPage(0);
              }}
            />
          </label>
          {onClear === undefined ? null : (
            <button
              disabled={disabled || selectedIds.size === 0}
              type="button"
              onClick={onClear}
            >
              Clear
            </button>
          )}
          <button
            aria-pressed={favoritesOnly}
            className="selection-favorites-filter"
            type="button"
            onClick={() => {
              setFavoritesOnly((current) => !current);
              setRequestedPage(0);
            }}
          >
            <Icon name="favorite" /> Favorites
          </button>
          <span className="selection-table-count">{totalRows} shown</span>
          {onToggleShowIllegal === undefined ? null : (
            <button
              aria-label={
                showIllegal === true
                  ? "Hide illegal options"
                  : "Show illegal options"
              }
              aria-pressed={showIllegal === true}
              className="icon-only-button button-icon selection-illegal-toggle"
              title={
                showIllegal === true
                  ? "Showing options the rules do not allow you to pick"
                  : "Show options the rules do not allow you to pick"
              }
              type="button"
              onClick={onToggleShowIllegal}
            >
              <Icon name="scale" />
            </button>
          )}
        </div>
        <SelectionSummary
          items={selectedItems}
          visible={tableHasVerticalOverflow}
          onInspect={(definitionId) => {
            const candidate = candidates.find(
              (item) => item.definitionId === definitionId,
            );
            if (candidate !== undefined) onInspect(candidate);
          }}
          onRemove={onRemove}
        />
      </div>
      <div className="selection-table-scroll" ref={tableScrollRef}>
        <table ref={tableContentRef}>
          <thead>
            <tr>
              {sortableHeader(
                "name",
                nameColumnLabel ?? candidateTableNoun(kind, false),
              )}
              {kind === "power" ? (
                <>
                  {sortableHeader("level", "Level")}
                  {sortableHeader("action", "Action")}
                  {sortableHeader("attack", "Type")}
                  {sortableHeader("summary", "Description")}
                </>
              ) : kind === "class" ? (
                <>
                  {sortableHeader("role", "Role")}
                  {sortableHeader("power-source", "Power")}
                  {sortableHeader("summary", "Description")}
                </>
              ) : kind === "background" ? (
                <>
                  {sortableHeader("associated-skills", "Associated Skills")}
                  {sortableHeader("summary", "Description")}
                </>
              ) : kind === "deity" ? (
                <>
                  {sortableHeader("summary", "Alignment")}
                  {sortableHeader("deity-description", "Description")}
                </>
              ) : (
                sortableHeader("summary", "Description")
              )}
            </tr>
          </thead>
          <tbody>
            {resultSections.map(
              ({ section, expanded, rows, start: sectionStart }) => {
                if (
                  !candidateSectionOnPage(
                    { start: sectionStart, end: sectionStart + rows.length },
                    pageWindow,
                    resultRowCount,
                  )
                )
                  return null;
                const pageRows = rows.slice(
                  Math.max(0, pageWindow.start - sectionStart),
                  Math.max(0, pageWindow.end - sectionStart),
                );
                return (
                  <Fragment key={section.key}>
                    {kind === "feat" || kind === "power" ? (
                      <tr className="selection-type-row table-section-row">
                        <th colSpan={kind === "power" ? 5 : 2} scope="rowgroup">
                          <button
                            className="table-section-toggle"
                            aria-expanded={expanded}
                            type="button"
                            onClick={() =>
                              setTypeExpansion((current) => {
                                const next = new Map(current);
                                next.set(section.key, !expanded);
                                return next;
                              })
                            }
                          >
                            <Icon name="chevron" />
                            <span>{section.label}</span>
                            <small className="table-section-count">
                              {kind === "power"
                                ? section.candidates.length
                                : section.featGroups.length}
                            </small>
                          </button>
                        </th>
                      </tr>
                    ) : null}
                    {pageRows.map((row) => row.render())}
                  </Fragment>
                );
              },
            )}
            {(kind === "feat"
              ? visibleFeatGroups.length
              : visibleCandidates.length) === 0 ? (
              <tr>
                <td
                  colSpan={
                    kind === "power"
                      ? 5
                      : kind === "class"
                        ? 4
                        : kind === "background"
                          ? 3
                          : 2
                  }
                >
                  No matching {candidateTableNoun(kind, true)}.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {pageWindow.pageCount > 1 ? (
        <div className="equipment-pagination selection-table-pagination">
          <button
            type="button"
            disabled={pageWindow.page === 0}
            onClick={() => showPage(pageWindow.page - 1)}
          >
            Previous
          </button>
          <span>
            {`Rows ${pageWindow.start + 1}–${pageWindow.end} of ${resultRowCount.toLocaleString()}`}
          </span>
          <button
            type="button"
            disabled={pageWindow.page >= pageWindow.pageCount - 1}
            onClick={() => showPage(pageWindow.page + 1)}
          >
            Next
          </button>
        </div>
      ) : null}
    </div>
  );
}
