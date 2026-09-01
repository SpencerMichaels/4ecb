export type BuildLegality = "rules-legal" | "houserule";

export interface BuildElementIdentity {
  readonly definitionId?: string;
  readonly name: string;
  readonly type: string;
  readonly url?: string;
}

export interface BuildOccurrence {
  /** Stable within the character. Imported charelem tokens are never treated as global IDs. */
  readonly id: string;
  readonly identity: BuildElementIdentity;
  readonly acquiredLevel: number;
  readonly legality: BuildLegality;
  readonly replacesId?: string;
  readonly children: readonly BuildOccurrence[];
  readonly unresolved: boolean;
}

export interface BuildLevelFrame {
  readonly level: number;
  readonly root: BuildOccurrence;
}

export interface BuildInventoryEntry {
  readonly id: string;
  readonly acquiredLevel: number;
  readonly quantity: number;
  readonly equippedQuantity: number;
  readonly elements: readonly BuildElementIdentity[];
  readonly name?: string;
  readonly showPowerCard?: boolean;
  readonly overrides: Readonly<Record<string, string>>;
  readonly legality: BuildLegality;
}

export interface BuildAlternate {
  readonly id: string;
  readonly selectName: string;
  readonly provider: BuildElementIdentity;
  readonly choice: BuildOccurrence;
}

export interface CharacterBuild {
  readonly formatVersion: 1;
  readonly effectiveLevel: number;
  readonly levels: readonly BuildLevelFrame[];
  readonly grabbag: readonly BuildOccurrence[];
  readonly inventory: readonly BuildInventoryEntry[];
  readonly alternates: readonly BuildAlternate[];
  readonly baseAbilities: Readonly<Record<string, number>>;
  readonly textStrings: Readonly<Record<string, string>>;
}

export type CharacterCommand =
  | { readonly kind: "set-effective-level"; readonly level: number }
  | {
      readonly kind: "set-base-ability";
      readonly ability: string;
      readonly value: number;
    }
  | {
      readonly kind: "choose";
      readonly parentId: string;
      readonly index: number;
      readonly occurrence: BuildOccurrence;
    }
  | {
      readonly kind: "remove-occurrence";
      readonly occurrenceId: string;
    }
  | {
      readonly kind: "replace-occurrence";
      readonly occurrenceId: string;
      readonly replacement: BuildOccurrence;
    }
  | { readonly kind: "add-level"; readonly frame: BuildLevelFrame }
  | { readonly kind: "remove-last-level" }
  | { readonly kind: "put-inventory"; readonly entry: BuildInventoryEntry }
  | { readonly kind: "remove-inventory"; readonly entryId: string }
  | {
      readonly kind: "set-text";
      readonly name: string;
      readonly value: string;
    };

function replaceInTree(
  occurrence: BuildOccurrence,
  id: string,
  update: (value: BuildOccurrence) => BuildOccurrence | undefined,
): { readonly value?: BuildOccurrence; readonly found: boolean } {
  if (occurrence.id === id) {
    const value = update(occurrence);
    return value === undefined ? { found: true } : { value, found: true };
  }
  let found = false;
  const children = occurrence.children.flatMap((child) => {
    const result = replaceInTree(child, id, update);
    found ||= result.found;
    return result.value === undefined ? [] : [result.value];
  });
  return found
    ? { value: { ...occurrence, children }, found: true }
    : { value: occurrence, found: false };
}

function updateOccurrence(
  build: CharacterBuild,
  id: string,
  update: (value: BuildOccurrence) => BuildOccurrence | undefined,
): CharacterBuild {
  let found = false;
  const levels = build.levels.map((frame) => {
    const result = replaceInTree(frame.root, id, update);
    found ||= result.found;
    if (result.value === undefined)
      throw new Error("A level root cannot be removed");
    return result.found ? { ...frame, root: result.value } : frame;
  });
  const grabbag = build.grabbag.flatMap((occurrence) => {
    const result = replaceInTree(occurrence, id, update);
    found ||= result.found;
    return result.value === undefined ? [] : [result.value];
  });
  if (!found) throw new Error(`Occurrence not found: ${id}`);
  return { ...build, levels, grabbag };
}

