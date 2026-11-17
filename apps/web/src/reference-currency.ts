import {
  CURRENCY_DENOMINATIONS,
  parseLegacyCurrency,
  type CurrencyAmount,
} from "@4ecb/character-domain";
import type { SheetValue } from "@4ecb/sheet-model";

/**
 * Compare coin counts without converting denominations or hiding custom text.
 * With merged funds (the "Merge carried and stored funds" setting) the wallet
 * is one Funds column: carried plus stored for each coin. A wallet that isn't
 * coin counts makes the total unknown ("—"), and every wallet text is kept as
 * a note.
 */
export function referenceCurrency(
  values: readonly SheetValue[],
  mergeFunds = false,
) {
  const read = (label: string) => {
    const raw =
      values.find((value) => value.label === label)?.value.trim() ?? "";
    if (!raw || raw === "—") return { raw, amount: undefined };
    try {
      return { raw, amount: parseLegacyCurrency(raw) };
    } catch {
      return { raw, amount: undefined };
    }
  };
  const carried = read("Carried");
  const stored = read("Stored");
  const count = (
    amount: CurrencyAmount | undefined,
    coin: keyof CurrencyAmount,
  ) => (amount ? amount[coin].toLocaleString("en-US") : "—");
  if (mergeFunds) {
    const custom = [carried, stored].some(
      (wallet) => wallet.raw && wallet.raw !== "—" && !wallet.amount,
    );
    const known = [carried.amount, stored.amount].filter(
      (amount) => amount !== undefined,
    );
    return {
      storedEmpty: false,
      headers: ["Coin", "Funds"],
      rows: CURRENCY_DENOMINATIONS.map((coin) => [
        coin.toUpperCase(),
        custom || !known.length
          ? "—"
          : known
              .reduce((sum, amount) => sum + amount[coin], 0)
              .toLocaleString("en-US"),
      ]),
      notes: custom
        ? [carried, stored].flatMap((wallet, i) =>
            wallet.raw && wallet.raw !== "—"
              ? [{ label: i === 0 ? "Carried" : "Stored", value: wallet.raw }]
              : [],
          )
        : [],
    };
  }
  return {
    storedEmpty:
      stored.amount !== undefined &&
      Object.values(stored.amount).every((count) => count === 0),
    headers: ["Coin", "Carried", "Stored"],
    rows: CURRENCY_DENOMINATIONS.map((coin) => {
      return [
        coin.toUpperCase(),
        count(carried.amount, coin),
        count(stored.amount, coin),
      ];
    }),
    notes: [carried, stored].flatMap((wallet, i) =>
      wallet.raw && wallet.raw !== "—" && !wallet.amount
        ? [
            {
              label: i === 0 ? "Carried" : "Stored",
              value: wallet.raw,
            },
          ]
        : [],
    ),
  };
}
