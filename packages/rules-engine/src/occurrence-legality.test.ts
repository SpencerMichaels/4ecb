import { describe, expect, it } from "vitest";

import { occurrenceLegality } from "./occurrence-legality";

describe("occurrenceLegality", () => {
  it("is rules-legal unless saved or flagged as a house rule", () => {
    const legality = occurrenceLegality({
      occurrences: [
        { id: "granted", definitionId: "G", acquiredLevel: 1, kind: "grant" },
        {
          id: "saved",
          definitionId: "S",
          acquiredLevel: 1,
          kind: "choice",
          legality: "houserule",
        },
        {
          id: "failed",
          definitionId: "F",
          acquiredLevel: 1,
          kind: "choice",
          legality: "rules-legal",
        },
        {
          id: "unentitled",
          definitionId: "U",
          acquiredLevel: 1,
          kind: "choice",
        },
        { id: "unread", definitionId: "R", acquiredLevel: 1, kind: "choice" },
      ],
      diagnostics: [
        {
          severity: "error",
          code: "prerequisite.failed",
          message: "",
          occurrenceId: "failed",
        },
        {
          severity: "error",
          code: "occurrence.source-unentitled",
          message: "",
          occurrenceId: "unentitled",
        },
        {
          severity: "warning",
          code: "prerequisite.unverified",
          message: "",
          occurrenceId: "unread",
        },
      ],
    });
    expect(legality("granted")).toBe("rules-legal");
    expect(legality("saved")).toBe("houserule");
    expect(legality("failed")).toBe("houserule");
    expect(legality("unentitled")).toBe("houserule");
    expect(legality("unread")).toBe("rules-legal");
  });
});
