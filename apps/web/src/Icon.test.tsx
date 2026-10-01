import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Icon } from "./Icon";

describe("attack-roll icon", () => {
  it("renders Lucide dices decoratively", () => {
    const markup = renderToStaticMarkup(<Icon name="dices" />);
    expect(markup).toContain("lucide-dices");
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain("<svg");
  });
});
