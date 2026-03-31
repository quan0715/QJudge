import React, { useRef, useCallback, useEffect } from "react";
import Editor, { type EditorProps, type OnMount } from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import { useTheme } from "@/shared/ui/theme/ThemeContext";

export interface QJudgeEditorProps extends Omit<EditorProps, "onChange"> {
  onChange?: (value: string) => void;
  className?: string;
  wrapperProps?: React.HTMLAttributes<HTMLDivElement>;
}

export const QJudgeEditor: React.FC<QJudgeEditorProps> = ({
  onChange,
  value,
  language,
  options,
  onMount: onMountProp,
  beforeMount: beforeMountProp,
  className,
  wrapperProps,
  ...restProps
}) => {
  const { theme } = useTheme();
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const onChangeRef = useRef(onChange);
  const disposedRef = useRef(false);
  const layoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const handleMount: OnMount = useCallback(
    (editor, monaco) => {
      editorRef.current = editor;
      disposedRef.current = false;
      monaco.editor.setTheme(theme === "white" ? "vs" : "my-dark");

      layoutTimerRef.current = setTimeout(() => {
        if (!disposedRef.current) editor.layout();
      }, 100);

      document.fonts.ready.then(() => {
        if (disposedRef.current) return;
        monaco.editor.remeasureFonts();
        editor.layout();
      });

      if (typeof document.fonts?.addEventListener === "function") {
        const handleFontLoad = () => {
          if (disposedRef.current) return;
          monaco.editor.remeasureFonts();
          editor.layout();
        };
        document.fonts.addEventListener("loadingdone", handleFontLoad);
        (editor as any).__fontLoadHandler = handleFontLoad;
      }

      const disposable = editor.onDidChangeModelContent(() => {
        onChangeRef.current?.(editor.getValue());
      });
      (editor as any).__contentChangeDisposable = disposable;

      onMountProp?.(editor, monaco);
    },
    [theme, onMountProp]
  );

  useEffect(() => {
    return () => {
      disposedRef.current = true;
      if (layoutTimerRef.current) {
        clearTimeout(layoutTimerRef.current);
        layoutTimerRef.current = null;
      }
      const editor = editorRef.current as any;
      if (editor) {
        try {
          editor.__contentChangeDisposable?.dispose?.();
        } catch {
          // Ignore disposal errors
        }
        if (editor.__fontLoadHandler && typeof document.fonts?.removeEventListener === "function") {
          document.fonts.removeEventListener("loadingdone", editor.__fontLoadHandler);
        }
        // Do NOT call editor.dispose() or setModel(null) — @monaco-editor/react handles disposal
        editorRef.current = null;
      }
    };
  }, []);

  const defaultOptions: Monaco.editor.IStandaloneEditorConstructionOptions = {
    minimap: { enabled: false },
    fontSize: 12,
    lineHeight: 20,
    letterSpacing: 0.3,
    scrollBeyondLastLine: false,
    automaticLayout: true,
    fontLigatures: false,
    fontFamily: "'JetBrains Mono NL', 'SF Mono', 'Menlo', 'Consolas', monospace",
    fontWeight: "400",
    cursorBlinking: "smooth",
    cursorSmoothCaretAnimation: "on",
    cursorWidth: 2,
    cursorStyle: "line",
    smoothScrolling: true,
    mouseWheelScrollSensitivity: 1,
    fastScrollSensitivity: 5,
    padding: { top: 16, bottom: 16 },
    renderWhitespace: "selection",
    renderLineHighlight: "all",
    bracketPairColorization: { enabled: true },
    // Thin scrollbar to match global styles (6px)
    scrollbar: {
      vertical: "auto",
      horizontal: "auto",
      verticalScrollbarSize: 6,
      horizontalScrollbarSize: 6,
      verticalSliderSize: 6,
      horizontalSliderSize: 6,
      useShadows: false,
    },
    overviewRulerLanes: 0, // Hide overview ruler for cleaner look
  };

  return (
    <div
      className={className}
      style={{
        height: "100%",
        fontVariantLigatures: "none",
        fontFeatureSettings: '"liga" 0, "clig" 0, "dlig" 0, "hlig" 0',
      }}
      {...wrapperProps}
    >
      <Editor
        height="100%"
        theme={theme === "white" ? "vs" : "my-dark"}
        defaultValue={value}
        language={language}
        beforeMount={(monaco) => {
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
          beforeMountProp?.(monaco);
        }}
        onMount={handleMount}
        options={{ ...defaultOptions, ...options }}
        {...restProps}
      />
    </div>
  );
};

export default QJudgeEditor;
