import { useEffect, useMemo, useState } from "react";

import {
  CharacterRepository,
  ContentPackRepository,
} from "@4ecb/browser-storage";
import type { CharacterRecord, SheetSettings } from "@4ecb/character-domain";
import type { ContentPackManifest } from "@4ecb/content-pack";
import {
  buildSheetModel,
  type SheetCard,
  type SheetValue,
} from "@4ecb/sheet-model";

const characters = new CharacterRepository();
const packs = new ContentPackRepository();

function ValueList({
  values,
  className = "",
}: {
  readonly values: readonly SheetValue[];
  readonly className?: string;
}) {
  return (
    <dl className={`sheet-values ${className}`}>
      {values.map((entry) => (
        <div key={entry.label}>
          <dt>{entry.label}</dt>
          <dd>{entry.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Card({ card }: { readonly card: SheetCard }) {
  const usage = (card.usage ?? "item")
    .trim()
    .toLocaleLowerCase()
    .replace(/[^a-z]+/g, "-");
  return (
    <article className={`sheet-card ${card.kind}-card usage-${usage}`}>
      <header>
        <h3>{card.name}</h3>
        <span>
          {card.usage ?? (card.kind === "item" ? "Magic item" : "Power")}
        </span>
      </header>
      {(card.actionType ?? card.keywords) === undefined ? null : (
        <p className="card-meta">
          <strong>{card.actionType}</strong>
          {card.keywords === undefined ? null : ` · ${card.keywords}`}
        </p>
      )}
      {(card.attack ?? card.damage) === undefined ? null : (
        <dl className="card-combat">
          <div>
            <dt>Attack</dt>
            <dd>{card.attack ?? "—"}</dd>
          </div>
          <div>
            <dt>Damage</dt>
            <dd>{card.damage ?? "—"}</dd>
          </div>
        </dl>
      )}
      {card.fields.map((field) => (
        <p key={`${field.label}-${field.value}`}>
          <strong>{field.label}:</strong> {field.value}
        </p>
      ))}
      {card.description === undefined ? null : (
        <p className="preserve-lines">{card.description}</p>
      )}
      {card.source === undefined ? null : <footer>{card.source}</footer>}
    </article>
  );
}

export function CharacterSheetPage({
  characterId,
  manifests,
}: {
  readonly characterId: string;
  readonly manifests: readonly ContentPackManifest[];
}) {
  const [character, setCharacter] = useState<CharacterRecord>();
  const [content, setContent] =
    useState<Awaited<ReturnType<ContentPackRepository["get"]>>>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    void characters
      .get(characterId)
      .then(async (loaded) => {
        setCharacter(loaded);
        if (loaded?.profileBinding !== undefined)
          setContent(await packs.get(loaded.profileBinding.packId));
      })
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : String(reason)),
      );
  }, [characterId]);
  const model = useMemo(() => {
    if (character === undefined) return undefined;
    const expectedDigest = character.profileBinding?.contentDigest;
    const matchingContent =
      expectedDigest === undefined ||
      content?.manifest.contentDigest === expectedDigest
        ? (content?.entities ?? [])
        : [];
    return buildSheetModel(character.snapshot, matchingContent);
  }, [character, content]);
  if (error !== undefined)
    return (
      <main className="sheet-page" id="main-content">
        <div className="error">{error}</div>
      </main>
    );
  if (character === undefined || model === undefined)
    return (
      <main className="sheet-page loading-state" id="main-content">
        Loading character…
      </main>
    );
  const boundManifest =
    character.profileBinding === undefined
      ? undefined
      : manifests.find(
          (manifest) => manifest.packId === character.profileBinding?.packId,
        );
  const profileMismatch =
    boundManifest !== undefined &&
    character.profileBinding?.contentDigest !== undefined &&
    boundManifest.contentDigest !== character.profileBinding.contentDigest;
  async function setting<Key extends keyof SheetSettings>(
    name: Key,
    value: SheetSettings[Key],
  ): Promise<void> {
    const updated = await characters.updateMetadata(characterId, {
      sheetSettings: { [name]: value },
    });
    setCharacter(updated);
  }
  const hp = character.sheetSettings.blankHitPoints
    ? model.resources.map((value) =>
        value.label === "Hit Points" ? { ...value, value: "" } : value,
      )
    : model.resources;
  return (
    <main
      className={`sheet-page paper-${character.sheetSettings.paper} ${character.sheetSettings.monochrome ? "sheet-monochrome" : ""}`}
      id="main-content"
    >
      <div className="sheet-toolbar">
        <a href="#/characters">← Character library</a>
        <fieldset>
          <legend>Sheet options</legend>
          <label>
            Paper{" "}
            <select
              value={character.sheetSettings.paper}
              onChange={(event) =>
                void setting(
                  "paper",
                  event.currentTarget.value as "letter" | "a4",
                )
              }
            >
              <option value="letter">US Letter</option>
              <option value="a4">A4</option>
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={character.sheetSettings.blankHitPoints}
              onChange={(event) =>
                void setting("blankHitPoints", event.currentTarget.checked)
              }
            />{" "}
            Blank hit points
          </label>
          <label>
            <input
              type="checkbox"
              checked={character.sheetSettings.includePowerCards}
              onChange={(event) =>
                void setting("includePowerCards", event.currentTarget.checked)
              }
            />{" "}
            Power cards
          </label>
          <label>
            <input
              type="checkbox"
              checked={character.sheetSettings.includeItemCards}
              onChange={(event) =>
                void setting("includeItemCards", event.currentTarget.checked)
              }
            />{" "}
            Item cards
          </label>
          <label>
            <input
              type="checkbox"
              checked={character.sheetSettings.monochrome}
              onChange={(event) =>
                void setting("monochrome", event.currentTarget.checked)
              }
            />{" "}
            Monochrome
          </label>
          <button type="button" onClick={() => window.print()}>
            Print / save PDF
          </button>
        </fieldset>
      </div>
      <aside className="cache-warning">
        <strong>Legacy cached calculations.</strong> Values shown here were
        computed by the original builder and have not yet been recalculated by
        the modern rules engine.{" "}
        {character.profileBinding === undefined
          ? "No content profile is bound, so card rules text may be limited."
          : boundManifest === undefined
            ? `The bound content profile (${character.profileBinding.packId}) is missing; re-import it to restore full card text.`
            : profileMismatch
              ? `The installed ${boundManifest.name} revision differs from the one bound to this character; rebind it in the library before relying on enriched card text.`
              : content === undefined
                ? "Loading card text from the bound profile…"
                : `Card text is enriched from ${boundManifest.name}.`}
      </aside>
      <article className="print-sheet summary-sheet">
        <header className="sheet-title">
          <div>
            <p className="eyebrow">Character sheet</p>
            <h2>{character.snapshot.details.name || character.title}</h2>
          </div>
          <p>
            {model.identity
              .filter((entry) =>
                ["Level", "Race", "Class"].includes(entry.label),
              )
              .map((entry) => entry.value)
              .join(" · ")}
          </p>
        </header>
        <section className="identity-block">
          <ValueList values={model.identity} />
        </section>
        <div className="sheet-columns">
          <div>
            <section>
              <h3>Ability scores</h3>
              <ValueList values={model.abilities} />
            </section>
            <section>
              <h3>Resources</h3>
              <ValueList values={hp} />
            </section>
            <section>
              <h3>Skills</h3>
              <ValueList values={model.skills} />
            </section>
          </div>
          <div>
            <section>
              <h3>Defenses</h3>
              <ValueList values={model.defenses} className="large-values" />
            </section>
            <section>
              <h3>Senses</h3>
              <ValueList values={model.senses} />
            </section>
            {model.features.map((group) => (
              <section key={group.group}>
                <h3>{group.group}</h3>
                <ValueList values={group.entries} />
              </section>
            ))}
          </div>
          <div>
            <section>
              <h3>Equipment</h3>
              <ul>
                {character.snapshot.loot.map((loot) => (
                  <li key={`${loot.name}-${loot.count}`}>
                    {loot.name} × {loot.count}
                    {loot.equippedCount > 0 ? " (equipped)" : ""}
                  </li>
                ))}
              </ul>
            </section>
            <section>
              <h3>Notes</h3>
              <ValueList values={model.notes} />
            </section>
          </div>
        </div>
      </article>
      {character.sheetSettings.includePowerCards && model.powers.length > 0 ? (
        <section className="card-section">
          <h2>Power cards</h2>
          <div className="card-grid">
            {model.powers.map((card, index) => (
              <Card key={`${card.name}-${index}`} card={card} />
            ))}
          </div>
        </section>
      ) : null}
      {character.sheetSettings.includeItemCards && model.items.length > 0 ? (
        <section className="card-section item-section">
          <h2>Item cards</h2>
          <div className="card-grid">
            {model.items.map((card, index) => (
              <Card key={`${card.name}-${index}`} card={card} />
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
