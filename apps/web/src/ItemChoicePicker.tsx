import { useEffect, useRef, useState } from "react";

import type { BuildOccurrence } from "@4ecb/character-domain";
import type { ContentEntity } from "@4ecb/content-domain";

import { itemChoiceLabel } from "./builder-ui";
import { CandidateDetailCard } from "./CandidateDetail";
import { CompactChoiceButtons } from "./ChoiceEditors";
import { Icon } from "./Icon";
import {
  chooseItemChoice,
  isComplexItemChoice,
  itemChoiceHeading,
  itemChoicePages,
  itemChoicePathKey,
  resolveItemChoiceOccurrences,
  type ItemChoicePageInfo,
} from "./item-choice-pages";

/**
 * One item-owned choice page: the candidate buttons, plus a detail card
 * beside them when the candidates are powers. Shared by the Shop's
 * acquisition dialog and the Equipment tab's "Choose …" dialog.
 */
export function ItemChoicePicker({
  page,
  selections,
  onChange,
}: {
  readonly page: ItemChoicePageInfo;
  readonly selections: ReadonlyMap<string, string>;
  readonly onChange: (selections: ReadonlyMap<string, string>) => void;
}) {
  const pathKey = itemChoicePathKey(page.path);
  const selectedId = selections.get(pathKey) ?? "";
  const picker = (
    <CompactChoiceButtons
      label={itemChoiceHeading(page.slot)}
      hideLabel
      options={page.candidates.map((candidate) => ({
        id: candidate.id,
        label: itemChoiceLabel(candidate.name),
        selectable: true,
      }))}
      selectedId={selectedId}
      disabled={false}
      onChoose={(candidateId) =>
        onChange(chooseItemChoice(selections, page.path, candidateId))
      }
    />
  );
  if (!isComplexItemChoice(page.candidates)) return picker;
  const previewed =
    page.candidates.find((candidate) => candidate.id === selectedId) ??
    page.candidates[0];
  return (
    <div className="choice-selection-layout">
      <div className="choice-editor-fields">{picker}</div>
      {previewed === undefined ? null : (
        <CandidateDetailCard entity={previewed} />
      )}
    </div>
  );
}

/**
 * Settles an owned holding's item-owned choices (an Armor of Resistance's
 * damage type a save never made), one page per choice like the Shop's
 * acquisition dialog. Saving hands back the item element's new children.
 */
export function ItemChoiceDialog({
  entity,
  itemName,
  entities,
  characterLevel,
  initialSelections,
  onSave,
  onClose,
}: {
  readonly entity: ContentEntity;
  readonly itemName: string;
  readonly entities: readonly ContentEntity[];
  readonly characterLevel: number;
  readonly initialSelections: ReadonlyMap<string, string>;
  readonly onSave: (children: readonly BuildOccurrence[]) => void;
  readonly onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [selections, setSelections] = useState(initialSelections);
  const [pageIndex, setPageIndex] = useState(0);
  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);
  const pages = itemChoicePages(entity, entities, characterLevel, selections);
  const page = pages[Math.min(pageIndex, pages.length - 1)];
  const complete = (info: ItemChoicePageInfo) =>
    selections.has(itemChoicePathKey(info.path));
  const lastPage = pageIndex >= pages.length - 1;
  return (
    <dialog
      aria-label={`${itemName}: ${page === undefined ? "choices" : itemChoiceHeading(page.slot)}`}
      className={`shop-physical-dialog dialog-shell dialog-shell--wide${
        page !== undefined && isComplexItemChoice(page.candidates)
          ? " shop-physical-dialog--detail"
          : ""
      }`}
      ref={dialogRef}
      onClose={onClose}
    >
      <form
        method="dialog"
        onSubmit={(event) => {
          event.preventDefault();
          if (page === undefined || !complete(page)) return;
          if (!lastPage) {
            setPageIndex((index) => index + 1);
            return;
          }
          if (!pages.every(complete)) return;
          onSave(
            resolveItemChoiceOccurrences(
              entity,
              entities,
              characterLevel,
              selections,
            ),
          );
          dialogRef.current?.close();
        }}
      >
        <header>
          <div>
            <h2>
              {page === undefined ? itemName : itemChoiceHeading(page.slot)}
            </h2>
          </div>
          <button
            aria-label="Close"
            className="button-icon dialog-close"
            title="Close"
            type="button"
            onClick={() => dialogRef.current?.close()}
          >
            <Icon name="remove" />
          </button>
        </header>
        <div className="shop-physical-dialog-body">
          {page === undefined ? null : (
            <ItemChoicePicker
              page={page}
              selections={selections}
              onChange={setSelections}
            />
          )}
        </div>
        <footer>
          <dl className="shop-physical-summary dialog-footer-start">
            <div>
              <dt>Item</dt>
              <dd>{itemName}</dd>
            </div>
          </dl>
          <button type="button" onClick={() => dialogRef.current?.close()}>
            Cancel
          </button>
          {pageIndex === 0 ? null : (
            <button
              type="button"
              onClick={() => setPageIndex((index) => Math.max(0, index - 1))}
            >
              Back
            </button>
          )}
          <button
            className="dialog-primary button-primary"
            type="submit"
            disabled={
              page === undefined ||
              (lastPage ? !pages.every(complete) : !complete(page))
            }
          >
            {lastPage ? "Save" : "Next"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
