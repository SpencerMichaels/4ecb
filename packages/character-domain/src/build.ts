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

export const CHARACTER_BUILD_FORMAT_VERSION = 2 as const;

export interface CharacterBuild {
  readonly formatVersion: typeof CHARACTER_BUILD_FORMAT_VERSION;
  readonly effectiveLevel: number;
  readonly levels: readonly BuildLevelFrame[];
  readonly grabbag: readonly BuildOccurrence[];
  readonly inventory: readonly BuildInventoryEntry[];
  /** Learned rituals, alchemical formulas and martial practices. */
  readonly known: readonly BuildKnownEntry[];
  readonly alternates: readonly BuildAlternate[];
  readonly baseAbilities: Readonly<Record<string, number>>;
  readonly textStrings: Readonly<Record<string, string>>;
}

/** A saved build from before known records left the inventory. */
export interface CharacterBuildV1 extends Omit<
  CharacterBuild,
  "formatVersion" | "known"
> {
  readonly formatVersion: 1;
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
 * count (`count="0"`) is not known; it stays in the inventory so its record
 * is still exported.
 */
export function separateKnownHoldings(
  inventory: readonly BuildInventoryEntry[],
): {
  readonly inventory: readonly BuildInventoryEntry[];
  readonly known: readonly BuildKnownEntry[];
} {
  const known: BuildKnownEntry[] = [];
  const remaining: BuildInventoryEntry[] = [];
  for (const entry of inventory) {
    if (isKnownRecordHolding(entry) && entry.quantity > 0)
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
  build: CharacterBuild | CharacterBuildV1,
): CharacterBuild {
  if (build.formatVersion === CHARACTER_BUILD_FORMAT_VERSION) return build;
  const { inventory, known } = separateKnownHoldings(build.inventory);
  return {
    ...build,
    formatVersion: CHARACTER_BUILD_FORMAT_VERSION,
    inventory,
    known,
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

/** Resolves the latest defined per-level value at or before the requested level. */
export function resolveCharacterWallet(
  build: CharacterBuild,
  wallet: CharacterWalletKind,
  level = build.effectiveLevel,
): ResolvedCharacterWallet {
  if (!Number.isInteger(level) || level < 1 || level > 30)
    throw new Error("Wallet level must be an integer from 1 through 30");
  for (let candidate = level; candidate >= 1; candidate -= 1) {
    const key = characterWalletTextKey(candidate, wallet);
    if (Object.hasOwn(build.textStrings, key)) {
      return {
        amount: parseLegacyCurrency(build.textStrings[key] ?? ""),
        sourceLevel: candidate,
      };
    }
  }
  return { amount: ZERO_CURRENCY };
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

function withCurrentWallet(
  build: CharacterBuild,
  wallet: CharacterWalletKind,
  amount: CurrencyAmount,
): CharacterBuild {
  const key = characterWalletTextKey(build.effectiveLevel, wallet);
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
      return { ...build, effectiveLevel: command.level };
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
        ...build,
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
      if (index < 0)
        return {
          ...build,
          inventory: [...build.inventory, command.entry],
        };
      const inventory = [...build.inventory];
      inventory[index] = command.entry;
      return {
        ...build,
        inventory,
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
      let updated: CharacterBuild = {
        ...build,
        inventory: [...build.inventory, command.entry],
      };
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
      return { ...build, inventory, textStrings };
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
