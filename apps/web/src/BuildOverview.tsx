import type { BuilderIssueTarget } from "./builder-diagnostics";
import type { BuildOverviewLevel } from "./build-overview";
import { NO_PICKS_LABEL } from "./builder-ui";
import { ChoiceStatusIcon } from "./ChoiceAccordionItem";

/**
 * The Overview tab (D113): every level's choices in one list, a section per
 * level with its rows grouped by kind. Each row is the slot's Build-tab
 * heading and folded picks; activating it opens that choice where it is
 * edited, as an issue's Review does.
 */
export function BuildOverview({
  levels,
  onOpen,
}: {
  /** Undefined while the editor's evaluation is still loading. */
  readonly levels: readonly BuildOverviewLevel[] | undefined;
  readonly onOpen: (target: BuilderIssueTarget) => void;
}) {
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
          levels.map(({ level, groups }) => (
            <section
              aria-labelledby={`build-overview-level-${level}`}
              className="build-overview-level"
              key={level}
            >
              <h4
                className="build-overview-level-heading"
                id={`build-overview-level-${level}`}
              >
                Level {level}
                {groups.length === 0 ? (
                  <span className="build-overview-none">
                    No choices at this level
                  </span>
                ) : null}
              </h4>
              {groups.map((group) => (
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
              ))}
            </section>
          ))
        )}
      </div>
    </section>
  );
}
