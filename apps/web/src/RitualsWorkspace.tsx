import { Fragment, useMemo, useState } from "react";

import type { BuildKnownEntry, CharacterBuild } from "@4ecb/character-domain";
import type { ContentEntity } from "@4ecb/content-domain";
import {
  freeRitualAllowanceTexts,
  knownRecords,
  type EvaluatedCharacter,
  type KnownRecord,
} from "@4ecb/rules-engine";

import { contentSpecificValue } from "./builder-ui";
import { ItemDetail, type InspectedItemDetail } from "./EquipmentWorkspace";
import { practiceKind, type ShopBrowseId } from "./equipment-ui";
import { Icon } from "./Icon";
import type { RitualCategory } from "./routes";
import { ShopWorkspace } from "./ShopWorkspace";
import { useArmedAction } from "./useArmedAction";

export type KnownRecordKind =
  "ritual" | "alchemical-formula" | "martial-practice";

/** The three known-record groups, always shown (no surprise controls). */
export const KNOWN_RECORD_GROUPS: readonly {
  readonly kind: KnownRecordKind;
  readonly label: string;
  readonly empty: string;
}[] = [
  { kind: "ritual", label: "Rituals", empty: "No rituals known." },
  {
    kind: "alchemical-formula",
    label: "Alchemical formulas",
    empty: "No alchemical formulas known.",
  },
  {
    kind: "martial-practice",
    label: "Martial practices",
    empty: "No martial practices known.",
  },
];

export function knownRecordKind(record: KnownRecord): KnownRecordKind {
  const kind =
    record.entity === undefined ? undefined : practiceKind(record.entity);
  return kind === "alchemical-formula" || kind === "martial-practice"
    ? kind
    : "ritual";
}

/** Why the character knows a record: its grant, or how and when it was learned. */
export function knownRecordSourceLabel(record: KnownRecord): string {
  const { source } = record;
  if (source.kind === "granted")
    return source.provider === "" ? "Granted" : `Granted by ${source.provider}`;
  return source.acquisition === "bought"
    ? `Bought at level ${source.acquiredLevel}`
    : `Learned free at level ${source.acquiredLevel}`;
}

export function groupKnownRecords(
  records: readonly KnownRecord[],
): ReadonlyMap<KnownRecordKind, readonly KnownRecord[]> {
  const groups = new Map<KnownRecordKind, KnownRecord[]>(
    KNOWN_RECORD_GROUPS.map(({ kind }) => [kind, []]),
  );
  for (const record of records)
    groups.get(knownRecordKind(record))!.push(record);
  for (const group of groups.values())
    group.sort((left, right) =>
      (left.entity?.name ?? left.element.name).localeCompare(
        right.entity?.name ?? right.element.name,
      ),
    );
  return groups;
}

function recordKey(record: KnownRecord): string {
  return (
    record.element.definitionId ??
    `${record.element.type}\0${record.element.name}`
  ).toLocaleLowerCase();
}

