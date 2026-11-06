// A campaign's house-rule records (D116): RulesElement XML a DM writes for
// `content-tool campaign build`, or the `Houserules` block of a legacy
// `D20CampaignSetting` the browser turns into a campaign on import. Both go
// through the same parser `content-tool build` uses.

import type { ParsedContentSource } from "@4ecb/content-domain";

import { parseD20Rules } from "./parser";

const D20_RULES_OPEN = /<D20Rules\b(?:[^>"']|"[^"]*"|'[^']*')*>/i;

/**
 * The root's children verbatim (trimmed): the RulesElement definitions a
 * legacy export writes inside `Houserules`. The parser has already checked
 * the document is well formed with a D20Rules root.
 */
export function houseRulesChildrenXml(xml: string): string {
  const open = D20_RULES_OPEN.exec(xml);
  if (open === null) throw new Error("House-rule XML has no D20Rules root");
  if (open[0].endsWith("/>")) return "";
  const start = open.index + open[0].length;
  const end = xml.toLocaleLowerCase().lastIndexOf("</d20rules");
  if (end < start) throw new Error("House-rule XML has no closing D20Rules");
  return xml.slice(start, end).trim();
}

/** A D20Rules document holding `children` (RulesElement definitions). */
export function houseRulesDocument(children: string): string {
  return children.trim() === ""
    ? '<D20Rules game-system="D&amp;D4E" />'
    : `<D20Rules game-system="D&amp;D4E">${children}</D20Rules>`;
}

/**
 * Parses house-rule XML with the parser `content-tool build` uses. Records
 * the parser rejects, and top-level elements other than RulesElement (which
 * the legacy `Houserules` block cannot carry), are errors.
 */
export function parseHouseRules(
  xml: string,
  sourceKey: string,
): ParsedContentSource {
  const parsed = parseD20Rules(xml, sourceKey);
  const errors = [
    ...parsed.rejected.map(
      (record) =>
        `House-rule record ${record.ordinal + 1} was rejected: ${record.reason}`,
    ),
    ...parsed.rawTopLevel.flatMap((node) =>
      node.kind === "element"
        ? [
            `House-rule XML may hold only RulesElement records, not <${node.name}>`,
          ]
        : [],
    ),
  ];
  if (errors.length > 0) throw new Error(errors.join("; "));
  return parsed;
}
