export interface ContentProfileRevision {
  readonly packId: string;
  readonly contentDigest?: string;
}

export function contentProfileRevisionKey(
  revision: ContentProfileRevision,
): string {
  return `${revision.packId}:${revision.contentDigest ?? "unknown"}`;
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
