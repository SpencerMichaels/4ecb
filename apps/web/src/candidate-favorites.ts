import { useSyncExternalStore } from "react";

// Favorite options, shared by every candidate table and the detail card that
// toggles them. Stored per browser (a viewer convenience, not character data).
const CANDIDATE_FAVORITES_KEY = "4ecb:candidate-favorites:v1";
let candidateFavoritesSnapshot: ReadonlySet<string> | undefined;
const candidateFavoriteListeners = new Set<() => void>();
const NO_FAVORITES: ReadonlySet<string> = new Set();

function storedCandidateFavorites(): ReadonlySet<string> {
  try {
    const stored = JSON.parse(
      localStorage.getItem(CANDIDATE_FAVORITES_KEY) ?? "[]",
    );
    return new Set(
      Array.isArray(stored)
        ? stored.filter((value): value is string => typeof value === "string")
        : [],
    );
  } catch {
    return new Set();
  }
}

function currentCandidateFavorites(): ReadonlySet<string> {
  candidateFavoritesSnapshot ??= storedCandidateFavorites();
  return candidateFavoritesSnapshot;
}

export function useCandidateFavorites(): ReadonlySet<string> {
  return useSyncExternalStore(
    (listener) => {
      candidateFavoriteListeners.add(listener);
      return () => candidateFavoriteListeners.delete(listener);
    },
    currentCandidateFavorites,
    // Server rendering (and tests) has no browser storage: no favorites.
    () => NO_FAVORITES,
  );
}

export function toggleCandidateFavorite(definitionId: string): void {
  const next = new Set(currentCandidateFavorites());
  const key = definitionId.toLocaleLowerCase();
  if (next.has(key)) next.delete(key);
  else next.add(key);
  candidateFavoritesSnapshot = next;
  localStorage.setItem(
    CANDIDATE_FAVORITES_KEY,
    JSON.stringify([...next].sort()),
  );
  for (const listener of candidateFavoriteListeners) listener();
}
