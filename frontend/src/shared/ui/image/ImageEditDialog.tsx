import React, { useId, useRef, useState } from "react";
import ReactDOM from "react-dom";
import {
  Button,
  Modal,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  TextInput,
} from "@carbon/react";
import { CloudUpload, Edit, TrashCan, UserAvatar } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import { getModalPortalRoot } from "@/shared/ui/theme/portalRoot";
import type { PresetCoverImage } from "./presetCoverImages";
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
  galleryImages?: PresetCoverImage[];
  onUpload: (file: File) => Promise<void> | void;
  onApplyUrl: (url: string) => Promise<void> | void;
  onRemove?: () => Promise<void> | void;
  /** Optional hooks for E2E (Playwright) */
  triggerDataTestId?: string;
  fileInputDataTestId?: string;
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
  galleryImages,
  onUpload,
  onApplyUrl,
  onRemove,
  triggerDataTestId,
  fileInputDataTestId,
}) => {
  const { t } = useTranslation("common");
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const hasGallery = Boolean(galleryImages && galleryImages.length > 0);

  const closeModal = () => {
    setOpen(false);
    setUrlInput("");
    setDragging(false);
  };

  const handleFile = (file: File | null | undefined) => {
    if (!file) return;
    void Promise.resolve(onUpload(file)).finally(closeModal);
  };

  const handleApplyUrl = () => {
    const nextUrl = urlInput.trim();
    if (!nextUrl) return;
    void Promise.resolve(onApplyUrl(nextUrl)).finally(closeModal);
  };

  const handleGallerySelect = (image: PresetCoverImage) => {
    void Promise.resolve(onApplyUrl(image.url)).finally(closeModal);
  };

  const handleRemove = () => {
    if (!onRemove) return;
    void Promise.resolve(onRemove()).finally(closeModal);
  };

  const galleryPanel = (
    <div className="image-edit-gallery">
      {galleryImages?.map((image, galleryIndex) => (
        <button
          type="button"
          key={image.url}
          data-testid={`image-edit-gallery-${galleryIndex}`}
          className="cds--tile cds--tile--clickable image-edit-gallery__item"
          onClick={() => handleGallerySelect(image)}
          disabled={disabled}
        >
          <img src={image.url} alt={image.label} loading="lazy" />
          <span className="image-edit-gallery__attribution">
            by{" "}
            <a
              href={image.photographerUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
            >
              {image.photographer}
            </a>
          </span>
        </button>
      ))}
    </div>
  );

  const uploadPanel = (
    <button
      type="button"
      className={`image-edit-dialog__dropzone${dragging ? " is-dragging" : ""}`}
      disabled={disabled}
      onClick={() => fileInputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files?.[0]); }}
    >
      <CloudUpload size={20} />
      <strong>{dropzoneLabel}</strong>
      <span>{dropzoneHint}</span>
      <span className="image-edit-dialog__dropzone-action">{uploadLabel}</span>
    </button>
  );

  const linkPanel = (
    <div className="image-edit-dialog__url-row">
      <TextInput
        id={`${uid}-url`}
        hideLabel
        labelText="URL"
        size="md"
        placeholder={urlPlaceholder}
        value={urlInput}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUrlInput(e.target.value)}
        onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
          if (e.key === "Enter") handleApplyUrl();
        }}
      />
      <Button type="button" kind="primary" size="md" disabled={!urlInput.trim() || disabled} onClick={handleApplyUrl}>
        {applyLabel}
      </Button>
    </div>
  );

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        hidden
        data-testid={fileInputDataTestId}
        onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ""; }}
      />

      <button
        type="button"
        className={`image-edit-dialog__trigger image-edit-dialog__trigger--${variant}`}
        disabled={disabled}
        data-testid={triggerDataTestId}
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

      {ReactDOM.createPortal(
        <Modal
          open={open}
          data-testid="image-edit-dialog"
          size={hasGallery ? "md" : "sm"}
          modalHeading={modalHeading}
          passiveModal
          onRequestClose={closeModal}
        >
          <div className="image-edit-dialog__modal-body">
            {hasGallery ? (
              <Tabs>
                <TabList aria-label="image source tabs">
                  <Tab data-testid="image-edit-tab-gallery">{t("image.galleryTab", "圖庫")}</Tab>
                  <Tab data-testid="image-edit-tab-upload">{t("image.uploadTab", "上傳")}</Tab>
                  <Tab data-testid="image-edit-tab-link">{t("image.linkTab", "連結")}</Tab>
                </TabList>
                <TabPanels>
                  <TabPanel>{galleryPanel}</TabPanel>
                  <TabPanel>{uploadPanel}</TabPanel>
                  <TabPanel>{linkPanel}</TabPanel>
                </TabPanels>
              </Tabs>
            ) : (
              <>
                {uploadPanel}
                {linkPanel}
              </>
            )}
            {previewUrl && onRemove ? (
              <Button type="button" kind="danger--ghost" size="md" renderIcon={TrashCan} disabled={disabled} onClick={handleRemove}>
                {removeLabel}
              </Button>
            ) : null}
          </div>
        </Modal>,
        getModalPortalRoot(),
      )}
    </>
  );
};
