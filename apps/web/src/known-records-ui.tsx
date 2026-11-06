import { useEffect, useMemo, useRef, useState } from "react";

import type { BuildKnownEntry, CharacterBuild } from "@4ecb/character-domain";
import type { ContentEntity } from "@4ecb/content-domain";
import {
  knownRecords,
  ritualAllowanceStatuses,
  ritualCostPercent,
  type EvaluatedCharacter,
  type KnownRecord,
  type RitualAllowance,
  type RitualAllowanceKind,
  type RitualAllowanceStatus,
} from "@4ecb/rules-engine";

import { DotList } from "./DotList";
import { practiceKind } from "./equipment-ui";
import { Icon } from "./Icon";

/*
 * Known rituals, alchemical formulas and martial practices (D114): the
 * Shop's learning categories learn them and the Inventory lists them, with
 * the free-ritual allowances that are still left.
 */

export type KnownRecordKind =
  "ritual" | "alchemical-formula" | "martial-practice";

/** The Inventory's known-record groups, in order. */
export const KNOWN_RECORD_GROUPS: readonly {
  readonly kind: KnownRecordKind;
  readonly label: string;
}[] = [
  { kind: "ritual", label: "Rituals known" },
  { kind: "alchemical-formula", label: "Alchemical formulas known" },
  { kind: "martial-practice", label: "Martial practices known" },
];

export function knownRecordKind(record: KnownRecord): KnownRecordKind {
  const kind =
    record.entity === undefined ? undefined : practiceKind(record.entity);
  return kind === "alchemical-formula" || kind === "martial-practice"
    ? kind
    : "ritual";
}

/**
 * Why the character knows a record, where it matters: its grant or Build-tab
 * choice (it can't be removed here), or the free-ritual allowance it used. A bought record says
 * nothing, and no source names a level: the list is current state.
 */
export function knownRecordSourceLabel(
  record: KnownRecord,
  allowanceProvider: (key: string) => string | undefined = () => undefined,
): string | undefined {
  const { source } = record;
  if (source.kind === "granted" && source.via === "choice")
    return source.provider === "" ? "Chosen" : `Chosen for ${source.provider}`;
  if (source.kind === "granted")
    return source.provider === "" ? "Granted" : `Granted by ${source.provider}`;
  if (source.acquisition === "bought") return undefined;
  const provider =
    source.allowance === undefined
      ? undefined
      : allowanceProvider(source.allowance);
  return provider === undefined ? "Learned free" : `Learned free (${provider})`;
}

const ALLOWANCE_NOUNS: Readonly<
  Record<RitualAllowanceKind, readonly [string, string]>
> = {
  Ritual: ["ritual", "rituals"],
  "Alchemical Formula": ["alchemical formula", "alchemical formulas"],
  "Martial Practice": ["martial practice", "martial practices"],
};

/**
 * What an allowance still covers: "2 free 1st-level rituals", "1 free
 * ritual of level 5 or lower". Undefined once nothing remains (used up, or
 * not yet earned).
 */
export function ritualAllowanceLabel(
  status: RitualAllowanceStatus,
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
  return parts.join(" and ");
}

/** One provider's remaining free-ritual allowances: a "Free rituals
 *  (Psion)" heading, then a line each. */
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
      const label = ritualAllowanceLabel(status);
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

/** The free rituals still left, per provider. Status, not a control: it
 *  holds only what is still free, so it goes once every allowance is used
 *  (the caller renders nothing for no groups). */
export function RitualAllowanceSummary({
  groups,
}: {
  readonly groups: readonly RitualAllowanceGroup[];
}) {
  return (
    <div className="rituals-allowance">
      {groups.map(({ providerId, heading, provider, lines }) => (
        <div className="rituals-allowance-group" key={providerId}>
          <p className="rituals-allowance-heading">
            <strong>{heading}</strong>
            {provider === "" ? null : (
              <span className="rituals-allowance-source"> ({provider})</span>
            )}
          </p>
          {lines.map(({ key, label }) => (
            <p className="rituals-allowance-count" key={key}>
              {label}
            </p>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Chooses the allowance a free ritual uses when several fit (Learn free):
 *  a multiclass wizard's Spellbook and a cleric's ritual book. Each option
 *  names its provider and what it still covers. */
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

/** The known records by kind, each group sorted by name; every kind has a
 *  (possibly empty) group. */
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

/** A known record's identity: its content ID, lower-cased, as the Shop
 *  matches catalog records against it. */
export function knownRecordKey(record: KnownRecord): string {
  return (
    record.element.definitionId ??
    `${record.element.type}\0${record.element.name}`
  ).toLocaleLowerCase();
}

/** The known-list entry learning `entity` stores: bought when it costs
 *  something, else free (with the allowance it used, if any). */
export function knownEntryForEntity(
  entity: ContentEntity,
  level: number,
  priceCopper: number,
  allowance?: RitualAllowance,
): BuildKnownEntry {
  return {
    id: `web:${crypto.randomUUID()}`,
    acquiredLevel: level,
    element: {
      definitionId: entity.id,
      name: entity.name,
      type: entity.type,
    },
    acquisition: priceCopper > 0 ? "bought" : "free",
    ...(allowance === undefined ? {} : { allowance: allowance.key }),
  };
}

/** Everything the Shop and Inventory show about known records, from the
 *  build and its current evaluation: once per change, shared by both. */
export interface KnownRecordsModel {
  readonly records: readonly KnownRecord[];
  readonly groups: ReadonlyMap<KnownRecordKind, readonly KnownRecord[]>;
  /** Lower-case content IDs known (learned or granted). */
  readonly knownIds: ReadonlySet<string>;
  readonly statuses: readonly RitualAllowanceStatus[];
  readonly allowanceGroups: readonly RitualAllowanceGroup[];
  /** Percent of market price the character pays for a ritual. */
  readonly ritualCostPercent: number;
  readonly allowanceProvider: (allowanceKey: string) => string | undefined;
  readonly describeAllowance: (
    allowance: RitualAllowance,
  ) => string | undefined;
}

export function useKnownRecordsModel(
  build: CharacterBuild,
  evaluation: EvaluatedCharacter | undefined,
  byId: ReadonlyMap<string, ContentEntity>,
): KnownRecordsModel {
  return useMemo(() => {
    const lookup = (id: string) => byId.get(id.toLocaleLowerCase());
    const records = knownRecords(
      build,
      evaluation,
      lookup,
      build.effectiveLevel,
    );
    const statuses =
      evaluation === undefined
        ? []
        : ritualAllowanceStatuses(
            build,
            evaluation,
            lookup,
            build.effectiveLevel,
          );
    const statusOf = (key: string) =>
      statuses.find(
        ({ allowance }) =>
          allowance.key.toLocaleLowerCase() === key.toLocaleLowerCase(),
      );
    return {
      records,
      groups: groupKnownRecords(records),
      knownIds: new Set(records.map(knownRecordKey)),
      statuses,
      allowanceGroups: ritualAllowanceGroups(statuses),
      ritualCostPercent: ritualCostPercent(evaluation?.stats ?? {}),
      allowanceProvider: (key) => statusOf(key)?.allowance.provider,
      describeAllowance: (allowance) => {
        const status = statusOf(allowance.key);
        return status === undefined ? undefined : ritualAllowanceLabel(status);
      },
    };
  }, [build, evaluation, byId]);
}