export function RitualsWorkspace({
  build,
  entities,
  byId,
  evaluation,
  walletCopper,
  category,
  onCategoryChange,
  onLearn,
  onRemove,
}: {
  readonly build: CharacterBuild;
  readonly entities: readonly ContentEntity[];
  readonly byId: ReadonlyMap<string, ContentEntity>;
  readonly evaluation: EvaluatedCharacter | undefined;
  readonly walletCopper: number;
  /** Set while learning: the catalog being browsed. */
  readonly category: RitualCategory | undefined;
  readonly onCategoryChange: (category: RitualCategory | undefined) => void;
  readonly onLearn: (entry: BuildKnownEntry, priceCopper: number) => void;
  readonly onRemove: (entryId: string) => void;
}) {
  const [inspected, setInspected] = useState<
    InspectedItemDetail & { readonly note?: string }
  >();
  const removeAction = useArmedAction("known-remove-trigger");
  const records = useMemo(
    () =>
      knownRecords(
        build,
        evaluation,
        (id) => byId.get(id.toLocaleLowerCase()),
        build.effectiveLevel,
      ),
    [build, evaluation, byId],
  );
  const groups = useMemo(() => groupKnownRecords(records), [records]);
  const knownIds = useMemo(() => new Set(records.map(recordKey)), [records]);
  const allowances = freeRitualAllowanceTexts(evaluation);
  const ownedDefinitions = useMemo(
    () =>
      (evaluation?.activeDefinitionIds ?? []).flatMap((id) => {
        const entity = byId.get(id.toLocaleLowerCase());
        return entity === undefined ? [] : [entity];
      }),
    [evaluation, byId],
  );

  const inspectRecord = (record: KnownRecord) =>
    setInspected(
      record.entity === undefined
        ? undefined
        : {
            entities: [record.entity],
            displayName: record.entity.name,
            effectiveLevel: build.effectiveLevel,
            note: knownRecordSourceLabel(record),
          },
    );

  return (
    <section
      aria-label="Rituals"
      className="choice-pane standalone-workspace-pane equipment-pane"
    >
      <div className="equipment-workspace">
        <div
          className="equipment-primary"
          aria-label={
            category === undefined ? "Known rituals" : "Learn rituals"
          }
        >
          {allowances.length === 0 ? null : (
            <div className="rituals-allowance">
              {allowances.map(({ text, provider }) => (
                <p key={text}>
                  <strong>Free rituals:</strong> {text}
                  {provider === "" ? null : (
                    <span className="rituals-allowance-source">
                      {" "}
                      ({provider})
                    </span>
                  )}
                </p>
              ))}
            </div>
          )}
          {category === undefined ? (
            <>
              <header className="rituals-known-header">
                <h3>
                  Known{" "}
                  <span className="table-section-count">{records.length}</span>
                </h3>
                <button
                  type="button"
                  onClick={() => onCategoryChange("rituals")}
                >
                  <Icon name="book" /> Learn rituals
                </button>
              </header>
              <div className="equipment-table-scroll inventory-table-scroll">
                <table className="inventory-table rituals-known-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Level</th>
                      <th>Category</th>
                      <th>Key skill</th>
                      <th>
                        <span className="visually-hidden">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  {KNOWN_RECORD_GROUPS.map(({ kind, label, empty }) => {
                    const group = groups.get(kind) ?? [];
                    return (
                      <Fragment key={kind}>
                        <tbody>
                          <tr className="inventory-category-row table-section-row">
                            <th colSpan={5} scope="rowgroup">
                              <span className="inventory-category-label">
                                <span>{label}</span>
                                <small className="table-section-count">
                                  {group.length}
                                </small>
                              </span>
                            </th>
                          </tr>
                        </tbody>
                        <tbody>
                          {group.length === 0 ? (
                            <tr className="rituals-empty-row">
                              <td colSpan={5}>{empty}</td>
                            </tr>
                          ) : (
                            group.map((record) => {
                              const name =
                                record.entity?.name ?? record.element.name;
                              const sourceLabel =
                                knownRecordSourceLabel(record);
                              const entryId =
                                record.source.kind === "learned"
                                  ? record.source.entryId
                                  : undefined;
                              const armed =
                                entryId !== undefined &&
                                removeAction.isArmed(entryId);
                              const value = (field: string) =>
                                (record.entity === undefined
                                  ? undefined
                                  : contentSpecificValue(record.entity, field)
                                )?.trim() || "—";
                              return (
                                <tr
                                  className="table-clickable-row"
                                  key={recordKey(record)}
                                  onClick={() => inspectRecord(record)}
                                >
                                  <th scope="row">
                                    <button
                                      type="button"
                                      className="table-inspect-button inventory-item-button"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        inspectRecord(record);
                                      }}
                                    >
                                      <span className="inventory-item-icon item-icon">
                                        <Icon name="book" />
                                      </span>
                                      <span className="inventory-item-copy">
                                        <span className="inventory-item-name">
                                          {name}
                                        </span>
                                        <small className="rituals-known-source">
                                          {sourceLabel}
                                        </small>
                                      </span>
                                    </button>
                                  </th>
                                  <td>{value("Level")}</td>
                                  <td>{value("Category")}</td>
                                  <td>{value("Key Skill")}</td>
                                  <td className="inventory-actions-cell">
                                    {entryId === undefined ? null : (
                                      <div
                                        className="inventory-row-actions"
                                        onClick={(event) =>
                                          event.stopPropagation()
                                        }
                                      >
                                        <button
                                          type="button"
                                          className="inventory-icon-action inventory-remove-action button-icon"
                                          data-known-remove-trigger={entryId}
                                          data-armed={armed || undefined}
                                          aria-label={
                                            armed
                                              ? `Confirm removing ${name}`
                                              : `Remove ${name}`
                                          }
                                          title={
                                            armed
                                              ? "Click again to remove"
                                              : "Remove"
                                          }
                                          onClick={() => {
                                            if (!armed) {
                                              removeAction.arm(entryId);
                                              return;
                                            }
                                            removeAction.disarm();
                                            onRemove(entryId);
                                          }}
                                        >
                                          <Icon
                                            name={armed ? "warning" : "trash"}
                                          />
                                        </button>
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </Fragment>
                    );
                  })}
                </table>
              </div>
            </>
          ) : (
            <>
              <header className="rituals-known-header">
                <button
                  type="button"
                  onClick={() => onCategoryChange(undefined)}
                >
                  <Icon name="back" /> Known rituals
                </button>
              </header>
              <ShopWorkspace
                mode="learning"
                browse={category}
                characterLevel={build.effectiveLevel}
                entities={entities}
                inventory={build.inventory}
                ownedDefinitions={ownedDefinitions}
                walletCopper={walletCopper}
                knownDefinitionIds={knownIds}
                onInspect={(entity, displayName) =>
                  setInspected({
                    entities: [entity],
                    displayName,
                    effectiveLevel: build.effectiveLevel,
                  })
                }
                onAcquire={() => undefined}
                onBrowseChange={(browse: ShopBrowseId) =>
                  onCategoryChange(browse as RitualCategory)
                }
                onLearn={(entity, priceCopper) =>
                  onLearn(
                    {
                      id: `web:${crypto.randomUUID()}`,
                      acquiredLevel: build.effectiveLevel,
                      element: {
                        definitionId: entity.id,
                        name: entity.name,
                        type: entity.type,
                      },
                      acquisition: priceCopper > 0 ? "bought" : "free",
                    },
                    priceCopper,
                  )
                }
              />
            </>
          )}
        </div>
        <div className="shared-choice-detail shop-rail">
          <ItemDetail
            byId={byId}
            item={inspected}
            {...(inspected?.note === undefined ? {} : { note: inspected.note })}
            empty={{
              heading: "Choose a ritual to inspect it",
              hint: "Known rituals, formulas and practices, and the catalog you learn them from, show here.",
            }}
          />
        </div>
      </div>
    </section>
  );
}
