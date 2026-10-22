/**
 * Assertions and markup helpers for the visual-review verifier's checks
 * (verify-visual-review.ts). Each check states what it compared, so a
 * failure reads as actual vs expected.
 */
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { VerifiedCheck } from "../../../scripts/visual-review-page";
import type { ReviewContext, ReviewCharacter } from "./visual-review-context";

export type Check = VerifiedCheck;
export type Probe = (context: ReviewContext) => Check[] | Promise<Check[]>;

/** A page row's checks: the character's slug (or "general:<section>"), the
 *  plan link's label, and the checklist item's title prefix. */
export interface Rule {
  readonly where: string;
  readonly link: string;
  readonly item: string;
  readonly run: Probe;
}

/* ------------------------------------------------------------------ */
/* Assertions                                                          */
/* ------------------------------------------------------------------ */

const show = (value: unknown): string =>
  value === undefined ? "undefined" : JSON.stringify(value);

export function equal(
  label: string,
  actual: unknown,
  expected: unknown,
): Check {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  return {
    label,
    pass,
    detail: pass
      ? show(actual)
      : `got ${show(actual)}; expected ${show(expected)}`,
  };
}

export function truthy(label: string, pass: boolean, detail = ""): Check {
  return { label, pass, detail };
}

/** `text` contains `needle` (whitespace-normalized). */
export function contains(label: string, text: string, needle: string): Check {
  const haystack = squash(text);
  const wanted = squash(needle);
  const at = haystack.indexOf(wanted);
  return at >= 0
    ? { label, pass: true, detail: `found ${show(wanted)}` }
    : {
        label,
        pass: false,
        detail: `${show(wanted)} not found in ${show(haystack.length > 400 ? `${haystack.slice(0, 400)}…` : haystack)}`,
      };
}

export function lacks(label: string, text: string, needle: string): Check {
  const at = squash(text).indexOf(squash(needle));
  return at < 0
    ? { label, pass: true, detail: `no ${show(needle)}` }
    : {
        label,
        pass: false,
        detail: `found ${show(needle)} in ${show(squash(text).slice(Math.max(0, at - 120), at + 160))}`,
      };
}

/** `needles` appear in this order in `text`. */
export function inOrder(
  label: string,
  text: string,
  needles: readonly string[],
): Check {
  const haystack = squash(text);
  let from = 0;
  for (const needle of needles) {
    const at = haystack.indexOf(squash(needle), from);
    if (at < 0)
      return {
        label,
        pass: false,
        detail: `${show(needle)} missing${from === 0 ? "" : " after the earlier ones"} (order wanted: ${needles.map(show).join(" → ")})`,
      };
    from = at + squash(needle).length;
  }
  return { label, pass: true, detail: needles.map(show).join(" → ") };
}

export const squash = (value: string): string =>
  value.replace(/\s+/g, " ").trim();

/* ------------------------------------------------------------------ */
/* Markup                                                              */
/* ------------------------------------------------------------------ */

export function markup(element: ReactElement): string {
  return renderToStaticMarkup(element);
}

export { createElement };

/** Visible text of static markup, entities decoded, whitespace squashed. */
export function textOf(html: string): string {
  return squash(
    html
      .replace(/<(script|style)[\s\S]*?<\/\1>/g, " ")
      .replace(/<br\s*\/?>/g, " ")
      .replace(/<\/(p|div|li|tr|h\d|dt|dd|section|header|footer)>/g, " ")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#x27;|&#39;/g, "'")
      .replace(/&amp;/g, "&"),
  );
}

/** The markup of each element with this class (outermost match). */
export function elementsWithClass(html: string, className: string): string[] {
  const results: string[] = [];
  const opening = new RegExp(
    `<(\\w+)[^>]*class="(?:[^"]* )?${className.replace(/[-]/g, "\\-")}(?: [^"]*)?"[^>]*>`,
    "g",
  );
  for (const match of html.matchAll(opening)) {
    const tag = match[1]!;
    let depth = 0;
    const tokens = new RegExp(`<(/?)${tag}\\b[^>]*?(/?)>`, "g");
    tokens.lastIndex = match.index;
    for (const token of html.matchAll(tokens)) {
      if (token.index < match.index) continue;
      if (token[2] === "/") continue;
      depth += token[1] === "/" ? -1 : 1;
      if (depth === 0) {
        results.push(html.slice(match.index, token.index + token[0].length));
        break;
      }
    }
  }
  return results;
}

export type { ReviewCharacter, ReviewContext };
