import { useEffect, useMemo, useState } from "react";

import type {
  BuildInventoryEntry,
  CharacterBuild,
} from "@4ecb/character-domain";
import type { ContentEntity } from "@4ecb/content-domain";
import {
  normalizeCompendiumQuery,
  type CompendiumQueryResult,
  type FacetKey,
} from "@4ecb/query-engine";

import { appContentRuntime, type QueryRuntimeClient } from "./app-runtime";
import { contentSpecificValue } from "./builder-ui";
import { EntityCardBody, EntityCardHeader } from "./EntityCard";
import {
  compatibleBaseItems,
  entityCurrencyCopper,
  formatCopperPrice,
  groupMagicItemFamilies,
  inventoryDefinitionIds,
  inventoryDisplayName,
  inventoryEntryForEntity,
  inventoryRequiresBothHands,
  inventorySlotCandidates,
  itemCanBeBought,
  itemProficiencyStatus,
  loadoutShopSlotFilter,
  practiceKind,
  SHOP_ITEM_TYPES,
} from "./equipment-ui";
import { entityVisualTone, visualToneClass } from "./visual-language";
import { Icon } from "./Icon";

export type EquipmentTab = "loadout" | "inventory" | "shop" | "practices";
type MoneyLocation = "carried" | "stored";
type Denomination = "copper" | "silver" | "gold" | "platinum" | "astral";

export interface EquipmentWalletView {
  readonly carried: Readonly<Record<Denomination, number>>;
  readonly stored: Readonly<Record<Denomination, number>>;
}

const EQUIPMENT_TABS: readonly { id: EquipmentTab; label: string }[] = [
  { id: "loadout", label: "Loadout" },
  { id: "inventory", label: "Inventory" },
  { id: "shop", label: "Shop" },
  { id: "practices", label: "Rituals & Practices" },
];

const LOADOUT_SLOTS = [
  ["body", "Body"],
  ["main-hand", "Main hand"],
  ["off-hand", "Off hand"],
  ["head", "Head"],
  ["neck", "Neck"],
  ["arms", "Arms"],
  ["hands", "Hands"],
  ["ring-1", "Ring 1"],
  ["ring-2", "Ring 2"],
  ["waist", "Waist"],
  ["feet", "Feet"],
  ["symbol", "Holy symbol"],
  ["ki-focus", "Ki focus"],
  ["tattoo", "Tattoo"],
] as const;

const DENOMINATIONS: readonly { id: Denomination; label: string }[] = [
  { id: "copper", label: "Copper" },
  { id: "silver", label: "Silver" },
  { id: "gold", label: "Gold" },
  { id: "platinum", label: "Platinum" },
  { id: "astral", label: "Astral" },
];

function FacetSelect({
  label,
  facet,
  value,
  result,
  onChange,
}: {
  readonly label: string;
  readonly facet: FacetKey;
  readonly value: string;
  readonly result: CompendiumQueryResult | undefined;
  readonly onChange: (value: string) => void;
}) {
  const values = result?.facets.find(({ key }) => key === facet)?.values ?? [];
  return (
    <label>
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      >
        <option value="">All</option>
        {values.map((entry) => (
          <option key={entry.value} value={entry.value}>
            {entry.value} ({entry.count})
          </option>
        ))}
      </select>
    </label>
  );
}

function ItemDetail({
  entity,
  hideFlavortext,
}: {
  readonly entity: ContentEntity | undefined;
  readonly hideFlavortext: boolean;
}) {
  if (entity === undefined)
    return (
      <aside className="candidate-detail candidate-detail-empty">
        <p className="eyebrow">Item details</p>
        <h4>Choose an item to inspect it</h4>
        <p>
          The same detail viewer follows selections across every equipment tab.
        </p>
      </aside>
    );
  const price = entityCurrencyCopper(entity);
  return (
    <aside
      className={`candidate-detail ${visualToneClass(entityVisualTone(entity))}`}
      tabIndex={0}
    >
      <header className="primary-detail-heading">
        <EntityCardHeader entity={entity} />
      </header>
      <EntityCardBody
        entity={entity}
        hideFlavortext={hideFlavortext}
        afterNarrative={
          <dl className="candidate-facts">
            <div>
              <dt>Price</dt>
              <dd>{formatCopperPrice(price)}</dd>
            </div>
          </dl>
        }
      />
    </aside>
  );
}

