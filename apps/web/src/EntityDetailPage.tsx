import type { ContentEntity } from "@4ecb/content-domain";
import type { CompendiumQuery, EntityRelationships } from "@4ecb/query-engine";

import { EntityCardBody, EntityCardHeader } from "./EntityCard";
import { compendiumHash } from "./routes";
import { entityVisualTone, visualToneClass } from "./visual-language";

export interface EntityDetailPageProps {
  readonly entityId: string;
  readonly entity: ContentEntity | undefined;
  readonly relationships: EntityRelationships | undefined;
  readonly query: CompendiumQuery;
  readonly loading: boolean;
  readonly hideFlavortext: boolean;
}

export function EntityDetailPage({
  entityId,
  entity,
  relationships,
  query,
  loading,
  hideFlavortext,
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
    <article
      className={`compendium-detail ${visualToneClass(entityVisualTone(entity))}`}
      aria-labelledby="entity-heading"
    >
      <a className="back-link" href={compendiumHash(query)}>
        ← Back to results
      </a>
      <header className="detail-heading">
        <EntityCardHeader
          entity={entity}
          headingId="entity-heading"
          headingLevel={2}
          subheading={<p className="identifier">{entity.id}</p>}
        />
      </header>
      <EntityCardBody
        entity={entity}
        hideFlavortext={hideFlavortext}
        afterNarrative={
          <>
            <dl className="facts">
              <div>
                <dt>Revision</dt>
                <dd>{entity.revisionDate ?? "Not specified"}</dd>
              </div>
              <div>
                <dt>Rules</dt>
                <dd>{entity.rules.length.toLocaleString()}</dd>
              </div>
            </dl>
          </>
        }
        afterFields={
          <>
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
                          <a href={compendiumHash(query, item.id)}>
                            {item.name}
                          </a>{" "}
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
                          <a href={compendiumHash(query, item.id)}>
                            {item.name}
                          </a>{" "}
                          <span>({item.type})</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
            )}
          </>
        }
      />
    </article>
  );
}
