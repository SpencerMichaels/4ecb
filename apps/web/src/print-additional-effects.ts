import type { SheetAdditionalEffect } from "@4ecb/sheet-model";

/** Presentation only: keep the original reminder and provenance in the model.
 * Only a known provider can be moved out of the prose; parenthetical conditions
 * such as '(save ends)' must never be mistaken for an effect name. */
export function printAdditionalEffect(effect: SheetAdditionalEffect): {
  readonly name?: string;
  readonly text: string;
} {
  const name = effect.provider?.trim();
  if (!name) return { text: effect.text };
  let text = effect.text.trim();
  const normalized = text.toLocaleLowerCase();
  for (const suffix of [
    ` - ${name}.`,
    ` - ${name}`,
    ` (${name}).`,
    ` (${name})`,
  ]) {
    if (normalized.endsWith(suffix.toLocaleLowerCase())) {
      text = text.slice(0, -suffix.length).trimEnd();
      if (suffix.endsWith(".") && !/[.!?]$/.test(text)) text += ".";
      break;
    }
  }
  const prefix = `${name}:`;
  if (text.toLocaleLowerCase().startsWith(prefix.toLocaleLowerCase()))
    text = text.slice(prefix.length).trimStart();
  return { name, text };
}
