export function firstSelectedCandidateId(
  selectedIds: ReadonlySet<string>,
): string | undefined {
  return selectedIds.values().next().value;
}

export type CandidateInspectionInitializationState = {
  initializationClaimed: boolean;
  explicitlyInspected: boolean;
};

export function initializeCandidateInspection<Option>(
  state: CandidateInspectionInitializationState,
  option: Option | undefined,
  inspect: (option: Option | undefined) => void,
): void {
  if (state.initializationClaimed || state.explicitlyInspected) return;
  // A table without a selection clears the pane but leaves it for a later
  // table on the same page that has one.
  if (option !== undefined) state.initializationClaimed = true;
  inspect(option);
}

export function explicitlyInspectCandidate<Option>(
  state: CandidateInspectionInitializationState,
  option: Option | undefined,
  inspect: (option: Option | undefined) => void,
): void {
  state.explicitlyInspected = true;
  inspect(option);
}

/**
 * The selected row a table pre-scrolls to when it opens: the topmost selected
 * row in display order (so a table with several picks shows them all below
 * it), else the first selection in choice order when none is displayed.
 */
export function initialCandidateScrollTarget(
  displayedRowIds: readonly (string | undefined)[],
  selectedIds: ReadonlySet<string>,
): string | undefined {
  return (
    displayedRowIds.find((id) => id !== undefined && selectedIds.has(id)) ??
    firstSelectedCandidateId(selectedIds)
  );
}

/**
 * What a freshly opened table does about its pre-scroll on this layout pass:
 * - "wait" while it has no candidates yet or no layout to measure (a
 *   zero-height viewport, e.g. inside a hidden container) and it will hear
 *   about a later resize: measuring now would misplace the row, and settling
 *   would never retry.
 * - "scroll" to the target row once both exist.
 * - "settle" without scrolling when there is nothing to scroll to.
 * Anything but "wait" happens once; later renders, picks and expansions in
 * the same mount never re-scroll the table.
 */
export function initialCandidateScrollStep({
  candidateCount,
  viewportHeight,
  canWaitForLayout,
  targetId,
  targetRowMounted,
}: {
  readonly candidateCount: number;
  readonly viewportHeight: number;
  readonly canWaitForLayout: boolean;
  readonly targetId: string | undefined;
  readonly targetRowMounted: boolean;
}): "wait" | "scroll" | "settle" {
  if (canWaitForLayout && (candidateCount === 0 || viewportHeight <= 0))
    return "wait";
  return targetId !== undefined && targetRowMounted ? "scroll" : "settle";
}

/**
 * The scroll offset that puts a row's top edge just below everything stuck
 * to the top of the table (the column header and, in a sectioned table, the
 * type-section band), clamped to the scroll range so a row near the end goes
 * as high as it can.
 */
export function initialCandidateScrollTop({
  currentScrollTop,
  rowTop,
  stickyHeaderHeight,
  viewportTop,
  maxScrollTop = Infinity,
}: {
  readonly currentScrollTop: number;
  readonly rowTop: number;
  readonly stickyHeaderHeight: number;
  readonly viewportTop: number;
  readonly maxScrollTop?: number;
}): number {
  return Math.min(
    Math.max(0, maxScrollTop),
    Math.max(0, currentScrollTop + rowTop - viewportTop - stickyHeaderHeight),
  );
}
