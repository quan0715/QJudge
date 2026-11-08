import { useEffect, useId, useRef, useState } from "react";
import { Button, TextInput } from "@carbon/react";
import styles from "./FormulaEditorModal.module.scss";

export interface FormulaEditorModalProps {
  open: boolean;
  initialLatex: string;
  onClose: () => void;
  onSubmit: (latex: string) => void;
  onRemove?: () => void;
  style?: React.CSSProperties;
}
const templates = [
  { label: "分式", latex: "\\frac{}{}" },
  { label: "根號", latex: "\\sqrt{}" },
  { label: "次方", latex: "^{}" },
  { label: "下標", latex: "_{}" },
];
export function FormulaEditorModal({ open, initialLatex, onClose, onSubmit, onRemove, style }: FormulaEditorModalProps) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(initialLatex);
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => { input.current?.focus(); });
    return () => cancelAnimationFrame(frame);
  }, [open, initialLatex]);
  const complete = () => { if (draft.trim()) onSubmit(draft.trim()); else onRemove?.(); onClose(); };
  if (!open) return null;
  return <div className={styles.popover} style={style} role="dialog" aria-label="編輯公式" onKeyDown={event => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); }
    if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); complete(); }
  }}>
    <div className={styles.editRow}>
      <TextInput id={id} ref={input} className={styles.sourceInput} labelText="公式內容" hideLabel value={draft} placeholder="例如 x^2 + 1 或 \\frac{1}{2}" onChange={event => setDraft(event.target.value)}/>
      <Button size="sm" onClick={complete}>完成 ↵</Button>
    </div>
    <details className={styles.assistance}><summary>公式輔助</summary><div className={styles.templates}>
      {templates.map(template => <Button key={template.label} kind="ghost" size="sm" onMouseDown={event => event.preventDefault()} onClick={() => {
        const start = input.current?.selectionStart ?? draft.length;
        const end = input.current?.selectionEnd ?? start;
        setDraft(draft.slice(0, start) + template.latex + draft.slice(end));
        requestAnimationFrame(() => { input.current?.focus(); input.current?.setSelectionRange(start + template.latex.indexOf('{') + 1, start + template.latex.indexOf('{') + 1); });
      }}>{template.label}</Button>)}
      <Button kind="ghost" size="sm" onClick={onClose}>取消</Button>
    </div></details>
  </div>;
}
export default FormulaEditorModal;
