import { describe, expect, it } from "vitest";

import {
  POWER_MENTIONS_FIELD,
  readPowerMentions,
  withStoredPowerMentions,
  type ContentEntity,
} from "./index";

function record(
  id: string,
  name: string,
  type: string,
  options: {
    description?: string;
    property?: string;
    grants?: readonly string[];
  } = {},
): ContentEntity {
  return {
    id,
    name,
    type,
    source: "Synthetic",
    categories: [],
    attributes: [],
    prerequisites: [],
    description: options.description ?? "",
    specifics:
      options.property === undefined
        ? []
        : [
            {
              name: "Property",
              value: options.property,
              extraAttributes: [],
              ordinal: 0,
            },
          ],
    rules: (options.grants ?? []).map((grant, ordinal) => ({
      name: "grant",
      attributes: [
        { name: "name", value: grant },
        { name: "type", value: "Power" },
      ],
      ordinal,
    })),
  } as unknown as ContentEntity;
}

const powers = [
  record("ABJURE", "Abjure Undead", "Power"),
  record("DARK", "Darkness", "Power"),
  record("CLOUD", "Cloud of Darkness", "Power"),
  record("WIND", "Second Wind", "Power"),
];

const mentions = (entity: ContentEntity, others = powers) =>
  readPowerMentions(
    withStoredPowerMentions([...others, entity]).at(-1)!.specifics,
  );

describe("stored power mentions", () => {
  it("links a feat to the power its text names as the character's", () => {
    expect(
      mentions(
        record("WRENCH", "Wrenching Abjuration", "Feat", {
          description:
            "When you hit with your abjure undead class feature, you can slide the target instead of pulling the target.",
        }),
      ),
    ).toEqual(["Abjure Undead"]);
    expect(
      mentions(
        record("ARMOR", "Battleforged Armor +1", "Magic Item", {
          property:
            "If you use your second wind when you are bloodied, regain an extra 1d10 hit points.",
        }),
      ),
    ).toEqual(["Second Wind"]);
  });

  it("takes the longest name at a place and needs a power context", () => {
    expect(
      mentions(
        record("CLUTCH", "Clutch", "Feat", {
          description:
            "Enemies in your cloud of darkness take 2 damage. A darkness spell does nothing.",
        }),
      ),
    ).toEqual(["Cloud of Darkness"]);
    expect(
      mentions(
        record("SHADE", "Shade", "Feat", {
          description: "You can use the darkness power twice per encounter.",
        }),
      ),
    ).toEqual(["Darkness"]);
    expect(
      mentions(
        record("PLAIN", "Plain", "Feat", {
          description: "You see normally in darkness.",
        }),
      ),
    ).toBeUndefined();
  });

  it("skips powers the record grants and records of other types", () => {
    expect(
      mentions(
        record("INIT", "Initiate", "Feat", {
          description: "You can use your abjure undead once per day.",
          grants: ["ABJURE"],
        }),
      ),
    ).toBeUndefined();
    expect(
      mentions(
        record("FEATURE", "Channel", "Class Feature", {
          description: "When you use your abjure undead, …",
        }),
      ),
    ).toBeUndefined();
  });

  it("relinks over a composed record set and replaces an older field", () => {
    const feat = withStoredPowerMentions([
      record("WRENCH", "Wrenching", "Feat", {
        description: "Your abjure undead slides.",
      }),
    ])[0]!;
    expect(
      feat.specifics.some(({ name }) => name === POWER_MENTIONS_FIELD),
    ).toBe(false);
    const linked = withStoredPowerMentions([...powers, feat]).at(-1)!;
    expect(readPowerMentions(linked.specifics)).toEqual(["Abjure Undead"]);
    const relinked = withStoredPowerMentions([linked]).at(-1)!;
    expect(
      relinked.specifics.some(({ name }) => name === POWER_MENTIONS_FIELD),
    ).toBe(false);
  });
});
