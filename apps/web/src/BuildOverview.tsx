import { Fragment, useMemo, useState } from "react";

import type { BuilderIssueTarget } from "./builder-diagnostics";
import {
  buildOverviewBands,
  buildOverviewGroupTitle,
  nextBuildOverviewSort,
  readBuildOverviewSort,
  writeBuildOverviewSort,
  type BuildOverviewLevel,
  type BuildOverviewSort,
  type BuildOverviewSortColumn,
} from "./build-overview";
import { NO_PICKS_LABEL } from "./builder-ui";
import { ChoiceStatusIcon } from "./ChoiceAccordionItem";
import { Icon } from "./Icon";

const COLUMN_COUNT = 5;

const SORT_COLUMNS: readonly {
  readonly column: BuildOverviewSortColumn;
  readonly label: string;
}[] = [
  { column: "level", label: "Level" },
  { column: "category", label: "Category" },
];

/**
 * The Overview tab (D113): every choice in one table (Level, Category,
 * Slot, Pick, status) that regroups by its sort column (D113 amendment,
 * 2026-11-16). Level and Category sort with the candidate tables' header
 * control; the chosen grouping is remembered like the library's sort. By
 * level, each level is a band holding the full history, retrains included;
 * by category, each category is a band holding what the character has now,
 * by level, a retrain noting what it replaced. Bands are the Inventory's
 * collapsible group band (`table-section-row`), all expanded at first and
 * not remembered. Rows alternate the candidate tables' stripes, restarting
 * under each band; activating one opens that choice where it is edited, as
 * an issue's Review does.
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
          <>
            <p className="build-overview-hint" id="build-overview-hint">
              {`Grouped by ${byLevel ? "level" : "category"} — select the Level or Category heading to regroup.`}
            </p>
            <table
              aria-describedby="build-overview-hint"
              aria-labelledby="build-overview-heading"
              className="build-overview-table"
            >
              <colgroup>
                <col className="build-overview-col-level" />
                <col className="build-overview-col-category" />
                <col className="build-overview-col-slot" />
                <col />
                <col className="build-overview-col-status" />
              </colgroup>
              <thead>
                <tr>
                  {SORT_COLUMNS.map(({ column, label }) => (
                    <th
                      aria-sort={
                        sort.column === column ? sort.direction : "none"
                      }
                      key={column}
                      scope="col"
                    >
                      <button
                        aria-label={`Sort by ${label}`}
                        className="selection-sort-button"
                        type="button"
                        onClick={() => sortBy(column)}
                      >
                        {label}
                        <Icon name="chevron" />
                      </button>
                    </th>
                  ))}
                  <th scope="col">Slot</th>
                  <th scope="col">Pick</th>
                  <th scope="col">
                    <span className="visually-hidden">Status</span>
                  </th>
                </tr>
              </thead>
              {bands.map((band) => {
                const expanded = !collapsed.has(band.key);
                const id = `build-overview-${band.key.replace(":", "-")}`;
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
                        band.rows.map(({ row, picks, note }) => (
                          <tr
                            className={`build-overview-choice${row.status === "unresolved" ? " is-unresolved" : ""}`}
                            key={`${row.level}:${row.key}`}
                            onClick={() => onOpen(row.target)}
                          >
                            <td className="build-overview-cell-level">
                              {row.level}
                            </td>
                            <td className="build-overview-cell-category">
                              {buildOverviewGroupTitle(row.kind)}
                            </td>
                            <td className="build-overview-title">
                              {/* The row's one focus stop; a click anywhere
                                  on the row lands here too (bubbling). */}
                              <button
                                className="build-overview-row"
                                type="button"
                              >
                                {row.title}
                              </button>
                            </td>
                            <td className="build-overview-picks">
                              {picks ?? NO_PICKS_LABEL}
                              {note === undefined ? null : (
                                <span className="build-overview-note">
                                  {` (${note})`}
                                </span>
                              )}
                            </td>
                            <td className="build-overview-status">
                              <ChoiceStatusIcon status={row.status} />
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </Fragment>
                );
              })}
            </table>
          </>
        )}
      </div>
    </section>
  );
}
