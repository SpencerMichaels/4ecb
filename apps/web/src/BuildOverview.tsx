import { Fragment, useMemo, useState } from "react";

import type { BuilderIssueTarget } from "./builder-diagnostics";
import {
  buildOverviewBands,
  nextBuildOverviewSort,
  readBuildOverviewSort,
  writeBuildOverviewSort,
  type BuildOverviewBandRow,
  type BuildOverviewLevel,
  type BuildOverviewSort,
  type BuildOverviewSortColumn,
} from "./build-overview";
import { NO_PICKS_LABEL } from "./builder-ui";
import { ChoiceStatusIcon } from "./ChoiceAccordionItem";
import { Icon } from "./Icon";

const COLUMN_COUNT = 4;

/** The sortable header cell, the candidate tables' control. */
function SortHeader({
  column,
  label,
  sort,
  onSort,
}: {
  readonly column: BuildOverviewSortColumn;
  readonly label: string;
  readonly sort: BuildOverviewSort;
  readonly onSort: (column: BuildOverviewSortColumn) => void;
}) {
  return (
    <th
      aria-sort={sort.column === column ? sort.direction : "none"}
      scope="col"
    >
      <button
        aria-label={`Sort by ${label}`}
        className="selection-sort-button"
        type="button"
        onClick={() => onSort(column)}
      >
        {label}
        <Icon name="chevron" />
      </button>
    </th>
  );
}

function OverviewRow({
  entry: { row, picks, note },
  onOpen,
}: {
  readonly entry: BuildOverviewBandRow;
  readonly onOpen: (target: BuilderIssueTarget) => void;
}) {
  return (
    <tr
      className={`build-overview-choice${row.status === "unresolved" ? " is-unresolved" : ""}`}
      onClick={() => onOpen(row.target)}
    >
      <td className="build-overview-cell-level">{row.level}</td>
      <td className="build-overview-title">
        {/* The row's one focus stop; a click anywhere on the row lands here
            too (bubbling). */}
        <button className="build-overview-row" type="button">
          {row.title}
        </button>
      </td>
      <td className="build-overview-picks">
        {picks ?? NO_PICKS_LABEL}
        {note === undefined ? null : (
          <span className="build-overview-note">{` (${note})`}</span>
        )}
      </td>
      <td className="build-overview-status">
        <ChoiceStatusIcon status={row.status} />
      </td>
    </tr>
  );
}

/**
 * The Overview tab (D113): every choice in one table (Level, Category, Pick,
 * status) that regroups by its sort column (D113 amendment, 2026-11-16).
 * Level and Category sort with the candidate tables' header control; the chosen
 * grouping is remembered like the library's sort. By level, each level is a
 * band holding the full history, retrains included; by category (the Category column holds each slot), each slot
 * category is a band holding what the character has now, by level, a
 * retrain noting what it replaced (the Powers band by level, usages
 * intermixed). Bands are the
 * Inventory's collapsible group band (`table-section-row`), all expanded at
 * first and not remembered. Rows alternate the candidate tables' stripes,
 * restarting under each band; activating one opens that
 * choice where it is edited, as an issue's Review does.
 */
export function BuildOverview({
  levels,
  onOpen,
}: {
  /** Undefined while the editor's evaluation is still loading. */
  readonly levels: readonly BuildOverviewLevel[] | undefined;
  readonly onOpen: (target: BuilderIssueTarget) => void;
}) {
  const [sort, setSort] = useState<BuildOverviewSort>(() =>
    readBuildOverviewSort(),
  );
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const bands = useMemo(
    () => (levels === undefined ? undefined : buildOverviewBands(levels, sort)),
    [levels, sort],
  );
  const toggle = (key: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  const sortBy = (column: BuildOverviewSortColumn) => {
    const next = nextBuildOverviewSort(sort, column);
    setSort(next);
    writeBuildOverviewSort(next);
  };
  const byLevel = sort.column === "level";
  const domId = (key: string) => `build-overview-${key.replaceAll(":", "-")}`;
  return (
    <section
      aria-labelledby="build-overview-heading"
      className="choice-pane standalone-workspace-pane"
    >
      <header>
        <h3 id="build-overview-heading">Overview</h3>
      </header>
      <div className="standalone-workspace-content build-overview">
        {bands === undefined ? (
          <p>Evaluating character…</p>
        ) : (
          <table
            aria-labelledby="build-overview-heading"
            className="build-overview-table"
          >
            <colgroup>
              <col className="build-overview-col-level" />
              <col className="build-overview-col-slot" />
              <col />
              <col className="build-overview-col-status" />
            </colgroup>
            <thead>
              <tr>
                <SortHeader
                  column="level"
                  label="Level"
                  sort={sort}
                  onSort={sortBy}
                />
                <SortHeader
                  column="slot"
                  label="Category"
                  sort={sort}
                  onSort={sortBy}
                />
                <th scope="col">Pick</th>
                <th scope="col">
                  <span className="visually-hidden">Status</span>
                </th>
              </tr>
            </thead>
            {bands.map((band) => {
              const expanded = !collapsed.has(band.key);
              const id = domId(band.key);
              // The rows are a <tbody> of their own, so the stripes restart
              // under each band.
              const bodyId = `${id}-choices`;
              return (
                <Fragment key={band.key}>
                  <tbody className="build-overview-band">
                    <tr className="table-section-row">
                      <th colSpan={COLUMN_COUNT} id={id} scope="colgroup">
                        <button
                          aria-controls={bodyId}
                          aria-expanded={expanded}
                          className="table-section-toggle"
                          type="button"
                          onClick={() => toggle(band.key)}
                        >
                          <Icon name="chevron" />
                          <span>{band.title}</span>
                        </button>
                      </th>
                    </tr>
                  </tbody>
                  <tbody
                    aria-labelledby={id}
                    className="build-overview-rows"
                    hidden={!expanded}
                    id={bodyId}
                  >
                    {!expanded ? null : band.rows.length === 0 ? (
                      <tr>
                        <td
                          className="build-overview-none"
                          colSpan={COLUMN_COUNT}
                        >
                          {byLevel
                            ? "No choices at this level"
                            : "Nothing in this category"}
                        </td>
                      </tr>
                    ) : (
                      band.rows.map((entry) => (
                        <OverviewRow
                          entry={entry}
                          key={`${entry.row.level}:${entry.row.key}`}
                          onOpen={onOpen}
                        />
                      ))
                    )}
                  </tbody>
                </Fragment>
              );
            })}
          </table>
        )}
      </div>
    </section>
  );
}
