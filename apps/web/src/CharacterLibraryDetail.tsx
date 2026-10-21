import type { CharacterLibraryEntry } from "@4ecb/browser-storage";

import { ActionMenu } from "./ActionMenu";
import { characterEditHref } from "./CharacterLibraryTable";
import { Icon } from "./Icon";
import { PortraitImage } from "./PortraitEditor";
import { characterIdentity } from "./character-library-ui";
import { exactDateTime, relativeDay } from "./relative-time";

/**
 * The Characters page's detail pane for the selected row: a navy header band
 * with who the character is (portrait, name, identity, paragon path, epic
 * destiny, last edit, content-update badge) and the five actions along its
 * bottom edge. Everything here comes from library metadata, so it renders at
 * once; the body below the band is where the evaluated stats go.
 */
export function CharacterLibraryDetail({
  character,
  now,
  updateAvailable,
  exporting,
  trashArmed,
  onExportBackup,
  onExportDnd4e,
  onDuplicate,
  onTrash,
}: {
  readonly character: CharacterLibraryEntry;
  readonly now: Date;
  readonly updateAvailable: boolean;
  readonly exporting: boolean;
  /** Trash's first click arms it; the second (onTrash again) confirms. */
  readonly trashArmed: boolean;
  readonly onExportBackup: () => void;
  readonly onExportDnd4e: () => void;
  readonly onDuplicate: () => void;
  readonly onTrash: () => void;
}) {
  const { title } = character;
  const edited = relativeDay(character.updatedAt, now);
  return (
    <aside
      aria-label={`${title} overview`}
      className="library-detail"
      data-character-id={character.id}
    >
      <header className="library-detail-header">
        <div className="library-detail-identity">
          <PortraitImage
            className="library-detail-portrait"
            name={title}
            portrait={
              character.renderedPortraitDataUrl === undefined
                ? undefined
                : { renderedDataUrl: character.renderedPortraitDataUrl }
            }
          />
          <div className="library-detail-text">
            <h2>{title}</h2>
            <p>{characterIdentity(character)}</p>
            {/* The role line ("Divine Defender") goes here once the library
                summary provides it. */}
            {character.paragonPath === undefined ? null : (
              <p className="library-detail-meta">
                Paragon path: {character.paragonPath}
              </p>
            )}
            {character.epicDestiny === undefined ? null : (
              <p className="library-detail-meta">
                Epic destiny: {character.epicDestiny}
              </p>
            )}
            <p className="library-detail-meta">
              {edited === undefined ? null : (
                <span title={exactDateTime(character.updatedAt)}>
                  Edited {edited}
                </span>
              )}
              {updateAvailable ? (
                <span
                  className="library-update-badge"
                  title="Game content has been updated. Open the character to review it; until then its rules, powers and items stay as they were."
                >
                  Update available
                </span>
              ) : null}
            </p>
          </div>
        </div>
        <div
          aria-label="Character actions"
          className="library-detail-actions"
          role="group"
        >
          <a
            aria-label={`Edit ${title} build`}
            className="library-detail-action"
            href={characterEditHref(character.id)}
            title="Edit build"
          >
            <Icon name="edit" />
            <span>Edit</span>
          </a>
          <a
            aria-label={`View ${title} character sheet`}
            className="library-detail-action"
            href={`#/characters/${encodeURIComponent(character.id)}?preview=1`}
            title="View character sheet"
          >
            <Icon name="sheet" />
            <span>Sheet</span>
          </a>
          <ActionMenu
            icon="export"
            label={`Export ${title}`}
            {...(exporting ? { busyLabel: `Exporting ${title}…` } : {})}
            menuLabel={`Export ${title} as`}
            triggerClassName="library-detail-action"
            visibleLabel="Export"
            items={[
              { label: ".4ecb", onSelect: onExportBackup },
              { label: ".dnd4e", onSelect: onExportDnd4e },
            ]}
          />
          <button
            aria-label={`Duplicate ${title}`}
            className="library-detail-action"
            title="Duplicate"
            type="button"
            onClick={onDuplicate}
          >
            <Icon name="duplicate" />
            <span>Duplicate</span>
          </button>
          <button
            aria-label={
              trashArmed
                ? `Confirm moving ${title} to trash`
                : `Move ${title} to trash`
            }
            className="library-detail-action danger-action"
            data-armed={trashArmed || undefined}
            data-character-trash-trigger={character.id}
            title={
              trashArmed ? "Click again to move to trash" : "Move to trash"
            }
            type="button"
            onClick={onTrash}
          >
            <Icon name={trashArmed ? "warning" : "trash"} />
            <span>{trashArmed ? "Confirm" : "Trash"}</span>
          </button>
        </div>
      </header>
      {/* The evaluated Play data stats fill this body. */}
      <div className="library-detail-body" />
    </aside>
  );
}
