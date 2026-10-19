import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { appStyles } from "./test-styles";

const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const styles = appStyles;

describe("application shell", () => {
  it("does not render the former disclaimer footer on any route", () => {
    expect(app).not.toContain("Unofficial, local-first software");
    expect(app).not.toContain('className="public-notice"');
    expect(styles).not.toContain(".public-notice");
  });
});
