import { Icon } from "./Icon";

const KEY_ABILITY_LABEL = "Key ability for the selected class";

export function KeyAbilityMarker() {
  return (
    <span className="key-ability-marker" title={KEY_ABILITY_LABEL}>
      <Icon name="key" />
      <span className="visually-hidden">{KEY_ABILITY_LABEL}</span>
    </span>
  );
}
