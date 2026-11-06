import { describe, expect, it } from "vitest";

import { appStyles } from "./test-styles";

describe("one-line fit styles", () => {
  it("keeps marked text unwrapped until it wraps or truncates at its floor", () => {
    expect(appStyles).toMatch(
      /\.one-line-fit\s*\{[^}]*max-width:\s*100%;[^}]*white-space:\s*nowrap;/,
    );
    expect(appStyles).toMatch(
      /span\.one-line-fit\s*\{\s*display:\s*inline-block;/,
    );
    expect(appStyles).toMatch(
      /\.one-line-fit\.is-wrapped\s*\{\s*white-space:\s*normal;/,
    );
    expect(appStyles).toMatch(
      /\.one-line-fit\.is-truncated\s*\{[^}]*text-overflow:\s*ellipsis;/,
    );
  });
});
