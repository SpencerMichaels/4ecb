import { Fragment, useEffect, useMemo, useRef, useState } from "react";

import type { BuildInventoryEntry } from "@4ecb/character-domain";
import type { ContentEntity } from "@4ecb/content-domain";

import { contentSpecificValue } from "./builder-ui";
import {
  compatibleBaseItems,
  entityCurrencyCopper,
  formatCopperPrice,
  groupMagicItemFamilies,
  inventoryDefinitionIds,
  inventoryEntryForEntity,
  itemCanBeBought,
  itemProficiencyStatus,
  practiceKind,
  recommendedMagicItemVariant,
  SHOP_BROWSE_CATEGORIES,
  shopBrowseCategory,
  shopDisplayName,
  shopItemLevel,
  shopSlot,
  shopSubtype,
  type MagicItemFamily,
  type ShopBrowseId,
} from "./equipment-ui";
import { Icon } from "./Icon";
import { canonicalItemIcon } from "./item-icons";

type SortColumn = "name" | "level" | "price" | "owned";
type SortDirection = "ascending" | "descending";
type AcquireMode = "buy" | "give";

interface AcquisitionRequest {
  readonly entity: ContentEntity;
  readonly mode: AcquireMode;
}

export function retainedShopFilter(
  current: string,
  available: readonly string[],
  disabled: boolean,
): string {
  return disabled || (current !== "" && !available.includes(current))
    ? ""
    : current;
}

export function compatibleChoiceType(
  entity: ContentEntity,
  implementChoice: boolean,
): string {
  if (implementChoice) return "Superior";
  return shopSubtype(entity) ?? entity.type;
}

export function shopKnownFilterMatches(
  learning: boolean,
  knownOnly: boolean,
  isKnown: boolean,
): boolean {
  return !learning || !knownOnly || isKnown;
}

interface ShopWorkspaceProps {
  readonly browse: ShopBrowseId;
  readonly characterLevel: number;
  readonly entities: readonly ContentEntity[];
  readonly inventory: readonly BuildInventoryEntry[];
  readonly ownedDefinitions: readonly ContentEntity[];
  readonly walletCopper: number;
  readonly onInspect: (
    entity: ContentEntity,
    displayName: string,
    kindLabel?: string,
    compatibility?: { readonly label: string; readonly value: string },
  ) => void;
  readonly onAcquire: (entry: BuildInventoryEntry, priceCopper: number) => void;
  readonly onBrowseChange: (browse: ShopBrowseId) => void;
}

const PAGE_SIZE = 200;
const LEARNING_CATEGORIES = new Set<ShopBrowseId>([
  "rituals",
  "alchemical-formulas",
  "martial-practices",
]);

function normalized(value: string | undefined): string {
  return value?.trim().toLocaleLowerCase() ?? "";
}

function legacyCategory(entity: ContentEntity): string {
  if (entity.type === "Ritual Scroll") return "Scrolls";
  if (entity.type === "Superior Implement") return "Superior Implements";
  if (entity.type === "Weapon") return "Weapons";
  if (entity.type === "Armor") return "Armor";
  const magicType = contentSpecificValue(entity, "Magic Item Type")?.trim();
  if (magicType === "Weapon") return "Magic Weapons";
  if (magicType === "Armor") return "Magic Armor";
  return magicType || entity.type;
}

function itemSource(entity: ContentEntity): string {
  return entity.source.trim();
}

function itemRarity(entity: ContentEntity): string {
  return contentSpecificValue(entity, "Rarity")?.trim() ?? "";
}

function itemTier(entity: ContentEntity): string {
  const level = shopItemLevel(entity);
  return level >= 21 ? "Epic" : level >= 11 ? "Paragon" : "Heroic";
}

function implementKind(entity: ContentEntity): string | undefined {
  if (shopBrowseCategory(entity) !== "implement-enchantments") return undefined;
  const authored =
    contentSpecificValue(entity, "Implement Type") ??
    contentSpecificValue(entity, "Group") ??
    contentSpecificValue(entity, "Magic Item Type");
  const kinds = (authored ?? "")
    .split(/\s*[,;]\s*/u)
    .map((value) => value.trim())
    .filter((value) => value !== "" && normalized(value) !== "implement");
  return kinds.length === 1 ? kinds[0] : undefined;
}

