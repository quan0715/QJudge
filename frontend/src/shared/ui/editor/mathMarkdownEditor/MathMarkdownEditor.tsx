import { type FC, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TextArea, Tooltip } from "@carbon/react";
import { useTranslation } from "react-i18next";

import MarkdownRenderer from "@/shared/ui/markdown/MarkdownRenderer";
import {
  cleanMathFieldValue,
  createMathSegment,
  createTextSegment,
  parseMarkdownMath,
  serializeMathSegment,
  serializeSegments,
  type MathFieldKey,
  type MathMarkdownSegment,
  type MathSegment,
  type MathTemplateId,
} from "./mathMarkdownSegments";

import styles from "./MathMarkdownEditor.module.scss";

interface MathTemplate {
  id: MathTemplateId;
  symbol: string;
}

const MATH_TEMPLATES: MathTemplate[] = [
  {
    id: "fraction",
    symbol: "a/b",
  },
  {
    id: "sqrt",
    symbol: "√",
  },
  {
    id: "power",
    symbol: "x²",
  },
  {
    id: "subscript",
    symbol: "xᵢ",
  },
  {
    id: "pi",
    symbol: "π",
  },
  {
    id: "theta",
    symbol: "θ",
  },
  {
    id: "aligned",
    symbol: "=",
  },
];

const TOOLBAR_LABELS: Record<MathTemplateId, string> = {
  fraction: "分式",
  sqrt: "根號",
  power: "次方",
  subscript: "下標",
  pi: "圓周率",
  theta: "角度 theta",
  aligned: "多行等式",
};

const FIELD_LABELS: Record<MathFieldKey, string> = {
  numerator: "分子",
  denominator: "分母",
  radicand: "根號內",
  base: "底數",
  exponent: "指數",
  subscript: "下標",
  lines: "等式列",
};

const TEMPLATE_FIELD_KEYS: Partial<Record<MathTemplateId, MathFieldKey[]>> = {
  fraction: ["numerator", "denominator"],
  sqrt: ["radicand"],
  power: ["base", "exponent"],
  subscript: ["base", "subscript"],
  aligned: ["lines"],
};

const getFirstEditableFieldKey = (template: MathTemplateId): MathFieldKey | null =>
  TEMPLATE_FIELD_KEYS[template]?.[0] ?? null;

const buildPreviewMarkdown = (segment: MathSegment) => {
  const latex = serializeMathSegment(segment);
  if (segment.displayMode === "block") return `$$\n${latex}\n$$`;
  return `$${latex}$`;
};

