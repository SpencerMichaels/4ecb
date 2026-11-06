import { describe, expect, it } from "vitest";

import type { ContentEntity } from "@4ecb/content-domain";

import { deityCountsAs, deityCountsAsText } from "./deity-reference";

function entity(
  id: string,
  name: string,
  type: string,
  grants: readonly (readonly [string, string])[] = [],
): ContentEntity {
  return {
    id,
    name,
    type,
    source: "Synthetic fixture",
    sources: ["Synthetic fixture"],
    attributes: [],
    categories: [],
    specifics: [],
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
});
