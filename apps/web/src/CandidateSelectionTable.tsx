import {
  createContext,
  Fragment,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type { ContentEntity } from "@4ecb/content-domain";
import {
  powerAttackProfile,
  type CandidateDecision,
  type EvaluatedCharacter,
  type PowerAttackProfile,
} from "@4ecb/rules-engine";

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
import {
  ABILITY_ABBREVIATIONS,
  abilityAbbreviation,
} from "./ability-abbreviations";
import { useCandidateFavorites } from "./candidate-favorites";
import { EntityCardLeadingIcon } from "./EntityCard";
import { Icon } from "./Icon";
import { entityVisualTone, visualToneClass } from "./visual-language";

export type InspectedOption = {
  readonly candidate: CandidateDecision;
  readonly entity: ContentEntity;
  /** Picked from a selection table, so its card offers the favorite star
   * (favorites only filter and tint tables; button choices have none). */
  readonly favoritable?: boolean;
};

export const InitializeCandidateInspectionContext = createContext<
  ((option: InspectedOption | undefined) => void) | undefined
>(undefined);

const candidateReferenceIndexes = new WeakMap<
  ReadonlyMap<string, ContentEntity>,
  ReadonlyMap<string, ContentEntity>
>();

/** Pinned selections may cover at most this share of the visible table. */
const PINNED_SELECTION_SHARE = 1 / 3;

/**
 * Stacks the selected rows' sticky offsets so several selections pinned at the
 * same edge sit one above another instead of overlapping. Rows stick below the
 * header and the sticky section row, if the table has sections. Only as many
 * rows pin as fit in a third of the visible table (a table that allows many
 * picks, like backgrounds, would otherwise be all pinned rows); the rest stay
 * highlighted but scroll normally.
 */
function pinSelectedRows(
  table: HTMLTableElement,
  viewport: HTMLElement | null,
): void {
  const rows = [
    ...table.querySelectorAll<HTMLTableRowElement>(
      "tbody tr.selection-row-selected:not(.selection-family-row)",
    ),
  ];
  // Section rows stick at the CSS header height, which can differ from the
  // rendered header by a fraction of a pixel, so stack below where they stick.
  const section = table.querySelector<HTMLElement>(
    "tbody .table-section-row > th",
  );
  const base =
    section === null
      ? (table.tHead?.getBoundingClientRect().height ?? 0)
      : parseFloat(getComputedStyle(section).top) +
        section.getBoundingClientRect().height;
  const budget =
    viewport === null
      ? Infinity
      : (viewport.clientHeight - base) * PINNED_SELECTION_SHARE;
  const heights = rows.map((row) => row.getBoundingClientRect().height);
  let pinnedCount = 0;
  for (let used = 0; pinnedCount < rows.length; pinnedCount += 1) {
    used += heights[pinnedCount] ?? 0;
    if (used > budget) break;
  }
  // Tuck 1px under the (higher-layered) header so rounding never shows a gap.
  let above = Math.floor(base) - 1;
  let below = heights
    .slice(0, pinnedCount)
    .reduce((total, height) => total + height, 0);
  rows.forEach((row, index) => {
    if (index >= pinnedCount) {
      row.dataset.unpinned = "";
      row.style.removeProperty("--selection-sticky-top");
      row.style.removeProperty("--selection-sticky-bottom");
      return;
    }
    delete row.dataset.unpinned;
    below -= heights[index] ?? 0;
    row.style.setProperty("--selection-sticky-top", `${above}px`);
    row.style.setProperty("--selection-sticky-bottom", `${below}px`);
    above += heights[index] ?? 0;
  });
}

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
  | "attack"
  | "attack-ability"
  | "defense"
  | "summary"
  | "role"
  | "power-source"
  | "associated-skills"
  | "deity-description";
type CandidateSortDirection = "ascending" | "descending";

const DEFENSE_ABBREVIATIONS: Readonly<Record<string, string>> = {
  AC: "AC",
  Fortitude: "Fort",
  Reflex: "Ref",
  Will: "Will",
};
const ABILITY_ORDER: readonly string[] = ABILITY_ABBREVIATIONS.map(
  ([ability]) => ability,
);
const DEFENSE_ORDER = Object.keys(DEFENSE_ABBREVIATIONS);

/** A power-table filter: the values a candidate has, in display order. */
interface CandidateFacet {
  readonly id: string;
  readonly label: string;
  readonly allLabel: string;
  readonly valuesFor: (
    entity: ContentEntity,
    profile: PowerAttackProfile | undefined,
  ) => readonly string[];
  readonly order?: readonly string[];
  /** Shorter option text (STR, Fort) so the filters fit on one line. */
  readonly display?: (value: string) => string;
  /** Numeric: filtered by a min/max pair of fields instead of a dropdown. */
  readonly range?: boolean;
}

const present = (value: string | number | undefined): readonly string[] =>
  value === undefined || value === "" ? [] : [String(value)];

const POWER_FACETS: readonly CandidateFacet[] = [
  {
    id: "level",
    label: "Level",
    allLabel: "All levels",
    valuesFor: (entity) => present(powerTableLevel(entity)),
    range: true,
  },
  {
    id: "action",
    label: "Action",
    allLabel: "All actions",
    valuesFor: (entity) => present(powerTableActionLabel(entity)),
  },
  {
    id: "type",
    label: "Type",
    allLabel: "All types",
    valuesFor: (entity) => present(powerTableAttackLabel(entity)),
  },
  {
    id: "ability",
    label: "Attack",
    allLabel: "All",
    valuesFor: (_entity, profile) => profile?.abilities ?? [],
    order: ABILITY_ORDER,
    display: abilityAbbreviation,
  },
  {
    id: "defense",
    label: "Defense",
    allLabel: "All",
    valuesFor: (_entity, profile) => profile?.defenses ?? [],
    order: DEFENSE_ORDER,
    display: (defense) => DEFENSE_ABBREVIATIONS[defense] ?? defense,
  },
];

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
  expandSections = false,
  selectedOnlyToggle = false,
  showIllegal,
  onExpandGroup,
  onInspect,
  onToggle,
  onToggleShowIllegal,
  evaluation,
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
  /** Open every type section by default (short lists, e.g. what the
   *  character already has); they can still be folded by hand. */
  readonly expandSections?: boolean;
  /** Offer an "N selected" toggle that narrows the table to its selections,
   *  instead of pinning selected rows to the table's edges (many-pick tables
   *  like backgrounds, where pinning only some rows makes no sense). */
  readonly selectedOnlyToggle?: boolean;
  readonly showIllegal?: boolean;
  readonly onExpandGroup: (key: string) => void;
  readonly onInspect: (candidate: CandidateDecision) => void;
  readonly onToggle: (definitionId: string) => void;
  readonly onToggleShowIllegal?: () => void;
  /** The character, so power rows can show the ability it would attack with. */
  readonly evaluation?: EvaluatedCharacter;
}) {
  const initializeInspection = useContext(InitializeCandidateInspectionContext);
  const [filter, setFilter] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [selectedOnly, setSelectedOnly] = useState(false);
  const facets = kind === "power" ? POWER_FACETS : [];
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [facetValues, setFacetValues] = useState<
    Readonly<Record<string, string>>
  >({});
  // A range facet stores its bounds under "<id>:min" and "<id>:max".
  const facetBound = (facet: CandidateFacet, bound: "min" | "max") =>
    facetValues[`${facet.id}:${bound}`] ?? "";
  const facetActive = (facet: CandidateFacet) =>
    facet.range === true
      ? facetBound(facet, "min") !== "" || facetBound(facet, "max") !== ""
      : (facetValues[facet.id] ?? "") !== "";
  const activeFacetCount = facets.filter(facetActive).length;
  const setFacetValue = (key: string, value: string) => {
    setFacetValues((current) => ({ ...current, [key]: value }));
    setRequestedPage(0);
  };
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
  const filterInputRef = useRef<HTMLInputElement>(null);
  const tableContentRef = useRef<HTMLTableElement>(null);
  const initialSelectedIdRef = useRef(firstSelectedCandidateId(selectedIds));
  const initialSelectedRowRef = useRef<HTMLTableRowElement>(null);
  const initializedRef = useRef(false);
  const favoriteIds = useCandidateFavorites();
  const normalizedFilter = filter.trim().toLocaleLowerCase();
  const entityFor = (candidate: CandidateDecision) =>
    byId.get(candidate.definitionId.toLocaleLowerCase());
  const attackProfiles = useMemo(() => {
    const profiles = new Map<string, PowerAttackProfile>();
    if (kind !== "power") return profiles;
    const input = {
      stats: evaluation?.stats ?? {},
      activeDefinitionIds: evaluation?.activeDefinitionIds ?? [],
      byId,
    };
    for (const candidate of candidates) {
      const entity = byId.get(candidate.definitionId.toLocaleLowerCase());
      if (entity !== undefined)
        profiles.set(candidate.definitionId, powerAttackProfile(entity, input));
    }
    return profiles;
  }, [byId, candidates, evaluation, kind]);
  const facetValuesFor = (
    facet: CandidateFacet,
    candidate: CandidateDecision,
  ) => {
    const entity = entityFor(candidate);
    return entity === undefined
      ? []
      : facet.valuesFor(entity, attackProfiles.get(candidate.definitionId));
  };
  const facetOptions = (facet: CandidateFacet): readonly string[] => {
    const values = new Set(
      candidates.flatMap((candidate) => facetValuesFor(facet, candidate)),
    );
    return [...values].sort((left, right) =>
      facet.order !== undefined
        ? facet.order.indexOf(left) - facet.order.indexOf(right)
        : facet.range === true
          ? Number(left) - Number(right)
          : left.localeCompare(right),
    );
  };
  const matchesFacets = (candidate: CandidateDecision) =>
    facets.every((facet) => {
      if (facet.range === true) {
        if (!facetActive(facet)) return true;
        const min = Number(facetBound(facet, "min") || -Infinity);
        const max = Number(facetBound(facet, "max") || Infinity);
        return facetValuesFor(facet, candidate).some((value) => {
          const number = Number(value);
          return number >= min && number <= max;
        });
      }
      const wanted = facetValues[facet.id] ?? "";
      return wanted === "" || facetValuesFor(facet, candidate).includes(wanted);
    });
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
      ...(attackProfiles.get(candidate.definitionId)?.abilities ?? []),
      ...(attackProfiles.get(candidate.definitionId)?.defenses ?? []),
    ].some((value) => value?.toLocaleLowerCase().includes(normalizedFilter));
  };
  const isFavorite = (candidate: CandidateDecision) =>
    favoriteIds.has(candidate.definitionId.toLocaleLowerCase());
  const candidateLabel = (candidate: CandidateDecision) =>
    entityFor(candidate)?.name ?? candidate.definitionId;
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
        : {
            candidate: initialCandidate,
            entity: initialEntity,
            favoritable: true,
          },
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
    if (column === "attack") return contentSpecificValue(entity, "Attack Type");
    if (column === "attack-ability")
      return (
        attackProfiles.get(candidate.definitionId)?.abilities.join("/") ||
        undefined
      );
    if (column === "defense")
      return (
        attackProfiles.get(candidate.definitionId)?.defenses.join("/") ||
        undefined
      );
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
    (!selectedOnly || selectedIds.has(candidate.definitionId)) &&
    matchesFacets(candidate) &&
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
      // The whole row is the click target: click inspects, double-click
      // selects. The name button inside keeps keyboard access (its clicks
      // bubble here; Enter selects).
      <tr
        className={`selection-candidate-row ${tone}${selected ? " selection-row-selected" : ""}${unavailable ? " selection-row-unavailable" : ""}${isFavorite(candidate) ? " selection-row-favorite" : ""}`}
        key={rowKey}
        ref={
          candidate.definitionId === initialSelectedIdRef.current
            ? initialSelectedRowRef
            : undefined
        }
        title={
          selectionBlocked
            ? "Click for details"
            : "Click for details; double-click to select"
        }
        onClick={() => onInspect(candidate)}
        onDoubleClick={() => {
          if (!selectionBlocked) onToggle(candidate.definitionId);
        }}
        onMouseDown={(event) => {
          // A double-click selects the row, not a word of its text.
          if (event.detail > 1) event.preventDefault();
        }}
      >
        <td className={nested ? "selection-table-nested" : undefined}>
          <div className="selection-table-name">
            {/* The same icon as the card's title; favorites are toggled on
                the card and shown here as the row's tint. */}
            <span aria-hidden="true" className="selection-row-icon">
              <EntityCardLeadingIcon entity={entity} />
            </span>
            <button
              aria-description={
                selectionBlocked
                  ? "Click to inspect. This item cannot currently be selected."
                  : "Click to inspect. Double-click or press Enter to select."
              }
              aria-pressed={selected}
              className="selection-candidate-toggle"
              type="button"
              onKeyDown={(event) => {
                if (event.key !== "Enter" || selectionBlocked) return;
                event.preventDefault();
                onInspect(candidate);
                onToggle(candidate.definitionId);
              }}
            >
              <span>{label}</span>
              {/* Powers show their action only as the row icon. */}
              {kind === "power" && entity !== undefined ? (
                <span className="visually-hidden">
                  {`, ${powerTableActionLabel(entity) ?? "no action"}`}
                </span>
              ) : null}
              {isFavorite(candidate) ? (
                <span className="visually-hidden"> (favorite)</span>
              ) : null}
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
                entity === undefined ? undefined : powerTableAttackTitle(entity)
              }
            >
              {entity === undefined
                ? "—"
                : (powerTableAttackLabel(entity) ?? "—")}
            </td>
            <td
              title={attackProfiles
                .get(candidate.definitionId)
                ?.abilities.join(" / ")}
            >
              {attackProfiles
                .get(candidate.definitionId)
                ?.abilities.map(abilityAbbreviation)
                .join("/") || "—"}
            </td>
            <td
              title={attackProfiles
                .get(candidate.definitionId)
                ?.defenses.join(" / ")}
            >
              {attackProfiles
                .get(candidate.definitionId)
                ?.defenses.map(
                  (defense) => DEFENSE_ABBREVIATIONS[defense] ?? defense,
                )
                .join("/") || "—"}
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
      (typeExpansion.get(section.key) ??
        (expandSections || selected || sectionIndex === 0));
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
    if (!expanded) {
      // A collapsed section still shows its selections; like any selected
      // row they float at the table's edge while scrolled out of view.
      for (const candidate of [...section.candidates]
        .filter((item) => selectedIds.has(item.definitionId))
        .sort((left, right) => compareCandidates(left, right)))
        rows.push({
          candidateId: candidate.definitionId,
          render: () =>
            candidateRow(
              candidate,
              entityFor(candidate)?.name ?? candidate.definitionId,
            ),
        });
      for (const group of section.featGroups)
        for (const { candidate, label } of group.options)
          if (selectedIds.has(candidate.definitionId))
            rows.push({
              candidateId: candidate.definitionId,
              render: () =>
                candidateRow(
                  candidate,
                  group.parameterLabel === undefined ? group.label : label,
                ),
            });
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
  // Selected rows stay visible by sticking to the table's edges. Those on
  // another page are mounted too, before or after this page's rows, so they
  // float at the top or bottom edge in the same way.
  const offPageSelectedRows = (before: boolean) =>
    selectedOnlyToggle
      ? []
      : resultSections.flatMap(({ rows, start }) =>
          rows.filter(
            ({ candidateId }, index) =>
              candidateId !== undefined &&
              selectedIds.has(candidateId) &&
              (before
                ? start + index < pageWindow.start
                : start + index >= pageWindow.end),
          ),
        );
  useLayoutEffect(() => {
    const table = tableContentRef.current;
    if (table === null || selectedOnlyToggle) return;
    const viewport = tableScrollRef.current;
    pinSelectedRows(table, viewport);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => pinSelectedRows(table, viewport));
    observer.observe(table);
    if (viewport !== null) observer.observe(viewport);
    return () => observer.disconnect();
  });
  const showPage = (page: number) => {
    setRequestedPage(page);
    if (tableScrollRef.current !== null) tableScrollRef.current.scrollTop = 0;
  };

  return (
    <div
      className={`candidate-selection-table candidate-selection-${kind}${totalRows <= 6 ? " candidate-selection-short" : ""}${selectedOnlyToggle ? " candidate-selection-unpinned" : ""}`}
    >
      <div className="selection-table-controls">
        <div className="selection-table-toolbar">
          <div className="selection-table-search">
            <label>
              <span className="visually-hidden">
                Filter {candidateTableNoun(kind, true)}
              </span>
              <input
                placeholder={`Filter ${candidateTableNoun(kind, true)}`}
                ref={filterInputRef}
                type="search"
                value={filter}
                onChange={(event) => {
                  setFilter(event.currentTarget.value);
                  setRequestedPage(0);
                }}
              />
            </label>
            {filter === "" ? null : (
              <button
                aria-label="Clear filter"
                className="selection-table-search-clear"
                title="Clear filter"
                type="button"
                onClick={() => {
                  setFilter("");
                  setRequestedPage(0);
                  filterInputRef.current?.focus();
                }}
              >
                <Icon name="remove" />
              </button>
            )}
          </div>
          <button
            aria-label="Favorites only"
            aria-pressed={favoritesOnly}
            className="icon-only-button button-icon selection-favorites-filter"
            title={
              favoritesOnly ? "Showing favorites only" : "Show favorites only"
            }
            type="button"
            onClick={() => {
              setFavoritesOnly((current) => !current);
              setRequestedPage(0);
            }}
          >
            <Icon name="favorite" />
          </button>
          {selectedOnlyToggle ? (
            <button
              aria-label="Selected only"
              aria-pressed={selectedOnly}
              className="icon-only-button button-icon selection-selected-filter"
              title={
                selectedOnly ? "Showing selected only" : "Show selected only"
              }
              type="button"
              onClick={() => {
                setSelectedOnly((current) => !current);
                setRequestedPage(0);
              }}
            >
              <Icon name="list-checks" />
            </button>
          ) : null}
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
          {facets.length === 0 ? null : (
            <button
              aria-expanded={filtersOpen}
              aria-label={
                activeFacetCount === 0
                  ? "Filters"
                  : `Filters, ${activeFacetCount} active`
              }
              aria-pressed={activeFacetCount > 0}
              className="icon-only-button button-icon selection-filters-toggle"
              title="Filters"
              type="button"
              onClick={() => setFiltersOpen((current) => !current)}
            >
              <Icon name="filter" />
              {activeFacetCount === 0 ? null : (
                <span aria-hidden="true" className="selection-filters-count">
                  {activeFacetCount}
                </span>
              )}
            </button>
          )}
          <span className="selection-table-count">{totalRows} shown</span>
        </div>
        {filtersOpen && facets.length > 0 ? (
          <div className="selection-table-filters">
            {facets.map((facet) =>
              facet.range === true ? (
                <fieldset className="selection-filter-range" key={facet.id}>
                  <legend>{facet.label}</legend>
                  {(["min", "max"] as const).map((bound) => {
                    const options = facetOptions(facet);
                    return (
                      <input
                        aria-label={`${facet.label} ${bound === "min" ? "minimum" : "maximum"}`}
                        inputMode="numeric"
                        key={bound}
                        min={0}
                        placeholder={
                          (bound === "min" ? options[0] : options.at(-1)) ??
                          (bound === "min" ? "Min" : "Max")
                        }
                        type="number"
                        value={facetBound(facet, bound)}
                        onChange={(event) =>
                          setFacetValue(
                            `${facet.id}:${bound}`,
                            event.currentTarget.value,
                          )
                        }
                      />
                    );
                  })}
                </fieldset>
              ) : (
                <label key={facet.id}>
                  {facet.label}
                  <select
                    value={facetValues[facet.id] ?? ""}
                    onChange={(event) =>
                      setFacetValue(facet.id, event.currentTarget.value)
                    }
                  >
                    <option value="">{facet.allLabel}</option>
                    {facetOptions(facet).map((value) => (
                      <option key={value} value={value}>
                        {facet.display?.(value) ?? value}
                      </option>
                    ))}
                  </select>
                </label>
              ),
            )}
            {activeFacetCount === 0 ? null : (
              <button
                className="selection-filters-reset"
                type="button"
                onClick={() => {
                  setFacetValues({});
                  setRequestedPage(0);
                }}
              >
                Reset
              </button>
            )}
          </div>
        ) : null}
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
                  {sortableHeader(
                    "level",
                    "Level",
                    <abbr title="Level">Lvl</abbr>,
                  )}
                  {sortableHeader("attack", "Type")}
                  {sortableHeader(
                    "attack-ability",
                    "Attack ability",
                    <abbr title="Attack ability">Atk</abbr>,
                  )}
                  {sortableHeader(
                    "defense",
                    "Defense",
                    <abbr title="Defense">Def</abbr>,
                  )}
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
            {offPageSelectedRows(true).map((row) => row.render())}
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
                        <th colSpan={kind === "power" ? 6 : 2} scope="rowgroup">
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
            {offPageSelectedRows(false).map((row) => row.render())}
            {(kind === "feat"
              ? visibleFeatGroups.length
              : visibleCandidates.length) === 0 ? (
              <tr>
                <td
                  colSpan={
                    kind === "power"
                      ? 6
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
