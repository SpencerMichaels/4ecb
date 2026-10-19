import { Fragment, useEffect, useMemo, useRef, useState } from "react";

import {
  CURRENCY_DENOMINATIONS,
  currencyToCopper,
  inventoryEntryWithQuantity,
  parseCoinAdjustment,
  type CoinAdjustment,
  type CurrencyAmount,
  type BuildInventoryEntry,
  type CharacterBuild,
} from "@4ecb/character-domain";
import type { ContentEntity } from "@4ecb/content-domain";
import { grantedDetailEntities } from "./builder-ui";
import {
  alchemicalFormulaItems,
  comparableSaleProceeds,
  entityCurrencyCopper,
  groupInventoryByCategory,
  INVENTORY_CATEGORIES,
  type InventoryCategoryId,
  inventoryDefinitionIds,
  inventoryDisplayName,
  inventoryEntryForEntity,
  inventoryLoadoutToggle,
  inventoryRequiresBothHands,
  inventorySlotCandidates,
  resolveLoadoutAssignments,
  resolvedItemChoices,
  shopItemLevel,
  type ShopBrowseId,
  visibleLoadoutSlotColumns,
} from "./equipment-ui";
import { Icon } from "./Icon";
import { canonicalItemIcon } from "./item-icons";
import type { ShopCategory } from "./routes";
import { preferredShopBrowse, ShopWorkspace } from "./ShopWorkspace";
import { useArmedAction } from "./useArmedAction";
import { BuilderItemCard, BuilderPowerCard } from "./BuilderCards";

type MoneyLocation = "carried" | "stored";
type Denomination = "copper" | "silver" | "gold" | "platinum" | "astral";

export interface EquipmentWalletView {
  readonly carried: Readonly<Record<Denomination, number>>;
  readonly stored: Readonly<Record<Denomination, number>>;
}

const DENOMINATIONS: readonly {
  id: Denomination;
  label: string;
}[] = [
  { id: "copper", label: "Copper" },
  { id: "silver", label: "Silver" },
  { id: "gold", label: "Gold" },
  { id: "platinum", label: "Platinum" },
  // "Diamond" is the astral diamond's full name ("AD" if abbreviated).
  { id: "astral", label: "Diamond" },
];

const DENOMINATION_KEYS: Readonly<Record<Denomination, keyof CurrencyAmount>> =
  {
    copper: "cp",
    silver: "sp",
    gold: "gp",
    platinum: "pp",
    astral: "ad",
  };

const DENOMINATION_NAMES: Readonly<Record<keyof CurrencyAmount, string>> =
  Object.fromEntries(
    DENOMINATIONS.map(({ id, label }) => [DENOMINATION_KEYS[id], label]),
  ) as Record<keyof CurrencyAmount, string>;

function walletCopper(wallet: EquipmentWalletView[MoneyLocation]): number {
  return currencyToCopper({
    cp: wallet.copper,
    sp: wallet.silver,
    gp: wallet.gold,
    pp: wallet.platinum,
    ad: wallet.astral,
  });
}

function combinedWalletCurrency(wallet: EquipmentWalletView): CurrencyAmount {
  return {
    cp: wallet.carried.copper + wallet.stored.copper,
    sp: wallet.carried.silver + wallet.stored.silver,
    gp: wallet.carried.gold + wallet.stored.gold,
    pp: wallet.carried.platinum + wallet.stored.platinum,
    ad: wallet.carried.astral + wallet.stored.astral,
  };
}

const DENOMINATION_BY_KEY = Object.fromEntries(
  Object.entries(DENOMINATION_KEYS).map(([denomination, coin]) => [
    coin,
    denomination,
  ]),
) as Record<keyof CurrencyAmount, Denomination>;

function locationCurrency(
  coins: EquipmentWalletView[MoneyLocation],
): CurrencyAmount {
  return {
    cp: coins.copper,
    sp: coins.silver,
    gp: coins.gold,
    pp: coins.platinum,
    ad: coins.astral,
  };
}

/** The coins the wallet shows: every coin owned when funds are merged, else
 * the chosen location's. Actual coins, never re-minted, so a tile can be
 * edited directly. */
export function shownWalletCoins(
  wallet: EquipmentWalletView,
  location: MoneyLocation | undefined,
): CurrencyAmount {
  return location === undefined
    ? combinedWalletCurrency(wallet)
    : locationCurrency(wallet[location]);
}

/**
 * Sets one coin count. With merged funds an increase is carried and a
 * decrease comes from carried coins first, then stored, so stored amounts
 * survive where possible (legacy export keeps the distinction).
 */
