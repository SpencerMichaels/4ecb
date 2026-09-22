import { Fragment, useEffect, useMemo, useRef, useState } from "react";

import {
  CURRENCY_DENOMINATIONS,
  adjustWalletCurrency,
  currencyFromCopper,
  currencyToCopper,
  inventoryEntryWithQuantity,
  parseCurrencyAdjustment,
  type CurrencyAmount,
  type BuildInventoryEntry,
  type CharacterBuild,
} from "@4ecb/character-domain";
import type { ContentEntity } from "@4ecb/content-domain";
import { grantedDetailEntities } from "./builder-ui";
import {
  ComposedArmorCardBody,
  ComposedWeaponCardBody,
  EmbeddedPowerCard,
  EntityCardBody,
  EntityCardHeader,
  entityCardSource,
} from "./EntityCard";
import {
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
  type ShopBrowseId,
  visibleLoadoutSlotColumns,
} from "./equipment-ui";
import { entityVisualTone, visualToneClass } from "./visual-language";
import { Icon } from "./Icon";
import { canonicalItemIcon, isAuthoredShield } from "./item-icons";
import type { ShopCategory } from "./routes";
import { ShopWorkspace } from "./ShopWorkspace";

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

function walletLocationFromCurrency(
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
  readonly kindLabel?: string;
  readonly compatibility?: {
    readonly label: string;
    readonly value: string;
  };
}

export function inventoryItemDetail(
  entry: BuildInventoryEntry,
  byId: ReadonlyMap<string, ContentEntity>,
): InspectedItemDetail | undefined {
  const entities = inventoryDefinitionIds(entry).flatMap((id) => {
    const definition = byId.get(id);
    return definition === undefined ? [] : [definition];
  });
  return entities.length === 0
    ? undefined
    : {
        entities,
        displayName: inventoryDisplayName(entry, byId),
      };
}

export function catalogItemDetail(
  entity: ContentEntity,
  base: ContentEntity | undefined,
  effectiveLevel: number,
  byId: ReadonlyMap<string, ContentEntity>,
): InspectedItemDetail {
  return base === undefined
    ? { entities: [entity], displayName: entity.name }
    : {
        entities: [base, entity],
        displayName: inventoryDisplayName(
          inventoryEntryForEntity(entity, effectiveLevel, base),
          byId,
        ),
      };
}

