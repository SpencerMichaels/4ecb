import type { ContentEntity } from "@4ecb/content-domain";
import type { CompendiumQuery, EntityRelationships } from "@4ecb/query-engine";

import { compendiumHash } from "./routes";

export interface EntityDetailPageProps {
  readonly entityId: string;
  readonly entity: ContentEntity | undefined;
  readonly relationships: EntityRelationships | undefined;
  readonly query: CompendiumQuery;
  readonly loading: boolean;
}

export function EntityDetailPage({
  entityId,
  entity,
  relationships,
  query,
  loading,
}: EntityDetailPageProps) {
  if (loading) {
    return <p className="loading-state">Loading compendium entry…</p>;
  }
  if (entity === undefined) {
    return (
      <div className="empty-state" role="status">
        <h2>Entry not found</h2>
        <p>
          No record with ID {entityId} exists in the active content profile.
        </p>
        <a href={compendiumHash(query)}>Return to search</a>
      </div>
    );
  }

  return (
    <article className="compendium-detail" aria-labelledby="entity-heading">
      <a className="back-link" href={compendiumHash(query)}>
        ← Back to results
      </a>
      <header className="detail-heading">
        <div>
          <p className="eyebrow">{entity.type}</p>
          <h2 id="entity-heading">{entity.name}</h2>
          <p className="identifier">{entity.id}</p>
        </div>
      </header>

      <dl className="facts">
        <div>
          <dt>Source</dt>
          <dd>{entity.source || "Not specified"}</dd>
        </div>
        <div>
          <dt>Revision</dt>
          <dd>{entity.revisionDate ?? "Not specified"}</dd>
        </div>
        <div>
          <dt>Categories</dt>
          <dd>{entity.categories.join(", ") || "None"}</dd>
        </div>
        <div>
          <dt>Rules</dt>
          <dd>{entity.rules.length.toLocaleString()}</dd>
        </div>
      </dl>

      {entity.flavor === undefined ? null : (
        <section>
          <h3>Flavor</h3>
          <p>{entity.flavor}</p>
        </section>
      )}
      {entity.prerequisites === undefined ? null : (
        <section>
          <h3>Prerequisites</h3>
          <p className="preserve-lines">{entity.prerequisites}</p>
        </section>
      )}
      {entity.description.length === 0 ? null : (
        <section>
          <h3>Description</h3>
          <p className="preserve-lines">{entity.description}</p>
        </section>
      )}
      {entity.specifics.length === 0 ? null : (
        <section>
          <h3>Fields</h3>
          <dl className="field-list">
            {entity.specifics.map((field) => (
              <div key={`${field.ordinal}-${field.name}`}>
                <dt>{field.name || "Unnamed field"}</dt>
                <dd className="preserve-lines">{field.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      {entity.rules.length === 0 ? null : (
        <details className="rule-details">
          <summary>Rule statements ({entity.rules.length})</summary>
          <ol>
            {entity.rules.map((rule) => (
              <li key={`${rule.ordinal}-${rule.name}`}>
                <strong>{rule.name}</strong>
                {rule.attributes.length === 0 ? null : (
                  <dl className="rule-attributes">
                    {rule.attributes.map((attribute, index) => (
                      <div key={`${index}-${attribute.name}`}>
                        <dt>{attribute.name}</dt>
                        <dd>{attribute.value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                {rule.text.length === 0 ? null : <p>{rule.text}</p>}
              </li>
            ))}
          </ol>
        </details>
      )}

      {relationships === undefined ||
      (relationships.references.length === 0 &&
        relationships.referencedBy.length === 0) ? null : (
        <section className="relationships">
          <div className="relationship-heading">
            <h3>Related entries</h3>
            <a
              href={compendiumHash({
                ...query,
                text: "",
                facets: [],
                ranges: [],
                relatedTo: entity.id,
                page: { ...query.page, offset: 0 },
              })}
            >
              Search all related entries
            </a>
          </div>
          {relationships.references.length === 0 ? null : (
            <div>
              <h4>This entry references</h4>
              <ul>
                {relationships.references.map((item) => (
                  <li key={item.id}>
                    <a href={compendiumHash(query, item.id)}>{item.name}</a>{" "}
                    <span>({item.type})</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {relationships.referencedBy.length === 0 ? null : (
            <div>
              <h4>Referenced by</h4>
              <ul>
                {relationships.referencedBy.map((item) => (
                  <li key={item.id}>
                    <a href={compendiumHash(query, item.id)}>{item.name}</a>{" "}
                    <span>({item.type})</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </article>
  );
}
