export type ContentSourceKind = "portable-pack" | "legacy-rules-xml";

export interface ContentFileHandleLike {
  readonly kind: "file";
  readonly name: string;
  getFile(): Promise<File>;
}

export interface ContentDirectoryHandleLike {
  readonly kind: "directory";
  readonly name: string;
  values(): AsyncIterableIterator<
    ContentFileHandleLike | ContentDirectoryHandleLike
  >;
}

export interface DiscoveredContentSource {
  readonly kind: ContentSourceKind;
  readonly relativePath: string;
  readonly handle: ContentFileHandleLike;
}

const MAX_DIRECTORY_DEPTH = 4;
const MAX_DIRECTORY_ENTRIES = 2_000;

export function classifyContentSource(
  name: string,
): ContentSourceKind | undefined {
  const normalized = name.trim().toLocaleLowerCase();
  if (normalized.endsWith(".4ecp")) return "portable-pack";
  return /(?:^|\.)dnd40(?:\.(?:merged|original))?\.xml$/.test(normalized) ||
    /^combined\.dnd40\.(?:merged|original)\.xml$/.test(normalized)
    ? "legacy-rules-xml"
    : undefined;
}

/**
 * Read-only, bounded discovery. Handles remain in memory for the current page
 * and are never persisted or granted access beyond the directory the user chose.
 */
export async function discoverContentSources(
  root: ContentDirectoryHandleLike,
): Promise<readonly DiscoveredContentSource[]> {
  const result: DiscoveredContentSource[] = [];
  const pending: {
    readonly directory: ContentDirectoryHandleLike;
    readonly path: string;
    readonly depth: number;
  }[] = [{ directory: root, path: root.name, depth: 0 }];
  let visited = 0;

  while (pending.length > 0) {
    const current = pending.shift();
    if (current === undefined) break;
    for await (const handle of current.directory.values()) {
      visited += 1;
      if (visited > MAX_DIRECTORY_ENTRIES)
        throw new Error(
          `Directory scan stopped after ${MAX_DIRECTORY_ENTRIES.toLocaleString()} entries. Choose a smaller legacy-data or pack directory.`,
        );
      const relativePath = `${current.path}/${handle.name}`;
      if (handle.kind === "file") {
        const kind = classifyContentSource(handle.name);
        if (kind !== undefined) result.push({ kind, relativePath, handle });
      } else if (
        current.depth < MAX_DIRECTORY_DEPTH &&
        !handle.name.startsWith(".")
      ) {
        pending.push({
          directory: handle,
          path: relativePath,
          depth: current.depth + 1,
        });
      }
    }
  }

  return result.sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath),
  );
}

export function supportsDirectoryPicker(window_: Window): boolean {
  return (
    typeof (
      window_ as Window & {
        readonly showDirectoryPicker?: unknown;
      }
    ).showDirectoryPicker === "function"
  );
}

export async function chooseContentDirectory(
  window_: Window,
): Promise<ContentDirectoryHandleLike> {
  const picker = (
    window_ as Window & {
      readonly showDirectoryPicker?: (options: {
        readonly id: string;
        readonly mode: "read";
      }) => Promise<ContentDirectoryHandleLike>;
    }
  ).showDirectoryPicker;
  if (picker === undefined)
    throw new Error("This browser does not support directory selection");
  return picker.call(window_, { id: "4ecb-content-source", mode: "read" });
}
