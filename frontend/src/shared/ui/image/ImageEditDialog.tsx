import React, { useRef, useState } from "react";
import { Button, Modal, TextInput } from "@carbon/react";
import { CloudUpload, Edit, TrashCan, UserAvatar } from "@carbon/icons-react";
import "./ImageEditDialog.scss";

type ImageEditVariant = "avatar" | "cover";

interface ImageEditDialogProps {
  previewUrl?: string;
  alt: string;
  variant?: ImageEditVariant;
  emptyLabel: string;
  modalHeading: string;
  urlPlaceholder: string;
  uploadLabel: string;
  removeLabel: string;
  applyLabel: string;
  dropzoneLabel: string;
  dropzoneHint: string;
  accept?: string;
  disabled?: boolean;
  onUpload: (file: File) => Promise<void> | void;
  onApplyUrl: (url: string) => Promise<void> | void;
  onRemove?: () => Promise<void> | void;
}

export const ImageEditDialog: React.FC<ImageEditDialogProps> = ({
  previewUrl,
  alt,
  variant = "cover",
  emptyLabel,
  modalHeading,
  urlPlaceholder,
  uploadLabel,
  removeLabel,
  applyLabel,
  dropzoneLabel,
  dropzoneHint,
  accept = "image/png,image/jpeg,image/webp,image/gif",
  disabled = false,
  onUpload,
  onApplyUrl,
  onRemove,
}) => {
  const [open, setOpen] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFile = (file: File | null | undefined) => {
    if (!file) return;
    void Promise.resolve(onUpload(file)).finally(() => {
      setOpen(false);
      setDragging(false);
    });
  };

  const handleApplyUrl = () => {
    const nextUrl = urlInput.trim();
    if (!nextUrl) return;
    void Promise.resolve(onApplyUrl(nextUrl)).finally(() => {
      setOpen(false);
      setUrlInput("");
    });
  };

  const handleRemove = () => {
    if (!onRemove) return;
    void Promise.resolve(onRemove()).finally(() => {
      setOpen(false);
      setUrlInput("");
    });
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        hidden
        onChange={(event) => {
          handleFile(event.target.files?.[0]);
          event.target.value = "";
        }}
      />

      <button
        type="button"
        className={`image-edit-dialog__trigger image-edit-dialog__trigger--${variant}`}
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        {previewUrl ? (
          <img src={previewUrl} alt={alt} />
        ) : variant === "avatar" ? (
          <div className="image-edit-dialog__empty">
            <UserAvatar size={24} />
          </div>
        ) : (
          <div className="image-edit-dialog__empty">
            <CloudUpload size={20} />
            <span>{emptyLabel}</span>
          </div>
        )}
        <div className="image-edit-dialog__overlay">
          <Edit size={20} />
        </div>
      </button>

      <Modal
        open={open}
        size="sm"
        modalHeading={modalHeading}
        passiveModal
        onRequestClose={() => {
          setOpen(false);
          setUrlInput("");
          setDragging(false);
        }}
      >
        <div className="image-edit-dialog__modal-body">
          <button
            type="button"
            className={`image-edit-dialog__dropzone${dragging ? " is-dragging" : ""}`}
            disabled={disabled}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              handleFile(event.dataTransfer.files?.[0]);
            }}
          >
            <CloudUpload size={20} />
            <strong>{dropzoneLabel}</strong>
            <span>{dropzoneHint}</span>
            <span className="image-edit-dialog__dropzone-action">{uploadLabel}</span>
          </button>

          <div className="image-edit-dialog__url-row">
            <TextInput
              id="image-edit-dialog-url-input"
              hideLabel
              labelText="URL"
              size="md"
              placeholder={urlPlaceholder}
              value={urlInput}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => setUrlInput(event.target.value)}
              onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => {
                if (event.key === "Enter") {
                  handleApplyUrl();
                }
              }}
            />
            <Button
              kind="primary"
              size="md"
              disabled={!urlInput.trim() || disabled}
              onClick={handleApplyUrl}
            >
              {applyLabel}
            </Button>
          </div>

          {previewUrl && onRemove ? (
            <Button
              kind="danger--ghost"
              size="md"
              renderIcon={TrashCan}
              disabled={disabled}
              onClick={handleRemove}
            >
              {removeLabel}
            </Button>
          ) : null}
        </div>
      </Modal>
    </>
  );
};

