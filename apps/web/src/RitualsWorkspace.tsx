import { Fragment, useEffect, useMemo, useRef, useState } from "react";

import type { BuildKnownEntry, CharacterBuild } from "@4ecb/character-domain";
import type { ContentEntity } from "@4ecb/content-domain";
import {
  eligibleRitualAllowances,
  knownRecords,
  ritualAllowanceStatuses,
  ritualCostPercent,
  type EvaluatedCharacter,
  type KnownRecord,
  type RitualAllowance,
  type RitualAllowanceKind,
  type RitualAllowanceStatus,
} from "@4ecb/rules-engine";

import { contentSpecificValue } from "./builder-ui";
import { DotList } from "./DotList";
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

/**
 * Why the character knows a record: its grant, or how and when it was
 * learned, with the provider of the free-ritual allowance it used.
 */
export function knownRecordSourceLabel(
  record: KnownRecord,
  allowanceProvider: (key: string) => string | undefined = () => undefined,
): string {
  const { source } = record;
  if (source.kind === "granted")
    return source.provider === "" ? "Granted" : `Granted by ${source.provider}`;
  if (source.acquisition === "bought")
    return `Bought at level ${source.acquiredLevel}`;
  const provider =
    source.allowance === undefined
      ? undefined
      : allowanceProvider(source.allowance);
  return `Learned free at level ${source.acquiredLevel}${provider === undefined ? "" : ` (${provider})`}`;
}

const ALLOWANCE_NOUNS: Readonly<
  Record<RitualAllowanceKind, readonly [string, string]>
> = {
  Ritual: ["ritual", "rituals"],
  "Alchemical Formula": ["alchemical formula", "alchemical formulas"],
  "Martial Practice": ["martial practice", "martial practices"],
};

function listNames(names: readonly string[]): string {
  return names.length <= 1
    ? (names[0] ?? "")
    : `${names.slice(0, -1).join(", ")} or ${names.at(-1)!}`;
}

/**
 * What an allowance still covers: "2 free 1st-level rituals", "1 free
 * ritual of level 5 or lower", "1 free ritual: Sending or Tenser's Floating
 * Disk". Undefined once nothing remains (used up, or not yet earned).
 */
export function ritualAllowanceLabel(
  status: RitualAllowanceStatus,
  nameOf: (id: string) => string = (id) => id,
): string | undefined {
  if (status.remaining <= 0) return undefined;
  const [one, many] = ALLOWANCE_NOUNS[status.allowance.kind];
  const noun = (count: number) => (count === 1 ? one : many);
  const parts = status.remainders.map(({ count, maxLevel }) =>
    maxLevel === undefined
      ? `${count} free ${noun(count)}`
      : maxLevel <= 1
        ? `${count} free 1st-level ${noun(count)}`
        : `${count} free ${noun(count)} of level ${maxLevel} or lower`,
  );
  const from =
    status.allowance.from === undefined
      ? ""
      : `: ${listNames(status.allowance.from.map(nameOf))}`;
  return `${parts.join(" and ")}${from}`;
}

/** One provider's remaining free-ritual allowances, as the Rituals tab
 *  shows them: a "Free rituals (Psion)" heading, then a line each. */
export interface RitualAllowanceGroup {
  readonly providerId: string;
  /** "Free rituals", or the provider's one other kind ("Free martial
   *  practices"). */
  readonly heading: string;
  readonly provider: string;
  readonly lines: readonly { readonly key: string; readonly label: string }[];
}

/** The allowance statuses grouped by provider, in order, keeping only what
 *  remains: a used-up allowance has no line, and a provider with none left
 *  has no group. */
export function ritualAllowanceGroups(
  statuses: readonly RitualAllowanceStatus[],
  nameOf: (id: string) => string = (id) => id,
): readonly RitualAllowanceGroup[] {
  const byProvider = new Map<string, RitualAllowanceStatus[]>();
  for (const status of statuses) {
    const providerKey = status.allowance.providerId.toLocaleLowerCase();
    const group = byProvider.get(providerKey);
    if (group === undefined) byProvider.set(providerKey, [status]);
    else group.push(status);
  }
  return [...byProvider.values()].flatMap((group) => {
    const lines = group.flatMap((status) => {
      const label = ritualAllowanceLabel(status, nameOf);
      return label === undefined ? [] : [{ key: status.allowance.key, label }];
    });
    if (lines.length === 0) return [];
    const kinds = new Set(group.map(({ allowance }) => allowance.kind));
    const [kind] = kinds;
    const plural =
      kinds.size === 1 && kind !== undefined
        ? ALLOWANCE_NOUNS[kind][1]
        : ALLOWANCE_NOUNS.Ritual[1];
    const first = group[0]!.allowance;
    return [
      {
        providerId: first.providerId,
        heading: `Free ${plural}`,
        provider: first.provider,
        lines,
      },
    ];
  });
}

/** Chooses the allowance a free ritual uses when several fit (Learn free).
 *  Each option names its provider and what it still covers, since one
 *  provider can have several (a Psion's any 1st-level ritual, and Sending or
 *  Tenser's Floating Disk). */
