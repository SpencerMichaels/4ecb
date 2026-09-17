export type BuildLegality = "rules-legal" | "houserule";

export interface BuildElementIdentity {
  readonly definitionId?: string;
  readonly name: string;
  readonly type: string;
  readonly url?: string;
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

/** Formats an exact inventory holding without exposing its base/enchantment split. */
export function formatInventoryItemName(
  elements: readonly Pick<BuildElementIdentity, "name" | "type">[],
  customName?: string,
): string {
  const preservedName = customName?.trim();
  if (preservedName) return preservedName;

  const normalized = elements.map(({ name, type }) => ({
    name,
    type: type.toLocaleLowerCase(),
  }));
  const base = normalized.find(({ type }) =>
    ["armor", "weapon", "superior implement"].includes(type),
  );
  const enchantment = normalized.find(({ type }) => type === "magic item");
  if (base !== undefined && enchantment !== undefined) {
    if (
      base.type === "armor" &&
      /\bshield\b/iu.test(base.name) &&
      /shield/iu.test(enchantment.name)
    ) {
      const baseName = base.name.replace(/\b[a-z]/gu, (letter) =>
        letter.toLocaleUpperCase(),
      );
      const stem = enchantment.name
        .trim()
        .replace(/\s+\((?:heroic|paragon|epic) tier\)$/iu, "");
      const composed = /\bshield\b/iu.test(stem)
        ? stem.replace(/\bshield\b/iu, baseName)
        : `${stem} ${baseName}`;
      return composed
        .replaceAll(/\s+/gu, " ")
        .trim()
        .replace(/^[a-z]/u, (letter) => letter.toLocaleUpperCase());
    }

    const enhanced = /^(.*?)\s+\+(\d+)$/u.exec(enchantment.name.trim());
    if (enhanced !== null) {
      const stem = enhanced[1]!.trim();
      const bonus = enhanced[2]!;
      const generic =
        base.type === "armor"
          ? "armor"
          : base.type === "weapon"
            ? "weapon"
            : "implement";
      let composed: string;
      if (stem.toLocaleLowerCase() === `magic ${generic}`) {
        composed = base.name;
      } else {
        const replaceable =
          base.type === "superior implement"
            ? /\b(?:holy symbol|ki focus|implement|symbol|orb|rod|staff|tome|totem|wand)\b/iu
            : new RegExp(`\\b${generic}\\b`, "iu");
        composed = replaceable.test(stem)
          ? stem.replace(replaceable, base.name)
          : `${stem} ${base.name}`;
      }
      return `+${bonus} ${composed.replaceAll(/\s+/gu, " ").trim()}`;
    }
  }

  return (
    normalized
      .map(({ name }) => name)
      .filter(Boolean)
      .join(" + ") || "Unnamed item"
  );
}

export interface BuildAlternate {
  readonly id: string;
  readonly selectName: string;
  readonly provider: BuildElementIdentity;
  readonly choice: BuildOccurrence;
}

export interface CharacterBuild {
  readonly formatVersion: 1;
  readonly effectiveLevel: number;
  readonly levels: readonly BuildLevelFrame[];
  readonly grabbag: readonly BuildOccurrence[];
  readonly inventory: readonly BuildInventoryEntry[];
  readonly alternates: readonly BuildAlternate[];
  readonly baseAbilities: Readonly<Record<string, number>>;
  readonly textStrings: Readonly<Record<string, string>>;
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

export function characterWalletTextKey(
  level: number,
  wallet: CharacterWalletKind,
): string {
  if (!Number.isInteger(level) || level < 1 || level > 30)
    throw new Error("Wallet level must be an integer from 1 through 30");
  const name = wallet === "carried" ? "Carried Money" : "Stored Money";
  return `_PER_LEVEL_${level}_${name}`;
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

function withCurrentWalletCopper(
  build: CharacterBuild,
  wallet: CharacterWalletKind,
  copper: number,
): CharacterBuild {
  const key = characterWalletTextKey(build.effectiveLevel, wallet);
  return {
    ...build,
    textStrings: {
      ...build.textStrings,
      [key]: formatLegacyCurrency(currencyFromCopper(copper)),
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
      return {
        ...build,
        inventory: [
          ...build.inventory.filter((entry) => entry.id !== command.entry.id),
          command.entry,
        ],
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
      const carried = currencyToCopper(
        resolveCharacterWallet(build, "carried").amount,
      );
      const stored = currencyToCopper(
        resolveCharacterWallet(build, "stored").amount,
      );
      const available = carried + stored;
      if (!Number.isSafeInteger(available))
        throw new Error("Currency transaction exceeds the safe integer range");
      if (cost > available) throw new Error("Insufficient currency");
      const carriedAfter = Math.max(0, carried - cost);
      const storedAfter = stored - Math.max(0, cost - carried);
      let updated: CharacterBuild = {
        ...build,
        inventory: [...build.inventory, command.entry],
      };
      if (cost > 0) {
        updated = withCurrentWalletCopper(updated, "carried", carriedAfter);
        if (cost > carried)
          updated = withCurrentWalletCopper(updated, "stored", storedAfter);
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
      const carried = currencyToCopper(
        resolveCharacterWallet(build, "carried").amount,
      );
      if (!Number.isSafeInteger(carried + proceeds))
        throw new Error("Currency transaction exceeds the safe integer range");
      const quantity = entry.quantity - 1;
      const equippedSlots = entry.equippedSlots?.filter(
        ({ quantityIndex }) => quantityIndex < quantity,
      );
      const inventory = build.inventory.flatMap((current) => {
        if (current.id !== command.entryId) return [current];
        if (quantity === 0) return [];
        return [
          {
            ...current,
            quantity,
            equippedQuantity:
              equippedSlots === undefined
                ? Math.min(current.equippedQuantity, quantity)
                : equippedQuantityFromSlots(equippedSlots),
            ...(equippedSlots === undefined
              ? {}
              : {
                  equippedSlots,
                }),
          },
        ];
      });
      const updated: CharacterBuild = {
        ...build,
        inventory,
      };
      return proceeds === 0
        ? updated
        : withCurrentWalletCopper(updated, "carried", carried + proceeds);
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
