import { Add, Undo, Redo, TextAlignLeft, FunctionMath, TextFont } from '@carbon/icons-react';
import { Button, IconButton } from '@carbon/react';
import Placeholder from '@tiptap/extension-placeholder';
import { EditorContent, useEditor } from '@tiptap/react';
import type { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { OpenAnswerDocument } from '@/core/entities/contest.entity';
import { normalizeOpenAnswerDocument } from './openAnswerDocument';
import { documentToTiptap, tiptapToDocument, MATH_BLOCK_NAME, MATH_INLINE_NAME } from './openAnswerTiptap';
import FormulaEditorModal from './FormulaEditorModal';
import { MathInlineExtension, MathBlockExtension } from './MathInlineExtension';
import styles from './OpenAnswerDocumentEditor.module.scss';

interface OpenAnswerDocumentEditorProps {
  variant?: 'default' | 'paper';
  value?: OpenAnswerDocument | null;
  onChange: (value: OpenAnswerDocument) => void;
  onBlur?: () => void;
  readOnly?: boolean;
  ariaLabel?: string;
  placeholder?: string;
  'data-testid'?: string;
}
type InsertKind = 'text' | 'block' | 'inline';
const choices: { kind: InsertKind; title: string; description: string }[] = [
  { kind: 'text', title: '文字', description: '寫下理由或接續說明' },
  { kind: 'block', title: '獨立公式', description: '另起一行，書寫算式與推導' },
  { kind: 'inline', title: '行內公式', description: '在句子中加入數學式' },
];
function findMath(editor: Editor, id: string) {
  let found: { pos: number; size: number; latex: string } | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (node.attrs.id === id && [MATH_INLINE_NAME, MATH_BLOCK_NAME].includes(node.type.name)) found = { pos, size: node.nodeSize, latex: node.attrs.latex };
  });
  return found as { pos: number; size: number; latex: string } | null;
}
function floatingPosition(editor: Editor, pos: number, height: number, preferredWidth = 448, anchorNode = false) {
  const nodeElement = anchorNode ? editor.view.nodeDOM(pos) : null;
  const coords = nodeElement instanceof HTMLElement ? nodeElement.getBoundingClientRect() : editor.view.coordsAtPos(pos);
  const bounds = editor.view.dom.getBoundingClientRect();
  const width = Math.min(preferredWidth, window.innerWidth - 32, bounds.width);
  return { position: 'fixed' as const, width, left: Math.max(16, bounds.left, Math.min(coords.left, bounds.right - width, window.innerWidth - width - 16)), top: Math.max(16, Math.min(coords.bottom + 8, window.innerHeight - height - 16)) };
}
export function OpenAnswerDocumentEditor({ variant = 'default', value, onChange, onBlur, readOnly = false, ariaLabel = '開放題作答區', placeholder = '直接開始寫，或輸入 / 插入內容', 'data-testid': dataTestId }: OpenAnswerDocumentEditorProps) {
  const normalized = useMemo(() => normalizeOpenAnswerDocument(value), [value]);
  const [menu, setMenu] = useState<{ from: number; to: number } | null>(null);
  const [panel, setPanel] = useState<{ id: string; latex: string } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const openHelper = useCallback((id: string, latex: string) => setPanel({ id, latex }), []);
  const editor = useEditor({
    editable: !readOnly,
    extensions: [
      StarterKit.configure({ heading: false, bulletList: false, orderedList: false, blockquote: false, codeBlock: false, horizontalRule: false, bold: false, italic: false, strike: false, code: false, link: false, underline: false }),
      Placeholder.configure({ placeholder }),
      MathInlineExtension.configure({ onEdit: openHelper }),
      MathBlockExtension.configure({ onEdit: openHelper }),
    ],
    content: documentToTiptap(normalized),
    editorProps: {
      attributes: { class: styles.editorSurface, 'aria-label': ariaLabel, role: 'textbox', 'aria-multiline': 'true' },
      handleTextInput: (view, from, to, text) => {
        if (text !== '/' || !view.editable || view.composing) return false;
        const before = view.state.doc.resolve(from).parent.textBetween(0, view.state.doc.resolve(from).parentOffset);
        if (!before || /\s$/.test(before)) { setMenu({ from, to }); return true; }
        return false;
      },
    },
  });
  useEffect(() => {
    if (!editor) return;
    const handler = () => onChange(tiptapToDocument(editor.getJSON()));
    editor.on('update', handler);
    return () => { editor.off('update', handler); };
  }, [editor, onChange]);
  useEffect(() => {
    if (!editor) return;
    // Compare persisted content, not generated node IDs or Tiptap normalization.
    if (JSON.stringify(tiptapToDocument(editor.getJSON())) !== JSON.stringify(normalized)) {
      editor.commands.setContent(documentToTiptap(normalized), { emitUpdate: false });
    }
  }, [editor, normalized]);
  useEffect(() => { editor?.setEditable(!readOnly, false); }, [editor, readOnly]);
  useEffect(() => {
    if (!menu) return;
    const frame = requestAnimationFrame(() => menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus());
    return () => cancelAnimationFrame(frame);
  }, [menu]);
  const restoreFocus = () => { setMenu(null); editor?.commands.focus(); };
  const insert = (kind: InsertKind) => {
    if (!editor || readOnly || !menu) return;
    const { from, to } = menu;
    const selected = editor.state.doc.nodeAt(from);
    const selectedMath = selected && [MATH_BLOCK_NAME, MATH_INLINE_NAME].includes(selected.type.name);
    const at = selectedMath ? from + selected.nodeSize : from;
    const inParagraph = editor.state.doc.resolve(at).parent.type.name === 'paragraph';
    setMenu(null);
    if (kind === 'text') {
      if (inParagraph) editor.chain().focus().setTextSelection(at).splitBlock().run();
      else editor.chain().focus().insertContentAt(at, { type: 'paragraph' }).setTextSelection(at + 1).run();
      return;
    }
    const id = crypto.randomUUID();
    const math = { type: kind === 'block' ? MATH_BLOCK_NAME : MATH_INLINE_NAME, attrs: { id, latex: '' } };
    const content = kind === 'inline' && !inParagraph ? { type: 'paragraph', content: [math] } : math;
    editor.chain().insertContentAt({ from: at, to: selectedMath ? at : to }, content).run();
    const inserted = findMath(editor, id);
    if (inserted) { editor.commands.setNodeSelection(inserted.pos); setPanel({ id, latex: '' }); }
  };
  const panelTarget = panel && editor ? findMath(editor, panel.id) : null;
  const submitFormula = (latex: string) => {
    if (!editor || !panelTarget || readOnly) return;
    editor.view.dispatch(editor.state.tr.setNodeMarkup(panelTarget.pos, undefined, { ...editor.state.doc.nodeAt(panelTarget.pos)?.attrs, latex }));
  };
  const removeFormula = () => {
    if (!editor || !panelTarget || readOnly) return;
    const { pos, size } = panelTarget;
    if (editor.state.doc.nodeAt(pos)?.type.name === MATH_BLOCK_NAME) editor.commands.insertContentAt({ from: pos, to: pos + size }, { type: 'paragraph' });
    else editor.commands.deleteRange({ from: pos, to: pos + size });
  };
  return <div className={`${styles.root} ${variant === 'paper' ? styles.paper : ''}`} data-testid={dataTestId} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget as globalThis.Node | null)) onBlur?.();
  }}>
    {!readOnly && <div className={styles.toolbar} aria-label="作答工具列">
      <IconButton kind="ghost" size="sm" label="插入內容" align="bottom-left" aria-expanded={!!menu} onMouseDown={event => event.preventDefault()} onClick={() => { if (editor) setMenu({ from: editor.state.selection.from, to: editor.state.selection.to }); }}><Add/></IconButton>
      <div className={styles.historyTools}><IconButton kind="ghost" size="sm" label="復原" onMouseDown={event => event.preventDefault()} onClick={() => editor?.chain().focus().undo().run()}><Undo/></IconButton><IconButton kind="ghost" size="sm" label="重做" onMouseDown={event => event.preventDefault()} onClick={() => editor?.chain().focus().redo().run()}><Redo/></IconButton></div>
    </div>}
    <div className={styles.sheet}><EditorContent editor={editor}/></div>
    {menu && editor && !readOnly && <div ref={menuRef} className={styles.insertMenu} style={floatingPosition(editor, menu.from, 280, 320)} role="menu" aria-label="插入內容" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as globalThis.Node | null)) setMenu(null); }} onKeyDown={event => {
      const buttons = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? []);
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); buttons[(index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus(); }
      if (event.key === 'Escape') { event.preventDefault(); restoreFocus(); }
    }}>
      <div className={styles.menuHeading}>插入內容</div>
      {choices.map(choice => <Button kind="ghost" role="menuitem" key={choice.kind} className={styles.insertChoice} onClick={() => insert(choice.kind)}><span className={styles.choiceIcon} aria-hidden="true">{choice.kind === 'text' ? <TextAlignLeft size={20}/> : choice.kind === 'block' ? <FunctionMath size={20}/> : <TextFont size={20}/>}</span><span>{choice.title}<small>{choice.description}</small></span></Button>)}
      <div className={styles.menuFooter}><span>↑ ↓ 選擇 ↵ 插入</span><span>Esc 關閉</span></div>
    </div>}
    <FormulaEditorModal key={panel?.id ?? 'closed'} open={!!panel && !!panelTarget && !readOnly} initialLatex={panel?.latex ?? ''} onClose={() => {
      if (editor && panel) {
        const target = findMath(editor, panel.id);
        if (target) {
          if (!target.latex) editor.commands.deleteRange({from: target.pos, to: target.pos + target.size});
          else {
            const after = target.pos + target.size;
            if (editor.state.doc.nodeAt(target.pos)?.type.name === MATH_BLOCK_NAME && editor.state.doc.nodeAt(after)?.type.name !== 'paragraph') editor.commands.insertContentAt(after, {type:'paragraph'});
            editor.commands.setTextSelection(Math.min(after + (editor.state.doc.nodeAt(target.pos)?.type.name === MATH_BLOCK_NAME ? 1 : 0), editor.state.doc.content.size));
          }
        }
      }
      setPanel(null); editor?.view.focus();
    }} onSubmit={submitFormula} onRemove={removeFormula} style={editor && panelTarget ? floatingPosition(editor, panelTarget.pos, 112, 448, true) : undefined}/>
  </div>;
}
export default OpenAnswerDocumentEditor;
