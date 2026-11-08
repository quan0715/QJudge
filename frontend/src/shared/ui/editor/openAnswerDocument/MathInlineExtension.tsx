import { Node, mergeAttributes } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, useEditorState } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { NodeSelection } from '@tiptap/pm/state';
import { useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { MATH_BLOCK_NAME, MATH_INLINE_NAME } from './openAnswerTiptap';
import styles from './OpenAnswerDocumentEditor.module.scss';

interface MathOptions { onEdit: (id: string, latex: string) => void; }
function MathNodeView({ node, editor, getPos, selected, extension }: NodeViewProps) {
  const editable = useEditorState({ editor, selector: ({ editor: current }) => current.isEditable });
  const block = node.type.name === MATH_BLOCK_NAME;
  const latex = String(node.attrs.latex ?? '');
  const html = useMemo(() => katex.renderToString(latex, { throwOnError: false, trust: false, displayMode: block }), [latex, block]);
  const open = () => { if (editable) { const pos = getPos(); if (typeof pos === 'number') editor.commands.setNodeSelection(pos); (extension.options as MathOptions).onEdit(String(node.attrs.id), latex); } };
  return <NodeViewWrapper as={block ? 'div' : 'span'} className={block ? styles.mathBlock : styles.mathInline} data-answer-math={block ? 'block' : 'inline'} contentEditable={false}>
    <span className={`${styles.formulaPreview} ${selected ? styles.formulaSelected : ''}`} role={editable ? 'button' : undefined} tabIndex={editable ? 0 : undefined} aria-label={`${block ? '獨立公式' : '行內公式'}：${latex || '新增公式'}`} onMouseDown={event => { event.preventDefault(); }} onClick={event => { event.stopPropagation(); open(); }} onKeyDown={event => {
      if (event.key === 'Enter' || event.key === ' ' || event.key === 'F2') { event.preventDefault(); event.stopPropagation(); open(); }
    }}>{latex ? <span dangerouslySetInnerHTML={{ __html: html }}/> : '新增公式'}</span>
  </NodeViewWrapper>;
}
function createMathExtension(block: boolean) {
  return Node.create<MathOptions>({
    name: block ? MATH_BLOCK_NAME : MATH_INLINE_NAME,
    inline: !block, group: block ? 'block' : 'inline', atom: true, selectable: true, draggable: false,
    addOptions() { return { onEdit: () => {} }; },
    addAttributes() { return { latex: { default: '' }, id: { default: null, rendered: false } }; },
    parseHTML() { return [{ tag: block ? 'div[data-math-block]' : 'span[data-math-inline]', getAttrs: element => ({ latex: element.getAttribute('data-latex') ?? '', id: crypto.randomUUID() }) }]; },
    renderHTML({ node, HTMLAttributes }) { return [block ? 'div' : 'span', mergeAttributes(HTMLAttributes, { [block ? 'data-math-block' : 'data-math-inline']: '', 'data-latex': node.attrs.latex })]; },
    addKeyboardShortcuts() { return { Enter: () => {
      const selection = this.editor.state.selection;
      if (!(selection instanceof NodeSelection) || selection.node.type.name !== this.name || !this.editor.isEditable) return false;
      this.options.onEdit(selection.node.attrs.id, selection.node.attrs.latex); return true;
    } }; },
    addNodeView() { return ReactNodeViewRenderer(MathNodeView); },
  });
}
export const MathInlineExtension = createMathExtension(false);
export const MathBlockExtension = createMathExtension(true);
export default MathInlineExtension;
