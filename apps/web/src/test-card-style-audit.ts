import { JSDOM } from "jsdom";

import { appStyles } from "./test-styles";

/**
 * A static spacing audit for on-screen detail cards, run by
 * `detail-card-spacing.test.ts`. It renders card markup into jsdom, applies
 * the app's combined stylesheet (`appStyles`) with its own small cascade
 * (jsdom matches the selectors; its own computed style drops logical
 * properties such as `margin-block`), and reports spacing that is left to
 * the browser's defaults, missing, uneven, or produced by preserved
 * whitespace. There is no layout: gaps are worked out from margins,
 * paddings, borders and grid/flex gaps, with margin collapsing, the way a
 * browser stacks block boxes.
 *
 * jsdom applies no user-agent stylesheet for spacing, so the defaults that
 * matter (p and dl margins, dd's 40px inset, list padding, heading margins
 * and sizes) are modelled in `UA_STYLES` and lose to any author rule.
 */

interface Declaration {
  readonly property: string;
  readonly value: string;
  readonly important: boolean;
}

interface StyleRule {
  readonly selectors: readonly string[];
  readonly declarations: readonly Declaration[];
  readonly origin: "ua" | "author";
  readonly order: number;
}

/** The user-agent defaults the audit models (HTML spec rendering section). */
const UA_STYLES = `
html, body, div, section, article, aside, header, footer, nav, main, p, dl,
dt, dd, ul, ol, menu, h1, h2, h3, h4, h5, h6, form, fieldset, figure,
figcaption, blockquote, address, details, summary, hr, pre, legend { display: block }
li { display: list-item }
table { display: table }
thead { display: table-header-group }
tbody { display: table-row-group }
tr { display: table-row }
th, td { display: table-cell; padding: 1px }
[hidden] { display: none }
body { margin: 8px }
p, dl, blockquote, figure, ul, ol, menu, pre { margin-block: 1em }
ul, ol, menu { padding-inline-start: 40px }
dd { margin-inline-start: 40px }
blockquote, figure { margin-inline: 40px }
pre { white-space: pre }
h1 { font-size: 2em; margin-block: 0.67em }
h2 { font-size: 1.5em; margin-block: 0.83em }
h3 { font-size: 1.17em; margin-block: 1em }
h4 { margin-block: 1.33em }
h5 { font-size: 0.83em; margin-block: 1.67em }
h6 { font-size: 0.67em; margin-block: 2.33em }
h1, h2, h3, h4, h5, h6, th, strong, b, dt { font-weight: bold }
button { padding-block: 1px; padding-inline: 6px }
`;

