import { SaxesParser } from "saxes";

/**
 * Legacy `D20CampaignSetting` read/write (reverse-engineering/docs/09-campaign-format.md).
 *
 * The setting is a standalone `.dndcamp` root or a direct child of a `.dnd4e`
 * `D20Character`. `Restricted` children use the record's internal ID as the
 * element name, with the legacy `ID_Out` substitutions `(` → `_LPAREN_`,
 * `)` → `_RPAREN_`, `'` → `_APOS_`; a `RulesElement` child with identity
 * attributes is also accepted. `Houserules` holds full RulesElement
 * definitions, kept verbatim.
 */

export interface CampaignSettingDiagnostic {
  readonly code:
    | "campaign.restricted-repaired"
    | "campaign.restricted-identity-without-id"
    | "campaign.unknown-child";
  readonly message: string;
}

export interface CampaignSettingIdentity {
  readonly name: string;
  readonly type: string;
}

export interface LegacyCampaignSetting {
  /** The `name` attribute ("" when absent). */
  readonly name: string;
  /** Decoded restricted internal IDs, in file order, without duplicates. */
  readonly restrictedIds: readonly string[];
  /** `Restricted/RulesElement` children without an internal-id, for (name,type) resolution. */
  readonly restrictedIdentities: readonly CampaignSettingIdentity[];
  /** The `Houserules` children verbatim ("" when there are none). */
  readonly houseRulesXml: string;
  /** The `internal-id` of each `Houserules` RulesElement, in file order, without duplicates. */
  readonly houseRuleIds: readonly string[];
  /** Unknown direct children, verbatim; the legacy parser rejects them, so the writer never emits them. */
  readonly unknownXml: readonly string[];
  /** No name, restrictions, house rules or unknown children (the legacy `<D20CampaignSetting name="">` form, or no setting at all). */
  readonly empty: boolean;
  readonly diagnostics: readonly CampaignSettingDiagnostic[];
}

export interface CampaignSettingInput {
  readonly name: string;
  readonly restrictedIds: readonly string[];
  /** RulesElement definitions written verbatim inside `Houserules`. */
  readonly houseRulesXml: string;
}

const ESCAPES = [
  ["(", "_LPAREN_"],
  [")", "_RPAREN_"],
  ["'", "_APOS_"],
] as const;

/** Legacy `ID_Out`: an internal ID as an XML element name. */
export function encodeCampaignRestrictedId(id: string): string {
  return ESCAPES.reduce(
    (text, [raw, token]) => text.replaceAll(raw, token),
    id,
  );
}

/** Legacy `ID_In`: the inverse substitutions, in the legacy order. */
export function decodeCampaignRestrictedId(tag: string): string {
  return ESCAPES.reduce(
    (text, [raw, token]) => text.replaceAll(token, raw),
    tag,
  );
}

