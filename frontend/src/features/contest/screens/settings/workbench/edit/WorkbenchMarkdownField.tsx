import { useState, type ReactNode } from "react";
import { IconButton } from "@carbon/react";
import { Edit, View } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import { MarkdownField } from "@/shared/ui/markdown/markdownEditor";
import MarkdownRenderer from "@/shared/ui/markdown/MarkdownRenderer";
import styles from "./WorkbenchEdit.module.scss";

export default function WorkbenchMarkdownField({ id, labelText, value, onChange, disabled = false, invalid, invalidText, suffix }: {
  id: string;
  labelText: string;
  value: string;
  onChange(value: string): void;
  disabled?: boolean;
  invalid?: boolean;
  invalidText?: string;
  suffix?: ReactNode;
}) {
  const { t } = useTranslation("contest");
  const [source, setSource] = useState(false);
  return (
    <div className={`${styles.markdownSurface} ${source ? styles.markdownSource : !disabled ? styles.markdownEditable : ""}`}>
      {!disabled && <div className={styles.markdownToggle}>
        <IconButton kind="ghost" size="sm"
          label={source
            ? t("workbench.edit.renderMarkdown", "顯示排版：{{label}}", { label: labelText })
            : t("workbench.edit.sourceMarkdown", "編輯文字：{{label}}", { label: labelText })}
          aria-pressed={source}
          onClick={() => setSource(!source)}
        >{source ? <View /> : <Edit />}</IconButton>
      </div>}
      {source && !disabled ? (
        <MarkdownField id={id} labelText={labelText} value={value} onChange={onChange}
          variant="subtle" showPreview={false} invalid={invalid} invalidText={invalidText} />
      ) : <div className={styles.markdownRendered}
        role={disabled ? undefined : "button"}
        tabIndex={disabled ? undefined : 0}
        aria-label={disabled ? undefined : t("workbench.edit.sourceMarkdown", "編輯文字：{{label}}", { label: labelText })}
        onClick={disabled ? undefined : (event) => {
          if ((event.target as HTMLElement).closest("a, button, input")) return;
          setSource(true);
        }}
        onKeyDown={disabled ? undefined : (event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setSource(true);
          }
        }}>
        <div className={suffix ? styles.markdownWithSuffix : undefined}>
          {value.trim() ? <MarkdownRenderer className={styles.markdownContent} enableMath enableHighlight>{value}</MarkdownRenderer>
            : <span className={styles.markdownEmpty}>—</span>}
          {suffix}
        </div>
        {invalid && <p className={styles.markdownInvalid}>{invalidText}</p>}
      </div>}
    </div>
  );
}
