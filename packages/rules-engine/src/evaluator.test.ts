import { describe, expect, it } from "vitest";

import type { EquipmentSlotId } from "@4ecb/character-domain";
import type { ContentEntity, RuleStatement } from "@4ecb/content-domain";

import {
  applyFieldOverlays,
  evaluateCharacter,
  prerequisiteSnapshotCount,
  type CharacterInventoryEntry,
  type CharacterOccurrence,
} from "./evaluator";
import { EXCEPTION_IDS } from "./exceptions";

function rule(
  name: string,
  attributes: Record<string, string>,
  ordinal: number,
): RuleStatement {
  return {
    name,
    attributes: Object.entries(attributes).map(([attribute, value]) => ({
      name: attribute,
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
    categories?: string[];
    prerequisites?: string;
    rules?: RuleStatement[];
    specifics?: Record<string, string>;
    source?: string;
  } = {},
): ContentEntity {
  return {
    id,
    name,
    type,
    source: options.source ?? "test",
    sources: [options.source ?? "test"],
    attributes: [],
    categories: options.categories ?? [],
    specifics: Object.entries(options.specifics ?? {}).map(
      ([fieldName, value], ordinal) => ({
        name: fieldName,
        value,
        extraAttributes: [],
        ordinal,
      }),
    ),
    rules: options.rules ?? [],
    description: "",
    extensions: [],
    provenance: { sourceKey: "test", sourceOrdinal: 0 },
    ...(options.prerequisites === undefined
      ? {}
      : { prerequisites: options.prerequisites }),
  };
}

const rootOccurrence: CharacterOccurrence = {
  id: "root",
  definitionId: "ROOT",
  acquiredLevel: 1,
  kind: "root",
};

describe("character evaluator", () => {
  it("internalizes a prerequisite the same whichever caller reads it first", () => {
    // A paragon path power reads its path's prerequisite (BaseClass) before
    // or after the path's choice is checked; the cached IR must not depend
    // on which, nor on what the character owns.
    const content = () => [
      entity("ROOT", "Root", "Test", {
        rules: [rule("select", { type: "Paragon Path" }, 0)],
      }),
      entity("ID_FMP_POWER_6515", "Call Spirit Companion", "Power"),
      // The clause names a Power as a class feature (Spirit of Courage).
      entity(
        "ID_FMP_CLASS_FEATURE_2912",
        "Child of All Races",
        "Class Feature",
      ),
      entity("PATH", "Spirit Path", "Paragon Path", {
        prerequisites: "call spirit companion class feature",
      }),
      entity("PATH_POWER", "Spirit Path Power", "Power", {
        specifics: { Class: "PATH", "Power Usage": "Encounter", Level: "11" },
      }),
    ];
    const chooser = (owned: boolean) => ({
      level: 11,
      baseAbilities: {},
      inventory: [],
      occurrences: [
        rootOccurrence,
        ...(owned
          ? [
              {
                id: "companion",
                definitionId: "ID_FMP_POWER_6515",
                acquiredLevel: 1,
                kind: "grabbag",
              } as CharacterOccurrence,
            ]
          : []),
      ],
    });
    const powerHolder = {
      level: 11,
      baseAbilities: {},
      inventory: [],
      occurrences: [
        {
          id: "path-power",
          definitionId: "PATH_POWER",
          acquiredLevel: 11,
          kind: "grabbag",
        } as CharacterOccurrence,
      ],
    };
    const pathCandidate = (result: ReturnType<typeof evaluateCharacter>) =>
      result.choices[0]?.candidates.find(
        (candidate) => candidate.definitionId === "PATH",
      );
    const fresh = pathCandidate(evaluateCharacter(chooser(true), content()));
    expect(fresh).toMatchObject({ eligible: true, reasons: [] });
    const shared = content();
    evaluateCharacter(powerHolder, shared);
    expect(pathCandidate(evaluateCharacter(chooser(true), shared))).toEqual(
      fresh,
    );
    // Changing the build re-reads ownership against the same cached IR.
    expect(
      pathCandidate(evaluateCharacter(chooser(false), shared))?.reasons,
    ).toEqual(["prerequisite"]);
    expect(pathCandidate(evaluateCharacter(chooser(true), shared))).toEqual(
      fresh,
    );
  });

  it("substitutes a [Select] name in statadd and textstring names (native BracketSubstitute)", () => {
    const evaluate = (chosen: boolean) =>
      evaluateCharacter(
        {
          level: 1,
          baseAbilities: {},
          occurrences: [
            rootOccurrence,
            {
              id: "arch",
              definitionId: "ARCH",
              acquiredLevel: 1,
              kind: "root",
            },
            {
              id: "sleep",
              definitionId: "SLEEP",
              acquiredLevel: 1,
              kind: "root",
            },
            ...(chosen
              ? [
                  {
                    id: "pick",
                    definitionId: "SLEEP",
                    acquiredLevel: 1,
                    parentId: "arch",
                    ruleOrdinal: 0,
                    choiceIndex: 0,
                    kind: "choice" as const,
                  },
                ]
              : []),
          ],
          inventory: [],
        },
        [
          entity("ROOT", "1", "Level"),
          entity("ARCH", "Signature Spell (Archspell)", "Class Feature", {
            rules: [
              rule(
                "select",
                {
                  type: "Power",
                  name: "Signature Spell",
                  number: "1",
                  Category: "daily,arcane",
                  existing: "true",
                },
                0,
              ),
              rule(
                "statadd",
                { name: "[Signature Spell]:attack", value: "+2" },
                1,
              ),
              rule(
                "textstring",
                { name: "[Signature Spell]:note", value: "x" },
                2,
              ),
            ],
          }),
          entity("SLEEP", "Sleep", "Power", {
            specifics: { "Power Usage": "Daily" },
          }),
        ],
      );
    const evaluated = evaluate(true);
    expect(evaluated.stats["Sleep:attack"]?.value).toBe(2);
    expect(evaluated.textStrings["Sleep:note"]).toBe("x");
    expect(evaluated.stats["[Signature Spell]:attack"]).toBeUndefined();
    expect(evaluate(false).stats["no selection:attack"]?.value).toBe(2);
  });

  it("keeps a modify rule's target name when no owned definition matches", () => {
    const evaluated = evaluateCharacter(
      {
        level: 1,
        baseAbilities: {},
        occurrences: [
          rootOccurrence,
          {
            id: "own-feat",
            definitionId: "FEAT",
            acquiredLevel: 1,
            kind: "choice",
          },
        ],
        inventory: [],
      },
      [
        entity("ROOT", "1", "Level"),
        entity("FEAT", "Stoneheart Warrior", "Feat", {
          rules: [
            rule(
              "modify",
              {
                name: "Second Wind",
                Field: "Stoneheart Warrior",
                value: "Free action.",
              },
              0,
            ),
          ],
        }),
      ],
    );
    expect(evaluated.overlays).toContainEqual(
      expect.objectContaining({
        targetName: "Second Wind",
        targetDefinitionIds: [],
        field: "Stoneheart Warrior",
        value: "Free action.",
      }),
    );
  });
  it("limits a `modify select` to what that select chose", () => {
    const evaluated = evaluateCharacter(
      {
        level: 1,
        baseAbilities: {},
        occurrences: [
          rootOccurrence,
          {
            id: "trait",
            definitionId: "TRAIT",
            acquiredLevel: 1,
            kind: "root",
          },
          {
            id: "chosen",
            definitionId: "CHOSEN",
            acquiredLevel: 1,
            parentId: "trait",
            ruleOrdinal: 0,
            choiceIndex: 0,
            kind: "choice",
          },
          {
            id: "other",
            definitionId: "OTHER",
            acquiredLevel: 1,
            kind: "root",
          },
        ],
        inventory: [],
      },
      [
        entity("ROOT", "1", "Level"),
        entity("TRAIT", "Dilettante", "Racial Trait", {
          rules: [
            rule(
              "select",
              { type: "Power", name: "Dilettante", number: "1" },
              0,
            ),
            rule(
              "modify",
              {
                select: "Dilettante",
                Field: "Power Usage",
                value: "Encounter",
              },
              1,
            ),
          ],
        }),
        entity("CHOSEN", "Chosen power", "Power", {
          specifics: { "Power Usage": "At-Will" },
        }),
        entity("OTHER", "Other power", "Power", {
          specifics: { "Power Usage": "At-Will" },
        }),
      ],
    );
    expect(
      evaluated.overlays.find(({ field }) => field === "Power Usage")
        ?.targetDefinitionIds,
    ).toEqual(["CHOSEN"]);
  });
  describe("a `modify` with neither name nor select", () => {
    const powers = [
      entity("LIGHT", "Light", "Power", {
        specifics: { "Power Usage": "Encounter" },
      }),
      entity("BOLT", "Bolt", "Power", {
        specifics: { "Power Usage": "Encounter" },
      }),
      entity("OTHER", "Other power", "Power", {
        specifics: { "Power Usage": "Daily" },
      }),
    ];
    const usageModify = (ordinal: number) =>
      rule("modify", { Field: "Power Usage", value: "At-Will" }, ordinal);
    const evaluateWith = (
      rules: ReturnType<typeof rule>[],
      extra: CharacterOccurrence[] = [],
    ) =>
      evaluateCharacter(
        {
          level: 1,
          baseAbilities: {},
          occurrences: [
            rootOccurrence,
            {
              id: "item",
              definitionId: "ITEM",
              acquiredLevel: 1,
              kind: "root",
            },
            {
              id: "other",
              definitionId: "OTHER",
              acquiredLevel: 1,
              kind: "root",
            },
            ...extra,
          ],
          inventory: [],
        },
        [
          entity("ROOT", "1", "Level"),
          entity("ITEM", "Gauntlets", "Feat", { rules }),
          ...powers,
        ],
      );
    const usageTargets = (evaluated: ReturnType<typeof evaluateCharacter>) =>
      evaluated.overlays
        .filter(({ field }) => field === "Power Usage")
        .map(({ targetDefinitionIds }) => targetDefinitionIds);

    it("targets only the record the preceding grant made", () => {
      const evaluated = evaluateWith([
        rule("grant", { name: "LIGHT", type: "Power" }, 0),
        usageModify(1),
      ]);
      expect(usageTargets(evaluated)).toEqual([["LIGHT"]]);
    });
    it("does nothing before the provider has made a child", () => {
      const evaluated = evaluateWith([
        usageModify(0),
        rule("grant", { name: "LIGHT", type: "Power" }, 1),
      ]);
      expect(usageTargets(evaluated)).toEqual([[]]);
    });
    it("targets the most recent of several children", () => {
      const evaluated = evaluateWith([
        rule("grant", { name: "LIGHT", type: "Power" }, 0),
        rule("statadd", { name: "Speed", value: "1" }, 1),
        rule("grant", { name: "BOLT", type: "Power" }, 2),
        usageModify(3),
      ]);
      expect(usageTargets(evaluated)).toEqual([["BOLT"]]);
    });
    it("targets a preceding select's last chosen slot, or nothing", () => {
      const select = rule("select", { type: "Power", number: "2" }, 0);
      const chosen = (choiceIndex: number, definitionId: string) => ({
        id: `chosen-${choiceIndex}`,
        definitionId,
        acquiredLevel: 1,
        parentId: "item",
        ruleOrdinal: 0,
        choiceIndex,
        kind: "choice" as const,
      });
      expect(
        usageTargets(
          evaluateWith(
            [select, usageModify(1)],
            [chosen(0, "LIGHT"), chosen(1, "BOLT")],
          ),
        ),
      ).toEqual([["BOLT"]]);
      expect(
        usageTargets(
          evaluateWith([select, usageModify(1)], [chosen(0, "LIGHT")]),
        ),
      ).toEqual([[]]);
    });
  });
  it("keeps every textstring contribution with its source", () => {
    const occurrence = (id: string): CharacterOccurrence => ({
      id: `own-${id}`,
      definitionId: id,
      acquiredLevel: 1,
      kind: "choice",
    });
    const evaluated = evaluateCharacter(
      {
        level: 1,
        baseAbilities: {},
        occurrences: [rootOccurrence, occurrence("TATTOO"), occurrence("FEAT")],
        inventory: [],
      },
      [
        entity("ROOT", "1", "Level"),
        entity("TATTOO", "Tattoo", "Feat", {
          rules: [
            rule(
              "textstring",
              { name: "Action Point", value: "Tattoo:Resist." },
              0,
            ),
          ],
        }),
        entity("FEAT", "Surge", "Feat", {
          rules: [
            rule(
              "textstring",
              { name: "Action Point", value: "Surge:+3 attack." },
              0,
            ),
          ],
        }),
      ],
    );
    expect(
      evaluated.textContributions?.filter((c) => c.name === "Action Point"),
    ).toEqual([
      expect.objectContaining({
        value: "Tattoo:Resist.",
        providerName: "Tattoo",
        definitionId: "TATTOO",
      }),
      expect.objectContaining({
        value: "Surge:+3 attack.",
        providerName: "Surge",
        definitionId: "FEAT",
      }),
    ]);
  });
  it("records a conditional textstring as a string statadd and reminds of it on power cards", () => {
    // Native StatBlock: `<statadd String="+1d6" conditional="when charging"
    // value="0"/>` under the stat; CalcConditionals reads it back.
    const entities = [
      entity("ROOT", "1", "Level"),
      entity("HELM", "Synthetic Helm", "Feat", {
        rules: [
          rule(
            "textstring",
            {
              name: "melee basic:damage",
              value: "+1d6",
              condition: "when charging",
            },
            0,
          ),
          rule(
            "textstring",
            {
              name: "Damage",
              value: "+2d6",
              condition: "while wielding a shield",
              wearing: "armor:shield",
            },
            1,
          ),
        ],
      }),
      entity("MBA", "Melee Basic Attack", "Power", {
        specifics: {
          "Attack Type": "Melee weapon",
          Keywords: "Weapon",
          Attack: "Strength vs. AC",
          Hit: "1[W] + Strength modifier damage.",
        },
      }),
      entity("SWORD", "Synthetic Sword", "Weapon", {
        specifics: { Damage: "1d8", Group: "Heavy Blade" },
      }),
    ];
    const evaluated = evaluateCharacter(
      {
        level: 1,
        baseAbilities: { Strength: 16 },
        occurrences: [
          rootOccurrence,
          ...["HELM", "MBA"].map((definitionId) => ({
            id: definitionId.toLowerCase(),
            definitionId,
            acquiredLevel: 1,
            kind: "grabbag" as const,
          })),
        ],
        inventory: [
          {
            id: "sword",
            definitionIds: ["SWORD"],
            quantity: 1,
            equippedQuantity: 1,
            acquiredLevel: 1,
          },
        ],
        candidateDetailLevels: [],
      },
      entities,
    );
    const stat = evaluated.stats["melee basic:damage"];
    expect(stat?.value).toBe(0);
    expect(stat?.contributions).toEqual([
      expect.objectContaining({
        value: "+1d6",
        condition: "when charging",
        text: true,
        applied: false,
        reason: "conditional",
        providerName: "Synthetic Helm",
      }),
    ]);
    expect(stat?.contributions[0]).not.toHaveProperty("numericValue");
    // A conditional textstring never becomes an applied text value.
    expect(evaluated.textStrings["melee basic:damage"]).toBeUndefined();
    expect(evaluated.stats["Damage"]?.contributions[0]?.reason).toBe(
      "equipment",
    );
    const sword = evaluated.powers
      .find((power) => power.definitionId === "MBA")
      ?.variants.find((variant) => variant.equipmentId === "sword");
    // A reminder only: the damage expression keeps its own dice.
    expect(sword?.damage).not.toMatch(/d6/);
    expect(sword?.additionalEffects?.map((effect) => effect.text)).toEqual([
      "+1d6 to damage rolls when charging - Synthetic Helm.",
    ]);
  });
  it.each([
    [false, false],
    [true, false],
    [false, true],
    [true, true],
  ])(
    "gates superior-implement rules on training (%s), including feat-owned bonuses (%s)",
    (trained, featOwned) => {
      const entities = [
        entity("ROOT", "Synthetic ability modifier", "Level", {
          rules: [
            rule("statadd", { name: "Intelligence modifier", value: "+4" }, 0),
          ],
        }),
        entity("ORB", "Synthetic focus orb", "Superior Implement", {
          specifics: {
            Group: "Orb",
            Properties: "Undeniable, Energized (fire)",
          },
          rules: [
            rule(
              "statadd",
              {
                name: "implement,will:attack(Synthetic focus orb)",
                value: "+1",
                type: "Superior Implement",
                requires: "Synthetic orb training",
              },
              0,
            ),
            rule(
              "statadd",
              {
                name: "implement,Fire:damage(Synthetic focus orb)",
                value: "+2",
                type: "Superior Implement",
                requires: "Synthetic orb training",
              },
              1,
            ),
          ],
        }),
        entity("TRAINING", "Synthetic orb training", "Feat"),
        entity("SPELL", "Synthetic flame", "Power", {
          specifics: {
            Keywords: "Arcane, Implement, Fire",
            Attack: "Intelligence vs. Will",
            Hit: "1d8 + Intelligence modifier fire damage.",
          },
        }),
      ];
      const evaluated = evaluateCharacter(
        {
          level: 8,
          baseAbilities: { Intelligence: 18 },
          occurrences: [
            rootOccurrence,
            {
              id: "spell",
              definitionId: "SPELL",
              acquiredLevel: 1,
              kind: "grabbag",
            },
            ...(trained
              ? [
                  {
                    id: "training",
                    definitionId: "TRAINING",
                    acquiredLevel: 1,
                    kind: "grabbag" as const,
                  },
                ]
              : []),
          ],
          inventory: [
            {
              id: "orb",
              definitionIds: ["ORB"],
              quantity: 1,
              equippedQuantity: 1,
              acquiredLevel: 1,
            },
          ],
          candidateDetailLevels: [],
        },
        featOwned
          ? entities.map((e) =>
              e.id === "ORB"
                ? { ...e, rules: [] }
                : e.id === "TRAINING"
                  ? {
                      ...e,
                      rules: entities.find((item) => item.id === "ORB")!.rules,
                    }
                  : e,
            )
          : entities,
      );
      const variant = evaluated.powers
        .find((p) => p.definitionId === "SPELL")
        ?.variants.find((v) => v.equipmentId === "orb");
      expect(variant?.attackBonus).toBe(trained ? 9 : 8);
      expect(variant?.damage).toBe(trained ? "1d8+6" : "1d8+4");
    },
  );
  it.each([true, false])(
    "reads an _ImplementAsClass list-addition as _ImplementForClass (granted: %s)",
    (granted) => {
      // Avernian Knight's Melee Implement: an Internal list-adds the Warlock
      // class to melee weapons' `_ImplementAsClass` (a D105 alias; legacy
      // ignores the field).
      const entities = [
        entity("WARLOCK", "Warlock", "Class"),
        entity(
          "MELEE_AS_WARLOCK",
          "Melee Weapons As Warlock Implements",
          "Internal",
          {
            rules: [
              rule(
                "modify",
                {
                  name: "LONGSWORD",
                  type: "Weapon",
                  Field: "_ImplementAsClass",
                  "list-addition": "WARLOCK",
                },
                0,
              ),
            ],
          },
        ),
        entity("LONGSWORD", "Longsword", "Weapon", {
          specifics: {
            Damage: "1d8",
            "Proficiency Bonus": "3",
            Group: "Heavy Blade",
            Properties: "Versatile",
            Range: "",
          },
        }),
        entity("CURSE", "Synthetic Curse", "Power", {
          specifics: {
            Keywords: "Arcane, Implement",
            Class: "WARLOCK",
            Attack: "Charisma vs. Will",
            Hit: "1d6 + Charisma modifier damage.",
          },
        }),
      ];
      const evaluated = evaluateCharacter(
        {
          level: 11,
          baseAbilities: { Charisma: 18 },
          occurrences: [
            rootOccurrence,
            ...[
              "WARLOCK",
              "CURSE",
              ...(granted ? ["MELEE_AS_WARLOCK"] : []),
            ].map((definitionId) => ({
              id: definitionId.toLowerCase(),
              definitionId,
              acquiredLevel: 1,
              kind: "grabbag" as const,
            })),
          ],
          inventory: [
            {
              id: "sword",
              definitionIds: ["LONGSWORD"],
              quantity: 1,
              equippedQuantity: 1,
              acquiredLevel: 1,
            },
          ],
          candidateDetailLevels: [],
        },
        entities,
      );
      const variants =
        evaluated.powers.find((power) => power.definitionId === "CURSE")
          ?.variants ?? [];
      const sword = variants.find((variant) => variant.equipmentId === "sword");
      if (granted) {
        expect(sword?.proficient).toBe(true);
        // No weapon proficiency bonus on an implement attack.
        expect(sword?.attackBonus).toBe(
          variants.find((variant) => variant.equipmentName === "Unarmed")
            ?.attackBonus,
        );
      } else {
        expect(sword?.proficient ?? false).toBe(false);
      }
    },
  );
  it("makes the shared deity choice required for covered classes and hybrids", () => {
    const deityRule = rule("select", { type: "Deity", optional: "true" }, 0);
    const evaluateFor = (selectedClass: ContentEntity) =>
      evaluateCharacter(
        {
          level: 1,
          baseAbilities: {},
          occurrences: [
            rootOccurrence,
            {
              id: "selected-class",
              definitionId: selectedClass.id,
              acquiredLevel: 1,
              kind: "choice",
            },
          ],
          inventory: [],
        },
        [
          entity("ROOT", "1", "Level", { rules: [deityRule] }),
          entity("DEITY", "Synthetic Deity", "Deity"),
          selectedClass,
        ],
      );

    const covered = evaluateFor(
      entity("COVERED", "Synthetic Divine Class", "Class", {
        specifics: { _PARSED_CLASS_FEATURE: "Channel Divinity, Healing" },
      }),
    );
    const hybrid = evaluateFor(
      entity("HYBRID", "Synthetic Divine Hybrid", "Hybrid Class", {
        specifics: {
          "Hybrid Talent Options": "Armor, Channel Divinity (Hybrid).",
        },
      }),
    );

    expect(covered.choices[0]).toMatchObject({
      type: "Deity",
      optional: false,
    });
    expect(hybrid.choices[0]).toMatchObject({
      type: "Deity",
      optional: false,
    });
    expect(covered.complete).toBe(false);
    expect(covered.diagnostics).toContainEqual(
      expect.objectContaining({ code: "choice.required" }),
    );
  });

  it("keeps deity optional for uncovered and excluded classes", () => {
    const evaluateFor = (selectedClass: ContentEntity) =>
      evaluateCharacter(
        {
          level: 1,
          baseAbilities: {},
          occurrences: [
            rootOccurrence,
            {
              id: "selected-class",
              definitionId: selectedClass.id,
              acquiredLevel: 1,
              kind: "choice",
            },
          ],
          inventory: [],
        },
        [
          entity("ROOT", "1", "Level", {
            rules: [rule("select", { type: "Deity", optional: "true" }, 0)],
          }),
          entity("DEITY", "Synthetic Deity", "Deity"),
          selectedClass,
        ],
      );

    expect(
      evaluateFor(entity("ORDINARY", "Ordinary Class", "Class")).choices[0],
    ).toMatchObject({ optional: true });
    expect(
      evaluateFor(
        entity("WARPRIEST", "Warpriest", "Class", {
          specifics: { _PARSED_CLASS_FEATURE: "Channel Divinity Powers" },
        }),
      ).choices[0],
    ).toMatchObject({ optional: true });
  });

  it("does not clear a selected deity when class coverage becomes optional", () => {
    const definitions = [
      entity("ROOT", "1", "Level", {
        rules: [rule("select", { type: "Deity", optional: "true" }, 0)],
      }),
      entity("DEITY", "Synthetic Deity", "Deity"),
      entity("ORDINARY", "Ordinary Class", "Class"),
    ];
    const result = evaluateCharacter(
      {
        level: 1,
        baseAbilities: {},
        occurrences: [
          rootOccurrence,
          {
            id: "selected-class",
            definitionId: "ORDINARY",
            acquiredLevel: 1,
            kind: "choice",
          },
          {
            id: "selected-deity",
            definitionId: "DEITY",
            acquiredLevel: 1,
            parentId: "root",
            ruleOrdinal: 0,
            choiceIndex: 0,
            kind: "choice",
          },
        ],
        inventory: [],
      },
      definitions,
    );

    expect(result.choices[0]).toMatchObject({
      optional: true,
      selectedOccurrenceId: "selected-deity",
    });
    expect(result.occurrences.map(({ id }) => id)).toContain("selected-deity");
  });

  it("separates source entitlement, rules legality, active membership, and provider ownership", () => {
    const result = evaluateCharacter(
      {
        level: 1,
        baseAbilities: {},
        sourceEntitlements: ["Allowed Book"],
        occurrences: [
          rootOccurrence,
          {
            id: "chosen-allowed",
            definitionId: "ALLOWED",
            acquiredLevel: 1,
            parentId: "root",
            ruleOrdinal: 0,
            choiceIndex: 0,
            kind: "choice",
          },
          {
            id: "imported-blocked",
            definitionId: "BLOCKED",
            acquiredLevel: 1,
            kind: "grabbag",
          },
        ],
        inventory: [],
      },
      [
        entity("ROOT", "1", "Level", {
          source: "Allowed Book",
          rules: [rule("select", { type: "Feat" }, 0)],
        }),
        entity("ALLOWED", "Allowed feat", "Feat", {
          source: "Allowed Book",
        }),
        entity("ILLEGAL", "Illegal feat", "Feat", {
          source: "Allowed Book",
          prerequisites: "2nd level",
        }),
        entity("CORE", "Core feat", "Feat", { source: "Core" }),
        entity("BLOCKED", "Blocked feat", "Feat", {
          source: "Blocked Book",
        }),
        entity("DEPENDENT", "Dependent feat", "Feat", {
          source: "Allowed Book",
          specifics: { _RequiresID: "BLOCKED" },
        }),
      ],
    );

    expect(result.choices[0]?.candidates).toMatchObject([
      {
        definitionId: "ALLOWED",
        eligible: true,
        sourceEntitled: true,
        rulesLegal: true,
        activeDefinition: true,
        activeOccurrenceIds: ["chosen-allowed"],
        providerOccurrenceIds: ["root"],
      },
      {
        definitionId: "ILLEGAL",
        eligible: false,
        sourceEntitled: true,
        rulesLegal: false,
        reasons: ["prerequisite"],
      },
      {
        definitionId: "CORE",
        eligible: true,
        sourceEntitled: true,
        rulesLegal: true,
      },
      {
        definitionId: "BLOCKED",
        eligible: false,
        sourceEntitled: false,
        // Already owned (imported), so choosing it again would be dropped.
        rulesLegal: false,
        activeDefinition: true,
        reasons: ["source-unentitled", "owned"],
      },
      {
        definitionId: "DEPENDENT",
        eligible: false,
        sourceEntitled: false,
        rulesLegal: true,
        reasons: ["source-unentitled"],
      },
    ]);
    expect(result.activeDefinitions).toContainEqual({
      definitionId: "ALLOWED",
      occurrenceIds: ["chosen-allowed"],
      providerOccurrenceIds: ["root"],
    });
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "occurrence.source-unentitled",
        occurrenceId: "imported-blocked",
      }),
    );
  });

  it("treats every source as entitled when no list is configured", () => {
    const result = evaluateCharacter(
      {
        level: 1,
        baseAbilities: {},
        occurrences: [rootOccurrence],
        inventory: [],
      },
      [
        entity("ROOT", "1", "Level", {
          rules: [rule("select", { type: "Feat" }, 0)],
        }),
        entity("ANY_SOURCE", "Any source feat", "Feat", {
          source: "An unconfigured source",
        }),
      ],
    );

    expect(result.choices[0]?.candidates[0]).toMatchObject({
      sourceEntitled: true,
      eligible: true,
    });
  });

  it("retains every grant provider when active membership is deduplicated", () => {
    const result = evaluateCharacter(
      {
        level: 1,
        baseAbilities: {},
        occurrences: [
          rootOccurrence,
          {
            id: "provider-a",
            definitionId: "PROVIDER_A",
            acquiredLevel: 1,
            kind: "grabbag",
          },
          {
            id: "provider-b",
            definitionId: "PROVIDER_B",
            acquiredLevel: 1,
            kind: "grabbag",
          },
          {
            id: "serialized-shared-grant",
            definitionId: "SHARED",
            acquiredLevel: 1,
            parentId: "provider-a",
            ruleOrdinal: 0,
            kind: "grant",
          },
        ],
        inventory: [],
      },
      [
        entity("ROOT", "Root", "Test"),
        entity("PROVIDER_A", "Provider A", "Feature", {
          rules: [rule("grant", { name: "SHARED", type: "Feature" }, 0)],
        }),
        entity("PROVIDER_B", "Provider B", "Feature", {
          rules: [rule("grant", { name: "SHARED", type: "Feature" }, 0)],
        }),
        entity("SHARED", "Shared", "Feature"),
      ],
    );

    expect(
      result.activeDefinitions.find(
        ({ definitionId }) => definitionId === "SHARED",
      ),
    ).toMatchObject({
      occurrenceIds: ["serialized-shared-grant"],
      providerOccurrenceIds: ["provider-a", "provider-b"],
    });
  });

  it("grants a hybrid armor or shield proficiency only when both halves grant it", () => {
    const proficiency = (id: string, name: string) =>
      entity(id, name, "Proficiency");
    const grants = (id: string, name: string, targets: string[]) =>
      entity(id, name, "Grants", {
        rules: targets.map((target, ordinal) =>
          rule("grant", { name: target, type: "Proficiency" }, ordinal),
        ),
      });
    const entities = [
      entity("ROOT", "1", "Level", {
        rules: [
          rule("grant", { name: "HYBRID_FIGHTER", type: "Grants" }, 0),
          rule("grant", { name: "HYBRID_WARLORD", type: "Grants" }, 1),
        ],
      }),
      grants("HYBRID_FIGHTER", "Hybrid Fighter", [
        "CLOTH",
        "SCALE",
        "HEAVY_SHIELD",
        "MILITARY",
      ]),
      grants("HYBRID_WARLORD", "Hybrid Warlord", ["CLOTH", "LIGHT_SHIELD"]),
      entity("ARMORED", "Armored Warlord", "Feat", {
        rules: [rule("grant", { name: "SCALE", type: "Proficiency" }, 0)],
      }),
      proficiency("CLOTH", "Armor Proficiency (Cloth)"),
      proficiency("SCALE", "Armor Proficiency (Scale)"),
      proficiency("HEAVY_SHIELD", "Shield Proficiency (Heavy)"),
      proficiency("LIGHT_SHIELD", "Shield Proficiency (Light)"),
      proficiency("MILITARY", "Military Melee"),
    ];
    const evaluate = (occurrences: CharacterOccurrence[]) =>
      evaluateCharacter(
        { level: 1, baseAbilities: {}, occurrences, inventory: [] },
        entities,
      ).activeDefinitionIds;

    const fresh = evaluate([rootOccurrence]);
    // Both halves grant Cloth; only one grants Scale or a shield. Weapon
    // proficiencies are not deferred.
    expect(fresh).toEqual(expect.arrayContaining(["CLOTH", "MILITARY"]));
    expect(fresh).not.toContain("SCALE");
    expect(fresh).not.toContain("HEAVY_SHIELD");
    expect(fresh).not.toContain("LIGHT_SHIELD");

    // Another source still grants it.
    expect(
      evaluate([
        rootOccurrence,
        {
          id: "feat",
          definitionId: "ARMORED",
          acquiredLevel: 1,
          kind: "grabbag",
        },
      ]),
    ).toContain("SCALE");

    // A legacy save keeps the deferred element under its Grants record.
    expect(
      evaluate([
        rootOccurrence,
        {
          id: "fighter",
          definitionId: "HYBRID_FIGHTER",
          acquiredLevel: 1,
          parentId: "root",
          ruleOrdinal: 0,
          kind: "grant",
        },
        {
          id: "saved-scale",
          definitionId: "SCALE",
          acquiredLevel: 1,
          parentId: "fighter",
          ruleOrdinal: 1,
          kind: "grant",
        },
      ]),
    ).not.toContain("SCALE");
  });

  it("filters every candidate by its legacy prerequisites", () => {
    const result = evaluateCharacter(
      {
        level: 8,
        baseAbilities: {},
        occurrences: [rootOccurrence],
        inventory: [],
      },
      [
        entity("ROOT", "1", "Level", {
          rules: [rule("select", { type: "Feat" }, 0)],
        }),
        entity("LEGAL_FEAT", "Legal Feat", "Feat"),
        entity("ARCANE_ADMIXTURE_IV", "Arcane Admixture IV", "Feat", {
          prerequisites:
            "Arcane Admixture III,11th level, any arcane class; Paragon Tier",
        }),
        entity("UNKNOWN_FEAT", "Unknown Feat", "Feat", {
          prerequisites: "must have crossed the silver sea",
        }),
      ],
    );

    expect(result.choices[0]?.candidates).toMatchObject([
      { definitionId: "LEGAL_FEAT", eligible: true, reasons: [] },
      {
        definitionId: "ARCANE_ADMIXTURE_IV",
        eligible: false,
        reasons: ["prerequisite"],
      },
      {
        definitionId: "UNKNOWN_FEAT",
        eligible: false,
        reasons: ["prerequisite-unverified"],
      },
    ]);
  });

  it("reports work-item progress for earlier-level prerequisite scopes", () => {
    const progress: { completed: number; total: number }[] = [];
    evaluateCharacter(
      {
        level: 8,
        baseAbilities: {},
        occurrences: [rootOccurrence],
        inventory: [],
      },
      [
        entity("ROOT", "1", "Level", {
          rules: [rule("select", { type: "Feat" }, 0)],
        }),
        entity("GATED_FEAT", "Gated Feat", "Feat", {
          prerequisites: "Paragon Tier",
        }),
      ],
      { onProgress: (update) => progress.push(update) },
    );

    // One unit per earlier level plus the final pass; only the level-1
    // scope is needed here, and the finish always reports completion.
    expect(progress[0]).toEqual({ completed: 0, total: 8 });
    expect(progress).toContainEqual({ completed: 1, total: 8 });
    const last = progress.at(-1);
    expect(last?.completed).toBe(last?.total);
    const fractions = progress.map(({ completed, total }) => completed / total);
    expect(fractions).toEqual([...fractions].sort((a, b) => a - b));
  });

  it("satisfies implement prerequisites through nested class grants", () => {
    const result = evaluateCharacter(
      {
        level: 2,
        baseAbilities: {},
        occurrences: [
          {
            id: "paladin",
            definitionId: "PALADIN",
            acquiredLevel: 1,
            kind: "root",
          },
          {
            id: "level-2",
            definitionId: "LEVEL_2",
            acquiredLevel: 2,
            kind: "root",
          },
          {
            id: "devout-protector-expertise",
            definitionId: "DEVOUT_PROTECTOR_EXPERTISE",
            acquiredLevel: 2,
            parentId: "level-2",
            ruleOrdinal: 3,
            choiceIndex: 0,
            kind: "choice",
          },
        ],
        inventory: [],
      },
      [
        entity("PALADIN", "Paladin", "Class", {
          rules: [rule("grant", { name: "PALADIN_GRANTS", type: "Grants" }, 0)],
        }),
        entity("PALADIN_GRANTS", "Paladin", "Grants", {
          rules: [
            rule("grant", { name: "PALADIN_IMPLEMENTS", type: "Grants" }, 17),
          ],
        }),
        entity("PALADIN_IMPLEMENTS", "Paladin Implements", "Grants", {
          rules: [
            rule(
              "grant",
              { name: "HOLY_SYMBOL_PROFICIENCY", type: "Proficiency" },
              0,
            ),
          ],
        }),
        entity(
          "HOLY_SYMBOL_PROFICIENCY",
          "Implement Proficiency (Holy Symbol)",
          "Proficiency",
        ),
        entity("LEVEL_2", "2", "Level", {
          rules: [rule("select", { type: "Feat" }, 3)],
        }),
        entity(
          "DEVOUT_PROTECTOR_EXPERTISE",
          "Devout Protector Expertise",
          "Feat",
          { prerequisites: "Can use the Holy Symbol implement" },
        ),
      ],
    );

    expect(result.activeDefinitionIds).toContain("HOLY_SYMBOL_PROFICIENCY");
    expect(result.choices[0]?.candidates).toContainEqual(
      expect.objectContaining({
        definitionId: "DEVOUT_PROTECTOR_EXPERTISE",
        eligible: true,
        rulesLegal: true,
        reasons: [],
      }),
    );
    expect(result.diagnostics).not.toContainEqual(
      expect.objectContaining({ code: "prerequisite.unverified" }),
    );
    expect(result.diagnostics).not.toContainEqual(
      expect.objectContaining({ code: "prerequisite.failed" }),
    );
  });

  it("checks a choice's pick without what the pick itself grants", () => {
    const definitions = [
      entity("ROOT", "1", "Level", {
        rules: [rule("select", { type: "Racial Trait", Category: "BORN" }, 0)],
      }),
      entity("DWARF", "Dwarf", "Race"),
      entity("COUNTS_DWARF", "Dwarf", "CountsAsRace"),
      entity("COUNTS_HUMAN", "Human", "CountsAsRace"),
      entity("BORN_DWARF", "Born (Dwarf)", "Racial Trait", {
        categories: ["BORN"],
        prerequisites: "!Dwarf Race,!Dwarf CountsAsRace",
        rules: [
          rule("grant", { name: "COUNTS_DWARF", type: "CountsAsRace" }, 0),
        ],
      }),
      entity("BORN_HUMAN", "Born (Human)", "Racial Trait", {
        categories: ["BORN"],
        prerequisites: "!Human Race,!Human CountsAsRace",
        rules: [
          rule("grant", { name: "COUNTS_HUMAN", type: "CountsAsRace" }, 0),
        ],
      }),
    ];
    const evaluateWith = (extra: CharacterOccurrence[]) =>
      evaluateCharacter(
        {
          level: 1,
          baseAbilities: {},
          occurrences: [
            rootOccurrence,
            ...extra,
            {
              id: "born",
              definitionId: "BORN_DWARF",
              acquiredLevel: 1,
              parentId: "root",
              ruleOrdinal: 0,
              choiceIndex: 0,
              kind: "choice",
            },
          ],
          inventory: [],
        },
        definitions,
      );

    const mixed = evaluateWith([]);
    expect(mixed.activeDefinitionIds).toContain("COUNTS_DWARF");
    expect(mixed.diagnostics).not.toContainEqual(
      expect.objectContaining({ code: "prerequisite.failed" }),
    );
    expect(mixed.choices[0]?.candidates).toContainEqual(
      expect.objectContaining({ definitionId: "BORN_DWARF", eligible: true }),
    );
    // A real dwarf still fails it.
    const dwarf = evaluateWith([
      {
        id: "race",
        definitionId: "DWARF",
        acquiredLevel: 1,
        kind: "choice",
      },
    ]);
    expect(dwarf.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "prerequisite.failed",
        occurrenceId: "born",
      }),
    );
  });

  it("evaluates prerequisites at the choice level, including same-level selections", () => {
    const definitions = [
      entity("LEVEL_4", "4", "Level", {
        rules: [rule("select", { type: "Feat" }, 0)],
      }),
      entity("DEX_4", "Dexterity", "Ability Increase (Level 4)", {
        rules: [rule("statadd", { name: "Dexterity", value: "+1" }, 0)],
      }),
      entity("DEX_8", "Dexterity", "Ability Increase (Level 8)", {
        rules: [rule("statadd", { name: "Dexterity", value: "+1" }, 0)],
      }),
      entity("DEX_FEAT", "Dexterity Feat", "Feat", {
        prerequisites: "Dex 13",
      }),
      entity("LATE_LEVEL_FEAT", "Late Level Feat", "Feat", {
        prerequisites: "8th level",
      }),
      entity("REQUIRED_FEATURE", "Required Feature", "Class Feature"),
      entity("FEATURE_FEAT", "Feature Feat", "Feat", {
        prerequisites: "Required Feature",
      }),
    ];
    const input = {
      level: 8,
      baseAbilities: { Dexterity: 12 },
      occurrences: [
        {
          id: "level-4",
          definitionId: "LEVEL_4",
          acquiredLevel: 4,
          kind: "root" as const,
        },
      ],
      inventory: [],
      candidateDetailLevels: [4],
    };

    const sameLevel = evaluateCharacter(
      {
        ...input,
        occurrences: [
          ...input.occurrences,
          {
            id: "dex-4",
            definitionId: "DEX_4",
            acquiredLevel: 4,
            kind: "choice",
          },
          {
            id: "feature-4",
            definitionId: "REQUIRED_FEATURE",
            acquiredLevel: 4,
            kind: "choice",
          },
        ],
      },
      definitions,
    );
    const laterLevel = evaluateCharacter(
      {
        ...input,
        occurrences: [
          ...input.occurrences,
          {
            id: "dex-8",
            definitionId: "DEX_8",
            acquiredLevel: 8,
            kind: "choice",
          },
          {
            id: "feature-8",
            definitionId: "REQUIRED_FEATURE",
            acquiredLevel: 8,
            kind: "choice",
          },
        ],
      },
      definitions,
    );

    expect(
      sameLevel.choices[0]?.candidates.find(
        ({ definitionId }) => definitionId === "DEX_FEAT",
      ),
    ).toMatchObject({ eligible: true, reasons: [] });
    expect(
      laterLevel.choices[0]?.candidates.find(
        ({ definitionId }) => definitionId === "DEX_FEAT",
      ),
    ).toMatchObject({ eligible: false, reasons: ["prerequisite"] });
    expect(
      sameLevel.choices[0]?.candidates.find(
        ({ definitionId }) => definitionId === "LATE_LEVEL_FEAT",
      ),
    ).toMatchObject({ eligible: false, reasons: ["prerequisite"] });
    expect(
      sameLevel.choices[0]?.candidates.find(
        ({ definitionId }) => definitionId === "FEATURE_FEAT",
      ),
    ).toMatchObject({ eligible: true, reasons: [] });
    expect(
      laterLevel.choices[0]?.candidates.find(
        ({ definitionId }) => definitionId === "FEATURE_FEAT",
      ),
    ).toMatchObject({ eligible: false, reasons: ["prerequisite"] });

    const selectedTooEarly = evaluateCharacter(
      {
        ...input,
        occurrences: [
          ...input.occurrences,
          {
            id: "selected-dex-feat",
            definitionId: "DEX_FEAT",
            acquiredLevel: 4,
            parentId: "level-4",
            ruleOrdinal: 0,
            choiceIndex: 0,
            kind: "choice",
          },
          {
            id: "dex-8",
            definitionId: "DEX_8",
            acquiredLevel: 8,
            kind: "choice",
          },
        ],
      },
      definitions,
    );
    expect(selectedTooEarly.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "prerequisite.failed",
        occurrenceId: "selected-dex-feat",
      }),
    );
  });

  describe("earlier-level prerequisite snapshots without inventory (D106)", () => {
    const itemDefinitions = () => [
      entity("LEVEL_1", "1", "Level", {
        rules: [rule("select", { type: "Feat" }, 0)],
      }),
      entity("LEVEL_4", "4", "Level"),
      entity("SHADOW_ORIGIN", "Born of Shadow", "Feat"),
      entity("SHADOW_FEAT", "Shadow Feat", "Feat", {
        prerequisites: "Born of Shadow",
      }),
      entity("LIQUID_SHADOW", "Liquid Shadow", "Magic Item", {
        rules: [rule("grant", { name: "SHADOW_ORIGIN", type: "Feat" }, 0)],
      }),
      entity("BOOK", "Book of Gifts", "Magic Item", {
        rules: [rule("select", { type: "Item Gift" }, 0)],
      }),
      entity("LATE_GIFT", "Late Gift", "Item Gift", {
        prerequisites: "4th level",
      }),
      entity("SWORD", "Sword", "Weapon", {
        specifics: { "Item Slot": "Main Hand" },
      }),
    ];
    const occurrences: CharacterOccurrence[] = [
      {
        id: "level-1",
        definitionId: "LEVEL_1",
        acquiredLevel: 1,
        kind: "root",
      },
      {
        id: "level-4",
        definitionId: "LEVEL_4",
        acquiredLevel: 4,
        kind: "root",
      },
    ];
    const shadow: CharacterInventoryEntry = {
      id: "shadow",
      definitionIds: ["LIQUID_SHADOW"],
      quantity: 1,
      equippedQuantity: 0,
      acquiredLevel: 1,
    };
    const shadowFeat = (evaluated: ReturnType<typeof evaluateCharacter>) =>
      evaluated.choices
        .find(({ providerOccurrenceId }) => providerOccurrenceId === "level-1")
        ?.candidates.find(({ definitionId }) => definitionId === "SHADOW_FEAT");

    it("keeps earlier snapshots across inventory, loadout and usage edits", () => {
      const definitions = itemDefinitions();
      evaluateCharacter(
        { level: 4, baseAbilities: {}, occurrences, inventory: [shadow] },
        definitions,
      );
      const snapshots = prerequisiteSnapshotCount(definitions);
      expect(snapshots).toBe(1);
      evaluateCharacter(
        {
          level: 4,
          baseAbilities: {},
          occurrences,
          inventory: [
            { ...shadow, quantity: 2 },
            {
              id: "sword",
              definitionIds: ["SWORD"],
              quantity: 1,
              equippedQuantity: 1,
              acquiredLevel: 1,
            },
          ],
          textStrings: {
            _INTERNAL_MainHandWeapon: "Sword",
            USAGE_SWORD: "1",
          },
        },
        definitions,
      );
      expect(prerequisiteSnapshotCount(definitions)).toBe(snapshots);
    });

    it("counts what an item grants now toward an earlier pick's prerequisite", () => {
      const definitions = itemDefinitions();
      const withItem = evaluateCharacter(
        { level: 4, baseAbilities: {}, occurrences, inventory: [shadow] },
        definitions,
      );
      const withoutItem = evaluateCharacter(
        { level: 4, baseAbilities: {}, occurrences, inventory: [] },
        definitions,
      );
      expect(shadowFeat(withItem)).toMatchObject({
        eligible: true,
        reasons: [],
      });
      expect(shadowFeat(withoutItem)).toMatchObject({
        eligible: false,
        reasons: ["prerequisite"],
      });

      const selected = evaluateCharacter(
        {
          level: 4,
          baseAbilities: {},
          occurrences: [
            ...occurrences,
            {
              id: "shadow-feat",
              definitionId: "SHADOW_FEAT",
              acquiredLevel: 1,
              parentId: "level-1",
              ruleOrdinal: 0,
              choiceIndex: 0,
              kind: "choice",
            },
          ],
          inventory: [shadow],
        },
        definitions,
      );
      expect(selected.diagnostics).not.toContainEqual(
        expect.objectContaining({ code: "prerequisite.failed" }),
      );
    });

    it("checks an item's own choice at the current level", () => {
      const definitions = itemDefinitions();
      const book: CharacterInventoryEntry = {
        id: "book",
        definitionIds: ["BOOK"],
        quantity: 1,
        equippedQuantity: 0,
        acquiredLevel: 1,
      };
      const lateGift = (level: number) =>
        evaluateCharacter(
          {
            level,
            baseAbilities: {},
            occurrences: occurrences.filter(
              ({ acquiredLevel }) => acquiredLevel <= level,
            ),
            inventory: [book],
          },
          definitions,
        )
          .choices.find(
            ({ providerOccurrenceId }) =>
              providerOccurrenceId === "book:definition:0",
          )
          ?.candidates.find(({ definitionId }) => definitionId === "LATE_GIFT");
      expect(lateGift(4)).toMatchObject({ eligible: true, reasons: [] });
      expect(lateGift(3)).toMatchObject({
        eligible: false,
        reasons: ["prerequisite"],
      });
    });
  });

  it("expands candidates only for requested detail levels", () => {
    const definitions = [
      entity("ROOT", "1", "Level", {
        rules: [rule("select", { type: "Feat" }, 0)],
      }),
      entity("LEVEL_2", "2", "Level", {
        rules: [rule("select", { type: "Power" }, 0)],
      }),
      entity("SELECTED_FEAT", "Selected feat", "Feat"),
      entity("OTHER_FEAT", "Other feat", "Feat"),
      entity("POWER_A", "Power A", "Power"),
      entity("POWER_B", "Power B", "Power"),
    ];
    const input = {
      level: 2,
      baseAbilities: {},
      occurrences: [
        rootOccurrence,
        {
          id: "selected-feat",
          definitionId: "SELECTED_FEAT",
          acquiredLevel: 1,
          parentId: "root",
          ruleOrdinal: 0,
          choiceIndex: 0,
          kind: "choice" as const,
        },
        {
          id: "level-2",
          definitionId: "LEVEL_2",
          acquiredLevel: 2,
          kind: "root" as const,
        },
      ],
      inventory: [],
    };
    const full = evaluateCharacter(input, definitions);
    const scoped = evaluateCharacter(
      { ...input, candidateDetailLevels: [2] },
      definitions,
    );

    expect(full.choices.map((choice) => choice.candidates.length)).toEqual([
      2, 2,
    ]);
    expect(scoped.choices.map((choice) => choice.candidates.length)).toEqual([
      1, 2,
    ]);
    expect(scoped.choices[0]?.candidates[0]?.definitionId).toBe(
      "SELECTED_FEAT",
    );
    expect(scoped.choices.map((choice) => choice.selectedOccurrenceId)).toEqual(
      full.choices.map((choice) => choice.selectedOccurrenceId),
    );
    expect({ complete: scoped.complete, legal: scoped.legal }).toEqual({
      complete: full.complete,
      legal: full.legal,
    });
  });

  it("omits category mismatches from presentation-scoped candidates", () => {
    const definitions = [
      entity("ROOT", "1", "Level", {
        rules: [rule("select", { type: "Feat", Category: "Allowed" }, 0)],
      }),
      entity("ALLOWED", "Allowed feat", "Feat", {
        categories: ["Allowed"],
      }),
      entity("WRONG_CATEGORY", "Wrong category", "Feat", {
        categories: ["Other"],
      }),
    ];
    const full = evaluateCharacter(
      {
        level: 1,
        baseAbilities: {},
        occurrences: [rootOccurrence],
        inventory: [],
      },
      definitions,
    );
    const scoped = evaluateCharacter(
      {
        level: 1,
        baseAbilities: {},
        occurrences: [rootOccurrence],
        inventory: [],
        candidateDetailLevels: [1],
      },
      definitions,
    );

    expect(full.choices[0]?.candidates).toHaveLength(2);
    expect(
      scoped.choices[0]?.candidates.map(({ definitionId }) => definitionId),
    ).toEqual(["ALLOWED"]);
  });

  it("can omit power/loadout materialization without changing rules results", () => {
    const definitions = [
      entity("ROOT", "1", "Level"),
      entity("POWER", "Test power", "Power", {
        specifics: {
          "Power Usage": "At-Will",
          "Action Type": "Standard Action",
        },
      }),
    ];
    const input = {
      level: 1,
      baseAbilities: {},
      occurrences: [
        rootOccurrence,
        {
          id: "power",
          definitionId: "POWER",
          acquiredLevel: 1,
          kind: "grabbag" as const,
        },
      ],
      inventory: [],
    };

    const full = evaluateCharacter(input, definitions);
    const withoutPowers = evaluateCharacter(
      { ...input, includePowers: false },
      definitions,
    );
    const explicitPowers = evaluateCharacter(
      { ...input, includePowers: true },
      definitions,
    );

    expect(full.powers).toHaveLength(1);
    expect(explicitPowers).toEqual(full);
    expect(withoutPowers.powers).toEqual([]);
    expect({ ...withoutPowers, powers: full.powers }).toEqual(full);
  });

  it("passes the full definition index and candidate subject to resolved prerequisites", () => {
    const result = evaluateCharacter(
      {
        level: 1,
        baseAbilities: {},
        occurrences: [
          rootOccurrence,
          {
            id: "selected-path-a",
            definitionId: "PATH_A",
            acquiredLevel: 1,
            parentId: "root",
            ruleOrdinal: 0,
            choiceIndex: 0,
            kind: "choice",
          },
          {
            id: "competing-path",
            definitionId: "PATH_B",
            acquiredLevel: 1,
            kind: "grabbag",
          },
        ],
        inventory: [],
      },
      [
        entity("ROOT", "1", "Level", {
          rules: [rule("select", { type: "Feat" }, 0)],
        }),
        entity("PATH_A", "Path A", "Feat", {
          prerequisites: "~EXCLUSIVE_PATH",
        }),
        entity("PATH_B", "Path B", "Feat", {
          prerequisites: "Str 13, ~EXCLUSIVE_PATH; Paragon Tier",
        }),
        entity("RACE_PATH", "Race Path", "Race", {
          prerequisites: "~EXCLUSIVE_PATH",
        }),
      ],
    );

    expect(
      result.choices[0]?.candidates.find(
        ({ definitionId }) => definitionId === "PATH_A",
      ),
    ).toMatchObject({
      eligible: false,
      rulesLegal: false,
      sourceEntitled: true,
      reasons: ["prerequisite"],
    });
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "prerequisite.failed",
        occurrenceId: "selected-path-a",
      }),
    );
  });

  it("limits background benefits to owned background associations", () => {
    const result = evaluateCharacter(
      {
        level: 1,
        baseAbilities: {},
        occurrences: [
          rootOccurrence,
          {
            id: "nature-association",
            definitionId: "NATURE_ASSOCIATION",
            acquiredLevel: 1,
            kind: "grant",
          },
        ],
        inventory: [],
      },
      [
        entity("ROOT", "1", "Level", {
          rules: [
            rule(
              "select",
              { type: "Background Choice", Category: "BG_BENEFIT" },
              0,
            ),
          ],
        }),
        entity("NATURE_ASSOCIATION", "Nature", "Background Association"),
        entity("ATHLETICS_ASSOCIATION", "Athletics", "Background Association"),
        entity("NATURE_CLASS", "Nature class skill", "Background Choice", {
          categories: ["BG_BENEFIT"],
          prerequisites: "Nature background association",
        }),
        entity(
          "ATHLETICS_CLASS",
          "Athletics class skill",
          "Background Choice",
          {
            categories: ["BG_BENEFIT"],
            prerequisites: "Athletics background association",
          },
        ),
      ],
    );
    expect(result.choices[0]?.candidates).toMatchObject([
      { definitionId: "NATURE_CLASS", eligible: true, reasons: [] },
      {
        definitionId: "ATHLETICS_CLASS",
        eligible: false,
        reasons: ["prerequisite"],
      },
    ]);
  });

  it("marks background class-skill benefits the class already grants", () => {
    const classSkill = (skill: string, bonus = false) =>
      entity(
        `${skill.toUpperCase()}_${bonus ? "BONUS" : "CLASS"}`,
        `${skill} class skill${bonus ? " and bonus" : ""}`,
        "Background Choice",
        {
          categories: ["BG_BENEFIT"],
          rules: [
            rule(
              "modify",
              {
                name: skill,
                type: "Skill Training",
                Field: "UniversalClassSkill",
                value: "true",
              },
              0,
            ),
            ...(bonus
              ? [rule("statadd", { name: `${skill} Misc`, value: "+1" }, 1)]
              : []),
          ],
        },
      );
    const result = evaluateCharacter(
      {
        level: 1,
        baseAbilities: {},
        occurrences: [
          rootOccurrence,
          {
            id: "paladin",
            definitionId: "PALADIN",
            acquiredLevel: 1,
            kind: "grant",
          },
        ],
        inventory: [],
      },
      [
        entity("ROOT", "1", "Level", {
          rules: [
            rule(
              "select",
              { type: "Background Choice", Category: "BG_BENEFIT" },
              0,
            ),
          ],
        }),
        entity("PALADIN", "Paladin", "Class"),
        entity("RELIGION", "Religion", "Skill Training", {
          categories: ["PALADIN"],
        }),
        entity("STEALTH", "Stealth", "Skill Training", {
          categories: ["ROGUE"],
        }),
        classSkill("Religion"),
        classSkill("Stealth"),
        // The class skill is redundant, but the +1 bonus still applies.
        classSkill("Religion", true),
      ],
    );
    expect(result.choices[0]?.candidates).toMatchObject([
      {
        definitionId: "RELIGION_CLASS",
        eligible: false,
        reasons: ["already-class-skill"],
      },
      { definitionId: "STEALTH_CLASS", eligible: true, reasons: [] },
      { definitionId: "RELIGION_BONUS", eligible: true, reasons: [] },
    ]);
  });

  it("offers the selected archery mastery power as a ranger at-will replacement", () => {
    const result = evaluateCharacter(
      {
        level: 8,
        baseAbilities: {},
        occurrences: [
          {
            id: "level-1",
            definitionId: "LEVEL_1",
            acquiredLevel: 1,
            kind: "root",
          },
          {
            id: "fading-strike",
            definitionId: "FADING_STRIKE",
            acquiredLevel: 6,
            parentId: "level-1",
            ruleOrdinal: 0,
            choiceIndex: 0,
            kind: "choice",
          },
          {
            id: "mastery",
            definitionId: EXCEPTION_IDS.rapidShotMastery,
            acquiredLevel: 8,
            kind: "choice",
          },
        ],
        inventory: [],
      },
      [
        entity("LEVEL_1", "1", "Level"),
        entity("FADING_STRIKE", "Fading Strike", "Power", {
          specifics: {
            Class: "ID_FMP_CLASS_5",
            "Power Usage": "At-Will",
            "Power Type": "Attack",
            Level: "1",
          },
        }),
        entity(
          EXCEPTION_IDS.rapidShotMastery,
          "Rapid Shot Mastery",
          "Class Feature",
        ),
        entity("ID_FMP_POWER_13587", "Rapid Shot", "Power"),
      ],
    );

    expect(
      result.choices.find(
        (choice) => choice.id === "mastery:archery-mastery-replacement",
      ),
    ).toMatchObject({
      level: 8,
      optional: true,
      name: "Rapid Shot Mastery power replacement",
      replacementOptions: [
        {
          replacesOccurrenceId: "fading-strike",
          definitionId: "FADING_STRIKE",
          candidates: [
            {
              definitionId: "ID_FMP_POWER_13587",
              eligible: true,
              reasons: [],
            },
          ],
        },
      ],
    });
  });

  it("recovers a missing generated Focused Expertise target", () => {
    const evaluated = evaluateCharacter(
      {
        level: 15,
        baseAbilities: {},
        occurrences: [
          rootOccurrence,
          {
            id: "expertise",
            definitionId:
              "ID_INTERNAL_FEAT_FOCUSED_EXPERTISE_(SYNTHETIC_STRIKE)",
            acquiredLevel: 4,
            kind: "choice",
          },
        ],
        inventory: [],
      },
      [
        entity("ROOT", "Root", "Test"),
        entity("WEAPON", "Synthetic Strike", "Weapon", {
          specifics: { Group: "Unarmed" },
        }),
      ],
    );

    expect(evaluated.stats["Synthetic Strike:attack"]?.value).toBe(2);
    expect(
      evaluated.stats["Synthetic Strike:attack"]?.contributions[0]
        ?.providerName,
    ).toBe("Focused Expertise (Synthetic Strike)");
  });

  it("ignores display-only race Skill Bonuses and background Benefit text", () => {
    const content = [
      entity("ROOT", "Root", "Test", {
        rules: [],
      }),
      entity("RACE", "Synthetic Race", "Race", {
        specifics: {
          "Skill Bonuses": "+2 Arcana, +2 History, +2 to choice of one other",
        },
      }),
      entity("BACKGROUND", "Synthetic Region", "Background", {
        specifics: {
          Benefit:
            "You can reroll a check. You also gain a +1 bonus on initiative checks.",
        },
      }),
      entity("ARCANA_BONUS", "Arcana Bonus", "Racial Trait", {
        rules: [
          rule(
            "statadd",
            { name: "Arcana Misc", value: "+2", type: "Racial" },
            0,
          ),
        ],
      }),
    ];
    const evaluated = evaluateCharacter(
      {
        level: 1,
        baseAbilities: {},
        occurrences: [
          rootOccurrence,
          {
            id: "race",
            definitionId: "RACE",
            acquiredLevel: 1,
            kind: "choice",
          },
          {
            id: "background",
            definitionId: "BACKGROUND",
            acquiredLevel: 1,
            kind: "choice",
          },
        ],
        inventory: [],
      },
      content,
    );

    expect(evaluated.stats["Arcana Misc"]).toBeUndefined();
    expect(evaluated.stats["History Misc"]).toBeUndefined();
    expect(evaluated.stats["to choice of one other Misc"]).toBeUndefined();
    expect(evaluated.stats["initiative Misc"]).toBeUndefined();
    expect(evaluated.stats["Initiative Misc"]).toBeUndefined();

    const withExplicitBonus = evaluateCharacter(
      {
        level: 1,
        baseAbilities: {},
        occurrences: [
          rootOccurrence,
          {
            id: "race",
            definitionId: "RACE",
            acquiredLevel: 1,
            kind: "choice",
          },
          {
            id: "arcana-bonus",
            definitionId: "ARCANA_BONUS",
            acquiredLevel: 1,
            kind: "grant",
          },
        ],
        inventory: [],
      },
      content,
    );
    expect(withExplicitBonus.stats["Arcana Misc"]?.value).toBe(2);
  });

  it("applies native magic-armor base adjustments but preserves masterwork armor", () => {
    const content = [
      entity("ROOT", "Root", "Test", {
        rules: [
          rule("statalias", { name: "AC", alias: "Armor Class" }, 0),
          rule("statadd", { name: "AC", value: "+10" }, 1),
        ],
      }),
      entity("CHAIN", "Synthetic Chain", "Armor", {
        rules: [
          rule(
            "statadd",
            { name: "Armor Class", value: "6", type: "Armor" },
            0,
          ),
        ],
        specifics: {
          "Armor Bonus": "6",
          "Armor Type": "Heavy",
          "Minimum Enhancement Bonus": "",
        },
      }),
      entity("MASTERWORK", "Synthetic Masterwork Chain", "Armor", {
        rules: [
          rule(
            "statadd",
            { name: "Armor Class", value: "9", type: "Armor" },
            0,
          ),
        ],
        specifics: {
          "Armor Bonus": "9",
          "Armor Type": "Heavy",
          "Minimum Enhancement Bonus": "3",
        },
      }),
      entity("MAGIC_2", "Synthetic Armor +2", "Magic Item", {
        rules: [
          rule(
            "statadd",
            { name: "Armor Class", value: "+2", type: "Enhancement" },
            0,
          ),
        ],
        specifics: { Enhancement: "+2 AC", "Magic Item Type": "Armor" },
      }),
      entity("MAGIC_3", "Synthetic Armor +3", "Magic Item", {
        rules: [
          rule(
            "statadd",
            { name: "Armor Class", value: "+3", type: "Enhancement" },
            0,
          ),
        ],
        specifics: { Enhancement: "+3 AC", "Magic Item Type": "Armor" },
      }),
    ];
    const evaluateArmor = (definitionIds: string[]) =>
      evaluateCharacter(
        {
          level: 1,
          baseAbilities: {},
          occurrences: [rootOccurrence],
          inventory: [
            {
              id: "armor",
              definitionIds,
              quantity: 1,
              equippedQuantity: 1,
              acquiredLevel: 1,
            },
          ],
        },
        content,
      );

    const adjusted = evaluateArmor(["CHAIN", "MAGIC_2"]);
    expect(adjusted.stats.AC?.value).toBe(19);
    expect(
      adjusted.stats.AC?.contributions.find(
        ({ providerName }) => providerName === "Synthetic Chain",
      )?.numericValue,
    ).toBe(7);

    const masterwork = evaluateArmor(["MASTERWORK", "MAGIC_3"]);
    expect(masterwork.stats.AC?.value).toBe(22);
    expect(
      masterwork.stats.AC?.contributions.find(
        ({ providerName }) => providerName === "Synthetic Masterwork Chain",
      )?.numericValue,
    ).toBe(9);
  });

  it("combines hybrid half points within a stat and truncates before links", () => {
    const content = [
      entity("ROOT", "Root", "Test", {
        rules: [
          rule("statadd", { name: "Hit Point Step", value: "+Per Level" }, 0),
        ],
      }),
      entity("HYBRID_A", "Synthetic Hybrid A", "Hybrid Class", {
        rules: [
          rule(
            "statadd",
            {
              name: "Healing Surges",
              value: "+3",
              "half-point": "true",
            },
            0,
          ),
          rule(
            "statadd",
            { name: "Per Level", value: "+2", "half-point": "true" },
            1,
          ),
        ],
      }),
      entity("HYBRID_B", "Synthetic Hybrid B", "Hybrid Class", {
        rules: [
          rule(
            "statadd",
            {
              name: "Healing Surges",
              value: "+4",
              "half-point": "true",
            },
            0,
          ),
          rule("statadd", { name: "Per Level", value: "+3" }, 1),
        ],
      }),
    ];
    const evaluated = evaluateCharacter(
      {
        level: 1,
        baseAbilities: {},
        occurrences: [
          rootOccurrence,
          {
            id: "hybrid-a",
            definitionId: "HYBRID_A",
            acquiredLevel: 1,
            kind: "grabbag",
          },
          {
            id: "hybrid-b",
            definitionId: "HYBRID_B",
            acquiredLevel: 1,
            kind: "grabbag",
          },
        ],
        inventory: [],
      },
      content,
    );

    expect(evaluated.stats["Healing Surges"]?.value).toBe(8);
    expect(evaluated.stats["Per Level"]?.value).toBe(5);
    expect(evaluated.stats["Hit Point Step"]?.value).toBe(5);
  });

  it("does not execute one equipped holding twice when legacy tally repeats it", () => {
    const content = [
      entity("ROOT", "Root", "Test"),
      entity("ARMBANDS", "Synthetic Armbands", "Magic Item", {
        rules: [rule("statadd", { name: "melee:damage", value: "+2" }, 0)],
      }),
      entity("STANCE", "Synthetic Stance", "Feat", {
        rules: [rule("statadd", { name: "melee:damage", value: "+1" }, 0)],
      }),
    ];
    const evaluated = evaluateCharacter(
      {
        level: 3,
        baseAbilities: {},
        occurrences: [
          rootOccurrence,
          {
            id: "legacy-tally-item",
            definitionId: "ARMBANDS",
            acquiredLevel: 1,
            kind: "grabbag",
          },
          {
            id: "distinct-stance",
            definitionId: "STANCE",
            acquiredLevel: 1,
            kind: "grabbag",
          },
        ],
        inventory: [
          {
            id: "same-physical-holding",
            definitionIds: ["ARMBANDS"],
            quantity: 1,
            equippedQuantity: 1,
            acquiredLevel: 1,
          },
        ],
      },
      content,
    );

    expect(evaluated.stats["melee:damage"]?.value).toBe(3);
    expect(
      evaluated.stats["melee:damage"]?.contributions.filter(
        ({ applied }) => applied,
      ),
    ).toHaveLength(2);
  });

  it("aggregates legacy inventory deltas before activating item rules", () => {
    const content = [
      entity("ROOT", "Root", "Test"),
      entity("SHIELD", "Shield", "Armor", {
        rules: [rule("statadd", { name: "AC", value: "+2" }, 0)],
      }),
    ];
    const evaluated = evaluateCharacter(
      {
        level: 3,
        baseAbilities: {},
        occurrences: [rootOccurrence],
        inventory: [
          {
            id: "shield-start",
            definitionIds: ["SHIELD"],
            quantity: 1,
            equippedQuantity: 1,
            acquiredLevel: 1,
          },
          {
            id: "shield-off",
            definitionIds: ["SHIELD"],
            quantity: 0,
            equippedQuantity: -1,
            acquiredLevel: 2,
          },
          {
            id: "shield-on",
            definitionIds: ["SHIELD"],
            quantity: 0,
            equippedQuantity: 1,
            acquiredLevel: 3,
          },
        ],
      },
      content,
    );

    expect(evaluated.stats.AC?.value).toBe(2);
  });

  it("runs grants to a fixed point and exposes required selections", () => {
    const content = [
      entity("ROOT", "Root", "Test", {
        rules: [rule("grant", { name: "FEATURE", type: "Feature" }, 0)],
      }),
      entity("FEATURE", "Feature", "Feature", {
        rules: [
          rule("statadd", { name: "Strength", value: "+2" }, 0),
          rule("statalias", { name: "Strength", alias: "Might" }, 1),
          rule("statadd", { name: "Attack", value: "+Might" }, 2),
          rule("select", { type: "Feat", number: "1", Category: "Martial" }, 3),
        ],
      }),
      entity("FEAT_A", "Eligible feat", "Feat", {
        categories: ["Martial"],
      }),
      entity("FEAT_B", "Ineligible feat", "Feat", {
        categories: ["Arcane"],
      }),
    ];

    const first = evaluateCharacter(
      {
        level: 1,
        baseAbilities: { Strength: 10 },
        occurrences: [rootOccurrence],
        inventory: [],
      },
      content,
    );
    expect(first.converged).toBe(true);
    expect(first.iterations).toBe(2);
    expect(first.stats.Strength?.value).toBe(12);
    expect(first.stats.Attack?.value).toBe(12);
    expect(first.complete).toBe(false);
    expect(first.choices[0]?.candidates).toMatchObject([
      { definitionId: "FEAT_A", eligible: true, reasons: [] },
      { definitionId: "FEAT_B", eligible: false, reasons: ["category"] },
    ]);

    const completed = evaluateCharacter(
      {
        level: 1,
        baseAbilities: { Strength: 10 },
        occurrences: [
          rootOccurrence,
          {
            id: "chosen-feat",
            definitionId: "FEAT_A",
            acquiredLevel: 1,
            parentId: "root:grant:0",
            ruleOrdinal: 3,
            choiceIndex: 0,
            kind: "choice",
          },
        ],
        inventory: [],
      },
      content,
    );
    expect(completed.complete).toBe(true);
    expect(completed.choices[0]?.selectedOccurrenceId).toBe("chosen-feat");
  });

  it("never offers a choice provider as its own recursive child", () => {
    const content = [
      entity("ROOT", "Root", "Test", {
        rules: [rule("grant", { name: "TRAIT", type: "Racial Trait" }, 0)],
      }),
      entity("TRAIT", "Dragonborn Subrace", "Racial Trait", {
        rules: [
          rule(
            "select",
            { type: "Racial Trait", Category: "Dragonborn Subrace" },
            0,
          ),
        ],
      }),
      entity("OPTION", "Draconian Wings", "Racial Trait", {
        categories: ["Dragonborn Subrace"],
      }),
    ];

    const evaluated = evaluateCharacter(
      {
        level: 1,
        baseAbilities: {},
        occurrences: [rootOccurrence],
        inventory: [],
      },
      content,
    );

    expect(evaluated.choices[0]?.candidates).toMatchObject([
      { definitionId: "TRAIT", eligible: false, reasons: ["self"] },
      { definitionId: "OPTION", eligible: true, reasons: [] },
    ]);
  });

  it("does not duplicate an explicitly serialized granted definition", () => {
    const result = evaluateCharacter(
      {
        level: 1,
        baseAbilities: {},
        occurrences: [
          rootOccurrence,
          {
            id: "serialized-feature",
            definitionId: "FEATURE",
            acquiredLevel: 1,
            kind: "choice",
          },
        ],
        inventory: [],
      },
      [
        entity("ROOT", "Root", "Test", {
          rules: [rule("grant", { name: "FEATURE", type: "Feature" }, 0)],
        }),
        entity("FEATURE", "Feature", "Feature", {
          rules: [rule("statadd", { name: "AC", value: "+2" }, 0)],
        }),
      ],
    );

    expect(
      result.occurrences.filter((item) => item.definitionId === "FEATURE"),
    ).toHaveLength(1);
    expect(result.stats.AC?.value).toBe(2);
  });

  it("exposes weapon groups and magic implement types to equipment rules", () => {
    const result = evaluateCharacter(
      {
        level: 1,
        baseAbilities: {},
        occurrences: [rootOccurrence],
        inventory: [
          {
            id: "blade",
            definitionIds: ["BLADE"],
            quantity: 1,
            equippedQuantity: 1,
            acquiredLevel: 1,
          },
          {
            id: "staff",
            definitionIds: ["STAFF"],
            quantity: 1,
            equippedQuantity: 1,
            acquiredLevel: 1,
          },
        ],
      },
      [
        entity("ROOT", "Root", "Test", {
          rules: [
            rule(
              "statadd",
              { name: "AC", value: "+1", wearing: "weapon:heavy blade" },
              0,
            ),
            rule(
              "statadd",
              { name: "AC", value: "+1", wearing: "implement:staff" },
              1,
            ),
          ],
        }),
        entity("BLADE", "Longsword", "Weapon", {
          specifics: { Group: "Heavy Blade" },
        }),
        entity("STAFF", "Magic Staff", "Magic Item", {
          specifics: { "Magic Item Type": "Staff" },
        }),
      ],
    );

    expect(result.stats.AC?.value).toBe(2);
  });

  it("reads weapon selectors through categories, names, staves and hand slots (native HasLoot)", () => {
    const held = (id: string, definitionIds: string[]) => ({
      id,
      definitionIds,
      quantity: 1,
      equippedQuantity: 1,
      acquiredLevel: 1,
    });
    const statadd = (
      name: string,
      selector: string,
      ordinal: number,
      negated = false,
    ) =>
      rule(
        "statadd",
        {
          name,
          value: "+1",
          [negated ? "not-wearing" : "wearing"]: selector,
        },
        ordinal,
      );
    const content = [
      entity("ROOT", "Root", "Test", {
        rules: [
          statadd("Two-handed blade", "weapon:two-handed,heavy blade", 0),
          statadd("Only polearm", "only-weapon:polearm", 1),
          statadd("Glaive by name", "weapon:glaive", 2),
          statadd("Not a glaive", "weapon:!glaive", 3),
          statadd("Staff implement", "implement:staff", 4),
          statadd("Staff weapon", "weapon:staff", 5),
          statadd("Not two-handed", "weapon:two-handed", 6, true),
          statadd("Light blade", "weapon:light blade", 7),
        ],
      }),
      entity("CAT_TWO", "Two-Handed", "Category"),
      entity("GROUP_HB", "Heavy Blade", "Weapon Group"),
      entity("GROUP_POLE", "Polearm", "Weapon Group"),
      entity("GLAIVE", "Glaive", "Weapon", {
        categories: ["CAT_TWO", "GROUP_HB", "GROUP_POLE"],
        specifics: {
          Group: "Heavy Blade, Polearm",
          "Hands Required": "Two-Handed",
          "Item Slot": "Two-Hands",
        },
      }),
      entity(EXCEPTION_IDS.quarterstaff, "Quarterstaff", "Weapon", {
        specifics: {
          Group: "Staff",
          "Hands Required": "Two-Handed",
          "Item Slot": "Two-Hands",
        },
      }),
      entity("SHIELD", "Light Shield", "Armor", {
        specifics: { "Item Slot": "Off-hand" },
      }),
      entity("DAGGER", "Dagger", "Weapon", {
        specifics: { Group: "Light Blade" },
      }),
      entity("ACCURATE", "Accurate dagger", "Superior Implement", {
        specifics: { WeaponEquiv: "DAGGER" },
      }),
    ];
    const evaluate = (inventory: CharacterInventoryEntry[]) =>
      evaluateCharacter(
        {
          level: 1,
          baseAbilities: {},
          occurrences: [rootOccurrence],
          inventory,
        },
        content,
      ).stats;

    const glaive = evaluate([held("glaive", ["GLAIVE"])]);
    expect(glaive["Two-handed blade"]?.value).toBe(1);
    expect(glaive["Only polearm"]?.value).toBe(1);
    expect(glaive["Glaive by name"]?.value).toBe(1);
    expect(glaive["Not a glaive"]?.value ?? 0).toBe(0);
    expect(glaive["Not two-handed"]?.value ?? 0).toBe(0);
    // A shield fills the other hand, so the glaive is not the only weapon.
    const withShield = evaluate([
      held("glaive", ["GLAIVE"]),
      held("shield", ["SHIELD"]),
    ]);
    expect(withShield["Only polearm"]?.value ?? 0).toBe(0);
    expect(withShield["Two-handed blade"]?.value).toBe(1);
    // Native IsStaff: a mundane Quarterstaff is a staff implement.
    const staff = evaluate([held("staff", [EXCEPTION_IDS.quarterstaff])]);
    expect(staff["Staff implement"]?.value).toBe(1);
    expect(staff["Staff weapon"]?.value).toBe(1);
    expect(evaluate([])["Not two-handed"]?.value).toBe(1);
    // Native WeaponEquiv: a superior implement dagger is a light blade.
    expect(
      evaluate([held("accurate", ["ACCURATE"])])["Light blade"]?.value,
    ).toBe(1);
  });

  it("reads DUAL-WIELDING and DEFENSIVE through native IsDualWielding (ItemSlot, double weapons, Ambidextrous)", () => {
    const held = (id: string, definitionId: string, count = 1) => ({
      id,
      definitionIds: [definitionId],
      quantity: count,
      equippedQuantity: count,
      acquiredLevel: 1,
    });
    const statadd = (name: string, selector: string, ordinal: number) =>
      rule("statadd", { name, value: "+1", wearing: selector }, ordinal);
    const weapon = (
      id: string,
      name: string,
      specifics: Record<string, string>,
    ) => entity(id, name, "Weapon", { specifics });
    const content = [
      entity("ROOT", "Root", "Test", {
        rules: [
          statadd("Two-Weapon Defense", "DUAL-WIELDING:", 0),
          statadd("Blade Dance", "DUAL-WIELDING:heavy blade,light blade", 1),
          statadd("Bladestorm", "DUAL-WIELDING:rapier-blade", 2),
          // The Level 1 record's defensive-weapon AC.
          statadd("Defensive", "DEFENSIVE:", 3),
        ],
      }),
      entity("AMBIDEXTROUS", "Ambidextrous", "Internal"),
      entity("PROF_GYTHKA", "Weapon Proficiency (Gythka)", "Proficiency"),
      entity(
        "PROF_PARRYING",
        "Weapon Proficiency (Parrying dagger)",
        "Proficiency",
      ),
      weapon("LONGSWORD", "Longsword", {
        Group: "Heavy Blade",
        "Hands Required": "One-Handed",
        "Item Slot": "One-hand",
        Properties: "Versatile",
      }),
      weapon(EXCEPTION_IDS.rapier, "Rapier", {
        Group: "Light Blade",
        "Hands Required": "One-Handed",
        "Item Slot": "One-hand",
      }),
      weapon("DAGGER", "Dagger", {
        Group: "Light Blade",
        "Hands Required": "One-Handed",
        "Item Slot": "Off-hand",
        Properties: "Light Thrown, Off-hand",
      }),
      weapon("PARRYING", "Parrying dagger", {
        Group: "Light Blade",
        "Hands Required": "One-Handed",
        "Item Slot": "Off-hand",
        Properties: "Off-hand, Defensive",
      }),
      weapon("GYTHKA", "Gythka", {
        Group: "Spear",
        "Hands Required": "One-Handed",
        "Item Slot": "Two-Hands",
        Properties: "Defensive, Heavy Thrown",
        "_Secondary End": "GYTHKA_END",
      }),
      entity("SHIELD", "Light Shield", "Armor", {
        specifics: { "Item Slot": "Off-hand" },
      }),
    ];
    const owned = (definitionId: string) => ({
      id: definitionId,
      definitionId,
      acquiredLevel: 1,
      kind: "root" as const,
    });
    const evaluate = (
      inventory: CharacterInventoryEntry[],
      ambidextrous = false,
      proficient = true,
    ) =>
      evaluateCharacter(
        {
          level: 1,
          baseAbilities: {},
          occurrences: [
            rootOccurrence,
            ...(ambidextrous ? [owned("AMBIDEXTROUS")] : []),
            ...(proficient
              ? [owned("PROF_GYTHKA"), owned("PROF_PARRYING")]
              : []),
          ],
          inventory,
        },
        content,
      ).stats;
    const value = (
      stats: ReturnType<typeof evaluate>,
      name: string,
    ): number | string => stats[name]?.value ?? 0;

    // A one-handed weapon and an off-hand weapon.
    const swordAndDagger = evaluate([
      held("sword", "LONGSWORD"),
      held("dagger", "DAGGER"),
    ]);
    expect(value(swordAndDagger, "Two-Weapon Defense")).toBe(1);
    expect(value(swordAndDagger, "Blade Dance")).toBe(1);
    expect(value(swordAndDagger, "Bladestorm")).toBe(0);
    // Two one-handed weapons are not dual-wielding without Ambidextrous.
    expect(
      value(evaluate([held("swords", "LONGSWORD", 2)]), "Two-Weapon Defense"),
    ).toBe(0);
    expect(
      value(
        evaluate([held("swords", "LONGSWORD", 2)], true),
        "Two-Weapon Defense",
      ),
    ).toBe(1);
    // Every weapon's group is in the list: two light blades qualify.
    expect(value(evaluate([held("daggers", "DAGGER", 2)]), "Blade Dance")).toBe(
      1,
    );
    // A rapier with an off-hand light blade.
    expect(
      value(
        evaluate([
          held("rapier", EXCEPTION_IDS.rapier),
          held("dagger", "DAGGER"),
        ]),
        "Bladestorm",
      ),
    ).toBe(1);
    // A double weapon alone is dual-wielding; a shield is not a weapon hand.
    const gythka = evaluate([held("gythka", "GYTHKA")]);
    expect(value(gythka, "Two-Weapon Defense")).toBe(1);
    expect(value(gythka, "Defensive")).toBe(1);
    expect(
      value(
        evaluate([held("sword", "LONGSWORD"), held("shield", "SHIELD")]),
        "Two-Weapon Defense",
      ),
    ).toBe(0);
    // A defensive weapon counts only while dual-wielding, and only with
    // proficiency in it (native IsProficient).
    expect(
      value(evaluate([held("gythka", "GYTHKA")], false, false), "Defensive"),
    ).toBe(0);
    expect(value(evaluate([held("parry", "PARRYING")]), "Defensive")).toBe(0);
    expect(
      value(
        evaluate([held("sword", "LONGSWORD"), held("parry", "PARRYING")]),
        "Defensive",
      ),
    ).toBe(1);
  });

  it("matches SLOT:off hand through each holding's CharLootSlot and keeps typed blade bonuses from stacking", () => {
    const held = (
      id: string,
      definitionIds: string[],
      options: {
        equippedQuantity?: number;
        overrides?: Record<string, string>;
        slots?: EquipmentSlotId[];
      } = {},
    ): CharacterInventoryEntry => ({
      id,
      definitionIds,
      quantity: options.equippedQuantity ?? 1,
      equippedQuantity: options.equippedQuantity ?? 1,
      acquiredLevel: 1,
      ...(options.overrides === undefined
        ? {}
        : { overrides: options.overrides }),
      ...(options.slots === undefined
        ? {}
        : {
            equippedSlots: options.slots.map((slot) => ({
              slot,
              quantityIndex: 0,
            })),
          }),
    });
    // A warding shaped like the WotC Swordmage Warding record: +1, or +3
    // with the off hand free, typed "Ward", linked into AC by two UNTYPED
    // statadds, one per blade group. The links share AC's type caps
    // (native CalculateStatAddValue, D103), so the warding counts once.
    const content = [
      entity("ROOT", "Root", "Test", {
        rules: [
          rule("statadd", { name: "Ward", value: "+1", type: "Ward" }, 0),
          rule(
            "statadd",
            {
              name: "Ward",
              value: "+3",
              type: "Ward",
              "not-wearing": "SLOT:off hand",
            },
            1,
          ),
          rule(
            "statadd",
            {
              name: "AC",
              value: "+Ward",
              wearing: "weapon:light blade",
            },
            2,
          ),
          rule(
            "statadd",
            {
              name: "AC",
              value: "+Ward",
              wearing: "weapon:heavy blade",
            },
            3,
          ),
        ],
      }),
      entity("SWORD", "Arming sword", "Weapon", {
        specifics: {
          Group: "Heavy Blade",
          "Hands Required": "One-Handed",
          "Item Slot": "One-hand",
        },
      }),
      entity("RAZOR", "Arm blade", "Weapon", {
        specifics: {
          Group: "Light Blade",
          "Hands Required": "One-Handed",
          Properties: "Off-hand",
          "Item Slot": "Off-hand",
          _AlternateSlot: "Arms",
        },
      }),
      entity("GREAT", "Great blade", "Weapon", {
        specifics: {
          Group: "Heavy Blade",
          "Hands Required": "Two-Handed",
          "Item Slot": "Two-Hands",
        },
      }),
      entity("SHIELD", "Buckler", "Armor", {
        specifics: { "Item Slot": "Off-hand" },
      }),
    ];
    const ac = (inventory: CharacterInventoryEntry[]) =>
      evaluateCharacter(
        {
          level: 1,
          baseAbilities: {},
          occurrences: [rootOccurrence],
          inventory,
        },
        content,
      ).stats.AC?.value ?? 0;

    expect(ac([held("sword", ["SWORD"])])).toBe(3);
    // Heavy and light blade both apply, but the shared cap counts it once,
    // and the razor in the off hand drops the warding to +1.
    expect(ac([held("sword", ["SWORD"]), held("razor", ["RAZOR"])])).toBe(1);
    // Worn on the arms (_AlternateSlot), the razor leaves the off hand free.
    expect(
      ac([
        held("sword", ["SWORD"]),
        held("razor", ["RAZOR"], { overrides: { _AlternateSlot: "1" } }),
      ]),
    ).toBe(3);
    // An off-hand item alone, two of one item and a two-handed weapon all
    // fill the off hand.
    expect(ac([held("razor", ["RAZOR"])])).toBe(1);
    expect(ac([held("razor", ["RAZOR"], { equippedQuantity: 2 })])).toBe(1);
    expect(ac([held("great", ["GREAT"])])).toBe(1);
    expect(ac([held("sword", ["SWORD"]), held("shield", ["SHIELD"])])).toBe(1);
    // The modern loadout decides (D101): Wrist Razors placed on the arms
    // leave the off hand free; alone in the main hand they are the main-hand
    // weapon (native _INTERNAL_MainHandWeapon); placed in the off hand they
    // fill it whatever stale legacy flag the loot carries.
    expect(
      ac([
        held("sword", ["SWORD"], { slots: ["main-hand"] }),
        held("razor", ["RAZOR"], { slots: ["arms"] }),
      ]),
    ).toBe(3);
    expect(ac([held("razor", ["RAZOR"], { slots: ["main-hand"] })])).toBe(3);
    expect(
      ac([
        held("sword", ["SWORD"], { slots: ["main-hand"] }),
        held("razor", ["RAZOR"], {
          slots: ["off-hand"],
          overrides: { _AlternateSlot: "1" },
        }),
      ]),
    ).toBe(1);
  });

  it("exposes the size facts and holds a Small character's versatile weapon in both hands (D102)", () => {
    const content = [
      entity("ROOT", "Root", "Test", {
        rules: [
          rule(
            "statadd",
            { name: "Free", value: "+1", "not-wearing": "SLOT:off hand" },
            0,
          ),
        ],
      }),
      entity("SMALL", "Small", "Size"),
      entity("SWORD", "Arming sword", "Weapon", {
        specifics: {
          "Hands Required": "One-Handed",
          "Item Slot": "One-hand",
          Properties: "Versatile",
        },
      }),
    ];
    const evaluate = (size: boolean) =>
      evaluateCharacter(
        {
          level: 1,
          baseAbilities: {},
          occurrences: [
            rootOccurrence,
            ...(size
              ? [
                  {
                    id: "size",
                    definitionId: "SMALL",
                    acquiredLevel: 1,
                    kind: "grant" as const,
                    parentId: "root",
                  },
                ]
              : []),
          ],
          inventory: [
            {
              id: "sword",
              definitionIds: ["SWORD"],
              quantity: 1,
              equippedQuantity: 1,
              acquiredLevel: 1,
              equippedSlots: [{ slot: "main-hand", quantityIndex: 0 }],
            },
          ],
        },
        content,
      );
    const small = evaluate(true);
    expect(small.loadoutSlotContext).toEqual({
      small: true,
      oversized: false,
      oneSizeLarger: false,
      ambidextrous: false,
    });
    // Native ItemSlot makes the versatile sword "two-hands" for a Small
    // character, which fills the off hand.
    expect(small.stats.Free?.value ?? 0).toBe(0);
    expect(evaluate(false).stats.Free?.value ?? 0).toBe(1);
  });

  it("resolves weapon and armor fields through modify overlays, including BaseItem", () => {
    const result = evaluateCharacter(
      {
        level: 1,
        baseAbilities: {},
        occurrences: [
          rootOccurrence,
          {
            id: "feat",
            definitionId: "FEAT",
            acquiredLevel: 1,
            kind: "choice",
          },
        ],
        inventory: [
          {
            id: "spear",
            definitionIds: ["SPEAR", "HEARTWOOD"],
            quantity: 1,
            equippedQuantity: 1,
            acquiredLevel: 1,
          },
          {
            id: "armor",
            definitionIds: ["STUDDED"],
            quantity: 1,
            equippedQuantity: 1,
            acquiredLevel: 1,
          },
        ],
      },
      [
        entity("ROOT", "Root", "Test", {
          rules: [
            rule(
              "statadd",
              {
                name: "Thrown spear",
                value: "+1",
                wearing: "weapon:heavy thrown",
              },
              0,
            ),
            rule(
              "statadd",
              { name: "Leather armor", value: "+1", wearing: "armor:leather" },
              1,
            ),
          ],
        }),
        entity("FEAT", "Armor Proficiency: Studded Leather", "Feat", {
          rules: [
            rule(
              "modify",
              {
                name: "Studded Leather",
                type: "Armor",
                Field: "Armor Category",
                value: "Leather",
              },
              0,
            ),
          ],
        }),
        entity("SPEAR", "Spear", "Weapon", {
          specifics: { Group: "Spear", Properties: "", Range: "" },
        }),
        entity("HEARTWOOD", "Heartwood Spear", "Magic Item", {
          specifics: { "Magic Item Type": "Weapon" },
          rules: [
            rule(
              "modify",
              {
                name: "BaseItem",
                Field: "Properties",
                "list-addition": "Heavy Thrown",
              },
              0,
            ),
            rule(
              "modify",
              { name: "BaseItem", Field: "Range", value: "10/20" },
              1,
            ),
          ],
        }),
        entity("STUDDED", "Studded Leather", "Armor", {
          specifics: { "Armor Category": "Studded Leather" },
        }),
      ],
    );

    expect(result.stats["Thrown spear"]?.value).toBe(1);
    expect(result.stats["Leather armor"]?.value).toBe(1);
    const spearOverlays = result.overlays.filter(
      (overlay) => overlay.targetName === "BaseItem",
    );
    expect(spearOverlays.map((overlay) => overlay.targetDefinitionIds)).toEqual(
      [["SPEAR"], ["SPEAR"]],
    );
  });

  it("modifies the providing record for a conditional this-modify only", () => {
    const result = evaluateCharacter(
      {
        level: 1,
        baseAbilities: {},
        occurrences: [
          rootOccurrence,
          {
            id: "cudgel",
            definitionId: "CUDGEL",
            acquiredLevel: 1,
            kind: "choice",
          },
        ],
        inventory: [],
      },
      [
        entity("ROOT", "Root", "Test"),
        entity("CUDGEL", "Unforgettable Cudgel +2", "Feat", {
          rules: [
            rule(
              "modify",
              {
                name: "this",
                Field: "_PowerstatKeywords",
                "list-addition": "holy symbol implement",
                requires: "Root",
              },
              0,
            ),
            rule(
              "modify",
              {
                name: "this",
                Field: "_PowerstatKeywords",
                "list-addition": "totem implement",
                requires: "Missing",
              },
              1,
            ),
            // Unconditional: content-pack import already applied it.
            rule(
              "modify",
              { name: "this", Field: "_BasicAttack", value: "Melee" },
              2,
            ),
          ],
        }),
      ],
    );
    const self = result.overlays.filter(
      (overlay) => overlay.targetName === "this",
    );
    expect(
      self.map((overlay) => [overlay.field, overlay.targetDefinitionIds]),
    ).toEqual([
      ["_PowerstatKeywords", ["CUDGEL"]],
      ["_BasicAttack", []],
    ]);
  });

  it("promotes CountsAsClass power categories for paragon multiclassing", () => {
    const result = evaluateCharacter(
      {
        level: 11,
        baseAbilities: {},
        occurrences: [
          rootOccurrence,
          {
            id: "wizard",
            definitionId: "WIZARD",
            acquiredLevel: 1,
            kind: "grabbag",
          },
          {
            id: "fighter-training",
            definitionId: "FIGHTER_TRAINING",
            acquiredLevel: 1,
            kind: "grabbag",
          },
          {
            id: "paragon-multiclassing",
            definitionId: EXCEPTION_IDS.paragonMulticlassing,
            acquiredLevel: 11,
            kind: "grabbag",
          },
        ],
        inventory: [],
      },
      [
        entity("ROOT", "Root", "Test", {
          rules: [rule("select", { type: "Power", Category: "$$CLASS" }, 0)],
        }),
        entity("WIZARD", "Wizard", "Class"),
        entity("FIGHTER_TRAINING", "Fighter Training", "Multiclass", {
          specifics: { CountsAsClass: "Fighter" },
        }),
        entity(
          EXCEPTION_IDS.paragonMulticlassing,
          "Paragon Multiclassing",
          "Paragon Path",
        ),
        entity("WIZARD_POWER", "Wizard Spell", "Power", {
          categories: ["Wizard"],
        }),
        entity("FIGHTER_POWER", "Fighter Exploit", "Power", {
          categories: ["Fighter"],
        }),
      ],
    );

    expect(result.choices[0]?.candidates).toMatchObject([
      { definitionId: "WIZARD_POWER", eligible: true, reasons: [] },
      { definitionId: "FIGHTER_POWER", eligible: true, reasons: [] },
    ]);
  });

  it("uses class-descended CountsAsClass markers for Essentials power choices", () => {
    const result = evaluateCharacter(
      {
        level: 2,
        baseAbilities: {},
        occurrences: [
          {
            id: "knight",
            definitionId: "KNIGHT",
            acquiredLevel: 1,
            kind: "root",
          },
          {
            id: "fighter-marker",
            definitionId: "COUNTS_AS_FIGHTER",
            acquiredLevel: 1,
            parentId: "knight",
            kind: "grant",
          },
          {
            id: "utility-slot",
            definitionId: "UTILITY_SLOT",
            acquiredLevel: 2,
            parentId: "knight",
            kind: "grant",
          },
          {
            id: "rogue-training",
            definitionId: "ROGUE_TRAINING",
            acquiredLevel: 1,
            kind: "grabbag",
          },
        ],
        inventory: [],
      },
      [
        entity("KNIGHT", "Knight", "Class"),
        entity("COUNTS_AS_FIGHTER", "Fighter", "CountsAsClass"),
        entity("UTILITY_SLOT", "Level 2 utility", "Class Feature", {
          rules: [
            rule("select", { type: "Power", Category: "$$CLASS,Utility,2" }, 0),
          ],
        }),
        entity("ROGUE_TRAINING", "Rogue training", "Multiclass", {
          specifics: { CountsAsClass: "Rogue" },
        }),
        entity("FIGHTER_UTILITY", "Fighter utility", "Power", {
          categories: ["Fighter", "Utility"],
          specifics: { Level: "2" },
        }),
        entity("ROGUE_UTILITY", "Rogue utility", "Power", {
          categories: ["Rogue", "Utility"],
          specifics: { Level: "2" },
        }),
      ],
    );

    expect(result.choices[0]?.candidates).toMatchObject([
      { definitionId: "FIGHTER_UTILITY", eligible: true, reasons: [] },
      {
        definitionId: "ROGUE_UTILITY",
        eligible: false,
        reasons: ["category"],
      },
    ]);
  });

  it("treats an owned theme as a class category for power choices only", () => {
    const result = evaluateCharacter(
      {
        level: 7,
        baseAbilities: {},
        occurrences: [
          {
            id: "ranger",
            definitionId: "RANGER",
            acquiredLevel: 1,
            kind: "root",
          },
          {
            id: "theme",
            definitionId: "DUNE_TRADER",
            acquiredLevel: 1,
            kind: "grabbag",
          },
          {
            id: "slot",
            definitionId: "LEVEL_7_SLOT",
            acquiredLevel: 7,
            kind: "grabbag",
          },
        ],
        inventory: [],
      },
      [
        entity("RANGER", "Ranger", "Class"),
        entity("DUNE_TRADER", "Dune Trader", "Theme"),
        entity("LEVEL_7_SLOT", "Level 7", "Level", {
          rules: [
            rule(
              "select",
              { type: "Power", Category: "$$CLASS,Encounter,7" },
              0,
            ),
            rule("select", { type: "Feat", Category: "$$CLASS" }, 1),
          ],
        }),
        entity("SLY_GAMBIT", "Sly Gambit", "Power", {
          categories: ["DUNE_TRADER", "Encounter", "7"],
          specifics: { Level: "7" },
        }),
        entity("THEME_FEAT", "Theme feat", "Feat", {
          categories: ["DUNE_TRADER"],
        }),
      ],
    );

    expect(result.choices[0]?.candidates).toContainEqual(
      expect.objectContaining({
        definitionId: "SLY_GAMBIT",
        eligible: true,
        reasons: [],
      }),
    );
    expect(result.choices[1]?.candidates).toContainEqual(
      expect.objectContaining({
        definitionId: "THEME_FEAT",
        eligible: false,
        reasons: ["category"],
      }),
    );
  });

  it("keeps a theme power out of a $$CLASS encounter or daily slot until a class power of that kind is held", () => {
    // Native ThemePowerRestriction (D20Choice::UpdateArrays): only exact
    // `$$CLASS` selects whose category names neither utility nor at-will.
    const evaluate = (selections: readonly CharacterOccurrence[], level = 3) =>
      evaluateCharacter(
        {
          level,
          baseAbilities: {},
          occurrences: [
            {
              id: "ranger",
              definitionId: "ID_FMP_CLASS_5",
              acquiredLevel: 1,
              kind: "root",
            },
            {
              id: "theme",
              definitionId: "ID_FMP_THEME_768",
              acquiredLevel: 1,
              kind: "grabbag",
            },
            {
              id: "level-1",
              definitionId: "LEVEL_1",
              acquiredLevel: 1,
              kind: "grabbag",
            },
            {
              id: "level-3",
              definitionId: "LEVEL_3",
              acquiredLevel: 3,
              kind: "grabbag",
            },
            ...selections,
          ],
          inventory: [],
        },
        [
          entity("ID_FMP_CLASS_5", "Ranger", "Class"),
          entity("ID_FMP_THEME_768", "Order Adept", "Theme"),
          entity("LEVEL_1", "Level 1", "Level", {
            rules: [
              rule(
                "select",
                { type: "Power", number: "1", Category: "$$CLASS,encounter,1" },
                0,
              ),
              rule(
                "select",
                { type: "Power", number: "1", Category: "$$CLASS,at-will,1" },
                1,
              ),
            ],
          }),
          entity("LEVEL_3", "Level 3", "Level", {
            rules: [
              rule(
                "select",
                { type: "Power", number: "1", Category: "$$CLASS,encounter,3" },
                0,
              ),
              rule(
                "select",
                {
                  type: "Power",
                  number: "1",
                  Category: "$$CLASS_OR_MULTICLASS,encounter,3",
                },
                1,
              ),
            ],
          }),
          entity("CLASS_ENCOUNTER", "Class encounter", "Power", {
            categories: ["ID_FMP_CLASS_5", "encounter", "1"],
            specifics: { Class: "ID_FMP_CLASS_5", Level: "1" },
          }),
          entity("CLASS_AT_WILL", "Class at-will", "Power", {
            categories: ["ID_FMP_CLASS_5", "at-will", "1"],
            specifics: { Class: "ID_FMP_CLASS_5", Level: "1" },
          }),
          entity("THEME_ENCOUNTER", "Theme encounter", "Power", {
            categories: ["ID_FMP_CLASS_0", "encounter", "1"],
            specifics: {
              _ThemePower: "ID_FMP_THEME_768",
              Class: "ID_FMP_THEME_768",
              Level: "1",
            },
          }),
          entity("THEME_AT_WILL", "Theme at-will", "Power", {
            categories: ["ID_FMP_CLASS_0", "at-will", "1"],
            specifics: {
              _ThemePower: "ID_FMP_THEME_768",
              Class: "ID_FMP_THEME_768",
              Level: "1",
            },
          }),
        ],
      );
    const pick = (
      id: string,
      parentId: string,
      ruleOrdinal: number,
      definitionId: string,
      acquiredLevel: number,
    ): CharacterOccurrence => ({
      id,
      definitionId,
      acquiredLevel,
      parentId,
      ruleOrdinal,
      choiceIndex: 0,
      kind: "choice",
    });
    const candidate = (
      result: ReturnType<typeof evaluate>,
      provider: string,
      ruleOrdinal: number,
      definitionId: string,
    ) =>
      result.choices
        .find(
          (choice) =>
            choice.providerOccurrenceId === provider &&
            choice.ruleOrdinal === ruleOrdinal,
        )
        ?.candidates.find((entry) => entry.definitionId === definitionId);

    const empty = evaluate([]);
    // The only class encounter slot takes no theme power; at-will slots and
    // `$$CLASS_OR_MULTICLASS` selects are never restricted.
    expect(candidate(empty, "level-1", 0, "THEME_ENCOUNTER")).toMatchObject({
      eligible: false,
      reasons: ["theme-power"],
    });
    expect(candidate(empty, "level-1", 0, "CLASS_ENCOUNTER")?.eligible).toBe(
      true,
    );
    expect(candidate(empty, "level-1", 1, "THEME_AT_WILL")?.eligible).toBe(
      true,
    );
    expect(candidate(empty, "level-3", 1, "THEME_ENCOUNTER")?.eligible).toBe(
      true,
    );
    expect(candidate(empty, "level-3", 0, "THEME_ENCOUNTER")?.eligible).toBe(
      false,
    );

    // Holding a class encounter power from level 1 frees the level-3 slot,
    // but not the level-1 slot that holds it.
    const held = evaluate([pick("enc-1", "level-1", 0, "CLASS_ENCOUNTER", 1)]);
    expect(candidate(held, "level-3", 0, "THEME_ENCOUNTER")?.eligible).toBe(
      true,
    );
    expect(candidate(held, "level-1", 0, "THEME_ENCOUNTER")?.eligible).toBe(
      false,
    );
    // A class power picked later doesn't count at an earlier slot's level.
    const later = evaluate([pick("enc-3", "level-3", 0, "CLASS_ENCOUNTER", 3)]);
    expect(candidate(later, "level-1", 0, "THEME_ENCOUNTER")?.eligible).toBe(
      false,
    );
    // A theme power already in the only class slot is flagged.
    const themed = evaluate([
      pick("enc-1", "level-1", 0, "THEME_ENCOUNTER", 1),
    ]);
    expect(
      themed.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === "choice.ineligible" &&
          diagnostic.message.includes("theme-power"),
      ),
    ).toBe(true);
  });

  it("includes Any Class racial and authored skill powers in class utility slots", () => {
    const result = evaluateCharacter(
      {
        level: 6,
        baseAbilities: {},
        occurrences: [
          {
            id: "ranger",
            definitionId: "RANGER",
            acquiredLevel: 1,
            kind: "root",
          },
          {
            id: "elf",
            definitionId: "ELF",
            acquiredLevel: 1,
            kind: "grabbag",
          },
          {
            id: "nature",
            definitionId: "NATURE",
            acquiredLevel: 1,
            kind: "grabbag",
          },
          {
            id: "slot",
            definitionId: "UTILITY_SLOT",
            acquiredLevel: 6,
            kind: "grabbag",
          },
        ],
        inventory: [],
      },
      [
        entity("RANGER", "Ranger", "Class"),
        entity("ELF", "Elf", "Race"),
        entity("NATURE", "Nature", "Skill Training"),
        entity("DWARF", "Dwarf", "Race"),
        entity("UTILITY_SLOT", "Level 6 utility", "Level", {
          rules: [
            rule("select", { type: "Power", Category: "$$CLASS,Utility,6" }, 0),
          ],
        }),
        entity("RANGER_UTILITY", "Ranger utility", "Power", {
          categories: ["RANGER", "Utility", "6"],
          specifics: { Level: "6", Class: "RANGER" },
        }),
        entity("SKILL_UTILITY", "Skill utility", "Power", {
          categories: ["RANGER", "Utility", "6"],
          prerequisites: "Trained in Nature",
          specifics: { Level: "6", _SkillPower: "NATURE" },
        }),
        entity("ELF_UTILITY", "Elf utility", "Power", {
          categories: ["ID_FMP_CLASS_0", "Utility", "6"],
          prerequisites: "Elf",
          specifics: { Level: "6", Class: "ELF" },
        }),
        entity("DWARF_UTILITY", "Dwarf utility", "Power", {
          categories: ["ID_FMP_CLASS_0", "Utility", "6"],
          prerequisites: "Dwarf",
          specifics: { Level: "6", Class: "DWARF" },
        }),
      ],
    );

    expect(result.choices[0]?.candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          definitionId: "RANGER_UTILITY",
          eligible: true,
        }),
        expect.objectContaining({
          definitionId: "SKILL_UTILITY",
          eligible: true,
        }),
        expect.objectContaining({
          definitionId: "ELF_UTILITY",
          eligible: true,
        }),
        expect.objectContaining({
          definitionId: "DWARF_UTILITY",
          eligible: false,
          reasons: ["prerequisite"],
        }),
      ]),
    );
  });

  it("honors a saved house-rule flag only while the pick is still ineligible", () => {
    const evaluateWith = (pick: string) =>
      evaluateCharacter(
        {
          level: 6,
          baseAbilities: {},
          occurrences: [
            {
              id: "ranger",
              definitionId: "RANGER",
              acquiredLevel: 1,
              kind: "root",
            },
            {
              id: "elf",
              definitionId: "ELF",
              acquiredLevel: 1,
              kind: "grabbag",
            },
            {
              id: "nature",
              definitionId: "NATURE",
              acquiredLevel: 1,
              kind: "grabbag",
            },
            {
              id: "slot",
              definitionId: "UTILITY_SLOT",
              acquiredLevel: 6,
              kind: "grabbag",
            },
            {
              id: "pick",
              definitionId: pick,
              acquiredLevel: 6,
              parentId: "slot",
              ruleOrdinal: 0,
              choiceIndex: 0,
              kind: "choice",
              legality: "houserule",
            },
          ],
          inventory: [],
        },
        [
          entity("RANGER", "Ranger", "Class"),
          entity("ELF", "Elf", "Race"),
          entity("NATURE", "Nature", "Skill Training"),
          entity("DWARF", "Dwarf", "Race"),
          entity("UTILITY_SLOT", "Level 6 utility", "Level", {
            rules: [
              rule(
                "select",
                { type: "Power", Category: "$$CLASS,Utility,6" },
                0,
              ),
            ],
          }),
          entity("SKILL_UTILITY", "Skill utility", "Power", {
            categories: ["RANGER", "Utility", "6"],
            prerequisites: "Training in Nature",
            specifics: { Level: "6", _SkillPower: "NATURE" },
          }),
          entity("DWARF_UTILITY", "Dwarf utility", "Power", {
            categories: ["ID_FMP_CLASS_0", "Utility", "6"],
            prerequisites: "Dwarf",
            specifics: { Level: "6", Class: "DWARF" },
          }),
        ],
      );
    const houseRuled = (result: ReturnType<typeof evaluateWith>) => ({
      legal: result.legal,
      legality: result.occurrences.find(({ id }) => id === "pick")?.legality,
      warned: result.diagnostics.some(
        ({ code }) => code === "occurrence.houserule",
      ),
    });

    // Flagged when its prerequisite couldn't be read; it now passes.
    expect(houseRuled(evaluateWith("SKILL_UTILITY"))).toEqual({
      legal: true,
      legality: "rules-legal",
      warned: false,
    });
    // Still breaks its prerequisite, so the flag stands.
    expect(houseRuled(evaluateWith("DWARF_UTILITY"))).toEqual({
      legal: false,
      legality: "houserule",
      warned: true,
    });
  });

  it("uses distinct hybrid components for both hybrid and primary class categories", () => {
    const result = evaluateCharacter(
      {
        level: 1,
        baseAbilities: {},
        occurrences: [
          {
            id: "hybrid-shell",
            definitionId: "HYBRID",
            acquiredLevel: 1,
            kind: "root",
          },
          {
            id: "hybrid-cleric",
            definitionId: "HYBRID_CLERIC",
            acquiredLevel: 1,
            parentId: "hybrid-shell",
            ruleOrdinal: 0,
            choiceIndex: 0,
            kind: "choice",
          },
          {
            id: "hybrid-fighter",
            definitionId: "HYBRID_FIGHTER",
            acquiredLevel: 1,
            parentId: "hybrid-shell",
            ruleOrdinal: 0,
            choiceIndex: 1,
            kind: "choice",
          },
        ],
        inventory: [],
      },
      [
        entity("HYBRID", "Hybrid", "Class", {
          rules: [
            rule("select", { type: "Hybrid Class", number: "2" }, 0),
            rule("select", { type: "Power", Category: "$$CLASS" }, 1),
            rule("select", { type: "Skill", Category: "$$HYBRID" }, 2),
          ],
        }),
        entity("HYBRID_CLERIC", "Hybrid Cleric", "Hybrid Class", {
          specifics: { _BaseClass: "CLERIC" },
        }),
        entity("HYBRID_FIGHTER", "Hybrid Fighter", "Hybrid Class", {
          specifics: { _BaseClass: "FIGHTER" },
        }),
        entity("CLERIC", "Cleric", "Class"),
        entity("FIGHTER", "Fighter", "Class"),
        entity("CLERIC_POWER", "Cleric power", "Power", {
          categories: ["Cleric"],
        }),
        entity("FIGHTER_POWER", "Fighter power", "Power", {
          categories: ["Fighter"],
        }),
        entity("WIZARD_POWER", "Wizard power", "Power", {
          categories: ["Wizard"],
        }),
        entity("CLERIC_SKILL", "Cleric skill", "Skill", {
          categories: ["Cleric"],
        }),
      ],
    );

    expect(result.choices[0]?.candidates).toContainEqual(
      expect.objectContaining({
        definitionId: "HYBRID_FIGHTER",
        eligible: false,
        reasons: ["duplicate"],
      }),
    );
    expect(result.choices[1]?.candidates).toContainEqual(
      expect.objectContaining({
        definitionId: "HYBRID_CLERIC",
        eligible: false,
        reasons: ["duplicate"],
      }),
    );
    expect(result.choices[2]?.candidates).toMatchObject([
      { definitionId: "CLERIC_POWER", eligible: true, reasons: [] },
      { definitionId: "FIGHTER_POWER", eligible: true, reasons: [] },
      {
        definitionId: "WIZARD_POWER",
        eligible: false,
        reasons: ["category"],
      },
    ]);
    expect(result.choices[3]?.candidates).toMatchObject([
      { definitionId: "CLERIC_SKILL", eligible: true, reasons: [] },
    ]);
  });

  it("does not offer a definition already owned by the choice's level", () => {
    // A pick that duplicates an owned definition is dropped by the topology
    // pass, so offering it would make the pick silently vanish.
    const definitions = [
      entity("LEVEL_1", "1", "Level", {
        rules: [rule("select", { type: "Feat" }, 0)],
      }),
      entity("LEVEL_2", "2", "Level", {
        rules: [rule("select", { type: "Feat" }, 0)],
      }),
      entity("TAKEN", "Taken feat", "Feat"),
      entity("OTHER", "Other feat", "Feat"),
    ];
    const occurrences: CharacterOccurrence[] = [
      {
        id: "level-1",
        definitionId: "LEVEL_1",
        acquiredLevel: 1,
        kind: "root",
      },
      {
        id: "level-2",
        definitionId: "LEVEL_2",
        acquiredLevel: 2,
        kind: "root",
      },
      {
        id: "taken",
        definitionId: "TAKEN",
        acquiredLevel: 1,
        parentId: "level-1",
        ruleOrdinal: 0,
        choiceIndex: 0,
        kind: "choice",
      },
    ];
    const open = evaluateCharacter(
      { level: 2, baseAbilities: {}, occurrences, inventory: [] },
      definitions,
    );
    const levelOne = open.choices.find(
      ({ providerOccurrenceId }) => providerOccurrenceId === "level-1",
    );
    const levelTwo = open.choices.find(
      ({ providerOccurrenceId }) => providerOccurrenceId === "level-2",
    );
    expect(levelOne?.candidates).toMatchObject([
      { definitionId: "TAKEN", eligible: true, reasons: [] },
      { definitionId: "OTHER", eligible: true, reasons: [] },
    ]);
    expect(levelTwo?.candidates).toMatchObject([
      { definitionId: "TAKEN", eligible: false, reasons: ["owned"] },
      { definitionId: "OTHER", eligible: true, reasons: [] },
    ]);

    // Choosing it anyway (a house rule) is dropped, matching the offer.
    const duplicated = evaluateCharacter(
      {
        level: 2,
        baseAbilities: {},
        occurrences: [
          ...occurrences,
          {
            id: "again",
            definitionId: "TAKEN",
            acquiredLevel: 2,
            parentId: "level-2",
            ruleOrdinal: 0,
            choiceIndex: 0,
            kind: "choice",
          },
        ],
        inventory: [],
      },
      definitions,
    );
    expect(duplicated.occurrences.map(({ id }) => id)).not.toContain("again");
  });

  it("keeps a grant whose requirement excludes what it grants", () => {
    // Master Trickster: `grant Ghost Sound requires="!Ghost Sound"`. A named
    // requirement ignores the checking element's own children (native
    // MeetsRequires), so the grant neither drops itself nor oscillates.
    const definitions = [
      entity("TRAIT", "Master Trickster", "Racial Trait", {
        rules: [
          rule(
            "modify",
            {
              name: "SPELL",
              type: "Power",
              Field: "Power Usage",
              value: "Encounter",
              requires: "!SPELL",
            },
            0,
          ),
          rule(
            "grant",
            { name: "SPELL", type: "Power", requires: "!SPELL" },
            1,
          ),
        ],
      }),
      entity("SPELL", "Ghost Sound", "Power"),
      entity("CLASS", "Wizard", "Class", {
        rules: [rule("grant", { name: "SPELL", type: "Power" }, 0)],
      }),
    ];
    const trait: CharacterOccurrence = {
      id: "trait",
      definitionId: "TRAIT",
      acquiredLevel: 1,
      kind: "root",
    };
    const granted = evaluateCharacter(
      { level: 1, baseAbilities: {}, occurrences: [trait], inventory: [] },
      definitions,
    );
    expect(granted.converged).toBe(true);
    expect(granted.occurrences).toContainEqual(
      expect.objectContaining({ id: "trait:grant:1", definitionId: "SPELL" }),
    );
    expect(granted.overlays).toContainEqual(
      expect.objectContaining({ field: "Power Usage", value: "Encounter" }),
    );

    // Owning it some other way still switches the grant off.
    const owned = evaluateCharacter(
      {
        level: 1,
        baseAbilities: {},
        occurrences: [
          trait,
          {
            id: "class",
            definitionId: "CLASS",
            acquiredLevel: 1,
            kind: "root",
          },
        ],
        inventory: [],
      },
      definitions,
    );
    expect(owned.converged).toBe(true);
    expect(owned.occurrences.map(({ id }) => id)).not.toContain(
      "trait:grant:1",
    );
    expect(owned.overlays).not.toContainEqual(
      expect.objectContaining({ field: "Power Usage" }),
    );
  });

  it("converges when a drop removes what another element grants", () => {
    // Born of Shadow drops Fey Origin, which the race keeps granting.
    const result = evaluateCharacter(
      {
        level: 1,
        baseAbilities: {},
        occurrences: [
          { id: "race", definitionId: "RACE", acquiredLevel: 1, kind: "root" },
          { id: "feat", definitionId: "FEAT", acquiredLevel: 1, kind: "root" },
        ],
        inventory: [],
      },
      [
        entity("RACE", "Gnome", "Race", {
          rules: [rule("grant", { name: "ORIGIN", type: "Racial Trait" }, 0)],
        }),
        entity("FEAT", "Born of Shadow", "Feat", {
          rules: [
            rule("drop", { name: "ORIGIN", type: "Racial Trait" }, 0),
            rule("grant", { name: "SHADOW", type: "Racial Trait" }, 1),
          ],
        }),
        entity("ORIGIN", "Fey Origin", "Racial Trait"),
        entity("SHADOW", "Shadow Origin", "Racial Trait"),
      ],
    );
    expect(result.converged).toBe(true);
    expect(result.activeDefinitionIds).toContain("SHADOW");
    expect(result.activeDefinitionIds).not.toContain("ORIGIN");
  });

  it("keeps house rules visible but makes the result non-legal", () => {
    const result = evaluateCharacter(
      {
        level: 1,
        baseAbilities: {},
        occurrences: [
          {
            ...rootOccurrence,
            legality: "houserule",
          },
        ],
        inventory: [],
      },
      [entity("ROOT", "Root", "Test")],
    );
    expect(result.complete).toBe(true);
    expect(result.legal).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: "occurrence.houserule" }),
    );
  });

  it("materializes optional replacement slots without making them incomplete", () => {
    const result = evaluateCharacter(
      {
        level: 2,
        baseAbilities: {},
        occurrences: [rootOccurrence],
        inventory: [],
      },
      [
        entity("ROOT", "Root", "Test", {
          rules: [rule("replace", { optional: "true", retrain: "true" }, 0)],
        }),
      ],
    );
    expect(result.choices).toEqual([
      expect.objectContaining({ type: "Replacement", optional: true }),
    ]);
    expect(result.complete).toBe(true);
    expect(result.diagnostics).not.toContainEqual(
      expect.objectContaining({ code: "replace.requires-command" }),
    );
  });

  it("reports a delayed choice at its rule level instead of its provider level", () => {
    const result = evaluateCharacter(
      {
        level: 7,
        baseAbilities: {},
        occurrences: [
          {
            id: "class",
            definitionId: "CLASS",
            acquiredLevel: 1,
            kind: "root",
          },
        ],
        inventory: [],
      },
      [
        entity("CLASS", "Class", "Class", {
          rules: [rule("select", { type: "Feat", number: "1", Level: "5" }, 0)],
        }),
        entity("FEAT", "Delayed feat", "Feat"),
      ],
    );
    expect(result.choices[0]?.level).toBe(5);
  });

  it("offers original slot candidates, except the retrained one, for ordinary retraining", () => {
    const input = {
      level: 2,
      baseAbilities: {},
      occurrences: [
        {
          id: "level-1",
          definitionId: "LEVEL_1",
          acquiredLevel: 1,
          kind: "root" as const,
        },
        {
          id: "old-feat",
          definitionId: "FEAT_A",
          acquiredLevel: 1,
          parentId: "level-1",
          ruleOrdinal: 0,
          choiceIndex: 0,
          kind: "choice" as const,
        },
        {
          id: "level-2",
          definitionId: "LEVEL_2",
          acquiredLevel: 2,
          kind: "root" as const,
        },
      ],
      inventory: [],
    };
    const definitions = [
      entity("LEVEL_1", "1", "Level", {
        rules: [rule("select", { type: "Feat", number: "1" }, 0)],
      }),
      entity("LEVEL_2", "2", "Level", {
        rules: [rule("replace", { retrain: "true", optional: "true" }, 0)],
      }),
      entity("FEAT_A", "Old feat", "Feat"),
      entity("FEAT_B", "New feat", "Feat"),
    ];
    const result = evaluateCharacter(input, definitions);

    expect(
      result.choices.find((choice) => choice.type === "Replacement"),
    ).toMatchObject({
      replacementOptions: [
        {
          replacesOccurrenceId: "old-feat",
          definitionId: "FEAT_A",
          // Retraining Old feat into Old feat changes nothing.
          candidates: [{ definitionId: "FEAT_B", eligible: true }],
        },
      ],
    });
    const closed = evaluateCharacter(
      { ...input, candidateDetailLevels: [2] },
      definitions,
    );
    const open = evaluateCharacter(
      {
        ...input,
        candidateDetailLevels: [2],
        candidateDetailReplacementChoiceIds: ["level-2:replacement:0"],
      },
      definitions,
    );
    expect(
      closed.choices.find((choice) => choice.type === "Replacement")
        ?.replacementOptions?.[0]?.candidates,
    ).toEqual([]);
    expect(
      open.choices.find((choice) => choice.type === "Replacement")
        ?.replacementOptions?.[0]?.candidates,
    ).toHaveLength(1);
  });

  it("checks prerequisites for what a retrain may take, at the retraining level", () => {
    const result = evaluateCharacter(
      {
        level: 2,
        baseAbilities: {},
        occurrences: [
          {
            id: "level-1",
            definitionId: "LEVEL_1",
            acquiredLevel: 1,
            kind: "root",
          },
          {
            id: "old-feat",
            definitionId: "FEAT_A",
            acquiredLevel: 1,
            parentId: "level-1",
            ruleOrdinal: 0,
            choiceIndex: 0,
            kind: "choice",
          },
          {
            id: "level-2",
            definitionId: "LEVEL_2",
            acquiredLevel: 2,
            kind: "root",
          },
        ],
        inventory: [],
      },
      [
        entity("LEVEL_1", "1", "Level", {
          rules: [rule("select", { type: "Feat", number: "1" }, 0)],
        }),
        entity("LEVEL_2", "2", "Level", {
          rules: [rule("replace", { retrain: "true", optional: "true" }, 0)],
        }),
        entity("FEAT_A", "Old feat", "Feat"),
        entity("FEAT_B", "Open feat", "Feat"),
        entity("FEAT_C", "Late feat", "Feat", {
          prerequisites: "11th level",
        }),
      ],
    );
    const candidates = result.choices.find(
      (choice) => choice.type === "Replacement",
    )?.replacementOptions?.[0]?.candidates;
    expect(candidates).toContainEqual(
      expect.objectContaining({ definitionId: "FEAT_B", eligible: true }),
    );
    expect(candidates).toContainEqual(
      expect.objectContaining({
        definitionId: "FEAT_C",
        eligible: false,
        reasons: ["prerequisite"],
      }),
    );
  });

  it("doesn't count what a retrain gives up toward what it takes", () => {
    const result = evaluateCharacter(
      {
        level: 3,
        baseAbilities: {},
        occurrences: [
          {
            id: "level-1",
            definitionId: "LEVEL_1",
            acquiredLevel: 1,
            kind: "root",
          },
          {
            id: "base-feat",
            definitionId: "FEAT_BASE",
            acquiredLevel: 1,
            parentId: "level-1",
            ruleOrdinal: 0,
            choiceIndex: 0,
            kind: "choice",
          },
          {
            id: "level-2",
            definitionId: "LEVEL_2",
            acquiredLevel: 2,
            kind: "root",
          },
          {
            id: "other-feat",
            definitionId: "FEAT_OTHER",
            acquiredLevel: 2,
            parentId: "level-2",
            ruleOrdinal: 0,
            choiceIndex: 0,
            kind: "choice",
          },
          {
            id: "level-3",
            definitionId: "LEVEL_3",
            acquiredLevel: 3,
            kind: "root",
          },
        ],
        inventory: [],
      },
      [
        entity("LEVEL_1", "1", "Level", {
          rules: [rule("select", { type: "Feat", number: "1" }, 0)],
        }),
        entity("LEVEL_2", "2", "Level", {
          rules: [rule("select", { type: "Feat", number: "1" }, 0)],
        }),
        entity("LEVEL_3", "3", "Level", {
          rules: [rule("replace", { retrain: "true", optional: "true" }, 0)],
        }),
        entity("FEAT_BASE", "Base Feat", "Feat"),
        entity("FEAT_OTHER", "Other Feat", "Feat"),
        entity("FEAT_ADVANCED", "Advanced Feat", "Feat", {
          prerequisites: "Base Feat",
        }),
      ],
    );
    const options =
      result.choices.find((choice) => choice.type === "Replacement")
        ?.replacementOptions ?? [];
    const advanced = (replaces: string) =>
      options
        .find((option) => option.replacesOccurrenceId === replaces)
        ?.candidates.find(
          (candidate) => candidate.definitionId === "FEAT_ADVANCED",
        );
    // Giving up Base Feat can't pay for Advanced Feat's prerequisite...
    expect(advanced("base-feat")).toMatchObject({
      eligible: false,
      reasons: ["prerequisite"],
    });
    // ...but giving up another feat keeps Base Feat, so it qualifies.
    expect(advanced("other-feat")).toMatchObject({ eligible: true });
  });

  it("keeps the replaced occurrence visible in its completed retraining slot", () => {
    const result = evaluateCharacter(
      {
        level: 2,
        baseAbilities: {},
        occurrences: [
          {
            id: "level-1",
            definitionId: "LEVEL_1",
            acquiredLevel: 1,
            kind: "root",
          },
          {
            id: "old-power",
            definitionId: "POWER_A",
            acquiredLevel: 1,
            parentId: "level-1",
            ruleOrdinal: 0,
            choiceIndex: 0,
            kind: "choice",
          },
          {
            id: "level-2",
            definitionId: "LEVEL_2",
            acquiredLevel: 2,
            kind: "root",
          },
          {
            id: "new-power",
            definitionId: "POWER_B",
            acquiredLevel: 2,
            parentId: "level-2",
            ruleOrdinal: 0,
            choiceIndex: 0,
            replacesId: "old-power",
            kind: "choice",
          },
        ],
        inventory: [],
      },
      [
        entity("LEVEL_1", "1", "Level", {
          rules: [rule("select", { type: "Power", number: "1" }, 0)],
        }),
        entity("LEVEL_2", "2", "Level", {
          rules: [rule("replace", { retrain: "true", optional: "true" }, 0)],
        }),
        entity("POWER_A", "Old power", "Power"),
        entity("POWER_B", "New power", "Power"),
      ],
    );

    expect(
      result.choices.find(
        (choice) => choice.providerOccurrenceId === "level-2",
      ),
    ).toMatchObject({
      selectedOccurrenceId: "new-power",
      replacementOptions: [
        {
          replacesOccurrenceId: "old-power",
          definitionId: "POWER_A",
        },
      ],
    });
  });

  it("uses a replacement rule's minimum level for early-granted providers", () => {
    const result = evaluateCharacter(
      {
        level: 7,
        baseAbilities: {},
        occurrences: [
          {
            id: "class",
            definitionId: "CLASS",
            acquiredLevel: 1,
            kind: "root",
          },
          {
            id: "old-power",
            definitionId: "POWER_A",
            acquiredLevel: 1,
            parentId: "class",
            ruleOrdinal: 0,
            choiceIndex: 0,
            kind: "choice",
          },
          {
            id: "advancement",
            definitionId: "ADVANCEMENT",
            acquiredLevel: 1,
            kind: "grant",
          },
        ],
        inventory: [],
      },
      [
        entity("CLASS", "Psionic class", "Class", {
          rules: [
            rule(
              "select",
              { type: "Power", number: "1", Category: "Psionic" },
              0,
            ),
          ],
        }),
        entity("ADVANCEMENT", "Augment advancement", "Feature", {
          rules: [
            rule("replace", { Level: "7", powerswap: "Psionic,at-will,7" }, 0),
          ],
        }),
        entity("POWER_A", "Old power", "Power", {
          categories: ["Psionic", "at-will"],
          specifics: { Level: "1" },
        }),
        entity("POWER_B", "New power", "Power", {
          categories: ["Psionic", "at-will"],
          specifics: { Level: "7" },
        }),
      ],
    );

    expect(
      result.choices.find((choice) => choice.type === "Replacement"),
    ).toMatchObject({
      optional: false,
      replacementOptions: [
        {
          replacesOccurrenceId: "old-power",
          candidates: [{ definitionId: "POWER_B", eligible: true }],
        },
      ],
    });
  });

  it("re-retrains the active replacement through its original slot", () => {
    const result = evaluateCharacter(
      {
        level: 3,
        baseAbilities: {},
        occurrences: [
          {
            id: "level-1",
            definitionId: "LEVEL_1",
            acquiredLevel: 1,
            kind: "root",
          },
          {
            id: "old-feat",
            definitionId: "FEAT_A",
            acquiredLevel: 1,
            parentId: "level-1",
            ruleOrdinal: 0,
            choiceIndex: 0,
            kind: "choice",
          },
          {
            id: "level-2",
            definitionId: "LEVEL_2",
            acquiredLevel: 2,
            kind: "root",
          },
          {
            id: "new-feat",
            definitionId: "FEAT_B",
            acquiredLevel: 2,
            parentId: "level-2",
            ruleOrdinal: 0,
            choiceIndex: 0,
            replacesId: "old-feat",
            kind: "choice",
          },
          {
            id: "level-3",
            definitionId: "LEVEL_3",
            acquiredLevel: 3,
            kind: "root",
          },
        ],
        inventory: [],
      },
      [
        entity("LEVEL_1", "1", "Level", {
          rules: [rule("select", { type: "Feat", number: "1" }, 0)],
        }),
        entity("LEVEL_2", "2", "Level", {
          rules: [rule("replace", { retrain: "true", optional: "true" }, 0)],
        }),
        entity("LEVEL_3", "3", "Level", {
          rules: [rule("replace", { retrain: "true", optional: "true" }, 0)],
        }),
        entity("FEAT_A", "Old feat", "Feat"),
        entity("FEAT_B", "Current feat", "Feat"),
        entity("FEAT_C", "Next feat", "Feat"),
      ],
    );

    expect(
      result.choices.find(
        (choice) => choice.providerOccurrenceId === "level-3",
      ),
    ).toMatchObject({
      replacementOptions: [
        {
          replacesOccurrenceId: "new-feat",
          definitionId: "FEAT_B",
          candidates: [
            { definitionId: "FEAT_A", eligible: true },
            { definitionId: "FEAT_C", eligible: true },
          ],
        },
      ],
    });
    expect(
      result.choices.find((choice) => choice.providerOccurrenceId === "level-1")
        ?.selectedOccurrenceId,
    ).toBe("new-feat");
    expect(result.diagnostics).not.toContainEqual(
      expect.objectContaining({ code: "choice.required" }),
    );
  });

  it("resolves each swap of a power-swap chain at its own level", () => {
    // Native BuildReplaceList: each swap lists what was held at its own
    // level plus its own target, and keeps its own pick as its selection
    // even after a later swap trades that pick away.
    const level = (value: number): CharacterOccurrence => ({
      id: `level-${value}`,
      definitionId: `LEVEL_${value}`,
      acquiredLevel: value,
      kind: "root",
    });
    const pick = (
      id: string,
      definitionId: string,
      acquiredLevel: number,
      replacesId?: string,
    ): CharacterOccurrence => ({
      id,
      definitionId,
      acquiredLevel,
      parentId: `level-${acquiredLevel}`,
      ruleOrdinal: 0,
      choiceIndex: 0,
      kind: "choice",
      ...(replacesId === undefined ? {} : { replacesId }),
    });
    const daily = (id: string, name: string, powerLevel: number) =>
      entity(id, name, "Power", {
        categories: ["Fighter", "daily"],
        specifics: { Level: String(powerLevel) },
      });
    const select = [
      rule("select", { type: "Power", number: "1", Category: "Fighter" }, 0),
    ];
    const swap = (swapLevel: number) =>
      entity(`LEVEL_${swapLevel}`, String(swapLevel), "Level", {
        rules: [
          rule("replace", { powerswap: `Fighter,daily,${swapLevel}` }, 0),
        ],
      });
    const result = evaluateCharacter(
      {
        level: 27,
        baseAbilities: {},
        occurrences: [
          level(1),
          pick("bristling", "BRISTLING", 1),
          level(5),
          pick("driving", "DRIVING", 5),
          level(9),
          pick("press", "PRESS", 9),
          level(15),
          pick("hurricane-15", "HURRICANE", 15, "bristling"),
          level(19),
          pick("toppling-19", "TOPPLING", 19, "hurricane-15"),
          level(25),
          pick("hurricane-25", "HURRICANE", 25, "toppling-19"),
        ],
        inventory: [],
      },
      [
        entity("LEVEL_1", "1", "Level", { rules: select }),
        entity("LEVEL_5", "5", "Level", { rules: select }),
        entity("LEVEL_9", "9", "Level", { rules: select }),
        swap(15),
        swap(19),
        swap(25),
        daily("BRISTLING", "Bristling Defense", 1),
        daily("DRIVING", "Driving Attack", 5),
        daily("PRESS", "Press of Steel", 9),
        daily("HURRICANE", "Hurricane Strike", 15),
        daily("TOPPLING", "Toppling Finish", 19),
        daily("DOOM", "Time to Die", 25),
      ],
    );
    const swapAt = (swapLevel: number) => {
      const choice = result.choices.find(
        (candidate) => candidate.providerOccurrenceId === `level-${swapLevel}`,
      );
      return {
        selected: choice?.selectedOccurrenceId,
        targets: choice?.replacementOptions?.map(
          ({ replacesOccurrenceId }) => replacesOccurrenceId,
        ),
        legal: (target: string) =>
          choice?.replacementOptions
            ?.find(
              ({ replacesOccurrenceId }) => replacesOccurrenceId === target,
            )
            ?.candidates.filter(({ eligible }) => eligible)
            .map(({ definitionId }) => definitionId),
      };
    };

    const at15 = swapAt(15);
    expect(at15.selected).toBe("hurricane-15");
    expect(at15.targets).toEqual(["bristling", "driving", "press"]);
    expect(at15.legal("bristling")).toEqual(["HURRICANE"]);
    const at19 = swapAt(19);
    expect(at19.selected).toBe("toppling-19");
    expect(at19.targets).toEqual(["driving", "press", "hurricane-15"]);
    // Hurricane Strike is held at 19, so only the swap that trades it may
    // take it again; Toppling Finish is the pick.
    expect(at19.legal("driving")).toEqual(["BRISTLING", "TOPPLING"]);
    expect(at19.legal("hurricane-15")).toEqual(["BRISTLING", "TOPPLING"]);
    const at25 = swapAt(25);
    expect(at25.selected).toBe("hurricane-25");
    expect(at25.targets).toEqual(["driving", "press", "toppling-19"]);
    expect(at25.legal("toppling-19")).toEqual([
      "BRISTLING",
      "HURRICANE",
      "DOOM",
    ]);

    expect(result.replacedSelections?.map(({ id }) => id)).toEqual([
      "hurricane-15",
      "toppling-19",
    ]);
    expect(result.occurrences.map(({ id }) => id)).toContain("hurricane-25");
    expect(result.occurrences.map(({ id }) => id)).not.toContain(
      "hurricane-15",
    );
    expect(result.diagnostics).not.toContainEqual(
      expect.objectContaining({ code: "choice.required" }),
    );
  });

  it("applies list, replacement, and die-step overlays without mutating content", () => {
    const power = entity("POWER", "Power", "Power", {
      specifics: { Keywords: "Arcane", Damage: "1d8" },
    });
    const fields = applyFieldOverlays(power, [
      {
        providerOccurrenceId: "provider",
        targetDefinitionIds: ["POWER"],
        field: "Keywords",
        listAddition: "Fire",
      },
      {
        providerOccurrenceId: "provider",
        targetDefinitionIds: ["POWER"],
        field: "Damage",
        dieIncrease: "1",
      },
      {
        providerOccurrenceId: "provider",
        targetDefinitionIds: ["POWER"],
        field: "Display",
        value: "Changed",
      },
    ]);
    expect(fields).toEqual({
      Keywords: "Arcane, Fire",
      Damage: "1d10",
      Display: "Changed",
    });
    expect(power.specifics.map(({ value }) => value)).toEqual([
      "Arcane",
      "1d8",
    ]);
  });
});

