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

function selectorTerms(operand: string): readonly string[] {
  return operand
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function matchesTerms(
  categories: ReadonlySet<string>,
  properties: ReadonlySet<string>,
  operand: string,
): boolean {
  return selectorTerms(operand).every((term) => {
    const negated = term.startsWith("!");
    const value = negated ? term.slice(1) : term;
    const match = categories.has(value) || properties.has(value);
    return negated ? !match : match;
  });
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
        (operand.length === 0 ||
          operand === "*" ||
          matchesTerms(categories, properties, operand))
      );
    case "weapon":
      return (
        item.type.toLocaleLowerCase() === "weapon" &&
        (operand.length === 0 || matchesTerms(categories, properties, operand))
      );
    case "implement":
      return (
        categories.has("implement") &&
        (operand.length === 0 || matchesTerms(categories, properties, operand))
      );
    case "slot":
      return operand.length === 0
        ? item.slot !== undefined
        : item.slot?.toLocaleLowerCase() === operand;
    case "only-weapon":
      return (
        item.type.toLocaleLowerCase() === "weapon" &&
        (operand.length === 0 || matchesTerms(categories, properties, operand))
      );
    case "versatile":
      return (
        properties.has("versatile") &&
        (operand.length === 0 || matchesTerms(categories, properties, operand))
      );
    case "defensive":
      return properties.has("defensive");
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
  if (value.startsWith("only-weapon:")) {
    const weapons = state.items.filter(
      (item) => item.quantity > 0 && item.type.toLocaleLowerCase() === "weapon",
    );
    return (
      weapons.reduce((sum, item) => sum + item.quantity, 0) === 1 &&
      weapons.some((item) => matchesEquipmentSelector(item, value))
    );
  }
  if (value.startsWith("dual-wielding:")) {
    const operand = value.slice("dual-wielding:".length);
    const weapons = state.items
      .filter(
        (item) =>
          item.quantity > 0 && item.type.toLocaleLowerCase() === "weapon",
      )
      .flatMap((item) => Array.from({ length: item.quantity }, () => item));
    const terms = selectorTerms(operand);
    if (terms.length === 0) return weapons.length >= 2;
    if (terms.length === 1)
      return (
        weapons.filter((item) =>
          matchesEquipmentSelector(item, `weapon:${terms[0]}`),
        ).length >= 2
      );
    const assign = (
      remaining: readonly EquippedItem[],
      index: number,
    ): boolean => {
      if (index >= terms.length) return true;
      const term = terms[index];
      if (term === undefined) return true;
      return remaining.some(
        (item, itemIndex) =>
          matchesEquipmentSelector(item, `weapon:${term}`) &&
          assign(
            remaining.filter(
              (_, candidateIndex) => candidateIndex !== itemIndex,
            ),
            index + 1,
          ),
      );
    };
    return assign(weapons, 0);
  }
  if (
    value === "dual-shields" ||
    value === "dual-shielding:" ||
    value === "dual-shield:"
  )
    return (
      state.items
        .filter((item) => normalized(item.categories).has("shield"))
        .reduce((sum, item) => sum + item.quantity, 0) >= 2
    );
  return state.items.some(
    (item) => item.quantity > 0 && matchesEquipmentSelector(item, selector),
  );
}
