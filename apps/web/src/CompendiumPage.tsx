import { useEffect, useMemo, useState } from "react";

import type { ContentEntity } from "@4ecb/content-domain";
import {
  FACET_KEYS,
  normalizeCompendiumQuery,
  serializeCompendiumQuery,
  type CompendiumQuery,
  type CompendiumQueryResult,
  type EntityRelationships,
  type FacetFilter,
  type FacetKey,
  type FacetResult,
} from "@4ecb/query-engine";

import { EntityDetailPage } from "./EntityDetailPage";
import { QueryWorkerClient, type QueryIndexInfo } from "./query-client";
import { compendiumHash } from "./routes";

interface SavedQuery {
  readonly id: string;
  readonly label: string;
  readonly queryString: string;
}

const SAVED_QUERY_KEY = "4ecb.saved-compendium-queries.v1";
const FACET_LABELS: Readonly<Record<FacetKey, string>> = {
  type: "Type",
  source: "Source",
  tier: "Tier",
  usage: "Usage",
  action: "Action",
  keyword: "Keyword",
  slot: "Item slot",
  rarity: "Rarity",
  class: "Class",
  race: "Race",
  ability: "Ability",
  category: "Category",
};

const ENTITY_PAGE_TYPES = [
  "Power",
  "Feat",
  "Magic Item",
  "Weapon",
  "Armor",
  "Gear",
  "Race",
  "Class",
  "Paragon Path",
  "Epic Destiny",
  "Background",
  "Theme",
  "Ritual",
] as const;

function loadSavedQueries(): SavedQuery[] {
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem(SAVED_QUERY_KEY) ?? "[]",
    );
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is SavedQuery =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as SavedQuery).id === "string" &&
        typeof (entry as SavedQuery).label === "string" &&
        typeof (entry as SavedQuery).queryString === "string",
    );
  } catch {
    return [];
  }
}

function storeSavedQueries(queries: readonly SavedQuery[]): void {
  localStorage.setItem(SAVED_QUERY_KEY, JSON.stringify(queries));
}

function facetFilter(query: CompendiumQuery, key: FacetKey): FacetFilter {
  return (
    query.facets.find((filter) => filter.key === key) ?? {
      key,
      include: [],
      exclude: [],
    }
  );
}

function updateFacet(
  query: CompendiumQuery,
  key: FacetKey,
  value: string,
  state: "any" | "include" | "exclude",
): CompendiumQuery {
  const current = facetFilter(query, key);
  const include = current.include.filter((candidate) => candidate !== value);
  const exclude = current.exclude.filter((candidate) => candidate !== value);
  if (state === "include") include.push(value);
  if (state === "exclude") exclude.push(value);
  return normalizeCompendiumQuery({
    ...query,
    facets: [
      ...query.facets.filter((filter) => filter.key !== key),
      { key, include, exclude },
    ],
    page: { ...query.page, offset: 0 },
  });
}