describe("legacy item requirements", () => {
  const evaluate = (ownsKiFocusUser: boolean, equippedQuantity: number) =>
    evaluateCharacter(
      {
        level: 1,
        baseAbilities: {},
        occurrences: [
          rootOccurrence,
          ...(ownsKiFocusUser
            ? [
                {
                  id: "ki",
                  definitionId: EXCEPTION_IDS.kiFocusUser,
                  acquiredLevel: 1,
                  kind: "grant" as const,
                },
              ]
            : []),
        ],
        inventory: [
          {
            id: "focus",
            definitionIds: ["KI_FOCUS"],
            quantity: 1,
            equippedQuantity,
            acquiredLevel: 1,
          },
        ],
      },
      [
        entity("ROOT", "1", "Level"),
        entity(EXCEPTION_IDS.kiFocusUser, "Ki Focus User", "Internal"),
        entity("KI_FOCUS", "Synthetic Ki Focus +1", "Magic Item", {
          specifics: {
            "Magic Item Type": "Ki Focus",
            Requirement: "Must be able to use Ki Focuses as an implement.",
          },
        }),
      ],
    );
  const unmet = (evaluated: ReturnType<typeof evaluate>) =>
    evaluated.diagnostics.filter(
      (diagnostic) => diagnostic.code === "item.requirement-unmet",
    );

  it("marks an equipped item whose Requirement is unmet as a house rule", () => {
    const evaluated = evaluate(false, 1);
    expect(unmet(evaluated)).toHaveLength(1);
    expect(evaluated.legal).toBe(false);
  });

  it("accepts the item once the Internal record is owned, or unequipped", () => {
    expect(unmet(evaluate(true, 1))).toEqual([]);
    expect(evaluate(true, 1).legal).toBe(true);
    expect(unmet(evaluate(false, 0))).toEqual([]);
  });
});

