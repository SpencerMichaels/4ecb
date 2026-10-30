import { augmentHosts } from "./inventory-augments";

export type BuildLegality = "rules-legal" | "houserule";

export interface BuildElementIdentity {
  readonly definitionId?: string;
  readonly name: string;
  readonly type: string;
  readonly url?: string;
  /**
   * The internal-id an imported file saved, kept when import pointed this
   * element at a different content record of the same name because the
   * active content lacked the saved ID. Exports write `definitionId`.
   */
  readonly importedDefinitionId?: string;
}

export interface BuildInventoryElement extends BuildElementIdentity {
  /** Saved choices nested under this item definition in legacy loot XML. */
  readonly children?: readonly BuildOccurrence[];
}

export interface BuildOccurrence {
  /** Stable within the character. Imported charelem tokens are never treated as global IDs. */
  readonly id: string;
  readonly identity: BuildElementIdentity;
  readonly acquiredLevel: number;
  readonly legality: BuildLegality;
  readonly replacesId?: string;
  readonly children: readonly BuildOccurrence[];
  readonly unresolved: boolean;
}

/** A content-independent rule statement stored by a native UserEdit. */
export interface BuildUserRule {
  readonly name: string;
  readonly attributes: readonly {
    readonly name: string;
    readonly value: string;
  }[];
  readonly text: string;
  readonly children: readonly BuildUserRule[];
}

/**
 * The legacy engine stores one generated provider and its executable rules in
 * a per-level UserEdit container. They remain character-local rather than
 * becoming shared content definitions.
 */
export interface BuildUserEdit {
  readonly root: BuildOccurrence;
  readonly rules: readonly BuildUserRule[];
}

export interface BuildLevelFrame {
  readonly level: number;
  readonly root: BuildOccurrence;
  readonly userEdit?: BuildUserEdit;
}

/** Stable equipment locations used by the character build and equipment UI. */
export const EQUIPMENT_SLOT_IDS = [
  "body",
  "main-hand",
  "off-hand",
  "head",
  "neck",
  "arms",
  "hands",
  "ring-1",
  "ring-2",
  "ring-3",
  "ring-4",
  "waist",
  "feet",
  "symbol",
  "ki-focus",
  "tattoo",
  "companion",
  "familiar",
  "mount",
] as const;

export type EquipmentSlotId = (typeof EQUIPMENT_SLOT_IDS)[number];

/**
 * `quantityIndex` identifies one holding within an inventory entry. Assignments
 * with the same index equip one holding in multiple slots (for example a
 * two-handed weapon in both hand slots).
 */
export interface EquipmentSlotAssignment {
  readonly slot: EquipmentSlotId;
  readonly quantityIndex: number;
}

export interface BuildInventoryEntry {
  readonly id: string;
  readonly acquiredLevel: number;
  readonly quantity: number;
  readonly equippedQuantity: number;
  /** Missing on historical builds that only recorded equippedQuantity. */
  readonly equippedSlots?: readonly EquipmentSlotAssignment[];
  readonly elements: readonly BuildInventoryElement[];
  readonly name?: string;
  readonly showPowerCard?: boolean;
  /**
   * A versatile weapon wielded in two hands (it then fills both hand
   * slots); false wields it one-handed. Undefined means no modern choice:
   * an imported holding without exact slots follows the legacy
   * `_INTERNAL_VersatileUsedTwoHanded` text string (D101). Set with the
   * `set-inventory-wielding` command.
   */
  readonly wieldedTwoHanded?: boolean;
  /**
   * The dragonshard augment holding this item carries (legacy
   * CharLootAugment); null carries none. Undefined means no modern choice:
   * the imported `augment` loot attribute decides (see
   * `boundAugmentHolding`). Set with the `set-inventory-augment` command.
   */
  readonly augmentEntryId?: string | null;
  readonly overrides: Readonly<Record<string, string>>;
  readonly legality: BuildLegality;
}

/** One part of an inventory holding as the name formatter needs it. */
export interface InventoryNamePart extends Pick<
  BuildElementIdentity,
  "name" | "type"
> {
  /** The Magic Item's authored "Magic Item Type" (e.g. "Artifact"). */
  readonly magicItemType?: string | undefined;
}

const INVENTORY_BASE_TYPES = ["armor", "weapon", "superior implement"];
/**
 * Legacy CharLootName's implement words, tried in order on implement bases,
 * plus the generic "implement" (e.g. "Implement of X +2").
 */
const IMPLEMENT_NAME_WORDS = [
  "implement",
  "holy symbol",
  "symbol",
  "orb",
  "rod",
  "staff",
  "tome",
  "totem",
  "wand",
  "ki focus",
];

function replaceNameWord(
  baseName: string,
  enchantmentName: string,
  word: string,
): string | undefined {
  const match = new RegExp(`\\b${word}\\b`, "iu").exec(enchantmentName);
  if (match === null) return undefined;
  return (
    enchantmentName.slice(0, match.index) +
    baseName +
    enchantmentName.slice(match.index + word.length)
  );
}

function tidyName(name: string): string {
  return name.replaceAll(/\s+/gu, " ").trim();
}

/**
 * Formats an exact inventory holding without exposing its base/enchantment
 * split, following the legacy engine's CharLootName
 * (reverse-engineering/generated/decompiled/D20RulesEngine/-Module-.cs,
 * `CharLootName(ws, base, ench_elem)`): a custom name wins; a lone base or
 * enchantment is its own name; an enchantment whose Magic Item Type is
 * Artifact (pact weapons, named artifacts) names the holding by itself;
 * otherwise the enchantment's "weapon"/"armor"/implement word is replaced
 * by the base name, or the base name is inserted before the enchantment's
 * "+N"/parenthetical. Deliberate improvements over legacy (D091): "Magic
 * Weapon +N" on a Longsword reads "Longsword +N" (legacy "Magic Longsword
 * +N"); shield templates merge with the shield base ("Storm Heavy Shield");
 * the base's own kind of word is replaced first; and an enchantment that
 * already names its base is not repeated ("Wyrmtooth Dagger +1", "Sword of
 * Croodle").
 */
export function formatInventoryItemName(
  elements: readonly InventoryNamePart[],
  customName?: string,
): string {
  const preservedName = customName?.trim();
  if (preservedName) return preservedName;

  const normalized = elements.map(({ name, type, magicItemType }) => ({
    name: name.trim(),
    type: type.toLocaleLowerCase(),
    magicItemType: magicItemType?.trim().toLocaleLowerCase(),
  }));
  const base = normalized.find(({ type }) =>
    INVENTORY_BASE_TYPES.includes(type),
  );
  const enchantment = normalized.find(({ type }) => type === "magic item");
  const composed =
    base === undefined || enchantment === undefined
      ? undefined
      : composeInventoryName(base, enchantment);
  if (composed !== undefined) {
    const others = normalized.filter(
      (part) => part !== base && part !== enchantment && part.name !== "",
    );
    return others.length === 0
      ? composed
      : [composed, ...others.map(({ name }) => name)].join(" + ");
  }

  return (
    normalized
      .map(({ name }) => name)
      .filter(Boolean)
      .join(" + ") || "Unnamed item"
  );
}

