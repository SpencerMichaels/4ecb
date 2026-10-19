import type { ContentEntity } from "@4ecb/content-domain";
import { classifyPowerEntity } from "@4ecb/sheet-model";

import type { IconName } from "./Icon";

export type LegacyVisualTone =
  | "feature"
  | "at-will"
  | "encounter"
  | "daily"
  | "utility"
  | "item"
  | "neutral";

export function entityVisualTone(entity: ContentEntity): LegacyVisualTone {
  const type = entity.type.trim().toLocaleLowerCase();
  if (
    [
      "magic item",
      "item set",
      "weapon",
      "armor",
      "gear",
      "ritual",
      "ritual scroll",
    ].includes(type)
  )
    return "item";
  if (type !== "power") return "neutral";
  return classifyPowerEntity(entity).tone;
}

export function entityTypeIcon(type: string): IconName {
  switch (type.trim().toLocaleLowerCase()) {
    case "class":
    case "hybrid class":
      return "character";
    case "paragon path":
      return "crown";
    case "epic destiny":
      return "sun";
    case "race":
      return "race";
    case "background":
    case "theme":
      return "background";
    case "power":
      return "power";
    case "feat":
      return "feat";
    case "skill":
    case "skill training":
      return "skill";
    case "magic item":
    case "item set":
    case "weapon":
    case "armor":
    case "gear":
      return "item";
    case "ritual":
      return "book";
    default:
      return "content";
  }
}

export type PowerActionSymbol = "●" | "◔" | "≫" | "○" | "↻" | "↯" | "–";

export function powerActionSymbol(
  value: string | undefined,
): PowerActionSymbol {
  const normalized = value?.trim().toLocaleLowerCase() ?? "";
  if (normalized.includes("no action")) return "–";
  if (normalized === "") return "–";
  if (normalized.includes("interrupt")) return "↯";
  if (normalized.includes("reaction")) return "↻";
  if (normalized.includes("opportunity")) return "↻";
  if (normalized.includes("minor")) return "◔";
  if (normalized.includes("move")) return "≫";
  if (normalized.includes("free")) return "○";
  return "●";
}

export function powerAttackIcon(value: string | undefined): IconName {
  const normalized = value?.trim().toLocaleLowerCase() ?? "";
  if (normalized.includes("melee") && normalized.includes("ranged"))
    return "attack-versatile";
  if (normalized.includes("melee")) return "attack-melee";
  if (normalized.includes("ranged")) return "attack-ranged";
  if (normalized.includes("close")) return "attack-close";
  if (normalized.includes("area")) return "attack-area";
  if (normalized.includes("personal")) return "attack-personal";
  return "action-none";
}

export function visualToneClass(tone: LegacyVisualTone): string {
  return `tone-${tone}`;
}
