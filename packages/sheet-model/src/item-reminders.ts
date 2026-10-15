import type { ContentEntity } from "@4ecb/content-domain";
import type { SheetValue } from "./index";
import type { OverviewInventory } from "./overview";

function propertyNames(value: string): string[] {
  const names: string[] = [];
  let depth = 0,
    start = 0;
  for (let i = 0; i < value.length; i++) {
    if (value[i] === "(") depth++;
    else if (value[i] === ")") depth = Math.max(0, depth - 1);
    else if (value[i] === "," && depth === 0) {
      names.push(value.slice(start, i).trim());
      start = i + 1;
    }
  }
  names.push(value.slice(start).trim());
  return names.filter(Boolean);
}

/** Read only the declared property’s authored explanation. Balanced parentheses
 * preserve parameter names and nested examples; flavor and Group prose stay out. */
function fullTextProperty(fullText: string, name: string): string | undefined {
  const section = fullText
    .replace(/\r\n?/g, "\n")
    .split(/(?:^|\n)\s*Properties\s*:\s*/i)[1]
    ?.split(/\n\s*(?:Group|Power|Enhancement|Critical)\s*:/i)[0];
  if (!section) return undefined;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`(?:^|\\n)\\s*${escaped}\\s*\\(`, "i").exec(section);
  if (!match) return undefined;
  const start = match.index + match[0].length;
  let depth = 1;
  for (let i = start; i < section.length; i++) {
    if (section[i] === "(") depth++;
    else if (section[i] === ")" && --depth === 0)
      return section.slice(start, i).replace(/\s+/g, " ").trim();
  }
  return undefined;
}

function actionableProperty(text: string): boolean {
  // These are circumstances, manual decisions/actions, or benefits to others,
  // not a bare proficiency/enhancement/always-on numeric property.
  return /\b(?:allies|ally|when|whenever|while|if|unless|trigger|against|subject to|affected by|reroll|push|pull|slide|shift|teleport|spend|once per|until|you can|you may)\b/i.test(
    text,
  );
}

export function equippedItemPropertyReminders(
  inventory: readonly OverviewInventory[],
  content: readonly ContentEntity[],
): SheetValue[] {
  const definitions = new Map(
    content
      .filter((entity) => entity.type.toLowerCase() === "weapon property")
      .map((entity) => [entity.name.trim().toLowerCase(), entity]),
  );
  const result: SheetValue[] = [];
  const seen = new Set<string>();
  const add = (item: OverviewInventory, value: string) => {
    const key = `${item.name}:${value}`;
    if (!seen.has(key)) result.push({ label: item.name, value });
    seen.add(key);
  };
  for (const item of inventory.filter(
    (item) => item.equipped > 0 && item.quantity > 0,
  )) {
    const fullTexts = item.fields
      .filter((field) => /^full text$/i.test(field.label))
      .map((field) => field.value);
    for (const field of item.fields) {
      if (/^property$/i.test(field.label) && actionableProperty(field.value))
        add(item, field.value);
      if (!/^properties$/i.test(field.label)) continue;
      // Some custom corpuses use Properties for a paragraph, not keyword names.
      if (/[.!?]/.test(field.value) && actionableProperty(field.value)) {
        add(item, field.value);
        continue;
      }
      for (const name of propertyNames(field.value)) {
        const entity =
          definitions.get(name.toLowerCase()) ??
          definitions.get(name.replace(/\s+\d+$/, "").toLowerCase());
        const description =
          fullTexts.map((text) => fullTextProperty(text, name)).find(Boolean) ||
          entity?.description.trim() ||
          entity?.specifics
            .find((field) => /^full text$/i.test(field.name))
            ?.value.trim();
        if (description && actionableProperty(description))
          add(item, `${name}: ${description}`);
      }
    }
  }
  return result;
}
