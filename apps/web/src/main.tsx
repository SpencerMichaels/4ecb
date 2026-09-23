import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App, initialRouteReady } from "./App";
import { ErrorBoundary } from "./ErrorBoundary";
import "./styles/primitives.css";
import "./styles.css";

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