function stripComments(css: string): string {
  return css.replaceAll(/\/\*[\s\S]*?\*\//gu, "");
}

/** Splits at a separator outside parentheses, brackets and strings. */
export function splitTopLevel(value: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | undefined;
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index]!;
    if (quote !== undefined) {
      if (char === "\\") index += 1;
      else if (char === quote) quote = undefined;
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    else if (char === "(" || char === "[") depth += 1;
    else if (char === ")" || char === "]") depth -= 1;
    else if (
      depth === 0 &&
      (separator === " " ? /\s/u.test(char) : char === separator)
    ) {
      parts.push(value.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(value.slice(start));
  return parts.map((part) => part.trim()).filter((part) => part !== "");
}

function matchingBrace(css: string, open: number): number {
  let depth = 0;
  let quote: string | undefined;
  for (let index = open; index < css.length; index += 1) {
    const char = css[index]!;
    if (quote !== undefined) {
      if (char === "\\") index += 1;
      else if (char === quote) quote = undefined;
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    else if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return css.length;
}

export interface Viewport {
  readonly width: number;
  readonly height: number;
}

function mediaLength(value: string): number {
  const match = /^(-?[\d.]+)(px|rem|em)?$/u.exec(value.trim());
  if (match === null) return Number.NaN;
  const number = Number(match[1]);
  return match[2] === "rem" || match[2] === "em" ? number * 16 : number;
}

/** Screen, light theme, no reduced motion, a fine pointer. */
function mediaMatches(query: string, viewport: Viewport): boolean {
  return splitTopLevel(query, ",").some((alternative) => {
    let text = alternative.trim().toLocaleLowerCase();
    const negated = text.startsWith("not ");
    if (negated) text = text.slice(4);
    text = text.replace(/^only\s+/u, "");
    const terms = text.split(/\s+and\s+/u);
    const result = terms.every((term) => {
      const trimmed = term.trim();
      if (trimmed === "screen" || trimmed === "all") return true;
      if (trimmed === "print") return false;
      const feature = /^\(\s*([a-z-]+)\s*(?::\s*([^)]+))?\)$/u.exec(trimmed);
      if (feature === null) return false;
      const [, name = "", rawValue = ""] = feature;
      const value = rawValue.trim();
      switch (name) {
        case "min-width":
          return viewport.width >= mediaLength(value);
        case "max-width":
          return viewport.width <= mediaLength(value);
        case "min-height":
          return viewport.height >= mediaLength(value);
        case "max-height":
          return viewport.height <= mediaLength(value);
        case "prefers-color-scheme":
          return value === "light";
        case "prefers-reduced-motion":
          return value === "no-preference";
        case "hover":
          return value === "" || value === "hover";
        case "pointer":
        case "any-pointer":
          return value === "" || value === "fine";
        default:
          return false;
      }
    });
    return negated ? !result : result;
  });
}

function parseDeclarations(body: string): Declaration[] {
  return splitTopLevel(body, ";").flatMap((text) => {
    const colon = text.indexOf(":");
    if (colon < 1) return [];
    const property = text.slice(0, colon).trim();
    let value = text.slice(colon + 1).trim();
    const important = /!\s*important\s*$/iu.test(value);
    if (important) value = value.replace(/!\s*important\s*$/iu, "").trim();
    return [
      {
        property: property.startsWith("--")
          ? property
          : property.toLocaleLowerCase(),
        value,
        important,
      },
    ];
  });
}

export function parseStylesheet(
  css: string,
  origin: "ua" | "author",
  viewport: Viewport,
  firstOrder = 0,
): StyleRule[] {
  const rules: StyleRule[] = [];
  let order = firstOrder;
  const walk = (text: string) => {
    let index = 0;
    while (index < text.length) {
      const open = text.indexOf("{", index);
      const semicolon = text.indexOf(";", index);
      if (open === -1) return;
      // A statement at-rule (@import, @charset) before the next block.
      if (semicolon !== -1 && semicolon < open) {
        const statement = text.slice(index, semicolon).trim();
        if (statement.startsWith("@")) {
          index = semicolon + 1;
          continue;
        }
      }
      const prelude = text.slice(index, open).trim();
      const close = matchingBrace(text, open);
      const body = text.slice(open + 1, close);
      index = close + 1;
      if (prelude.startsWith("@media")) {
        if (mediaMatches(prelude.slice(6).trim(), viewport)) walk(body);
      } else if (prelude.startsWith("@supports")) {
        walk(body);
      } else if (prelude.startsWith("@")) {
        // @keyframes, @font-face, @page: no element styles.
      } else {
        rules.push({
          selectors: splitTopLevel(prelude, ","),
          declarations: parseDeclarations(body),
          origin,
          order: (order += 1),
        });
      }
    }
  };
  walk(stripComments(css));
  return rules;
}

type Specificity = readonly [number, number, number];

const ZERO: Specificity = [0, 0, 0];

function compareSpecificity(left: Specificity, right: Specificity): number {
  return left[0] - right[0] || left[1] - right[1] || left[2] - right[2];
}

function maxSpecificity(selectors: string): Specificity {
  return splitTopLevel(selectors, ",")
    .map(specificity)
    .reduce(
      (best, next) => (compareSpecificity(next, best) > 0 ? next : best),
      ZERO,
    );
}

/** Selectors Level 4 specificity, including :is/:not/:has/:where. */
export function specificity(selector: string): Specificity {
  let ids = 0;
  let classes = 0;
  let types = 0;
  let index = 0;
  const readIdent = () => {
    const match = /^-?[_a-zA-Z0-9\\-]+/u.exec(selector.slice(index));
    index += match?.[0].length ?? 0;
    return match?.[0] ?? "";
  };
  const readArgument = () => {
    // At "(": returns the text up to the matching ")".
    let depth = 0;
    const start = index + 1;
    for (; index < selector.length; index += 1) {
      const char = selector[index];
      if (char === "(") depth += 1;
      else if (char === ")") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    const argument = selector.slice(start, index);
    index += 1;
    return argument;
  };
  while (index < selector.length) {
    const char = selector[index]!;
    if (char === "#") {
      index += 1;
      readIdent();
      ids += 1;
    } else if (char === ".") {
      index += 1;
      readIdent();
      classes += 1;
    } else if (char === "[") {
      index = selector.indexOf("]", index) + 1 || selector.length;
      classes += 1;
    } else if (char === ":") {
      const pseudoElement = selector[index + 1] === ":";
      index += pseudoElement ? 2 : 1;
      const name = readIdent().toLocaleLowerCase();
      const argument = selector[index] === "(" ? readArgument() : undefined;
      if (pseudoElement || ["before", "after"].includes(name)) types += 1;
      else if (name === "where") {
        // Adds nothing.
      } else if (["is", "not", "has", "matches"].includes(name)) {
        const [a, b, c] = maxSpecificity(argument ?? "");
        ids += a;
        classes += b;
        types += c;
      } else if (/^nth-/u.test(name) && argument?.includes(" of ")) {
        const [a, b, c] = maxSpecificity(argument.split(" of ")[1] ?? "");
        ids += a;
        classes += b + 1;
        types += c;
      } else classes += 1;
    } else if (/[a-zA-Z]/u.test(char)) {
      readIdent();
      types += 1;
    } else index += 1;
  }
  return [ids, classes, types];
}

/** States the audit never applies: it looks at a card at rest. */
const STATEFUL =
  /::|:(?:hover|focus|focus-visible|focus-within|active|visited|target|before|after|placeholder|checked|disabled|invalid)\b/u;

const INHERITED = new Set([
  "font-size",
  "font-weight",
  "font-style",
  "font-family",
  "line-height",
  "letter-spacing",
  "text-transform",
  "text-indent",
  "white-space",
  "color",
  "list-style-type",
]);

const SIDES = ["top", "right", "bottom", "left"] as const;

/** One to four box values (top right bottom left). */
function boxSides(values: readonly string[]): Record<string, string> {
  const [top = "0", right = top, bottom = top, left = right] = values;
  return { top, right, bottom, left };
}

/** Physical longhands for the shorthands and logical properties in use
 * (horizontal, left-to-right writing). */
function expand(property: string, value: string): [string, string][] {
  const parts = splitTopLevel(value, " ");
  const box = /^(margin|padding)(?:-(block|inline)(?:-(start|end))?)?$/u.exec(
    property,
  );
  if (box !== null) {
    const [, kind = "", axis, edge] = box;
    if (axis === undefined)
      return Object.entries(boxSides(parts)).map(([side, part]) => [
        `${kind}-${side}`,
        part,
      ]);
    const [start, end] =
      axis === "block" ? ["top", "bottom"] : ["left", "right"];
    if (edge === "start") return [[`${kind}-${start}`, value]];
    if (edge === "end") return [[`${kind}-${end}`, value]];
    const [first = "0", second = first] = parts;
    return [
      [`${kind}-${start}`, first],
      [`${kind}-${end}`, second],
    ];
  }
  const border =
    /^border(?:-(top|bottom|left|right|block|inline)(?:-(start|end))?)?(?:-(width|style|color))?$/u.exec(
      property,
    );
  if (border !== null) {
    const [, axis, edge, aspect] = border;
    const sides: string[] =
      axis === undefined
        ? [...SIDES]
        : axis === "block"
          ? edge === "start"
            ? ["top"]
            : edge === "end"
              ? ["bottom"]
              : ["top", "bottom"]
          : axis === "inline"
            ? edge === "start"
              ? ["left"]
              : edge === "end"
                ? ["right"]
                : ["left", "right"]
            : [axis];
    if (aspect === "color") return [];
    if (aspect === undefined)
      return sides.map((side) => [`border-${side}`, value]);
    if (axis === undefined) {
      const values = boxSides(parts);
      return sides.map((side) => [
        `border-${side}-${aspect}`,
        values[side] ?? value,
      ]);
    }
    return sides.map((side) => [`border-${side}-${aspect}`, value]);
  }
  if (property === "gap" || property === "grid-gap") {
    const [row = "0", column = row] = parts;
    return [
      ["row-gap", row],
      ["column-gap", column],
    ];
  }
  if (property === "background") return [["background-color", value]];
  if (property === "inset") return [];
  return [[property, value]];
}

interface Winner {
  readonly property: string;
  readonly value: string;
  readonly origin: "ua" | "author";
  readonly selector: string;
  readonly important: boolean;
  readonly specificity: Specificity;
  readonly order: number;
}

function beats(next: Winner, current: Winner | undefined): boolean {
  if (current === undefined) return true;
  const rank = (winner: Winner) =>
    winner.origin === "ua" ? 0 : winner.important ? 2 : 1;
  return (
    (rank(next) - rank(current) ||
      compareSpecificity(next.specificity, current.specificity) ||
      next.order - current.order) > 0
  );
}

export interface ComputedBox {
  readonly element: Element;
  readonly display: string;
  readonly fontSize: number;
  readonly whiteSpace: string;
  readonly textIndent: number;
  readonly margin: Record<(typeof SIDES)[number], number>;
  readonly padding: Record<(typeof SIDES)[number], number>;
  readonly border: Record<(typeof SIDES)[number], boolean>;
  readonly rowGap: number;
  readonly hasBackground: boolean;
  readonly gridColumns: number;
  readonly flexDirection: string;
  readonly position: string;
  /** Property → the rule that set it, for reports. */
  readonly sources: ReadonlyMap<string, Winner>;
  readonly customProperties: ReadonlyMap<string, string>;
  readonly text: (property: string) => string | undefined;
}

const ROOT_FONT_SIZE = 16;

/** Evaluates a length (with calc() and var() already substituted) in px. */
export function lengthToPx(
  value: string,
  fontSize: number,
  rootFontSize = ROOT_FONT_SIZE,
): number {
  const text = value.trim();
  if (text === "" || text === "auto" || text === "normal") return Number.NaN;
  const tokens = text.match(
    /-?(?:\d+\.?\d*|\.\d+)(?:[a-z%]+)?|[-+*/()]|calc|[a-z-]+/giu,
  );
  if (tokens === null) return Number.NaN;
  let position = 0;
  const unit = (number: number, suffix: string): number => {
    switch (suffix.toLocaleLowerCase()) {
      case "":
        return number;
      case "px":
        return number;
      case "rem":
        return number * rootFontSize;
      case "em":
        return number * fontSize;
      case "pt":
        return (number * 96) / 72;
      case "in":
        return number * 96;
      case "ch":
        return number * fontSize * 0.5;
      default:
        return Number.NaN;
    }
  };
  const primary = (): number => {
    const token = tokens[position];
    position += 1;
    if (token === undefined) return Number.NaN;
    if (token.toLocaleLowerCase() === "calc") return primary();
    if (token === "(") {
      const result = sum();
      position += 1;
      return result;
    }
    if (token === "-") return -primary();
    const match = /^(-?(?:\d+\.?\d*|\.\d+))([a-z%]*)$/iu.exec(token);
    if (match === null) return Number.NaN;
    return unit(Number(match[1]), match[2] ?? "");
  };
  const product = (): number => {
    let result = primary();
    while (tokens[position] === "*" || tokens[position] === "/") {
      const operator = tokens[position];
      position += 1;
      const right = primary();
      result = operator === "*" ? result * right : result / right;
    }
    return result;
  };
  const sum = (): number => {
    let result = product();
    while (tokens[position] === "+" || tokens[position] === "-") {
      const operator = tokens[position];
      position += 1;
      const right = product();
      result = operator === "+" ? result + right : result - right;
    }
    return result;
  };
  const result = sum();
  return position === tokens.length ? result : Number.NaN;
}

function substituteVariables(
  value: string,
  lookup: (name: string) => string | undefined,
  depth = 0,
): string {
  if (depth > 20 || !value.includes("var(")) return value;
  let result = "";
  let index = 0;
  while (index < value.length) {
    const start = value.indexOf("var(", index);
    if (start === -1) {
      result += value.slice(index);
      break;
    }
    result += value.slice(index, start);
    let depthCount = 0;
    let end = start + 3;
    for (; end < value.length; end += 1) {
      if (value[end] === "(") depthCount += 1;
      else if (value[end] === ")") {
        depthCount -= 1;
        if (depthCount === 0) break;
      }
    }
    const inner = value.slice(start + 4, end);
    const [name = "", ...fallbackParts] = splitTopLevel(inner, ",");
    const fallback = fallbackParts.join(",");
    const resolved = lookup(name.trim()) ?? fallback;
    result += substituteVariables(resolved, lookup, depth + 1);
    index = end + 1;
  }
  return result;
}

function hasBorder(value: string | undefined): boolean {
  if (value === undefined) return false;
  const text = value.trim().toLocaleLowerCase();
  if (text === "" || text === "none" || text === "0" || text === "hidden")
    return false;
  if (
    /\b(?:none|hidden)\b/u.test(text) &&
    !/\bsolid|dashed|dotted|double\b/u.test(text)
  )
    return false;
  if (/^0(?:px|rem|em)?\s/u.test(text)) return false;
  return /\b(?:solid|dashed|dotted|double|groove|ridge|inset|outset)\b/u.test(
    text,
  );
}

function isTransparent(value: string | undefined): boolean {
  if (value === undefined) return true;
  const text = value.trim().toLocaleLowerCase();
  return (
    text === "" ||
    text === "transparent" ||
    text === "none" ||
    text === "initial"
  );
}

function gridColumnCount(value: string | undefined): number {
  if (value === undefined || value === "none" || value.trim() === "") return 1;
  return splitTopLevel(value, " ").reduce((count, track) => {
    const repeat = /^repeat\(\s*(\d+)\s*,/u.exec(track);
    if (repeat !== null) return count + Number(repeat[1]);
    if (/^repeat\(/u.test(track)) return count + 2;
    return count + 1;
  }, 0);
}

export class CardStyleSheet {
  private readonly rules: readonly StyleRule[];
  private readonly computed = new Map<Element, ComputedBox>();

  constructor(
    readonly viewport: Viewport,
    authorCss: string = appStyles,
  ) {
    const ua = parseStylesheet(UA_STYLES, "ua", viewport);
    this.rules = [
      ...ua,
      ...parseStylesheet(authorCss, "author", viewport, ua.length),
    ];
  }

  /** The tag and classes a selector's subject must have: a cheap filter
   * before jsdom's full match. */
  private readonly subjects = new Map<
    string,
    { readonly tag?: string; readonly classes: readonly string[] }
  >();

  private subject(selector: string) {
    const cached = this.subjects.get(selector);
    if (cached !== undefined) return cached;
    // The last compound, without anything in parentheses or brackets.
    let flat = selector;
    for (let previous = ""; previous !== flat;) {
      previous = flat;
      flat = flat.replaceAll(/\([^()]*\)/gu, "");
    }
    flat = flat.replaceAll(/\[[^\]]*\]/gu, "[]");
    const compound = flat.split(/\s*[>+~]\s*|\s+/u).at(-1) ?? "";
    const tag = /^[a-zA-Z][a-zA-Z0-9]*/u.exec(compound)?.[0]?.toUpperCase();
    const classes = [
      ...compound.matchAll(/\.(-?[_a-zA-Z][_a-zA-Z0-9-]*)/gu),
    ].map((match) => match[1] ?? "");
    const result = { ...(tag === undefined ? {} : { tag }), classes };
    this.subjects.set(selector, result);
    return result;
  }

  /** Every declaration whose selector matches, unexpanded. */
  private matched(element: Element): Winner[] {
    const declarations: Winner[] = [];
    for (const rule of this.rules)
      for (const selector of rule.selectors) {
        if (STATEFUL.test(selector)) continue;
        const subject = this.subject(selector);
        if (subject.tag !== undefined && subject.tag !== element.tagName)
          continue;
        if (subject.classes.some((name) => !element.classList.contains(name)))
          continue;
        let matches = false;
        try {
          matches = element.matches(selector);
        } catch {
          matches = false;
        }
        if (!matches) continue;
        const selectorSpecificity =
          rule.origin === "ua" ? ZERO : specificity(selector);
        for (const declaration of rule.declarations)
          declarations.push({
            property: declaration.property,
            value: declaration.value,
            origin: rule.origin,
            selector,
            important: declaration.important,
            specificity: selectorSpecificity,
            order: rule.order,
          });
      }
    // A style attribute outranks every selector.
    for (const declaration of parseDeclarations(
      element.getAttribute("style") ?? "",
    ))
      declarations.push({
        ...declaration,
        origin: "author",
        selector: "[style]",
        specificity: [1000, 0, 0],
        order: Number.MAX_SAFE_INTEGER,
      });
    return declarations;
  }

  compute(element: Element): ComputedBox {
    const cached = this.computed.get(element);
    if (cached !== undefined) return cached;
    const parent =
      element.parentElement === null
        ? undefined
        : this.compute(element.parentElement);
    const declarations = this.matched(element);
    const cascade = (entries: Iterable<Winner>) => {
      const result = new Map<string, Winner>();
      for (const entry of entries)
        if (beats(entry, result.get(entry.property)))
          result.set(entry.property, entry);
      return result;
    };
    const customProperties = new Map(parent?.customProperties ?? []);
    const declaredCustom = [
      ...cascade(
        declarations.filter(({ property }) => property.startsWith("--")),
      ),
    ];
    const resolving = new Set<string>();
    const lookup = (name: string): string | undefined => {
      const own = declaredCustom.find(([property]) => property === name)?.[1];
      if (own === undefined || resolving.has(name))
        return parent?.customProperties.get(name);
      resolving.add(name);
      const value = substituteVariables(own.value, lookup);
      resolving.delete(name);
      return value;
    };
    for (const [name] of declaredCustom) {
      const value = lookup(name);
      if (value !== undefined) customProperties.set(name, value);
    }
    const resolve = (value: string) =>
      substituteVariables(value, (name) => customProperties.get(name));
    // Shorthands expand once their variables are substituted.
    const winners = cascade(
      declarations
        .filter(({ property }) => !property.startsWith("--"))
        .flatMap((declaration) =>
          expand(declaration.property, resolve(declaration.value)).map(
            ([property, value]) => ({ ...declaration, property, value }),
          ),
        ),
    );
    const declared = (property: string): string | undefined => {
      const value = winners.get(property)?.value;
      if (value === undefined) return undefined;
      const text = resolve(value).trim();
      if (text === "inherit" || text === "unset") return undefined;
      if (text === "initial" || text === "revert") return "";
      return text;
    };
    const inheritedText = (property: string) =>
      INHERITED.has(property) ? parent?.text(property) : undefined;
    const text = (property: string) =>
      declared(property) ?? inheritedText(property);

    const parentFontSize = parent?.fontSize ?? ROOT_FONT_SIZE;
    const fontSizeValue = declared("font-size");
    let fontSize = parentFontSize;
    if (fontSizeValue !== undefined && fontSizeValue !== "") {
      const keyword: Record<string, number> = {
        smaller: parentFontSize / 1.2,
        larger: parentFontSize * 1.2,
        medium: ROOT_FONT_SIZE,
        small: 13,
        large: 18,
      };
      const percent = /^(-?[\d.]+)%$/u.exec(fontSizeValue);
      const resolved =
        keyword[fontSizeValue] ??
        (percent === null
          ? lengthToPx(fontSizeValue, parentFontSize)
          : (Number(percent[1]) / 100) * parentFontSize);
      if (Number.isFinite(resolved)) fontSize = resolved;
    }
    const length = (property: string, inherited = false): number => {
      const value = declared(property);
      if (value === undefined)
        return inherited && parent !== undefined
          ? property === "text-indent"
            ? parent.textIndent
            : 0
          : 0;
      if (value === "" || value === "auto" || value === "normal") return 0;
      const px = lengthToPx(value, fontSize);
      return Number.isFinite(px) ? px : 0;
    };
    const box: ComputedBox = {
      element,
      display: (declared("display") || "inline").split(/\s+/u)[0] ?? "inline",
      fontSize,
      whiteSpace: text("white-space") || "normal",
      textIndent: length("text-indent", true),
      margin: {
        top: length("margin-top"),
        right: length("margin-right"),
        bottom: length("margin-bottom"),
        left: length("margin-left"),
      },
      padding: {
        top: length("padding-top"),
        right: length("padding-right"),
        bottom: length("padding-bottom"),
        left: length("padding-left"),
      },
      border: Object.fromEntries(
        SIDES.map((side) => {
          const width = declared(`border-${side}-width`);
          const style = declared(`border-${side}-style`);
          const shorthand = declared(`border-${side}`);
          const shorthandOrder = winners.get(`border-${side}`)?.order ?? -1;
          const widthOrder = winners.get(`border-${side}-width`)?.order ?? -1;
          let present = hasBorder(shorthand);
          if (width !== undefined && widthOrder >= shorthandOrder)
            present =
              (present || style !== undefined) &&
              !/^0(?:px|rem|em)?$/u.test(width);
          if (style === "none") present = false;
          if (
            style !== undefined &&
            shorthand === undefined &&
            width !== undefined
          )
            present = !/^0(?:px|rem|em)?$/u.test(width) && style !== "none";
          return [side, present];
        }),
      ) as Record<(typeof SIDES)[number], boolean>,
      rowGap: length("row-gap"),
      hasBackground: !isTransparent(declared("background-color")),
      gridColumns: gridColumnCount(declared("grid-template-columns")),
      flexDirection: declared("flex-direction") || "row",
      position: declared("position") || "static",
      sources: winners,
      customProperties,
      text,
    };
    this.computed.set(element, box);
    return box;
  }
}

export function cardDocument(markup: string): Document {
  return new JSDOM(`<!doctype html><html><body>${markup}</body></html>`).window
    .document;
}

/* ---- Checks ---- */

export type FindingKind =
  | "ua-fallback"
  | "no-gap"
  | "uneven-gap"
  | "preserved-whitespace"
  | "first-line-indent"
  | "heading-style"
  | "split-short-field"
  | "stretched-control";

export interface Finding {
  readonly kind: FindingKind;
  readonly card: string;
  readonly path: string;
  readonly detail: string;
}

const BLOCK_LEVEL = new Set([
  "block",
  "list-item",
  "flex",
  "grid",
  "table",
  "flow-root",
]);

/** A short CSS-like path from the card root, for reports. */
export function elementPath(element: Element, root: Element): string {
  const parts: string[] = [];
  for (
    let current: Element | null = element;
    current !== null && current !== root.parentElement;
    current = current.parentElement
  ) {
    const classes = [...current.classList].slice(0, 2).join(".");
    parts.unshift(
      `${current.tagName.toLocaleLowerCase()}${classes === "" ? "" : `.${classes}`}`,
    );
    // Inside a card, paths start at the card.
    if (current === root || current.classList.contains("reference-entity-card"))
      break;
  }
  return parts.join(" > ");
}

const round = (value: number) => Math.round(value * 10) / 10;

/** A box in a parent's flow: an element, or a run of inline content. */
interface FlowItem {
  readonly element?: Element;
  /** An inline run's first element (a field's inline label). */
  readonly first?: Element;
  readonly label: string;
}

function isHidden(styles: CardStyleSheet, element: Element): boolean {
  const box = styles.compute(element);
  return (
    box.display === "none" ||
    box.position === "absolute" ||
    box.position === "fixed" ||
    element.classList.contains("visually-hidden")
  );
}

/** Children as laid out: `display: contents` flattened, hidden ones and
 * whitespace left out, consecutive inline content merged into one run
 * (except in a grid or flex container, whose children are all boxes). */
function flowItems(styles: CardStyleSheet, element: Element): FlowItem[] {
  const items: FlowItem[] = [];
  let inlineRun = false;
  const containerDisplay = styles.compute(element).display;
  const blockifies = containerDisplay === "grid" || containerDisplay === "flex";
  const visit = (node: Node) => {
    for (const child of node.childNodes) {
      if (child.nodeType === 3) {
        if ((child.textContent ?? "").trim() === "") continue;
        if (!inlineRun) items.push({ label: "(text)" });
        inlineRun = true;
        continue;
      }
      if (child.nodeType !== 1) continue;
      const childElement = child as Element;
      if (isHidden(styles, childElement)) continue;
      const display = styles.compute(childElement).display;
      if (display === "contents") {
        visit(childElement);
        continue;
      }
      if (BLOCK_LEVEL.has(display) || blockifies) {
        inlineRun = false;
        items.push({ element: childElement, label: childElement.tagName });
      } else {
        if (!inlineRun) items.push({ label: "(inline)", first: childElement });
        inlineRun = true;
      }
    }
  };
  visit(element);
  return items;
}

const collapse = (left: number, right: number) =>
  Math.max(left, right, 0) + Math.min(left, right, 0);

type Edge = "top" | "bottom";

/** Whether a block's edge margin collapses with its first/last child's. */
function collapsesThrough(
  styles: CardStyleSheet,
  element: Element,
  edge: Edge,
  inBlockFlow: boolean,
): boolean {
  const box = styles.compute(element);
  return (
    inBlockFlow &&
    (box.display === "block" || box.display === "list-item") &&
    box.padding[edge] === 0 &&
    !box.border[edge]
  );
}

function edgeChild(
  styles: CardStyleSheet,
  element: Element,
  edge: Edge,
): FlowItem | undefined {
  const items = flowItems(styles, element);
  return edge === "top" ? items[0] : items.at(-1);
}

/** The margin a box presents to its sibling, collapsed with its children's. */
function outerMargin(
  styles: CardStyleSheet,
  element: Element,
  edge: Edge,
  inBlockFlow: boolean,
): number {
  const box = styles.compute(element);
  const own = box.margin[edge];
  if (!collapsesThrough(styles, element, edge, inBlockFlow)) return own;
  const child = edgeChild(styles, element, edge);
  if (child?.element === undefined) return own;
  return collapse(own, outerMargin(styles, child.element, edge, true));
}

/** Space between a box's visible edge (its border or background) and its
 * first/last line of text. */
function innerSpace(
  styles: CardStyleSheet,
  element: Element,
  edge: Edge,
  inBlockFlow: boolean,
): number {
  const box = styles.compute(element);
  const child = edgeChild(styles, element, edge);
  const childSpace =
    child?.element === undefined
      ? 0
      : innerSpace(
          styles,
          child.element,
          edge,
          box.display === "block" || box.display === "list-item",
        ) +
        (collapsesThrough(styles, element, edge, inBlockFlow)
          ? 0
          : outerMargin(
              styles,
              child.element,
              edge,
              box.display === "block" || box.display === "list-item",
            ));
  return box.padding[edge] + childSpace;
}

/** Whether the box shows its edge (a border or a background band). */
function visibleEdge(
  styles: CardStyleSheet,
  element: Element,
  edge: Edge,
): boolean {
  const box = styles.compute(element);
  return box.border[edge] || box.hasBackground;
}

export interface SiblingGap {
  readonly card: string;
  readonly parent: string;
  readonly before: string;
  readonly after: string;
  /** From the last line (or visible edge) above to the next visible edge
   * or line. */
  readonly gap: number;
  readonly afterHeading: boolean;
}

export interface CardAudit {
  readonly findings: readonly Finding[];
  readonly gaps: readonly SiblingGap[];
  readonly headings: ReadonlyMap<string, ReadonlyMap<string, string[]>>;
}

export interface AuditOptions {
  /** The card's own name in reports. */
  readonly card: string;
  /** Containers whose children's vertical gaps are checked. */
  readonly gapScope: (element: Element) => boolean;
  /** Containers whose dividers should sit midway between their blocks. */
  readonly dividerScope: (element: Element) => boolean;
  /** Heading roles to compare across cards: role → selector. */
  readonly headingRoles: Readonly<Record<string, string>>;
}

const HEADING = /^H[1-6]$/u;

function headingSignature(box: ComputedBox): string {
  return [
    `size ${String(round(box.fontSize))}px`,
    `weight ${box.text("font-weight") ?? "normal"}`,
    `transform ${box.text("text-transform") ?? "none"}`,
    `spacing ${box.text("letter-spacing") ?? "normal"}`,
    `margin ${String(round(box.margin.top))}/${String(round(box.margin.bottom))}`,
  ].join(", ");
}

const UA_CHECKED = [
  "margin-top",
  "margin-bottom",
  "margin-left",
  "margin-right",
  "padding-top",
  "padding-bottom",
  "padding-left",
  "padding-right",
  "font-size",
] as const;

export function auditCard(
  styles: CardStyleSheet,
  root: Element,
  options: AuditOptions,
): CardAudit {
  const findings: Finding[] = [];
  const gaps: SiblingGap[] = [];
  const headings = new Map<string, Map<string, string[]>>();
  const add = (kind: FindingKind, element: Element, detail: string) =>
    findings.push({
      kind,
      card: options.card,
      path: elementPath(element, root),
      detail,
    });

  for (const element of [root, ...root.querySelectorAll("*")]) {
    if (
      element.closest("[hidden]") !== null ||
      element.closest(".visually-hidden") !== null ||
      element.tagName === "svg" ||
      element.closest("svg") !== null
    )
      continue;
    const box = styles.compute(element);
    if (box.display === "none") continue;

    for (const property of UA_CHECKED) {
      const source = box.sources.get(property);
      if (source?.origin !== "ua") continue;
      if (property !== "font-size") {
        const value = lengthToPx(source.value, box.fontSize);
        if (value === 0) continue;
      }
      add(
        "ua-fallback",
        element,
        `${property} is the browser default ${source.value} (no rule sets it)`,
      );
    }

    if (/^pre/u.test(box.whiteSpace) || box.whiteSpace === "break-spaces") {
      const content = element.textContent ?? "";
      if (
        /^\s/u.test(content) ||
        /\s$/u.test(content) ||
        /\n\s*\n/u.test(content)
      )
        add(
          "preserved-whitespace",
          element,
          `white-space: ${box.whiteSpace} keeps the source's ${JSON.stringify(
            content.slice(0, 24),
          )} whitespace`,
        );
    }

    if (
      box.textIndent !== 0 &&
      BLOCK_LEVEL.has(box.display) &&
      [...element.childNodes].some(
        (node) => node.nodeType === 3 && (node.textContent ?? "").trim() !== "",
      )
    ) {
      const previous = element.previousElementSibling;
      const continuesParagraph =
        previous !== null &&
        previous.tagName === element.tagName &&
        !HEADING.test(previous.tagName);
      if (!continuesParagraph)
        add(
          "first-line-indent",
          element,
          `text-indent ${String(round(box.textIndent))}px on text that doesn't continue a paragraph`,
        );
    }

    if (element.tagName === "DT") {
      const value = element.nextElementSibling;
      if (value?.tagName === "DD") {
        const dt = styles.compute(element);
        const dd = styles.compute(value);
        const short = (value.textContent ?? "").trim().length <= 24;
        if (
          short &&
          BLOCK_LEVEL.has(dt.display) &&
          BLOCK_LEVEL.has(dd.display)
        ) {
          // The box that lays the pair out, past `display: contents`.
          let layout = element.parentElement;
          while (
            layout !== null &&
            styles.compute(layout).display === "contents"
          )
            layout = layout.parentElement;
          const parentBox =
            layout === null ? undefined : styles.compute(layout);
          const sideBySide =
            parentBox !== undefined &&
            (parentBox.display === "grid"
              ? parentBox.gridColumns > 1
              : parentBox.display === "flex" &&
                !parentBox.flexDirection.startsWith("column"));
          if (!sideBySide)
            add(
              "split-short-field",
              element,
              `"${(element.textContent ?? "").trim()}" and its short value "${(value.textContent ?? "").trim()}" sit on separate lines`,
            );
        }
      }
    }

    // A grid stretches its items across the column: a button or link
    // there spans the card, its label centred, unless it is placed.
    if (
      ["BUTTON", "A", "SELECT", "INPUT"].includes(element.tagName) &&
      element.parentElement !== null &&
      styles.compute(element.parentElement).display === "grid" &&
      options.gapScope(element.parentElement)
    ) {
      const justify =
        box.text("justify-self") ??
        styles.compute(element.parentElement).text("justify-items");
      if (
        justify === undefined ||
        ["stretch", "normal", "auto"].includes(justify)
      )
        add(
          "stretched-control",
          element,
          "stretched across its grid column (no justify-self)",
        );
    }

    if (!options.gapScope(element)) continue;
    const items = flowItems(styles, element);
    if (items.length < 2) continue;
    const vertical =
      box.display === "block" ||
      box.display === "list-item" ||
      (box.display === "grid" && box.gridColumns === 1) ||
      (box.display === "flex" && box.flexDirection.startsWith("column"));
    if (!vertical) continue;
    const blockFlow = box.display === "block" || box.display === "list-item";
    for (let index = 1; index < items.length; index += 1) {
      const before = items[index - 1]!;
      const after = items[index]!;
      if (before.element === undefined && after.element === undefined) continue;
      // A list's items sit tight, as lists do.
      if (before.element?.tagName === "LI" && after.element?.tagName === "LI")
        continue;
      const marginBefore =
        before.element === undefined
          ? 0
          : outerMargin(styles, before.element, "bottom", blockFlow);
      const marginAfter =
        after.element === undefined
          ? 0
          : outerMargin(styles, after.element, "top", blockFlow);
      const between = blockFlow
        ? collapse(marginBefore, marginAfter)
        : marginBefore + marginAfter + box.rowGap;
      const spaceBefore =
        before.element === undefined ||
        visibleEdge(styles, before.element, "bottom")
          ? 0
          : innerSpace(styles, before.element, "bottom", blockFlow);
      const spaceAfter =
        after.element === undefined || visibleEdge(styles, after.element, "top")
          ? 0
          : innerSpace(styles, after.element, "top", blockFlow);
      const gap = round(spaceBefore + between + spaceAfter);
      const describe = (item: FlowItem) =>
        item.element === undefined
          ? item.label
          : elementPath(item.element, element)
              .split(" > ")
              .slice(1)
              .join(" > ");
      // A heading, a field label or a trait's name above its text.
      const lead = before.element ?? before.first;
      const afterHeading =
        lead !== undefined &&
        (HEADING.test(lead.tagName) || ["DT", "STRONG"].includes(lead.tagName));
      gaps.push({
        card: options.card,
        parent: elementPath(element, root),
        before: describe(before),
        after: describe(after),
        gap,
        afterHeading,
      });
      if (gap < 1)
        add(
          "no-gap",
          element,
          `no space between ${describe(before)} and ${describe(after)}`,
        );
      // Below a divider, the space to the text should match the gap above.
      if (
        options.dividerScope(element) &&
        after.element !== undefined &&
        styles.compute(after.element).border.top &&
        !styles.compute(after.element).hasBackground
      ) {
        const below = round(
          innerSpace(styles, after.element, "top", blockFlow),
        );
        if (Math.abs(below - gap) > 1)
          add(
            "uneven-gap",
            after.element,
            `divider has ${String(gap)}px above but ${String(below)}px below`,
          );
      }
    }
  }

  for (const [role, selector] of Object.entries(options.headingRoles))
    for (const heading of root.querySelectorAll(selector)) {
      if (heading.closest("[hidden]") !== null) continue;
      const signature = headingSignature(styles.compute(heading));
      const bySignature = headings.get(role) ?? new Map<string, string[]>();
      const where = bySignature.get(signature) ?? [];
      where.push(`${options.card}: ${elementPath(heading, root)}`);
      bySignature.set(signature, where);
      headings.set(role, bySignature);
    }

  return { findings, gaps, headings };
}

/** Findings for gaps that differ from the most common one in their kind
 * (block to block, or heading to its content) across every audited card. */
export function unevenGapFindings(gaps: readonly SiblingGap[]): Finding[] {
  const findings: Finding[] = [];
  for (const afterHeading of [false, true]) {
    const group = gaps.filter(
      (gap) => gap.afterHeading === afterHeading && gap.gap >= 1,
    );
    const counts = new Map<number, number>();
    for (const { gap } of group) counts.set(gap, (counts.get(gap) ?? 0) + 1);
    const standard = [...counts].sort(
      (left, right) => right[1] - left[1],
    )[0]?.[0];
    if (standard === undefined) continue;
    for (const gap of group)
      if (Math.abs(gap.gap - standard) > 1)
        findings.push({
          kind: "uneven-gap",
          card: gap.card,
          path: gap.parent,
          detail: `${gap.gap}px between ${gap.before} and ${gap.after}; the usual ${afterHeading ? "heading-to-content" : "block"} gap is ${String(standard)}px`,
        });
  }
  return findings;
}

/** Heading roles whose headings look different from card to card. */
export function headingStyleFindings(audits: readonly CardAudit[]): Finding[] {
  const merged = new Map<string, Map<string, string[]>>();
  for (const audit of audits)
    for (const [role, signatures] of audit.headings) {
      const roleMap = merged.get(role) ?? new Map<string, string[]>();
      for (const [signature, where] of signatures)
        roleMap.set(signature, [...(roleMap.get(signature) ?? []), ...where]);
      merged.set(role, roleMap);
    }
  return [...merged].flatMap(([role, signatures]) =>
    signatures.size < 2
      ? []
      : [
          {
            kind: "heading-style" as const,
            card: "(all cards)",
            path: role,
            detail: [...signatures]
              .map(([signature, where]) => `${signature} — ${where.join("; ")}`)
              .join(" | "),
          },
        ],
  );
}

export function formatFindings(findings: readonly Finding[]): string {
  return findings
    .map(
      (finding) =>
        `[${finding.kind}] ${finding.card} — ${finding.path}: ${finding.detail}`,
    )
    .join("\n");
}
