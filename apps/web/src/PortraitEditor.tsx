import {
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type WheelEvent,
} from "react";
import { Camera, Minus, Plus, UserRound, X } from "lucide-react";

import type {
  CharacterPortrait,
  CharacterPortraitCrop,
} from "@4ecb/character-domain";

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
  readonly portrait: CharacterPortrait | undefined;
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

  function zoomCrop(event: WheelEvent<HTMLDivElement>): void {
    if (crop === undefined || source === undefined) return;
    event.preventDefault();
    setCrop(
      clampPortraitCrop(
        { ...crop, size: crop.size * (event.deltaY > 0 ? 1.08 : 0.92) },
        source.sourceWidth,
        source.sourceHeight,
      ),
    );
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
        type="button"
        onClick={beginEditing}
      >
        <PortraitImage portrait={portrait} name={name} />
        <span className="portrait-camera" aria-hidden="true">
          <Camera />
        </span>
      </button>
      {!open ? null : (
        <dialog
          className="portrait-dialog"
          ref={dialog}
          onCancel={(event) => {
            event.preventDefault();
            close();
          }}
          onClose={() => setOpen(false)}
        >
          <header>
            <div>
              <p className="eyebrow">Character image</p>
              <h2>
                {portrait === undefined ? "Add portrait" : "Adjust portrait"}
              </h2>
            </div>
            <button
              aria-label="Close portrait editor"
              type="button"
              onClick={close}
            >
              <X />
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
                  <Minus aria-hidden="true" />
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
                  <Plus aria-hidden="true" />
                </div>
                <p className="portrait-help">
                  Drag the image to frame the portrait.
                </p>
                <label className="file-button portrait-replace-button">
                  Choose a different image
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
                className="danger-button"
                disabled={saving}
                type="button"
                onClick={() => {
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
                Remove portrait
              </button>
            )}
            <span />
            <button disabled={saving} type="button" onClick={close}>
              Cancel
            </button>
            <button
              disabled={source === undefined || saving}
              type="button"
              onClick={() => void save()}
            >
              {saving ? "Saving…" : "Use portrait"}
            </button>
          </footer>
        </dialog>
      )}
    </>
  );
}
