import { createContext, useContext, type ReactNode } from "react";

import type { ContentEntity } from "@4ecb/content-domain";
import {
  authoredSheetPowerCard,
  sheetItemCard,
  type SheetCard,
} from "@4ecb/sheet-model";

import { HideFlavortextContext } from "./HideFlavortextContext";
import { ItemCard } from "./ItemCard";
import { PowerCard, type CardTextPresentation } from "./PowerCard";
import {
  abbreviatePowerAbilities,
  expandWeaponDice,
  renderPowerText,
} from "./PowerCardPresentation";
import { defaultPrintVariant } from "./print-power-attacks";

/**
 * How builder detail panes turn content into the shared printed cards. The
 * Build tab compares choices with authored formulas (D067); the Equipment
 * tab shows the character's evaluated card exactly as the sheet prints it.
 */
export interface BuilderCardSettings {
  readonly powerCardFor: (entity: ContentEntity) => SheetCard;
  /** Selects the power text tier shown on cards. */
  readonly characterLevel: number;
  readonly showEquippedAttackBonus: boolean;
  readonly abbreviateAbilityValues: boolean;
  readonly expandWeaponDice: boolean;
}

export function authoredBuilderCardSettings(
  characterLevel: number,
): BuilderCardSettings {
  return {
    powerCardFor: (entity) =>
      authoredSheetPowerCard(entity, abbreviatePowerAbilities),
    characterLevel,
    showEquippedAttackBonus: false,
    abbreviateAbilityValues: false,
    expandWeaponDice: false,
  };
}

export const BuilderCardContext = createContext<BuilderCardSettings>(
  authoredBuilderCardSettings(1),
);

function cardTextPresentation(
  card: SheetCard,
  settings: BuilderCardSettings,
): CardTextPresentation {
  const weaponDamage = defaultPrintVariant(card)?.weaponDamage;
  return {
    ...(settings.expandWeaponDice
      ? { transform: (value: string) => expandWeaponDice(value, weaponDamage) }
      : {}),
    ...(settings.abbreviateAbilityValues
      ? { renderText: (text: string) => renderPowerText(text, true) }
      : {}),
  };
}

function headingIdFor(entity: ContentEntity, suffix = ""): string {
  return `card-${entity.id.replaceAll(/[^a-zA-Z0-9_-]/g, "-")}${suffix}`;
}

export function BuilderPowerCard({
  entity,
  headingSuffix,
  subheading,
}: {
  readonly entity: ContentEntity;
  readonly headingSuffix?: string;
  readonly subheading?: ReactNode;
}) {
  const settings = useContext(BuilderCardContext);
  const hideFlavortext = useContext(HideFlavortextContext);
  const card = settings.powerCardFor(entity);
  return (
    <PowerCard
      card={card}
      characterLevel={settings.characterLevel}
      showEquippedAttackBonus={settings.showEquippedAttackBonus}
      showPrintTitleActionIcon
      layout="panel"
      panel={{
        headingId: headingIdFor(entity, headingSuffix),
        subheading,
        ...(hideFlavortext || card.flavor === undefined
          ? {}
          : { flavor: card.flavor }),
        textPresentation: cardTextPresentation(card, settings),
      }}
    />
  );
}

export function BuilderItemCard({
  name,
  entities,
  headingSuffix,
  subheading,
}: {
  readonly name: string;
  readonly entities: readonly ContentEntity[];
  readonly headingSuffix?: string;
  readonly subheading?: ReactNode;
}) {
  const settings = useContext(BuilderCardContext);
  const hideFlavortext = useContext(HideFlavortextContext);
  const entity = entities.at(-1);
  if (entity === undefined) return null;
  const card = sheetItemCard({ name, entities });
  return (
    <ItemCard
      card={card}
      showActionIcons
      layout="panel"
      panel={{
        headingId: headingIdFor(entity, headingSuffix),
        subheading,
        ...(hideFlavortext || card.flavor === undefined
          ? {}
          : { flavor: card.flavor }),
        textPresentation: cardTextPresentation(card, settings),
      }}
    />
  );
}