function physicalNouns(entity: ContentEntity): {
  readonly singular: string;
  readonly plural: string;
} {
  const category = shopBrowseCategory(entity);
  if (category === "weapon-enchantments")
    return { singular: "weapon", plural: "weapons" };
  if (normalized(contentSpecificValue(entity, "_IsEnchant")) === "shield")
    return { singular: "shield", plural: "shields" };
  if (category === "armor-enchantments")
    return { singular: "armor", plural: "armor" };
  const kind = implementKind(entity)?.toLocaleLowerCase();
  if (kind === "holy symbol")
    return { singular: "holy symbol", plural: "holy symbols" };
  if (kind !== undefined)
    return { singular: kind, plural: kind === "staff" ? "staffs" : `${kind}s` };
  return { singular: "implement", plural: "implements" };
}

function isImplementEnchantment(entity: ContentEntity): boolean {
  return shopBrowseCategory(entity) === "implement-enchantments";
}

function familyLevelLabel(
  family: MagicItemFamily,
  selected: ContentEntity,
): string {
  const level = contentSpecificValue(selected, "Level") ?? "—";
  return family.entities.some(
    (entity) => shopItemLevel(entity) > shopItemLevel(selected),
  )
    ? `${level}+`
    : level;
}

function ownedCount(
  entity: ContentEntity,
  inventory: readonly BuildInventoryEntry[],
): number {
  const id = entity.id.toLocaleLowerCase();
  return inventory.reduce(
    (count, entry) =>
      count + (inventoryDefinitionIds(entry).includes(id) ? entry.quantity : 0),
    0,
  );
}

