import type { CharacterRepository } from "@4ecb/browser-storage";
import type { CharacterRecord } from "@4ecb/character-domain";
import { describe, expect, it, vi } from "vitest";

import {
  characterDraft,
  holdCharacterDraft,
  loadCharacter,
  persistCharacterDraft,
} from "./character-drafts";

describe("new character drafts", () => {
  it("stay out of storage until their first change, then are stored once", async () => {
    const draft = { id: "draft-1", title: "New Character" } as CharacterRecord;
    const put = vi.fn(() => Promise.resolve());
    const get = vi.fn(() => Promise.resolve(undefined));
    const repository = { put, get } as unknown as CharacterRepository;

    holdCharacterDraft(draft);
    expect(await loadCharacter(repository, "draft-1")).toBe(draft);
    expect(put).not.toHaveBeenCalled();

    // Two saves racing (a build edit and a portrait) store it only once.
    await Promise.all([
      persistCharacterDraft(repository, "draft-1"),
      persistCharacterDraft(repository, "draft-1"),
    ]);
    expect(put).toHaveBeenCalledTimes(1);
    expect(put).toHaveBeenCalledWith(draft);
    expect(characterDraft("draft-1")).toBeUndefined();

    await persistCharacterDraft(repository, "draft-1");
    expect(put).toHaveBeenCalledTimes(1);
    await loadCharacter(repository, "draft-1");
    expect(get).toHaveBeenCalledWith("draft-1");
  });
});
