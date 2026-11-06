import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { CharacterBuild } from "@4ecb/character-domain";
import type { ContentEntity, RuleStatement } from "@4ecb/content-domain";
import {
  evaluateCharacter,
  knownRecords,
  projectBuildForEvaluation,
  type RitualAllowanceStatus,
} from "@4ecb/rules-engine";

import {
  AllowanceChoiceDialog,
  groupKnownRecords,
  knownRecordSourceLabel,
  ritualAllowanceGroups,
  ritualAllowanceLabel,
  RitualsWorkspace,
} from "./RitualsWorkspace";

function rule(
  name: string,
  attributes: Record<string, string>,
  ordinal: number,
): RuleStatement {
  return {
    name,
    attributes: Object.entries(attributes).map(([key, value]) => ({
      name: key,
      value,
    })),
    text: "",
    children: [],
    ordinal,
  };
}

function entity(
  id: string,
  name: string,
  type: string,
  options: {
    readonly rules?: readonly RuleStatement[];
    readonly specifics?: Readonly<Record<string, string>>;
  } = {},
): ContentEntity {
  return {
    id,
    name,
    type,
    source: "Public fixture",
    sources: ["Public fixture"],
    attributes: [],
    categories: [],
    description: "",
    specifics: Object.entries(options.specifics ?? {}).map(
      ([specificName, value], ordinal) => ({
        name: specificName,
        value,
        extraAttributes: [],
        ordinal,
      }),
    ),
    rules: options.rules ?? [],
    extensions: [],
    provenance: { sourceKey: "public-rituals", sourceOrdinal: 0 },
  };
}

const content = [
  entity("L1", "1", "Level"),
  entity("CLASS", "Synthetic Druid", "Class", {
    specifics: { _FreeRitualAllowance: "Ritual; 1@1<=1" },
    rules: [
      rule("statadd", { name: "FREEBEE:RITUAL_GIFT", value: "+1" }, 0),
      rule(
        "textstring",
        {
          name: "Free Rituals",
          value: "* As a druid you have been given the Gifted Rite.",
        },
        1,
      ),
    ],
  }),
  entity("RITUAL_GIFT", "Gifted Rite", "Ritual", {
    specifics: {
      Category: "Exploration",
      "Key Skill": "Nature",
      Level: "1",
      type: "Ritual",
    },
  }),
  entity("RITUAL_BOUGHT", "Bought Rite", "Ritual", {
    specifics: { Category: "Warding", Level: "2", type: "Ritual" },
  }),
  entity("FORMULA", "Synthetic Formula", "Ritual", {
    specifics: { Category: "Poison", Level: "3", type: "Alchemical Formula" },
  }),
];
const byId = new Map(content.map((value) => [value.id.toLowerCase(), value]));

const build: CharacterBuild = {
  formatVersion: 3,
  effectiveLevel: 1,
  levels: [
    {
      level: 1,
      root: {
        id: "l1",
        identity: { definitionId: "L1", name: "1", type: "Level" },
        acquiredLevel: 1,
        legality: "rules-legal",
        unresolved: false,
        children: [
          {
            id: "class",
            identity: {
              definitionId: "CLASS",
              name: "Synthetic Druid",
              type: "Class",
            },
            acquiredLevel: 1,
            legality: "rules-legal",
            unresolved: false,
            children: [],
          },
        ],
      },
    },
  ],
  grabbag: [],
  inventory: [],
  known: [
    {
      id: "stored-gift",
      acquiredLevel: 1,
      element: {
        definitionId: "RITUAL_GIFT",
        name: "Gifted Rite",
        type: "Ritual",
      },
      acquisition: "free",
    },
    {
      id: "bought",
      acquiredLevel: 1,
      element: {
        definitionId: "RITUAL_BOUGHT",
        name: "Bought Rite",
        type: "Ritual",
      },
      acquisition: "bought",
    },
  ],
  alternates: [],
  baseAbilities: {},
  textStrings: {},
};
const evaluation = evaluateCharacter(
  projectBuildForEvaluation(build, content),
  content,
);

