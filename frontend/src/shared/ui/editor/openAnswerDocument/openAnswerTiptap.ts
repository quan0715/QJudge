import type { JSONContent } from '@tiptap/core';
import type { OpenAnswerDocument, OpenInlineNode } from '@/core/entities/contest.entity';

export const MATH_INLINE_NAME = 'mathInline';
export const MATH_BLOCK_NAME = 'mathBlock';
const math = (latex: string, block: boolean): JSONContent => ({ type: block ? MATH_BLOCK_NAME : MATH_INLINE_NAME, attrs: { latex, id: crypto.randomUUID() } });

export function documentToTiptap(document: OpenAnswerDocument): JSONContent {
  return { type: 'doc', content: document.nodes.length ? document.nodes.map(node => {
    if (node.children.length === 1 && node.children[0].type === 'math') return math(node.children[0].latex, true);
    return { type: 'paragraph', content: node.children.flatMap((child): JSONContent[] => {
      if (child.type === 'math') return [math(child.latex, false)];
      return child.text.split('\n').flatMap((text, index) => [...(index ? [{ type: 'hardBreak' }] : []), ...(text ? [{ type: 'text', text }] : [])]);
    }) };
  }) : [{ type: 'paragraph' }] };
}

export function tiptapToDocument(json: JSONContent): OpenAnswerDocument {
  const nodes: OpenAnswerDocument['nodes'] = [];
  for (const block of json.content ?? []) {
    if (block.type === MATH_BLOCK_NAME) {
      nodes.push({ type: 'paragraph', children: [{ type: 'math', latex: block.attrs?.latex ?? '' }] });
    } else if (block.type === 'paragraph') {
      const children: OpenInlineNode[] = [];
      for (const child of block.content ?? []) {
        if (child.type === MATH_INLINE_NAME) children.push({ type: 'math', latex: child.attrs?.latex ?? '' });
        else if (child.type === 'text' || child.type === 'hardBreak') {
          const text = child.type === 'hardBreak' ? '\n' : child.text ?? '';
          const previous = children.at(-1);
          if (previous?.type === 'text') previous.text += text;
          else if (text) children.push({ type: 'text', text });
        }
      }
      nodes.push({ type: 'paragraph', children });
    }
  }
  return { version: 1, nodes: nodes.length ? nodes : [{ type: 'paragraph', children: [] }] };
}
