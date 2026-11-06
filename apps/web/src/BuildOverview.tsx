import { useState } from "react";

import type { BuilderIssueTarget } from "./builder-diagnostics";
import {
  buildOverviewLevelChoiceCount,
  type BuildOverviewLevel,
} from "./build-overview";
import { NO_PICKS_LABEL } from "./builder-ui";
import { ChoiceStatusIcon } from "./ChoiceAccordionItem";
import { Icon } from "./Icon";

/**
 * The Overview tab (D113): every level's choices in one list, a section per
 * level with its rows grouped by kind. Each level's heading is the
 * Inventory's collapsible group band (`table-section-row`); levels start
 * expanded and, like the Inventory's groups, the collapsed ones are not
 * remembered. Each row is the slot's Build-tab heading and folded picks;
 * activating it opens that choice where it is edited, as an issue's Review
 * does.
 */
export function BuildOverview({
  levels,
  onOpen,
}: {
  /** Undefined while the editor's evaluation is still loading. */
  readonly levels: readonly BuildOverviewLevel[] | undefined;
  readonly onOpen: (target: BuilderIssueTarget) => void;
}) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<number>>(
    () => new Set(),
  );
  const toggle = (level: number) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (!next.delete(level)) next.add(level);
      return next;
    });
  return (
    <section
      aria-labelledby="build-overview-heading"
      className="choice-pane standalone-workspace-pane"
    >
      <header>
        <h3 id="build-overview-heading">Overview</h3>
      </header>
      <div className="standalone-workspace-content build-overview">
        {levels === undefined ? (
          <p>Evaluating character…</p>
        ) : (
          levels.map((entry) => {
            const { level, groups } = entry;
            const expanded = !collapsed.has(level);
            const bodyId = `build-overview-level-${level}-choices`;
            const count = buildOverviewLevelChoiceCount(entry);
            return (
              <section
                aria-labelledby={`build-overview-level-${level}`}
                className="build-overview-level"
                key={level}
              >
                <h4
                  className="build-overview-level-heading table-section-row"
                  id={`build-overview-level-${level}`}
                >
                  <button
                    aria-controls={bodyId}
                    aria-expanded={expanded}
                    className="table-section-toggle"
                    type="button"
                    onClick={() => toggle(level)}
                  >
                    <Icon name="chevron" />
                    <span className="build-overview-level-label">
                      <span>Level {level}</span>
                      <small
                        aria-label={`${count} ${count === 1 ? "choice" : "choices"}`}
                        className="table-section-count"
                      >
                        {count}
                      </small>
                    </span>
                  </button>
                </h4>
                <div
                  className="build-overview-level-choices"
                  hidden={!expanded}
                  id={bodyId}
                >
                  {!expanded ? null : groups.length === 0 ? (
                    <p className="build-overview-none">
                      No choices at this level
                    </p>
                  ) : (
                    groups.map((group) => (
                      <ul
                        aria-label={`Level ${level} ${group.title.toLocaleLowerCase()}`}
                        className="build-overview-group"
                        key={group.kind}
                      >
                        {group.rows.map((row) => (
                          <li key={row.key}>
                            <button
                              className={`build-overview-row${row.status === "unresolved" ? " is-unresolved" : ""}`}
                              type="button"
                              onClick={() => onOpen(row.target)}
                            >
                              <span className="build-overview-title">
                                {row.title}
                              </span>
                              <span className="build-overview-picks">
                                {row.picks ?? NO_PICKS_LABEL}
                              </span>
                              <ChoiceStatusIcon status={row.status} />
                            </button>
                          </li>
                        ))}
                      </ul>
                    ))
                  )}
                </div>
              </section>
            );
          })
        )}
      </div>
    </section>
  );
}
