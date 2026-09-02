import type {
  ContentProfileLayer,
  InstalledContentPack,
} from "@4ecb/browser-storage";

export interface ProfileLayerView extends ContentProfileLayer {
  readonly name: string;
  readonly origin: "server" | "personal";
  readonly available: boolean;
}

export function buildProfileLayerViews(
  layers: readonly ContentProfileLayer[],
  installed: readonly InstalledContentPack[],
  serverPackIds: ReadonlySet<string> = new Set(),
): ProfileLayerView[] {
  return layers.map((layer) => {
    const pack = installed.find(
      ({ manifest }) =>
        manifest.packId === layer.packId &&
        manifest.contentDigest === layer.contentDigest,
    );
    return {
      ...layer,
      name: pack?.manifest.name ?? layer.packId,
      origin:
        serverPackIds.has(layer.packId) || pack?.origin === "server"
          ? "server"
          : "personal",
      available: pack !== undefined,
    };
  });
}

export function movePersonalLayer(
  layers: readonly ContentProfileLayer[],
  fromIndex: number,
  direction: -1 | 1,
  serverLayerCount: number,
): ContentProfileLayer[] {
  const toIndex = fromIndex + direction;
  if (
    fromIndex < serverLayerCount ||
    toIndex < serverLayerCount ||
    fromIndex >= layers.length ||
    toIndex >= layers.length
  )
    return [...layers];
  const reordered = [...layers];
  const [moved] = reordered.splice(fromIndex, 1);
  if (moved !== undefined) reordered.splice(toIndex, 0, moved);
  return reordered;
}

export function sameProfileLayers(
  left: readonly ContentProfileLayer[],
  right: readonly ContentProfileLayer[],
): boolean {
  return (
    left.length === right.length &&
    left.every(
      (layer, index) =>
        layer.packId === right[index]?.packId &&
        layer.contentDigest === right[index]?.contentDigest,
    )
  );
}
