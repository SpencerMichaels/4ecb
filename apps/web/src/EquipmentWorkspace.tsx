import { Fragment, useEffect, useMemo, useRef, useState } from "react";

import {
  CURRENCY_DENOMINATIONS,
  currencyFromCopper,
  currencyFromCopperKeepingLargeCoins,
  currencyToCopper,
  inventoryEntryWithQuantity,
  parseCurrencyAdjustment,
  type CurrencyAmount,
  type BuildInventoryEntry,
  type CharacterBuild,
} from "@4ecb/character-domain";
import type { ContentEntity } from "@4ecb/content-domain";
import { grantedDetailEntities } from "./builder-ui";
import { entityCardSource } from "./EntityCard";
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
  abbreviation: string;
}[] = [
  { id: "copper", label: "Copper", abbreviation: "CP" },
  { id: "silver", label: "Silver", abbreviation: "SP" },
  { id: "gold", label: "Gold", abbreviation: "GP" },
  { id: "platinum", label: "Platinum", abbreviation: "PP" },
  { id: "astral", label: "Astral diamond", abbreviation: "AD" },
];

const DENOMINATION_KEYS: Readonly<Record<Denomination, keyof CurrencyAmount>> =
  {
    copper: "cp",
    silver: "sp",
    gold: "gp",
    platinum: "pp",
    astral: "ad",
  };

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

