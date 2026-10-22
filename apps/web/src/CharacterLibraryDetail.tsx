import type { CharacterLibraryEntry } from "@4ecb/browser-storage";

import { ActionMenu } from "./ActionMenu";
import { characterEditHref } from "./CharacterLibraryTable";
import { Icon } from "./Icon";
import { PortraitImage } from "./PortraitEditor";
import { characterIdentity } from "./character-library-ui";
import { exactDateTime, relativeDay } from "./relative-time";
import type { LibraryRoleLine } from "./use-library-summary";

/**
 * The Characters page's detail pane for the selected row: just a navy
 * header band with who the character is (portrait, name, identity, role
 * line, paragon path, epic destiny, last edit) and the five actions along
 * its bottom edge. Everything but the role line comes from library
 * metadata, so it renders at once; the role line comes from the library
 * summary (`roleLine`), holds its place with a bar while that loads, and
 * is left out if it can't be calculated.
 */
export function CharacterLibraryDetail({
  character,
  roleLine,
  now,
  exporting,
  trashArmed,
  onExportBackup,
  onExportDnd4e,
  onDuplicate,
  onTrash,
}: {
  readonly character: CharacterLibraryEntry;
  readonly roleLine: LibraryRoleLine;
  readonly now: Date;
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
  const role = roleLine.status === "ready" ? roleLine.roleLine : undefined;
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
            {roleLine.status === "loading" ? (
              <p className="library-detail-role">
                <span aria-hidden="true" className="library-detail-role-wait" />
              </p>
            ) : role === undefined ? null : (
              <p className="library-detail-role">{role}</p>
            )}
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
            {edited === undefined ? null : (
              <p className="library-detail-meta">
                <span title={exactDateTime(character.updatedAt)}>
                  Edited {edited}
                </span>
              </p>
            )}
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
    </aside>
  );
}
