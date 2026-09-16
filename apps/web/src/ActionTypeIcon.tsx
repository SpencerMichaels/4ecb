import { powerActionSymbol } from "./visual-language";

export function ActionTypeIcon({
  value,
}: {
  readonly value: string | undefined;
}) {
  const label = value || "Action not specified";

  return (
    <span
      className="selection-metadata-icon action-type-icon"
      aria-label={label}
      title={label}
    >
      <span aria-hidden="true">{powerActionSymbol(value)}</span>
    </span>
  );
}