function FacetControl({
  facet,
  query,
  onChange,
}: {
  readonly facet: FacetResult;
  readonly query: CompendiumQuery;
  readonly onChange: (query: CompendiumQuery) => void;
}) {
  const [valueSearch, setValueSearch] = useState("");
  const selected = facetFilter(query, facet.key);
  const normalizedSearch = valueSearch.trim().toLocaleLowerCase();
  const values = new Map(
    facet.values
      .filter(
        (entry) =>
          normalizedSearch.length === 0 ||
          entry.value.toLocaleLowerCase().includes(normalizedSearch),
      )
      .slice(0, normalizedSearch.length === 0 ? 15 : 50)
      .map((entry) => [entry.value, entry.count]),
  );
  for (const value of [...selected.include, ...selected.exclude]) {
    if (!values.has(value)) values.set(value, 0);
  }
  if (values.size === 0) return null;
  return (
    <details
      className="facet"
      open={facet.key === "type" || facet.key === "source"}
    >
      <summary>
        {FACET_LABELS[facet.key]}
        {selected.include.length + selected.exclude.length === 0
          ? ""
          : ` (${selected.include.length + selected.exclude.length})`}
      </summary>
      {facet.values.length <= 15 ? null : (
        <label className="facet-search">
          Find {FACET_LABELS[facet.key].toLocaleLowerCase()}
          <input
            type="search"
            value={valueSearch}
            onChange={(event) => setValueSearch(event.currentTarget.value)}
          />
        </label>
      )}
      <ul>
        {[...values].map(([value, count]) => {
          const state = selected.include.includes(value)
            ? "include"
            : selected.exclude.includes(value)
              ? "exclude"
              : "any";
          return (
            <li key={value}>
              <span title={value}>{value}</span>
              <span className="facet-count">{count.toLocaleString()}</span>
              <select
                aria-label={`${FACET_LABELS[facet.key]} ${value}`}
                value={state}
                onChange={(event) =>
                  onChange(
                    updateFacet(
                      query,
                      facet.key,
                      value,
                      event.currentTarget.value as
                        "any" | "include" | "exclude",
                    ),
                  )
                }
              >
                <option value="any">Any</option>
                <option value="include">Include</option>
                <option value="exclude">Exclude</option>
              </select>
            </li>
          );
        })}
      </ul>
    </details>
  );
}

export interface CompendiumPageProps {
  readonly activePackId?: string;
  readonly query: CompendiumQuery;
  readonly entityId?: string;
}

