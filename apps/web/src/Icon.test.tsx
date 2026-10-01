import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Icon } from "./Icon";

describe("attack-roll icon", () => {
  it("renders Lucide dice-5 decoratively", () => {
    const markup = renderToStaticMarkup(<Icon name="dice-5" />);
    expect(markup).toContain("lucide-dice-5");
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain("<svg");
  });
});