describe("legacy loot execution (EquipLoot/ShouldExecute)", () => {
  const content = [
    entity("ROOT", "1", "Level"),
    entity("BAG", "Synthetic Bag", "Magic Item", {
      specifics: { "Magic Item Type": "Wondrous Item", "Item Slot": "" },
      rules: [rule("statadd", { name: "Weight Discount", value: "200" }, 0)],
    }),
    entity("CHARM", "Synthetic Charm", "Magic Item", {
      specifics: { "Item Slot": "Neck" },
      rules: [rule("statadd", { name: "Fortitude", value: "+1" }, 0)],
    }),
    entity("TOME", "Synthetic Tome", "Magic Item", {
      specifics: { "Item Slot": "Off-hand", _AlwaysExecute: "true" },
      rules: [rule("statadd", { name: "Will", value: "+1" }, 0)],
    }),
    entity("DAGGER", "Dagger", "Weapon", {
      specifics: { "Item Slot": "One-hand" },
    }),
    entity("RUNE", "Synthetic Rune Weapon", "Magic Item", {
      specifics: { "Item Slot": "" },
      rules: [rule("statadd", { name: "Initiative", value: "+1" }, 0)],
    }),
    entity("BRACERS", "Synthetic Bracers", "Magic Item", {
      specifics: { "Item Slot": "Arms" },
    }),
    entity("SHIELD", "Light Shield", "Armor", {
      specifics: { "Item Slot": "Off-hand" },
    }),
    entity("SHIELD_ENCHANT", "Synthetic Defender Shield", "Magic Item", {
      specifics: { "Item Slot": "Arms" },
      rules: [rule("statadd", { name: "Reflex", value: "+1" }, 0)],
    }),
  ];
  const holding = (
    id: string,
    definitionIds: string[],
    equippedQuantity: number,
    quantity = 1,
  ): CharacterInventoryEntry => ({
    id,
    definitionIds,
    quantity,
    equippedQuantity,
    acquiredLevel: 1,
  });
  const evaluate = (inventory: CharacterInventoryEntry[]) =>
    evaluateCharacter(
      { level: 1, baseAbilities: {}, occurrences: [rootOccurrence], inventory },
      content,
    );

  it("runs an owned, unequipped item whose base has no Item Slot", () => {
    const evaluated = evaluate([holding("bag", ["BAG"], 0)]);
    expect(evaluated.stats["Weight Discount"]?.value).toBe(200);
  });

  it("keeps an owned, unequipped slotted item inert", () => {
    expect(
      evaluate([holding("charm", ["CHARM"], 0)]).stats.Fortitude?.value ?? 0,
    ).toBe(0);
    expect(
      evaluate([holding("charm", ["CHARM"], 1)]).stats.Fortitude?.value,
    ).toBe(1);
  });

  it("runs an unequipped slotted item that sets _AlwaysExecute", () => {
    expect(evaluate([holding("tome", ["TOME"], 0)]).stats.Will?.value).toBe(1);
  });

  it("ignores holdings with no owned count", () => {
    expect(
      evaluate([holding("bag", ["BAG"], 0, 0)]).stats["Weight Discount"]
        ?.value ?? 0,
    ).toBe(0);
  });

  it("decides by the base element, not an unslotted enchantment", () => {
    expect(
      evaluate([holding("knife", ["DAGGER", "RUNE"], 0)]).stats.Initiative
        ?.value ?? 0,
    ).toBe(0);
    expect(
      evaluate([holding("knife", ["DAGGER", "RUNE"], 1)]).stats.Initiative
        ?.value,
    ).toBe(1);
  });

  it("runs one definition once across holdings (AlreadyExecuted)", () => {
    const evaluated = evaluate([
      holding("bag-a", ["BAG"], 0),
      { ...holding("bag-b", ["BAG"], 0), name: "Second bag" },
    ]);
    expect(evaluated.stats["Weight Discount"]?.value).toBe(200);
  });

  it("skips an Arms enchantment while an equipped base fills the Arms slot", () => {
    const shield = holding("shield", ["SHIELD", "SHIELD_ENCHANT"], 1);
    expect(evaluate([shield]).stats.Reflex?.value).toBe(1);
    expect(
      evaluate([shield, holding("bracers", ["BRACERS"], 0)]).stats.Reflex
        ?.value,
    ).toBe(1);
    expect(
      evaluate([shield, holding("bracers", ["BRACERS"], 1)]).stats.Reflex
        ?.value ?? 0,
    ).toBe(0);
  });

  it("does not treat an executed, unequipped item as worn", () => {
    const worn = [
      ...content,
      entity("WATCH", "Watch", "Feature", {
        rules: [
          rule(
            "statadd",
            { name: "Speed", value: "+1", wearing: "Synthetic Bag" },
            0,
          ),
        ],
      }),
    ];
    const withBag = (equippedQuantity: number) =>
      evaluateCharacter(
        {
          level: 1,
          baseAbilities: {},
          occurrences: [
            rootOccurrence,
            {
              id: "watch",
              definitionId: "WATCH",
              acquiredLevel: 1,
              kind: "grant",
            },
          ],
          inventory: [holding("bag", ["BAG"], equippedQuantity)],
        },
        worn,
      );
    expect(withBag(0).stats["Weight Discount"]?.value).toBe(200);
    expect(withBag(0).stats.Speed?.value ?? 0).toBe(0);
    expect(withBag(1).stats.Speed?.value).toBe(1);
  });
});

