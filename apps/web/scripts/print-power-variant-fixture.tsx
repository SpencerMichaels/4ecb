import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { PrintPowerVariants } from "../src/PrintPowerVariants";
import type { SheetPowerVariant } from "@4ecb/sheet-model";

const variants: SheetPowerVariant[] = [
  "Synthetic longsword",
  "Synthetic dagger",
].map((equipmentName, index) => ({
  id: `variant-${index}`,
  equipmentName,
  equipped: true,
  attacks: [
    {
      id: `attack-1-${index}`,
      ordinal: 1,
      ability: "Strength",
      powerBonus: 0,
      attack: "+12 vs AC",
      damage: index === 0 ? "2d8+5" : "2d4+5",
      damageType: "fire",
    },
    {
      id: `attack-2-${index}`,
      ordinal: 2,
      ability: "Charisma",
      powerBonus: 0,
      attack: "+10 vs Reflex",
      damage: index === 0 ? "1d8+2" : "1d4+2",
      damageType: "cold and lightning",
    },
  ],
}));
process.stdout.write(
  renderToStaticMarkup(
    createElement(PrintPowerVariants, { variants, attackOrdinals: [1, 2] }),
  ),
);
