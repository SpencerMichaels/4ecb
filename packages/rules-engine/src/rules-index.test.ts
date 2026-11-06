import { describe, expect, it } from "vitest";

import type { ContentEntity } from "@4ecb/content-domain";

import { RulesIndex } from "./evaluator";

function record(
  id: string,
  name: string,
  type: string,
  aliases?: readonly string[],
): ContentEntity {
  return {
    id,
    name,
    ...(aliases === undefined ? {} : { aliases }),
    type,
    source: "Synthetic",
    sources: ["Synthetic"],
    attributes: [],
    categories: [],
    specifics: [],
    rules: [],
    description: "",
    extensions: [],
    provenance: { sourceKey: "synthetic.xml", sourceOrdinal: 0 },
  };
}

describe("RulesIndex record aliases (D116)", () => {
  const aasimar = record("ID_RACE_DEVA", "Aasimar", "Race", ["Deva"]);
  // A record that has the name itself wins over another's alias.
  const devaFeat = record("ID_FEAT_DEVA", "Deva", "Feat");
  const index = new RulesIndex([aasimar, devaFeat]);

  it("finds a record by an alias, typed or not, after real names", () => {
    expect(index.find("deva", "Race")).toBe(aasimar);
    expect(index.find("Aasimar", "Race")).toBe(aasimar);
    expect(index.find("Deva", "Feat")).toBe(devaFeat);
    expect(index.find("Deva")).toBe(devaFeat);
    expect(new RulesIndex([aasimar]).find("Deva")).toBe(aasimar);
  });

  it("finds a record by a campaign alternate name, as by an alias", () => {
    const shadarKai = {
      ...record("ID_RACE_SHADAR_KAI", "Shadar-kai", "Race"),
      alternateName: "Fetchling",
    };
    const named = new RulesIndex([shadarKai, devaFeat]);
    expect(named.find("Fetchling", "Race")).toBe(shadarKai);
    expect(named.find("fetchling")).toBe(shadarKai);
    expect(named.find("Shadar-kai")).toBe(shadarKai);
    expect(named.categoryValues(shadarKai)).toContain("fetchling race");
  });

  it("matches a category naming a record by its alias", () => {
    expect(index.categoryValues(aasimar)).toContain("deva race");
    expect(index.categoryAliases.get("deva")).toContain("id_feat_deva");
    expect(index.categoryAliases.get("race deva")).toContain("id_race_deva");
  });
});
