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
