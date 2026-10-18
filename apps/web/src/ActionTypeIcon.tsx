import { powerActionSymbol } from "./visual-language";
import { Icon } from "./Icon";

export function ActionTypeIcon({
  decorative = false,
  value,
}: {
  readonly decorative?: boolean;
  readonly value: string | undefined;
}) {
  const label = value?.trim();
  if (!label) return null;

  return (
    <span
      className="selection-metadata-icon action-type-icon"
      aria-hidden={decorative ? "true" : undefined}
      aria-label={decorative ? undefined : label}
      title={label}
    >
      {label.toLocaleLowerCase().includes("interrupt") ? (
        <Icon name="trending-up" />
      ) : /^no action\b/i.test(label) ? (
        <Icon name="action-none" />
      ) : (
        <span aria-hidden="true">{powerActionSymbol(value)}</span>
      )}
    </span>
  );
}
