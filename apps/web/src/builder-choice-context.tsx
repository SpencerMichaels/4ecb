import { createContext, useCallback, useRef, type ReactNode } from "react";

import {
  explicitlyInspectCandidate,
  initializeCandidateInspection,
  type CandidateInspectionInitializationState,
} from "./candidate-table-initialization";
import {
  InitializeCandidateInspectionContext,
  type InspectedOption,
} from "./CandidateSelectionTable";

export const InspectCandidateContext = createContext<
  ((option: InspectedOption | undefined) => void) | undefined
>(undefined);

export function CandidateInspectionScope({
  children,
  onInspect,
}: {
  readonly children: ReactNode;
  readonly onInspect: (option: InspectedOption | undefined) => void;
}) {
  const initializationState = useRef<CandidateInspectionInitializationState>({
    initializationClaimed: false,
    explicitlyInspected: false,
  });
  const inspect = useCallback(
    (option: InspectedOption | undefined) =>
      explicitlyInspectCandidate(
        initializationState.current,
        option,
        onInspect,
      ),
    [onInspect],
  );
  const initialize = useCallback(
    (option: InspectedOption | undefined) =>
      initializeCandidateInspection(
        initializationState.current,
        option,
        onInspect,
      ),
    [onInspect],
  );

  return (
    <InitializeCandidateInspectionContext.Provider value={initialize}>
      <InspectCandidateContext.Provider value={inspect}>
        {children}
      </InspectCandidateContext.Provider>
    </InitializeCandidateInspectionContext.Provider>
  );
}
