import type { ContentEntity } from "@4ecb/content-domain";

/**
 * A mount's monster stat block (legacy `MonsterDisplay.Build`): the
 * `_Monster` field of 47 Gear records with Category "Mount", stored as the
 * published stat block's text. The legacy detail pane splits it into lines:
 * the first two form a header band (name and level, type and XP, each split
 * at " - "); the rest is the block, where a blank line starts a new entry
 * whose first line is highlighted and whose other lines are indented, and the
 * "Alignment" line starts the highlighted ability-score rows.
 *
 * Only line splitting happens here, mirroring the legacy display; nothing is
 * parsed into numbers or rules.
 */
export interface SheetMonsterStatBlock {
  /** "Warhorse" / "Level 3 Brute", then "Large natural beast (mount)" /
   *  "XP 150". A side the record leaves blank is omitted. */
  readonly header: readonly SheetStatBlockHeaderRow[];
  readonly sections: readonly SheetStatBlockSection[];
  /**
   * The record's description repeats the block's body (the Celestial
   * mounts and the Silver Dragon Steed), so a surface that shows the block
   * drops the description rather than print it twice.
   */
  readonly repeatsDescription?: true;
}

export interface SheetStatBlockHeaderRow {
  readonly left: string;
  readonly right?: string;
}

/**
 * `statistics`: the lines before the first blank (initiative, HP, defenses,
 * speed). `entry`: a blank-separated group, its highlighted first line as
 * `title` ("m Kick (standard, at-will)", "Traits") and the rest indented.
 * `abilities`: the "Alignment" line and every line after it, highlighted.
 */
export interface SheetStatBlockSection {
  readonly kind: "statistics" | "entry" | "abilities";
  readonly title?: string;
  readonly lines: readonly string[];
}

const MONSTER_FIELD = "_monster";

function monsterText(entity: ContentEntity): string | undefined {
  const value = entity.specifics.find(
    (field) => field.name.trim().toLocaleLowerCase() === MONSTER_FIELD,
  )?.value;
  return value === undefined || value.trim().length === 0 ? undefined : value;
}

function headerRow(line: string): SheetStatBlockHeaderRow | undefined {
  const split = line.indexOf(" - ");
  const left = (split === -1 ? line : line.slice(0, split)).trim();
  const right = split === -1 ? "" : line.slice(split + 3).trim();
  if (left.length === 0 && right.length === 0) return undefined;
  return { left, ...(right.length === 0 ? {} : { right }) };
}

const comparable = (text: string) =>
  text.replace(/[^\p{L}\p{N}]/gu, "").toLocaleLowerCase();

/** The stat block of the last of an item's records that carries one. */
export function itemMonsterStatBlock(
  entities: readonly (ContentEntity | undefined)[],
): SheetMonsterStatBlock | undefined {
  const entity = [...entities]
    .reverse()
    .find(
      (candidate): candidate is ContentEntity =>
        candidate !== undefined && monsterText(candidate) !== undefined,
    );
  if (entity === undefined) return undefined;
  const lines = monsterText(entity)!.split(/\r\n|\r|\n/);
  // Legacy shows nothing for a block of fewer than two lines.
  if (lines.length < 2) return undefined;
  const header = lines.slice(0, 2).flatMap((line) => headerRow(line) ?? []);
  const body = lines.slice(2).map((line) => line.trim());
  const sections: SheetStatBlockSection[] = [];
  let current: { kind: SheetStatBlockSection["kind"]; lines: string[] } = {
    kind: "statistics",
    lines: [],
  };
  let title: string | undefined;
  let afterBlank = false;
  const close = () => {
    if (title !== undefined || current.lines.length > 0)
      sections.push({
        kind: current.kind,
        ...(title === undefined ? {} : { title }),
        lines: current.lines,
      });
    title = undefined;
  };
  for (const line of body) {
    if (line.length === 0) {
      if (current.kind !== "abilities") afterBlank = true;
      continue;
    }
    if (current.kind !== "abilities" && line.startsWith("Alignment")) {
      close();
      current = { kind: "abilities", lines: [line] };
      afterBlank = false;
      continue;
    }
    if (afterBlank) {
      close();
      current = { kind: "entry", lines: [] };
      title = line;
      afterBlank = false;
      continue;
    }
    current.lines.push(line);
  }
  close();
  const description = entity.description;
  const repeatsDescription =
    description.trim().length > 0 &&
    comparable(description) === comparable(body.join(" "));
  return {
    header,
    sections,
    ...(repeatsDescription ? { repeatsDescription: true as const } : {}),
  };
}