export function walletWithCoinCount(
  wallet: EquipmentWalletView,
  coin: keyof CurrencyAmount,
  count: number,
  location: MoneyLocation | undefined,
): EquipmentWalletView {
  const denomination = DENOMINATION_BY_KEY[coin];
  const set = (where: MoneyLocation, value: number) => ({
    ...wallet[where],
    [denomination]: value,
  });
  if (location !== undefined)
    return { ...wallet, [location]: set(location, count) };
  const carried = wallet.carried[denomination];
  const stored = wallet.stored[denomination];
  const delta = count - (carried + stored);
  if (delta >= 0)
    return { ...wallet, carried: set("carried", carried + delta) };
  const fromCarried = Math.min(carried, -delta);
  return {
    carried: set("carried", carried - fromCarried),
    stored: set("stored", stored - (-delta - fromCarried)),
  };
}

export function inventoryEquippedStatus(
  entry: BuildInventoryEntry,
): string | undefined {
  if (entry.equippedQuantity === 0) return undefined;
  const count =
    entry.quantity > 1
      ? `${entry.equippedQuantity}/${entry.quantity} equipped`
      : "Equipped";
  return entry.equippedSlots === undefined ? `${count} · slots unknown` : count;
}

export interface InspectedItemDetail {
  readonly entities: readonly ContentEntity[];
  readonly displayName: string;
  readonly effectiveLevel?: number;
  readonly kindLabel?: string;
  /** Entities resolved for the item's own choices (e.g. the specific Power
   * chosen for a Genasi Soul Armor), when the chosen candidate's definition
   * ID resolves to a known entity — shown as a secondary detail card. */
  readonly resolvedChoiceEntities?: readonly ContentEntity[];
}

export function inventoryItemDetail(
  entry: BuildInventoryEntry,
  byId: ReadonlyMap<string, ContentEntity>,
): InspectedItemDetail | undefined {
  const entities = inventoryDefinitionIds(entry).flatMap((id) => {
    const definition = byId.get(id);
    return definition === undefined ? [] : [definition];
  });
  if (entities.length === 0) return undefined;
  const resolvedChoiceEntities = resolvedItemChoices(entry, byId).flatMap(
    ({ entity }) => (entity === undefined ? [] : [entity]),
  );
  return {
    entities,
    displayName: inventoryDisplayName(entry, byId),
    ...(resolvedChoiceEntities.length === 0 ? {} : { resolvedChoiceEntities }),
  };
}

export function catalogItemDetail(
  entity: ContentEntity,
  base: ContentEntity | undefined,
  effectiveLevel: number,
  byId: ReadonlyMap<string, ContentEntity>,
): InspectedItemDetail {
  return base === undefined
    ? { entities: [entity], displayName: entity.name, effectiveLevel }
    : {
        entities: [base, entity],
        displayName: inventoryDisplayName(
          inventoryEntryForEntity(entity, effectiveLevel, base),
          byId,
        ),
        effectiveLevel,
      };
}

export function ItemDetail({
  item,
  byId,
}: {
  readonly item: InspectedItemDetail | undefined;
  readonly byId: ReadonlyMap<string, ContentEntity>;
}) {
  const entity = item?.entities.at(-1);
  if (item === undefined || entity === undefined)
    return (
      <aside className="candidate-detail candidate-detail-empty">
        <p className="eyebrow">Item details</p>
        <h4>Choose an item to inspect it</h4>
        <p>
          The same detail viewer follows selections across Inventory, Loadout,
          and Shop.
        </p>
      </aside>
    );
  const references = new Map(byId);
  for (const candidate of byId.values()) {
    const name = candidate.name.trim().toLocaleLowerCase();
    if (!references.has(name)) references.set(name, candidate);
  }
  // Powers granted by any component, and an item-owned choice resolved to a
  // power (e.g. the Power picked for a Genasi Soul Armor), are sibling cards.
  const powers = [
    ...item.entities.flatMap((component) =>
      grantedDetailEntities(component, references),
    ),
    ...(item.resolvedChoiceEntities ?? []),
  ].filter(
    (power, index, all) =>
      power.type.trim().toLocaleLowerCase() === "power" &&
      all.findIndex((candidate) => candidate.id === power.id) === index,
  );
  const formulaItems = alchemicalFormulaItems(entity, byId);
  const formulaItem =
    formulaItems
      .filter(
        (candidate) =>
          shopItemLevel(candidate) <=
          (item.effectiveLevel ?? shopItemLevel(entity)),
      )
      .at(-1) ?? formulaItems[0];
  return (
    <div className="candidate-detail-stack">
      <div className="candidate-card-panel">
        <BuilderItemCard name={item.displayName} entities={item.entities} />
      </div>
      {powers.map((power) => (
        <BuilderPowerCard
          entity={power}
          headingSuffix="-granted"
          key={power.id}
        />
      ))}
      {formulaItem === undefined ? null : (
        <div className="candidate-card-panel">
          <BuilderItemCard
            name={formulaItem.name}
            entities={[formulaItem]}
            headingSuffix="-formula"
          />
        </div>
      )}
    </div>
  );
}

