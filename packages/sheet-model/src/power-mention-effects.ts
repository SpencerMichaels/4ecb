import {
  entityNames,
  readPowerMentions,
  type ContentEntity,
} from "@4ecb/content-domain";
import type { EvaluatedCharacter } from "@4ecb/rules-engine";

import { featureNoteText, featureReminderText } from "./feature-notes";

/** A power card's Additional Effects line (sheet-model `index.ts`). */
export interface PowerMentionEffect {
  readonly text: string;
  readonly source: "authoritative-evaluation";
  readonly provider: string;
  readonly provenanceId: string;
}

/** A holding the character carries, for its item's mentions. */
export interface PowerMentionHolding {
  readonly id: string;
  /** Its display name; the item's record name when missing. */
  readonly name?: string | undefined;
  readonly equipped: boolean;
}

const key = (value: string) => value.trim().toLocaleLowerCase();

/** "Text - Provider." as the engine's rider lines read. */
function riderLine(text: string, provider: string): string {
  return `${text.trim().replace(/[.\s]+$/u, "")} - ${provider}.`;
}

/**
 * The Additional Effects lines of the feats and equipped magic items whose
 * text names a power (the pack's `_Power Mentions IR`, D126), by the
 * mentioned power's name (lower case). A feat's line is its page-1 note
 * (`featureReminderText`), an item's its Property; each carries the
 * occurrence the overview resolves to the feat's or holding's own
 * reminder, which the card then covers. Items count only when `holdings`
 * says their holding is equipped. Once per evaluation, not per card.
 */
export function powerMentionEffects(
  evaluation: Pick<EvaluatedCharacter, "activeDefinitions" | "level" | "stats">,
  lookup: (id: string) => ContentEntity | undefined,
  holdings: readonly PowerMentionHolding[] = [],
): ReadonlyMap<string, readonly PowerMentionEffect[]> {
  const byPower = new Map<string, PowerMentionEffect[]>();
  const equipped = new Map(
    holdings.filter(({ equipped }) => equipped).map((h) => [h.id, h]),
  );
  const add = (powers: readonly string[], effect: PowerMentionEffect) => {
    for (const power of powers) {
      const list = byPower.get(key(power)) ?? [];
      if (!list.some((known) => known.text === effect.text)) list.push(effect);
      byPower.set(key(power), list);
    }
  };
  for (const membership of evaluation.activeDefinitions) {
    const entity = lookup(membership.definitionId);
    const powers =
      entity === undefined ? undefined : readPowerMentions(entity.specifics);
    if (entity === undefined || powers === undefined) continue;
    if (key(entity.type) === "feat") {
      const occurrence = membership.occurrenceIds[0];
      const note = featureReminderText(
        entity,
        featureNoteText(entity) || entity.description,
        evaluation.level,
        evaluation.stats,
      );
      if (occurrence === undefined || note.trim() === "") continue;
      add(powers, {
        text: riderLine(note, entity.name),
        source: "authoritative-evaluation",
        provider: entity.name,
        provenanceId: occurrence,
      });
      continue;
    }
    const property = entity.specifics
      .filter((field) => key(field.name) === "property")
      .map((field) => field.value.trim())
      .filter(Boolean)
      .join(" ");
    if (property === "") continue;
    for (const occurrence of membership.occurrenceIds) {
      const holding = equipped.get(
        /^(.+):definition:\d+$/u.exec(occurrence)?.[1] ?? "",
      );
      if (holding === undefined) continue;
      const name = holding.name?.trim() || entity.name;
      add(powers, {
        text: riderLine(property, name),
        source: "authoritative-evaluation",
        provider: name,
        provenanceId: occurrence,
      });
    }
  }
  return byPower;
}

/** The mention lines for a power card: those of any of its names, less a
 *  provider the card already lists a rider of. */
export function powerCardMentionEffects(
  mentions: ReadonlyMap<string, readonly PowerMentionEffect[]>,
  power: Pick<ContentEntity, "name" | "aliases">,
  shownProviders: readonly (string | undefined)[],
): readonly PowerMentionEffect[] {
  if (mentions.size === 0) return [];
  const shown = new Set(
    shownProviders.flatMap((provider) =>
      provider === undefined ? [] : [key(provider)],
    ),
  );
  const seen = new Set<string>();
  return entityNames(power).flatMap((name) =>
    (mentions.get(key(name)) ?? []).filter((effect) => {
      if (shown.has(key(effect.provider)) || seen.has(effect.text))
        return false;
      seen.add(effect.text);
      return true;
    }),
  );
}
