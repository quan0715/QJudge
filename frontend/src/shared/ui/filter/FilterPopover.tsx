import { type ReactNode, useState, useId } from "react";
import { Popover, PopoverContent, Button, Layer } from "@carbon/react";
import { Filter } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import styles from "./FilterPopover.module.scss";

type PopoverAlign =
  | "top"
  | "bottom"
  | "left"
  | "right"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

interface FilterPopoverProps {
  /** Whether any filter is active (shows blue dot on trigger) */
  hasActiveFilters: boolean;
  /** Accessibility label for the trigger button */
  triggerLabel?: string;
  /** Called when user clicks Reset */
  onReset: () => void;
  /** Label for the confirm/done button. If provided, shows a two-button footer (Reset + Done).
   *  If omitted, only Reset is shown. */
  doneLabel?: string;
  /** Called when user clicks Done (defaults to closing the popover) */
  onDone?: () => void;
  /** Popover alignment relative to trigger */
  align?: PopoverAlign;
  /** Filter field content */
  children: ReactNode;
  className?: string;
}

export const FilterPopover = ({
  hasActiveFilters,
  triggerLabel,
  onReset,
  doneLabel,
  onDone,
  align = "bottom-right",
  children,
  className,
}: FilterPopoverProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const popoverId = useId();
  const { t } = useTranslation("common");

  const handleReset = () => {
    onReset();
    setIsOpen(false);
  };

  const handleDone = () => {
    onDone?.();
    setIsOpen(false);
  };

  const triggerClass = [
    "cds--toolbar-action",
    "cds--overflow-menu",
    styles.trigger,
    hasActiveFilters ? styles.triggerActive : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Layer>
      <Popover
        open={isOpen}
        isTabTip
        onRequestClose={() => setIsOpen(false)}
        align={align}
      >
        <button
          aria-label={triggerLabel ?? t("filter", "篩選")}
          type="button"
          aria-expanded={isOpen}
          onClick={() => setIsOpen(!isOpen)}
          className={triggerClass}
        >
          <Filter />
          {hasActiveFilters && <span className={styles.activeIndicator} />}
        </button>
        <PopoverContent id={popoverId}>
          <div className={styles.content}>
            <div className={styles.fields}>{children}</div>
            <div className={styles.actions}>
              <Button kind="secondary" onClick={handleReset}>
                {t("button.reset", "重設")}
              </Button>
              {doneLabel !== undefined ? (
                <Button kind="primary" onClick={handleDone}>
                  {doneLabel}
                </Button>
              ) : (
                <Button kind="primary" onClick={() => setIsOpen(false)}>
                  {t("button.done", "完成")}
                </Button>
              )}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </Layer>
  );
};
