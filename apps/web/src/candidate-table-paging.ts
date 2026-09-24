export const CANDIDATE_PAGE_SIZE = 200;

export interface CandidatePageWindow {
  readonly page: number;
  readonly pageCount: number;
  /** First mounted result-row index (inclusive). */
  readonly start: number;
  /** Last mounted result-row index (exclusive). */
  readonly end: number;
}

/** Clamps a requested page to the available result rows. */
export function candidatePageWindow(
  totalRows: number,
  requestedPage: number,
  pageSize = CANDIDATE_PAGE_SIZE,
): CandidatePageWindow {
  const pageCount = Math.max(1, Math.ceil(totalRows / pageSize));
  const page = Math.min(Math.max(0, Math.trunc(requestedPage)), pageCount - 1);
  const start = page * pageSize;
  return {
    page,
    pageCount,
    start,
    end: Math.min(totalRows, start + pageSize),
  };
}

/** The page that contains a result row, or the first page when absent. */
export function candidatePageForRow(
  rowIndex: number,
  pageSize = CANDIDATE_PAGE_SIZE,
): number {
  return rowIndex < 0 ? 0 : Math.floor(rowIndex / pageSize);
}

/**
 * Whether a section header belongs on the current page. A section with rows is
 * shown on every page its rows reach; a collapsed or empty section is shown on
 * the page where its rows would begin (the last page when it trails the list).
 */
export function candidateSectionOnPage(
  section: { readonly start: number; readonly end: number },
  window: CandidatePageWindow,
  totalRows: number,
): boolean {
  if (section.end > section.start)
    return section.start < window.end && section.end > window.start;
  return (
    section.start >= window.start &&
    (section.start < window.end || window.end === totalRows)
  );
}
