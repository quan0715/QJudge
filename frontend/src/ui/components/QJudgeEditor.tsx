import React, { useRef, useCallback, useEffect } from "react";
import Editor, { type EditorProps, type OnMount } from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import { useTheme } from "@/ui/theme/ThemeContext";

interface QJudgeEditorProps extends Omit<EditorProps, "onChange"> {
  onChange?: (value: string) => void;
}

export const QJudgeEditor: React.FC<QJudgeEditorProps> = (props) => {
  const { theme } = useTheme();
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const isInternalChange = useRef(false);

  // Handle external value changes (e.g., language switch, template load)
  useEffect(() => {
    if (editorRef.current && props.value !== undefined) {
      const currentValue = editorRef.current.getValue();
      // Only update if value actually changed from external source
      if (currentValue !== props.value && !isInternalChange.current) {
        const position = editorRef.current.getPosition();
        editorRef.current.setValue(props.value);
        // Restore cursor position if possible
        if (position) {
          editorRef.current.setPosition(position);
        }
      }
    }
    isInternalChange.current = false;
  }, [props.value]);

  const handleMount: OnMount = useCallback(
    (editor, monaco) => {
      editorRef.current = editor;

      monaco.editor.setTheme(theme === "white" ? "vs" : "my-dark");

      // Fix layout issues
      setTimeout(() => {
        editor.layout();
      }, 100);
      document.fonts.ready.then(() => {
        editor.layout();
      });

      // Handle content changes - update parent without causing re-render loop
      editor.onDidChangeModelContent(() => {
        if (props.onChange) {
          isInternalChange.current = true;
          props.onChange(editor.getValue());
        }
      });

      props.onMount?.(editor, monaco);
    },
    [theme, props.onChange, props.onMount]
  );

  return (
    <div
      style={{
        height: "100%",
        border: "1px solid var(--cds-border-subtle-01)",
        // Disable font ligatures at container level as fallback
        fontVariantLigatures: "none",
        fontFeatureSettings: '"liga" 0, "clig" 0, "dlig" 0, "hlig" 0',
      }}
    >
      <Editor
        height="100%"
        theme={theme === "white" ? "vs" : "my-dark"}
        // Use defaultValue instead of value to avoid controlled component issues
        defaultValue={props.value}
        language={props.language}
        beforeMount={(monaco) => {
          // Define custom theme
          monaco.editor.defineTheme("my-dark", {
            base: "vs-dark",
            inherit: true,
            rules: [
              { token: "comment", foreground: "8FC876", fontStyle: "italic" },
              { token: "keyword", foreground: "E685DC", fontStyle: "bold" },
              { token: "string", foreground: "FFB86C" },
              { token: "number", foreground: "D1F1A9" },
              { token: "type", foreground: "5FE7C3" },
              { token: "function", foreground: "F9E2AF" },
              { token: "variable", foreground: "B4E7FF" },
              { token: "operator", foreground: "F5F5F5" },
            ],
            colors: {
              "editor.background": "#0D1117",
              "editor.foreground": "#E6EDF3",
              "editorLineNumber.foreground": "#6E7681",
              "editorLineNumber.activeForeground": "#FFFFFF",
              "editor.selectionBackground": "#3B5270",
              "editor.inactiveSelectionBackground": "#2D3748",
              "editorCursor.foreground": "#58A6FF",
              "editor.lineHighlightBackground": "#161B22",
            },
          });
          props.beforeMount?.(monaco);
        }}
        onMount={handleMount}
        options={{
          minimap: { enabled: false },
          fontSize: 14,
          lineHeight: 20,
          letterSpacing: 0,
          scrollBeyondLastLine: false,
          automaticLayout: true,
          // Completely disable font ligatures to prevent fi, ff, fl etc. from merging
          fontLigatures: false,
          // Use monospace fonts without ligature support
          // Avoid Fira Code, JetBrains Mono, etc. which have ligatures by default
          fontFamily:
            "'SF Mono', 'Consolas', 'Liberation Mono', 'Courier New', monospace",
          fontWeight: "400",
          cursorBlinking: "smooth",
          // Disable smooth caret animation to prevent input lag
          cursorSmoothCaretAnimation: "off",
          smoothScrolling: true,
          padding: { top: 16, bottom: 16 },
          ...props.options,
        }}
      />
    </div>
  );
};