function useCatalogQuery(
  packId: string | undefined,
  active: boolean,
  mode: "shop" | "practices",
  text: string,
  type: string,
  source: string,
  slot: string,
  rarity: string,
  tier: string,
  minimumLevel: string,
  maximumLevel: string,
  practiceSubtype: string,
  offset: number,
) {
  const [client, setClient] = useState<QueryRuntimeClient>();
  const [result, setResult] = useState<CompendiumQueryResult>();
  const [status, setStatus] = useState("Loading catalog…");
  useEffect(() => {
    if (!active || packId === undefined) return;
    let cancelled = false;
    void appContentRuntime
      .getQueryClient(packId)
      .then(({ client: ready }) => {
        if (!cancelled) setClient(ready);
      })
      .catch((reason: unknown) => {
        if (!cancelled)
          setStatus(reason instanceof Error ? reason.message : String(reason));
      });
    return () => {
      cancelled = true;
    };
  }, [active, packId]);

  useEffect(() => {
    if (!active || client === undefined) return;
    const timer = window.setTimeout(() => {
      const baseTypes =
        mode === "shop"
          ? SHOP_ITEM_TYPES
          : practiceSubtype === "scroll"
            ? ["Ritual Scroll"]
            : practiceSubtype
              ? ["Ritual"]
              : ["Ritual", "Ritual Scroll"];
      const facets = [
        {
          key: "type" as const,
          include: type ? [type] : baseTypes,
          exclude: [],
        },
        ...(source
          ? [{ key: "source" as const, include: [source], exclude: [] }]
          : []),
        ...(slot
          ? [{ key: "slot" as const, include: [slot], exclude: [] }]
          : []),
        ...(rarity
          ? [{ key: "rarity" as const, include: [rarity], exclude: [] }]
          : []),
        ...(tier
          ? [{ key: "tier" as const, include: [tier], exclude: [] }]
          : []),
      ];
      setStatus("Searching catalog…");
      void client
        .query(
          normalizeCompendiumQuery({
            text: [
              text,
              practiceSubtype === "alchemical-formula"
                ? '"Alchemical Formula"'
                : "",
              practiceSubtype === "martial-practice"
                ? '"Martial Practice"'
                : "",
            ]
              .filter(Boolean)
              .join(" "),
            facets,
            ranges:
              minimumLevel || maximumLevel
                ? [
                    {
                      field: "level",
                      ...(minimumLevel
                        ? { minimum: Number(minimumLevel) }
                        : {}),
                      ...(maximumLevel
                        ? { maximum: Number(maximumLevel) }
                        : {}),
                    },
                  ]
                : [],
            sort: { key: "name", direction: "ascending" },
            page: { offset, limit: 200 },
          }),
        )
        .then((next) => {
          setResult(next);
          setStatus(
            `${next.total.toLocaleString()} exact records · ${Math.round(next.elapsedMilliseconds)} ms`,
          );
        })
        .catch((reason: unknown) =>
          setStatus(reason instanceof Error ? reason.message : String(reason)),
        );
    }, 150);
    return () => window.clearTimeout(timer);
  }, [
    active,
    client,
    maximumLevel,
    minimumLevel,
    mode,
    offset,
    practiceSubtype,
    rarity,
    slot,
    source,
    text,
    tier,
    type,
  ]);
  return { result, status };
}