export function ItemDetail({
  item,
  hideFlavortext,
  byId,
}: {
  readonly item: InspectedItemDetail | undefined;
  readonly hideFlavortext: boolean;
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
  const cardEntity =
    item.displayName === entity.name
      ? entity
      : { ...entity, name: item.displayName };
  const sources = [
    ...new Set(item.entities.map((component) => entityCardSource(component))),
  ];
  const base = item.entities[0];
  const isComposedWeapon =
    item.entities.length > 1 &&
    base?.type.trim().toLocaleLowerCase() === "weapon";
  const isComposedArmor =
    item.entities.length > 1 &&
    base?.type.trim().toLocaleLowerCase() === "armor";
  const isUnifiedComposedItem = isComposedWeapon || isComposedArmor;
  const composedGrantedPowers = item.entities.flatMap((component) =>
    grantedDetailEntities(component, references).filter(
      (granted) => granted.type.trim().toLocaleLowerCase() === "power",
    ),
  );
  const grantedPowerCards = composedGrantedPowers.map((power) => (
    <EmbeddedPowerCard
      entity={power}
      hideFlavortext={hideFlavortext}
      key={power.id}
    />
  ));
  const componentBody = (component: ContentEntity) => {
    const displayComponent =
      item.entities.length > 1 &&
      base !== undefined &&
      isAuthoredShield(base) &&
      component.id === entity.id
        ? {
            ...component,
            specifics: component.specifics.map((field) =>
              field.name.trim().toLocaleLowerCase() === "item slot"
                ? { ...field, value: "Off hand" }
                : field,
            ),
          }
        : component;
    const grantedPowers = grantedDetailEntities(component, references).filter(
      (granted) => granted.type.trim().toLocaleLowerCase() === "power",
    );
    return (
      <EntityCardBody
        entity={displayComponent}
        hideFlavortext={hideFlavortext}
        showSource={false}
        afterFields={grantedPowers.map((power) => (
          <EmbeddedPowerCard
            entity={power}
            hideFlavortext={hideFlavortext}
            key={power.id}
          />
        ))}
      />
    );
  };
  return (
    <aside
      className={`candidate-detail ${visualToneClass(entityVisualTone(entity))}${isUnifiedComposedItem ? " composed-item-card" : ""}${isComposedWeapon ? " composed-weapon-card" : ""}${isComposedArmor ? " composed-armor-card" : ""}`}
      tabIndex={0}
    >
      <header className="primary-detail-heading">
        <EntityCardHeader
          entity={cardEntity}
          {...(item.kindLabel === undefined
            ? {}
            : { kindLabel: item.kindLabel })}
          physicalBase={item.entities.length > 1 ? base : undefined}
          subheading={
            item.compatibility === undefined ? undefined : (
              <dl className="shop-detail-compatibility">
                <dt>{item.compatibility.label}</dt>
                <dd>{item.compatibility.value}</dd>
              </dl>
            )
          }
        />
      </header>
      {isComposedWeapon && base !== undefined ? (
        <ComposedWeaponCardBody
          afterFields={grantedPowerCards}
          base={base}
          enchantment={entity}
          hideFlavortext={hideFlavortext}
        />
      ) : isComposedArmor && base !== undefined ? (
        <ComposedArmorCardBody
          afterFields={grantedPowerCards}
          base={base}
          enchantment={entity}
          hideFlavortext={hideFlavortext}
        />
      ) : item.entities.length > 1 ? (
        <div className="composed-item-details">
          {item.entities.map((component) => (
            <section className="composed-item-component" key={component.id}>
              <h5>{component.name}</h5>
              {componentBody(component)}
            </section>
          ))}
        </div>
      ) : (
        componentBody(entity)
      )}
      <p className="detail-source-note">
        {sources.length === 1 ? "Source" : "Sources"}: {sources.join("; ")}
      </p>
    </aside>
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
  onClose,
  onSetMoney,
}: {
  readonly open: boolean;
  readonly wallet: EquipmentWalletView;
  readonly onClose: () => void;
  readonly onSetMoney: (
    location: MoneyLocation,
    denomination: Denomination,
    value: number,
  ) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const adjustmentInput = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(wallet);
  const [adjustment, setAdjustment] = useState("");
  const [adjustmentMessage, setAdjustmentMessage] = useState<{
    readonly kind: "error" | "success";
    readonly text: string;
    readonly generation: number;
  }>();
  const [adjustmentPulse, setAdjustmentPulse] = useState<{
    readonly generation: number;
    readonly denominations: readonly (keyof CurrencyAmount)[];
  }>({ generation: 0, denominations: [] });
  useEffect(() => {
    const element = dialog.current;
    if (element === null) return;
    if (open && !element.open) {
      setDraft(wallet);
      setAdjustment("");
      setAdjustmentMessage(undefined);
      setAdjustmentPulse({ generation: 0, denominations: [] });
      element.showModal();
    } else if (!open && element.open) {
      element.close();
    }
  }, [open, wallet]);
  const total = currencyFromCopper(
    walletCopper(draft.carried) + walletCopper(draft.stored),
  );
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
  const adjustDraft = () => {
    try {
      const next = adjustWalletCurrency(
        currencyFromCopper(walletCopper(draft.carried)),
        currencyFromCopper(walletCopper(draft.stored)),
        parseCurrencyAdjustment(adjustment),
      );
      const nextTotal = currencyFromCopper(
        currencyToCopper(next.carried) + currencyToCopper(next.stored),
      );
      setDraft({
        carried: walletLocationFromCurrency(next.carried),
        stored: walletLocationFromCurrency(next.stored),
      });
      setAdjustmentPulse((current) => ({
        generation: current.generation + 1,
        denominations: CURRENCY_DENOMINATIONS.filter(
          (denomination) => nextTotal[denomination] !== total[denomination],
        ),
      }));
      setAdjustment("");
      setAdjustmentMessage((current) => ({
        kind: "success",
        text: "Funds adjusted in the editor.",
        generation: (current?.generation ?? 0) + 1,
      }));
    } catch (reason: unknown) {
      showAdjustmentError(
        reason instanceof Error
          ? reason.message
          : "Enter a valid currency adjustment",
      );
    }
  };
  return (
    <dialog
      id="wallet-dialog"
      className="wallet-dialog"
      ref={dialog}
      aria-labelledby="wallet-dialog-title"
      onClose={onClose}
    >
      <form
        method="dialog"
        onSubmit={(event) => {
          event.preventDefault();
          for (const location of ["carried", "stored"] as const)
            for (const { id } of DENOMINATIONS)
              onSetMoney(location, id, draft[location][id]);
          dialog.current?.close();
        }}
      >
        <header>
          <div>
            <p className="eyebrow">Funds</p>
            <h2 id="wallet-dialog-title">Edit funds</h2>
          </div>
          <button
            type="button"
            aria-label="Close funds editor"
            onClick={() => dialog.current?.close()}
          >
            ×
          </button>
        </header>
        <div className="wallet-dialog-body">
          <p>
            Update the character’s carried and stored currency. Equipment and
            Shop use their combined total.
          </p>
          <div className="wallet-quick-adjust">
            <label htmlFor="wallet-dialog-adjustment">
              Quick adjust
              <input
                id="wallet-dialog-adjustment"
                ref={adjustmentInput}
                type="text"
                inputMode="text"
                className={
                  adjustmentMessage?.kind === "error" ? "is-error" : undefined
                }
                placeholder="20pp, -15 gp, ..."
                value={adjustment}
                aria-describedby="wallet-dialog-adjustment-message"
                aria-invalid={adjustmentMessage?.kind === "error" || undefined}
                onChange={(event) => {
                  setAdjustment(event.currentTarget.value);
                  setAdjustmentMessage(undefined);
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  adjustDraft();
                }}
              />
            </label>
            <button type="button" onClick={adjustDraft}>
              Adjust
            </button>
            <span
              key={`wallet-dialog-adjustment-${adjustmentMessage?.generation ?? 0}`}
              className="visually-hidden"
              id="wallet-dialog-adjustment-message"
              role={adjustmentMessage?.kind === "error" ? "alert" : "status"}
            >
              {adjustmentMessage?.text ?? ""}
            </span>
          </div>
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
                    <td
                      key={`${id}-${adjustmentPulse.generation}`}
                      className={
                        adjustmentPulse.denominations.includes(
                          DENOMINATION_KEYS[id],
                        )
                          ? "is-adjusted"
                          : undefined
                      }
                    >
                      {total[DENOMINATION_KEYS[id]]}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          <p className="field-help">
            Purchases use carried funds first, then stored funds. Sales add
            proceeds to carried funds.
          </p>
        </div>
        <footer>
          <button type="button" onClick={() => dialog.current?.close()}>
            Cancel
          </button>
          <button className="dialog-primary" type="submit">
            Apply
          </button>
        </footer>
      </form>
    </dialog>
  );
}

export function EquipmentWorkspace({
  build,
  entities,
  byId,
  wallet,
  activeDefinitionIds,
  hideFlavortext,
  workspace,
  loadoutView,
  shopCategory,
  onLoadoutViewChange,
  onShopCategoryChange,
  onPutInventory,
  onPurchase,
  onSell,
  onEquipSlot,
  onSetMoney,
  onAdjustMoney,
}: {
  readonly build: CharacterBuild;
  readonly entities: readonly ContentEntity[];
  readonly byId: ReadonlyMap<string, ContentEntity>;
  readonly packId?: string;
  readonly wallet: EquipmentWalletView;
  readonly activeDefinitionIds: readonly string[];
  readonly hideFlavortext: boolean;
  readonly workspace: "equipment" | "shop";
  readonly loadoutView: boolean;
  readonly shopCategory: ShopCategory;
  readonly onLoadoutViewChange: (loadout: boolean) => void;
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
  readonly onSetMoney: (
    location: MoneyLocation,
    denomination: Denomination,
    value: number,
  ) => void;
  readonly onAdjustMoney: (deltaCopper: number) => string | undefined;
}) {
  const [inspected, setInspected] = useState<InspectedItemDetail>();
  const [walletOpen, setWalletOpen] = useState(false);
  const [walletAdjustment, setWalletAdjustment] = useState("");
  const [walletAdjustmentMessage, setWalletAdjustmentMessage] = useState<{
    readonly kind: "error" | "success";
    readonly text: string;
    readonly generation: number;
  }>();
  const [walletPulse, setWalletPulse] = useState<{
    readonly generation: number;
    readonly denominations: readonly (keyof CurrencyAmount)[];
  }>({ generation: 0, denominations: [] });
  const [openSaleId, setOpenSaleId] = useState<string>();
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
  const walletAdjustmentInput = useRef<HTMLInputElement>(null);
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
  const totalWallet = currencyFromCopper(carriedCopper + storedCopper);

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

  const showWalletAdjustmentError = (text: string) => {
    setWalletAdjustmentMessage((current) => ({
      kind: "error",
      text,
      generation: (current?.generation ?? 0) + 1,
    }));
    const input = walletAdjustmentInput.current;
    if (input !== null) {
      input.classList.remove("is-error");
      void input.offsetWidth;
      input.classList.add("is-error");
      input.focus();
    }
  };

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
                <button
                  className="equipment-view-toggle"
                  type="button"
                  onClick={() => onLoadoutViewChange(!loadoutView)}
                >
                  <Icon name={loadoutView ? "handbag" : "sword"} />
                  {loadoutView ? "Inventory" : "Loadout"}
                </button>
                <section className="inventory-wallet" aria-label="Funds">
                  <div className="inventory-wallet-summary">
                    <Icon name="circle-dollar-sign" />
                    <div className="inventory-wallet-balance">
                      <span className="inventory-wallet-label">Funds</span>
                      <dl className="inventory-wallet-denominations">
                        {CURRENCY_DENOMINATIONS.map((denomination) => (
                          <div
                            key={`${denomination}-${walletPulse.denominations.includes(denomination) ? walletPulse.generation : 0}`}
                            className={
                              walletPulse.denominations.includes(denomination)
                                ? "is-adjusted"
                                : undefined
                            }
                          >
                            <dt>{denomination.toLocaleUpperCase()}</dt>
                            <dd>{totalWallet[denomination]}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                    <form
                      className="inventory-wallet-adjust"
                      onSubmit={(event) => {
                        event.preventDefault();
                        let deltaCopper: number;
                        try {
                          deltaCopper =
                            parseCurrencyAdjustment(walletAdjustment);
                        } catch (reason: unknown) {
                          showWalletAdjustmentError(
                            reason instanceof Error
                              ? reason.message
                              : "Enter a valid currency adjustment",
                          );
                          return;
                        }
                        const error = onAdjustMoney(deltaCopper);
                        if (error !== undefined) {
                          showWalletAdjustmentError(error);
                          return;
                        }
                        const adjustedCopper =
                          carriedCopper + storedCopper + deltaCopper;
                        const adjustedTotal =
                          Number.isSafeInteger(adjustedCopper) &&
                          adjustedCopper >= 0
                            ? currencyFromCopper(adjustedCopper)
                            : totalWallet;
                        setWalletPulse((current) => ({
                          generation: current.generation + 1,
                          denominations: CURRENCY_DENOMINATIONS.filter(
                            (denomination) =>
                              adjustedTotal[denomination] !==
                              totalWallet[denomination],
                          ),
                        }));
                        setWalletAdjustment("");
                        setWalletAdjustmentMessage((current) => ({
                          kind: "success",
                          text: "Funds adjusted.",
                          generation: (current?.generation ?? 0) + 1,
                        }));
                      }}
                    >
                      <label
                        className="visually-hidden"
                        htmlFor="inventory-wallet-adjustment"
                      >
                        Quick adjust funds
                      </label>
                      <input
                        id="inventory-wallet-adjustment"
                        ref={walletAdjustmentInput}
                        type="text"
                        inputMode="text"
                        className={
                          walletAdjustmentMessage?.kind === "error"
                            ? "is-error"
                            : undefined
                        }
                        placeholder="20pp, -15 gp, ..."
                        value={walletAdjustment}
                        aria-describedby="inventory-wallet-adjustment-message"
                        aria-invalid={
                          walletAdjustmentMessage?.kind === "error" || undefined
                        }
                        onChange={(event) => {
                          setWalletAdjustment(event.currentTarget.value);
                          setWalletAdjustmentMessage(undefined);
                        }}
                      />
                    </form>
                    <button
                      type="button"
                      className="inventory-wallet-edit"
                      aria-expanded={walletOpen}
                      aria-controls="wallet-dialog"
                      onClick={() => setWalletOpen(true)}
                    >
                      <Icon name="edit" />
                      Edit
                    </button>
                  </div>
                  <p
                    key={`wallet-adjustment-${walletAdjustmentMessage?.generation ?? 0}`}
                    className="visually-hidden"
                    id="inventory-wallet-adjustment-message"
                    role={
                      walletAdjustmentMessage?.kind === "error"
                        ? "alert"
                        : "status"
                    }
                  >
                    {walletAdjustmentMessage?.text ?? ""}
                  </p>
                </section>
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
                                  <tr className="inventory-category-row">
                                    <th colSpan={3} scope="rowgroup">
                                      <button
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
                                                ? "Double-click to equip; the occupied compatible slot will be replaced after confirmation."
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
                                        const reductionUnequips =
                                          entry.quantity <=
                                          entry.equippedQuantity;
                                        const confirmReduction = (
                                          action: string,
                                        ) =>
                                          !reductionUnequips ||
                                          window.confirm(
                                            `${displayName} has no unequipped copies. ${action} will also unequip one copy. Continue?`,
                                          );
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
                                                loadoutToggle.kind ===
                                                  "equip" &&
                                                loadoutToggle.displaces &&
                                                !window.confirm(
                                                  `Equip ${displayName}? This will replace an item in the first compatible occupied Loadout slot.`,
                                                )
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
                                                  className={`inventory-item-icon${equippedStatus === undefined ? "" : " is-equipped"}`}
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
                                                    if (
                                                      !confirmReduction(
                                                        "Reducing the quantity",
                                                      )
                                                    )
                                                      return;
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
                                                    className="inventory-icon-action"
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
                                                      className="inventory-icon-action"
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
                                                                if (
                                                                  !confirmReduction(
                                                                    "Selling it",
                                                                  )
                                                                )
                                                                  return;
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
                                                  className="inventory-icon-action inventory-remove-action"
                                                  aria-label={`Remove ${displayName}`}
                                                  title="Remove without proceeds"
                                                  onClick={() => {
                                                    const equippedWarning =
                                                      entry.equippedQuantity > 0
                                                        ? " This will also unequip it."
                                                        : "";
                                                    if (
                                                      !window.confirm(
                                                        `Remove all ${entry.quantity} copies of ${displayName} without receiving proceeds?${equippedWarning}`,
                                                      )
                                                    )
                                                      return;
                                                    onPutInventory(
                                                      inventoryEntryWithQuantity(
                                                        entry,
                                                        0,
                                                      ),
                                                    );
                                                  }}
                                                >
                                                  <Icon name="trash" />
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
              browse={
                shopCategory === "items"
                  ? "all"
                  : shopCategory === "scrolls"
                    ? "consumables"
                    : (shopCategory as ShopBrowseId)
              }
              characterLevel={build.effectiveLevel}
              entities={entities}
              inventory={inventory}
              ownedDefinitions={ownedDefinitions}
              walletCopper={carriedCopper + storedCopper}
              onInspect={(entity, displayName, kindLabel, compatibility) =>
                setInspected({
                  entities: [entity],
                  displayName,
                  ...(kindLabel === undefined ? {} : { kindLabel }),
                  ...(compatibility === undefined ? {} : { compatibility }),
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
            <section className="inventory-wallet shop-funds" aria-label="Funds">
              <div className="inventory-wallet-summary">
                <Icon name="circle-dollar-sign" />
                <div className="inventory-wallet-balance">
                  <span className="inventory-wallet-label">Funds</span>
                  <dl className="inventory-wallet-denominations">
                    {CURRENCY_DENOMINATIONS.map((denomination) => (
                      <div key={denomination}>
                        <dt>{denomination.toLocaleUpperCase()}</dt>
                        <dd>{totalWallet[denomination]}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
                <button
                  type="button"
                  className="inventory-wallet-edit"
                  aria-expanded={walletOpen}
                  aria-controls="wallet-dialog"
                  onClick={() => setWalletOpen(true)}
                >
                  <Icon name="edit" /> Edit
                </button>
              </div>
            </section>
          ) : null}
          <ItemDetail
            byId={byId}
            item={inspected}
            hideFlavortext={hideFlavortext}
          />
        </div>
      </div>
      <WalletDialog
        open={walletOpen}
        wallet={wallet}
        onClose={() => setWalletOpen(false)}
        onSetMoney={onSetMoney}
      />
    </section>
  );
}
