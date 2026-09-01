interface MainContentTarget {
  tabIndex: number;
  focus(options?: FocusOptions): void;
}

interface MainContentDocument {
  getElementById(id: string): MainContentTarget | null;
}

export function focusMainContent(document_: MainContentDocument): boolean {
  const main = document_.getElementById("main-content");
  if (main === null) return false;
  main.tabIndex = -1;
  main.focus();
  return true;
}
