export interface ContentProfileRevision {
  readonly packId: string;
  readonly contentDigest?: string;
  readonly layers?: readonly {
    readonly packId: string;
    readonly contentDigest: string;
  }[];
  readonly resolutionPolicy?: "last-pack-wins-v1";
}

export function contentProfileRevisionKey(
  revision: ContentProfileRevision,
): string {
  if (revision.layers === undefined && revision.resolutionPolicy === undefined)
    return `${revision.packId}:${revision.contentDigest ?? "unknown"}`;
  const layers = revision.layers
    ?.map(({ packId, contentDigest }) => `${packId}:${contentDigest}`)
    .join(">");
  return `${revision.packId}:${revision.contentDigest ?? "unknown"}:${revision.resolutionPolicy ?? "single-pack"}:${layers ?? ""}`;
}

export function previewMatchesTargetRevision(
  previewRevision: string | undefined,
  target: ContentProfileRevision | undefined,
): boolean {
  return (
    previewRevision !== undefined &&
    target !== undefined &&
    previewRevision === contentProfileRevisionKey(target)
  );
}

export function contentProfileMatchesRevision(
  binding: ContentProfileRevision | undefined,
  installed: ContentProfileRevision | undefined,
): boolean {
  return (
    binding !== undefined &&
    installed !== undefined &&
    binding.packId === installed.packId &&
    (binding.contentDigest === undefined ||
      binding.contentDigest === installed.contentDigest)
  );
}
