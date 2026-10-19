import { readFileSync } from "node:fs";

/**
 * Every app stylesheet as one text, in the cascade order styles/index.css
 * imports them, for tests that check CSS rules.
 */
const index = new URL("./styles/index.css", import.meta.url);

export const appStyles = readFileSync(index, "utf8")
  .split("\n")
  .flatMap((line) => {
    const imported = /^@import "\.\/([^"]+)";$/.exec(line.trim())?.[1];
    return imported === undefined
      ? []
      : [readFileSync(new URL(imported, index), "utf8")];
  })
  .join("\n");