export function CompendiumPage({
  activePackId,
  query,
  entityId,
}: CompendiumPageProps) {
  const [client, setClient] = useState<QueryWorkerClient>();
  const [indexInfo, setIndexInfo] = useState<QueryIndexInfo>();
  const [result, setResult] = useState<CompendiumQueryResult>();
  const [entity, setEntity] = useState<ContentEntity>();
  const [relationships, setRelationships] = useState<EntityRelationships>();
  const [status, setStatus] = useState(
    "Waiting for an active content profile…",
  );
  const [error, setError] = useState<string>();
  const [querying, setQuerying] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [draftText, setDraftText] = useState(query.text);
  const [minimumLevel, setMinimumLevel] = useState("");
  const [maximumLevel, setMaximumLevel] = useState("");
  const [savedName, setSavedName] = useState("");
  const [savedQueries, setSavedQueries] =
    useState<SavedQuery[]>(loadSavedQueries);
  const queryKey = useMemo(() => serializeCompendiumQuery(query), [query]);

  useEffect(() => {
    setDraftText(query.text);
    const range = query.ranges.find((candidate) => candidate.field === "level");
    setMinimumLevel(range?.minimum === undefined ? "" : String(range.minimum));
    setMaximumLevel(range?.maximum === undefined ? "" : String(range.maximum));
  }, [queryKey, query]);

  useEffect(() => {
    if (activePackId === undefined) {
      setClient(undefined);
      setIndexInfo(undefined);
      setResult(undefined);
      setStatus(
        "Activate a content profile in Settings to use the compendium.",
      );
      return;
    }
    let cancelled = false;
    setError(undefined);
    setIndexInfo(undefined);
    setResult(undefined);
    const nextClient = new QueryWorkerClient((phase, recordCount) => {
      if (cancelled) return;
      setStatus(
        phase === "loading-pack"
          ? "Loading the active pack from browser storage…"
          : `Building the search index for ${recordCount?.toLocaleString() ?? "the"} records…`,
      );
    });
    void nextClient
      .initialize(activePackId)
      .then((info) => {
        if (cancelled) return;
        setClient(nextClient);
        setIndexInfo(info);
        setStatus(
          `Indexed ${info.recordCount.toLocaleString()} records in ${Math.round(info.elapsedMilliseconds).toLocaleString()} ms.`,
        );
      })
      .catch((reason: unknown) => {
        if (!cancelled)
          setError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => {
      cancelled = true;
      nextClient.terminate("Active profile changed");
    };
  }, [activePackId]);

  useEffect(() => {
    if (client === undefined) return;
    let cancelled = false;
    setQuerying(true);
    setError(undefined);
    void client
      .query(query)
      .then((nextResult) => {
        if (!cancelled) setResult(nextResult);
      })
      .catch((reason: unknown) => {
        if (!cancelled)
          setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (!cancelled) setQuerying(false);
      });
    return () => {
      cancelled = true;
    };
  }, [client, queryKey, query]);

  useEffect(() => {
    if (client === undefined || entityId === undefined) {
      setEntity(undefined);
      setRelationships(undefined);
      setDetailLoading(false);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    setEntity(undefined);
    setRelationships(undefined);
    void Promise.all([
      client.getEntity(entityId),
      client.relationships(entityId),
    ])
      .then(([nextEntity, nextRelationships]) => {
        if (cancelled) return;
        setEntity(nextEntity);
        setRelationships(nextRelationships);
      })
      .catch((reason: unknown) => {
        if (!cancelled)
          setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [client, entityId]);

  function navigate(nextQuery: CompendiumQuery, nextEntityId?: string): void {
    window.location.hash = compendiumHash(nextQuery, nextEntityId);
  }

  function submitText(event: React.FormEvent): void {
    event.preventDefault();
    navigate(
      normalizeCompendiumQuery({
        ...query,
        text: draftText,
        sort: {
          ...query.sort,
          key: draftText.trim().length > 0 ? "relevance" : query.sort.key,
          direction:
            draftText.trim().length > 0 ? "descending" : query.sort.direction,
        },
        page: { ...query.page, offset: 0 },
      }),
    );
  }

  function applyLevelRange(event: React.FormEvent): void {
    event.preventDefault();
    const minimum =
      minimumLevel.trim() === "" ? undefined : Number(minimumLevel);
    const maximum =
      maximumLevel.trim() === "" ? undefined : Number(maximumLevel);
    navigate(
      normalizeCompendiumQuery({
        ...query,
        ranges: [
          ...query.ranges.filter((range) => range.field !== "level"),
          {
            field: "level",
            ...(minimum === undefined ? {} : { minimum }),
            ...(maximum === undefined ? {} : { maximum }),
          },
        ],
        page: { ...query.page, offset: 0 },
      }),
    );
  }

  function saveCurrentQuery(event: React.FormEvent): void {
    event.preventDefault();
    const label = savedName.trim();
    if (label.length === 0) return;
    const next = [
      ...savedQueries,
      { id: crypto.randomUUID(), label, queryString: queryKey },
    ];
    setSavedQueries(next);
    storeSavedQueries(next);
    setSavedName("");
  }

  if (activePackId === undefined) {
    return (
      <main className="compendium-page" id="main-content">
        <div className="empty-state">
          <h2>No active content profile</h2>
          <p>Install and activate a pack before searching the compendium.</p>
          <a href="#/settings">Open content settings</a>
        </div>
      </main>
    );
  }

  return (
    <main className="compendium-page" id="main-content">
      <header className="page-heading compendium-heading">
        <div>
          <p className="eyebrow">Active profile: {activePackId}</p>
          <h2>Compendium</h2>
        </div>
        <p className="status" aria-live="polite">
          {status}
        </p>
      </header>
      {error === undefined ? null : (
        <div className="error" role="alert">
          <strong>Compendium problem</strong>
          <span>{error}</span>
        </div>
      )}

      {indexInfo === undefined ? (
        <div className="loading-state">
          <p>{status}</p>
          <button
            type="button"
            onClick={() => {
              window.location.hash = "#/settings";
            }}
          >
            Cancel indexing
          </button>
        </div>
      ) : entityId !== undefined ? (
        <EntityDetailPage
          entityId={entityId}
          entity={entity}
          relationships={relationships}
          query={query}
          loading={detailLoading}
        />
      ) : (
        <>
          <nav className="entity-type-nav" aria-label="Compendium entry types">
            <a href={compendiumHash({})}>All</a>
            {ENTITY_PAGE_TYPES.map((type) => (
              <a
                key={type}
                aria-current={
                  facetFilter(query, "type").include.length === 1 &&
                  facetFilter(query, "type").include[0] === type
                    ? "page"
                    : undefined
                }
                href={compendiumHash(
                  updateFacet(
                    normalizeCompendiumQuery({
                      ...query,
                      facets: query.facets.filter(
                        (filter) => filter.key !== "type",
                      ),
                    }),
                    "type",
                    type,
                    "include",
                  ),
                )}
              >
                {type}
              </a>
            ))}
          </nav>
          <div className="compendium-workspace">
            <aside className="filter-panel" aria-label="Compendium filters">
              <form className="search-form" role="search" onSubmit={submitText}>
                <label htmlFor="compendium-search">
                  Search names and rules text
                </label>
                <div>
                  <input
                    id="compendium-search"
                    type="search"
                    value={draftText}
                    onChange={(event) =>
                      setDraftText(event.currentTarget.value)
                    }
                  />
                  <button type="submit">Search</button>
                </div>
                <p>Use quotation marks for an exact phrase.</p>
              </form>

              <form className="range-form" onSubmit={applyLevelRange}>
                <fieldset>
                  <legend>Level range</legend>
                  <label>
                    Minimum
                    <input
                      inputMode="numeric"
                      type="number"
                      value={minimumLevel}
                      onChange={(event) =>
                        setMinimumLevel(event.currentTarget.value)
                      }
                    />
                  </label>
                  <label>
                    Maximum
                    <input
                      inputMode="numeric"
                      type="number"
                      value={maximumLevel}
                      onChange={(event) =>
                        setMaximumLevel(event.currentTarget.value)
                      }
                    />
                  </label>
                  <button type="submit">Apply</button>
                </fieldset>
              </form>

              <div className="facet-list">
                {FACET_KEYS.flatMap((key) => {
                  const facet = result?.facets.find(
                    (candidate) => candidate.key === key,
                  );
                  return facet === undefined
                    ? []
                    : [
                        <FacetControl
                          key={key}
                          facet={facet}
                          query={query}
                          onChange={navigate}
                        />,
                      ];
                })}
              </div>

              <section
                className="saved-searches"
                aria-labelledby="saved-searches-heading"
              >
                <h3 id="saved-searches-heading">Saved searches</h3>
                <form onSubmit={saveCurrentQuery}>
                  <label>
                    Name this search
                    <input
                      value={savedName}
                      onChange={(event) =>
                        setSavedName(event.currentTarget.value)
                      }
                    />
                  </label>
                  <button type="submit">Save</button>
                </form>
                {savedQueries.length === 0 ? (
                  <p>No saved searches.</p>
                ) : (
                  <ul>
                    {savedQueries.map((saved) => (
                      <li key={saved.id}>
                        <a href={`#/compendium?${saved.queryString}`}>
                          {saved.label}
                        </a>
                        <button
                          type="button"
                          aria-label={`Delete saved search ${saved.label}`}
                          onClick={() => {
                            const next = savedQueries.filter(
                              (candidate) => candidate.id !== saved.id,
                            );
                            setSavedQueries(next);
                            storeSavedQueries(next);
                          }}
                        >
                          Delete
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </aside>

            <section
              className="results-panel"
              aria-labelledby="results-heading"
              aria-busy={querying}
            >
              {query.relatedTo === undefined ? null : (
                <div className="active-query-note">
                  Showing records related to <code>{query.relatedTo}</code>.{" "}
                  <a
                    href={compendiumHash({
                      ...query,
                      relatedTo: "",
                      page: { ...query.page, offset: 0 },
                    })}
                  >
                    Clear relationship filter
                  </a>
                </div>
              )}
              <header className="results-toolbar">
                <div>
                  <h3 id="results-heading">
                    {result?.total.toLocaleString() ?? "—"} results
                  </h3>
                  <p>
                    {querying
                      ? "Searching…"
                      : `${Math.round(result?.elapsedMilliseconds ?? 0)} ms`}
                  </p>
                </div>
                <div className="sort-controls">
                  <label>
                    Sort by
                    <select
                      value={query.sort.key}
                      onChange={(event) =>
                        navigate(
                          normalizeCompendiumQuery({
                            ...query,
                            sort: {
                              ...query.sort,
                              key: event.currentTarget
                                .value as CompendiumQuery["sort"]["key"],
                              direction:
                                event.currentTarget.value === "relevance"
                                  ? "descending"
                                  : "ascending",
                            },
                            page: { ...query.page, offset: 0 },
                          }),
                        )
                      }
                    >
                      <option value="relevance">Relevance</option>
                      <option value="name">Name</option>
                      <option value="type">Type</option>
                      <option value="level">Level</option>
                      <option value="source">Source</option>
                    </select>
                  </label>
                  <label>
                    Direction
                    <select
                      value={query.sort.direction}
                      onChange={(event) =>
                        navigate(
                          normalizeCompendiumQuery({
                            ...query,
                            sort: {
                              ...query.sort,
                              direction: event.currentTarget
                                .value as CompendiumQuery["sort"]["direction"],
                            },
                            page: { ...query.page, offset: 0 },
                          }),
                        )
                      }
                    >
                      <option value="ascending">Ascending</option>
                      <option value="descending">Descending</option>
                    </select>
                  </label>
                </div>
              </header>

              {result !== undefined && result.items.length === 0 ? (
                <div className="empty-state">
                  <h3>No matching entries</h3>
                  <p>
                    Remove a filter, broaden the level range, or try fewer
                    search terms.
                  </p>
                  <a href={compendiumHash({})}>Clear the search</a>
                </div>
              ) : (
                <ol className="search-results" start={query.page.offset + 1}>
                  {result?.items.map((item) => (
                    <li key={item.id}>
                      <a href={compendiumHash(query, item.id)}>
                        <span>
                          <strong>{item.name}</strong>
                          <span>{item.type}</span>
                        </span>
                        <span className="result-meta">
                          {item.level === undefined
                            ? ""
                            : `Level ${item.level} · `}
                          {item.source || "Unknown source"}
                        </span>
                        {item.summary.length === 0 ? null : (
                          <span>{item.summary}</span>
                        )}
                      </a>
                    </li>
                  ))}
                </ol>
              )}

              <nav className="pagination" aria-label="Search result pages">
                <button
                  type="button"
                  disabled={query.page.offset === 0}
                  onClick={() =>
                    navigate(
                      normalizeCompendiumQuery({
                        ...query,
                        page: {
                          ...query.page,
                          offset: Math.max(
                            0,
                            query.page.offset - query.page.limit,
                          ),
                        },
                      }),
                    )
                  }
                >
                  Previous
                </button>
                <span>
                  {result === undefined || result.total === 0
                    ? "Page 0 of 0"
                    : `Page ${Math.floor(query.page.offset / query.page.limit) + 1} of ${Math.ceil(result.total / query.page.limit)}`}
                </span>
                <button
                  type="button"
                  disabled={
                    result === undefined ||
                    query.page.offset + query.page.limit >= result.total
                  }
                  onClick={() =>
                    navigate(
                      normalizeCompendiumQuery({
                        ...query,
                        page: {
                          ...query.page,
                          offset: query.page.offset + query.page.limit,
                        },
                      }),
                    )
                  }
                >
                  Next
                </button>
              </nav>
            </section>
          </div>
        </>
      )}
    </main>
  );
}
