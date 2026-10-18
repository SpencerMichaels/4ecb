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
        cardOnly: true,
        provenanceId: providerId,
      };
    }),
  );
}

const ACTION_POINT_ID = "4ecb:universal:action-point";

/** Encounter powers whose own effect spends your second wind (e.g. Dwarven
 *  Resilience) share its single use; allies' second winds do not count. */
function spendsOwnSecondWind(card: SheetCard): boolean {
  return (
    /^encounter\b/i.test(card.usage ?? "") &&
    card.fields.some(
      (field) =>
        /^(?:effect|hit)$/i.test(field.label.trim()) &&
        /\byou (?:can )?use your second wind\b/i.test(field.value),
    )
  );
}
const SECOND_WIND_ID = "4ecb:universal:second-wind";

/** `modify name="Second Wind"` overlays, matched by name so no content Second
 *  Wind power is required. `Action Type` changes the card's action (last rule
 *  wins, as for any power field); other fields become labeled notes, e.g.
 *  Stoneheart Warrior or the corrected Dwarven Resilience trait. */
function secondWindOverlays(evaluation: EvaluatedCharacter) {
  const overlays = (evaluation.overlays ?? []).filter(
    (overlay) =>
      overlay.value?.trim() && key(overlay.targetName ?? "") === "second wind",
  );
  const actionType = overlays
    .filter((overlay) => key(overlay.field) === "action type")
    .at(-1)
    ?.value?.trim();
  const notes: SheetAdditionalEffect[] = overlays
    .filter((overlay) => key(overlay.field) !== "action type")
    .map((overlay) => ({
      text: overlay.value!.trim(),
      source: "authoritative-evaluation" as const,
      provider: overlay.field,
      provenanceId: overlay.providerOccurrenceId,
      cardOnly: true,
    }));
  return { actionType, notes };
}

/** Legacy SecondWindCard; healing uses the shared surge value calculation. */
function secondWindCard(evaluation: EvaluatedCharacter): SheetCard {
  const { actionType, notes } = secondWindOverlays(evaluation);
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
    sharedUsage: "Second Wind",
    actionType: actionType ?? "Standard Action",
    universal: true,
    fields: [
      { label: "Attack Type", value: "Personal" },
      { label: "Power Type", value: "Utility" },
      {
        label: "Effect",
        value: `You spend a healing surge and regain ${regained}. You gain a +2 bonus to all defenses until the start of your next turn.`,
      },
    ],
    ...(notes.length > 0 ? { additionalEffects: notes } : {}),
  };
}

/**
 * The legacy builder printed Action Point and Second Wind cards as special
 * cards. Action Point has no content power, so its card is synthesized.
 */
export function withUniversalActionCards(
  cards: readonly SheetCard[],
  evaluation: EvaluatedCharacter,
): SheetCard[] {
  // Always built here; a content-supplied Second Wind would print twice.
  const others = cards.filter(
    (card) =>
      card.id !== ACTION_POINT_ID &&
      card.id !== SECOND_WIND_ID &&
      key(card.name) !== "second wind",
  );
  const withSecondWind = [
    ...others.map((card) =>
      spendsOwnSecondWind(card)
        ? { ...card, sharedUsage: "Second Wind" as const }
        : card,
    ),
    secondWindCard(evaluation),
  ];
  const effects = actionPointEffects(evaluation);
  return [
    ...withSecondWind,
    {
      id: ACTION_POINT_ID,
      kind: "power",
      name: "Action Point",
      usage: "Encounter (Special)",
      // Spending a point is a free action (legacy ActionPointCard rules text).
      actionType: "Free Action",
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
