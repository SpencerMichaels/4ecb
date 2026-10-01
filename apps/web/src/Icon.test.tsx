import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Icon } from "./Icon";

describe("mixed icon sources", () => {
  it("renders the selected Nerd Fonts d20 decoratively", () => {
    const markup = renderToStaticMarkup(<Icon name="nf-fa-dice_d20" />);
    expect(markup).toContain('class="icon nerd-icon"');
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain("\uEEF5");
    expect(markup).not.toContain("<svg");
  });
  it("keeps Lucide SVG rendering for existing icons", () => {
    const markup = renderToStaticMarkup(<Icon name="sword" />);
    expect(markup).toContain("lucide-sword");
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).not.toContain("nerd-icon");
  });
});
