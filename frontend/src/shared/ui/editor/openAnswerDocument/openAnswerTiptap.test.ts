import { describe, expect, it } from 'vitest';
import type { OpenAnswerDocument } from '@/core/entities/contest.entity';
import { documentToTiptap, tiptapToDocument } from './openAnswerTiptap';
import { isOpenAnswerDocument, serializeOpenAnswerDocument } from './openAnswerDocument';
describe('block answer compatibility', () => {
  it('roundtrips mixed text, inline math, display math, soft breaks and blank paragraphs in version 1', () => {
    const document: OpenAnswerDocument = {version:1,nodes:[
      {type:'paragraph',children:[{type:'text',text:'設 '},{type:'math',latex:'x=2'},{type:'text',text:'。\n因此'}]},
      {type:'paragraph',children:[{type:'math',latex:'x^2=4'}]},
      {type:'paragraph',children:[]},
    ]};
    const json = documentToTiptap(document);
    expect(json.content?.[0].type).toBe('paragraph');
    expect(json.content?.[1].type).toBe('mathBlock');
    expect(tiptapToDocument(json)).toEqual(document);
    expect(isOpenAnswerDocument(tiptapToDocument(json))).toBe(true);
    expect(serializeOpenAnswerDocument(tiptapToDocument(json))).toEqual(serializeOpenAnswerDocument(document));
  });
  it('does not persist node-view IDs or editor-only attributes', () => {
    expect(tiptapToDocument({type:'doc',content:[{type:'mathBlock',attrs:{id:'editor-only',latex:'a+b'}}]})).toEqual({version:1,nodes:[{type:'paragraph',children:[{type:'math',latex:'a+b'}]}]});
  });
});
