import {
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type WheelEvent,
} from "react";
import { Camera, Minus, Plus, UserRound } from "lucide-react";

import type {
  CharacterPortrait,
  CharacterPortraitCrop,
} from "@4ecb/character-domain";

import { Icon } from "./Icon";
import { useArmedAction } from "./useArmedAction";
import {
  clampPortraitCrop,
  initialPortraitCrop,
  maximumCropSize,
  normalizePortraitUpload,
  renderCharacterPortrait,
} from "./portrait-image";

export function PortraitImage({
  portrait,
  name,
  className = "",
}: {
  readonly portrait: Pick<CharacterPortrait, "renderedDataUrl"> | undefined;
  readonly name: string;
  readonly className?: string;
}) {
  return portrait === undefined ? (
    <span className={`portrait-placeholder ${className}`} aria-hidden="true">
      <UserRound />
    </span>
  ) : (
    <img
      alt={`${name} portrait`}
      className={`character-portrait ${className}`}
      src={portrait.renderedDataUrl}
    />
  );
}

export function PortraitEditor({
  portrait,
  name,
  onSave,
  compact = false,
}: {
  readonly portrait: CharacterPortrait | undefined;
  readonly name: string;
  readonly onSave: (portrait: CharacterPortrait | null) => Promise<void>;
  readonly compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [source, setSource] =
    useState<
      Pick<CharacterPortrait, "sourceDataUrl" | "sourceWidth" | "sourceHeight">
    >();
  const [crop, setCrop] = useState<CharacterPortraitCrop>();
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const removeAction = useArmedAction("portrait-remove-trigger");
  const dialog = useRef<HTMLDialogElement>(null);
  const drag = useRef<
    { x: number; y: number; crop: CharacterPortraitCrop } | undefined
  >(undefined);

  useEffect(() => {
    if (!open) return;
    const current = dialog.current;
    if (current !== null && !current.open) current.showModal();
  }, [open]);

  function beginEditing(): void {
    setSource(
      portrait === undefined
        ? undefined
        : {
            sourceDataUrl: portrait.sourceDataUrl,
            sourceWidth: portrait.sourceWidth,
            sourceHeight: portrait.sourceHeight,
          },
    );
    setCrop(portrait?.crop);
    setError(undefined);
    setOpen(true);
  }

  function close(): void {
    dialog.current?.close();
    setOpen(false);
  }

  async function chooseFile(file: File): Promise<void> {
    setError(undefined);
    const normalized = await normalizePortraitUpload(file);
    setSource(normalized);
    setCrop(
      initialPortraitCrop(normalized.sourceWidth, normalized.sourceHeight),
    );
  }

  function moveCrop(event: PointerEvent<HTMLDivElement>): void {
    if (drag.current === undefined || source === undefined) return;
    const diameter = event.currentTarget.clientWidth;
    const displayWidth = diameter / drag.current.crop.size;
    const displayHeight =
      displayWidth * (source.sourceHeight / source.sourceWidth);
    setCrop(
      clampPortraitCrop(
        {
          ...drag.current.crop,
          x:
            drag.current.crop.x -
            (event.clientX - drag.current.x) / displayWidth,
          y:
            drag.current.crop.y -
            (event.clientY - drag.current.y) / displayHeight,
        },
        source.sourceWidth,
        source.sourceHeight,
      ),
    );
  }

  /** Scales the crop window: a factor below 1 zooms in, above 1 out. */
  function scaleCrop(factor: number): void {
    if (crop === undefined || source === undefined) return;
    setCrop(
      clampPortraitCrop(
        { ...crop, size: crop.size * factor },
        source.sourceWidth,
        source.sourceHeight,
      ),
    );
  }

  function zoomCrop(event: WheelEvent<HTMLDivElement>): void {
    event.preventDefault();
    scaleCrop(event.deltaY > 0 ? 1.08 : 0.92);
  }

  async function save(): Promise<void> {
    if (source === undefined || crop === undefined) return;
    setSaving(true);
    setError(undefined);
    try {
      await onSave(
        await renderCharacterPortrait(
          source.sourceDataUrl,
          source.sourceWidth,
          source.sourceHeight,
          crop,
        ),
      );
      close();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSaving(false);
    }
  }

  const maximum =
    source === undefined
      ? 1
      : maximumCropSize(source.sourceWidth, source.sourceHeight);
  const zoom = crop === undefined ? 1 : maximum / crop.size;
  const aspect =
    source === undefined ? 1 : source.sourceHeight / source.sourceWidth;
  const imageStyle =
    source === undefined || crop === undefined
      ? undefined
      : {
          width: `${100 / crop.size}%`,
          height: `${(100 / crop.size) * aspect}%`,
          left: `${50 - (crop.x * 100) / crop.size}%`,
          top: `${50 - (crop.y * 100 * aspect) / crop.size}%`,
        };

  return (
    <>
      <button
        aria-label={`${portrait === undefined ? "Add" : "Edit"} ${name}'s portrait`}
        className={`portrait-trigger ${compact ? "portrait-trigger-compact" : ""}`}
        title={
          portrait === undefined
            ? "Click to add a portrait"
            : "Click to change the portrait"
        }
        type="button"
        onClick={beginEditing}
      >
        <PortraitImage portrait={portrait} name={name} />
      </button>
      {!open ? null : (
        <dialog
          className="portrait-dialog dialog-shell dialog-shell--branded"
          ref={dialog}
          onCancel={(event) => {
            event.preventDefault();
            // Esc first disarms a pending Remove, then closes.
            if (removeAction.isArmed("portrait")) return;
            close();
          }}
          onClose={() => setOpen(false)}
        >
          <header>
            <h2>
              {portrait === undefined ? "Add portrait" : "Adjust portrait"}
            </h2>
            <button
              aria-label="Close"
              className="button-icon dialog-close"
              title="Close"
              type="button"
              onClick={close}
            >
              <Icon name="remove" />
            </button>
          </header>
          <div className="portrait-dialog-body">
            {source === undefined || crop === undefined ? (
              <label className="portrait-upload-prompt">
                <Camera aria-hidden="true" />
                <strong>Choose an image</strong>
                <span>PNG, JPEG, WebP, or GIF; up to 20 MiB</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    if (file !== undefined)
                      void chooseFile(file).catch((reason: unknown) =>
                        setError(
                          reason instanceof Error
                            ? reason.message
                            : String(reason),
                        ),
                      );
                    event.currentTarget.value = "";
                  }}
                />
              </label>
            ) : (
              <>
                <div
                  aria-label="Portrait crop. Drag to reposition the image."
                  className="portrait-crop-viewport"
                  title="Drag the image to frame the portrait"
                  onPointerDown={(event) => {
                    event.currentTarget.setPointerCapture(event.pointerId);
                    drag.current = { x: event.clientX, y: event.clientY, crop };
                  }}
                  onPointerMove={moveCrop}
                  onPointerCancel={() => {
                    drag.current = undefined;
                  }}
                  onPointerUp={(event) => {
                    event.currentTarget.releasePointerCapture(event.pointerId);
                    drag.current = undefined;
                  }}
                  onWheel={zoomCrop}
                >
                  <img
                    alt=""
                    draggable={false}
                    src={source.sourceDataUrl}
                    style={imageStyle}
                  />
                </div>
                <div className="portrait-zoom-control">
                  <button
                    aria-label="Zoom out"
                    className="button-icon"
                    disabled={zoom <= 1.001}
                    title="Zoom out"
                    type="button"
                    onClick={() => scaleCrop(1.25)}
                  >
                    <Minus aria-hidden="true" />
                  </button>
                  <label>
                    <span className="visually-hidden">Portrait zoom</span>
                    <input
                      aria-label="Portrait zoom"
                      max={12}
                      min={1}
                      step={0.05}
                      type="range"
                      value={zoom}
                      onInput={(event) =>
                        setCrop(
                          clampPortraitCrop(
                            {
                              ...crop,
                              size: maximum / Number(event.currentTarget.value),
                            },
                            source.sourceWidth,
                            source.sourceHeight,
                          ),
                        )
                      }
                    />
                  </label>
                  <button
                    aria-label="Zoom in"
                    className="button-icon"
                    disabled={zoom >= 11.999}
                    title="Zoom in"
                    type="button"
                    onClick={() => scaleCrop(0.8)}
                  >
                    <Plus aria-hidden="true" />
                  </button>
                </div>
                <label className="file-button portrait-replace-button">
                  Replace image
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    onChange={(event) => {
                      const file = event.currentTarget.files?.[0];
                      if (file !== undefined)
                        void chooseFile(file).catch((reason: unknown) =>
                          setError(
                            reason instanceof Error
                              ? reason.message
                              : String(reason),
                          ),
                        );
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
              </>
            )}
            {error === undefined ? null : (
              <p className="error" role="alert">
                {error}
              </p>
            )}
          </div>
          <footer>
            {portrait === undefined ? null : (
              <button
                aria-label={
                  removeAction.isArmed("portrait")
                    ? "Confirm removing the portrait"
                    : "Remove portrait"
                }
                className="danger-button dialog-footer-start"
                data-armed={removeAction.isArmed("portrait") || undefined}
                data-portrait-remove-trigger="portrait"
                disabled={saving}
                title={
                  removeAction.isArmed("portrait")
                    ? "Click again to remove the portrait"
                    : "Remove portrait"
                }
                type="button"
                onClick={() => {
                  // Not part of the build's undo history: confirm first.
                  if (!removeAction.isArmed("portrait")) {
                    removeAction.arm("portrait");
                    return;
                  }
                  removeAction.disarm();
                  setSaving(true);
                  void onSave(null)
                    .then(close)
                    .catch((reason: unknown) =>
                      setError(
                        reason instanceof Error
                          ? reason.message
                          : String(reason),
                      ),
                    )
                    .finally(() => setSaving(false));
                }}
              >
                {removeAction.isArmed("portrait")
                  ? "Click again to remove"
                  : "Remove portrait"}
              </button>
            )}
            <button disabled={saving} type="button" onClick={close}>
              Cancel
            </button>
            <button
              className="button-primary"
              disabled={source === undefined || saving}
              type="button"
              onClick={() => void save()}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </footer>
        </dialog>
      )}
    </>
  );
}
