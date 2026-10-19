import { CharacterRepository } from "@4ecb/browser-storage";

/** Hands the browser a file to save. */
export function download(
  name: string,
  contents: string,
  type = "application/json",
): void {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** Downloads a backup of every character in this browser. */
export async function downloadCharacterBackup(
  repository: CharacterRepository = new CharacterRepository(),
): Promise<void> {
  const backup = await repository.exportBackup();
  download(
    `4ecb-characters-${new Date().toISOString().slice(0, 10)}.json`,
    JSON.stringify(backup, null, 2),
  );
}
