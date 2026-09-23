export type BoundProfileResolution =
  "pending" | "available" | "unavailable" | "unbound";

export function resolvedBoundProfile(
  binding: { readonly contentDigest?: string } | undefined,
  installedContentDigest: string | undefined,
): BoundProfileResolution {
  if (binding === undefined) return "unbound";
  if (installedContentDigest === undefined) return "unavailable";
  return binding.contentDigest === undefined ||
    installedContentDigest === binding.contentDigest
    ? "available"
    : "unavailable";
}

export function shouldShowBoundProfileWarning(
  resolution: BoundProfileResolution,
): boolean {
  return resolution === "unavailable";
}