const render = (category?: "rituals") =>
  renderToStaticMarkup(
    createElement(RitualsWorkspace, {
      build,
      entities: content,
      byId,
      evaluation,
      walletCopper: 10_000,
      category,
      onCategoryChange: vi.fn(),
      onLearn: vi.fn(),
      onRemove: vi.fn(),
    }),
  );

describe("Rituals workspace", () => {
  it("lists known records by kind with their source, once each", () => {
    const records = knownRecords(build, evaluation, (id) =>
      byId.get(id.toLowerCase()),
    );
    const groups = groupKnownRecords(records);
    expect(
      groups.get("ritual")?.map((record) => knownRecordSourceLabel(record)),
    ).toEqual(["Bought at level 1", "Granted by Synthetic Druid"]);
    expect(groups.get("alchemical-formula")).toEqual([]);
    expect(groups.get("martial-practice")).toEqual([]);
  });

  it("shows what is still free, every group, and Remove only for learned records", () => {
    const markup = render();
    // The class's rule sentence is not repeated: a heading naming the
    // provider, then a line per allowance with some left.
    expect(markup).not.toContain("As a druid you have been given");
    expect(markup).toContain(
      '<div class="rituals-allowance"><div class="rituals-allowance-group"><p class="rituals-allowance-heading"><strong>Free rituals</strong><span class="rituals-allowance-source"> (Synthetic Druid)</span></p><p class="rituals-allowance-count">1 free 1st-level ritual</p></div></div>',
    );
    expect(markup).toContain("Learn rituals");
    for (const heading of [
      "Rituals",
      "Alchemical formulas",
      "Martial practices",
    ])
      expect(markup).toContain(
        `<span class="table-section-label"><span>${heading}</span>`,
      );
    expect(markup).toContain("No alchemical formulas known.");
    expect(markup).toContain("No martial practices known.");
    expect(markup).toContain("Granted by Synthetic Druid");
    expect(markup).toContain('aria-label="Remove Bought Rite"');
    // A granted record has no Remove, even with an imported stored copy.
    expect(markup).not.toContain('aria-label="Remove Gifted Rite"');
    expect(markup).toContain("<td>Exploration</td><td>Nature</td>");
  });

  it("drops the free-ritual block once every allowance is used", () => {
    const withFree = [
      ...content,
      entity("RITUAL_FREE", "Free Rite", "Ritual", {
        specifics: { Category: "Travel", Level: "1", type: "Ritual" },
      }),
    ];
    const used: CharacterBuild = {
      ...build,
      known: [
        ...build.known,
        {
          id: "free-pick",
          acquiredLevel: 1,
          element: {
            definitionId: "RITUAL_FREE",
            name: "Free Rite",
            type: "Ritual",
          },
          acquisition: "free",
          allowance: "CLASS",
        },
      ],
    };
    const markup = renderToStaticMarkup(
      createElement(RitualsWorkspace, {
        build: used,
        entities: withFree,
        byId: new Map(withFree.map((value) => [value.id.toLowerCase(), value])),
        evaluation: evaluateCharacter(
          projectBuildForEvaluation(used, withFree),
          withFree,
        ),
        walletCopper: 10_000,
        category: undefined,
        onCategoryChange: vi.fn(),
        onLearn: vi.fn(),
        onRemove: vi.fn(),
      }),
    );
    expect(markup).not.toContain("rituals-allowance");
    // The Known table and Learn rituals stay.
    expect(markup).toContain("Learn rituals");
    expect(markup).toContain("Free Rite");
  });

  it("labels allowance counters and the allowance a ritual used", () => {
    const status = (
      value: Partial<RitualAllowanceStatus> &
        Pick<RitualAllowanceStatus, "remainders">,
      kind: RitualAllowanceStatus["allowance"]["kind"] = "Ritual",
      from?: readonly string[],
    ): RitualAllowanceStatus => ({
      allowance: {
        key: "P",
        providerId: "P",
        provider: "Spellbook",
        kind,
        steps: [],
        ...(from === undefined ? {} : { from }),
      },
      total: 5,
      used: 0,
      remaining: 5,
      entryIds: [],
      ...value,
    });
    expect(
      ritualAllowanceLabel(
        status({
          remainders: [
            { count: 3, maxLevel: 1 },
            { count: 2, maxLevel: 5 },
          ],
        }),
      ),
    ).toBe("3 free 1st-level rituals and 2 free rituals of level 5 or lower");
    const choice = status(
      { total: 1, remaining: 1, remainders: [{ count: 1 }] },
      "Ritual",
      ["a", "b", "c"],
    );
    expect(ritualAllowanceLabel(choice, (id) => id.toUpperCase())).toBe(
      "1 free ritual: A, B or C",
    );
    // Nothing left (used up, or not earned yet): no line.
    const usedUp = status(
      { total: 2, remaining: 0, remainders: [] },
      "Martial Practice",
    );
    expect(ritualAllowanceLabel(usedUp)).toBeUndefined();
    expect(
      ritualAllowanceLabel(status({ total: 0, remaining: 0, remainders: [] })),
    ).toBeUndefined();

    // Grouped by provider, in order: a psion's two allowances under one
    // heading; a provider with nothing left has no group.
    const as = (
      value: RitualAllowanceStatus,
      providerId: string,
      provider: string,
      suffix = "",
    ): RitualAllowanceStatus => ({
      ...value,
      allowance: {
        ...value.allowance,
        key: `${providerId}${suffix}`,
        providerId,
        provider,
      },
    });
    const firstLevel = status({
      total: 1,
      remaining: 1,
      remainders: [{ count: 1, maxLevel: 1 }],
    });
    expect(
      ritualAllowanceGroups(
        [
          as(usedUp, "MARTIAL", "Martial Training"),
          as(firstLevel, "PSION", "Psion"),
          as(choice, "PSION", "Psion", "#2"),
          as(
            status(
              {
                total: 1,
                remaining: 1,
                remainders: [{ count: 1, maxLevel: 1 }],
              },
              "Alchemical Formula",
            ),
            "ALCHEMIST",
            "Alchemist",
          ),
        ],
        (id) => id.toUpperCase(),
      ),
    ).toEqual([
      {
        providerId: "PSION",
        heading: "Free rituals",
        provider: "Psion",
        lines: [
          { key: "PSION", label: "1 free 1st-level ritual" },
          { key: "PSION#2", label: "1 free ritual: A, B or C" },
        ],
      },
      {
        providerId: "ALCHEMIST",
        heading: "Free alchemical formulas",
        provider: "Alchemist",
        lines: [
          { key: "ALCHEMIST", label: "1 free 1st-level alchemical formula" },
        ],
      },
    ]);
    const [record] = knownRecords(
      {
        known: [
          {
            id: "free",
            acquiredLevel: 3,
            element: { name: "Rite", type: "Ritual" },
            acquisition: "free",
            allowance: "P",
          },
        ],
      },
      undefined,
      () => undefined,
    );
    expect(
      knownRecordSourceLabel(record!, (key) =>
        key === "P" ? "Spellbook" : undefined,
      ),
    ).toBe("Learned free at level 3 (Spellbook)");
  });

  it("swaps the main pane to the learning catalog", () => {
    const markup = render("rituals");
    expect(markup).toContain("Known rituals");
    expect(markup).toContain('aria-label="Learn Bought Rite free"');
    expect(markup).not.toContain("</svg> Learn rituals</button>");
  });

  it("hangs each Learn-free option's text beside its radio", () => {
    const markup = renderToStaticMarkup(
      createElement(AllowanceChoiceDialog, {
        name: "Tenser's Floating Disk",
        allowances: [
          {
            key: "PSION",
            providerId: "PSION",
            provider: "Psion",
            kind: "Ritual",
            steps: [],
          },
        ],
        describe: () => "1 free ritual: Sending or Tenser's Floating Disk",
        onLearn: vi.fn(),
        onCancel: vi.fn(),
      }),
    );
    // Every option, "None (a gift)" included, is a two-column choice: the
    // radio, then one text element (no loose text beside the control).
    expect(markup.match(/<label class="dialog-choice">/g)).toHaveLength(2);
    expect(markup).toContain(
      '<label class="dialog-choice"><input type="radio" name="ritual-allowance" checked=""/><span class="dot-list">',
    );
    expect(markup).toContain(
      '<input type="radio" name="ritual-allowance"/><span>None (a gift)</span></label>',
    );
  });
});
