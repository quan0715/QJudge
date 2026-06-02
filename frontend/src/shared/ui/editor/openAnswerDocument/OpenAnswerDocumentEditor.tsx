import { Function as FunctionIcon } from "@carbon/icons-react";
import { Button } from "@carbon/react";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor } from "@tiptap/react";
import type { Editor, JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { OpenAnswerDocument } from "@/core/entities/contest.entity";

import {
  createEmptyOpenAnswerDocument,
  normalizeOpenAnswerDocument,
} from "./openAnswerDocument";
import FormulaEditorModal from "./FormulaEditorModal";
import MathInlineExtension, { MATH_INLINE_NAME } from "./MathInlineExtension";
import styles from "./OpenAnswerDocumentEditor.module.scss";

interface OpenAnswerDocumentEditorProps {
  value?: OpenAnswerDocument | null;
  onChange: (value: OpenAnswerDocument) => void;
  onBlur?: () => void;
  readOnly?: boolean;
  ariaLabel?: string;
  placeholder?: string;
  "data-testid"?: string;
}

interface EditorViewLike {
  state: { selection: { from: number } };
  coordsAtPos: (pos: number) => { left: number; bottom: number };
}

function documentToTiptap(document: OpenAnswerDocument): JSONContent {
  const content: JSONContent[] = document.nodes.map((node) => {
    const children: JSONContent[] = [];
    for (const inline of node.children) {
      if (inline.type === "text") {
        if (!inline.text) continue;
        children.push({ type: "text", text: inline.text });
      } else {
        children.push({
          type: MATH_INLINE_NAME,
          attrs: { latex: inline.latex },
        });
      }
    }
    return { type: "paragraph", content: children };
  });
  if (content.length === 0) {
    content.push({ type: "paragraph" });
  }
  return { type: "doc", content };
}

function tiptapToDocument(json: JSONContent): OpenAnswerDocument {
  const document = createEmptyOpenAnswerDocument();
  document.nodes = [];
  const root = json.content ?? [];
  for (const block of root) {
    if (block.type !== "paragraph") continue;
    const children = (block.content ?? [])
      .map((node) => {
        if (node.type === "text" && typeof node.text === "string") {
          return { type: "text" as const, text: node.text };
        }
        if (node.type === MATH_INLINE_NAME) {
          const latex =
            typeof node.attrs?.latex === "string" ? node.attrs.latex : "";
          return { type: "math" as const, latex };
        }
        return null;
      })
      .filter((node): node is { type: "text"; text: string } | { type: "math"; latex: string } => node !== null);
    document.nodes.push({ type: "paragraph", children });
  }
  if (document.nodes.length === 0) {
    document.nodes.push({ type: "paragraph", children: [] });
  }
  return document;
}

export function OpenAnswerDocumentEditor({
  value,
  onChange,
  onBlur,
  readOnly = false,
  ariaLabel = "開放題作答區",
  placeholder = "輸入解題過程，按 fx 或輸入 / 插入公式",
  "data-testid": dataTestId,
}: OpenAnswerDocumentEditorProps) {
  const normalized = useMemo(
    () => normalizeOpenAnswerDocument(value),
    [value],
  );

  const [modalOpen, setModalOpen] = useState(false);
  const [modalInitialLatex, setModalInitialLatex] = useState("");
  const [editingMathPos, setEditingMathPos] = useState<number | null>(null);
  const [popoverPosition, setPopoverPosition] = useState<React.CSSProperties>({
    left: 0,
    top: 0,
  });
  const rootRef = useRef<HTMLDivElement | null>(null);

  const resolvePopoverPosition = useCallback((view: EditorViewLike, pos?: number) => {
    const root = rootRef.current;
    if (!root) return { left: 0, top: 0 };
    const rootRect = root.getBoundingClientRect();
    const resolvedPos = pos ?? view.state.selection.from;
    const coords = view.coordsAtPos(resolvedPos);
    const width = Math.min(544, Math.max(320, rootRect.width - 32));
    const left = Math.max(0, Math.min(coords.left - rootRect.left, rootRect.width - width));
    return {
      left,
      top: coords.bottom - rootRect.top + 8,
      width,
    };
  }, []);

  const openFormulaEditor = useCallback(
    (view: EditorViewLike, initialLatex: string, mathPos: number | null) => {
      setEditingMathPos(mathPos);
      setModalInitialLatex(initialLatex);
      setPopoverPosition(resolvePopoverPosition(view, mathPos ?? undefined));
      setModalOpen(true);
    },
    [resolvePopoverPosition],
  );

  const editor = useEditor({
    editable: !readOnly,
    extensions: [
      StarterKit.configure({
        heading: false,
        bulletList: false,
        orderedList: false,
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
      }),
      Placeholder.configure({ placeholder }),
      MathInlineExtension,
    ],
    content: documentToTiptap(normalized),
    editorProps: {
      attributes: {
        class: styles.editorSurface,
        "aria-label": ariaLabel,
      },
      handleClickOn: (view, _pos, node, nodePos) => {
        if (node.type.name === MATH_INLINE_NAME) {
          openFormulaEditor(view, (node.attrs.latex as string) ?? "", nodePos);
          return true;
        }
        return false;
      },
      handleTextInput: (view, from, to, text) => {
        if (text !== "/" || readOnly) return false;
        const $from = view.state.doc.resolve(from);
        const before = $from.parent.textBetween(0, $from.parentOffset);
        if (before.length === 0 || /\s$/.test(before)) {
          view.dispatch(view.state.tr.delete(from, to));
          openFormulaEditor(view, "", null);
          return true;
        }
        return false;
      },
    },
  });

  useEffect(() => {
    if (!editor) return;
    const handler = () => {
      onChange(tiptapToDocument(editor.getJSON()));
    };
    editor.on("update", handler);
    return () => {
      editor.off("update", handler);
    };
  }, [editor, onChange]);

  useEffect(() => {
    if (!editor) return;
    const currentJson = JSON.stringify(editor.getJSON());
    const nextJson = JSON.stringify(documentToTiptap(normalized));
    if (currentJson !== nextJson) {
      editor.commands.setContent(documentToTiptap(normalized), { emitUpdate: false });
    }
  }, [editor, normalized]);

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!readOnly);
  }, [editor, readOnly]);

  const handleInsertFromToolbar = useCallback(() => {
    if (!editor) return;
    editor.commands.focus();
    openFormulaEditor(editor.view, "", null);
  }, [editor, openFormulaEditor]);

  const handleSubmitFormula = useCallback(
    (latex: string) => {
      if (!editor) return;
      if (editingMathPos !== null) {
        const pos = editingMathPos;
        editor
          .chain()
          .focus()
          .command(({ tr, state }) => {
            const node = state.doc.nodeAt(pos);
            if (!node || node.type.name !== MATH_INLINE_NAME) return false;
            tr.setNodeAttribute(pos, "latex", latex);
            return true;
          })
          .run();
      } else {
        editor.chain().focus().insertMathInline(latex).insertContent(" ").run();
      }
    },
    [editor, editingMathPos],
  );

  const handleRemoveFormula = useCallback(() => {
    if (!editor || editingMathPos === null) return;
    const pos = editingMathPos;
    editor
      .chain()
      .focus()
      .command(({ tr, state }) => {
        const node = state.doc.nodeAt(pos);
        if (!node || node.type.name !== MATH_INLINE_NAME) return false;
        tr.delete(pos, pos + node.nodeSize);
        return true;
      })
      .run();
  }, [editor, editingMathPos]);

  return (
    <div
      ref={rootRef}
      className={styles.root}
      data-testid={dataTestId}
      onBlur={(event) => {
        const nextTarget =
          event.relatedTarget instanceof Node ? event.relatedTarget : null;
        if (!event.currentTarget.contains(nextTarget)) onBlur?.();
      }}
    >
      {!readOnly && (
        <div className={styles.toolbar} aria-label="作答工具列">
          <Button
            kind="ghost"
            size="sm"
            renderIcon={FunctionIcon as never}
            onClick={handleInsertFromToolbar}
          >
            插入公式
          </Button>
        </div>
      )}

      <div className={styles.sheet}>
        <EditorContent editor={editor as Editor} />
      </div>

      <FormulaEditorModal
        open={modalOpen}
        initialLatex={modalInitialLatex}
        onClose={() => setModalOpen(false)}
        onSubmit={handleSubmitFormula}
        onRemove={editingMathPos !== null ? handleRemoveFormula : undefined}
        style={popoverPosition}
      />
    </div>
  );
}

export default OpenAnswerDocumentEditor;
