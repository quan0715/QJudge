import { useEffect, useMemo, useRef, useState } from "react";
import { Checkmark, ChevronDown } from "@carbon/icons-react";
import AiLaunch from "@carbon/icons-react/es/AiLaunch.js";
import { useTranslation } from "react-i18next";
import type { ModelInfo } from "@/core/types/chatbot.types";
import styles from "./ModelSelect.module.scss";

export function normalizeModelLabel(label: string | undefined): string {
  return label?.trim() || "gpt-5-nano";
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

interface ModelSelectProps {
  models: ModelInfo[];
  selectedModelId: string;
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
    () => models.find((m) => m.model_id === selectedModelId) ?? models[0],
    [models, selectedModelId],
  );

  useEffect(() => {
    if (disabled) setIsOpen(false);
  }, [disabled]);

  useEffect(() => {
    if (!isOpen) return;
    const onMouseDown = (event: MouseEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [isOpen]);

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
        disabled={disabled}
        aria-label={t("ui.modelLabel", "選擇模型")}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <AiLaunch size={14} className={cx(styles.modelIcon, classes?.icon)} aria-hidden />
        <span className={cx(styles.modelText, classes?.text)}>
          {normalizeModelLabel(selectedModel?.display_name)}
        </span>
      </button>
      <ChevronDown size={14} className={cx(styles.modelChevron, classes?.chevron)} aria-hidden />
      {isOpen && (
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
            const isActive = model.model_id === selectedModelId;
            return (
              <button
                key={model.model_id}
                type="button"
                className={`${styles.modelOption} ${isActive ? styles.modelOptionActive : ""}`}
                role="option"
                aria-selected={isActive}
                onClick={() => {
                  onChange(model.model_id);
                  setIsOpen(false);
                }}
              >
                <span>{normalizeModelLabel(model.display_name)}</span>
                {isActive && <Checkmark size={14} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
