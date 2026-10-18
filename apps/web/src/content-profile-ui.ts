import type {
  ContentProfileLayer,
  InstalledContentPack,
} from "@4ecb/browser-storage";

/** The browser keeps one active content profile under this identity. */
export const ACTIVE_PROFILE_ID = "browser-active-profile";
export const ACTIVE_PROFILE_NAME = "Active browser content profile";

/** One row of the Settings content table. */
export interface ContentRow extends ContentProfileLayer {
  /** The pack name, qualified by its ID only when two packs share a name. */
  readonly label: string;
  readonly origin: "server" | "personal";
  readonly enabled: boolean;
  /** Whether the server currently advertises this exact pack. */
  readonly advertised: boolean;
}

export const layerKey = ({ packId, contentDigest }: ContentProfileLayer) =>
  `${packId}:${contentDigest}`;

export function sameProfileLayers(
  left: readonly ContentProfileLayer[],
  right: readonly ContentProfileLayer[],
): boolean {
  return (
    left.length === right.length &&
    left.every((layer, index) => {
      const other = right[index];
      return other !== undefined && layerKey(layer) === layerKey(other);
    })
  );
}

/**
 * Every installed source pack in precedence order: the server's packs first
 * (the repository requires them below personal packs), then the rest in the
 * remembered order, with enabled packs keeping their active order.
 */
export function contentRows(
  installed: readonly InstalledContentPack[],
  activeLayers: readonly ContentProfileLayer[],
  advertised: readonly ContentProfileLayer[],
  savedOrder: readonly string[] = [],
): ContentRow[] {
  const sources = installed.filter(({ origin }) => origin !== "profile");
  const nameCounts = new Map<string, number>();
  for (const { manifest } of sources)
    nameCounts.set(manifest.name, (nameCounts.get(manifest.name) ?? 0) + 1);
  const active = new Map(
    activeLayers.map((layer, index) => [layerKey(layer), index]),
  );
  const saved = new Map(savedOrder.map((key, index) => [key, index]));
  const advertisedKeys = advertised.map(layerKey);
  const rows = sources.map(({ manifest, origin }): ContentRow => {
    const key = layerKey(manifest);
    return {
      packId: manifest.packId,
      contentDigest: manifest.contentDigest,
      label:
        (nameCounts.get(manifest.name) ?? 0) > 1
          ? `${manifest.name} (${manifest.packId})`
          : manifest.name,
      origin: origin === "server" ? "server" : "personal",
      enabled: active.has(key),
      advertised: advertisedKeys.includes(key),
    };
  });
  const rank = (row: ContentRow): [number, number, number] => {
    const key = layerKey(row);
    return [
      row.origin === "server" ? 0 : 1,
      saved.get(key) ?? (active.has(key) ? -1 : Number.MAX_SAFE_INTEGER),
      active.get(key) ?? Number.MAX_SAFE_INTEGER,
    ];
  };
  return rows.sort((left, right) => {
    const [a, b] = [rank(left), rank(right)];
    return (
      a[0] - b[0] ||
      a[1] - b[1] ||
      a[2] - b[2] ||
      left.label.localeCompare(right.label)
    );
  });
}

/** The layers to activate: enabled rows, in table order. */
export function enabledLayers(
  rows: readonly ContentRow[],
): ContentProfileLayer[] {
  return rows
    .filter(({ enabled }) => enabled)
    .map(({ packId, contentDigest }) => ({ packId, contentDigest }));
}

/** Moves a row, keeping the server's packs above personal packs. */
export function moveRow(
  rows: readonly ContentRow[],
  from: number,
  to: number,
): ContentRow[] {
  const moved = rows[from];
  if (moved === undefined || to < 0 || to >= rows.length || from === to)
    return [...rows];
  const result = [...rows];
  result.splice(from, 1);
  result.splice(to, 0, moved);
  const serverCount = rows.filter(({ origin }) => origin === "server").length;
  return result.every(
    ({ origin }, index) => (origin === "server") === index < serverCount,
  )
    ? result
    : [...rows];
}

/** Rows with one changed. */
export function updateRow(
  rows: readonly ContentRow[],
  target: ContentProfileLayer,
  change: Partial<Pick<ContentRow, "enabled">>,
): ContentRow[] {
  return rows.map((row) =>
    layerKey(row) === layerKey(target) ? { ...row, ...change } : row,
  );
}

/** Rows where `replacement` takes `target`'s place and on/off state. */
export function replaceRow(
  rows: readonly ContentRow[],
  target: ContentProfileLayer,
  replacement: ContentRow,
): ContentRow[] {
  const old = rows.find((row) => layerKey(row) === layerKey(target));
  if (old === undefined) return [...rows];
  return rows
    .filter((row) => layerKey(row) !== layerKey(replacement))
    .map((row) =>
      layerKey(row) === layerKey(target)
        ? { ...replacement, enabled: old.enabled }
        : row,
    );
}
