import { describe, expect, it } from "vitest";

import type { ContentEntity } from "@4ecb/content-domain";

import {
  deityCountsAs,
  deityCountsAsText,
  deitySubheaderRows,
} from "./deity-reference";

function entity(
  id: string,
  name: string,
  type: string,
  grants: readonly (readonly [string, string])[] = [],
  specifics: Readonly<Record<string, string>> = {},
): ContentEntity {
  return {
    id,
    name,
    type,
    source: "Synthetic fixture",
    sources: ["Synthetic fixture"],
    attributes: [],
    categories: [],
    specifics: Object.entries(specifics).map(([field, value], ordinal) => ({
      name: field,
      value,
      extraAttributes: [],
      ordinal,
    })),
    rules: grants.map(([granted, grantType], ordinal) => ({
      name: "grant",
      attributes: [
        { name: "name", value: granted },
        { name: "type", value: grantType },
      ],
      text: "",
      children: [],
      ordinal,
    })),
    description: "",
    extensions: [],
    provenance: { sourceKey: "synthetic", sourceOrdinal: 0 },
  };
}

const records = [
  entity("ID_PHARASMA", "Pharasma", "Deity", [
    ["ID_COUNTSASDEITY_RAVEN_QUEEN", "CountsAsDeity"],
    ["ID_DOMAIN_DEATH", "Domain"],
    ["ID_COUNTSASDEITY_KELEMVOR", "CountsAsDeity"],
    ["ID_COUNTSASDEITY_KELEMVOR", "CountsAsDeity"],
    ["ID_MISSING", "CountsAsDeity"],
  ]),
  entity("ID_COUNTSASDEITY_RAVEN_QUEEN", "The Raven Queen", "CountsAsDeity"),
  entity("ID_COUNTSASDEITY_KELEMVOR", "Kelemvor", "CountsAsDeity"),
  entity("ID_DOMAIN_DEATH", "Death", "Domain"),
  entity("ID_IOUN", "Ioun", "Deity", [["ID_DOMAIN_DEATH", "Domain"]]),
  // A campaign's Asmodeus counting as the stock Asmodeus, and as Bane.
  entity("ID_CAMPAIGN_ASMODEUS", "Asmodeus", "Deity", [
    ["ID_COUNTSASDEITY_ASMODEUS", "CountsAsDeity"],
    ["ID_COUNTSASDEITY_BANE", "CountsAsDeity"],
  ]),
  entity("ID_COUNTSASDEITY_ASMODEUS", "asmodeus", "CountsAsDeity"),
  entity("ID_COUNTSASDEITY_BANE", "Bane", "CountsAsDeity"),
];
const byId = new Map(
  records.map((record) => [record.id.toLowerCase(), record]),
);
const lookup = (id: string) => byId.get(id.toLowerCase());

describe("deity counts-as (D116)", () => {
  it("names the CountsAsDeity records a deity grants, once each, in order", () => {
    const pharasma = lookup("ID_PHARASMA")!;
    expect(deityCountsAs(pharasma, lookup).map(({ id }) => id)).toEqual([
      "ID_COUNTSASDEITY_RAVEN_QUEEN",
      "ID_COUNTSASDEITY_KELEMVOR",
    ]);
    expect(deityCountsAsText(pharasma, lookup)).toBe(
      "The Raven Queen, Kelemvor",
    );
  });

  it("is empty for a deity that counts as none", () => {
    expect(deityCountsAs(lookup("ID_IOUN")!, lookup)).toEqual([]);
    expect(deityCountsAsText(lookup("ID_IOUN")!, lookup)).toBeUndefined();
  });

  it("leaves out a deity counting as one of its own name", () => {
    expect(deityCountsAsText(lookup("ID_CAMPAIGN_ASMODEUS")!, lookup)).toBe(
      "Bane",
    );
  });
});

describe("deity subheader rows", () => {
  const deity = (
    id: string,
    specifics: Readonly<Record<string, string>>,
    grants: readonly (readonly [string, string])[] = [],
  ) => {
    const record = entity(id, id, "Deity", grants, specifics);
    return deitySubheaderRows(record, (ref) =>
      ref.toLowerCase() === id.toLowerCase() ? record : lookup(ref),
    );
  };

  it("puts Alignment before Pantheon, then Domains and Counts as on their own lines", () => {
    expect(
      deity(
        "ID_FULL",
        {
          Pantheon: "Forgotten Realms",
          Domains: "ID_DOMAIN_DEATH",
          Alignment: "Unaligned",
        },
        [["ID_COUNTSASDEITY_KELEMVOR", "CountsAsDeity"]],
      ),
    ).toEqual([
      [
        { label: "Alignment", value: "Unaligned" },
        { label: "Pantheon", value: "Forgotten Realms" },
      ],
      [{ label: "Domains", value: "Death" }],
      [{ label: "Counts as", value: "Kelemvor" }],
    ]);
  });

  it("has no Counts as line for a deity counting as none, or only as its own name", () => {
    const plain = deity("ID_PLAIN", {
      Alignment: "Good",
      Pantheon: "Core",
      Domains: "ID_DOMAIN_DEATH",
    });
    expect(plain.map((row) => row.map(({ label }) => label))).toEqual([
      ["Alignment", "Pantheon"],
      ["Domains"],
    ]);
    const asmodeus = entity(
      "ID_OWN",
      "Asmodeus",
      "Deity",
      [["ID_COUNTSASDEITY_ASMODEUS", "CountsAsDeity"]],
      { Alignment: "Evil", Pantheon: "Core" },
    );
    expect(deitySubheaderRows(asmodeus, lookup)).toEqual([
      [
        { label: "Alignment", value: "Evil" },
        { label: "Pantheon", value: "Core" },
      ],
    ]);
  });

  it("leaves out empty fields and lines (no domains)", () => {
    expect(
      deity("ID_NO_DOMAINS", {
        Alignment: "",
        Pantheon: "Eberron",
        Domains: "",
      }),
    ).toEqual([[{ label: "Pantheon", value: "Eberron" }]]);
    expect(deity("ID_EMPTY", {})).toEqual([]);
  });
});
