import { powerActionSymbol, type PowerActionSymbol } from "./visual-language";
import { Icon, type IconName } from "./Icon";

/**
 * Lucide icons for the action symbols. As text glyphs (● ◔ ≫ ○) they took
 * their size from whichever symbol font a computer had, so printed cards
 * differed between browsers. Standard is the free circle, filled by CSS.
 */
const SYMBOL_ICONS: Readonly<Record<PowerActionSymbol, IconName>> = {
  "●": "circle",
  "◔": "action-minor",
  "≫": "action-move",
  "○": "circle",
  "↻": "action-reaction",
  "↯": "trending-up",
  "–": "action-none",
};

export function ActionTypeIcon({
  decorative = false,
  value,
}: {
  readonly decorative?: boolean;
  readonly value: string | undefined;
}) {
  const label = value?.trim();
  if (!label) return null;
  const symbol = powerActionSymbol(value);

  return (
    <span
      className={`selection-metadata-icon action-type-icon${symbol === "●" ? " is-standard-action" : ""}`}
      aria-hidden={decorative ? "true" : undefined}
      aria-label={decorative ? undefined : label}
      title={label}
    >
      {label.toLocaleLowerCase().includes("interrupt") ? (
        <Icon name="trending-up" />
      ) : /^no action\b/i.test(label) ? (
        <Icon name="action-none" />
      ) : /\bopportunity\b/i.test(label) ? (
        <Icon name="action-opportunity" />
      ) : /\breaction\b/i.test(label) ? (
        <Icon name="action-reaction" />
      ) : (
        <Icon name={SYMBOL_ICONS[symbol]} />
      )}
    </span>
  );
}