function key(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function stripBom(value: string): string {
  return value.startsWith("﻿") ? value.slice(1) : value;
}

interface Span {
  readonly start: number;
  readonly end: number;
}

/** Finds the setting element: the root itself, or a direct child of the root. */
function settingSpan(xml: string): Span | undefined {
  let depth = 0;
  let span: Span | undefined;
  let start: number | undefined;
  let startDepth: number | undefined;
  const parser = new SaxesParser({ xmlns: false });
  parser.on("opentagstart", (tag) => {
    if (
      span === undefined &&
      startDepth === undefined &&
      depth <= 1 &&
      key(tag.name) === "d20campaignsetting"
    ) {
      start = xml.lastIndexOf("<", parser.position - 1);
      startDepth = depth + 1;
    }
  });
  parser.on("opentag", () => {
    depth += 1;
  });
  parser.on("closetag", () => {
    if (startDepth === depth && start !== undefined) {
      span = { start, end: parser.position };
      startDepth = undefined;
    }
    depth -= 1;
  });
  parser.write(xml).close();
  return span;
}

const SETTING_PATTERN =
  /<D20CampaignSetting\b(?:[^>"']|"[^"]*"|'[^']*')*?(?:\/>|>[\s\S]*?<\/D20CampaignSetting\s*>)/i;
const RESTRICTED_PATTERN =
  /(<Restricted\b(?:[^>"']|"[^"]*"|'[^']*')*>)([\s\S]*?)(<\/Restricted\s*>)/gi;
const COMMENT_PATTERN = /(<!--[\s\S]*?-->)/;
const TAG_NAME_PATTERN = /<(\/?)([^\s/>!?][^\s/>]*)/g;

/**
 * The narrowly scoped legacy repair: inside `Restricted` only, start/end tag
 * names containing a literal `(`, `)` or `'` (one supplied LFR campaign) get
 * the legacy tokens. Returns undefined when nothing needed repair.
 */
function repairRestrictedTagNames(
  xml: string,
): { readonly xml: string; readonly names: readonly string[] } | undefined {
  const setting = SETTING_PATTERN.exec(xml);
  if (setting === null) return undefined;
  const names: string[] = [];
  const repairedSetting = setting[0].replace(
    RESTRICTED_PATTERN,
    (_whole, open: string, inner: string, close: string) => {
      const repairedInner = inner
        .split(COMMENT_PATTERN)
        .map((part) =>
          part.startsWith("<!--")
            ? part
            : part.replace(
                TAG_NAME_PATTERN,
                (tag, slash: string, name: string) => {
                  if (!/[()']/.test(name)) return tag;
                  if (slash === "") names.push(name);
                  return `<${slash}${encodeCampaignRestrictedId(name)}`;
                },
              ),
        )
        .join("");
      return `${open}${repairedInner}${close}`;
    },
  );
  if (names.length === 0) return undefined;
  return {
    xml: `${xml.slice(0, setting.index)}${repairedSetting}${xml.slice(
      setting.index + setting[0].length,
    )}`,
    names,
  };
}

const EMPTY_SETTING: LegacyCampaignSetting = {
  name: "",
  restrictedIds: [],
  restrictedIdentities: [],
  houseRulesXml: "",
  houseRuleIds: [],
  unknownXml: [],
  empty: true,
  diagnostics: [],
};

/**
 * Reads the campaign setting of a `.dndcamp` file or a `.dnd4e` save. A
 * document without a setting reads as empty. Not-well-formed input is
 * rejected, except for literal `(`, `)`, `'` in tag names inside
 * `Restricted`, which are repaired and reported.
 */
export function readCampaignSetting(sourceXml: string): LegacyCampaignSetting {
  let xml = stripBom(sourceXml);
  const diagnostics: CampaignSettingDiagnostic[] = [];
  let span: Span | undefined;
  try {
    span = settingSpan(xml);
  } catch (error) {
    const repaired = repairRestrictedTagNames(xml);
    if (repaired === undefined) throw error;
    xml = repaired.xml;
    span = settingSpan(xml);
    diagnostics.push({
      code: "campaign.restricted-repaired",
      message: `Repaired ${repaired.names.length} restricted ID tag name(s) with literal parentheses or apostrophes: ${repaired.names.join(", ")}`,
    });
  }
  if (span === undefined) return { ...EMPTY_SETTING, diagnostics };
  const setting = parseSetting(xml.slice(span.start, span.end));
  return {
    ...setting,
    diagnostics: [...diagnostics, ...setting.diagnostics],
  };
}

function parseSetting(fragment: string): LegacyCampaignSetting {
  const diagnostics: CampaignSettingDiagnostic[] = [];
  const restrictedIds: string[] = [];
  const seen = new Set<string>();
  const restrictedIdentities: CampaignSettingIdentity[] = [];
  const houseRules: string[] = [];
  const houseRuleIds: string[] = [];
  const unknownXml: string[] = [];
  let houseRuleElements = 0;
  let name = "";
  let depth = 0;
  // Current direct child of the setting (depth 2).
  let child:
    { name: string; start: number; innerStart: number | undefined } | undefined;
  const parser = new SaxesParser({ xmlns: false });
  parser.on("opentagstart", (tag) => {
    if (depth === 1)
      child = {
        name: tag.name,
        start: fragment.lastIndexOf("<", parser.position - 1),
        innerStart: undefined,
      };
  });
  parser.on("opentag", (tag) => {
    depth += 1;
    if (depth === 1) name = tag.attributes.name ?? "";
    else if (depth === 2 && child !== undefined && !tag.isSelfClosing)
      child.innerStart = parser.position;
    else if (depth === 3 && child !== undefined) {
      const container = key(child.name);
      if (container === "houserules") {
        houseRuleElements += 1;
        const id = tag.attributes["internal-id"];
        if (
          key(tag.name) === "ruleselement" &&
          id !== undefined &&
          id.trim() !== "" &&
          !houseRuleIds.includes(id)
        )
          houseRuleIds.push(id);
      } else if (container === "restricted") {
        if (key(tag.name) === "ruleselement") {
          const id = tag.attributes["internal-id"];
          if (id !== undefined && id.trim() !== "") {
            if (!seen.has(id)) restrictedIds.push(id);
            seen.add(id);
          } else {
            const identity = {
              name: tag.attributes.name ?? "",
              type: tag.attributes.type ?? "",
            };
            restrictedIdentities.push(identity);
            diagnostics.push({
              code: "campaign.restricted-identity-without-id",
              message: `Restricted RulesElement "${identity.name}" (${identity.type}) has no internal-id and must be resolved by name and type`,
            });
          }
        } else {
          const id = decodeCampaignRestrictedId(tag.name);
          if (!seen.has(id)) restrictedIds.push(id);
          seen.add(id);
        }
      }
    }
  });
  parser.on("closetag", () => {
    if (depth === 2 && child !== undefined) {
      const container = key(child.name);
      if (container === "houserules") {
        if (child.innerStart !== undefined)
          houseRules.push(
            fragment.slice(
              child.innerStart,
              fragment.lastIndexOf("</", parser.position - 1),
            ),
          );
      } else if (container !== "restricted") {
        unknownXml.push(fragment.slice(child.start, parser.position));
        diagnostics.push({
          code: "campaign.unknown-child",
          message: `Unknown campaign setting child <${child.name}> is kept but not written back (the legacy builder rejects it)`,
        });
      }
      child = undefined;
    }
    depth -= 1;
  });
  parser.write(fragment).close();
  const houseRulesXml = houseRuleElements === 0 ? "" : houseRules.join("");
  return {
    name,
    restrictedIds,
    restrictedIdentities,
    houseRulesXml,
    houseRuleIds,
    unknownXml,
    empty:
      name.trim() === "" &&
      restrictedIds.length === 0 &&
      restrictedIdentities.length === 0 &&
      houseRuleElements === 0 &&
      unknownXml.length === 0,
    diagnostics,
  };
}

function escapeAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const SAFE_TAG = /^[A-Za-z_][A-Za-z0-9_.-]*$/;

function restrictedChildXml(id: string): string {
  const tag = encodeCampaignRestrictedId(id);
  // The ID-as-tag form only when it is a plain XML name that decodes back to
  // the same ID; otherwise the RulesElement identity form the loader also reads.
  return SAFE_TAG.test(tag) &&
    key(tag) !== "ruleselement" &&
    decodeCampaignRestrictedId(tag) === id
    ? `<${tag} />`
    : `<RulesElement internal-id="${escapeAttribute(id)}" />`;
}

function assertWellFormedHouseRules(xml: string): void {
  const parser = new SaxesParser({ xmlns: false });
  parser.write(`<Houserules>${xml}</Houserules>`).close();
}

/** Writes a legacy `D20CampaignSetting` element (empty containers omitted). */
export function campaignSettingXml(input: CampaignSettingInput): string {
  const lines: string[] = [];
  const ids = [...new Set(input.restrictedIds)];
  if (ids.length > 0)
    lines.push(
      "<Restricted>",
      ...ids.map((id) => `  ${restrictedChildXml(id)}`),
      "</Restricted>",
    );
  if (input.houseRulesXml.trim() !== "") {
    assertWellFormedHouseRules(input.houseRulesXml);
    lines.push(`<Houserules>${input.houseRulesXml}</Houserules>`);
  }
  const open = `<D20CampaignSetting name="${escapeAttribute(input.name)}">`;
  if (lines.length === 0) return `${open}</D20CampaignSetting>`;
  return `${open}\n${lines.map((line) => `    ${line}`).join("\n")}\n  </D20CampaignSetting>`;
}
