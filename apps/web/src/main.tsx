import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App, initialRouteReady } from "./App";
import { ErrorBoundary } from "./ErrorBoundary";
// The display face ships with the app so the brand and headings render the same
// on every device (no installed-font fallbacks). Only the weights in use: 400 and
// 400 italic (flavor text), 700 (brand, headings) and 800 (builder name).
import "@fontsource/eb-garamond/latin-400.css";
import "@fontsource/eb-garamond/latin-400-italic.css";
import "@fontsource/eb-garamond/latin-700.css";
import "@fontsource/eb-garamond/latin-800.css";
import "@fontsource/eb-garamond/latin-ext-400.css";
import "@fontsource/eb-garamond/latin-ext-400-italic.css";
import "@fontsource/eb-garamond/latin-ext-700.css";
import "@fontsource/eb-garamond/latin-ext-800.css";
import "./styles/index.css";

const root = document.getElementById("root");
if (root === null) throw new Error("Application root was not found");

async function render(): Promise<void> {
  // A directly requested lazy workspace begins loading during App module
  // evaluation. Waiting here avoids React's Suspense reveal throttle without
  // pulling any route chunk into the default library route.
  await initialRouteReady.catch(() => undefined);
  createRoot(root!).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  );
}

void render();
