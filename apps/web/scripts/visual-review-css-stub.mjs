// Lets tsx load app modules that import stylesheets (Vite handles them in
// the app): a .css import becomes an empty module.
import { registerHooks } from "node:module";

registerHooks({
  load(url, context, nextLoad) {
    if (url.endsWith(".css"))
      return { format: "module", source: "", shortCircuit: true };
    return nextLoad(url, context);
  },
});
