import {
  CURRENCY_DENOMINATIONS,
  parseLegacyCurrency,
  type CurrencyAmount,
} from "@4ecb/character-domain";
import type { SheetValue } from "@4ecb/sheet-model";

/** Compare coin counts without converting denominations or hiding custom text. */
export function referenceCurrency(values: readonly SheetValue[]) {
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
