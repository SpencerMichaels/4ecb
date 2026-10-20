interface PrintTarget {
  readonly history: Pick<History, "replaceState" | "state">;
  readonly location: Pick<Location, "hash" | "pathname" | "search">;
  print(): void;
}

/**
 * Prints with a saved PDF named `fileName`. Chromium names it after the page
 * title. Firefox's window.print() reads the title from its print copy, which
 * on a page as large as the sheet isn't there yet when the dialog opens, so it
 * falls back to the URL's last path segment ("/" gives the host name). The
 * path carries the name until print() returns, which it does once the dialog
 * closes; the app routes by hash only, so nothing reacts to the path.
 */
export function printWithFileName(
  fileName: string,
  target: PrintTarget = window,
  basePath: string = import.meta.env.BASE_URL,
): void {
  const { history, location } = target;
  const original = `${location.pathname}${location.search}${location.hash}`;
  const segment = encodeURIComponent(fileName.replace(/[/\\]/g, "-"));
  history.replaceState(
    history.state,
    "",
    `${basePath}${segment}${location.search}${location.hash}`,
  );
  try {
    target.print();
  } finally {
    history.replaceState(history.state, "", original);
  }
}
