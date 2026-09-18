import { powerActionSymbol } from "./visual-language";

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
      <span aria-hidden="true">{powerActionSymbol(value)}</span>
    </span>
  );
}
