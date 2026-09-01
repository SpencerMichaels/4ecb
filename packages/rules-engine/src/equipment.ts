export interface EquippedItem {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly categories: readonly string[];
  readonly properties: readonly string[];
  readonly slot?: string;
  readonly hands?: number;
  readonly quantity: number;
}

export interface EquipmentState {
  readonly items: readonly EquippedItem[];
}

function normalized(values: readonly string[]): Set<string> {
  return new Set(
    values.map((value) => value.trim().toLocaleLowerCase()).filter(Boolean),
  );
}

export function matchesEquipmentSelector(
  item: EquippedItem,
  selector: string,
): boolean {
  const value = selector.trim().toLocaleLowerCase();
  const categories = normalized([item.type, ...item.categories]);
  const properties = normalized(item.properties);
  if (value === "*") return true;
  const colon = value.indexOf(":");
  const prefix = colon < 0 ? "" : value.slice(0, colon);
  const operand = colon < 0 ? value : value.slice(colon + 1);
  switch (prefix) {
    case "armor":
      return (
        item.type.toLocaleLowerCase() === "armor" &&
        (operand.length === 0 || categories.has(operand))
      );
    case "weapon":
      return (
        item.type.toLocaleLowerCase() === "weapon" &&
        (operand.length === 0 ||
          categories.has(operand) ||
          properties.has(operand))
      );
    case "implement":
      return (
        categories.has("implement") &&
        (operand.length === 0 || categories.has(operand))
      );
    case "slot":
      return operand.length === 0
        ? item.slot !== undefined
        : item.slot?.toLocaleLowerCase() === operand;
    case "only-weapon":
      return (
        item.type.toLocaleLowerCase() === "weapon" &&
        (operand.length === 0 || categories.has(operand))
      );
    case "versatile":
      return (
        properties.has("versatile") &&
        (item.hands ?? 1) >= 2 &&
        (operand.length === 0 || categories.has(operand))
      );
    default:
      return (
        categories.has(value) ||
        properties.has(value) ||
        item.name.toLocaleLowerCase() === value ||
        item.id.toLocaleLowerCase() === value
      );
  }
}

export function equipmentPredicate(
  state: EquipmentState,
  selector: string,
): boolean {
  const value = selector.trim().toLocaleLowerCase();
  if (value.startsWith("dual-wielding:")) {
    const operand = value.slice("dual-wielding:".length);
    return (
      state.items
        .filter(
          (item) =>
            item.type.toLocaleLowerCase() === "weapon" &&
            (operand.length === 0 ||
              matchesEquipmentSelector(item, `weapon:${operand}`)),
        )
        .reduce((sum, item) => sum + item.quantity, 0) >= 2
    );
  }
  if (value === "dual-shields" || value === "dual-shielding:")
    return (
      state.items
        .filter((item) => normalized(item.categories).has("shield"))
        .reduce((sum, item) => sum + item.quantity, 0) >= 2
    );
  return state.items.some(
    (item) => item.quantity > 0 && matchesEquipmentSelector(item, selector),
  );
}
