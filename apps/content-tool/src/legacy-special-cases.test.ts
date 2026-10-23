import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  EVIDENCE_STATUSES,
  GAP_WORDING,
  LEGACY_SPECIAL_CASES,
  parseEvidence,
  verificationOf,
} from "./legacy-special-cases";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const entries = Object.entries(LEGACY_SPECIAL_CASES);

describe("legacy special-case evidence", () => {
  it("parses test and private fixture pointers", () => {
    expect(parseEvidence("packages/a/src/b.test.ts > does a thing")).toEqual({
      kind: "test",
      file: "packages/a/src/b.test.ts",
      test: "does a thing",
    });
    expect(
      parseEvidence("packages/a/src/b.test.ts > reads %s [any warlock pact]"),
    ).toEqual({
      kind: "test",
      file: "packages/a/src/b.test.ts",
      test: "reads %s",
      case: "any warlock pact",
    });
    expect(
      parseEvidence("private: sample-chars/x.dnd4e: Eyebite damage"),
    ).toEqual({
      kind: "private",
      fixture: "sample-chars/x.dnd4e",
      detail: "Eyebite damage",
    });
    expect(parseEvidence("powers.ts handles it")).toBeUndefined();
  });

  it("calls a claimed status without evidence unverified", () => {
    expect(verificationOf({ status: "code", description: "", note: "" })).toBe(
      "unverified",
    );
    expect(
      verificationOf({
        status: "partial",
        description: "",
        note: "",
        evidence: ["a.test.ts > b"],
      }),
    ).toBe("verified");
    expect(
      verificationOf({ status: "not-handled", description: "", note: "" }),
    ).toBe("not-applicable");
  });

  it("points every evidence item at an existing test or a private fixture", () => {
    const broken = entries.flatMap(([member, entry]) =>
      (entry.evidence ?? []).flatMap((text) => {
        const parsed = parseEvidence(text);
        if (parsed === undefined) return [`${member}: ${text}`];
        if (parsed.kind === "private")
          return /^(?:sample-chars|CharacterBuilder\/SampleChars)\//.test(
            parsed.fixture,
          )
            ? []
            : [`${member}: ${text}`];
        const path = `${root}${parsed.file}`;
        if (!existsSync(path)) return [`${member}: ${text}`];
        const source = readFileSync(path, "utf8");
        return source.includes(parsed.test) &&
          (parsed.case === undefined || source.includes(parsed.case))
          ? []
          : [`${member}: ${text}`];
      }),
    );
    expect(broken).toEqual([]);
  });

  it("keeps evidence to the statuses that claim coverage", () => {
    expect(
      entries
        .filter(
          ([, entry]) =>
            !EVIDENCE_STATUSES.has(entry.status) &&
            (entry.evidence?.length ?? 0) > 0,
        )
        .map(([member]) => member),
    ).toEqual([]);
  });

  it("does not claim full coverage in a note that admits a gap", () => {
    expect(
      entries
        .filter(
          ([, entry]) =>
            ["code", "declarative", "drift-risk"].includes(entry.status) &&
            GAP_WORDING.test(entry.note ?? ""),
        )
        .map(([member]) => member),
    ).toEqual([]);
  });

  it("says what is missing for every partial or unhandled case", () => {
    expect(
      entries
        .filter(
          ([, entry]) =>
            (entry.status === "partial" || entry.status === "not-handled") &&
            (entry.note ?? "").trim() === "",
        )
        .map(([member]) => member),
    ).toEqual([]);
  });
});
