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
  state.initializationClaimed = true;
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

export function initialCandidateScrollTop({
  currentScrollTop,
  rowTop,
  stickyHeaderHeight,
  viewportTop,
}: {
  readonly currentScrollTop: number;
  readonly rowTop: number;
  readonly stickyHeaderHeight: number;
  readonly viewportTop: number;
}): number {
  return Math.max(
    0,
    currentScrollTop + rowTop - viewportTop - stickyHeaderHeight,
  );
}
