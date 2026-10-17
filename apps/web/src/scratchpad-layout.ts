export interface TrackingMeasurements {
  readonly encounter: readonly number[];
  readonly daily: readonly number[];
  readonly consumables?: readonly number[];
  readonly consumableOverhead?: number;
  readonly encounterOverhead: number;
  readonly dailyOverhead: number;
  readonly gap: number;
  readonly sideBySide?: boolean;
}
export interface TrackingPage {
  readonly encounterStart: number;
  readonly encounterEnd: number;
  readonly dailyStart: number;
  readonly dailyEnd: number;
  readonly consumableStart?: number;
  readonly consumableEnd?: number;
  readonly oversized?: boolean;
}

/** Measure rows at each page's actual column width; never shrink tracking text.
 * Alternate opportunities to add encounter/daily rows so neither list starves.
 * Shared-use groups are indivisible. Oversized custom groups remain explicit. */
export function paginateTracking(
  first: TrackingMeasurements,
  continuation: TrackingMeasurements,
  firstCapacity: number,
  continuationCapacity: number,
  captionHeight: number,
): readonly TrackingPage[] {
  const pages: TrackingPage[] = [];
  let encounterStart = 0,
    dailyStart = 0,
    consumableStart = 0;
  do {
    const m = pages.length ? continuation : first;
    let capacity = Math.max(
      0,
      pages.length ? continuationCapacity : firstCapacity,
    );
    const encounterRemaining = m.encounter.slice(encounterStart);
    const dailyRemaining = m.daily.slice(dailyStart);
    const consumableRemaining = (m.consumables ?? []).slice(consumableStart);
    const height = (
      encounterHeight: number,
      dailyHeight: number,
      consumableHeight = 0,
    ) =>
      m.sideBySide
        ? Math.max(
            encounterHeight,
            dailyHeight +
              consumableHeight +
              (dailyHeight && consumableHeight ? m.gap : 0),
          )
        : encounterHeight +
          dailyHeight +
          consumableHeight +
          Math.max(
            0,
            [encounterHeight, dailyHeight, consumableHeight].filter(Boolean)
              .length - 1,
          ) *
            m.gap;
    const total = height(
      encounterRemaining.reduce((a, b) => a + b, 0) +
        (encounterRemaining.length ? m.encounterOverhead : 0),
      dailyRemaining.reduce((a, b) => a + b, 0) +
        (dailyRemaining.length ? m.dailyOverhead : 0),
      consumableRemaining.reduce((a, b) => a + b, 0) +
        (consumableRemaining.length ? (m.consumableOverhead ?? 0) : 0),
    );
    if (!pages.length && total > capacity)
      capacity = Math.max(0, capacity - captionHeight);
    let encounterEnd = encounterStart,
      dailyEnd = dailyStart,
      consumableEnd = consumableStart,
      encounterHeight = 0,
      dailyHeight = 0,
      consumableHeight = 0,
      progressed = true;
    while (progressed) {
      progressed = false;
      if (encounterEnd < m.encounter.length) {
        const cost =
          m.encounter[encounterEnd]! +
          (encounterEnd === encounterStart ? m.encounterOverhead : 0);
        if (
          height(encounterHeight + cost, dailyHeight, consumableHeight) <=
          capacity
        ) {
          encounterHeight += cost;
          encounterEnd++;
          progressed = true;
        }
      }
      if (dailyEnd < m.daily.length) {
        const cost =
          m.daily[dailyEnd]! + (dailyEnd === dailyStart ? m.dailyOverhead : 0);
        if (
          height(encounterHeight, dailyHeight + cost, consumableHeight) <=
          capacity
        ) {
          dailyHeight += cost;
          dailyEnd++;
          progressed = true;
        }
      }
      if (consumableEnd < (m.consumables?.length ?? 0)) {
        const cost =
          m.consumables![consumableEnd]! +
          (consumableEnd === consumableStart ? (m.consumableOverhead ?? 0) : 0);
        if (
          height(encounterHeight, dailyHeight, consumableHeight + cost) <=
          capacity
        ) {
          consumableHeight += cost;
          consumableEnd++;
          progressed = true;
        }
      }
    }
    const oversized =
      pages.length > 0 &&
      encounterEnd === encounterStart &&
      dailyEnd === dailyStart &&
      consumableEnd === consumableStart;
    if (oversized) {
      if (encounterEnd < m.encounter.length) encounterEnd++;
      else if (dailyEnd < m.daily.length) dailyEnd++;
      else if (consumableEnd < (m.consumables?.length ?? 0)) consumableEnd++;
    }
    pages.push({
      encounterStart,
      encounterEnd,
      dailyStart,
      dailyEnd,
      ...(first.consumables === undefined
        ? {}
        : { consumableStart, consumableEnd }),
      ...(oversized ? { oversized: true } : {}),
    });
    encounterStart = encounterEnd;
    dailyStart = dailyEnd;
    consumableStart = consumableEnd;
  } while (
    encounterStart < first.encounter.length ||
    dailyStart < first.daily.length ||
    consumableStart < (first.consumables?.length ?? 0)
  );
  return pages;
}

/** Include inter-cell gaps; each box must be at least as wide as it is tall. */
export function surgeTrackColumns(
  width: number,
  height: number,
  gap: number,
): number {
  return Math.max(1, Math.floor((width + gap) / (height + gap)));
}

export function surgeTrackRows(
  total: number,
  columns: number,
): readonly (readonly number[])[] {
  const count = Math.min(100, Math.max(0, Math.floor(total)));
  const width = Math.max(1, Math.floor(columns));
  return Array.from({ length: Math.ceil(count / width) }, (_, row) =>
    Array.from(
      { length: Math.min(width, count - row * width) },
      (_, cell) => total - row * width - cell,
    ),
  );
}