export function walletDisplayCurrency(
  wallet: EquipmentWalletView,
  keepLargeAmountsInGold: boolean,
): CurrencyAmount {
  const totalCopper =
    walletCopper(wallet.carried) + walletCopper(wallet.stored);
  return keepLargeAmountsInGold
    ? currencyFromCopperKeepingLargeCoins(
        totalCopper,
        combinedWalletCurrency(wallet),
      )
    : currencyFromCopper(totalCopper);
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
  const sources = [
    ...new Set(item.entities.map((component) => entityCardSource(component))),
  ];
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
        <p className="detail-source-note">
          {sources.length === 1 ? "Source" : "Sources"}: {sources.join("; ")}
        </p>
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
          <p className="detail-source-note">
            Source: {entityCardSource(formulaItem)}
          </p>
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

function WalletDialog({
  open,
  wallet,
  keepLargeAmountsInGold,
  onClose,
  onSetWallet,
}: {
  readonly open: boolean;
  readonly wallet: EquipmentWalletView;
  readonly keepLargeAmountsInGold: boolean;
  readonly onClose: () => void;
  readonly onSetWallet: (wallet: EquipmentWalletView) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState(wallet);
  useEffect(() => {
    const element = dialog.current;
    if (element === null) return;
    if (open && !element.open) {
      setDraft(wallet);
      element.showModal();
    } else if (!open && element.open) {
      element.close();
    }
  }, [open, wallet]);
  const total = walletDisplayCurrency(draft, keepLargeAmountsInGold);
  return (
    <dialog
      id="wallet-dialog"
      className="wallet-dialog dialog-shell"
      ref={dialog}
      aria-labelledby="wallet-dialog-title"
      onClose={onClose}
    >
      <form
        method="dialog"
        onSubmit={(event) => {
          event.preventDefault();
          onSetWallet(draft);
          dialog.current?.close();
        }}
      >
        <header>
          <h2 id="wallet-dialog-title">Edit funds</h2>
          <button
            className="button-icon dialog-close"
            type="button"
            aria-label="Close funds editor"
            onClick={() => dialog.current?.close()}
          >
            ×
          </button>
        </header>
        <div className="wallet-dialog-body">
          <div className="inventory-wallet-editor">
            <table>
              <thead>
                <tr>
                  <th scope="col">Location</th>
                  {DENOMINATIONS.map(({ id, label, abbreviation }) => (
                    <th scope="col" key={id}>
                      <abbr title={label}>{abbreviation}</abbr>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(["carried", "stored"] as const).map((location) => (
                  <tr
                    key={location}
                    className={
                      location === "stored"
                        ? "inventory-wallet-stored"
                        : undefined
                    }
                  >
                    <th scope="row">
                      {location === "carried" ? "Carried" : "Stored"}
                    </th>
                    {DENOMINATIONS.map(({ id, label }) => (
                      <td key={id}>
                        <label
                          className="visually-hidden"
                          htmlFor={`wallet-dialog-${location}-${id}`}
                        >
                          {location} {label}
                        </label>
                        <input
                          id={`wallet-dialog-${location}-${id}`}
                          type="number"
                          min={0}
                          step={1}
                          value={draft[location][id]}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              [location]: {
                                ...current[location],
                                [id]: Math.max(
                                  0,
                                  Number(event.currentTarget.value),
                                ),
                              },
                            }))
                          }
                        />
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="inventory-wallet-total">
                  <th scope="row">Total</th>
                  {DENOMINATIONS.map(({ id }) => (
                    <td key={id}>{total[DENOMINATION_KEYS[id]]}</td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <footer>
          <button type="button" onClick={() => dialog.current?.close()}>
            Cancel
          </button>
          <button className="dialog-primary button-primary" type="submit">
            Apply
          </button>
        </footer>
      </form>
    </dialog>
  );
}

function FundsPane({
  wallet,
  keepLargeAmountsInGold,
  editOpen,
  sticky = false,
  onEdit,
  onAdjustMoney,
}: {
  readonly wallet: EquipmentWalletView;
  readonly keepLargeAmountsInGold: boolean;
  readonly editOpen: boolean;
  readonly sticky?: boolean;
  readonly onEdit: () => void;
  readonly onAdjustMoney: (deltaCopper: number) => string | undefined;
}) {
  const [adjustOpen, setAdjustOpen] = useState(false);
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
  const adjustTrigger = useRef<HTMLButtonElement>(null);
  const totalWalletCopper =
    walletCopper(wallet.carried) + walletCopper(wallet.stored);
  const totalWallet = useMemo(
    () => walletDisplayCurrency(wallet, keepLargeAmountsInGold),
    [keepLargeAmountsInGold, wallet],
  );
  const previousWalletCopper = useRef(totalWalletCopper);
  const previousWallet = useRef(wallet);

  useEffect(() => {
    const previousCopper = previousWalletCopper.current;
    previousWalletCopper.current = totalWalletCopper;
    if (previousCopper === totalWalletCopper) return;
    const previousTotal = walletDisplayCurrency(
      previousWallet.current,
      keepLargeAmountsInGold,
    );
    previousWallet.current = wallet;
    setWalletPulse((current) => ({
      generation: current.generation + 1,
      denominations: CURRENCY_DENOMINATIONS.filter(
        (denomination) =>
          totalWallet[denomination] !== previousTotal[denomination],
      ),
      direction: totalWalletCopper < previousCopper ? "decrease" : "increase",
    }));
  }, [keepLargeAmountsInGold, totalWallet, totalWalletCopper, wallet]);

  useEffect(() => {
    if (!adjustOpen) return;
    const focusFrame = requestAnimationFrame(() => {
      adjustmentInput.current?.focus();
      adjustmentInput.current?.select();
    });
    const dismissOutside = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest("[data-wallet-adjust]") !== null
      )
        return;
      setAdjustOpen(false);
      setAdjustmentMessage(undefined);
    };
    const dismissWithEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setAdjustOpen(false);
      setAdjustmentMessage(undefined);
      requestAnimationFrame(() => adjustTrigger.current?.focus());
    };
    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("keydown", dismissWithEscape);
    return () => {
      cancelAnimationFrame(focusFrame);
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("keydown", dismissWithEscape);
    };
  }, [adjustOpen]);

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
    let deltaCopper: number;
    try {
      deltaCopper = parseCurrencyAdjustment(adjustment);
    } catch (reason: unknown) {
      showAdjustmentError(
        reason instanceof Error
          ? reason.message
          : "Enter a valid currency adjustment",
      );
      return;
    }
    const error = onAdjustMoney(deltaCopper);
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
    setAdjustOpen(false);
    requestAnimationFrame(() => adjustTrigger.current?.focus());
  };

  return (
    <section
      className={`inventory-wallet funds-pane${sticky ? " shop-funds" : ""}`}
      aria-label="Funds"
    >
      <div className="inventory-wallet-summary">
        <Icon name="circle-dollar-sign" />
        <div className="inventory-wallet-balance">
          <dl className="inventory-wallet-denominations">
            {CURRENCY_DENOMINATIONS.map((denomination) => (
              <div
                key={`${denomination}-${walletPulse.denominations.includes(denomination) ? walletPulse.generation : 0}`}
                className={
                  walletPulse.denominations.includes(denomination)
                    ? `is-adjusted is-${walletPulse.direction}`
                    : undefined
                }
              >
                <dt>{denomination.toLocaleUpperCase()}</dt>
                <dd>{totalWallet[denomination]}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="funds-pane-actions">
          <div className="funds-wallet-adjust-menu" data-wallet-adjust="">
            <button
              ref={adjustTrigger}
              type="button"
              className="inventory-wallet-edit button-icon"
              aria-label="Quick adjust funds"
              title="Quick adjust funds"
              aria-expanded={adjustOpen}
              aria-controls="funds-wallet-adjust-options"
              onClick={() => {
                setAdjustOpen((current) => !current);
                setAdjustmentMessage(undefined);
              }}
            >
              <Icon name="calculator" />
            </button>
            {adjustOpen ? (
              <form
                id="funds-wallet-adjust-options"
                className="inventory-sale-options funds-wallet-adjust-options"
                onSubmit={(event) => {
                  event.preventDefault();
                  applyAdjustment();
                }}
              >
                <label
                  className="visually-hidden"
                  htmlFor="funds-wallet-adjustment"
                >
                  Adjust funds
                </label>
                <input
                  id="funds-wallet-adjustment"
                  ref={adjustmentInput}
                  type="text"
                  inputMode="text"
                  className={
                    adjustmentMessage?.kind === "error" ? "is-error" : undefined
                  }
                  placeholder="20pp, -15 gp, ..."
                  value={adjustment}
                  aria-describedby="funds-wallet-adjustment-message"
                  aria-invalid={
                    adjustmentMessage?.kind === "error" || undefined
                  }
                  onChange={(event) => {
                    setAdjustment(event.currentTarget.value);
                    setAdjustmentMessage(undefined);
                  }}
                />
                <span
                  key={`funds-wallet-adjustment-${adjustmentMessage?.generation ?? 0}`}
                  className="visually-hidden"
                  id="funds-wallet-adjustment-message"
                  role={
                    adjustmentMessage?.kind === "error" ? "alert" : "status"
                  }
                >
                  {adjustmentMessage?.text ?? ""}
                </span>
              </form>
            ) : null}
          </div>
          <button
            type="button"
            className="inventory-wallet-edit button-icon"
            aria-label="Edit funds"
            title="Edit funds"
            aria-expanded={editOpen}
            aria-controls="wallet-dialog"
            onClick={onEdit}
          >
            <Icon name="edit" />
          </button>
        </div>
      </div>
    </section>
  );
}

export function EquipmentWorkspace({
  build,
  entities,
  byId,
  wallet,
  activeDefinitionIds,
  keepLargeAmountsInGold,
  workspace,
  loadoutView,
  shopCategory,
  onShopCategoryChange,
  onPutInventory,
  onPurchase,
  onSell,
  onEquipSlot,
  onSetWallet,
  onAdjustMoney,
}: {
  readonly build: CharacterBuild;
  readonly entities: readonly ContentEntity[];
  readonly byId: ReadonlyMap<string, ContentEntity>;
  readonly wallet: EquipmentWalletView;
  readonly activeDefinitionIds: readonly string[];
  readonly keepLargeAmountsInGold: boolean;
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
  readonly onSetWallet: (wallet: EquipmentWalletView) => void;
  readonly onAdjustMoney: (deltaCopper: number) => string | undefined;
}) {
  const [inspected, setInspected] = useState<InspectedItemDetail>();
  const [walletOpen, setWalletOpen] = useState(false);
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
              <div className="equipment-summary-row">
                <FundsPane
                  wallet={wallet}
                  keepLargeAmountsInGold={keepLargeAmountsInGold}
                  editOpen={walletOpen}
                  onEdit={() => setWalletOpen(true)}
                  onAdjustMoney={onAdjustMoney}
                />
              </div>
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
          {workspace === "shop" ? (
            <FundsPane
              wallet={wallet}
              keepLargeAmountsInGold={keepLargeAmountsInGold}
              editOpen={walletOpen}
              sticky
              onEdit={() => setWalletOpen(true)}
              onAdjustMoney={onAdjustMoney}
            />
          ) : null}
          <ItemDetail byId={byId} item={inspected} />
        </div>
      </div>
      <WalletDialog
        open={walletOpen}
        wallet={wallet}
        keepLargeAmountsInGold={keepLargeAmountsInGold}
        onClose={() => setWalletOpen(false)}
        onSetWallet={onSetWallet}
      />
    </section>
  );
}