export function EquipmentWorkspace({
  build,
  entities,
  byId,
  packId,
  wallet,
  activeDefinitionIds,
  hideFlavortext,
  activeTab,
  onTabChange,
  onPutInventory,
  onPurchase,
  onSell,
  onEquipSlot,
  onSetMoney,
}: {
  readonly build: CharacterBuild;
  readonly entities: readonly ContentEntity[];
  readonly byId: ReadonlyMap<string, ContentEntity>;
  readonly packId?: string;
  readonly wallet: EquipmentWalletView;
  readonly activeDefinitionIds: readonly string[];
  readonly hideFlavortext: boolean;
  readonly activeTab: EquipmentTab;
  readonly onTabChange: (tab: EquipmentTab) => void;
  readonly onPutInventory: (entry: BuildInventoryEntry) => void;
  readonly onPurchase: (
    entry: BuildInventoryEntry,
    priceCopper: number,
  ) => void;
  readonly onSell: (
    entry: BuildInventoryEntry,
    priceCopper: number,
    percentage: 20 | 50 | 100,
  ) => void;
  readonly onEquipSlot: (
    entryId: string | undefined,
    slots: readonly string[],
  ) => void;
  readonly onSetMoney: (
    location: MoneyLocation,
    denomination: Denomination,
    value: number,
  ) => void;
}) {
  const tab = activeTab;
  const [inspected, setInspected] = useState<ContentEntity>();
  const [text, setText] = useState("");
  const [type, setType] = useState("");
  const [source, setSource] = useState("");
  const [slot, setSlot] = useState("");
  const [rarity, setRarity] = useState("");
  const [tier, setTier] = useState("");
  const [minimumLevel, setMinimumLevel] = useState("");
  const [maximumLevel, setMaximumLevel] = useState("");
  const [proficiency, setProficiency] = useState("");
  const [practiceSubtype, setPracticeSubtype] = useState("");
  const [offset, setOffset] = useState(0);
  const [baseId, setBaseId] = useState("");
  const mode = tab === "practices" ? "practices" : "shop";
  const { result, status } = useCatalogQuery(
    packId,
    tab === "shop" || tab === "practices",
    mode,
    text,
    type,
    source,
    slot,
    rarity,
    tier,
    minimumLevel,
    maximumLevel,
    practiceSubtype,
    offset,
  );
  const pageEntities = useMemo(
    () =>
      result?.items.flatMap(({ id }) => {
        const entity = byId.get(id.toLocaleLowerCase());
        return entity === undefined ? [] : [entity];
      }) ?? [],
    [byId, result],
  );
  const ownedDefinitions = useMemo(
    () =>
      activeDefinitionIds.flatMap((id) => {
        const entity = byId.get(id.toLocaleLowerCase());
        return entity === undefined ? [] : [entity];
      }),
    [activeDefinitionIds, byId],
  );
  const proficiencyFiltered = useMemo(
    () =>
      proficiency === "proficient"
        ? pageEntities.filter(
            (entity) =>
              itemProficiencyStatus(entity, ownedDefinitions) === "proficient",
          )
        : proficiency === "unverified"
          ? pageEntities.filter(
              (entity) =>
                itemProficiencyStatus(entity, ownedDefinitions) ===
                "unverified",
            )
          : pageEntities,
    [ownedDefinitions, pageEntities, proficiency],
  );
  const groupedShop = useMemo(
    () => groupMagicItemFamilies(proficiencyFiltered, entities),
    [entities, proficiencyFiltered],
  );
  const practices = useMemo(
    () =>
      pageEntities.filter((entity) => {
        const kind = practiceKind(entity);
        return (
          kind !== undefined && (!practiceSubtype || kind === practiceSubtype)
        );
      }),
    [pageEntities, practiceSubtype],
  );
  const inventory = build.inventory.filter(({ quantity }) => quantity > 0);

  const inspectInventory = (entry: BuildInventoryEntry) => {
    const id = inventoryDefinitionIds(entry).at(-1);
    setInspected(id === undefined ? undefined : byId.get(id));
  };
  const buy = (entity: ContentEntity) => {
    const price = entityCurrencyCopper(entity);
    if (price === undefined) return;
    const bases = compatibleBaseItems(entity, entities);
    const base =
      bases.length === 0 ? undefined : byId.get(baseId.toLocaleLowerCase());
    if (bases.length > 0 && base === undefined) return;
    onPurchase(
      inventoryEntryForEntity(entity, build.effectiveLevel, base),
      price,
    );
  };

  const catalogControls = (
    <div className="equipment-catalog-controls">
      <label>
        Search
        <input
          type="search"
          value={text}
          onChange={(event) => {
            setText(event.currentTarget.value);
            setOffset(0);
          }}
        />
      </label>
      {mode === "shop" ? (
        <label>
          Type
          <select
            value={type}
            onChange={(event) => {
              setType(event.currentTarget.value);
              setOffset(0);
            }}
          >
            <option value="">All items</option>
            {SHOP_ITEM_TYPES.map((itemType) => (
              <option key={itemType} value={itemType}>
                {itemType}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <FacetSelect
        label="Source"
        facet="source"
        value={source}
        result={result}
        onChange={(value) => {
          setSource(value);
          setOffset(0);
        }}
      />
      {mode === "shop" ? (
        <>
          <FacetSelect
            label="Slot"
            facet="slot"
            value={slot}
            result={result}
            onChange={(value) => {
              setSlot(value);
              setOffset(0);
            }}
          />
          <FacetSelect
            label="Rarity"
            facet="rarity"
            value={rarity}
            result={result}
            onChange={(value) => {
              setRarity(value);
              setOffset(0);
            }}
          />
          <label>
            Proficiency
            <select
              value={proficiency}
              onChange={(event) => {
                setProficiency(event.currentTarget.value);
                setOffset(0);
              }}
            >
              <option value="">All</option>
              <option value="proficient">Known proficient</option>
              <option value="unverified">Not confirmed</option>
            </select>
          </label>
        </>
      ) : (
        <label>
          Kind
          <select
            value={practiceSubtype}
            onChange={(event) => {
              setPracticeSubtype(event.currentTarget.value);
              setOffset(0);
            }}
          >
            <option value="">All</option>
            <option value="ritual">Ritual</option>
            <option value="alchemical-formula">Alchemical formula</option>
            <option value="martial-practice">Martial practice</option>
            <option value="scroll">Scroll</option>
          </select>
        </label>
      )}
      <FacetSelect
        label="Tier"
        facet="tier"
        value={tier}
        result={result}
        onChange={(value) => {
          setTier(value);
          setOffset(0);
        }}
      />
      <label>
        Minimum level
        <input
          type="number"
          min={0}
          max={30}
          value={minimumLevel}
          onChange={(event) => {
            setMinimumLevel(event.currentTarget.value);
            setOffset(0);
          }}
        />
      </label>
      <label>
        Maximum level
        <input
          type="number"
          min={0}
          max={30}
          value={maximumLevel}
          onChange={(event) => {
            setMaximumLevel(event.currentTarget.value);
            setOffset(0);
          }}
        />
      </label>
    </div>
  );

  return (
    <section
      aria-labelledby="equipment-heading"
      className="choice-pane standalone-workspace-pane equipment-pane"
    >
      <header>
        <h3 id="equipment-heading">Equipment</h3>
      </header>
      <div
        className="equipment-tabs"
        role="tablist"
        aria-label="Equipment sections"
      >
        {EQUIPMENT_TABS.map((item) => (
          <button
            key={item.id}
            role="tab"
            aria-selected={tab === item.id}
            type="button"
            onClick={() => {
              onTabChange(item.id);
              setOffset(0);
              setType("");
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="equipment-workspace">
        <div
          className="equipment-primary"
          role="tabpanel"
          aria-label={EQUIPMENT_TABS.find(({ id }) => id === tab)?.label}
        >
          {tab === "loadout" ? (
            <div className="loadout-grid">
              {[
                ...LOADOUT_SLOTS,
                ...(["companion", "familiar", "mount"] as const)
                  .filter((slotId) =>
                    inventory.some((entry) =>
                      inventorySlotCandidates(entry, byId).includes(slotId),
                    ),
                  )
                  .map(
                    (slotId) =>
                      [
                        slotId,
                        `${slotId[0]!.toLocaleUpperCase()}${slotId.slice(1)}`,
                      ] as const,
                  ),
              ].map(([slotId, label]) => {
                const assigned = inventory.find((entry) =>
                  entry.equippedSlots?.some(
                    (assignment) => assignment.slot === slotId,
                  ),
                );
                const compatible = inventory.filter((entry) =>
                  inventorySlotCandidates(entry, byId).includes(slotId),
                );
                const selectId = `loadout-slot-${slotId}`;
                const shopSlot = loadoutShopSlotFilter(slotId);
                return (
                  <div className="loadout-slot" key={slotId}>
                    <span className="loadout-slot-heading">
                      <label htmlFor={selectId}>{label}</label>
                      {shopSlot !== undefined ? (
                        <button
                          type="button"
                          className="loadout-slot-shop icon-only-button"
                          aria-label={`Shop for ${label} items`}
                          title={`Shop for ${label} items`}
                          onClick={() => {
                            setSlot(shopSlot);
                            setOffset(0);
                            onTabChange("shop");
                          }}
                        >
                          <Icon name="shop" />
                        </button>
                      ) : null}
                    </span>
                    <select
                      id={selectId}
                      value={assigned?.id ?? ""}
                      onChange={(event) => {
                        const entry = inventory.find(
                          ({ id }) => id === event.currentTarget.value,
                        );
                        const pairedHandSlots = [
                          "main-hand",
                          "off-hand",
                        ] as const;
                        const entryUsesBothHands =
                          entry !== undefined &&
                          inventoryRequiresBothHands(entry, byId);
                        const assignedUsesBothHands =
                          assigned !== undefined &&
                          inventoryRequiresBothHands(assigned, byId);
                        if (assignedUsesBothHands && !entryUsesBothHands) {
                          onEquipSlot(undefined, pairedHandSlots);
                          if (entry !== undefined)
                            onEquipSlot(entry.id, [slotId]);
                          return;
                        }
                        onEquipSlot(
                          event.currentTarget.value || undefined,
                          entryUsesBothHands ? pairedHandSlots : [slotId],
                        );
                      }}
                    >
                      <option value="">Empty</option>
                      {compatible.map((entry) => (
                        <option key={entry.id} value={entry.id}>
                          {inventoryDisplayName(entry, byId)}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
              {inventory.some(
                (entry) =>
                  entry.equippedQuantity > 0 && !entry.equippedSlots?.length,
              ) ? (
                <p className="field-help">
                  Imported equipped counts remain active. Assign those holdings
                  to slots to make their loadout explicit.
                </p>
              ) : null}
            </div>
          ) : tab === "inventory" ? (
            <>
              <section className="wallet-editor">
                <h4>Wallet</h4>
                {(["carried", "stored"] as const).map((location) => (
                  <fieldset key={location}>
                    <legend>
                      {location === "carried"
                        ? "Carried money"
                        : "Stored money"}
                    </legend>
                    {DENOMINATIONS.map(({ id, label }) => (
                      <label key={id}>
                        {label}
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={wallet[location][id]}
                          onChange={(event) =>
                            onSetMoney(
                              location,
                              id,
                              Number(event.currentTarget.value),
                            )
                          }
                        />
                      </label>
                    ))}
                  </fieldset>
                ))}
              </section>
              {inventory.length === 0 ? (
                <p>No carried inventory.</p>
              ) : (
                <div className="equipment-table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th>Owned</th>
                        <th>Equipped</th>
                        <th>Sell one</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inventory.map((entry) => {
                        const entity = inventoryDefinitionIds(entry).at(-1);
                        const definition =
                          entity === undefined ? undefined : byId.get(entity);
                        const price =
                          definition === undefined
                            ? undefined
                            : entityCurrencyCopper(definition);
                        return (
                          <tr
                            key={entry.id}
                            onClick={() => inspectInventory(entry)}
                          >
                            <th scope="row">
                              <button
                                type="button"
                                className="table-inspect-button"
                                onClick={() => inspectInventory(entry)}
                              >
                                {inventoryDisplayName(entry, byId)}
                              </button>
                            </th>
                            <td>
                              <input
                                aria-label={`Owned quantity for ${inventoryDisplayName(entry, byId)}`}
                                type="number"
                                min={0}
                                value={entry.quantity}
                                onChange={(event) => {
                                  const quantity = Math.max(
                                    0,
                                    Number(event.currentTarget.value),
                                  );
                                  const equippedSlots =
                                    entry.equippedSlots?.filter(
                                      ({ quantityIndex }) =>
                                        quantityIndex < quantity,
                                    );
                                  onPutInventory({
                                    ...entry,
                                    quantity,
                                    ...(equippedSlots === undefined
                                      ? {
                                          equippedQuantity: Math.min(
                                            entry.equippedQuantity,
                                            quantity,
                                          ),
                                        }
                                      : {
                                          equippedSlots,
                                          equippedQuantity: new Set(
                                            equippedSlots.map(
                                              ({ quantityIndex }) =>
                                                quantityIndex,
                                            ),
                                          ).size,
                                        }),
                                  });
                                }}
                              />
                            </td>
                            <td>{entry.equippedQuantity}</td>
                            <td>
                              {price === undefined ? (
                                "Not priced"
                              ) : (
                                <div className="sell-actions">
                                  {([20, 50, 100] as const).map(
                                    (percentage) => (
                                      <button
                                        key={percentage}
                                        type="button"
                                        onClick={() =>
                                          onSell(entry, price, percentage)
                                        }
                                      >
                                        {percentage}%
                                      </button>
                                    ),
                                  )}
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : (
            <>
              {catalogControls}
              <p className="equipment-query-status" role="status">
                {status}
              </p>
              <div className="equipment-table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>{tab === "shop" ? "Item" : "Ritual or practice"}</th>
                      <th>Type</th>
                      <th>Level</th>
                      <th>Price</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(tab === "shop"
                      ? groupedShop
                      : practices.map((entity) => ({
                          key: entity.id,
                          label: entity.name,
                          entities: [entity],
                        }))
                    ).map((group) => {
                      const entity =
                        group.entities.length === 1
                          ? group.entities[0]!
                          : inspected &&
                              group.entities.some(
                                ({ id }) => id === inspected.id,
                              )
                            ? inspected
                            : group.entities[0]!;
                      const bases = compatibleBaseItems(entity, entities);
                      const known =
                        practiceKind(entity) !== "scroll" &&
                        inventory.some((entry) =>
                          inventoryDefinitionIds(entry).includes(
                            entity.id.toLocaleLowerCase(),
                          ),
                        );
                      const buyable = itemCanBeBought(entity);
                      const affordable =
                        entityCurrencyCopper(entity) !== undefined &&
                        walletCopper(wallet.carried) +
                          walletCopper(wallet.stored) >=
                          entityCurrencyCopper(entity)!;
                      return (
                        <tr key={group.key}>
                          <th scope="row">
                            <button
                              type="button"
                              className="table-inspect-button"
                              onClick={() => {
                                setInspected(entity);
                                setBaseId("");
                              }}
                            >
                              {group.label}
                            </button>
                            {group.key !== entity.id ? (
                              <select
                                aria-label={`Exact enhancement for ${group.label}`}
                                value={entity.id}
                                onChange={(event) => {
                                  const exact = byId.get(
                                    event.currentTarget.value.toLocaleLowerCase(),
                                  );
                                  setInspected(exact);
                                  setBaseId("");
                                }}
                              >
                                {group.entities.map((variant) => (
                                  <option key={variant.id} value={variant.id}>
                                    {variant.name.match(/\+\d+$/)?.[0] ??
                                      variant.name}
                                  </option>
                                ))}
                              </select>
                            ) : null}
                            {bases.length > 0 && inspected?.id === entity.id ? (
                              <select
                                aria-label={`Base item for ${entity.name}`}
                                value={baseId}
                                onChange={(event) =>
                                  setBaseId(event.currentTarget.value)
                                }
                              >
                                <option value="">
                                  Choose compatible base…
                                </option>
                                {bases.map((base) => (
                                  <option key={base.id} value={base.id}>
                                    {base.name}
                                  </option>
                                ))}
                              </select>
                            ) : null}
                          </th>
                          <td>
                            {practiceKind(entity) === "scroll"
                              ? "Scroll"
                              : (contentSpecificValue(entity, "type") ??
                                entity.type)}
                          </td>
                          <td>
                            {contentSpecificValue(entity, "Level") ?? "—"}
                          </td>
                          <td>
                            {formatCopperPrice(entityCurrencyCopper(entity))}
                          </td>
                          <td>
                            <button
                              type="button"
                              title={
                                !buyable
                                  ? "This record cannot be bought"
                                  : !affordable
                                    ? "Insufficient carried and stored money"
                                    : known
                                      ? "Already known"
                                      : undefined
                              }
                              disabled={
                                !buyable ||
                                !affordable ||
                                known ||
                                (bases.length > 0 &&
                                  (!baseId || inspected?.id !== entity.id))
                              }
                              onClick={() => buy(entity)}
                            >
                              {known
                                ? "Known"
                                : practiceKind(entity) &&
                                    practiceKind(entity) !== "scroll"
                                  ? "Learn"
                                  : "Buy"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="equipment-pagination">
                <button
                  type="button"
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - 200))}
                >
                  Previous
                </button>
                <span>
                  {result === undefined
                    ? ""
                    : `${offset + 1}–${Math.min(offset + result.items.length, result.total)} of ${result.total.toLocaleString()}`}
                </span>
                <button
                  type="button"
                  disabled={
                    result === undefined ||
                    offset + result.items.length >= result.total
                  }
                  onClick={() => setOffset(offset + 200)}
                >
                  Next
                </button>
              </div>
            </>
          )}
        </div>
        <div className="shared-choice-detail">
          <ItemDetail entity={inspected} hideFlavortext={hideFlavortext} />
        </div>
      </div>
    </section>
  );
}

function walletCopper(amount: Readonly<Record<Denomination, number>>): number {
  return (
    amount.copper +
    amount.silver * 10 +
    amount.gold * 100 +
    amount.platinum * 10_000 +
    amount.astral * 1_000_000
  );
}
