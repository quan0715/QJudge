import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@carbon/react";

import styles from "./FormulaEditorModal.module.scss";

import "mathlive/static.css";
import "mathlive/fonts.css";

interface MathFieldElement extends HTMLElement {
  value: string;
}

type MathFieldProps = React.DetailedHTMLProps<
  React.HTMLAttributes<HTMLElement> & {
    ref?: React.Ref<HTMLElement>;
    class?: string;
    "virtual-keyboard-mode"?: string;
  },
  HTMLElement
>;

declare module "react" {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      "math-field": MathFieldProps;
    }
  }
}

let mathLiveLoader: Promise<void> | null = null;

function ensureMathLiveRegistered(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.customElements?.get("math-field")) return Promise.resolve();
  if (!mathLiveLoader) {
    mathLiveLoader = import("mathlive").then(() => {
      // Importing mathlive registers <math-field> automatically.
    });
  }
  return mathLiveLoader;
}

export interface FormulaEditorModalProps {
  open: boolean;
  initialLatex: string;
  onClose: () => void;
  onSubmit: (latex: string) => void;
  onRemove?: () => void;
  style?: React.CSSProperties;
}

const FORMULA_TEMPLATES = [
  { label: "分式", latex: "\\frac{1}{2}" },
  { label: "根號", latex: "\\sqrt{x}" },
  { label: "次方", latex: "x^{2}" },
  { label: "下標", latex: "x_{i}" },
  { label: "Σ", latex: "\\sum_{k=1}^{n} a_k" },
  { label: "∫", latex: "\\int_{a}^{b} f(x)\\,dx" },
  { label: "lim", latex: "\\lim_{x\\to 0} f(x)" },
];

export function FormulaEditorModal({
  open,
  initialLatex,
  onClose,
  onSubmit,
  onRemove,
  style,
}: FormulaEditorModalProps) {
  const fieldRef = useRef<MathFieldElement | null>(null);
  const [ready, setReady] = useState(false);

  const headerTitle = useMemo(
    () => (initialLatex ? "編輯公式" : "插入公式"),
    [initialLatex],
  );

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    ensureMathLiveRegistered().then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !ready) return;
    const field = fieldRef.current;
    if (!field) return;
    field.value = initialLatex;
    requestAnimationFrame(() => field.focus());
  }, [open, ready, initialLatex]);

  const handleSubmit = () => {
    const value = (fieldRef.current?.value ?? "").trim();
    if (!value) {
      onRemove?.();
      onClose();
      return;
    }
    onSubmit(value);
    onClose();
  };

  const insertTemplate = (latex: string) => {
    const field = fieldRef.current;
    if (!field) return;
    field.value = latex;
    field.focus();
  };

  if (!open) return null;

  return (
    <div
      className={styles.popover}
      style={style}
      role="dialog"
      aria-label={headerTitle}
    >
      <div className={styles.header}>
        <span className={styles.title}>{headerTitle}</span>
        <Button kind="ghost" size="sm" onClick={onClose}>
          關閉
        </Button>
      </div>
      <div className={styles.templates} aria-label="常用公式">
        {FORMULA_TEMPLATES.map((template) => (
          <button
            key={template.label}
            type="button"
            className={styles.templateButton}
            onClick={() => insertTemplate(template.latex)}
          >
            {template.label}
          </button>
        ))}
      </div>
      <div className={styles.fieldWrap}>
        {ready ? (
          <math-field
            ref={fieldRef as React.Ref<HTMLElement>}
            class={styles.field}
            virtual-keyboard-mode="manual"
          />
        ) : (
          <div className={styles.loading}>正在載入公式編輯器…</div>
        )}
      </div>
      <p className={styles.hint}>
        用上方模板或公式鍵盤建立數學式，確認後會插入目前游標位置。
      </p>
      <div className={styles.actions}>
        {onRemove ? (
          <Button kind="danger--ghost" onClick={() => { onRemove(); onClose(); }}>
            移除公式
          </Button>
        ) : null}
        <Button kind="secondary" onClick={onClose}>
          取消
        </Button>
        <Button kind="primary" onClick={handleSubmit} disabled={!ready}>
          確認
        </Button>
      </div>
    </div>
  );
}

export default FormulaEditorModal;
