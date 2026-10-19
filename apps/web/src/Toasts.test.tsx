import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ToastRegion } from "./Toasts";

describe("ToastRegion", () => {
  it("announces errors as alerts and warnings as status, each dismissible", () => {
    const markup = renderToStaticMarkup(
      createElement(ToastRegion, {
        toasts: [
          {
            id: 0,
            tone: "error",
            title: "Couldn't import Hu.dnd4e",
            messages: ["Not XML"],
          },
          {
            id: 1,
            tone: "warning",
            title: "Imported Hu with warnings",
            messages: ["Unexpected game system", "No CharacterSheet cache"],
          },
        ],
        onDismiss: () => undefined,
      }),
    );
    expect(markup).toContain('class="toast toast-error" role="alert"');
    expect(markup).toContain('class="toast toast-warning" role="status"');
    expect(markup).toContain("<p>Not XML</p>");
    expect(markup).toContain("<li>No CharacterSheet cache</li>");
    expect(markup).toContain('aria-label="Dismiss: Imported Hu with warnings"');
  });

  it("keeps the empty region mounted so later toasts are announced", () => {
    expect(
      renderToStaticMarkup(
        createElement(ToastRegion, { toasts: [], onDismiss: () => undefined }),
      ),
    ).toBe(
      '<section class="toast-region" aria-label="Notifications"></section>',
    );
  });
});
