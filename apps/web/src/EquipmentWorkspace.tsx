import {
  type CSSProperties,
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";

import {
  CURRENCY_DENOMINATIONS,
  consolidateCurrency,
  currencyToCopper,
  inventoryEntryWithQuantity,
  parseCoinAdjustment,
  type CoinAdjustment,
  type CurrencyAmount,
  type BuildInventoryEntry,
  type CharacterBuild,
  type CharacterCommand,
} from "@4ecb/character-domain";
import type { ContentEntity } from "@4ecb/content-domain";
import { itemChoiceSlots, itemSetPartyCountName } from "@4ecb/rules-engine";
import { offeredDetailEntities } from "./detail-stack";
import {
  alchemicalFormulaItems,
  comparableSaleProceeds,
  entityCurrencyCopper,
  groupInventoryByCategory,
  INVENTORY_CATEGORIES,
  type InventoryCategoryId,
  inventoryDefinitionIds,
  inventoryAttachedAugment,
  inventoryAugmentAttachedTo,
  inventoryAugmentHosts,
  inventoryDisplayName,
  itemChoiceCandidates,
  inventoryIsAugment,
  inventoryEntryForEntity,
  inventoryForcedTwoHanded,
  inventoryIsVersatile,
  inventoryLoadoutToggle,
  inventoryPackageGroupsFor,
  packageQuantityCommands,
  packageSaleCommands,
  packageSalePriceCopper,
  inventoryRequiresBothHands,
  inventorySlotCandidates,
  inventoryWieldsTwoHanded,
  loadoutContext,
  loadoutSlotContextWithRings,
  type LoadoutContext,
  type LoadoutSlotContext,
  missingInventoryElements,
  resolveLoadoutAssignments,
  resolvedItemChoices,
  shopItemLevel,
  type ShopBrowseId,
  visibleLoadoutSlotColumns,
} from "./equipment-ui";
import { Icon } from "./Icon";
import {
  ItemContextMenu,
  itemContextMenuAt,
  type ItemContextMenuItem,
  type ItemContextMenuState,
} from "./ItemContextMenu";
import {
  itemChoiceHeading,
  itemChoiceSelectionsFrom,
} from "./item-choice-pages";
import { canonicalItemIcon } from "./item-icons";
import { ItemChoiceDialog } from "./ItemChoicePicker";
import type { ShopCategory } from "./routes";
import { preferredShopBrowse, ShopWorkspace } from "./ShopWorkspace";
import { useArmedAction } from "./useArmedAction";
import {
  BuilderCreatureCard,
  BuilderItemCard,
  BuilderPowerCard,
} from "./BuilderCards";
import { BuilderItemSetCard } from "./BuilderItemSetCard";

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

function locationCoins(
  amount: CurrencyAmount,
): EquipmentWalletView[MoneyLocation] {
  return {
    copper: amount.cp,
    silver: amount.sp,
    gold: amount.gp,
    platinum: amount.pp,
    astral: amount.ad,
  };
}

/** The wallet with the shown coins consolidated (up to platinum, diamonds
 * kept), each location on its own so carried and stored totals never move. */
export function consolidatedWallet(
  wallet: EquipmentWalletView,
  location: MoneyLocation | undefined,
): EquipmentWalletView {
  const consolidate = (coins: EquipmentWalletView[MoneyLocation]) =>
    locationCoins(consolidateCurrency(locationCurrency(coins)));
  return location === undefined
    ? {
        carried: consolidate(wallet.carried),
        stored: consolidate(wallet.stored),
      }
    : { ...wallet, [location]: consolidate(wallet[location]) };
}

function sameWallet(
  left: EquipmentWalletView,
  right: EquipmentWalletView,
): boolean {
  return (["carried", "stored"] as const).every((where) =>
    DENOMINATIONS.every(({ id }) => left[where][id] === right[where][id]),
  );
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
  note,
  empty,
  onSetItemSetPartyPieces,
}: {
  readonly item: InspectedItemDetail | undefined;
  readonly byId: ReadonlyMap<string, ContentEntity>;
  /** A builder addition shown below the card (D079), e.g. a known source. */
  readonly note?: string;
  readonly empty?: { readonly heading: string; readonly hint: string };
  /** Sets or clears a group item set's party count (Equipment and Shop). */
  readonly onSetItemSetPartyPieces?: (
    setId: string,
    pieces: number | undefined,
  ) => void;
}) {
  const entity = item?.entities.at(-1);
  if (item === undefined || entity === undefined)
    return (
      <aside className="candidate-detail candidate-detail-empty">
        <h4>{empty?.heading ?? "Choose an item to inspect it"}</h4>
        <p>
          {empty?.hint ??
            "The same detail viewer follows selections across Inventory, Loadout, and Shop."}
        </p>
      </aside>
    );
  const references = new Map(byId);
  for (const candidate of byId.values()) {
    const name = candidate.name.trim().toLocaleLowerCase();
    if (!references.has(name)) references.set(name, candidate);
  }
  // Powers any component grants or names (an artifact's, a wand's), and an
  // item-owned choice resolved to a power (e.g. the Power picked for a Genasi
  // Soul Armor), are sibling cards.
  const powers = [
    ...item.entities.flatMap((component) =>
      offeredDetailEntities(component, references),
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
        <BuilderItemCard
          name={item.displayName}
          entities={item.entities}
          {...(note === undefined
            ? {}
            : {
                subheading: <p className="candidate-relationship">{note}</p>,
              })}
        />
      </div>
      <BuilderCreatureCard name={item.displayName} entities={item.entities} />
      {powers.map((power) => (
        <Fragment key={power.id}>
          <BuilderPowerCard entity={power} headingSuffix="-granted" />
          {/* A summon power's creature (D111). */}
          <BuilderCreatureCard
            name={power.name}
            entities={[power]}
            origin={{ kind: "summon", powerId: power.id }}
            headingSuffix="-granted-creature"
          />
        </Fragment>
      ))}
      <BuilderItemSetCard
        pieces={item.entities}
        byId={byId}
        {...(onSetItemSetPartyPieces === undefined
          ? {}
          : { onSetPartyPieces: onSetItemSetPartyPieces })}
      />
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
  hints,
  activeDefinitionIds,
  onInspect,
  onItemContextMenu,
  onEquipSlot,
}: {
  readonly inventory: readonly BuildInventoryEntry[];
  readonly byId: ReadonlyMap<string, ContentEntity>;
  readonly hints: LoadoutContext;
  readonly activeDefinitionIds: readonly string[];
  readonly onInspect: (entry: BuildInventoryEntry) => void;
  readonly onItemContextMenu: (
    event: ReactMouseEvent<HTMLElement>,
    entry: BuildInventoryEntry,
  ) => void;
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
    hints.slotContext,
  );
  const slotContext = loadoutSlotContextWithRings(hints.slotContext, inventory);
  const assignments = resolveLoadoutAssignments(inventory, byId, hints);
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
              inventorySlotCandidates(entry, byId, slotContext).includes(
                slotId,
              ),
            );
            const assigned = compatible.find((entry) =>
              assignments.assignmentsByEntry
                .get(entry.id)
                ?.some((assignment) => assignment.slot === slotId),
            );
            const selectId = `loadout-slot-${slotId}`;
            return (
              <div
                className="loadout-slot"
                key={slotId}
                onContextMenu={(event) => {
                  if (assigned !== undefined)
                    onItemContextMenu(event, assigned);
                }}
              >
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
                      inventoryRequiresBothHands(entry, byId, hints) &&
                      pairedHandSlots.includes(
                        slotId as (typeof pairedHandSlots)[number],
                      );
                    const assignedUsesBothHands =
                      assigned !== undefined &&
                      inventoryRequiresBothHands(assigned, byId, hints) &&
                      pairedHandSlots.includes(
                        slotId as (typeof pairedHandSlots)[number],
                      );
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

/**
 * A coin count whose changed characters roll in like an odometer: up (the
 * new digit from below) when the count grows, down when it shrinks, the
 * rightmost first. Tiles remount on each change, so the old count comes in
 * as `from`; unchanged characters stay put.
 */
function RollingCount({
  from,
  value,
}: {
  readonly from: number;
  readonly value: number;
}) {
  const next = value.toLocaleString("en-US");
  if (from === value) return <>{next}</>;
  const previous = from.toLocaleString("en-US");
  const length = Math.max(previous.length, next.length);
  const oldChars = previous.padStart(length, " ");
  const newChars = next.padStart(length, " ");
  const direction = value > from ? "up" : "down";
  return (
    <span className={`rolling-count is-rolling-${direction}`}>
      {[...newChars].map((char, index) => {
        if (char === " ") return null;
        const old = oldChars[index] ?? " ";
        if (old === char) return <span key={index}>{char}</span>;
        return (
          <span
            className="rolling-digit"
            key={index}
            // The rightmost character turns first, like a register's wheels.
            style={
              {
                "--roll-delay": `${(length - 1 - index) * 35}ms`,
              } as CSSProperties
            }
          >
            {old === " " ? null : (
              <span aria-hidden="true" className="rolling-digit-old">
                {old}
              </span>
            )}
            <span className="rolling-digit-new">{char}</span>
          </span>
        );
      })}
    </span>
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
  // How much each shown coin last changed: its tile pulses and ticks.
  const [walletPulse, setWalletPulse] = useState<{
    readonly generation: number;
    readonly deltas: Partial<Record<keyof CurrencyAmount, number>>;
  }>({ generation: 0, deltas: {} });
  const adjustmentInput = useRef<HTMLInputElement>(null);
  // Consolidate sits beside the quick-adjust field, so it takes two clicks.
  const consolidateAction = useArmedAction("funds-consolidate-trigger");
  const totalWallet = useMemo(
    () => shownWalletCoins(wallet, location),
    [location, wallet],
  );
  const consolidated = useMemo(
    () => consolidatedWallet(wallet, location),
    [location, wallet],
  );
  const canConsolidate = !sameWallet(consolidated, wallet);
  // Nothing to consolidate disarms it, so it can't come back armed later.
  const disarmConsolidate = consolidateAction.disarm;
  useEffect(() => {
    if (!canConsolidate) disarmConsolidate();
  }, [canConsolidate, disarmConsolidate]);
  const previousShown = useRef({ location, coins: totalWallet });
  // Set when a coin cell is edited directly, for the next change only.
  const directEdit = useRef(false);

  // A layout effect, so the remounted tiles roll from the old count before
  // the new one is ever painted.
  useLayoutEffect(() => {
    const previous = previousShown.current;
    previousShown.current = { location, coins: totalWallet };
    // Switching Carried / Stored changes the coins shown, not the coins.
    if (previous.location !== location) return;
    const deltas: Partial<Record<keyof CurrencyAmount, number>> = {};
    for (const denomination of CURRENCY_DENOMINATIONS) {
      const delta = totalWallet[denomination] - previous.coins[denomination];
      if (delta !== 0) deltas[denomination] = delta;
    }
    if (Object.keys(deltas).length === 0) return;
    // A count typed into its cell needs no echo: the user knows the number.
    // Clearing the last change also keeps that tile from rolling again.
    if (directEdit.current) {
      directEdit.current = false;
      setWalletPulse((current) => ({ ...current, deltas: {} }));
      return;
    }
    setWalletPulse((current) => ({
      generation: current.generation + 1,
      deltas,
    }));
  }, [location, totalWallet]);

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
      text: `${coins.count < 0 ? "Spent" : "Added"} ${Math.abs(coins.count).toLocaleString("en-US")} ${coins.coin}.`,
      generation: (current?.generation ?? 0) + 1,
    }));
  };

  const consolidate = () => {
    if (!canConsolidate) return;
    onSetWallet(consolidated);
    setAdjustmentMessage((current) => ({
      kind: "success",
      text: "Coins consolidated.",
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
    directEdit.current = true;
    onSetWallet(walletWithCoinCount(wallet, editing.coin, count, location));
  };

  const coinTile = (denomination: keyof CurrencyAmount) => {
    const delta = walletPulse.deltas[denomination];
    return (
      <div
        // A new key per change restarts the pulse and the floating amount.
        key={`${denomination}-${delta === undefined ? 0 : walletPulse.generation}`}
        className={`stat-tile funds-coin-tile${
          delta === undefined
            ? ""
            : ` is-adjusted is-${delta < 0 ? "decrease" : "increase"}`
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
              <RollingCount
                from={totalWallet[denomination] - (delta ?? 0)}
                value={totalWallet[denomination]}
              />
            </button>
          )}
        </dd>
      </div>
    );
  };

  const consolidateArmed =
    canConsolidate && consolidateAction.isArmed("wallet");
  const adjustmentError =
    adjustmentMessage?.kind === "error" ? adjustmentMessage.text : undefined;

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
            {/* Type an amount ("50" is gold, "-15 sp", "20pp") and press
                Enter. */}
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
                Adjust funds, for example 50, -15 sp or 20pp
              </label>
              <input
                id="funds-wallet-adjustment"
                ref={adjustmentInput}
                type="text"
                inputMode="text"
                className={
                  adjustmentError === undefined ? undefined : "is-error"
                }
                placeholder="±gp"
                title="Adjust funds: type an amount such as 50 (gold), -15 sp, 20pp or 2d (diamonds), then press Enter"
                value={adjustment}
                aria-describedby="funds-wallet-adjustment-message"
                aria-invalid={adjustmentError !== undefined || undefined}
                onBlur={() => {
                  if (adjustmentError !== undefined)
                    setAdjustmentMessage(undefined);
                }}
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
              {/* Errors show as a bubble under the field until the next
                  keystroke, Escape or leaving it; successes show as the
                  amounts floated over the coin tiles, so this stays
                  screen-reader only. */}
              <span
                key={`funds-wallet-adjustment-${adjustmentMessage?.generation ?? 0}`}
                className={
                  adjustmentError === undefined
                    ? "visually-hidden"
                    : "funds-adjust-error"
                }
                id="funds-wallet-adjustment-message"
                role={adjustmentError === undefined ? "status" : "alert"}
              >
                {adjustmentMessage?.text ?? ""}
              </span>
            </form>
            <button
              aria-label={
                consolidateArmed
                  ? "Confirm consolidating coins"
                  : "Consolidate coins"
              }
              className="funds-consolidate"
              data-armed={consolidateArmed || undefined}
              data-funds-consolidate-trigger="wallet"
              // Leaving it, even by keyboard, cancels like a click elsewhere.
              onBlur={() => consolidateAction.disarm()}
              disabled={!canConsolidate}
              title={
                !canConsolidate
                  ? "Coins are already consolidated"
                  : consolidateArmed
                    ? "Click again to consolidate"
                    : "Consolidate coins: exchange them for the fewest coins of the same value, up to platinum. Diamonds stay as they are."
              }
              type="button"
              onClick={() => {
                if (!consolidateArmed) {
                  consolidateAction.arm("wallet");
                  return;
                }
                consolidateAction.disarm();
                consolidate();
              }}
            >
              <Icon name={consolidateArmed ? "warning" : "consolidate"} />
            </button>
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
  loadoutSlotContext,
  workspace,
  loadoutView,
  shopCategory,
  onShopCategoryChange,
  onPutInventory,
  onInventoryCommands,
  onPurchase,
  onSell,
  onEquipSlot,
  onSetWielding,
  onSetAugment,
  onSetText,
  focusRequest,
}: {
  /**
   * A holding to select (shown in the detail pane, its category expanded),
   * as an issue's Review link asks; `request` changes on each ask.
   */
  readonly focusRequest?: {
    readonly entryId: string;
    readonly request: number;
  };
  readonly build: CharacterBuild;
  readonly entities: readonly ContentEntity[];
  readonly byId: ReadonlyMap<string, ContentEntity>;
  readonly wallet: EquipmentWalletView;
  readonly activeDefinitionIds: readonly string[];
  /** The evaluated size facts the loadout applies (Small, Oversized, One
   *  Size Larger; D102). */
  readonly loadoutSlotContext?: LoadoutSlotContext | undefined;
  readonly workspace: "equipment" | "shop";
  readonly loadoutView: boolean;
  readonly shopCategory: ShopCategory;
  readonly onShopCategoryChange: (category: ShopCategory) => void;
  readonly onPutInventory: (entry: BuildInventoryEntry) => void;
  /** Applies several inventory commands as one edit (a package row's
   *  quantity, removal or sale rebalances both of its holdings). */
  readonly onInventoryCommands: (commands: readonly CharacterCommand[]) => void;
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
  /** Wields a versatile weapon in two hands or one (D101). */
  readonly onSetWielding: (entryId: string, twoHanded: boolean) => void;
  /** Binds augments to host holdings (null detaches), as one edit. */
  readonly onSetAugment: (
    bindings: readonly {
      readonly hostEntryId: string;
      readonly augmentEntryId: string | null;
    }[],
  ) => void;
  /** Saves a textstring (a group item set's party count); "" clears it. */
  readonly onSetText: (name: string, value: string) => void;
}) {
  const [inspected, setInspected] = useState<InspectedItemDetail>();
  const [contextMenu, setContextMenu] = useState<ItemContextMenuState>();
  const closeContextMenu = useCallback(() => setContextMenu(undefined), []);
  const [choosing, setChoosing] = useState<{
    readonly entry: BuildInventoryEntry;
    readonly elementIndex: number;
    readonly entity: ContentEntity;
  }>();
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
  // Packaged gear (Arrows and Arrow) shows as one row of the pair's total
  // units, on the package holding else the singles (D108).
  const packageGroups = useMemo(
    () => inventoryPackageGroupsFor(build.inventory, byId),
    [build.inventory, byId],
  );
  const loadoutHints = loadoutContext(build.textStrings, loadoutSlotContext);
  // Select the requested holding once per request: inspect it, expand its
  // category and bring its row into view.
  const handledFocusRequest = useRef<number>(undefined);
  useEffect(() => {
    if (
      focusRequest === undefined ||
      handledFocusRequest.current === focusRequest.request
    )
      return;
    handledFocusRequest.current = focusRequest.request;
    const requested = build.inventory.find(
      ({ id }) => id === focusRequest.entryId,
    );
    if (requested === undefined) return;
    const entry = packageGroups.get(requested.id)?.representative ?? requested;
    setInspected(inventoryItemDetail(entry, byId));
    const category = groupInventoryByCategory([entry], byId)[0]?.category.id;
    if (category !== undefined)
      setInventoryCategoryExpansion((current) =>
        new Map(current).set(category, true),
      );
    requestAnimationFrame(() =>
      [...document.querySelectorAll<HTMLElement>("[data-inventory-entry]")]
        .find((row) => row.dataset.inventoryEntry === entry.id)
        ?.scrollIntoView?.({ block: "nearest" }),
    );
  }, [focusRequest, build.inventory, byId, packageGroups]);
  // Per-item right-click actions, as in the legacy builder (no menu button).
  const augmentActions = (
    augment: BuildInventoryEntry,
  ): readonly ItemContextMenuItem[] => {
    const hosts = inventoryAugmentHosts(inventory, byId);
    const attachedTo = inventoryAugmentAttachedTo(augment, inventory);
    const attach: readonly ItemContextMenuItem[] =
      hosts.length === 0
        ? [
            {
              label: "Attach to…",
              disabledReason:
                "No magic weapon or staff in the inventory can take an augment.",
              onSelect: () => undefined,
            },
          ]
        : hosts.map((host) => {
            const attached = attachedTo.includes(host);
            return {
              key: `attach:${host.id}`,
              label: `Attach to ${inventoryDisplayName(host, byId)}`,
              checked: attached,
              onSelect: () =>
                onSetAugment([
                  {
                    hostEntryId: host.id,
                    augmentEntryId: attached ? null : augment.id,
                  },
                ]),
            };
          });
    return [
      ...attach,
      {
        label: "Detach",
        ...(attachedTo.length === 0
          ? { disabledReason: "This augment isn't attached to an item." }
          : {}),
        onSelect: () =>
          onSetAugment(
            attachedTo.map((host) => ({
              hostEntryId: host.id,
              augmentEntryId: null,
            })),
          ),
      },
    ];
  };
  // An item's own choices (an Armor of Resistance's damage type), settled
  // in the Shop's item-choice pages; always offered for an item that has
  // them, so a choice an older save never made can be made here.
  const choiceActions = (
    entry: BuildInventoryEntry,
  ): readonly ItemContextMenuItem[] =>
    entry.elements.flatMap((element, elementIndex) => {
      const entity =
        element.definitionId === undefined
          ? undefined
          : byId.get(element.definitionId.toLocaleLowerCase());
      const slot =
        entity === undefined ? undefined : itemChoiceSlots(entity)[0];
      if (entity === undefined || slot === undefined) return [];
      const empty =
        itemChoiceCandidates(slot, entities, build.effectiveLevel).length === 0;
      return [
        {
          key: `choose:${elementIndex}`,
          label: `${itemChoiceHeading(slot)}…`,
          ...(empty
            ? { disabledReason: "The content in use offers nothing to choose." }
            : {}),
          onSelect: () => setChoosing({ entry, elementIndex, entity }),
        },
      ];
    });
  const itemActions = (
    entry: BuildInventoryEntry,
  ): readonly ItemContextMenuItem[] => [
    ...holdingActions(entry),
    ...choiceActions(entry),
  ];
  const holdingActions = (
    entry: BuildInventoryEntry,
  ): readonly ItemContextMenuItem[] => {
    if (inventoryIsAugment(entry, byId)) return augmentActions(entry);
    if (!inventoryIsVersatile(entry, byId)) return [];
    const twoHanded = inventoryWieldsTwoHanded(entry, byId, loadoutHints);
    // A Small character holds a non-small versatile weapon in both hands:
    // the choice stays in the menu, checked and inert.
    const forced = inventoryForcedTwoHanded(entry, byId, loadoutHints);
    return [
      {
        label: "Wield two-handed",
        checked: twoHanded,
        ...(forced
          ? {
              disabledReason:
                "Small characters wield this weapon in both hands.",
            }
          : {}),
        onSelect: () => onSetWielding(entry.id, !twoHanded),
      },
    ];
  };
  const openItemContextMenu = (
    event: ReactMouseEvent<HTMLElement>,
    entry: BuildInventoryEntry,
  ) => {
    const menu = itemContextMenuAt(
      event,
      `${inventoryDisplayName(entry, byId)} actions`,
      itemActions(entry),
    );
    if (menu !== undefined) setContextMenu(menu);
  };
  // One row per holding, except a package pair's second holding.
  const inventoryRows = inventory.filter(
    (entry) => (packageGroups.get(entry.id)?.representative ?? entry) === entry,
  );
  const inventoryGroups = useMemo(
    () => groupInventoryByCategory(inventoryRows, byId),
    [inventoryRows, byId],
  );
  const loadoutSlotColumns = visibleLoadoutSlotColumns(
    activeDefinitionIds,
    inventory,
    byId,
    loadoutSlotContext,
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
                    hints={loadoutHints}
                    activeDefinitionIds={activeDefinitionIds}
                    onInspect={inspectInventory}
                    onItemContextMenu={openItemContextMenu}
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
                                        // A package row (Arrows ×35) counts
                                        // units and sells one single item.
                                        const packageGroup = packageGroups.get(
                                          entry.id,
                                        );
                                        const quantity =
                                          packageGroup?.units ?? entry.quantity;
                                        const setQuantity = (units: number) =>
                                          packageGroup === undefined
                                            ? onPutInventory(
                                                inventoryEntryWithQuantity(
                                                  entry,
                                                  units,
                                                ),
                                              )
                                            : onInventoryCommands(
                                                packageQuantityCommands(
                                                  packageGroup,
                                                  units,
                                                ),
                                              );
                                        const price =
                                          packageGroup !== undefined
                                            ? packageSalePriceCopper(
                                                packageGroup,
                                              )
                                            : definition === undefined
                                              ? undefined
                                              : entityCurrencyCopper(
                                                  definition,
                                                );
                                        const displayName =
                                          packageGroup?.name ??
                                          inventoryDisplayName(entry, byId);
                                        const saleName =
                                          packageGroup?.pair.single.name ??
                                          displayName;
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
                                            loadoutHints,
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
                                        // Homebrew or uninstalled content:
                                        // kept, but its effects are unknown.
                                        const contentMissing =
                                          byId.size > 0 &&
                                          missingInventoryElements(entry, byId)
                                            .length > 0;
                                        // Dragonshard augments: the host
                                        // names its augment, the augment its
                                        // host(s).
                                        const attachedAugment =
                                          inventoryAttachedAugment(
                                            entry,
                                            inventory,
                                          );
                                        const augmentHosts =
                                          inventoryAugmentAttachedTo(
                                            entry,
                                            inventory,
                                          );
                                        const augmentNote =
                                          attachedAugment !== undefined
                                            ? `Augment: ${inventoryDisplayName(attachedAugment, byId)}`
                                            : augmentHosts.length > 0
                                              ? `Attached to ${augmentHosts
                                                  .map((host) =>
                                                    inventoryDisplayName(
                                                      host,
                                                      byId,
                                                    ),
                                                  )
                                                  .join(", ")}`
                                              : undefined;
                                        return (
                                          <tr
                                            className="table-clickable-row"
                                            data-inventory-entry={entry.id}
                                            key={entry.id}
                                            title={loadoutToggleDescription}
                                            onClick={() =>
                                              inspectInventory(entry)
                                            }
                                            onContextMenu={(event) =>
                                              openItemContextMenu(event, entry)
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
                                                aria-label={`${displayName}. ${contentMissing ? "Content not installed. " : ""}${augmentNote === undefined ? "" : `${augmentNote}. `}${equippedStatus ?? "Not equipped"}. ${loadoutToggleDescription}`}
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
                                                  {contentMissing ? (
                                                    <span
                                                      className="inventory-item-missing"
                                                      title="This item's definition isn't in the game content in use, so its effects can't be calculated."
                                                    >
                                                      <Icon name="warning" />{" "}
                                                      Content not installed
                                                    </span>
                                                  ) : null}
                                                  {augmentNote ===
                                                  undefined ? null : (
                                                    <span className="inventory-item-augment">
                                                      {augmentNote}
                                                    </span>
                                                  )}
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
                                                  disabled={quantity <= 1}
                                                  onClick={() =>
                                                    setQuantity(quantity - 1)
                                                  }
                                                >
                                                  −
                                                </button>
                                                <output
                                                  aria-label={`Quantity of ${displayName}`}
                                                >
                                                  {quantity}
                                                </output>
                                                <button
                                                  type="button"
                                                  aria-label={`Increase quantity of ${displayName}`}
                                                  onClick={() =>
                                                    setQuantity(quantity + 1)
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
                                                      aria-label={`Sell one ${saleName}`}
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
                                                        aria-label={`Sell one ${saleName} for`}
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
                                                                if (
                                                                  packageGroup ===
                                                                  undefined
                                                                )
                                                                  onSell(
                                                                    entry,
                                                                    price,
                                                                    percentage,
                                                                  );
                                                                else
                                                                  onInventoryCommands(
                                                                    packageSaleCommands(
                                                                      packageGroup,
                                                                      percentage,
                                                                    ),
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
                                                    setQuantity(0);
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
              // Shop mode offers only item categories (learning is in Rituals).
              onBrowseChange={(category) =>
                onShopCategoryChange(category as ShopCategory)
              }
            />
          )}
        </div>
        <div
          className={`shared-choice-detail${workspace === "shop" ? " shop-rail" : ""}`}
        >
          <ItemDetail
            byId={byId}
            item={inspected}
            onSetItemSetPartyPieces={(setId, pieces) =>
              onSetText(
                itemSetPartyCountName(setId, build.textStrings),
                pieces === undefined ? "" : String(pieces),
              )
            }
          />
        </div>
      </div>
      {contextMenu === undefined ? null : (
        <ItemContextMenu menu={contextMenu} onClose={closeContextMenu} />
      )}
      {choosing === undefined ? null : (
        <ItemChoiceDialog
          entity={choosing.entity}
          itemName={inventoryDisplayName(choosing.entry, byId)}
          entities={entities}
          characterLevel={build.effectiveLevel}
          initialSelections={itemChoiceSelectionsFrom(
            choosing.entity,
            choosing.entry.elements[choosing.elementIndex]?.children ?? [],
            entities,
            build.effectiveLevel,
          )}
          onSave={(children) =>
            onPutInventory({
              ...choosing.entry,
              elements: choosing.entry.elements.map((element, index) =>
                index === choosing.elementIndex
                  ? { ...element, children }
                  : element,
              ),
            })
          }
          onClose={() => setChoosing(undefined)}
        />
      )}
    </section>
  );
}
