import type { SheetCard } from "@4ecb/sheet-model";
import { abbreviatePowerAbilities } from "./PowerCardPresentation";
import {
  defaultPrintAttacks,
  defaultPrintVariant,
} from "./print-power-attacks";

const ordinal = (name: string) =>
  new Map([
    ["primary", 1],
    ["secondary", 2],
    ["tertiary", 3],
    ["quaternary", 4],
  ]).get(name.split(" ")[0]!);
const compact = (value: string) =>
  abbreviatePowerAbilities(value)
    .replace(/\s*\([+-]\d+\)/g, "")
    .replace(/\bFortitude\b/gi, "Fort")
    .replace(/\bReflex\b/gi, "Ref")
    .replace(/\bvs\.\s*/gi, "vs ")
    .replace(/\s*\+\s*/g, "+")
    .trim();
/** Equipped/default variant totals, sharing the physical card's phase projection. */
export function referencePowerRows(
  card: SheetCard,
): readonly (readonly string[])[] {
  const field = (label: string) =>
    card.fields.find((f) => f.label.toLowerCase() === label.toLowerCase())
      ?.value ??
    card.referenceFields?.find(
      (f) => f.label.toLowerCase() === label.toLowerCase(),
    )?.value ??
    "";
  const attacks = defaultPrintAttacks(card);
  const primaryDamage = defaultPrintVariant(card)?.damage ?? card.damage;
  const hits = new Map<number, string>();
  let active = 1;
  for (const entry of card.fields) {
    const label = entry.label.trim().toLowerCase();
    if (/^(?:(?:primary|secondary|tertiary|quaternary) )?attack$/.test(label)) {
      active = ordinal(label) ?? active;
    }
    if (/^(?:(?:primary|secondary|tertiary|quaternary) )?hit$/.test(label))
      hits.set(ordinal(label) ?? active, entry.value);
  }
  const phases = attacks.length ? attacks : [undefined];
  return phases.map((attack, index) => {
    const phase = attack?.ordinal ?? 1;
    const hit = hits.get(phase) ?? "";
    const prefix = hit.match(
      /^(.+?)\s+(?:(?:acid|cold|fire|force|lightning|necrotic|poison|psychic|radiant|thunder|and|or)\s+)*damage\b/i,
    )?.[1];
    const candidate = prefix ? compact(prefix) : "";
    const mathOnly = candidate.replace(
      /\b(?:STR|CON|DEX|INT|WIS|CHA|half|your|level)\b|\[W\]|d(?=\d)/gi,
      "",
    );
    const damage =
      prefix &&
      /^(?:\d|\[W\])/i.test(prefix) &&
      /^[\d\s+\-−*/()[\].½]+$/.test(mathOnly)
        ? candidate
        : "";
    return [
      index
        ? `Attack ${phase}`
        : `${card.name}${phases.length > 1 ? ` · Attack ${phase}` : ""}`,
      index ? "" : field("Level") || "—",
      index ? "" : field("Range") || field("Attack Type"),
      attack?.target ?? (index ? "" : field("Target")),
      attack ? compact(attack.eligible === false ? "—" : attack.attack) : "",
      attack && attack.eligible !== false
        ? compact(
            attack.damage ?? (phase === 1 ? primaryDamage : undefined) ?? "",
          ) ||
          damage ||
          (/\bdamage\b/i.test(hit) ? "See card" : "")
        : "",
    ];
  });
}