export function ShopWorkspace({
  browse,
  characterLevel,
  entities,
  inventory,
  ownedDefinitions,
  walletCopper,
  onInspect,
  onAcquire,
  onBrowseChange,
}: ShopWorkspaceProps) {
  const [search, setSearch] = useState("");
  const [slot, setSlot] = useState("");
  const [subtype, setSubtype] = useState("");
  const [affordable, setAffordable] = useState(true);
  const [proficient, setProficient] = useState(true);
  const [knownOnly, setKnownOnly] = useState(false);
  const [inspectedEntityId, setInspectedEntityId] = useState<string>();
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [legacy, setLegacy] = useState("");
  const [source, setSource] = useState("");
  const [rarity, setRarity] = useState("");
  const [tier, setTier] = useState("");
  const [sort, setSort] = useState<{
    readonly column: SortColumn;
    readonly direction: SortDirection;
  }>({ column: "name", direction: "ascending" });
  const [offset, setOffset] = useState(0);
  const [expandedFamilies, setExpandedFamilies] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [collapsedCategories, setCollapsedCategories] = useState<
    ReadonlySet<ShopBrowseId>
  >(() => new Set());
  const [preferredVariants, setPreferredVariants] = useState<
    ReadonlyMap<string, string>
  >(() => new Map());
  const [acquisition, setAcquisition] = useState<AcquisitionRequest>();
  const [physicalSearch, setPhysicalSearch] = useState("");
  const [physicalSubtype, setPhysicalSubtype] = useState("");
  const [selectedPhysicalId, setSelectedPhysicalId] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);

  const catalog = useMemo(
    () => entities.filter((entity) => shopBrowseCategory(entity) !== undefined),
    [entities],
  );
  const learning = LEARNING_CATEGORIES.has(browse);
  const known = (entity: ContentEntity) => {
    const kind = practiceKind(entity);
    return (
      kind !== undefined &&
      kind !== "scroll" &&
      ownedCount(entity, inventory) > 0
    );
  };
  const categoryRecords = useMemo(
    () =>
      catalog.filter(
        (entity) => browse === "all" || shopBrowseCategory(entity) === browse,
      ),
    [browse, catalog],
  );
  const advancedRecords = useMemo(
    () =>
      categoryRecords.filter(
        (entity) =>
          (legacy === "" || legacyCategory(entity) === legacy) &&
          (source === "" || itemSource(entity) === source) &&
          (rarity === "" || itemRarity(entity) === rarity) &&
          (tier === "" || itemTier(entity) === tier),
      ),
    [categoryRecords, legacy, rarity, source, tier],
  );
  const searchRecords = useMemo(() => {
    const needle = normalized(search);
    return advancedRecords.filter((entity) => {
      if (
        needle !== "" &&
        ![
          entity.name,
          shopDisplayName(entity),
          entity.type,
          shopSubtype(entity) ?? "",
          shopSlot(entity) ?? "",
          legacyCategory(entity),
        ]
          .join(" ")
          .toLocaleLowerCase()
          .includes(needle)
      )
        return false;
      const price = entityCurrencyCopper(entity);
      if (
        affordable &&
        itemCanBeBought(entity) &&
        price !== undefined &&
        price > walletCopper
      )
        return false;
      if (
        proficient &&
        itemProficiencyStatus(entity, ownedDefinitions) !== "proficient"
      )
        return false;
      if (!shopKnownFilterMatches(learning, knownOnly, known(entity)))
        return false;
      return true;
    });
  }, [
    advancedRecords,
    affordable,
    knownOnly,
    learning,
    ownedDefinitions,
    search,
    walletCopper,
  ]);
  const slots = useMemo(
    () =>
      [
        ...new Set(
          searchRecords
            .map(shopSlot)
            .filter((value): value is string => value !== undefined),
        ),
      ].sort(),
    [searchRecords],
  );
  const subtypes = useMemo(
    () =>
      [
        ...new Set(
          searchRecords
            .filter((entity) => slot === "" || shopSlot(entity) === slot)
            .map(shopSubtype)
            .filter((value): value is string => value !== undefined),
        ),
      ].sort(),
    [searchRecords, slot],
  );
  const filtered = useMemo(
    () =>
      searchRecords.filter(
        (entity) =>
          (slot === "" || shopSlot(entity) === slot) &&
          (subtype === "" || shopSubtype(entity) === subtype),
      ),
    [searchRecords, slot, subtype],
  );

  useEffect(() => {
    const next = retainedShopFilter(
      slot,
      slots,
      learning || slots.length === 0,
    );
    if (next !== slot) {
      setSlot(next);
      setSubtype("");
      setOffset(0);
    }
  }, [learning, slot, slots]);

  useEffect(() => {
    const next = retainedShopFilter(
      subtype,
      subtypes,
      learning || subtypes.length === 0,
    );
    if (next !== subtype) {
      setSubtype(next);
      setOffset(0);
    }
  }, [learning, subtype, subtypes]);

  const compare = (left: ContentEntity, right: ContentEntity) => {
    const value = (entity: ContentEntity): string | number => {
      if (sort.column === "name") return shopDisplayName(entity);
      if (sort.column === "level") return shopItemLevel(entity);
      if (sort.column === "price")
        return entityCurrencyCopper(entity) ?? Number.MAX_SAFE_INTEGER;
      return ownedCount(entity, inventory);
    };
    const leftValue = value(left);
    const rightValue = value(right);
    const result =
      typeof leftValue === "string"
        ? leftValue.localeCompare(String(rightValue))
        : leftValue - Number(rightValue);
    return sort.direction === "ascending" ? result : -result;
  };

  const rows = useMemo(() => {
    const families = groupMagicItemFamilies(filtered, catalog);
    return families
      .map((family) => {
        const preferred = preferredVariants.get(family.key);
        const selected =
          family.entities.find(({ id }) => id === preferred) ??
          recommendedMagicItemVariant(family, characterLevel);
        return { family, selected };
      })
      .sort((left, right) => compare(left.selected, right.selected));
  }, [catalog, characterLevel, filtered, preferredVariants, sort]);
  const pageRows = rows.slice(offset, offset + PAGE_SIZE);

  const selectSort = (column: SortColumn) => {
    setSort((current) => ({
      column,
      direction:
        current.column === column && current.direction === "ascending"
          ? "descending"
          : "ascending",
    }));
    setOffset(0);
  };

  const beginAcquire = (entity: ContentEntity, mode: AcquireMode) => {
    const compatible = compatibleBaseItems(entity, catalog);
    const hasStandardImplement = isImplementEnchantment(entity);
    const choices = compatible.length + (hasStandardImplement ? 1 : 0);
    if (choices === 0) {
      onAcquire(
        inventoryEntryForEntity(entity, characterLevel),
        mode === "buy" ? (entityCurrencyCopper(entity) ?? 0) : 0,
      );
      return;
    }
    if (choices === 1) {
      const physical = compatible[0];
      onAcquire(
        inventoryEntryForEntity(entity, characterLevel, physical),
        mode === "buy" ? (entityCurrencyCopper(entity) ?? 0) : 0,
      );
      return;
    }
    setAcquisition({ entity, mode });
    setPhysicalSearch("");
    setPhysicalSubtype("");
    setSelectedPhysicalId(
      hasStandardImplement ? "standard" : (compatible[0]?.id ?? ""),
    );
    requestAnimationFrame(() => dialogRef.current?.showModal());
  };

  const physicalChoices = acquisition
    ? compatibleBaseItems(acquisition.entity, catalog)
    : [];
  const nouns = acquisition ? physicalNouns(acquisition.entity) : undefined;
  const standardImplement =
    acquisition && isImplementEnchantment(acquisition.entity);
  const visiblePhysicalChoices = physicalChoices.filter(
    (entity) =>
      (physicalSearch === "" ||
        entity.name
          .toLocaleLowerCase()
          .includes(physicalSearch.toLocaleLowerCase())) &&
      (physicalSubtype === "" || shopSubtype(entity) === physicalSubtype),
  );
  const physicalSubtypes = [
    ...new Set(
      physicalChoices
        .map(shopSubtype)
        .filter((value): value is string => value !== undefined),
    ),
  ].sort();

  const renderRow = (
    entity: ContentEntity,
    family: MagicItemFamily,
    options: {
      readonly child?: boolean;
      readonly disclosure?: boolean;
      readonly levelPlus?: boolean;
    },
  ) => {
    const displayName = shopDisplayName(entity);
    const price = entityCurrencyCopper(entity);
    const purchased = itemCanBeBought(entity);
    const canAfford = price !== undefined && price <= walletCopper;
    const isKnown = known(entity);
    const proficiency = itemProficiencyStatus(entity, ownedDefinitions);
    return (
      <tr
        className={
          [
            options.child ? "shop-family-child" : undefined,
            inspectedEntityId === entity.id ? "is-selected" : undefined,
          ]
            .filter(Boolean)
            .join(" ") || undefined
        }
        aria-selected={inspectedEntityId === entity.id || undefined}
        key={entity.id}
      >
        <th scope="row">
          <div className="shop-item-identity">
            {options.disclosure ? (
              <button
                type="button"
                className="shop-family-toggle"
                aria-label={`${expandedFamilies.has(family.key) ? "Collapse" : "Expand"} ${displayName} variants`}
                aria-expanded={expandedFamilies.has(family.key)}
                onClick={() =>
                  setExpandedFamilies((current) => {
                    const next = new Set(current);
                    if (next.has(family.key)) next.delete(family.key);
                    else next.add(family.key);
                    return next;
                  })
                }
              >
                <Icon name="chevron" />
              </button>
            ) : (
              <span className="shop-family-indent" />
            )}
            <span className="shop-item-icon">
              <Icon name={canonicalItemIcon(entity)} />
              {proficiency === "unverified" ? (
                <span
                  className="shop-proficiency-badge"
                  role="img"
                  aria-label="Not proficient"
                  title="Not proficient"
                >
                  <Icon name="warning" />
                </span>
              ) : null}
            </span>
            <button
              type="button"
              className="table-inspect-button"
              onClick={() => {
                setInspectedEntityId(entity.id);
                const kind = implementKind(entity);
                const compatible = compatibleBaseItems(entity, catalog);
                const nouns = physicalNouns(entity);
                const compatibleTypes = [
                  ...new Set(
                    compatible
                      .map(shopSubtype)
                      .filter((value): value is string => value !== undefined),
                  ),
                ];
                onInspect(
                  entity,
                  displayName,
                  kind === undefined
                    ? undefined
                    : `Implement Enchantment (${kind})`,
                  kind !== undefined && compatibleTypes.length <= 1
                    ? undefined
                    : compatibleTypes.length > 0
                      ? {
                          label: `Compatible ${nouns.plural}`,
                          value: compatibleTypes.join(", "),
                        }
                      : undefined,
                );
                setPreferredVariants((current) =>
                  new Map(current).set(family.key, entity.id),
                );
              }}
            >
              {displayName}
            </button>
          </div>
        </th>
        <td>
          {options.levelPlus
            ? familyLevelLabel(family, entity)
            : (contentSpecificValue(entity, "Level") ?? "—")}
        </td>
        <td>{formatCopperPrice(price)}</td>
        <td>{isKnown ? "Known" : ownedCount(entity, inventory) || "—"}</td>
        <td>
          <div className="shop-row-actions">
            <span
              title={
                !purchased
                  ? "This item cannot be purchased."
                  : !canAfford
                    ? "Insufficient funds"
                    : undefined
              }
            >
              <button
                type="button"
                aria-label={`Buy ${displayName}`}
                title={!purchased ? "This item cannot be purchased." : "Buy"}
                disabled={!purchased || !canAfford || isKnown}
                onClick={() => beginAcquire(entity, "buy")}
              >
                <Icon name="shopping-cart" />
              </button>
            </span>
            <button
              type="button"
              aria-label={`Give ${displayName}`}
              title="Give"
              disabled={isKnown}
              onClick={() => beginAcquire(entity, "give")}
            >
              <Icon name="gift" />
            </button>
          </div>
        </td>
      </tr>
    );
  };

  const legacyValues = [...new Set(categoryRecords.map(legacyCategory))].sort();
  const sources = [
    ...new Set(categoryRecords.map(itemSource).filter(Boolean)),
  ].sort();
  const rarities = [
    ...new Set(categoryRecords.map(itemRarity).filter(Boolean)),
  ].sort();

  return (
    <>
      <div className="shop-toolbar">
        <label>
          Browse
          <select
            value={browse}
            onChange={(event) => {
              onBrowseChange(event.currentTarget.value as ShopBrowseId);
              setOffset(0);
            }}
          >
            {SHOP_BROWSE_CATEGORIES.map((category) => (
              <option key={category.id} value={category.id}>
                {category.label}
              </option>
            ))}
          </select>
        </label>
        <label className="shop-search">
          Search
          <Icon name="search" />
          <input
            type="search"
            value={search}
            placeholder="Search all items…"
            onChange={(event) => {
              setSearch(event.currentTarget.value);
              setOffset(0);
            }}
          />
        </label>
        <div className="shop-result-tools">
          <label>
            Slot
            <select
              disabled={learning || slots.length === 0}
              value={slot}
              onChange={(event) => {
                setSlot(event.currentTarget.value);
                setSubtype("");
                setOffset(0);
              }}
            >
              {learning || slots.length === 0 ? (
                <option>—</option>
              ) : (
                <>
                  <option value="">All slots</option>
                  {slots.map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </>
              )}
            </select>
          </label>
          <label>
            Subtype
            <select
              disabled={learning || subtypes.length === 0}
              value={subtype}
              onChange={(event) => {
                setSubtype(event.currentTarget.value);
                setOffset(0);
              }}
            >
              {learning || subtypes.length === 0 ? (
                <option>—</option>
              ) : (
                <>
                  <option value="">All subtypes</option>
                  {subtypes.map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </>
              )}
            </select>
          </label>
          <button
            className="shop-filter-chip"
            type="button"
            aria-pressed={affordable}
            onClick={() => setAffordable((value) => !value)}
          >
            Affordable
          </button>
          {learning ? (
            <button
              className="shop-filter-chip"
              type="button"
              aria-pressed={knownOnly}
              onClick={() => setKnownOnly((value) => !value)}
            >
              Known
            </button>
          ) : (
            <button
              className="shop-filter-chip"
              type="button"
              aria-pressed={proficient}
              onClick={() => setProficient((value) => !value)}
            >
              Proficient
            </button>
          )}
          <button
            className="shop-filter-button"
            type="button"
            aria-expanded={advancedOpen}
            onClick={() => setAdvancedOpen((value) => !value)}
          >
            <Icon name="filter" /> Filters
          </button>
        </div>
        {advancedOpen ? (
          <div className="shop-advanced-filters">
            {!learning ? (
              <label>
                Legacy category
                <select
                  value={legacy}
                  onChange={(event) => setLegacy(event.currentTarget.value)}
                >
                  <option value="">All legacy categories</option>
                  {legacyValues.map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
            ) : null}
            <label>
              Source
              <select
                value={source}
                onChange={(event) => setSource(event.currentTarget.value)}
              >
                <option value="">All sources</option>
                {sources.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <label>
              Rarity
              <select
                value={rarity}
                onChange={(event) => setRarity(event.currentTarget.value)}
              >
                <option value="">All rarities</option>
                {rarities.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <label>
              Tier
              <select
                value={tier}
                onChange={(event) => setTier(event.currentTarget.value)}
              >
                <option value="">All tiers</option>
                <option>Heroic</option>
                <option>Paragon</option>
                <option>Epic</option>
              </select>
            </label>
          </div>
        ) : null}
      </div>

      <div className="equipment-table-scroll shop-table-scroll">
        <table className="shop-table">
          <thead>
            <tr>
              {(["name", "level", "price", "owned"] as const).map((column) => (
                <th
                  key={column}
                  aria-sort={sort.column === column ? sort.direction : "none"}
                >
                  <button
                    type="button"
                    className="selection-sort-button"
                    onClick={() => selectSort(column)}
                  >
                    {column === "name"
                      ? "Name"
                      : column[0]!.toUpperCase() + column.slice(1)}
                    <Icon name="chevron" />
                  </button>
                </th>
              ))}
              <th>
                <span className="visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          {pageRows.length === 0 ? (
            <tbody>
              <tr className="shop-empty-row">
                <td colSpan={5} className="shop-empty">
                  No items match these filters.
                </td>
              </tr>
            </tbody>
          ) : null}
          {SHOP_BROWSE_CATEGORIES.filter(({ id }) => id !== "all").map(
            (category) => {
              const categoryRows =
                browse === "all"
                  ? pageRows.filter(
                      ({ selected }) =>
                        shopBrowseCategory(selected) === category.id,
                    )
                  : category.id === browse
                    ? pageRows
                    : [];
              if (categoryRows.length === 0) return null;
              return (
                <Fragment key={category.id}>
                  {browse === "all" ? (
                    <tbody>
                      <tr className="shop-category-row">
                        <th colSpan={5}>
                          <button
                            type="button"
                            aria-expanded={
                              !collapsedCategories.has(category.id)
                            }
                            onClick={() =>
                              setCollapsedCategories((current) => {
                                const next = new Set(current);
                                if (next.has(category.id))
                                  next.delete(category.id);
                                else next.add(category.id);
                                return next;
                              })
                            }
                          >
                            <Icon name="chevron" />
                            <span>{category.label}</span>
                            <small>{categoryRows.length}</small>
                          </button>
                        </th>
                      </tr>
                    </tbody>
                  ) : null}
                  <tbody>
                    {browse === "all" && collapsedCategories.has(category.id)
                      ? null
                      : categoryRows.flatMap(({ family, selected }) => {
                          const expanded =
                            family.entities.length > 1 &&
                            expandedFamilies.has(family.key);
                          if (!expanded)
                            return [
                              renderRow(selected, family, {
                                disclosure: family.entities.length > 1,
                                levelPlus: family.entities.length > 1,
                              }),
                            ];
                          return [...family.entities]
                            .sort(
                              (left, right) =>
                                shopItemLevel(left) - shopItemLevel(right) ||
                                left.name.localeCompare(right.name) ||
                                left.id.localeCompare(right.id),
                            )
                            .map((entity, index) =>
                              renderRow(entity, family, {
                                disclosure: index === 0,
                                child: index > 0,
                              }),
                            );
                        })}
                  </tbody>
                </Fragment>
              );
            },
          )}
        </table>
      </div>
      <div className="equipment-pagination">
        <button
          type="button"
          disabled={offset === 0}
          onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
        >
          Previous
        </button>
        <span>
          {rows.length === 0
            ? "0 results"
            : `${offset + 1}–${Math.min(offset + PAGE_SIZE, rows.length)} of ${rows.length.toLocaleString()}`}
        </span>
        <button
          type="button"
          disabled={offset + PAGE_SIZE >= rows.length}
          onClick={() => setOffset(offset + PAGE_SIZE)}
        >
          Next
        </button>
      </div>

      <dialog
        className="shop-physical-dialog"
        ref={dialogRef}
        onClose={() => setAcquisition(undefined)}
      >
        {acquisition && nouns ? (
          <form
            method="dialog"
            onSubmit={(event) => {
              event.preventDefault();
              const physical =
                selectedPhysicalId === "standard"
                  ? undefined
                  : physicalChoices.find(({ id }) => id === selectedPhysicalId);
              if (selectedPhysicalId !== "standard" && physical === undefined)
                return;
              onAcquire(
                inventoryEntryForEntity(
                  acquisition.entity,
                  characterLevel,
                  physical,
                ),
                acquisition.mode === "buy"
                  ? (entityCurrencyCopper(acquisition.entity) ?? 0)
                  : 0,
              );
              dialogRef.current?.close();
            }}
          >
            <header>
              <div>
                <p className="eyebrow">Choose a compatible {nouns.singular}</p>
                <h2>
                  {acquisition.mode === "buy" ? "Buy" : "Give"}{" "}
                  {shopDisplayName(acquisition.entity)}
                </h2>
              </div>
              <button
                type="button"
                aria-label="Close item picker"
                onClick={() => dialogRef.current?.close()}
              >
                ×
              </button>
            </header>
            <div className="shop-physical-tools">
              <label>
                Search
                <input
                  type="search"
                  placeholder={`Search compatible ${nouns.plural}…`}
                  value={physicalSearch}
                  onChange={(event) =>
                    setPhysicalSearch(event.currentTarget.value)
                  }
                />
              </label>
              <label>
                Subtype
                <select
                  value={physicalSubtype}
                  onChange={(event) =>
                    setPhysicalSubtype(event.currentTarget.value)
                  }
                >
                  <option value="">All subtypes</option>
                  {physicalSubtypes.map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
            </div>
            <div
              className="shop-physical-list"
              role="radiogroup"
              aria-label={`Compatible ${nouns.plural}`}
            >
              <div className="shop-physical-list-heading" aria-hidden="true">
                <strong>
                  {nouns.singular[0]!.toLocaleUpperCase() +
                    nouns.singular.slice(1)}
                </strong>
                <strong>Type</strong>
              </div>
              {standardImplement ? (
                <label>
                  <input
                    type="radio"
                    name="physical-item"
                    value="standard"
                    checked={selectedPhysicalId === "standard"}
                    onChange={() => setSelectedPhysicalId("standard")}
                  />
                  <span className="shop-physical-choice">
                    <span className="shop-item-icon">
                      <Icon name={canonicalItemIcon(acquisition.entity)} />
                    </span>
                    <strong>
                      {implementKind(acquisition.entity) ??
                        "Standard implement"}
                    </strong>
                    <small>Standard</small>
                  </span>
                </label>
              ) : null}
              {visiblePhysicalChoices.map((entity) => (
                <label key={entity.id}>
                  <input
                    type="radio"
                    name="physical-item"
                    value={entity.id}
                    checked={selectedPhysicalId === entity.id}
                    onChange={() => setSelectedPhysicalId(entity.id)}
                  />
                  <span className="shop-physical-choice">
                    <span className="shop-item-icon">
                      <Icon name={canonicalItemIcon(entity)} />
                      {itemProficiencyStatus(entity, ownedDefinitions) ===
                      "unverified" ? (
                        <span
                          className="shop-proficiency-badge"
                          role="img"
                          aria-label="Not proficient"
                          title="Not proficient"
                        >
                          <Icon name="warning" />
                        </span>
                      ) : null}
                    </span>
                    <strong>{entity.name}</strong>
                    <small>
                      {compatibleChoiceType(entity, standardImplement === true)}
                    </small>
                  </span>
                </label>
              ))}
            </div>
            <dl className="shop-physical-summary">
              <div>
                <dt>Resulting item</dt>
                <dd>
                  {selectedPhysicalId === "standard"
                    ? shopDisplayName(acquisition.entity)
                    : selectedPhysicalId
                      ? `${shopDisplayName(acquisition.entity)} · ${physicalChoices.find(({ id }) => id === selectedPhysicalId)?.name ?? ""}`
                      : `Choose a ${nouns.singular}`}
                </dd>
              </div>
              <div>
                <dt>Price</dt>
                <dd>
                  {acquisition.mode === "give"
                    ? "Free"
                    : formatCopperPrice(
                        entityCurrencyCopper(acquisition.entity),
                      )}
                </dd>
              </div>
            </dl>
            <footer>
              <button type="button" onClick={() => dialogRef.current?.close()}>
                Cancel
              </button>
              <button
                className="dialog-primary"
                type="submit"
                disabled={selectedPhysicalId === ""}
              >
                {acquisition.mode === "buy" ? "Buy" : "Give"}
              </button>
            </footer>
          </form>
        ) : null}
      </dialog>
    </>
  );
}
