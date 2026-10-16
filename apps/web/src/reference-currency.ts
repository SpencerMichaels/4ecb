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
  const showStored = stored.amount
    ? Object.values(stored.amount).some((count) => count > 0)
    : Boolean(stored.raw && stored.raw !== "—");
  const count = (
    amount: CurrencyAmount | undefined,
    coin: keyof CurrencyAmount,
  ) => (amount ? amount[coin].toLocaleString("en-US") : "—");
  return {
    headers: showStored
      ? ["Coin", "Carried", "Stored", "Total"]
      : ["Coin", "Amount"],
    rows: CURRENCY_DENOMINATIONS.map((coin) => {
      if (!showStored) return [coin.toUpperCase(), count(carried.amount, coin)];
      const total =
        carried.amount && stored.amount
          ? carried.amount[coin] + stored.amount[coin]
          : undefined;
      return [
        coin.toUpperCase(),
        count(carried.amount, coin),
        count(stored.amount, coin),
        total !== undefined && Number.isSafeInteger(total)
          ? total.toLocaleString("en-US")
          : "—",
      ];
    }),
    notes: [carried, ...(showStored ? [stored] : [])].flatMap((wallet, i) =>
      wallet.raw && wallet.raw !== "—" && !wallet.amount
        ? [
            {
              label: showStored ? (i === 0 ? "Carried" : "Stored") : "",
              value: wallet.raw,
            },
          ]
        : [],
    ),
  };
}
