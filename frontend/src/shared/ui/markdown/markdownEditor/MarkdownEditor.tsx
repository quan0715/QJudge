import React, { useRef, useState, useCallback, useEffect } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import { useTheme } from "@/shared/ui/theme/ThemeContext";
import { MarkdownToolbar, type ToolbarAction } from "./MarkdownToolbar";
import MarkdownRenderer from "@/shared/ui/markdown/MarkdownRenderer";
import "./MarkdownEditor.scss";

export interface MarkdownEditorProps {
  /** Current value */
  value: string;
  /** Change handler */
  onChange: (value: string) => void;
  /** Minimum height (default: 300px) */
  minHeight?: string;
  /** Fixed height */
  height?: string;
  /** Show preview panel */
  showPreview?: boolean;
  /** Show toolbar */
  showToolbar?: boolean;
  /** Inline mode - editor fills available space instead of modal */
  inline?: boolean;
}

/**
 * Markdown Editor with Monaco, toolbar, and live preview.
 * Follows Carbon Design System styling.
 * 
 * Supports two modes:
 * - Modal mode (default): Used inside GlobalMarkdownEditorModal
 * - Inline mode: Fills available container height, suitable for embedding
 */
export const MarkdownEditor: React.FC<MarkdownEditorProps> = ({
  value,
  onChange,
  minHeight = "300px",
  height,
  showPreview: initialShowPreview = true,
  showToolbar = true,
  inline = false,
}) => {
  const { theme } = useTheme();
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof Monaco | null>(null);
  const [showPreview, setShowPreview] = useState(initialShowPreview);

  // Store current value in ref for toolbar actions
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const handleMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Configure markdown language
    monaco.editor.setTheme(theme === "white" ? "vs" : "markdown-dark");

    // Layout fix
    setTimeout(() => editor.layout(), 100);

    // Font loading handling
    document.fonts.ready.then(() => {
      monaco.editor.remeasureFonts();
      editor.layout();
    });
  }, [theme]);

  // Sync theme when toggled after mount
  useEffect(() => {
    if (!monacoRef.current) return;
    monacoRef.current.editor.setTheme(theme === "white" ? "vs" : "markdown-dark");
  }, [theme]);

  const handleChange = useCallback((newValue: string | undefined) => {
    onChange(newValue ?? "");
  }, [onChange]);

  // Insert text at cursor position
  const insertText = useCallback((text: string, wrapSelection?: boolean) => {
    const editor = editorRef.current;
    if (!editor) return;

    const selection = editor.getSelection();
    const model = editor.getModel();
    if (!selection || !model) return;

    const selectedText = model.getValueInRange(selection);

    let newText: string;
    let newSelection: Monaco.Selection | null = null;

    if (wrapSelection && selectedText) {
      // Wrap selected text
      newText = `${text}${selectedText}${text}`;
    } else if (wrapSelection) {
      // Insert placeholder
      newText = `${text}文字${text}`;
      // Select the placeholder
      const offset = selection.startColumn + text.length;
      newSelection = new (monacoRef.current!.Selection)(
        selection.startLineNumber,
        offset,
        selection.startLineNumber,
        offset + 2
      );
    } else {
      newText = text;
    }

    editor.executeEdits("markdown-toolbar", [
      {
        range: selection,
        text: newText,
        forceMoveMarkers: true,
      },
    ]);

    if (newSelection) {
      editor.setSelection(newSelection);
    }

    editor.focus();
  }, []);

  // Handle toolbar actions
  const handleToolbarAction = useCallback((action: ToolbarAction) => {
    const editor = editorRef.current;
    if (!editor) return;

    switch (action.action) {
      case "undo":
        editor.trigger("keyboard", "undo", null);
        break;
      case "redo":
        editor.trigger("keyboard", "redo", null);
        break;
      default:
        if (action.markdown) {
          insertText(action.markdown, action.wrapSelection);
        }
    }
  }, [insertText]);

  const togglePreview = useCallback(() => {
    setShowPreview((prev) => !prev);
  }, []);

  const containerClassName = inline 
    ? "markdown-editor markdown-editor--inline" 
    : "markdown-editor";

  return (
    <div 
      className={containerClassName}
      style={{ minHeight, height }}
    >
      {showToolbar && (
        <MarkdownToolbar
          onAction={handleToolbarAction}
          showPreview={showPreview}
          onTogglePreview={togglePreview}
        />
      )}

      <div className="markdown-editor__content">
        <div className={`markdown-editor__editor ${showPreview ? "markdown-editor__editor--with-preview" : ""}`}>
          <Editor
            height="100%"
            theme={theme === "white" ? "vs" : "vs-dark"}
            language="markdown"
            value={value}
            onChange={handleChange}
            beforeMount={(monaco) => {
              // Define dark theme
              monaco.editor.defineTheme("markdown-dark", {
                base: "vs-dark",
                inherit: true,
                rules: [
                  { token: "keyword", foreground: "569CD6" },
                  { token: "string.link", foreground: "4EC9B0" },
                ],
                colors: {
                  "editor.background": "#161616",
                  "editor.foreground": "#E0E0E0",
                },
              });
            }}
            onMount={handleMount}
            options={{
              minimap: { enabled: false },
              fontSize: 14,
              lineHeight: 22,
              wordWrap: "on",
              scrollBeyondLastLine: false,
              automaticLayout: true,
              fontLigatures: false,
              fontFamily: "'IBM Plex Mono', 'JetBrains Mono NL', monospace",
              padding: { top: 16, bottom: 16 },
              lineNumbers: "off",
              folding: false,
              glyphMargin: false,
              lineDecorationsWidth: 16,
              renderLineHighlight: "none",
            }}
          />
        </div>

        {showPreview && (
          <div className="markdown-editor__preview">
            <div className="markdown-editor__preview-header">預覽</div>
            <div className="markdown-editor__preview-content">
              <MarkdownRenderer enableMath enableHighlight>
                {value || "*尚無內容*"}
              </MarkdownRenderer>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