describe("dormant saved selections (D043)", () => {
  const content = [
    entity("ROOT", "3", "Level", {
      rules: [
        rule(
          "select",
          {
            type: "Power",
            name: "Power Encounter 3",
            requires: "!No Level 3 Encounter Power",
          },
          0,
        ),
      ],
    }),
    entity("CLASS", "Hunter", "Class", {
      rules: [rule("grant", { name: "NOLV3", type: "Internal" }, 0)],
    }),
    entity("NOLV3", "No Level 3 Encounter Power", "Internal"),
    entity("PICK", "Lightning's Revelation", "Power"),
  ];
  const pick: CharacterOccurrence = {
    id: "pick",
    definitionId: "PICK",
    acquiredLevel: 3,
    parentId: "root",
    ruleOrdinal: 0,
    choiceIndex: 0,
    kind: "choice",
  };
  const classOccurrence: CharacterOccurrence = {
    id: "class",
    definitionId: "CLASS",
    acquiredLevel: 1,
    kind: "root",
  };

  it("lists a saved pick whose slot an owned record switches off", () => {
    const evaluated = evaluateCharacter(
      {
        level: 3,
        baseAbilities: {},
        occurrences: [rootOccurrence, classOccurrence, pick],
        inventory: [],
      },
      content,
    );
    expect(evaluated.activeDefinitionIds).not.toContain("PICK");
    expect(evaluated.dormantSelections).toEqual([
      {
        occurrence: pick,
        providerOccurrenceId: "root",
        ruleOrdinal: 0,
        slotName: "Power Encounter 3",
        slotType: "Power",
        requires: "!No Level 3 Encounter Power",
        blockedBy: [expect.objectContaining({ definitionId: "NOLV3" })],
      },
    ]);
  });

  it("lists nothing while the slot is active", () => {
    const evaluated = evaluateCharacter(
      {
        level: 3,
        baseAbilities: {},
        occurrences: [rootOccurrence, pick],
        inventory: [],
      },
      content,
    );
    expect(evaluated.activeDefinitionIds).toContain("PICK");
    expect(evaluated.dormantSelections).toBeUndefined();
  });
});
