import type { SheetPowerAttack, SheetPowerVariant } from "@4ecb/sheet-model";

import { nameWithBoundEnhancement } from "./print-item-presentation";

type AttackCell = Pick<
  SheetPowerAttack,
  "attack" | "ability" | "damage" | "eligible"
>;

function variantCell(
  variant: SheetPowerVariant,
  ordinal: number,
): AttackCell | undefined {
  if (variant.attacks !== undefined)
    return variant.attacks.find((attack) => attack.ordinal === ordinal);
  if (ordinal !== 1 || variant.attack === undefined) return undefined;
  return {
    attack: variant.attack,
    ability: variant.ability ?? "Ability",
    ...(variant.damage === undefined ? {} : { damage: variant.damage }),
  };
}

function sameCalculation(
  left: AttackCell | undefined,
  right: AttackCell | undefined,
): boolean {
  if (left === undefined || right === undefined) return left === right;
  return (
    attackBonus(left) === attackBonus(right) &&
    left.ability.trim().toLocaleLowerCase() ===
      right.ability.trim().toLocaleLowerCase() &&
    left.damage?.replace(/\s+/g, "") === right.damage?.replace(/\s+/g, "") &&
    (left.eligible !== false) === (right.eligible !== false)
  );
}

function attackBonus(cell: AttackCell | undefined): string {
  if (cell === undefined || cell.eligible === false) return "—";
  return cell.attack.includes("Unknown")
    ? "—"
    : (cell.attack.match(/^[+-]?\d+/)?.[0] ?? "—");
}

function equipmentOrder(variant: SheetPowerVariant): number {
  if (!variant.equipped) return 3;
  return variant.hand === "main" ? 0 : variant.hand === "off" ? 1 : 2;
}

function DamageSummary({ cell }: { readonly cell: AttackCell | undefined }) {
  if (
    cell === undefined ||
    cell.eligible === false ||
    cell.damage === undefined
  )
    return <>—</>;
  const damage = cell.damage.replace(/\s*\+\s*/g, "+");
  return <span className="print-variant-expression">{damage}</span>;
}

function AttackSummary({ cell }: { readonly cell: AttackCell | undefined }) {
  if (cell === undefined || cell.eligible === false) return <>—</>;
  return (
    <>
      <span className="print-variant-bonus">{attackBonus(cell)}</span>
      {cell.damage === undefined ? null : (
        <>
          {" "}
          <wbr />
          <span className="print-variant-damage">
            → <DamageSummary cell={cell} />
          </span>
        </>
      )}
    </>
  );
}

export function PrintPowerVariants({
  variants,
  attackOrdinals,
}: {
  readonly variants: readonly SheetPowerVariant[];
  readonly attackOrdinals: readonly number[];
}) {
  if (variants.length === 0) return null;
  const ordinals = [
    ...new Set([
      ...attackOrdinals,
      ...variants.flatMap(
        (variant) => variant.attacks?.map((attack) => attack.ordinal) ?? [1],
      ),
    ]),
  ].sort((a, b) => a - b);
  const rows = variants
    .map((variant) => ({
      variant,
      cells: ordinals.map((ordinal) => variantCell(variant, ordinal)),
    }))
    .sort(
      (left, right) =>
        equipmentOrder(left.variant) - equipmentOrder(right.variant),
    );
  const shared = rows.every(({ cells }) =>
    cells.slice(1).every((cell) => sameCalculation(cells[0], cell)),
  );
  const splitDamage =
    !shared &&
    rows.every(({ cells }) => {
      const bonus = attackBonus(cells[0]);
      return (
        bonus !== "—" && cells.every((cell) => attackBonus(cell) === bonus)
      );
    }) &&
    rows.some(({ cells }) =>
      cells
        .slice(1)
        .some(
          (cell) =>
            cell?.damage?.replace(/\s+/g, "") !==
            cells[0]?.damage?.replace(/\s+/g, ""),
        ),
    );
  const displayedOrdinals = shared ? ordinals.slice(0, 1) : ordinals;
  return (
    <div className="print-card-weapon-variants">
      <table
        className="print-card-variant-table"
        aria-label="Weapon calculations by attack"
      >
        <thead>
          <tr>
            <th scope="col">Weapon</th>
            {shared || splitDamage ? (
              <>
                <th scope="col">{splitDamage ? "Attacks" : "Attack"}</th>
                {displayedOrdinals.map((ordinal) => (
                  <th scope="col" key={ordinal}>
                    {shared ? "Damage" : `Dmg ${ordinal}`}
                  </th>
                ))}
              </>
            ) : (
              displayedOrdinals.map((ordinal) => (
                <th scope="col" key={ordinal}>
                  Attack {ordinal}
                </th>
              ))
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ variant, cells }) => (
            <tr key={variant.id}>
              <th scope="row">
                {nameWithBoundEnhancement(variant.equipmentName)}
              </th>
              {shared || splitDamage ? (
                <>
                  <td className="print-variant-bonus" aria-label="To hit">
                    {attackBonus(cells[0])}
                  </td>
                  {displayedOrdinals.map((ordinal, index) => (
                    <td
                      key={ordinal}
                      aria-label={shared ? "Damage" : `Damage ${ordinal}`}
                    >
                      <DamageSummary cell={cells[index]} />
                    </td>
                  ))}
                </>
              ) : (
                displayedOrdinals.map((ordinal, index) => (
                  <td key={ordinal}>
                    <AttackSummary cell={cells[index]} />
                  </td>
                ))
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
