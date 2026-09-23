import { newNativeCharacterRecord } from "@4ecb/character-domain";
import type {
  ParsedContentEntity,
  ParsedContentSource,
} from "@4ecb/content-domain";
import { buildContentPack, encodeContentPack } from "@4ecb/content-pack";

const SOURCE = "4ECB public functional baseline";

function entity(
  id: string,
  name: string,
  type: string,
  ordinal: number,
  options: {
    readonly categories?: readonly string[];
    readonly specifics?: Readonly<Record<string, string>>;
    readonly select?: { readonly type: string; readonly number: string };
    readonly description?: string;
  } = {},
): ParsedContentEntity {
  return {
    id,
    name,
    type,
    source: SOURCE,
    sources: [SOURCE],
    attributes: [],
    categories: options.categories ?? [],
    specifics: Object.entries(options.specifics ?? {}).map(
      ([specificName, value], specificOrdinal) => ({
        name: specificName,
        value,
        extraAttributes: [],
        ordinal: specificOrdinal,
      }),
    ),
    rules:
      options.select === undefined
        ? []
        : [
            {
              name: "select",
              attributes: [
                { name: "type", value: options.select.type },
                { name: "number", value: options.select.number },
              ],
              text: "",
              children: [],
              ordinal: 0,
            },
          ],
    description:
      options.description ?? "Deterministic public synthetic baseline record.",
    extensions: [],
    content: [],
    provenance: { sourceKey: "functional-baseline", sourceOrdinal: ordinal },
  };
}

export interface FunctionalBaselineFixture {
  readonly encodedPack: string;
  readonly character: ReturnType<typeof newNativeCharacterRecord>;
  readonly manifest: Awaited<ReturnType<typeof buildContentPack>>["manifest"];
  readonly counts: {
    readonly feats: number;
    readonly shopItems: number;
    readonly entities: number;
  };
}

/**
 * A high-cardinality fixture that is intentionally synthetic and prose-light.
 * It is large enough to expose unbounded candidate DOM rendering without
 * relying on the ignored private corpus.
 */
export async function createFunctionalBaselineFixture(): Promise<FunctionalBaselineFixture> {
  const featCount = 420;
  const itemCount = 260;
  const entities: ParsedContentEntity[] = [
    entity("ID_INTERNAL_LEVEL_1", "1", "Level", 0, {
      select: { type: "Feat", number: "1" },
    }),
    ...Array.from({ length: featCount }, (_, index) =>
      entity(
        `ID_BASELINE_FEAT_${String(index + 1).padStart(4, "0")}`,
        `Baseline Feat ${String(index + 1).padStart(4, "0")}`,
        "Feat",
        index + 1,
        {
          categories: ["Heroic Tier"],
          specifics: {
            Tier: "Heroic",
            "Short Description": `Synthetic candidate ${index + 1}`,
          },
        },
      ),
    ),
    ...Array.from({ length: itemCount }, (_, index) =>
      entity(
        `ID_BASELINE_ITEM_${String(index + 1).padStart(4, "0")}`,
        `Baseline Gear ${String(index + 1).padStart(4, "0")}`,
        "Gear",
        featCount + index + 1,
        {
          specifics: {
            "Gear Category": "Adventuring Gear",
            Level: String((index % 30) + 1),
            Gold: "0",
            Rarity: "Common",
          },
        },
      ),
    ),
  ];
  const source: ParsedContentSource = {
    gameSystem: "D&D4E",
    sourceKey: "functional-baseline",
    entities,
    rejected: [],
    rawTopLevel: [],
    diagnostics: [],
    accounting: {
      topLevelRecords: entities.length,
      acceptedRecords: entities.length,
      warnedRecords: 0,
      rejectedRecords: 0,
      rawTopLevelElements: 0,
    },
  };
  const pack = await buildContentPack(source, {
    packId: "public-functional-baseline",
    name: "Public functional baseline",
  });
  const level = pack.entities[0]!;
  const created = newNativeCharacterRecord(
    "Baseline Hero",
    { definitionId: level.id, name: level.name, type: level.type },
    {
      packId: pack.manifest.packId,
      contentDigest: pack.manifest.contentDigest,
    },
    {
      id: "public-functional-baseline-character",
      occurrenceId: "public-functional-baseline-level-1",
      now: "2026-09-23T00:00:00.000Z",
    },
  );
  const firstItem = pack.entities.find(
    ({ id }) => id === "ID_BASELINE_ITEM_0001",
  )!;
  const character = {
    ...created,
    build: {
      ...created.build,
      inventory: [
        {
          id: "public-functional-baseline-holding",
          acquiredLevel: 1,
          quantity: 2,
          equippedQuantity: 0,
          elements: [
            {
              definitionId: firstItem.id,
              name: firstItem.name,
              type: firstItem.type,
            },
          ],
          overrides: {},
          legality: "rules-legal" as const,
        },
      ],
      textStrings: {
        ...created.build.textStrings,
        "Carried Money": "10000 gp",
      },
    },
  };
  return {
    encodedPack: encodeContentPack(pack),
    character,
    manifest: pack.manifest,
    counts: {
      feats: featCount,
      shopItems: itemCount,
      entities: entities.length,
    },
  };
}
