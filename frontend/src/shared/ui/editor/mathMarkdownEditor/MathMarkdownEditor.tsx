import { type FC, useCallback, useRef } from "react";
import { TextArea, Tooltip } from "@carbon/react";
import { useTranslation } from "react-i18next";

import MarkdownRenderer from "@/shared/ui/markdown/MarkdownRenderer";

import styles from "./MathMarkdownEditor.module.scss";

type TemplateId =
  | "fraction"
  | "sqrt"
  | "power"
  | "subscript"
  | "pi"
  | "theta"
  | "aligned";

interface MathTemplate {
  id: TemplateId;
  symbol: string;
  snippet: string;
  cursorOffset: number;
}

const MATH_TEMPLATES: MathTemplate[] = [
  {
    id: "fraction",
    symbol: "a/b",
    snippet: "$\\frac{}{}$",
    cursorOffset: "$\\frac{".length,
  },
  {
    id: "sqrt",
    symbol: "√",
    snippet: "$\\sqrt{}$",
    cursorOffset: "$\\sqrt{".length,
  },
  {
    id: "power",
    symbol: "x²",
    snippet: "$x^{}$",
    cursorOffset: "$x^{".length,
  },
  {
    id: "subscript",
    symbol: "xᵢ",
    snippet: "$x_{}$",
    cursorOffset: "$x_{".length,
  },
  {
    id: "pi",
    symbol: "π",
    snippet: "$\\pi$",
    cursorOffset: "$\\pi$".length,
  },
  {
    id: "theta",
    symbol: "θ",
    snippet: "$\\theta$",
    cursorOffset: "$\\theta$".length,
  },
  {
    id: "aligned",
    symbol: "=",
    snippet: "$$\n\\begin{aligned}\n &= \\\\\n &= \n\\end{aligned}\n$$",
    cursorOffset: "$$\n\\begin{aligned}\n &=".length,
  },
];

const TOOLBAR_LABELS: Record<TemplateId, string> = {
  fraction: "分式",
  sqrt: "根號",
  power: "次方",
  subscript: "下標",
  pi: "圓周率",
  theta: "角度 theta",
  aligned: "多行等式",
};

export interface MathMarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  ariaLabel?: string;
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
  minRows?: number;
  "data-testid"?: string;
  onBlur?: () => void;
}

export const MathMarkdownEditor: FC<MathMarkdownEditorProps> = ({
  value,
  onChange,
  id,
  ariaLabel,
  placeholder,
  disabled = false,
  readOnly = false,
  minRows = 8,
  "data-testid": dataTestId,
  onBlur,
}) => {
  const { t } = useTranslation("contest");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const focusAt = useCallback((position: number) => {
    requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.focus();
      textarea.setSelectionRange(position, position);
    });
  }, []);

  const insertText = useCallback(
    (text: string, cursorOffset = text.length) => {
      const textarea = textareaRef.current;
      const start = textarea?.selectionStart ?? value.length;
      const end = textarea?.selectionEnd ?? value.length;
      const nextValue = `${value.slice(0, start)}${text}${value.slice(end)}`;
      onChange(nextValue);
      focusAt(start + cursorOffset);
    },
    [focusAt, onChange, value],
  );

  const handlePaste = useCallback(
    (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
      event.preventDefault();
      insertText(event.clipboardData.getData("text/plain"));
    },
    [insertText],
  );

  const disabledToolbar = disabled || readOnly;
  const editorLabel = ariaLabel || t("answering.mathEditor.ariaLabel", "數學解答編輯器");

  return (
    <div className={styles.root}>
      <div className={styles.toolbar} aria-label={t("answering.mathEditor.toolbar.label", "數學工具列")}>
        {MATH_TEMPLATES.map((template) => {
          const label = t(
            `answering.mathEditor.toolbar.${template.id}`,
            TOOLBAR_LABELS[template.id],
          );
          return (
            <Tooltip key={template.id} label={label} align="top" autoAlign>
              <button
                type="button"
                className={styles.toolButton}
                aria-label={label}
                disabled={disabledToolbar}
                onClick={() => insertText(template.snippet, template.cursorOffset)}
              >
                {template.symbol}
              </button>
            </Tooltip>
          );
        })}
      </div>

      <TextArea
        id={id}
        ref={(node: HTMLTextAreaElement | null) => {
          textareaRef.current = node;
        }}
        data-testid={dataTestId}
        labelText={editorLabel}
        hideLabel
        aria-label={editorLabel}
        placeholder={
          placeholder ||
          t(
            "answering.mathEditor.placeholder",
            "輸入計算過程，可用上方按鈕插入常用公式",
          )
        }
        value={value}
        onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) =>
          onChange(event.target.value)
        }
        onPasteCapture={handlePaste}
        onBlur={onBlur}
        disabled={disabled}
        readOnly={readOnly}
        rows={minRows}
      />

      <div className={styles.preview} aria-live="polite">
        <div className={styles.previewLabel}>
          {t("answering.mathEditor.previewLabel", "預覽")}
        </div>
        {value.trim() ? (
          <MarkdownRenderer enableMath>{value}</MarkdownRenderer>
        ) : (
          <div className={styles.emptyPreview}>
            {t("answering.mathEditor.emptyPreview", "尚未輸入")}
          </div>
        )}
      </div>
    </div>
  );
};

export default MathMarkdownEditor;