export function AllowanceChoiceDialog({
  name,
  allowances,
  describe,
  onLearn,
  onCancel,
}: {
  readonly name: string;
  readonly allowances: readonly RitualAllowance[];
  readonly describe: (allowance: RitualAllowance) => string | undefined;
  readonly onLearn: (allowance: RitualAllowance | undefined) => void;
  readonly onCancel: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [chosen, setChosen] = useState(allowances[0]?.key ?? "");
  useEffect(() => {
    const current = dialog.current;
    if (current !== null && !current.open) current.showModal();
  }, []);
  return (
    <dialog
      aria-labelledby="ritual-allowance-title"
      className="ritual-allowance-dialog dialog-shell"
      ref={dialog}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <header>
        <h2 id="ritual-allowance-title">Learn {name} free</h2>
        <button
          aria-label="Close"
          className="button-icon dialog-close"
          title="Close"
          type="button"
          onClick={onCancel}
        >
          <Icon name="remove" />
        </button>
      </header>
      <fieldset className="ritual-allowance-body">
        <legend>Use a free ritual from</legend>
        {allowances.map((allowance) => (
          <label className="dialog-choice" key={allowance.key}>
            <input
              type="radio"
              name="ritual-allowance"
              checked={chosen === allowance.key}
              onChange={() => setChosen(allowance.key)}
            />
            <DotList
              items={[
                allowance.provider,
                describe(allowance) === undefined ? undefined : (
                  <span className="ritual-allowance-option-detail">
                    {describe(allowance)}
                  </span>
                ),
              ]}
            />
          </label>
        ))}
        <label className="dialog-choice">
          <input
            type="radio"
            name="ritual-allowance"
            checked={chosen === ""}
            onChange={() => setChosen("")}
          />
          <span>None (a gift)</span>
        </label>
      </fieldset>
      <footer>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button
          className="button-primary"
          type="button"
          onClick={() => onLearn(allowances.find(({ key }) => key === chosen))}
        >
          Learn free
        </button>
      </footer>
    </dialog>
  );
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
  const [pendingFree, setPendingFree] = useState<{
    readonly entity: ContentEntity;
    readonly allowances: readonly RitualAllowance[];
  }>();
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
  const statuses = useMemo(
    () =>
      evaluation === undefined
        ? []
        : ritualAllowanceStatuses(
            build,
            evaluation,
            (id) => byId.get(id.toLocaleLowerCase()),
            build.effectiveLevel,
          ),
    [build, evaluation, byId],
  );
  const nameOf = (id: string) => byId.get(id.toLocaleLowerCase())?.name ?? id;
  const allowanceProvider = (allowanceKey: string) =>
    statuses.find(
      ({ allowance }) =>
        allowance.key.toLocaleLowerCase() === allowanceKey.toLocaleLowerCase(),
    )?.allowance.provider;
  const allowanceGroups = ritualAllowanceGroups(statuses, nameOf);
  const learn = (
    entity: ContentEntity,
    priceCopper: number,
    allowance?: RitualAllowance,
  ) =>
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
        ...(allowance === undefined ? {} : { allowance: allowance.key }),
      },
      priceCopper,
    );
  const learnFree = (entity: ContentEntity) => {
    const eligible = eligibleRitualAllowances(
      statuses,
      entity,
      build.effectiveLevel,
    );
    if (eligible.length > 1) setPendingFree({ entity, allowances: eligible });
    else learn(entity, 0, eligible[0]);
  };
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
            note: knownRecordSourceLabel(record, allowanceProvider),
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
          {/* Status, not a control: it holds only what is still free, so
              it goes once every allowance is used. */}
          {allowanceGroups.length === 0 ? null : (
            <div className="rituals-allowance">
              {allowanceGroups.map(
                ({ providerId, heading, provider, lines }) => (
                  <div className="rituals-allowance-group" key={providerId}>
                    <p className="rituals-allowance-heading">
                      <strong>{heading}</strong>
                      {provider === "" ? null : (
                        <span className="rituals-allowance-source">
                          {" "}
                          ({provider})
                        </span>
                      )}
                    </p>
                    {lines.map(({ key, label }) => (
                      <p className="rituals-allowance-count" key={key}>
                        {label}
                      </p>
                    ))}
                  </div>
                ),
              )}
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
                              <span className="table-section-label">
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
                              const sourceLabel = knownRecordSourceLabel(
                                record,
                                allowanceProvider,
                              );
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
                ritualCostPercent={ritualCostPercent(evaluation?.stats ?? {})}
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
                  priceCopper > 0
                    ? learn(entity, priceCopper)
                    : learnFree(entity)
                }
              />
            </>
          )}
        </div>
        {pendingFree === undefined ? null : (
          <AllowanceChoiceDialog
            name={pendingFree.entity.name}
            allowances={pendingFree.allowances}
            describe={(allowance) => {
              const status = statuses.find(
                (candidate) =>
                  candidate.allowance.key.toLocaleLowerCase() ===
                  allowance.key.toLocaleLowerCase(),
              );
              return status === undefined
                ? undefined
                : ritualAllowanceLabel(status, nameOf);
            }}
            onCancel={() => setPendingFree(undefined)}
            onLearn={(allowance) => {
              learn(pendingFree.entity, 0, allowance);
              setPendingFree(undefined);
            }}
          />
        )}
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
