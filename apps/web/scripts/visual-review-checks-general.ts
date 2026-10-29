/**
 * The visual-review verifier's rules for the page's General sections (see
 * verify-visual-review.ts): library role lines and dialog wording, and the
 * free-item (FREEBEE) commands.
 */
import {
  CharacterTransaction,
  type CharacterBuild,
} from "@4ecb/character-domain";
import type { ContentEntity } from "@4ecb/content-domain";
import type { EvaluatedCharacter } from "@4ecb/rules-engine";

import { evaluate } from "../../../scripts/native-character";
import { characterRoleLine } from "../src/character-role";
import { EmptyTrashDialog } from "../src/EmptyTrashDialog";
import { freebeeGiftCommand } from "../src/freebee-gifts";

import {
  contains,
  createElement,
  equal,
  markup,
  textOf,
  truthy,
  type Check,
  type Rule,
} from "./visual-review-assert";
import type { ReviewContext } from "./visual-review-context";

const rules: Rule[] = [];
const rule = (
  section: string,
  item: string,
  run: (context: ReviewContext) => Check[] | Promise<Check[]>,
) => rules.push({ where: `general:${section}`, link: section, item, run });
const key = (value: string) => value.trim().toLocaleLowerCase();
const LIBRARY = "Character library";
const FREE = "Undoing a free item";

rule(LIBRARY, "Pane band", (context) => {
  const lines = context.plan.characters.map(({ slug }) => {
    const c = context.character(slug);
    return { slug, line: characterRoleLine(c.evaluation, context.entities) };
  });
  const hybrids = [
    "executioner-fighter",
    "executioner-rogue",
    "artificer-ardent",
    "sylestine",
    "dv",
  ];
  return [
    truthy(
      "Every review character has a role line",
      lines.every(({ line }) => line !== undefined && line !== ""),
      lines.map(({ slug, line }) => `${slug}: ${line ?? "—"}`).join("; "),
    ),
    ...hybrids.map((slug) => {
      const line = lines.find((value) => value.slug === slug)?.line ?? "";
      return truthy(
        `${slug}'s role line reads "X / Y"`,
        /^\S.* \/ \S.*$/.test(line),
        line,
      );
    }),
    ...lines
      .filter(({ slug }) => !hybrids.includes(slug))
      .map(({ slug, line }) =>
        truthy(
          `${slug}'s role line is "<Power source> <Role>"`,
          /^(Arcane|Divine|Martial|Primal|Psionic|Shadow|Elemental) (Controller|Defender|Leader|Striker)$/.test(
            line ?? "",
          ),
          line ?? "—",
        ),
      ),
  ];
});

rule(LIBRARY, "Empty trash confirmation", () => {
  const one = textOf(
    markup(
      createElement(EmptyTrashDialog, {
        names: ["Synthetic Hero"],
        onCancel: () => undefined,
        onConfirm: () => undefined,
      }),
    ),
  );
  const two = textOf(
    markup(
      createElement(EmptyTrashDialog, {
        names: ["A", "B"],
        onCancel: () => undefined,
        onConfirm: () => undefined,
      }),
    ),
  );
  return [
    contains(
      "One character: singular question",
      one,
      "Permanently delete 1 character? This can’t be undone.",
    ),
    contains("… and button", one, "Delete 1 character"),
    contains("Two: plural", two, "Permanently delete 2 characters?"),
  ];
});

/** A build's pending gifts, given as the app would on open. */
function gifted(
  build: CharacterBuild,
  evaluation: EvaluatedCharacter,
  context: ReviewContext,
) {
  const command = freebeeGiftCommand(build, evaluation, context.byId);
  const transaction = new CharacterTransaction(build);
  if (command !== undefined) transaction.dispatch(command);
  return transaction.current;
}

const holdingNames = (build: CharacterBuild) =>
  build.inventory.map(({ elements }) =>
    elements.map(({ name }) => name).join(" + "),
  );