function composeInventoryName(
  base: { readonly name: string; readonly type: string },
  enchantment: {
    readonly name: string;
    readonly magicItemType?: string | undefined;
  },
): string {
  if (enchantment.magicItemType === "artifact") return enchantment.name;

  if (
    base.type === "armor" &&
    /\bshield\b/iu.test(base.name) &&
    /shield/iu.test(enchantment.name)
  ) {
    const baseName = base.name.replace(/\b[a-z]/gu, (letter) =>
      letter.toLocaleUpperCase(),
    );
    const stem = enchantment.name.replace(
      /\s+\((?:heroic|paragon|epic) tier\)$/iu,
      "",
    );
    const composed = /\bshield\b/iu.test(stem)
      ? stem.replace(/\bshield\b/iu, baseName)
      : `${stem} ${baseName}`;
    return tidyName(composed).replace(/^[a-z]/u, (letter) =>
      letter.toLocaleUpperCase(),
    );
  }

  const generic =
    base.type === "armor"
      ? "armor"
      : base.type === "weapon"
        ? "weapon"
        : "implement";
  const magic = new RegExp(`^magic ${generic}(?=\\s+\\+\\d)`, "iu");
  if (magic.test(enchantment.name))
    return tidyName(enchantment.name.replace(magic, base.name));

  // Legacy tries "weapon", then "armor", then implement words; trying the
  // base's own kind first keeps "Master's Wand of Thundering Armor +1" on an
  // implement from replacing "Armor".
  const words =
    base.type === "superior implement"
      ? [...IMPLEMENT_NAME_WORDS, "weapon", "armor"]
      : base.type === "armor"
        ? ["armor", "weapon"]
        : ["weapon", "armor"];
  for (const word of words) {
    const replaced = replaceNameWord(base.name, enchantment.name, word);
    if (replaced !== undefined) return tidyName(replaced);
  }
  const kiFocused = replaceNameWord(
    `Ki Focused ${base.name}`,
    enchantment.name,
    "ki focus",
  );
  if (kiFocused !== undefined) return tidyName(kiFocused);

  const marker = /\s*[+(]/u.exec(enchantment.name);
  const stem =
    marker === null
      ? enchantment.name
      : enchantment.name.slice(0, marker.index);
  // An item that already names its base is the holding's name, where legacy
  // would repeat the base: "Wyrmtooth Dagger +1" on a Dagger (legacy
  // "Wyrmtooth Dagger Dagger +1"), and, for a named item without "+N",
  // "Sword of Croodle" on a Longsword or "Axe of Tloques" on a Battleaxe.
  // A "+N" template with its own noun ("Pact Sword +1") still shows its base.
  const baseName = base.name.toLocaleLowerCase();
  const baseNoun = baseName.split(/\s+/u).at(-1) ?? "";
  const stemWords = stem.toLocaleLowerCase().split(/[^\p{L}]+/u);
  const namesBase =
    ` ${stemWords.join(" ")} `.includes(` ${baseName} `) ||
    (!/\+\d/u.test(enchantment.name) &&
      stemWords.some((word) => word.length >= 3 && baseNoun.endsWith(word)));
  if (namesBase) return tidyName(enchantment.name);
  return tidyName(
    marker === null
      ? `${enchantment.name} ${base.name}`
      : `${stem} ${base.name} ${enchantment.name.slice(marker.index).trim()}`,
  );
}

export interface BuildAlternate {
  readonly id: string;
  readonly selectName: string;
  readonly provider: BuildElementIdentity;
  readonly choice: BuildOccurrence;
}

/** How a learned ritual, formula or practice was acquired. */
export type BuildKnownAcquisition = "bought" | "free";

/**
 * A ritual, alchemical formula or martial practice the character has learned.
 * Known records are not physical gear: they carry no quantity, and owning a
 * Ritual Scroll never makes its ritual known (D044). Granted records (a
 * `grant type="Ritual"` or a `FREEBEE:` stat) are derived from evaluation and
 * never stored here.
 */
export interface BuildKnownEntry {
  /** Stable occurrence ID. */
  readonly id: string;
  /** The level it was learned at; hidden when viewing below it. */
  readonly acquiredLevel: number;
  /** The exact Ritual record. Its kind comes from the record's authored type. */
  readonly element: BuildElementIdentity;
  readonly acquisition: BuildKnownAcquisition;
  /**
   * The free-ritual allowance a "free" entry was learned from (the key the
   * rules engine gives it). Absent on bought entries, DM gifts and imported
   * loot; imported free entries are matched to allowances when counted.
   */
  readonly allowance?: string;
  /** Only for imported loot: the original record, re-emitted on export. */
  readonly legacyLoot?: Omit<BuildInventoryEntry, "id" | "acquiredLevel">;
}

/** The textstring value legacy writes once a free item has been given. */
export const FREEBEE_GIVEN = "Given";

/**
 * One legacy `FREEBEE:<id>` gift (MainWindow.GiveFreebees): `marker` is the
 * textstring `<id>`, set to "Given" so the gift is never repeated. `entry` is
 * the gifted holding, absent when the character already owns one.
 */
export interface FreebeeGift {
  readonly marker: string;
  readonly entry?: BuildInventoryEntry;
}

/** Whether textstring `marker` already records the gift (case-insensitive key). */
export function isFreebeeGiven(
  textStrings: Readonly<Record<string, string>>,
  marker: string,
): boolean {
  const target = marker.trim().toLocaleLowerCase();
  return Object.entries(textStrings).some(
    ([name, value]) =>
      name.trim().toLocaleLowerCase() === target &&
      value.trim().toLocaleLowerCase() === FREEBEE_GIVEN.toLocaleLowerCase(),
  );
}

export const CHARACTER_BUILD_FORMAT_VERSION = 3 as const;

export interface CharacterBuild {
  readonly formatVersion: typeof CHARACTER_BUILD_FORMAT_VERSION;
  readonly effectiveLevel: number;
  readonly levels: readonly BuildLevelFrame[];
  readonly grabbag: readonly BuildOccurrence[];
  /**
   * What the character owns now: one concrete holding per item (same name
   * and elements), with non-negative counts. It is the same at every viewed
   * level and is the only inventory any surface or evaluation reads (D097).
   */
  readonly inventory: readonly BuildInventoryEntry[];
  /**
   * An imported file's original per-level `loot` transactions (legacy
   * LootTally deltas, possibly negative), kept verbatim so export can write
   * them back. Never read for current state; absent when nothing was
   * imported as history.
   */
  readonly inventoryHistory?: readonly BuildInventoryEntry[];
  /** Learned rituals, alchemical formulas and martial practices. */
  readonly known: readonly BuildKnownEntry[];
  readonly alternates: readonly BuildAlternate[];
  readonly baseAbilities: Readonly<Record<string, number>>;
  readonly textStrings: Readonly<Record<string, string>>;
}

/** A saved build from before known records left the inventory. */
export interface CharacterBuildV1 extends Omit<
  CharacterBuild,
  "formatVersion" | "known" | "inventoryHistory"
> {
  readonly formatVersion: 1;
}

/**
 * A saved build whose inventory was still the imported per-level loot
 * transactions rather than current holdings.
 */
export interface CharacterBuildV2 extends Omit<
  CharacterBuild,
  "formatVersion" | "inventoryHistory"
> {
  readonly formatVersion: 2;
}

/**
 * Whether an inventory holding is a learned Ritual record (ritual, formula or
 * practice) rather than gear. It reads only the saved element type, so it
 * needs no content. Ritual Scrolls are a different type and stay gear.
 */
export function isKnownRecordHolding(
  entry: Pick<BuildInventoryEntry, "elements">,
): boolean {
  return entry.elements[0]?.type.trim().toLocaleLowerCase() === "ritual";
}

/**
 * Maps a legacy ritual `loot` holding to a known entry. Legacy does not record
 * whether a ritual was paid for, so it is "free"; the whole original record is
 * kept for export.
 */
export function knownEntryFromHolding(
  entry: BuildInventoryEntry,
): BuildKnownEntry {
  const { id, acquiredLevel, ...legacyLoot } = entry;
  const element = entry.elements[0]!;
  return {
    id,
    acquiredLevel,
    element: {
      ...(element.definitionId === undefined
        ? {}
        : { definitionId: element.definitionId }),
      name: element.name,
      type: element.type,
      ...(element.url === undefined ? {} : { url: element.url }),
    },
    acquisition: "free",
    legacyLoot,
  };
}

/**
 * Splits ritual holdings out of an inventory. A holding with no remaining
 * count (`count="0"`), or one a later level's loot removes again, is not
 * known; it stays in the inventory rows so its record is still exported.
 */
export function separateKnownHoldings(
  inventory: readonly BuildInventoryEntry[],
): {
  readonly inventory: readonly BuildInventoryEntry[];
  readonly known: readonly BuildKnownEntry[];
} {
  const known: BuildKnownEntry[] = [];
  const remaining: BuildInventoryEntry[] = [];
  const counts = new Map<string, number>();
  for (const entry of inventory) {
    const key = inventoryHoldingKey(entry);
    counts.set(key, (counts.get(key) ?? 0) + entry.quantity);
  }
  for (const entry of inventory) {
    if (
      isKnownRecordHolding(entry) &&
      entry.quantity > 0 &&
      (counts.get(inventoryHoldingKey(entry)) ?? 0) > 0
    )
      known.push(knownEntryFromHolding(entry));
    else remaining.push(entry);
  }
  return { inventory: remaining, known };
}

/**
 * Upgrades a saved build to the current format. Restartable and idempotent:
 * a current build is returned unchanged, and no entry is ever dropped.
 */
export function upgradeCharacterBuild(
  build: CharacterBuild | CharacterBuildV2 | CharacterBuildV1,
): CharacterBuild {
  if (build.formatVersion === CHARACTER_BUILD_FORMAT_VERSION) return build;
  const v2: CharacterBuildV2 =
    build.formatVersion === 2
      ? build
      : {
          ...build,
          formatVersion: 2,
          ...separateKnownHoldings(build.inventory),
        };
  return {
    ...v2,
    formatVersion: CHARACTER_BUILD_FORMAT_VERSION,
    ...settleInventory(v2.inventory),
  };
}

/** The content identity a known record is deduplicated by. */
export function knownElementKey(element: BuildElementIdentity): string {
  return (
    element.definitionId ?? `${element.type}\0${element.name}`
  ).toLocaleLowerCase();
}

/** Whether the build already stores this exact record as known. */
export function isKnownElementStored(
  build: Pick<CharacterBuild, "known">,
  element: BuildElementIdentity,
): boolean {
  const target = knownElementKey(element);
  return build.known.some((entry) => knownElementKey(entry.element) === target);
}

export const CURRENCY_DENOMINATIONS = ["ad", "pp", "gp", "sp", "cp"] as const;

export type CurrencyDenomination = (typeof CURRENCY_DENOMINATIONS)[number];
export type CurrencyAmount = Readonly<Record<CurrencyDenomination, number>>;

export const ZERO_CURRENCY: CurrencyAmount = {
  ad: 0,
  pp: 0,
  gp: 0,
  sp: 0,
  cp: 0,
};

export const CURRENCY_COPPER_VALUES: Readonly<
  Record<CurrencyDenomination, number>
> = {
  ad: 1_000_000,
  pp: 10_000,
  gp: 100,
  sp: 10,
  cp: 1,
};

export type CharacterWalletKind = "carried" | "stored";

export interface ResolvedCharacterWallet {
  readonly amount: CurrencyAmount;
  /** The inherited legacy textstring level, absent when the wallet is zero. */
  readonly sourceLevel?: number;
}

function validCurrencyCount(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function assertCurrencyAmount(amount: CurrencyAmount): void {
  for (const denomination of CURRENCY_DENOMINATIONS) {
    if (!validCurrencyCount(amount[denomination]))
      throw new Error("Currency counts must be non-negative safe integers");
  }
}

/** Parses legacy strings such as `1 pp; 2 gp; 5 sp`; malformed text is rejected. */
export function parseLegacyCurrency(value: string): CurrencyAmount {
  const trimmed = value.trim();
  if (trimmed === "" || trimmed === "0") return ZERO_CURRENCY;

  const amount: Record<CurrencyDenomination, number> = { ...ZERO_CURRENCY };
  const token = /(\d{1,3}(?:,\d{3})*|\d+)\s*(ad|pp|gp|sp|cp)\b/giu;
  let cursor = 0;
  let matched = false;
  for (const match of trimmed.matchAll(token)) {
    const index = match.index;
    if (index === undefined || !/^[\s;+]*$/u.test(trimmed.slice(cursor, index)))
      throw new Error(`Invalid legacy currency: ${value}`);
    const denomination = match[2]?.toLocaleLowerCase() as
      CurrencyDenomination | undefined;
    const count = Number(match[1]?.replaceAll(",", ""));
    if (denomination === undefined || !validCurrencyCount(count))
      throw new Error(`Invalid legacy currency: ${value}`);
    const combined = amount[denomination] + count;
    if (!Number.isSafeInteger(combined))
      throw new Error("Currency exceeds the safe integer range");
    amount[denomination] = combined;
    cursor = index + match[0].length;
    matched = true;
  }
  if (!matched || !/^[\s;+]*$/u.test(trimmed.slice(cursor)))
    throw new Error(`Invalid legacy currency: ${value}`);
  return amount;
}

/** Formats a canonical legacy-compatible, largest-denomination-first string. */
export function formatLegacyCurrency(amount: CurrencyAmount): string {
  assertCurrencyAmount(amount);
  const parts = CURRENCY_DENOMINATIONS.flatMap((denomination) =>
    amount[denomination] === 0
      ? []
      : [`${amount[denomination]} ${denomination}`],
  );
  return parts.length === 0 ? "0 gp" : parts.join("; ");
}

export function currencyToCopper(amount: CurrencyAmount): number {
  assertCurrencyAmount(amount);
  let copper = 0;
  for (const denomination of CURRENCY_DENOMINATIONS) {
    const contribution =
      amount[denomination] * CURRENCY_COPPER_VALUES[denomination];
    if (
      !Number.isSafeInteger(contribution) ||
      !Number.isSafeInteger(copper + contribution)
    )
      throw new Error("Currency exceeds the safe integer range");
    copper += contribution;
  }
  return copper;
}

export function currencyFromCopper(copper: number): CurrencyAmount {
  if (!validCurrencyCount(copper))
    throw new Error("Copper value must be a non-negative safe integer");
  const amount: Record<CurrencyDenomination, number> = { ...ZERO_CURRENCY };
  let remainder = copper;
  for (const denomination of CURRENCY_DENOMINATIONS) {
    const value = CURRENCY_COPPER_VALUES[denomination];
    amount[denomination] = Math.floor(remainder / value);
    remainder %= value;
  }
  return amount;
}

/**
 * Exchanges coins for the fewest of equal value, up to platinum. Astral
 * diamonds are kept as they are and never minted: they are treasure rather
 * than change. Only the wallet's Consolidate action calls this; purchases,
 * sales and adjustments never re-mint a wallet.
 */
export function consolidateCurrency(amount: CurrencyAmount): CurrencyAmount {
  assertCurrencyAmount(amount);
  let remainder = currencyToCopper({ ...amount, ad: 0 });
  const consolidated: Record<CurrencyDenomination, number> = {
    ...ZERO_CURRENCY,
    ad: amount.ad,
  };
  for (const denomination of ["pp", "gp", "sp", "cp"] as const) {
    const value = CURRENCY_COPPER_VALUES[denomination];
    consolidated[denomination] = Math.floor(remainder / value);
    remainder %= value;
  }
  return consolidated;
}

/** Splits a copper amount into gold, silver and copper, the coins shop prices
 * are quoted in, so payments and proceeds never mint platinum or diamonds. */
function goldCurrencyFromCopper(copper: number): CurrencyAmount {
  if (!validCurrencyCount(copper))
    throw new Error("Copper value must be a non-negative safe integer");
  return {
    ...ZERO_CURRENCY,
    gp: Math.floor(copper / CURRENCY_COPPER_VALUES.gp),
    sp: Math.floor(
      (copper % CURRENCY_COPPER_VALUES.gp) / CURRENCY_COPPER_VALUES.sp,
    ),
    cp: copper % CURRENCY_COPPER_VALUES.sp,
  };
}

export function addCurrency(
  left: CurrencyAmount,
  right: CurrencyAmount,
): CurrencyAmount {
  return currencyFromCopper(currencyToCopper(left) + currencyToCopper(right));
}

export function subtractCurrency(
  amount: CurrencyAmount,
  cost: CurrencyAmount,
): CurrencyAmount {
  const remainder = currencyToCopper(amount) - currencyToCopper(cost);
  if (remainder < 0) throw new Error("Insufficient currency");
  return currencyFromCopper(remainder);
}

export interface CoinAdjustment {
  readonly coin: CurrencyDenomination;
  /** Signed number of coins: positive adds, negative spends. */
  readonly count: number;
}

/** Parses "20pp", "-15 gp", "2d" (astral diamonds, also "ad") or a bare "50"
 * (gold, the coin prices are quoted in) into the coin and count typed. */
export function parseCoinAdjustment(value: string): CoinAdjustment {
  const match = /^\s*([+-]?)\s*(\d+)\s*(a?d|pp|gp|sp|cp)?\s*$/iu.exec(value);
  if (match === null) throw new Error("Enter an amount such as 50 or -15 sp");
  const count = Number(match[2]);
  const typed = match[3]?.toLocaleLowerCase() ?? "gp";
  const coin = (typed === "d" ? "ad" : typed) as CurrencyDenomination;
  if (!Number.isSafeInteger(count))
    throw new Error("Currency adjustment is too large");
  return { coin, count: match[1] === "-" ? -count : count };
}

/**
 * Applies a typed coin adjustment to the coins themselves rather than
 * re-minting the wallet from a copper total. Added coins are carried. Spent
 * coins come
 * from that coin, carried before stored; only a shortfall makes change, by
 * breaking the nearest larger coins (or, failing that, spending smaller ones,
 * largest first), with the change returned to carried coins.
 */
export function adjustWalletCoins(
  carried: CurrencyAmount,
  stored: CurrencyAmount,
  adjustment: CoinAdjustment,
): { readonly carried: CurrencyAmount; readonly stored: CurrencyAmount } {
  const { coin, count } = adjustment;
  if (!Number.isSafeInteger(count))
    throw new Error("Currency adjustment is too large");
  if (count >= 0) {
    const total = carried[coin] + count;
    if (!Number.isSafeInteger(total))
      throw new Error("Currency adjustment is too large");
    return { carried: { ...carried, [coin]: total }, stored };
  }
  const nextCarried: Record<CurrencyDenomination, number> = { ...carried };
  const nextStored: Record<CurrencyDenomination, number> = { ...stored };
  let needed = -count;
  const fromCarried = Math.min(nextCarried[coin], needed);
  nextCarried[coin] -= fromCarried;
  needed -= fromCarried;
  const fromStored = Math.min(nextStored[coin], needed);
  nextStored[coin] -= fromStored;
  needed -= fromStored;
  if (needed === 0) return { carried: nextCarried, stored: nextStored };

  // Make change for the shortfall: nearest larger coins first, then smaller.
  const shortfall = needed * CURRENCY_COPPER_VALUES[coin];
  if (!Number.isSafeInteger(shortfall))
    throw new Error("Currency adjustment is too large");
  const order = [
    ...CURRENCY_DENOMINATIONS.filter(
      (other) => CURRENCY_COPPER_VALUES[other] > CURRENCY_COPPER_VALUES[coin],
    ).reverse(),
    ...CURRENCY_DENOMINATIONS.filter(
      (other) => CURRENCY_COPPER_VALUES[other] < CURRENCY_COPPER_VALUES[coin],
    ),
  ];
  let paid = 0;
  for (const other of order) {
    for (const wallet of [nextCarried, nextStored]) {
      if (paid >= shortfall) break;
      const value = CURRENCY_COPPER_VALUES[other];
      const take = Math.min(
        wallet[other],
        Math.ceil((shortfall - paid) / value),
      );
      wallet[other] -= take;
      paid += take * value;
    }
  }
  if (paid < shortfall) throw new Error("Not enough funds for that adjustment");
  const change = currencyFromCopper(paid - shortfall);
  for (const denomination of CURRENCY_DENOMINATIONS)
    nextCarried[denomination] += change[denomination];
  return { carried: nextCarried, stored: nextStored };
}

/** Pays a copper amount from one location's coins: its gold, silver and
 * copper parts each as {@link adjustWalletCoins} spends a typed coin. */
function spendCoins(amount: CurrencyAmount, copper: number): CurrencyAmount {
  const cost = goldCurrencyFromCopper(copper);
  let remaining = amount;
  for (const coin of ["gp", "sp", "cp"] as const) {
    if (cost[coin] > 0)
      remaining = adjustWalletCoins(remaining, ZERO_CURRENCY, {
        coin,
        count: -cost[coin],
      }).carried;
  }
  return remaining;
}

/**
 * Pays a purchase in the recovered legacy order, carried funds before stored,
 * but from the coins themselves: each location keeps its other coins and
 * breaks a larger one only for a shortfall, never re-minting the wallet.
 */
export function payWalletCopper(
  carried: CurrencyAmount,
  stored: CurrencyAmount,
  cost: number,
): { readonly carried: CurrencyAmount; readonly stored: CurrencyAmount } {
  if (!validCurrencyCount(cost))
    throw new Error("Copper value must be a non-negative safe integer");
  const carriedCopper = currencyToCopper(carried);
  const storedCopper = currencyToCopper(stored);
  if (!Number.isSafeInteger(carriedCopper + storedCopper))
    throw new Error("Current funds are too large to adjust safely");
  if (cost > carriedCopper + storedCopper)
    throw new Error("Insufficient currency");
  if (cost <= carriedCopper)
    return { carried: spendCoins(carried, cost), stored };
  return {
    carried: ZERO_CURRENCY,
    stored: spendCoins(stored, cost - carriedCopper),
  };
}

/** Adds sale proceeds to carried coins as gold, silver and copper. */
export function receiveWalletCopper(
  carried: CurrencyAmount,
  proceeds: number,
): CurrencyAmount {
  const received = goldCurrencyFromCopper(proceeds);
  const next: Record<CurrencyDenomination, number> = { ...carried };
  for (const denomination of CURRENCY_DENOMINATIONS) {
    next[denomination] += received[denomination];
    if (!Number.isSafeInteger(next[denomination]))
      throw new Error("Currency transaction exceeds the safe integer range");
  }
  return next;
}

export function characterWalletTextKey(
  level: number,
  wallet: CharacterWalletKind,
): string {
  if (!Number.isInteger(level) || level < 1 || level > 30)
    throw new Error("Wallet level must be an integer from 1 through 30");
  const name = wallet === "carried" ? "Carried Money" : "Stored Money";
  return `_PER_LEVEL_${level}_${name}`;
}

const WALLET_TEXT_KEY_PATTERN = /^_PER_LEVEL_\d+_(Carried|Stored) Money$/;

/**
 * True for the per-level wallet keys `characterWalletTextKey` produces. The
 * rules engine never reads currency, so evaluation input can ignore these
 * keys when deciding whether a character's rules-relevant state changed -
 * see `projectBuildForEvaluation`. Kept as an explicit allowlist (rather than
 * excluding "bookkeeping" text keys generically) so a future key that the
 * engine does read can't be silently dropped from evaluation by mistake.
 */
export function isWalletTextKey(key: string): boolean {
  return WALLET_TEXT_KEY_PATTERN.test(key);
}

/**
 * The free-text identity/physical-description/roleplaying-note keys
 * `CharacterDetailsEditor` edits via generic `set-text` commands. Kept in
 * sync with that component by hand, not imported from it - a name added
 * there but missed here only loses the evaluation-skip optimization below,
 * it never causes a wrong rules result, so the duplication fails safe.
 */
const FREEFORM_CHARACTER_DETAIL_TEXT_KEYS = new Set<string>([
  "Name",
  "Player",
  "Company",
  "RPGA",
  "Age",
  "Height",
  "Weight",
  "NOTE_Personality Traits",
  "NOTE_Mannerisms and Appearance",
  "NOTE_Character Background",
  "NOTE_Companions And Allies",
  "NOTE_Session and Campaign Notes",
  "NOTE_RPGA Notes",
]);

/**
 * True for the free-text character detail/note keys above. Confirmed against
 * every `textStrings` read in `rules-engine` (fixed literal keys and
 * `${feature.name} Die`/`_INTERNAL_*`-shaped computed keys, none of which can
 * collide with these) and against the recovered rule corpus's `select`
 * `default="[...]"` references (none name a key in this set) that these
 * fields never feed rules evaluation - see `projectBuildForEvaluation`. The
 * modern sheet model also reads these from the character build directly
 * (`build.textStrings`), not from the evaluated snapshot, so excluding them
 * from evaluation input doesn't affect what's displayed.
 */
export function isFreeformCharacterDetailTextKey(key: string): boolean {
  return FREEFORM_CHARACTER_DETAIL_TEXT_KEYS.has(key);
}

/** True for text keys rules evaluation never reads: wallet amounts and the
 *  free-text details/notes above. */
export function isRulesInertTextKey(key: string): boolean {
  return isWalletTextKey(key) || isFreeformCharacterDetailTextKey(key);
}

/**
 * Resolves the latest defined per-level value at or before `level`. Without
 * a level it is the character's current wallet: the latest value at or
 * below the character's level, the one legacy saves as its CharacterSheet
 * money. Keys left above a lowered level are stale and never read (D097).
 */
export function resolveCharacterWallet(
  build: Pick<CharacterBuild, "effectiveLevel" | "textStrings">,
  wallet: CharacterWalletKind,
  level = currentWalletLevel(build),
): ResolvedCharacterWallet {
  const sourceLevel = walletTextLevel(build.textStrings, wallet, level);
  if (sourceLevel === undefined) return { amount: ZERO_CURRENCY };
  return {
    amount: parseLegacyCurrency(
      build.textStrings[characterWalletTextKey(sourceLevel, wallet)] ?? "",
    ),
    sourceLevel,
  };
}

/** The level the current wallet is read and written at: the character's (D097). */
export function currentWalletLevel(
  build: Pick<CharacterBuild, "effectiveLevel">,
): number {
  return Math.min(30, Math.max(1, Math.floor(build.effectiveLevel)));
}

/**
 * The level of the latest stored wallet text at or before `level` (any
 * level by default), without parsing it; undefined when none is stored.
 */
export function walletTextLevel(
  textStrings: Readonly<Record<string, string>>,
  wallet: CharacterWalletKind,
  level = 30,
): number | undefined {
  if (!Number.isInteger(level) || level < 1 || level > 30)
    throw new Error("Wallet level must be an integer from 1 through 30");
  for (let candidate = level; candidate >= 1; candidate -= 1)
    if (Object.hasOwn(textStrings, characterWalletTextKey(candidate, wallet)))
      return candidate;
  return undefined;
}

export function equippedQuantityFromSlots(
  assignments: readonly EquipmentSlotAssignment[],
): number {
  return new Set(assignments.map(({ quantityIndex }) => quantityIndex)).size;
}

/**
 * Changes a holding's copy count while retaining equipped copies ahead of
 * unequipped copies. Exact slot assignments are reindexed to the remaining
 * contiguous copy indices.
 */
export function inventoryEntryWithQuantity(
  entry: BuildInventoryEntry,
  quantity: number,
): BuildInventoryEntry {
  if (!Number.isSafeInteger(quantity) || quantity < 0)
    throw new Error("Inventory quantity must be a non-negative safe integer");
  if (quantity >= entry.quantity)
    return {
      ...entry,
      quantity,
    };
  if (entry.equippedSlots === undefined)
    return {
      ...entry,
      quantity,
      equippedQuantity: Math.min(entry.equippedQuantity, quantity),
    };

  const equippedIndices = [
    ...new Set(entry.equippedSlots.map(({ quantityIndex }) => quantityIndex)),
  ].sort((left, right) => left - right);
  const equippedSet = new Set(equippedIndices);
  const unequippedIndices = Array.from(
    { length: entry.quantity },
    (_, index) => index,
  ).filter((index) => !equippedSet.has(index));
  const retainedIndices = [
    ...equippedIndices.slice(0, quantity),
    ...unequippedIndices.slice(
      0,
      Math.max(0, quantity - equippedIndices.length),
    ),
  ]
    .sort((left, right) => left - right)
    .slice(0, quantity);
  const reindexed = new Map(
    retainedIndices.map((originalIndex, nextIndex) => [
      originalIndex,
      nextIndex,
    ]),
  );
  const equippedSlots = entry.equippedSlots.flatMap((assignment) => {
    const quantityIndex = reindexed.get(assignment.quantityIndex);
    return quantityIndex === undefined
      ? []
      : [{ ...assignment, quantityIndex }];
  });
  return {
    ...entry,
    quantity,
    equippedQuantity: equippedQuantityFromSlots(equippedSlots),
    equippedSlots,
  };
}

/**
 * The item a holding is: its name and exact elements. Rows with one key are
 * one item, as legacy TallyLoot and the evaluator's aggregation treat them.
 */
export function inventoryHoldingKey(
  entry: Pick<BuildInventoryEntry, "name" | "elements">,
): string {
  return [
    entry.name ?? "",
    ...entry.elements.map(
      (element) =>
        element.definitionId ?? `?${element.type}\u0001${element.name}`,
    ),
  ]
    .join("\0")
    .toLocaleLowerCase();
}

/** A row that is already a concrete holding: owned, with valid counts. */
function concreteHolding(entry: BuildInventoryEntry): boolean {
  return (
    entry.quantity > 0 &&
    entry.equippedQuantity >= 0 &&
    entry.equippedQuantity <= entry.quantity
  );
}

/** A row's slot assignments; an unequipped row without any has none. */
function rowSlots(
  entry: BuildInventoryEntry,
): readonly EquipmentSlotAssignment[] | undefined {
  return entry.equippedSlots ?? (entry.equippedQuantity === 0 ? [] : undefined);
}

/**
 * Folds inventory rows into current holdings, one per item: counts are
 * summed (legacy per-level loot records removals and unequips as negative
 * deltas), overrides merge in row order, and the latest owned row (one with
 * saved element choices first) supplies the elements, name, legality and
 * power-card preference. The first row's ID and level identify the holding. A sum that
 * equips more copies than it owns keeps every equipped copy owned, so it
 * still executes and fills its slot exactly as the evaluator summed it; an
 * item summing to nothing is gone. Exact slot assignments survive only when
 * every row is concrete and carries them, re-indexed across the rows;
 * otherwise the shared loadout resolver places the equipped copies.
 * Already-current holdings are returned unchanged.
 */
export function currentInventoryHoldings(
  rows: readonly BuildInventoryEntry[],
): readonly BuildInventoryEntry[] {
  const groups = new Map<string, BuildInventoryEntry[]>();
  for (const row of rows) {
    const key = inventoryHoldingKey(row);
    const group = groups.get(key);
    if (group === undefined) groups.set(key, [row]);
    else group.push(row);
  }
  let changed = false;
  const holdings = [...groups.values()].flatMap(
    (group): BuildInventoryEntry[] => {
      const first = group[0]!;
      if (group.length === 1 && concreteHolding(first)) return [first];
      changed = true;
      let quantity = 0;
      let equippedQuantity = 0;
      let overrides: Record<string, string> = {};
      for (const row of group) {
        quantity += row.quantity;
        equippedQuantity += row.equippedQuantity;
        overrides = { ...overrides, ...row.overrides };
      }
      equippedQuantity = Math.max(0, equippedQuantity);
      quantity = Math.max(quantity, equippedQuantity);
      if (quantity <= 0) return [];
      const owned = group.filter((row) => row.quantity > 0);
      const representative =
        owned.findLast((row) =>
          row.elements.some(({ children }) => (children?.length ?? 0) > 0),
        ) ??
        owned.at(-1) ??
        group.at(-1)!;
      let equippedSlots: EquipmentSlotAssignment[] | undefined = [];
      let offset = 0;
      for (const row of group) {
        const slots = rowSlots(row);
        if (slots === undefined || !concreteHolding(row)) {
          equippedSlots = undefined;
          break;
        }
        equippedSlots.push(
          ...slots.map((assignment) => ({
            ...assignment,
            quantityIndex: assignment.quantityIndex + offset,
          })),
        );
        offset += row.quantity;
      }
      const { equippedSlots: _slots, ...base } = representative;
      void _slots;
      return [
        {
          ...base,
          id: first.id,
          acquiredLevel: first.acquiredLevel,
          quantity,
          equippedQuantity:
            equippedSlots === undefined
              ? equippedQuantity
              : equippedQuantityFromSlots(equippedSlots),
          ...(equippedSlots === undefined || equippedSlots.length === 0
            ? {}
            : { equippedSlots }),
          overrides,
        },
      ];
    },
  );
  return changed ? holdings : rows;
}

/**
 * Turns stored inventory rows into current holdings. Rows that are not
 * already one concrete holding per item (an imported file's per-level loot
 * transactions) are kept verbatim as the build's inventory history.
 */
export function settleInventory(rows: readonly BuildInventoryEntry[]): {
  readonly inventory: readonly BuildInventoryEntry[];
  readonly inventoryHistory?: readonly BuildInventoryEntry[];
} {
  const inventory = currentInventoryHoldings(rows);
  return inventory === rows
    ? { inventory }
    : { inventory, inventoryHistory: rows };
}

/** Legacy text fields that are also projected into CharacterSheet/Details. */
export const LEGACY_DETAIL_TEXT_MAP = {
  Name: "name",
  Player: "Player",
  Height: "Height",
  Weight: "Weight",
  Age: "Age",
  Company: "Company",
  "NOTE_Personality Traits": "Traits",
  "NOTE_Mannerisms and Appearance": "Appearance",
  "NOTE_Companions And Allies": "Companions",
  "NOTE_Session and Campaign Notes": "Notes",
} as const;

/**
 * Names of the build's selected elements of one type (e.g. "Race", "Class")
 * up to the effective level, read from the authoritative build rather than
 * the import-time snapshot, which goes stale once the build is edited.
 */
export function buildElementNames(
  build: Pick<CharacterBuild, "levels" | "effectiveLevel">,
  type: string,
): string[] {
  const wanted = type.toLocaleLowerCase();
  const names: string[] = [];
  const visit = (occurrence: BuildOccurrence) => {
    if (occurrence.identity.type.toLocaleLowerCase() === wanted)
      names.push(occurrence.identity.name);
    occurrence.children.forEach(visit);
  };
  for (const frame of build.levels)
    if (frame.level <= build.effectiveLevel) visit(frame.root);
  return names;
}

export function detailsWithLegacyTextStrings(
  details: Readonly<Record<string, string>>,
  textStrings: Readonly<Record<string, string>>,
): Record<string, string> {
  const updated = { ...details };
  for (const [textName, detailName] of Object.entries(LEGACY_DETAIL_TEXT_MAP)) {
    if (Object.hasOwn(textStrings, textName))
      updated[detailName] = textStrings[textName] ?? "";
  }
  return updated;
}

export type CharacterCommand =
  | { readonly kind: "batch"; readonly commands: readonly CharacterCommand[] }
  | { readonly kind: "set-effective-level"; readonly level: number }
  | {
      readonly kind: "set-base-ability";
      readonly ability: string;
      readonly value: number;
    }
  | {
      readonly kind: "choose";
      readonly parentId: string;
      readonly index: number;
      readonly occurrence: BuildOccurrence;
    }
  | {
      readonly kind: "remove-occurrence";
      readonly occurrenceId: string;
    }
  | {
      readonly kind: "replace-occurrence";
      readonly occurrenceId: string;
      readonly replacement: BuildOccurrence;
    }
  | {
      readonly kind: "retrain";
      readonly parentId: string;
      readonly index: number;
      readonly replacesId: string;
      readonly replacement: BuildOccurrence;
    }
  | { readonly kind: "put-alternate"; readonly alternate: BuildAlternate }
  | { readonly kind: "add-level"; readonly frame: BuildLevelFrame }
  | { readonly kind: "remove-last-level" }
  | { readonly kind: "put-inventory"; readonly entry: BuildInventoryEntry }
  | { readonly kind: "remove-inventory"; readonly entryId: string }
  | {
      readonly kind: "equip-inventory";
      readonly entryId: string;
      readonly assignments: readonly EquipmentSlotAssignment[];
    }
  | {
      /**
       * Wields a versatile weapon in two hands or one. An equipped holding
       * with exact slots follows at once: two-handed, its first hand-held
       * copy takes both hand slots (displacing what held them); one-handed,
       * it lets go of the off hand.
       */
      readonly kind: "set-inventory-wielding";
      readonly entryId: string;
      readonly twoHanded: boolean;
    }
  | {
      /**
       * Binds an owned augment holding to a host holding, or (null) leaves
       * the host without one. A holding carries one augment, and an augment
       * is in as many hosts as copies are owned: binding it to one more
       * host frees it from the earliest other hosts first, so attaching a
       * single augment elsewhere moves it.
       */
      readonly kind: "set-inventory-augment";
      readonly hostEntryId: string;
      readonly augmentEntryId: string | null;
    }
  | {
      readonly kind: "purchase-inventory";
      /** A new exact holding whose quantity is the purchase count. */
      readonly entry: BuildInventoryEntry;
      /** Per-unit price in copper pieces. */
      readonly priceCopper: number;
    }
  | {
      readonly kind: "sell-inventory";
      /** Sells one unit from the exact holding; entries are never matched by name. */
      readonly entryId: string;
      /** Per-unit list price in copper pieces. */
      readonly priceCopper: number;
      readonly percentage: 20 | 50 | 100;
    }
  | {
      readonly kind: "learn-known";
      readonly entry: BuildKnownEntry;
      /** Market price in copper pieces; 0 when learned free. */
      readonly priceCopper: number;
    }
  | {
      /** An editing control: the rules have no mechanic for forgetting. No refund. */
      readonly kind: "remove-known";
      readonly id: string;
    }
  | {
      /**
       * Gives free items once (legacy GiveFreebees): each gift not yet marked
       * adds its holding at no cost and sets its marker to "Given". A gift
       * never displaces an equipped item, and a marked gift is skipped, so
       * the command is idempotent.
       */
      readonly kind: "give-freebees";
      readonly gifts: readonly FreebeeGift[];
    }
  | {
      readonly kind: "set-text";
      readonly name: string;
      readonly value: string;
    };

function assertEquipmentAssignments(
  quantity: number,
  assignments: readonly EquipmentSlotAssignment[],
): void {
  const knownSlots = new Set<string>(EQUIPMENT_SLOT_IDS);
  const seenSlots = new Set<EquipmentSlotId>();
  for (const assignment of assignments) {
    if (!knownSlots.has(assignment.slot))
      throw new Error(`Unknown equipment slot: ${String(assignment.slot)}`);
    if (
      !Number.isInteger(assignment.quantityIndex) ||
      assignment.quantityIndex < 0 ||
      assignment.quantityIndex >= quantity
    )
      throw new Error("Equipment quantity index is outside the holding");
    if (seenSlots.has(assignment.slot))
      throw new Error(
        `Equipment slot is assigned more than once: ${assignment.slot}`,
      );
    seenSlots.add(assignment.slot);
  }
}

function assertInventoryQuantities(entry: BuildInventoryEntry): void {
  if (
    !Number.isSafeInteger(entry.quantity) ||
    !Number.isSafeInteger(entry.equippedQuantity) ||
    entry.quantity < 0 ||
    entry.equippedQuantity < 0 ||
    entry.equippedQuantity > entry.quantity
  )
    throw new Error("Inventory quantities are invalid");
  if (entry.equippedSlots !== undefined) {
    assertEquipmentAssignments(entry.quantity, entry.equippedSlots);
    if (
      entry.equippedQuantity !== equippedQuantityFromSlots(entry.equippedSlots)
    )
      throw new Error("Equipped quantity does not match equipment slots");
  }
}

function withInventoryWielding(
  build: CharacterBuild,
  entryId: string,
  twoHanded: boolean,
): CharacterBuild {
  const target = exactInventoryEntry(build.inventory, entryId);
  const hands = new Set<EquipmentSlotId>(["main-hand", "off-hand"]);
  let slots = target.equippedSlots;
  if (slots !== undefined) {
    const handCopies = slots
      .filter(({ slot }) => hands.has(slot))
      .map(({ quantityIndex }) => quantityIndex);
    if (twoHanded && handCopies.length > 0) {
      const copy = Math.min(...handCopies);
      slots = [
        ...slots.filter(({ slot }) => !hands.has(slot)),
        { slot: "main-hand", quantityIndex: copy },
        { slot: "off-hand", quantityIndex: copy },
      ];
    } else if (!twoHanded) {
      const mainCopies = new Set(
        slots
          .filter(({ slot }) => slot === "main-hand")
          .map(({ quantityIndex }) => quantityIndex),
      );
      slots = slots.filter(
        ({ slot, quantityIndex }) =>
          slot !== "off-hand" || !mainCopies.has(quantityIndex),
      );
    }
  }
  const occupied = new Set(
    twoHanded ? (slots ?? []).map(({ slot }) => slot) : [],
  );
  return {
    ...build,
    inventory: build.inventory.map((entry) => {
      if (entry.id === entryId)
        return {
          ...entry,
          wieldedTwoHanded: twoHanded,
          ...(slots === undefined
            ? {}
            : {
                equippedSlots: slots,
                equippedQuantity: equippedQuantityFromSlots(slots),
              }),
        };
      if (entry.equippedSlots === undefined || occupied.size === 0)
        return entry;
      const equippedSlots = entry.equippedSlots.filter(
        ({ slot }) => !occupied.has(slot),
      );
      return equippedSlots.length === entry.equippedSlots.length
        ? entry
        : {
            ...entry,
            equippedQuantity: equippedQuantityFromSlots(equippedSlots),
            equippedSlots,
          };
    }),
  };
}

function holdingDefinitionIds(entry: BuildInventoryEntry): readonly string[] {
  return entry.elements.flatMap(({ definitionId }) =>
    definitionId === undefined ? [] : [definitionId],
  );
}

function withInventoryAugment(
  build: CharacterBuild,
  hostEntryId: string,
  augmentEntryId: string | null,
): CharacterBuild {
  const host = exactInventoryEntry(build.inventory, hostEntryId);
  if (augmentEntryId === null)
    return {
      ...build,
      inventory: build.inventory.map((entry) =>
        entry === host ? { ...entry, augmentEntryId: null } : entry,
      ),
    };
  const augment = exactInventoryEntry(build.inventory, augmentEntryId);
  if (augment === host)
    throw new Error("An inventory holding cannot carry itself as an augment");
  if (augment.quantity <= 0)
    throw new Error(`Augment holding is not owned: ${augmentEntryId}`);
  // Every other host keeps it while copies remain, earliest first freed.
  const others = augmentHosts(
    augment,
    build.inventory,
    holdingDefinitionIds,
  ).filter((entry) => entry !== host);
  const freed = new Set(
    others.slice(0, Math.max(0, others.length + 1 - augment.quantity)),
  );
  return {
    ...build,
    inventory: build.inventory.map((entry) =>
      entry === host
        ? { ...entry, augmentEntryId }
        : freed.has(entry)
          ? { ...entry, augmentEntryId: null }
          : entry,
    ),
  };
}

function assertCopperPrice(priceCopper: number): void {
  if (!Number.isSafeInteger(priceCopper) || priceCopper < 0)
    throw new Error("Price must be a non-negative safe integer copper value");
}

function exactInventoryEntry(
  inventory: readonly BuildInventoryEntry[],
  entryId: string,
): BuildInventoryEntry {
  const matches = inventory.filter(({ id }) => id === entryId);
  if (matches.length !== 1)
    throw new Error(
      matches.length === 0
        ? `Inventory entry not found: ${entryId}`
        : `Inventory entry ID is not unique: ${entryId}`,
    );
  return matches[0]!;
}

function multipliedCopper(...factors: readonly number[]): number {
  let result = 1;
  for (const factor of factors) {
    result *= factor;
    if (!Number.isSafeInteger(result))
      throw new Error("Currency transaction exceeds the safe integer range");
  }
  return result;
}

/**
 * The text key a wallet edit writes: the character's level's, which
 * {@link resolveCharacterWallet} reads back first. Legacy stores money per
 * level; players see one wallet (D097).
 */
export function currentWalletTextKey(
  build: Pick<CharacterBuild, "effectiveLevel">,
  wallet: CharacterWalletKind,
): string {
  return characterWalletTextKey(currentWalletLevel(build), wallet);
}

/**
 * Raising the character's level carries the current wallet text verbatim to
 * every level above it up to `level`, as native `D20Workspace.LevelUp`
 * copies each `_PER_LEVEL_<n>_*` text to level n+1. Keys left above a level
 * that was lowered are overwritten, so they never resurface (D097).
 */
function withWalletCarriedUp(
  build: CharacterBuild,
  level: number,
): CharacterBuild {
  const from = currentWalletLevel(build);
  if (level <= from) return build;
  const textStrings = { ...build.textStrings };
  for (const wallet of ["carried", "stored"] as const) {
    const source = walletTextLevel(build.textStrings, wallet, from);
    if (source === undefined) continue;
    const text = build.textStrings[characterWalletTextKey(source, wallet)];
    if (text === undefined) continue;
    for (let target = from + 1; target <= level; target += 1)
      textStrings[characterWalletTextKey(target, wallet)] = text;
  }
  return { ...build, textStrings };
}

function withCurrentWallet(
  build: CharacterBuild,
  wallet: CharacterWalletKind,
  amount: CurrencyAmount,
): CharacterBuild {
  const key = currentWalletTextKey(build, wallet);
  return {
    ...build,
    textStrings: {
      ...build.textStrings,
      [key]: formatLegacyCurrency(amount),
    },
  };
}

function replaceInTree(
  occurrence: BuildOccurrence,
  id: string,
  update: (value: BuildOccurrence) => BuildOccurrence | undefined,
): { readonly value?: BuildOccurrence; readonly found: boolean } {
  if (occurrence.id === id) {
    const value = update(occurrence);
    return value === undefined ? { found: true } : { value, found: true };
  }
  let found = false;
  const children = occurrence.children.flatMap((child) => {
    const result = replaceInTree(child, id, update);
    found ||= result.found;
    return result.value === undefined ? [] : [result.value];
  });
  return found
    ? { value: { ...occurrence, children }, found: true }
    : { value: occurrence, found: false };
}

function updateOccurrence(
  build: CharacterBuild,
  id: string,
  update: (value: BuildOccurrence) => BuildOccurrence | undefined,
): CharacterBuild {
  let found = false;
  const levels = build.levels.map((frame) => {
    const result = replaceInTree(frame.root, id, update);
    found ||= result.found;
    if (result.value === undefined)
      throw new Error("A level root cannot be removed");
    return result.found ? { ...frame, root: result.value } : frame;
  });
  const grabbag = build.grabbag.flatMap((occurrence) => {
    const result = replaceInTree(occurrence, id, update);
    found ||= result.found;
    return result.value === undefined ? [] : [result.value];
  });
  if (!found) throw new Error(`Occurrence not found: ${id}`);
  return { ...build, levels, grabbag };
}

export function applyCharacterCommand(
  build: CharacterBuild,
  command: CharacterCommand,
): CharacterBuild {
  switch (command.kind) {
    case "batch":
      return command.commands.reduce(applyCharacterCommand, build);
    case "set-effective-level": {
      if (
        !Number.isInteger(command.level) ||
        command.level < 1 ||
        command.level > 30
      )
        throw new Error("Effective level must be an integer from 1 through 30");
      return {
        ...withWalletCarriedUp(build, command.level),
        effectiveLevel: command.level,
      };
    }
    case "set-base-ability": {
      if (!Number.isInteger(command.value) || command.value < 1)
        throw new Error("Ability scores must be positive integers");
      return {
        ...build,
        baseAbilities: {
          ...build.baseAbilities,
          [command.ability]: command.value,
        },
      };
    }
    case "choose":
      if (!Number.isInteger(command.index) || command.index < 0)
        throw new Error("Choice index must be a non-negative integer");
      return updateOccurrence(build, command.parentId, (parent) => {
        const children = [...parent.children];
        children[command.index] = command.occurrence;
        return { ...parent, children };
      });
    case "remove-occurrence":
      return updateOccurrence(build, command.occurrenceId, () => undefined);
    case "replace-occurrence":
      return updateOccurrence(build, command.occurrenceId, (current) => ({
        ...command.replacement,
        replacesId: current.id,
      }));
    case "retrain":
      return applyCharacterCommand(build, {
        kind: "choose",
        parentId: command.parentId,
        index: command.index,
        occurrence: {
          ...command.replacement,
          replacesId: command.replacesId,
        },
      });
    case "put-alternate": {
      const index = build.alternates.findIndex(
        (alternate) => alternate.id === command.alternate.id,
      );
      if (index < 0)
        return {
          ...build,
          alternates: [...build.alternates, command.alternate],
        };
      const alternates = [...build.alternates];
      alternates[index] = command.alternate;
      return { ...build, alternates };
    }
    case "add-level": {
      const expected = build.levels.length + 1;
      if (command.frame.level !== expected || expected > 30)
        throw new Error(`The next level frame must be level ${expected}`);
      return {
        ...withWalletCarriedUp(build, expected),
        effectiveLevel: expected,
        levels: [...build.levels, command.frame],
      };
    }
    case "remove-last-level": {
      if (build.levels.length <= 1)
        throw new Error("Level 1 cannot be removed");
      const levels = build.levels.slice(0, -1);
      return {
        ...build,
        levels,
        effectiveLevel: Math.min(build.effectiveLevel, levels.length),
      };
    }
    case "put-inventory": {
      assertInventoryQuantities(command.entry);
      if (command.entry.quantity === 0)
        return {
          ...build,
          inventory: build.inventory.filter(
            (entry) => entry.id !== command.entry.id,
          ),
        };
      const index = build.inventory.findIndex(
        (entry) => entry.id === command.entry.id,
      );
      const inventory = [...build.inventory];
      if (index < 0) inventory.push(command.entry);
      else inventory[index] = command.entry;
      // A holding that becomes (or duplicates) another owned item joins it.
      return {
        ...build,
        inventory: currentInventoryHoldings(inventory),
      };
    }
    case "remove-inventory":
      return {
        ...build,
        inventory: build.inventory.filter(
          (entry) => entry.id !== command.entryId,
        ),
      };
    case "equip-inventory": {
      const target = exactInventoryEntry(build.inventory, command.entryId);
      assertEquipmentAssignments(target.quantity, command.assignments);
      const occupiedSlots = new Set(
        command.assignments.map(({ slot }) => slot),
      );
      return {
        ...build,
        inventory: build.inventory.map((entry) => {
          if (entry.id === command.entryId) {
            return {
              ...entry,
              equippedQuantity: equippedQuantityFromSlots(command.assignments),
              equippedSlots: [...command.assignments],
            };
          }
          if (entry.equippedSlots === undefined) return entry;
          const equippedSlots = entry.equippedSlots.filter(
            ({ slot }) => !occupiedSlots.has(slot),
          );
          return equippedSlots.length === entry.equippedSlots.length
            ? entry
            : {
                ...entry,
                equippedQuantity: equippedQuantityFromSlots(equippedSlots),
                equippedSlots,
              };
        }),
      };
    }
    case "set-inventory-wielding":
      return withInventoryWielding(build, command.entryId, command.twoHanded);
    case "set-inventory-augment":
      return withInventoryAugment(
        build,
        command.hostEntryId,
        command.augmentEntryId,
      );
    case "purchase-inventory": {
      assertCopperPrice(command.priceCopper);
      assertInventoryQuantities(command.entry);
      if (command.entry.quantity <= 0)
        throw new Error("Purchase count must be a positive integer");
      if (
        command.entry.equippedQuantity !== 0 ||
        (command.entry.equippedSlots?.length ?? 0) !== 0
      )
        throw new Error("Purchased inventory must initially be unequipped");
      if (build.inventory.some(({ id }) => id === command.entry.id))
        throw new Error(`Inventory entry already exists: ${command.entry.id}`);

      const cost = multipliedCopper(
        command.priceCopper,
        command.entry.quantity,
      );
      const carried = resolveCharacterWallet(build, "carried").amount;
      const stored = resolveCharacterWallet(build, "stored").amount;
      const paid = payWalletCopper(carried, stored, cost);
      // Buying an item the character owns adds copies to that holding, which
      // keeps its equipped slots, saved choices and preferences.
      const key = inventoryHoldingKey(command.entry);
      const ownedIndex = build.inventory.findIndex(
        (entry) => inventoryHoldingKey(entry) === key,
      );
      const inventory = [...build.inventory];
      if (ownedIndex < 0) inventory.push(command.entry);
      else {
        const owned = inventory[ownedIndex]!;
        inventory[ownedIndex] = {
          ...owned,
          quantity: owned.quantity + command.entry.quantity,
        };
      }
      let updated: CharacterBuild = { ...build, inventory };
      if (cost > 0) {
        updated = withCurrentWallet(updated, "carried", paid.carried);
        if (cost > currencyToCopper(carried))
          updated = withCurrentWallet(updated, "stored", paid.stored);
      }
      return updated;
    }
    case "sell-inventory": {
      assertCopperPrice(command.priceCopper);
      if (![20, 50, 100].includes(command.percentage))
        throw new Error("Sale percentage must be 20, 50, or 100");
      const entry = exactInventoryEntry(build.inventory, command.entryId);
      if (!Number.isSafeInteger(entry.quantity) || entry.quantity <= 0)
        throw new Error("Sale count must be a positive integer");
      const proceeds = Math.floor(
        multipliedCopper(command.priceCopper, command.percentage) / 100,
      );
      const carried = receiveWalletCopper(
        resolveCharacterWallet(build, "carried").amount,
        proceeds,
      );
      const updatedEntry = inventoryEntryWithQuantity(
        entry,
        entry.quantity - 1,
      );
      const inventory = build.inventory.flatMap((current) => {
        if (current.id !== command.entryId) return [current];
        return updatedEntry.quantity === 0 ? [] : [updatedEntry];
      });
      const updated: CharacterBuild = {
        ...build,
        inventory,
      };
      return proceeds === 0
        ? updated
        : withCurrentWallet(updated, "carried", carried);
    }
    case "learn-known": {
      assertCopperPrice(command.priceCopper);
      const { entry } = command;
      if (
        !Number.isInteger(entry.acquiredLevel) ||
        entry.acquiredLevel < 1 ||
        entry.acquiredLevel > 30
      )
        throw new Error(
          "Known entries must be learned at a level from 1 to 30",
        );
      if (entry.element.type.trim().toLocaleLowerCase() !== "ritual")
        throw new Error("Only Ritual records can be learned");
      if (
        entry.allowance !== undefined &&
        (entry.acquisition !== "free" || command.priceCopper > 0)
      )
        throw new Error("Only free entries use a free-ritual allowance");
      if (build.known.some(({ id }) => id === entry.id))
        throw new Error(`Known entry already exists: ${entry.id}`);
      if (isKnownElementStored(build, entry.element))
        throw new Error(`Already known: ${entry.element.name}`);
      const carried = resolveCharacterWallet(build, "carried").amount;
      const stored = resolveCharacterWallet(build, "stored").amount;
      const paid = payWalletCopper(carried, stored, command.priceCopper);
      let updated: CharacterBuild = {
        ...build,
        known: [...build.known, entry],
      };
      if (command.priceCopper > 0) {
        updated = withCurrentWallet(updated, "carried", paid.carried);
        if (command.priceCopper > currencyToCopper(carried))
          updated = withCurrentWallet(updated, "stored", paid.stored);
      }
      return updated;
    }
    case "remove-known": {
      if (!build.known.some(({ id }) => id === command.id))
        throw new Error(`Known entry not found: ${command.id}`);
      return {
        ...build,
        known: build.known.filter(({ id }) => id !== command.id),
      };
    }
    case "give-freebees": {
      let inventory = build.inventory;
      const textStrings = { ...build.textStrings };
      for (const gift of command.gifts) {
        if (gift.marker.trim() === "")
          throw new Error("A free item needs its marker");
        if (isFreebeeGiven(textStrings, gift.marker)) continue;
        const { entry } = gift;
        if (entry !== undefined) {
          assertInventoryQuantities(entry);
          if (entry.quantity <= 0)
            throw new Error("A free item must have a positive quantity");
          if (inventory.some(({ id }) => id === entry.id))
            throw new Error(`Inventory entry already exists: ${entry.id}`);
          const occupied = new Set(
            inventory.flatMap(({ equippedSlots }) =>
              (equippedSlots ?? []).map(({ slot }) => slot),
            ),
          );
          const { equippedSlots: requested, ...holding } = entry;
          const equippedSlots = (requested ?? []).filter(
            ({ slot }) => !occupied.has(slot),
          );
          inventory = [
            ...inventory,
            equippedSlots.length === 0
              ? { ...holding, equippedQuantity: 0 }
              : {
                  ...holding,
                  equippedSlots,
                  equippedQuantity: equippedQuantityFromSlots(equippedSlots),
                },
          ];
        }
        textStrings[gift.marker] = FREEBEE_GIVEN;
      }
      return {
        ...build,
        inventory: currentInventoryHoldings(inventory),
        textStrings,
      };
    }
    case "set-text": {
      const textStrings = { ...build.textStrings };
      if (command.value.length === 0) delete textStrings[command.name];
      else textStrings[command.name] = command.value;
      return { ...build, textStrings };
    }
  }
}

export class CharacterTransaction {
  #past: CharacterBuild[] = [];
  #future: CharacterBuild[] = [];
  #current: CharacterBuild;

  constructor(initial: CharacterBuild) {
    this.#current = initial;
  }

  get current(): CharacterBuild {
    return this.#current;
  }
  get canUndo(): boolean {
    return this.#past.length > 0;
  }
  get canRedo(): boolean {
    return this.#future.length > 0;
  }

  dispatch(command: CharacterCommand): CharacterBuild {
    const next = applyCharacterCommand(this.#current, command);
    this.#past.push(this.#current);
    this.#future = [];
    this.#current = next;
    return next;
  }

  /**
   * Applies a follow-up of the current state into the same history step
   * (free items the last edit entitles the character to), so undoing that
   * edit also undoes the follow-up instead of re-triggering it. Redo keeps
   * its states.
   */
  amend(command: CharacterCommand): CharacterBuild {
    this.#current = applyCharacterCommand(this.#current, command);
    return this.#current;
  }

  undo(): CharacterBuild {
    const previous = this.#past.pop();
    if (previous === undefined) return this.#current;
    this.#future.push(this.#current);
    this.#current = previous;
    return previous;
  }

  redo(): CharacterBuild {
    const next = this.#future.pop();
    if (next === undefined) return this.#current;
    this.#past.push(this.#current);
    this.#current = next;
    return next;
  }
}
