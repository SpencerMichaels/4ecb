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
