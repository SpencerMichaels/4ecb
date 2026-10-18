import {
  evaluatedHealingSurgeValue,
  type EvaluatedCharacter,
} from "@4ecb/rules-engine";

import type { SheetAdditionalEffect, SheetCard } from "./index";

const key = (value: string) => value.trim().toLocaleLowerCase();

const ACTION_POINT_GROUPS = [
  ["", "Self"],
  ["ALLY.", "Ally"],
  ["BEAST.", "Beast Companion"],
] as const;

/**
 * Mirrors the legacy ActionPointCard: each prefixed "Action Point" stacked
 * textstring splits on ";", an item's text before ":" is its bold name, and a
 * missing final period is added. Groups are labelled only when several exist.
 */
function actionPointEffects(
  evaluation: EvaluatedCharacter,
): SheetAdditionalEffect[] {
  const contributions = evaluation.textContributions ?? [];
  const groups = ACTION_POINT_GROUPS.map(([prefix, label]) => ({
    label,
    items: contributions
      .filter((c) => key(c.name) === key(`${prefix}Action Point`))
      .flatMap((c) =>
        c.value
          .split(";")
          .filter((item) => item.length > 0)
          .map((item) => ({ item, providerId: c.providerId })),
      ),
  })).filter((group) => group.items.length > 0);
  return groups.flatMap((group) =>
    group.items.map(({ item, providerId }) => {
      const separator = item.indexOf(":");
      const name = separator >= 0 ? item.slice(0, separator).trim() : "";
      let text = (separator >= 0 ? item.slice(separator + 1) : item).trim();
      if (!text.endsWith(".")) text += ".";
      const provider =
        groups.length > 1
          ? [group.label, name].filter(Boolean).join(" · ")
          : name;
      return {
        text,
        source: "authoritative-evaluation" as const,
        ...(provider ? { provider } : {}),
        provenanceId: providerId,
      };
    }),
  );
}

const ACTION_POINT_ID = "4ecb:universal:action-point";
const SECOND_WIND_ID = "4ecb:universal:second-wind";

/** Legacy SecondWindCard; healing uses the shared surge value calculation. */
function secondWindCard(
  evaluation: EvaluatedCharacter,
  dwarf: boolean,
): SheetCard {
  const surgeValue = evaluatedHealingSurgeValue(evaluation.stats ?? {});
  const regained =
    surgeValue === undefined
      ? "hit points equal to your healing surge value"
      : `${surgeValue} hit points`;
  return {
    id: SECOND_WIND_ID,
    kind: "power",
    name: "Second Wind",
    usage: "Encounter",
    actionType: dwarf ? "Minor Action" : "Standard Action",
    universal: true,
    fields: [
      { label: "Attack Type", value: "Personal" },
      { label: "Power Type", value: "Utility" },
      {
        label: "Effect",
        value: `You spend a healing surge and regain ${regained}. You gain a +2 bonus to all defenses until the start of your next turn.`,
      },
    ],
    ...(dwarf
      ? {
          additionalEffects: [
            {
              text: "Second wind is a minor action for dwarves.",
              source: "authoritative-evaluation" as const,
            },
          ],
        }
      : {}),
  };
}

/**
 * The legacy builder printed Action Point and Second Wind cards as special
 * cards. Second Wind is a minor action for dwarves (legacy SecondWindCard);
 * Action Point has no content power, so its card is synthesized.
 */
export function withUniversalActionCards(
  cards: readonly SheetCard[],
  evaluation: EvaluatedCharacter,
  race: string | undefined,
): SheetCard[] {
  // Always built here; a content-supplied Second Wind would print twice.
  const others = cards.filter(
    (card) =>
      card.id !== ACTION_POINT_ID &&
      card.id !== SECOND_WIND_ID &&
      key(card.name) !== "second wind",
  );
  const withSecondWind = [
    ...others,
    secondWindCard(evaluation, key(race ?? "") === "dwarf"),
  ];
  const effects = actionPointEffects(evaluation);
  return [
    ...withSecondWind,
    {
      id: ACTION_POINT_ID,
      kind: "power",
      name: "Action Point",
      usage: "Encounter (Special)",
      universal: true,
      fields: [
        { label: "Effect", value: "Gain a standard action this turn." },
        {
          label: "Special",
          value:
            "You are reset to one action point when you take an extended rest. You gain an action point each milestone.",
        },
      ],
      ...(effects.length > 0 ? { additionalEffects: effects } : {}),
    },
  ];
}
