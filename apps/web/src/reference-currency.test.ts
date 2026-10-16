import { describe, expect, it } from "vitest";
import { referenceCurrency } from "./reference-currency";

describe("reference wallet", () => {
  it("dims only a known zero stored balance, never unknown or custom balances", () => {
    for (const value of ["0", "0 gp", "0 ad; 0 pp; 0 gp; 0 sp; 0 cp"])
      expect(referenceCurrency([{ label: "Stored", value }]).storedEmpty).toBe(
        true,
      );
    for (const value of ["—", "", "1 cp", "2 custom coins"])
      expect(referenceCurrency([{ label: "Stored", value }]).storedEmpty).toBe(
        false,
      );
    expect(referenceCurrency([]).storedEmpty).toBe(false);
  });
  it("always shows carried and stored counts without converting coins", () => {
    const wallet = referenceCurrency([
      { label: "Carried", value: "13 gp; 2 sp" },
      { label: "Stored", value: "20 pp; 7 gp" },
    ]);
    expect(wallet.headers).toEqual(["Coin", "Carried", "Stored"]);
    expect(wallet.rows).toContainEqual(["GP", "13", "7"]);
    expect(wallet.rows).toContainEqual(["PP", "0", "20"]);
    expect(wallet.notes).toEqual([]);
  });
  it.each(["—", "0", "0 gp", ""])(
    "retains a zero or absent stored wallet (%s)",
    (stored) => {
      const wallet = referenceCurrency([
        { label: "Carried", value: "1,234 gp" },
        { label: "Stored", value: stored },
      ]);
      expect(wallet.headers).toEqual(["Coin", "Carried", "Stored"]);
      expect(wallet.rows).toContainEqual([
        "GP",
        "1,234",
        stored === "0" || stored === "0 gp" ? "0" : "—",
      ]);
    },
  );
  it("preserves custom currency and does not invent a numeric total", () => {
    const wallet = referenceCurrency([
      { label: "Carried", value: "13 gp; 2 custom coins" },
      { label: "Stored", value: "2 pp" },
    ]);
    expect(wallet.rows).toContainEqual(["PP", "—", "2"]);
    expect(wallet.notes).toEqual([
      { label: "Carried", value: "13 gp; 2 custom coins" },
    ]);
  });
  it("keeps unknown balances distinct from a known zero balance", () => {
    expect(referenceCurrency([]).rows).toContainEqual(["GP", "—", "—"]);
    expect(
      referenceCurrency([{ label: "Carried", value: "0 gp" }]).rows,
    ).toContainEqual(["GP", "0", "—"]);
  });
});