function LoadoutGrid({
  inventory,
  byId,
  activeDefinitionIds,
  onInspect,
  onEquipSlot,
}: {
  readonly inventory: readonly BuildInventoryEntry[];
  readonly byId: ReadonlyMap<string, ContentEntity>;
  readonly activeDefinitionIds: readonly string[];
  readonly onInspect: (entry: BuildInventoryEntry) => void;
  readonly onEquipSlot: (
    entryId: string | undefined,
    slots: readonly string[],
    currentEntryId?: string,
    currentSlots?: readonly string[],
  ) => void;
}) {
  const slotColumns = visibleLoadoutSlotColumns(
    activeDefinitionIds,
    inventory,
    byId,
  );
  const assignments = resolveLoadoutAssignments(inventory, byId);
  return (
    <div className="loadout-grid">
      {slotColumns.map((column) => (
        <div
          className="loadout-stack"
          role="group"
          aria-label={column.label}
          key={column.id}
        >
          {column.slots.map(({ id: slotId, label, icon }) => {
            const compatible = inventory.filter((entry) =>
              inventorySlotCandidates(entry, byId).includes(slotId),
            );
            const assigned = compatible.find((entry) =>
              assignments.assignmentsByEntry
                .get(entry.id)
                ?.some((assignment) => assignment.slot === slotId),
            );
            const selectId = `loadout-slot-${slotId}`;
            return (
              <div className="loadout-slot" key={slotId}>
                <span className="loadout-slot-label">
                  <Icon name={icon} />
                  <label htmlFor={selectId}>{label}</label>
                </span>
                <select
                  id={selectId}
                  className={assigned === undefined ? "is-empty" : undefined}
                  value={assigned?.id ?? ""}
                  onFocus={() => {
                    if (assigned !== undefined) onInspect(assigned);
                  }}
                  onChange={(event) => {
                    const entry = inventory.find(
                      ({ id }) => id === event.currentTarget.value,
                    );
                    if (entry !== undefined) onInspect(entry);
                    const pairedHandSlots = ["main-hand", "off-hand"] as const;
                    const entryUsesBothHands =
                      entry !== undefined &&
                      inventoryRequiresBothHands(entry, byId);
                    const assignedUsesBothHands =
                      assigned !== undefined &&
                      inventoryRequiresBothHands(assigned, byId);
                    if (assignedUsesBothHands && !entryUsesBothHands) {
                      onEquipSlot(
                        entry?.id,
                        [slotId],
                        assigned.id,
                        pairedHandSlots,
                      );
                      return;
                    }
                    onEquipSlot(
                      event.currentTarget.value || undefined,
                      entryUsesBothHands ? pairedHandSlots : [slotId],
                      assigned?.id,
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
        </div>
      ))}
      {inventory.some(
        (entry) =>
          entry.equippedQuantity > 0 &&
          entry.equippedSlots === undefined &&
          !assignments.assignmentsByEntry.has(entry.id),
      ) ? (
        <p className="field-help loadout-help">
          Some imported equipped counts cannot be matched to a unique open slot.
          They remain rules-active until you revise those holdings.
        </p>
      ) : null}
    </div>
  );
}

function FundsPane({
  wallet,
  mergeFunds,
  onSetWallet,
  onAdjustMoney,
}: {
  readonly wallet: EquipmentWalletView;
  readonly mergeFunds: boolean;
  readonly onSetWallet: (wallet: EquipmentWalletView) => void;
  readonly onAdjustMoney: (
    adjustment: CoinAdjustment,
    location: MoneyLocation | undefined,
  ) => string | undefined;
}) {
  const [chosenLocation, setChosenLocation] =
    useState<MoneyLocation>("carried");
  const location = mergeFunds ? undefined : chosenLocation;
  const [editing, setEditing] = useState<{
    readonly coin: keyof CurrencyAmount;
    readonly draft: string;
  }>();
  const [adjustment, setAdjustment] = useState("");
  const [adjustmentMessage, setAdjustmentMessage] = useState<{
    readonly kind: "error" | "success";
    readonly text: string;
    readonly generation: number;
  }>();
  const [walletPulse, setWalletPulse] = useState<{
    readonly generation: number;
    readonly denominations: readonly (keyof CurrencyAmount)[];
    readonly direction: "increase" | "decrease";
  }>({ generation: 0, denominations: [], direction: "increase" });
  const adjustmentInput = useRef<HTMLInputElement>(null);
  const totalWalletCopper =
    walletCopper(wallet.carried) + walletCopper(wallet.stored);
  const totalWallet = useMemo(
    () => shownWalletCoins(wallet, location),
    [location, wallet],
  );
  const previousWalletCopper = useRef(totalWalletCopper);
  const previousWallet = useRef(wallet);

  useEffect(() => {
    const previousCopper = previousWalletCopper.current;
    previousWalletCopper.current = totalWalletCopper;
    if (previousCopper === totalWalletCopper) return;
    const previousTotal = shownWalletCoins(previousWallet.current, location);
    previousWallet.current = wallet;
    setWalletPulse((current) => ({
      generation: current.generation + 1,
      denominations: CURRENCY_DENOMINATIONS.filter(
        (denomination) =>
          totalWallet[denomination] !== previousTotal[denomination],
      ),
      direction: totalWalletCopper < previousCopper ? "decrease" : "increase",
    }));
  }, [location, totalWallet, totalWalletCopper, wallet]);

  const showAdjustmentError = (text: string) => {
    setAdjustmentMessage((current) => ({
      kind: "error",
      text,
      generation: (current?.generation ?? 0) + 1,
    }));
    const input = adjustmentInput.current;
    if (input !== null) {
      input.classList.remove("is-error");
      void input.offsetWidth;
      input.classList.add("is-error");
      input.focus();
    }
  };

  const applyAdjustment = () => {
    let coins: CoinAdjustment;
    try {
      coins = parseCoinAdjustment(adjustment);
    } catch (reason: unknown) {
      showAdjustmentError(
        reason instanceof Error
          ? reason.message
          : "Enter a valid currency adjustment",
      );
      return;
    }
    const error = onAdjustMoney(coins, location);
    if (error !== undefined) {
      showAdjustmentError(error);
      return;
    }
    setAdjustment("");
    setAdjustmentMessage((current) => ({
      kind: "success",
      text: "Funds adjusted.",
      generation: (current?.generation ?? 0) + 1,
    }));
  };

  const startCoinEdit = (coin: keyof CurrencyAmount) =>
    setEditing({ coin, draft: String(totalWallet[coin]) });
  const commitCoinEdit = () => {
    if (editing === undefined) return;
    const count = Number(editing.draft.replaceAll(",", "").trim());
    setEditing(undefined);
    if (!Number.isSafeInteger(count) || count < 0) return;
    if (count === totalWallet[editing.coin]) return;
    onSetWallet(walletWithCoinCount(wallet, editing.coin, count, location));
  };

  const coinTile = (denomination: keyof CurrencyAmount) => (
    <div
      key={`${denomination}-${walletPulse.denominations.includes(denomination) ? walletPulse.generation : 0}`}
      className={`stat-tile funds-coin-tile${
        walletPulse.denominations.includes(denomination)
          ? ` is-adjusted is-${walletPulse.direction}`
          : ""
      }`}
      // The whole tile, not just its digits, starts editing on double-click.
      onDoubleClick={() => {
        if (editing?.coin !== denomination) startCoinEdit(denomination);
      }}
    >
      <dt>{DENOMINATION_NAMES[denomination]}</dt>
      <dd>
        {editing?.coin === denomination ? (
          <input
            aria-label={`${DENOMINATION_NAMES[denomination]} coins`}
            autoFocus
            className="funds-coin-input"
            inputMode="numeric"
            value={editing.draft}
            onBlur={commitCoinEdit}
            onChange={(event) =>
              setEditing({
                coin: denomination,
                draft: event.currentTarget.value,
              })
            }
            onFocus={(event) => event.currentTarget.select()}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commitCoinEdit();
              } else if (event.key === "Escape") {
                event.preventDefault();
                setEditing(undefined);
              }
            }}
          />
        ) : (
          <button
            aria-label={`${DENOMINATION_NAMES[denomination]}: ${totalWallet[denomination].toLocaleString("en-US")}. Double-click or press Enter to edit`}
            className="funds-coin-value"
            title="Double-click to edit"
            type="button"
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === "F2") {
                event.preventDefault();
                startCoinEdit(denomination);
              }
            }}
          >
            {totalWallet[denomination].toLocaleString("en-US")}
          </button>
        )}
      </dd>
    </div>
  );

  return (
    <section
      className="stat-group stat-tone-wealth funds-pane"
      aria-label="Funds"
    >
      {mergeFunds ? null : (
        <div
          aria-label="Funds location"
          className="funds-location-switch"
          role="radiogroup"
        >
          {(["carried", "stored"] as const).map((where) => (
            <button
              aria-checked={chosenLocation === where}
              key={where}
              role="radio"
              type="button"
              onClick={() => {
                setEditing(undefined);
                setChosenLocation(where);
              }}
            >
              {where === "carried" ? "Carried" : "Stored"}
            </button>
          ))}
        </div>
      )}
      {/* PP, GP and an actions tile, then SP, CP, AD: one 3 × 2 grid like
          the ability scores, values below their labels so none are cut off.
          Double-click (or Enter on) a coin count to edit it. */}
      <dl className="stat-tiles stat-tiles-compact inventory-wallet-denominations">
        {CURRENCY_DENOMINATIONS.slice(0, 2).map(coinTile)}
        <div className="stat-tile funds-pane-actions">
          <dt className="visually-hidden">Change funds</dt>
          <dd>
            {/* Type an amount ("-15 gp", "20pp") and press Enter. */}
            <form
              className="funds-adjust-form"
              onSubmit={(event) => {
                event.preventDefault();
                applyAdjustment();
              }}
            >
              <label
                className="visually-hidden"
                htmlFor="funds-wallet-adjustment"
              >
                Adjust funds, for example -15 gp or 20pp
              </label>
              <input
                id="funds-wallet-adjustment"
                ref={adjustmentInput}
                type="text"
                inputMode="text"
                className={
                  adjustmentMessage?.kind === "error" ? "is-error" : undefined
                }
                placeholder="±gp"
                title="Adjust funds: type an amount such as -15 gp or 20pp, then press Enter"
                value={adjustment}
                aria-describedby="funds-wallet-adjustment-message"
                aria-invalid={adjustmentMessage?.kind === "error" || undefined}
                onChange={(event) => {
                  setAdjustment(event.currentTarget.value);
                  setAdjustmentMessage(undefined);
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Escape") return;
                  setAdjustment("");
                  setAdjustmentMessage(undefined);
                }}
              />
              <span
                key={`funds-wallet-adjustment-${adjustmentMessage?.generation ?? 0}`}
                className="visually-hidden"
                id="funds-wallet-adjustment-message"
                role={adjustmentMessage?.kind === "error" ? "alert" : "status"}
              >
                {adjustmentMessage?.text ?? ""}
              </span>
            </form>
          </dd>
        </div>
        {CURRENCY_DENOMINATIONS.slice(2).map(coinTile)}
      </dl>
    </section>
  );
}

/** The character's funds in the builder sidebar: coin counts edited in place
 * and quick adjust. With merged funds (the default setting) carried and
 * stored coins show as one; otherwise a switch chooses which is shown. */
export function CharacterWallet({
  wallet,
  mergeFunds,
  onSetWallet,
  onAdjustMoney,
}: {
  readonly wallet: EquipmentWalletView;
  readonly mergeFunds: boolean;
  readonly onSetWallet: (wallet: EquipmentWalletView) => void;
  readonly onAdjustMoney: (
    adjustment: CoinAdjustment,
    location: MoneyLocation | undefined,
  ) => string | undefined;
}) {
  return (
    <FundsPane
      wallet={wallet}
      mergeFunds={mergeFunds}
      onSetWallet={onSetWallet}
      onAdjustMoney={onAdjustMoney}
    />
  );
}

export function EquipmentWorkspace({
  build,
  entities,
  byId,
  wallet,
  activeDefinitionIds,
  workspace,
  loadoutView,
  shopCategory,
  onShopCategoryChange,
  onPutInventory,
  onPurchase,
  onSell,
  onEquipSlot,
}: {
  readonly build: CharacterBuild;
  readonly entities: readonly ContentEntity[];
  readonly byId: ReadonlyMap<string, ContentEntity>;
  readonly wallet: EquipmentWalletView;
  readonly activeDefinitionIds: readonly string[];
  readonly workspace: "equipment" | "shop";
  readonly loadoutView: boolean;
  readonly shopCategory: ShopCategory;
  readonly onShopCategoryChange: (category: ShopCategory) => void;
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
    currentEntryId?: string,
    currentSlots?: readonly string[],
  ) => void;
}) {
  const [inspected, setInspected] = useState<InspectedItemDetail>();
  const [openSaleId, setOpenSaleId] = useState<string>();
  // A "Remove" click arms the button (a second click confirms) instead of a
  // native confirm() dialog.
  const removeAction = useArmedAction("inventory-remove-trigger");
  const [inventoryCategoryExpansion, setInventoryCategoryExpansion] = useState<
    ReadonlyMap<InventoryCategoryId, boolean>
  >(
    () =>
      new Map(
        INVENTORY_CATEGORIES.map(({ id, initiallyExpanded }) => [
          id,
          initiallyExpanded,
        ]),
      ),
  );
  const ownedDefinitions = useMemo(
    () =>
      activeDefinitionIds.flatMap((id) => {
        const entity = byId.get(id.toLocaleLowerCase());
        return entity === undefined ? [] : [entity];
      }),
    [activeDefinitionIds, byId],
  );
  const inventory = build.inventory.filter(({ quantity }) => quantity > 0);
  const inventoryGroups = useMemo(
    () => groupInventoryByCategory(inventory, byId),
    [inventory, byId],
  );
  const loadoutSlotColumns = visibleLoadoutSlotColumns(
    activeDefinitionIds,
    inventory,
    byId,
  );
  const visibleLoadoutSlots = loadoutSlotColumns.flatMap(({ slots }) =>
    slots.map(({ id }) => id),
  );
  const carriedCopper = walletCopper(wallet.carried);
  const storedCopper = walletCopper(wallet.stored);

  useEffect(() => {
    if (openSaleId === undefined) return;
    const dismissOutside = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Element &&
        target
          .closest("[data-inventory-sale-menu]")
          ?.getAttribute("data-inventory-sale-menu") === openSaleId
      )
        return;
      setOpenSaleId(undefined);
    };
    const dismissWithEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      const trigger = [
        ...document.querySelectorAll<HTMLElement>("[data-inventory-sale-menu]"),
      ]
        .find(
          (menu) =>
            menu.getAttribute("data-inventory-sale-menu") === openSaleId,
        )
        ?.querySelector<HTMLElement>(".inventory-icon-action");
      setOpenSaleId(undefined);
      requestAnimationFrame(() => trigger?.focus());
    };
    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("keydown", dismissWithEscape);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("keydown", dismissWithEscape);
    };
  }, [openSaleId]);

  const inspectInventory = (entry: BuildInventoryEntry) => {
    setInspected(inventoryItemDetail(entry, byId));
  };
  return (
    <section
      aria-label={workspace === "equipment" ? "Equipment" : "Shop"}
      className="choice-pane standalone-workspace-pane equipment-pane"
    >
      <div className="equipment-workspace">
        <div
          className="equipment-primary"
          aria-label={
            workspace === "shop"
              ? "Shop catalog"
              : loadoutView
                ? "Loadout"
                : "Inventory"
          }
        >
          {workspace === "equipment" ? (
            <>
              <div className="equipment-mode-content">
                {loadoutView ? (
                  <LoadoutGrid
                    inventory={inventory}
                    byId={byId}
                    activeDefinitionIds={activeDefinitionIds}
                    onInspect={inspectInventory}
                    onEquipSlot={onEquipSlot}
                  />
                ) : (
                  <>
                    {inventoryGroups.length === 0 ? (
                      <p>No carried inventory.</p>
                    ) : (
                      <div className="equipment-table-scroll inventory-table-scroll">
                        <table className="inventory-table">
                          <thead>
                            <tr>
                              <th>Item</th>
                              <th>Quantity</th>
                              <th>
                                <span className="visually-hidden">Actions</span>
                              </th>
                            </tr>
                          </thead>
                          {inventoryGroups.map(({ category, entries }) => {
                            const expanded =
                              inventoryCategoryExpansion.get(category.id) ??
                              category.initiallyExpanded;
                            const sectionId = `inventory-category-${category.id}`;
                            return (
                              <Fragment key={category.id}>
                                <tbody>
                                  <tr className="inventory-category-row table-section-row">
                                    <th colSpan={3} scope="rowgroup">
                                      <button
                                        className="table-section-toggle"
                                        type="button"
                                        aria-expanded={expanded}
                                        aria-controls={sectionId}
                                        onClick={() =>
                                          setInventoryCategoryExpansion(
                                            (current) => {
                                              const next = new Map(current);
                                              next.set(category.id, !expanded);
                                              return next;
                                            },
                                          )
                                        }
                                      >
                                        <Icon name="chevron" />
                                        <span className="inventory-category-label">
                                          <span>{category.label}</span>
                                          <small
                                            className="table-section-count"
                                            aria-label={`${entries.length} holding${entries.length === 1 ? "" : "s"}`}
                                          >
                                            {entries.length}
                                          </small>
                                        </span>
                                      </button>
                                    </th>
                                  </tr>
                                </tbody>
                                <tbody id={sectionId} hidden={!expanded}>
                                  {expanded
                                    ? entries.map((entry) => {
                                        const inventoryIndex =
                                          inventory.indexOf(entry);
                                        const definitionIds =
                                          inventoryDefinitionIds(entry);
                                        const entity = definitionIds.at(-1);
                                        const definition =
                                          entity === undefined
                                            ? undefined
                                            : byId.get(entity);
                                        const physicalBase =
                                          definitionIds.length > 1
                                            ? byId.get(definitionIds[0]!)
                                            : undefined;
                                        const price =
                                          definition === undefined
                                            ? undefined
                                            : entityCurrencyCopper(definition);
                                        const displayName =
                                          inventoryDisplayName(entry, byId);
                                        const saleTriggerId = `inventory-sale-trigger-${inventoryIndex}`;
                                        const saleOptionsId = `inventory-sale-options-${inventoryIndex}`;
                                        const equippedStatus =
                                          inventoryEquippedStatus(entry);
                                        const loadoutToggle =
                                          inventoryLoadoutToggle(
                                            inventory,
                                            byId,
                                            entry.id,
                                            visibleLoadoutSlots,
                                          );
                                        const loadoutToggleDescription =
                                          loadoutToggle.kind === "unequip"
                                            ? "Double-click to unequip."
                                            : loadoutToggle.kind === "equip"
                                              ? loadoutToggle.displaces
                                                ? "Double-click to equip; this will replace the item in the occupied compatible slot."
                                                : "Double-click to equip."
                                              : loadoutToggle.kind ===
                                                  "ambiguous"
                                                ? "Equipped slots are unknown; use Loadout to revise this holding."
                                                : "This holding has no compatible visible Loadout slot.";
                                        const equippedBadge =
                                          equippedStatus === undefined
                                            ? undefined
                                            : entry.equippedSlots === undefined
                                              ? entry.quantity > 1
                                                ? `${entry.equippedQuantity}/${entry.quantity}?`
                                                : "?"
                                              : entry.quantity > 1
                                                ? `${entry.equippedQuantity}/${entry.quantity}`
                                                : undefined;
                                        const removalArmed =
                                          removeAction.isArmed(entry.id);
                                        return (
                                          <tr
                                            className="table-clickable-row"
                                            key={entry.id}
                                            title={loadoutToggleDescription}
                                            onClick={() =>
                                              inspectInventory(entry)
                                            }
                                            onDoubleClick={() => {
                                              if (
                                                loadoutToggle.kind ===
                                                  "ambiguous" ||
                                                loadoutToggle.kind ===
                                                  "unavailable"
                                              )
                                                return;
                                              if (
                                                loadoutToggle.kind === "unequip"
                                              ) {
                                                onEquipSlot(
                                                  undefined,
                                                  loadoutToggle.slots,
                                                  entry.id,
                                                  loadoutToggle.slots,
                                                );
                                                return;
                                              }
                                              onEquipSlot(
                                                entry.id,
                                                loadoutToggle.slots,
                                              );
                                            }}
                                          >
                                            <th scope="row">
                                              <button
                                                type="button"
                                                className="table-inspect-button inventory-item-button"
                                                aria-label={`${displayName}. ${equippedStatus ?? "Not equipped"}. ${loadoutToggleDescription}`}
                                                onClick={(event) => {
                                                  event.stopPropagation();
                                                  inspectInventory(entry);
                                                }}
                                              >
                                                <span
                                                  className={`inventory-item-icon item-icon${equippedStatus === undefined ? "" : " is-equipped"}`}
                                                  title={equippedStatus}
                                                >
                                                  <Icon
                                                    name={
                                                      definition === undefined
                                                        ? "item"
                                                        : canonicalItemIcon(
                                                            definition,
                                                            physicalBase,
                                                          )
                                                    }
                                                  />
                                                  {equippedStatus ===
                                                  undefined ? null : (
                                                    <span
                                                      className="inventory-equipped-badge"
                                                      aria-hidden="true"
                                                    >
                                                      {equippedBadge ===
                                                      undefined ? (
                                                        <Icon name="check" />
                                                      ) : (
                                                        equippedBadge
                                                      )}
                                                    </span>
                                                  )}
                                                </span>
                                                <span className="inventory-item-copy">
                                                  <span className="inventory-item-name">
                                                    {displayName}
                                                  </span>
                                                  {equippedStatus ===
                                                  undefined ? null : (
                                                    <span className="visually-hidden">
                                                      {equippedStatus}
                                                    </span>
                                                  )}
                                                </span>
                                              </button>
                                            </th>
                                            <td>
                                              <div
                                                className="inventory-quantity"
                                                onClick={(event) =>
                                                  event.stopPropagation()
                                                }
                                                onDoubleClick={(event) =>
                                                  event.stopPropagation()
                                                }
                                              >
                                                <button
                                                  type="button"
                                                  aria-label={`Decrease quantity of ${displayName}`}
                                                  disabled={entry.quantity <= 1}
                                                  onClick={() => {
                                                    onPutInventory(
                                                      inventoryEntryWithQuantity(
                                                        entry,
                                                        entry.quantity - 1,
                                                      ),
                                                    );
                                                  }}
                                                >
                                                  −
                                                </button>
                                                <output
                                                  aria-label={`Quantity of ${displayName}`}
                                                >
                                                  {entry.quantity}
                                                </output>
                                                <button
                                                  type="button"
                                                  aria-label={`Increase quantity of ${displayName}`}
                                                  onClick={() =>
                                                    onPutInventory(
                                                      inventoryEntryWithQuantity(
                                                        entry,
                                                        entry.quantity + 1,
                                                      ),
                                                    )
                                                  }
                                                >
                                                  +
                                                </button>
                                              </div>
                                            </td>
                                            <td className="inventory-actions-cell">
                                              <div
                                                className="inventory-row-actions"
                                                onClick={(event) =>
                                                  event.stopPropagation()
                                                }
                                                onDoubleClick={(event) =>
                                                  event.stopPropagation()
                                                }
                                              >
                                                {price === undefined ? (
                                                  <button
                                                    type="button"
                                                    className="inventory-icon-action button-icon"
                                                    aria-label={`Sell ${displayName}`}
                                                    title="This item has no price and cannot be sold"
                                                    disabled
                                                  >
                                                    <Icon name="circle-dollar-sign" />
                                                  </button>
                                                ) : (
                                                  <div
                                                    className="inventory-sale-menu"
                                                    data-inventory-sale-menu={
                                                      entry.id
                                                    }
                                                  >
                                                    <button
                                                      type="button"
                                                      id={saleTriggerId}
                                                      className="inventory-icon-action button-icon"
                                                      aria-label={`Sell one ${displayName}`}
                                                      aria-expanded={
                                                        openSaleId === entry.id
                                                      }
                                                      aria-controls={
                                                        saleOptionsId
                                                      }
                                                      title="Sell one"
                                                      onClick={() =>
                                                        setOpenSaleId(
                                                          (current) =>
                                                            current === entry.id
                                                              ? undefined
                                                              : entry.id,
                                                        )
                                                      }
                                                    >
                                                      <Icon name="circle-dollar-sign" />
                                                    </button>
                                                    {openSaleId === entry.id ? (
                                                      <div
                                                        className="inventory-sale-options"
                                                        id={saleOptionsId}
                                                        aria-label={`Sell one ${displayName} for`}
                                                      >
                                                        {comparableSaleProceeds(
                                                          price,
                                                        ).map(
                                                          ({
                                                            percentage,
                                                            label,
                                                          }) => (
                                                            <button
                                                              key={percentage}
                                                              type="button"
                                                              onClick={() => {
                                                                onSell(
                                                                  entry,
                                                                  price,
                                                                  percentage,
                                                                );
                                                                setOpenSaleId(
                                                                  undefined,
                                                                );
                                                                requestAnimationFrame(
                                                                  () =>
                                                                    document
                                                                      .getElementById(
                                                                        saleTriggerId,
                                                                      )
                                                                      ?.focus(),
                                                                );
                                                              }}
                                                            >
                                                              <span>
                                                                {percentage}%
                                                              </span>
                                                              <strong>
                                                                {label}
                                                              </strong>
                                                            </button>
                                                          ),
                                                        )}
                                                      </div>
                                                    ) : null}
                                                  </div>
                                                )}
                                                <button
                                                  type="button"
                                                  className="inventory-icon-action inventory-remove-action button-icon"
                                                  data-inventory-remove-trigger={
                                                    entry.id
                                                  }
                                                  data-armed={
                                                    removalArmed || undefined
                                                  }
                                                  aria-label={
                                                    removalArmed
                                                      ? `Confirm removing ${displayName}`
                                                      : `Remove ${displayName}`
                                                  }
                                                  title={
                                                    removalArmed
                                                      ? entry.equippedQuantity >
                                                        0
                                                        ? "Click again to remove and unequip"
                                                        : "Click again to remove"
                                                      : "Remove"
                                                  }
                                                  onClick={() => {
                                                    if (!removalArmed) {
                                                      removeAction.arm(
                                                        entry.id,
                                                      );
                                                      return;
                                                    }
                                                    removeAction.disarm();
                                                    onPutInventory(
                                                      inventoryEntryWithQuantity(
                                                        entry,
                                                        0,
                                                      ),
                                                    );
                                                  }}
                                                >
                                                  <Icon
                                                    name={
                                                      removalArmed
                                                        ? "warning"
                                                        : "trash"
                                                    }
                                                  />
                                                </button>
                                              </div>
                                            </td>
                                          </tr>
                                        );
                                      })
                                    : null}
                                </tbody>
                              </Fragment>
                            );
                          })}
                        </table>
                      </div>
                    )}
                  </>
                )}
              </div>
            </>
          ) : (
            <ShopWorkspace
              browse={preferredShopBrowse(
                shopCategory as ShopBrowseId | "items" | "scrolls",
              )}
              characterLevel={build.effectiveLevel}
              entities={entities}
              inventory={inventory}
              ownedDefinitions={ownedDefinitions}
              walletCopper={carriedCopper + storedCopper}
              onInspect={(entity, displayName, kindLabel) =>
                setInspected({
                  entities: [entity],
                  displayName,
                  effectiveLevel: build.effectiveLevel,
                  ...(kindLabel === undefined ? {} : { kindLabel }),
                })
              }
              onAcquire={onPurchase}
              onBrowseChange={(category) => onShopCategoryChange(category)}
            />
          )}
        </div>
        <div
          className={`shared-choice-detail${workspace === "shop" ? " shop-rail" : ""}`}
        >
          <ItemDetail byId={byId} item={inspected} />
        </div>
      </div>
    </section>
  );
}
