import { useId } from "react";
import { Dropdown } from "@carbon/react";
import { useTranslation } from "react-i18next";
import styles from "./ModelSelect.module.scss";

function normalizeModelLabel(label: string | undefined, fallback: string): string {
  return label?.trim() || fallback;
}

export interface ModelSelectOption {
  id: string;
  label: string;
}

interface ModelSelectProps {
  models: readonly ModelSelectOption[];
  /** Inline controls blend into toolbars; forms keep the standard field surface. */
  type?: "default" | "inline";
  selectedModelId: string | null;
  onChange: (modelId: string) => void;
  disabled?: boolean;
  /** Small grey dot shown left of the trigger (e.g. when a stream is active). */
  showStreamDot?: boolean;
  /** Extra class on the outer wrapper for layout tweaks (e.g. RWD in composer). */
  className?: string;
  /** Where the menu opens relative to the trigger. Composer opens upward; modal downward. */
  menuPlacement?: "top" | "bottom";
}

export function ModelSelect({
  models,
  type = "default",
  selectedModelId,
  onChange,
  disabled = false,
  showStreamDot = false,
  className,
  menuPlacement = "top",
}: ModelSelectProps) {
  const id = useId();
  const { t } = useTranslation("chatbot");
  const selectedModel = models.find((model) => model.id === selectedModelId) ?? models[0] ?? null;
  return (
    <div className={[styles.modelSelectWrap, className].filter(Boolean).join(" ")}>
      {showStreamDot && <span className={styles.streamDot} aria-hidden />}
      <Dropdown
        id={`model-select-${id}`}
        type={type}
        titleText={t("ui.modelLabel", "選擇模型")}
        hideLabel
        label={t("ui.modelUnavailable", "無可用模型")}
        items={[...models]}
        selectedItem={selectedModel}
        itemToString={(model) => model ? normalizeModelLabel(model.label, model.id) : ""}
        onChange={({ selectedItem }) => { if (selectedItem) onChange(selectedItem.id); }}
        disabled={disabled || models.length === 0}
        direction={menuPlacement}
        size="sm"
        className={styles.control}
      />
    </div>
  );
}
