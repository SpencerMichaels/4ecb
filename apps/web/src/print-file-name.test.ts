import { describe, expect, it } from "vitest";
import { printWithFileName } from "./print-file-name";

describe("printWithFileName", () => {
  it("names the print path after the file and restores it afterwards", () => {
    const location = {
      hash: "#/characters/c1?preview=1",
      pathname: "/",
      search: "",
    };
    const urls: string[] = [];
    const target = {
      history: {
        state: null,
        replaceState: (
          _data: unknown,
          _unused: string,
          url?: string | URL | null,
        ) => {
          urls.push(String(url));
        },
      },
      location,
      print: () => urls.push("print"),
    };
    printWithFileName("Ingi / Thorn - Level 8", target, "/");
    expect(urls).toEqual([
      "/Ingi%20-%20Thorn%20-%20Level%208#/characters/c1?preview=1",
      "print",
      "/#/characters/c1?preview=1",
    ]);
  });
});
