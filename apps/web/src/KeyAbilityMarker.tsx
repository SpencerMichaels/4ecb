import type { ReactNode } from "react";

import { Icon } from "./Icon";

const KEY_ABILITY_LABEL = "Key ability for the selected class";

export function KeyAbilityMarker() {
  return (
    <span className="key-ability-marker" title={KEY_ABILITY_LABEL}>
      <Icon name="key-round" />
      <span className="visually-hidden">{KEY_ABILITY_LABEL}</span>
    </span>
  );
}

export function KeyAbilityName({
  children,
  className,
  marked,
}: {
  readonly children?: ReactNode;
  readonly className?: string;
  readonly marked: boolean;
}) {
  return (
    <span className={["key-ability-name", className].filter(Boolean).join(" ")}>
      <span>{children}</span>
      {marked ? <KeyAbilityMarker /> : null}
    </span>
  );
}

export function KeyAbilitiesSummary({
  sentence,
}: {
  readonly sentence?: string | undefined;
}) {
  return sentence === undefined ? null : (
    <p className="field-help class-key-abilities">{sentence}</p>
  );
}
