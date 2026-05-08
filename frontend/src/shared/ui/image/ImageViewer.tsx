import { useEffect } from "react";
import { createPortal } from "react-dom";
import { CaretDown, CaretUp, Close } from "@carbon/icons-react";
import { getModalPortalRoot } from "@/shared/ui/theme/portalRoot";
import styles from "./ImageViewer.module.scss";

export interface ImageViewerItem {
  url: string;
  alt?: string;
  label?: string;
}

interface ImageViewerProps {
  images: ImageViewerItem[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  closeLabel?: string;
  previousLabel?: string;
  nextLabel?: string;
}

const clampIndex = (index: number, length: number) =>
  Math.min(Math.max(index, 0), Math.max(length - 1, 0));

export function ImageViewer({
  images,
  index,
  onIndexChange,
  onClose,
  closeLabel = "Close",
  previousLabel = "Previous image",
  nextLabel = "Next image",
}: ImageViewerProps) {
  const safeIndex = clampIndex(index, images.length);
  const current = images[safeIndex];
  const hasMultiple = images.length > 1;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
        event.preventDefault();
        onIndexChange(clampIndex(safeIndex - 1, images.length));
        return;
      }
      if (event.key === "ArrowDown" || event.key === "ArrowRight") {
        event.preventDefault();
        onIndexChange(clampIndex(safeIndex + 1, images.length));
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [images.length, onClose, onIndexChange, safeIndex]);

  if (!current || typeof document === "undefined") return null;

  return createPortal(
    <div className={styles.overlay} role="dialog" aria-modal="true">
      <div className={styles.titleBar}>
        <span className={styles.title}>{current.label || current.alt || ""}</span>
        <button
          type="button"
          className={styles.iconButton}
          aria-label={closeLabel}
          onClick={onClose}
        >
          <Close size={20} />
        </button>
      </div>
      <button
        type="button"
        className={styles.stage}
        aria-label={closeLabel}
        onClick={onClose}
      >
        <img
          className={styles.image}
          src={current.url}
          alt={current.alt || current.label || "image preview"}
          onClick={(event) => event.stopPropagation()}
        />
      </button>
      <div className={styles.rail} aria-hidden={!hasMultiple}>
        <button
          type="button"
          className={styles.iconButton}
          aria-label={previousLabel}
          disabled={!hasMultiple || safeIndex <= 0}
          onClick={() => onIndexChange(clampIndex(safeIndex - 1, images.length))}
        >
          <CaretUp size={20} />
        </button>
        <button
          type="button"
          className={styles.iconButton}
          aria-label={nextLabel}
          disabled={!hasMultiple || safeIndex >= images.length - 1}
          onClick={() => onIndexChange(clampIndex(safeIndex + 1, images.length))}
        >
          <CaretDown size={20} />
        </button>
      </div>
      {hasMultiple ? (
        <div className={styles.counter}>
          {safeIndex + 1} / {images.length}
        </div>
      ) : null}
    </div>,
    getModalPortalRoot(),
  );
}
