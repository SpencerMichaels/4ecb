import {
  POWER_TEXT_FIELD,
  namesSummonedCreature,
  parseAttackField,
  parsePowerFieldBonuses,
  parseHitField,
  parseRecoveries,
  powerAttackSlots,
  readPowerTextStore,
  type AttackFieldIr,
  type ContentEntity,
  type HitFieldIr,
  type PowerAttackSlot,
  type PowerFieldBonuses,
  type PowerRecoveryIr,
  type PowerTextStore,
} from "@4ecb/content-domain";

/**
 * The parsed power texts the pack stores (`_Power Text IR`, built by the
 * legacy-wotc import): the engine reads a field's effective text here and
 * never parses pack prose. Text the pack does not carry is parsed here,
 * memoized by text: a pack built before the field, a house rule's
 * `modify`, or an engine-constructed line (Defender's Gambit, Chilling
 * Cloud).
 */

const storeCache = new Map<string, PowerTextStore | null>();

function cachedStore(entity: ContentEntity): PowerTextStore | undefined {
  // Keyed by the stored JSON itself: identical for every copy of the record.
  const raw = entity.specifics.find(
    (specific) => specific.name === POWER_TEXT_FIELD,
  )?.value;
  if (raw === undefined) return undefined;
  let store = storeCache.get(raw);
  if (store === undefined) {
    store = readPowerTextStore(entity.specifics) ?? null;
    if (storeCache.size >= 50_000) storeCache.clear();
    storeCache.set(raw, store);
  }
  return store ?? undefined;
}

const attackFallback = new Map<string, AttackFieldIr>();
const hitFallback = new Map<string, HitFieldIr>();
const recoveryFallback = new Map<string, readonly PowerRecoveryIr[]>();

function memo<T>(cache: Map<string, T>, text: string, parse: () => T): T {
  let value = cache.get(text);
  if (value === undefined) {
    value = parse();
    if (cache.size >= 20_000) cache.clear();
    cache.set(text, value);
  }
  return value;
}

/** A power's parsed texts: its own stored field, then the stored fields
 *  of the records whose `modify` may have supplied the text. */
export interface PowerTexts {
  readonly slots: readonly PowerAttackSlot[];
  /** A field names a "summoned creature". */
  readonly summonedCreature: boolean;
  /** Its native field riders. */
  readonly fieldBonuses: PowerFieldBonuses;
  attack(text: string): AttackFieldIr;
  hit(text: string): HitFieldIr;
  recoveries(text: string): readonly PowerRecoveryIr[];
}

export function powerTexts(
  power: ContentEntity,
  providers: readonly ContentEntity[] = [],
): PowerTexts {
  const own = cachedStore(power);
  const stores = [own, ...providers.map(cachedStore)].filter(
    (store): store is PowerTextStore => store !== undefined,
  );
  const stored = <K extends "attack" | "hit" | "recoveries">(
    text: string,
    facet: K,
  ) => {
    for (const store of stores) {
      if (!Object.hasOwn(store.texts, text)) continue;
      const value = store.texts[text]?.[facet];
      if (value !== undefined) return value;
    }
    return undefined;
  };
  return {
    slots:
      own === undefined ? powerAttackSlots(power.specifics) : (own.slots ?? []),
    summonedCreature:
      own === undefined
        ? namesSummonedCreature(power.specifics)
        : own.summonedCreature === true,
    fieldBonuses:
      own === undefined
        ? parsePowerFieldBonuses(power.specifics)
        : (own.fieldBonuses ?? {}),
    attack: (text) =>
      stored(text, "attack") ??
      memo(attackFallback, text, () => parseAttackField(text)),
    hit: (text) =>
      stored(text, "hit") ?? memo(hitFallback, text, () => parseHitField(text)),
    recoveries: (text) =>
      stored(text, "recoveries") ??
      memo(recoveryFallback, text, () => parseRecoveries(text)),
  };
}