export interface MathMarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  enableMath?: boolean;
  showMathToolbar?: boolean;
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
  enableMath = true,
  showMathToolbar,
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
  const rootRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const activeTextSelectionRef = useRef<{
    index: number;
    start: number;
    end: number;
  } | null>(null);
  const pendingFocusRef = useRef<{
    index: number;
    field: MathFieldKey | null;
  } | null>(null);
  const [activeMathIndex, setActiveMathIndex] = useState<number | null>(null);
  const segments = useMemo(() => parseMarkdownMath(value), [value]);

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

  const commitSegments = useCallback(
    (nextSegments: MathMarkdownSegment[]) => {
      onChange(serializeSegments(nextSegments));
    },
    [onChange],
  );

  const updateActiveTextSelection = useCallback(
    (index: number, target: HTMLTextAreaElement) => {
      activeTextSelectionRef.current = {
        index,
        start: target.selectionStart ?? target.value.length,
        end: target.selectionEnd ?? target.value.length,
      };
    },
    [],
  );

  const handleVisualTextChange = useCallback(
    (index: number, nextText: string) => {
      const nextSegments = [...segments];
      nextSegments[index] = createTextSegment(nextText);
      commitSegments(nextSegments);
    },
    [commitSegments, segments],
  );

  const handleVisualTextPaste = useCallback(
    (index: number, event: React.ClipboardEvent<HTMLTextAreaElement>) => {
      event.preventDefault();
      const current = segments[index];
      if (!current || current.type !== "text") return;
      const target = event.currentTarget;
      const start = target.selectionStart ?? current.text.length;
      const end = target.selectionEnd ?? current.text.length;
      const plainText = event.clipboardData.getData("text/plain");
      const nextText = `${current.text.slice(0, start)}${plainText}${current.text.slice(end)}`;
      const nextSegments = [...segments];
      nextSegments[index] = createTextSegment(nextText);
      activeTextSelectionRef.current = {
        index,
        start: start + plainText.length,
        end: start + plainText.length,
      };
      commitSegments(nextSegments);
    },
    [commitSegments, segments],
  );

  const handleMathFieldChange = useCallback(
    (index: number, field: MathFieldKey, nextValue: string) => {
      const segment = segments[index];
      if (!segment || segment.type !== "math") return;
      const nextSegments = [...segments];
      nextSegments[index] = {
        ...segment,
        fields: {
          ...segment.fields,
          [field]: cleanMathFieldValue(nextValue),
        },
      };
      commitSegments(nextSegments);
    },
    [commitSegments, segments],
  );

  const removeSegment = useCallback(
    (index: number) => {
      const nextSegments = segments.filter((_, segmentIndex) => segmentIndex !== index);
      if (!nextSegments.some((segment) => segment.type === "text")) {
        nextSegments.push(createTextSegment());
      }
      setActiveMathIndex(null);
      commitSegments(nextSegments.length ? nextSegments : [createTextSegment()]);
    },
    [commitSegments, segments],
  );

  const insertTemplate = useCallback(
    (template: MathTemplateId) => {
      if (disabled || readOnly) return;
      const mathSegment = createMathSegment(template);
      const active = activeTextSelectionRef.current;
      let nextSegments: MathMarkdownSegment[] = [];
      let insertedIndex = 0;

      const activeSegment = active ? segments[active.index] : undefined;
      if (active && activeSegment?.type === "text") {
        const current = activeSegment;
        const before = current.text.slice(0, active.start);
        const after = current.text.slice(active.end);
        const replacement: MathMarkdownSegment[] = [];
        if (before) replacement.push(createTextSegment(before));
        insertedIndex = segments.slice(0, active.index).length + replacement.length;
        replacement.push(mathSegment);
        replacement.push(createTextSegment(after));
        nextSegments = [
          ...segments.slice(0, active.index),
          ...replacement,
          ...segments.slice(active.index + 1),
        ];
      } else if (
        segments.length === 1 &&
        segments[0]?.type === "text" &&
        !segments[0].text
      ) {
        nextSegments = [mathSegment, createTextSegment()];
        insertedIndex = 0;
      } else if (segments.length) {
        const lastSegment = segments[segments.length - 1];
        const needsFormulaSeparator = lastSegment?.type === "math";
        nextSegments = [
          ...segments,
          ...(needsFormulaSeparator ? [createTextSegment(" ")] : []),
          mathSegment,
          createTextSegment(),
        ];
        insertedIndex = segments.length + (needsFormulaSeparator ? 1 : 0);
      } else {
        nextSegments = [mathSegment, createTextSegment()];
        insertedIndex = 0;
      }

      pendingFocusRef.current = {
        index: insertedIndex,
        field: getFirstEditableFieldKey(template),
      };
      setActiveMathIndex(insertedIndex);
      commitSegments(nextSegments);
    },
    [commitSegments, disabled, readOnly, segments],
  );

  useEffect(() => {
    const pendingFocus = pendingFocusRef.current;
    if (!pendingFocus) return;
    pendingFocusRef.current = null;

    requestAnimationFrame(() => {
      const root = rootRef.current;
      if (!root) return;
      if (pendingFocus.field) {
        const field = root.querySelector<HTMLInputElement | HTMLTextAreaElement>(
          `[data-math-input="${pendingFocus.index}:${pendingFocus.field}"]`,
        );
        field?.focus();
        field?.select();
        return;
      }

      const nextText = root.querySelector<HTMLTextAreaElement>(
        `[data-text-segment="${pendingFocus.index + 1}"]`,
      );
      nextText?.focus();
    });
  }, [value]);

  const disabledToolbar = disabled || readOnly;
  const shouldShowToolbar = showMathToolbar ?? enableMath;
  const editorLabel = ariaLabel || t("answering.mathEditor.ariaLabel", "數學解答編輯器");
  const textSegmentLabel = t("answering.mathEditor.textSegmentLabel", "文字段落");
  const editFormulaLabel = t("answering.mathEditor.editFormula", "編輯公式");
  const removeFormulaLabel = t("answering.mathEditor.removeFormula", "移除公式");

  const renderToolbar = () =>
    shouldShowToolbar ? (
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
                onClick={() => insertTemplate(template.id)}
              >
                {template.symbol}
              </button>
            </Tooltip>
          );
        })}
      </div>
    ) : null;

  const renderPlainTextEditor = () => (
    <>
      {renderToolbar()}

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
    </>
  );

  const renderTextSegment = (segment: Extract<MathMarkdownSegment, { type: "text" }>, index: number) => (
    <TextArea
      key={`text-${index}`}
      id={index === 0 ? id : `${id || "math-answer"}-text-${index}`}
      data-testid={index === 0 ? dataTestId : undefined}
      data-text-segment={index}
      labelText={index === 0 ? editorLabel : textSegmentLabel}
      hideLabel
      aria-label={index === 0 ? editorLabel : textSegmentLabel}
      placeholder={
        placeholder ||
        t(
          "answering.mathEditor.placeholder",
          "輸入計算過程，可用上方按鈕插入常用公式",
        )
      }
      value={segment.text}
      onFocus={(event: React.FocusEvent<HTMLTextAreaElement>) =>
        updateActiveTextSelection(index, event.currentTarget)
      }
      onClick={(event: React.MouseEvent<HTMLTextAreaElement>) =>
        updateActiveTextSelection(index, event.currentTarget)
      }
      onSelect={(event: React.SyntheticEvent<HTMLTextAreaElement>) =>
        updateActiveTextSelection(index, event.currentTarget)
      }
      onKeyUp={(event: React.KeyboardEvent<HTMLTextAreaElement>) =>
        updateActiveTextSelection(index, event.currentTarget)
      }
      onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => {
        updateActiveTextSelection(index, event.currentTarget);
        handleVisualTextChange(index, event.target.value);
      }}
      onPasteCapture={(event: React.ClipboardEvent<HTMLTextAreaElement>) =>
        handleVisualTextPaste(index, event)
      }
      onBlur={onBlur}
      disabled={disabled}
      readOnly={readOnly}
      rows={Math.max(2, Math.min(minRows, segment.text.split(/\r?\n/).length + 1))}
    />
  );

  const getFieldLabel = (field: MathFieldKey) =>
    t(`answering.mathEditor.fields.${field}`, FIELD_LABELS[field]);

  const renderMathInput = (
    segment: MathSegment,
    index: number,
    field: MathFieldKey,
    className?: string,
  ) => {
    const label = getFieldLabel(field);
    return (
      <input
        id={`${id || "math-answer"}-math-${index}-${field}`}
        data-math-input={`${index}:${field}`}
        className={`${styles.mathInput}${className ? ` ${className}` : ""}`}
        aria-label={label}
        placeholder={label}
        value={segment.fields[field] ?? ""}
        onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
          handleMathFieldChange(index, field, event.target.value)
        }
        onBlur={onBlur}
        disabled={disabled}
        readOnly={readOnly}
      />
    );
  };

  const renderMathControl = (segment: MathSegment, index: number) => {
    switch (segment.template) {
      case "fraction":
        return (
          <span className={styles.fractionControl}>
            {renderMathInput(segment, index, "numerator", styles.fractionInput)}
            <span className={styles.fractionRule} aria-hidden="true" />
            {renderMathInput(segment, index, "denominator", styles.fractionInput)}
          </span>
        );
      case "sqrt":
        return (
          <span className={styles.sqrtControl}>
            <span className={styles.sqrtSymbol} aria-hidden="true">
              √
            </span>
            {renderMathInput(segment, index, "radicand", styles.radicandInput)}
          </span>
        );
      case "power":
        return (
          <span className={styles.powerControl}>
            {renderMathInput(segment, index, "base", styles.baseInput)}
            {renderMathInput(segment, index, "exponent", styles.exponentInput)}
          </span>
        );
      case "subscript":
        return (
          <span className={styles.subscriptControl}>
            {renderMathInput(segment, index, "base", styles.baseInput)}
            {renderMathInput(segment, index, "subscript", styles.subscriptInput)}
          </span>
        );
      case "pi":
        return <span className={styles.symbolFormula}>π</span>;
      case "theta":
        return <span className={styles.symbolFormula}>θ</span>;
      case "aligned":
        return (
          <TextArea
            id={`${id || "math-answer"}-math-${index}-lines`}
            data-math-input={`${index}:lines`}
            className={styles.alignedInput}
            labelText={getFieldLabel("lines")}
            hideLabel
            aria-label={getFieldLabel("lines")}
            value={segment.fields.lines ?? ""}
            onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) =>
              handleMathFieldChange(index, "lines", event.target.value)
            }
            onBlur={onBlur}
            disabled={disabled}
            readOnly={readOnly}
            rows={3}
          />
        );
      case "raw":
        return (
          <div className={styles.formulaPreview}>
            <MarkdownRenderer enableMath>{buildPreviewMarkdown(segment)}</MarkdownRenderer>
          </div>
        );
    }
  };

  const renderMathSegment = (segment: MathSegment, index: number) => {
    const isActive = activeMathIndex === index;

    if (!isActive) {
      return (
        <button
          key={`math-${index}`}
          type="button"
          className={styles.formulaToken}
          data-testid={`math-segment-${index}`}
          aria-label={editFormulaLabel}
          onClick={() => setActiveMathIndex(index)}
          disabled={disabled}
        >
          <MarkdownRenderer enableMath>{buildPreviewMarkdown(segment)}</MarkdownRenderer>
        </button>
      );
    }

    return (
      <div
        key={`math-${index}`}
        className={`${styles.formulaSegment} ${segment.template === "aligned" ? styles.formulaSegmentBlock : ""}`}
        data-testid={`math-segment-${index}`}
      >
        {renderMathControl(segment, index)}
        {!readOnly && !disabled && (
          <button
            type="button"
            className={styles.removeFormulaButton}
            aria-label={removeFormulaLabel}
            onClick={() => removeSegment(index)}
          >
            ×
          </button>
        )}
      </div>
    );
  };

  const renderVisualComposer = () => (
    <>
      {renderToolbar()}

      <div className={styles.composer} aria-label={editorLabel}>
        {segments.map((segment, index) =>
          segment.type === "text"
            ? renderTextSegment(segment, index)
            : renderMathSegment(segment, index),
        )}
      </div>
    </>
  );

  return (
    <div className={styles.root} ref={rootRef}>
      {enableMath ? renderVisualComposer() : renderPlainTextEditor()}

      <div className={styles.preview} aria-live="polite">
        <div className={styles.previewLabel}>
          {t("answering.mathEditor.previewLabel", "預覽")}
        </div>
        {value.trim() ? (
          <MarkdownRenderer enableMath={enableMath}>{value}</MarkdownRenderer>
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
