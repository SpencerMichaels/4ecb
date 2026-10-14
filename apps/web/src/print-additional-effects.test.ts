import { describe, expect, it } from "vitest";
import { printAdditionalEffect } from "./print-additional-effects";

describe("printed additional-effect labels", () => {
  it.each([" (Dragonborn Fury).", " - Dragonborn Fury."])(
    "moves a known trailing provider into a label: %s",
    (suffix) => {
      const effect = {
        text: `+1 Racial bonus to attack when you're bloodied${suffix}`,
        provider: "Dragonborn Fury",
        source: "authoritative-evaluation" as const,
      };
      expect(printAdditionalEffect(effect)).toEqual({
        name: "Dragonborn Fury",
        text: "+1 Racial bonus to attack when you're bloodied.",
      });
      expect(effect.text).toContain(suffix);
    },
  );
  it("keeps other parenthetical conditions and avoids duplicate leading labels", () => {
    expect(
      printAdditionalEffect({
        text: "Synthetic Feature: The target is slowed (save ends).",
        provider: "Synthetic Feature",
        source: "authoritative-evaluation",
      }),
    ).toEqual({
      name: "Synthetic Feature",
      text: "The target is slowed (save ends).",
    });
  });
  it("preserves legacy reminders without guessing a provider from parentheses", () => {
    const text = "The target is slowed (save ends).";
    expect(printAdditionalEffect({ text, source: "legacy-cache" })).toEqual({
      text,
    });
  });
});
