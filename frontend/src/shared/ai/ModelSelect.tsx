import { useEffect, useMemo, useRef, useState } from "react";
import { Checkmark, ChevronDown } from "@carbon/icons-react";
import AiLaunch from "@carbon/icons-react/es/AiLaunch.js";
import { useTranslation } from "react-i18next";
import styles from "./ModelSelect.module.scss";

function normalizeModelLabel(label: string | undefined, fallback: string): string {
  return label?.trim() || fallback;
}

export interface ModelSelectClasses {
  wrap?: string;
  button?: string;
  menu?: string;
  text?: string;
  icon?: string;
  chevron?: string;
  streamDot?: string;
}

export interface ModelSelectOption {
  id: string;
  label: string;
}

interface ModelSelectProps {
  models: readonly ModelSelectOption[];
  selectedModelId: string | null;
  onChange: (modelId: string) => void;
  disabled?: boolean;
  /** Small grey dot shown left of the trigger (e.g. when a stream is active). */
  showStreamDot?: boolean;
  /** Extra class on the outer wrapper for layout tweaks (e.g. RWD in composer). */
  className?: string;
  /** Where the menu opens relative to the trigger. Composer opens upward; modal downward. */
  menuPlacement?: "top" | "bottom";
  /** Per-element class overrides for host-specific RWD / layout tweaks. */
  classes?: ModelSelectClasses;
}

export function ModelSelect({
  models,
  selectedModelId,
  onChange,
  disabled = false,
  showStreamDot = false,
  className,
  menuPlacement = "top",
  classes,
}: ModelSelectProps) {
  const cx = (...parts: Array<string | undefined | false>) => parts.filter(Boolean).join(" ");
  const { t } = useTranslation("chatbot");
  const [isOpen, setIsOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const selectedModel = useMemo(
    () => models.find((model) => model.id === selectedModelId) ?? models[0],
    [models, selectedModelId],
  );

  const noModelsAvailable = models.length === 0;
  const triggerDisabled = disabled || noModelsAvailable;
  const unavailableLabel = t("ui.modelUnavailable", "無可用模型");
  const isMenuOpen = isOpen && !triggerDisabled;

  useEffect(() => {
    if (!isMenuOpen) return;
    const onMouseDown = (event: MouseEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [isMenuOpen]);

  return (
    <div
      ref={wrapRef}
      className={cx(styles.modelSelectWrap, className, classes?.wrap)}
    >
      {showStreamDot && <span className={cx(styles.streamDot, classes?.streamDot)} aria-hidden />}
      <button
        type="button"
        className={cx(styles.modelSelectButton, classes?.button)}
        onClick={() => setIsOpen((open) => !open)}
        disabled={triggerDisabled}
        aria-label={t("ui.modelLabel", "選擇模型")}
        aria-haspopup="listbox"
        aria-expanded={isMenuOpen}
      >
        <AiLaunch size={14} className={cx(styles.modelIcon, classes?.icon)} aria-hidden />
        <span className={cx(styles.modelText, classes?.text)}>
          {normalizeModelLabel(selectedModel?.label, unavailableLabel)}
        </span>
      </button>
      <ChevronDown size={14} className={cx(styles.modelChevron, classes?.chevron)} aria-hidden />
      {isMenuOpen && (
        <div
          className={cx(
            styles.modelMenu,
            menuPlacement === "bottom" ? styles.modelMenuBottom : styles.modelMenuTop,
            classes?.menu,
          )}
          role="listbox"
          aria-label={t("ui.modelLabel", "選擇模型")}
        >
          {models.map((model) => {
            const isActive = model.id === selectedModelId;
            return (
              <button
                key={model.id}
                type="button"
                className={`${styles.modelOption} ${isActive ? styles.modelOptionActive : ""}`}
                role="option"
                aria-selected={isActive}
                onClick={() => {
                  onChange(model.id);
                  setIsOpen(false);
                }}
              >
                <span>{normalizeModelLabel(model.label, model.id)}</span>
                {isActive && <Checkmark size={14} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