export function applyCharacterCommand(
  build: CharacterBuild,
  command: CharacterCommand,
): CharacterBuild {
  switch (command.kind) {
    case "set-effective-level": {
      if (
        !Number.isInteger(command.level) ||
        command.level < 1 ||
        command.level > 30
      )
        throw new Error("Effective level must be an integer from 1 through 30");
      return { ...build, effectiveLevel: command.level };
    }
    case "set-base-ability": {
      if (!Number.isInteger(command.value) || command.value < 1)
        throw new Error("Ability scores must be positive integers");
      return {
        ...build,
        baseAbilities: {
          ...build.baseAbilities,
          [command.ability]: command.value,
        },
      };
    }
    case "choose":
      if (!Number.isInteger(command.index) || command.index < 0)
        throw new Error("Choice index must be a non-negative integer");
      return updateOccurrence(build, command.parentId, (parent) => {
        const children = [...parent.children];
        children[command.index] = command.occurrence;
        return { ...parent, children };
      });
    case "remove-occurrence":
      return updateOccurrence(build, command.occurrenceId, () => undefined);
    case "replace-occurrence":
      return updateOccurrence(build, command.occurrenceId, (current) => ({
        ...command.replacement,
        replacesId: current.id,
      }));
    case "add-level": {
      const expected = build.levels.length + 1;
      if (command.frame.level !== expected || expected > 30)
        throw new Error(`The next level frame must be level ${expected}`);
      return {
        ...build,
        effectiveLevel: expected,
        levels: [...build.levels, command.frame],
      };
    }
    case "remove-last-level": {
      if (build.levels.length <= 1)
        throw new Error("Level 1 cannot be removed");
      const levels = build.levels.slice(0, -1);
      return {
        ...build,
        levels,
        effectiveLevel: Math.min(build.effectiveLevel, levels.length),
      };
    }
    case "put-inventory": {
      if (
        !Number.isInteger(command.entry.quantity) ||
        !Number.isInteger(command.entry.equippedQuantity) ||
        command.entry.quantity < 0 ||
        command.entry.equippedQuantity < 0 ||
        command.entry.equippedQuantity > command.entry.quantity
      )
        throw new Error("Inventory quantities are invalid");
      return {
        ...build,
        inventory: [
          ...build.inventory.filter((entry) => entry.id !== command.entry.id),
          command.entry,
        ],
      };
    }
    case "remove-inventory":
      return {
        ...build,
        inventory: build.inventory.filter(
          (entry) => entry.id !== command.entryId,
        ),
      };
    case "set-text": {
      const textStrings = { ...build.textStrings };
      if (command.value.length === 0) delete textStrings[command.name];
      else textStrings[command.name] = command.value;
      return { ...build, textStrings };
    }
  }
}

export class CharacterTransaction {
  #past: CharacterBuild[] = [];
  #future: CharacterBuild[] = [];
  #current: CharacterBuild;

  constructor(initial: CharacterBuild) {
    this.#current = initial;
  }

  get current(): CharacterBuild {
    return this.#current;
  }
  get canUndo(): boolean {
    return this.#past.length > 0;
  }
  get canRedo(): boolean {
    return this.#future.length > 0;
  }

  dispatch(command: CharacterCommand): CharacterBuild {
    const next = applyCharacterCommand(this.#current, command);
    this.#past.push(this.#current);
    this.#future = [];
    this.#current = next;
    return next;
  }

  undo(): CharacterBuild {
    const previous = this.#past.pop();
    if (previous === undefined) return this.#current;
    this.#future.push(this.#current);
    this.#current = previous;
    return previous;
  }

  redo(): CharacterBuild {
    const next = this.#future.pop();
    if (next === undefined) return this.#current;
    this.#past.push(this.#current);
    this.#current = next;
    return next;
  }
}