rule(FREE, "Undo and Remove", (context) => {
  // The gnome wizard as it was before the Spellbook was given: same build
  // without the gift or its marker.
  const wizard = context.character("wizard-gnome");
  const spellbook = context.entity("ID_FMP_GEAR_33");
  const before: CharacterBuild = {
    ...wizard.build,
    inventory: wizard.build.inventory.filter(
      ({ elements }) =>
        !elements.some(
          ({ definitionId }) => key(definitionId ?? "") === key(spellbook.id),
        ),
    ),
    textStrings: Object.fromEntries(
      Object.entries(wizard.build.textStrings).filter(
        ([name]) => key(name) !== key(spellbook.id),
      ),
    ),
  };
  const evaluation = evaluate(before, context.entities, {
    candidateDetailLevels: [],
  });
  const after = gifted(before, evaluation, context);
  const has = (build: CharacterBuild) =>
    holdingNames(build).includes(spellbook.name);
  // Undo: the class pick goes, and the gift that joined its edit with it.
  const classOccurrence = evaluation.occurrences.find(
    ({ definitionId }) => key(definitionId) === key("ID_FMP_CLASS_9"),
  );
  const undone = new CharacterTransaction(before);
  if (classOccurrence !== undefined)
    undone.dispatch({
      kind: "remove-occurrence",
      occurrenceId: classOccurrence.id,
    });
  const undoneEvaluation = evaluate(undone.current, context.entities, {
    candidateDetailLevels: [],
  });
  // Remove: the gift goes and stays gone.
  const entry = after.inventory.find(({ elements }) =>
    elements.some(
      ({ definitionId }) => key(definitionId ?? "") === key(spellbook.id),
    ),
  );
  const removed = new CharacterTransaction(after);
  if (entry !== undefined)
    removed.dispatch({ kind: "remove-inventory", entryId: entry.id });
  const removedEvaluation = evaluate(removed.current, context.entities, {
    candidateDetailLevels: [],
  });
  // One Undo: the editor amends the gift into the edit that entitled it
  // (CharacterEditorPage's amend → CharacterTransaction.amend), so a single
  // undo takes back the edit and the gift together.
  const gift = freebeeGiftCommand(before, evaluation, context.byId);
  const step = new CharacterTransaction(before);
  if (classOccurrence !== undefined)
    step.dispatch({
      kind: "remove-occurrence",
      occurrenceId: classOccurrence.id,
    });
  if (gift !== undefined) step.amend(gift);
  const gave = has(step.current);
  step.undo();
  return [
    truthy(
      "One Undo takes back the edit and its gift together",
      gift !== undefined && gave && step.current === before && !step.canUndo,
      `gift ${gift === undefined ? "none" : "amended"}; after undo: ${holdingNames(step.current).join("; ")}`,
    ),
    truthy(
      "Picking Wizard gives the Spellbook",
      !has(before) && has(after),
      holdingNames(after).join("; "),
    ),
    equal(
      "Without the Wizard pick (undo) nothing is given",
      freebeeGiftCommand(undone.current, undoneEvaluation, context.byId),
      undefined,
    ),
    truthy(
      "Removing the Spellbook removes it",
      entry !== undefined && !has(removed.current),
    ),
    equal(
      "… and it is not given again",
      freebeeGiftCommand(removed.current, removedEvaluation, context.byId),
      undefined,
    ),
  ];
});

/** A definition whose rules give the named item as a FREEBEE. */
function freebeeProviders(
  context: ReviewContext,
  item: RegExp,
): ContentEntity[] {
  const targets = new Set(
    context.entities
      .filter((entity) => item.test(entity.name))
      .map(({ id }) => key(id)),
  );
  return context.entities.filter((entity) =>
    entity.rules.some(
      (statement) =>
        key(statement.name) === "statadd" &&
        statement.attributes.some(
          ({ name, value }) =>
            key(name) === "name" &&
            key(value).startsWith("freebee:") &&
            targets.has(key(value.slice("freebee:".length))),
        ),
    ),
  );
}

rule(FREE, "A free item appears", (context) => {
  const monk = context.character("monk");
  const sources: readonly [string, RegExp, RegExp][] = [
    ["Student of Sword Magic", /^Student of Sword Magic$/, /spellbook/i],
    [
      "a hexblade's pact weapon",
      /Pact .*Weapon|Weapon$/,
      /pact|blade|weapon|sword/i,
    ],
    ["an executioner's poison", /Poison/, /poison/i],
    ["Harper Agent (Harper Pin)", /Harper/, /Harper Pin/i],
    ["the Trap-Making Kit", /./, /Trap-Making Kit/i],
  ];
  return sources.map(([label, providerName, itemName]) => {
    const providers = freebeeProviders(context, itemName).filter((entity) =>
      providerName.test(entity.name),
    );
    const provider = providers[0];
    if (provider === undefined)
      return truthy(
        `${label} gives its item`,
        false,
        "no FREEBEE provider found",
      );
    const build: CharacterBuild = {
      ...monk.build,
      grabbag: [
        ...monk.build.grabbag,
        {
          id: `verify:freebee:${provider.id}`,
          identity: {
            definitionId: provider.id,
            name: provider.name,
            type: provider.type,
          },
          acquiredLevel: 1,
          legality: "houserule",
          children: [],
          unresolved: false,
        },
      ],
    };
    const evaluation = evaluate(build, context.entities, {
      candidateDetailLevels: [],
    });
    const after = gifted(build, evaluation, context);
    const given = holdingNames(after).filter(
      (name) => !holdingNames(monk.build).includes(name),
    );
    return truthy(
      `${label} (${provider.name}) gives its item`,
      given.some((name) => itemName.test(name)),
      given.join("; ") || "nothing given",
    );
  });
});

export const GENERAL_RULES: readonly Rule[] = rules;
