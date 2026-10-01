import type { SheetPowerAttack, SheetPowerVariant } from "@4ecb/sheet-model";

type AttackCell = Pick<
  SheetPowerAttack,
  | "attack"
  | "ability"
  | "powerBonus"
  | "damage"
  | "damageType"
  | "weaponRole"
  | "eligible"
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
    powerBonus: variant.powerBonus ?? 0,
    ...(variant.damage === undefined ? {} : { damage: variant.damage }),
    ...(variant.damageType === undefined
      ? {}
      : { damageType: variant.damageType }),
  };
}

function sameCalculation(
  left: AttackCell | undefined,
  right: AttackCell | undefined,
): boolean {
  if (left === undefined || right === undefined) return left === right;
  return (
    left.attack === right.attack &&
    left.ability === right.ability &&
    left.powerBonus === right.powerBonus &&
    left.damage === right.damage &&
    left.damageType === right.damageType &&
    left.weaponRole === right.weaponRole &&
    (left.eligible !== false) === (right.eligible !== false)
  );
}

function attackBonus(cell: AttackCell | undefined): string {
  if (cell === undefined || cell.eligible === false) return "—";
  return cell.attack.includes("Unknown")
    ? "—"
    : (cell.attack.match(/^[+-]?\d+/)?.[0] ?? "—");
}

function DamageSummary({ cell }: { readonly cell: AttackCell | undefined }) {
  if (
    cell === undefined ||
    cell.eligible === false ||
    cell.damage === undefined
  )
    return <>—</>;
  const damage = cell.damage?.replace(/\s*([+-])\s*/g, " $1 ");
  return (
    <>
      <span className="print-variant-expression">{damage}</span>
      {cell.damageType === undefined ? "" : ` ${cell.damageType}`}
    </>
  );
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
  const rows = variants.map((variant) => ({
    variant,
    cells: ordinals.map((ordinal) => variantCell(variant, ordinal)),
  }));
  const shared = rows.every(({ cells }) =>
    cells.slice(1).every((cell) => sameCalculation(cells[0], cell)),
  );
  const displayedOrdinals = shared ? ordinals.slice(0, 1) : ordinals;
  return (
    <div className="print-card-weapon-variants">
      <table
        className="print-card-variant-table"
        aria-label="Weapon calculations by attack"
      >
        {shared ? null : (
          <thead>
            <tr>
              <th scope="col">Weapon</th>
              {displayedOrdinals.map((ordinal) => (
                <th scope="col" key={ordinal}>
                  Attack {ordinal}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {rows.map(({ variant, cells }) => (
            <tr key={variant.id}>
              <th scope="row">{variant.equipmentName}</th>
              {shared ? (
                <>
                  <td className="print-variant-bonus" aria-label="To hit">
                    {attackBonus(cells[0])}
                  </td>
                  <td aria-label="Damage">
                    <DamageSummary cell={cells[0]} />
                  </td>
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
