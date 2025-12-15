import React, { useRef, useCallback, useEffect } from "react";
import Editor, { type EditorProps, type OnMount } from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import { useTheme } from "@/ui/theme/ThemeContext";

interface QJudgeEditorProps extends Omit<EditorProps, "onChange"> {
  onChange?: (value: string) => void;
}

/**
 * QJudgeEditor - Monaco Editor wrapper with IBM Carbon Design styling
 *
 * This component uses UNCONTROLLED mode for optimal typing performance:
 * - Uses `defaultValue` for initial content (set once on mount)
 * - Parent should use `key` prop to force re-mount when content needs to reset
 *   (e.g., language change, template load)
 * - `onChange` callback reports changes but doesn't control the editor
 *
 * Example usage:
 * ```tsx
 * <QJudgeEditor
 *   key={language}  // Force re-mount on language change
 *   value={code}    // Used as defaultValue
 *   language={language}
 *   onChange={(val) => setCode(val)}
 * />
 * ```
 */
export const QJudgeEditor: React.FC<QJudgeEditorProps> = (props) => {
  const { theme } = useTheme();
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);

  // Store onChange in ref to avoid recreating listener when callback changes
  const onChangeRef = useRef(props.onChange);

  // Keep ref in sync with prop
  useEffect(() => {
    onChangeRef.current = props.onChange;
  }, [props.onChange]);

  const handleMount: OnMount = useCallback(
    (editor, monaco) => {
      editorRef.current = editor;

      monaco.editor.setTheme(theme === "white" ? "vs" : "my-dark");

      // Fix layout issues
      setTimeout(() => {
        editor.layout();
      }, 100);

      // Critical: Wait for fonts to load, then remeasure fonts and re-layout
      // This fixes the "fi" ligature bug on first load where Monaco calculates
      // wrong font metrics before the custom font is fully loaded
      document.fonts.ready.then(() => {
        // Force Monaco to remeasure all fonts - this recalculates character widths
        // and fixes rendering issues caused by font loading timing
        monaco.editor.remeasureFonts();
        editor.layout();
      });

      // Also listen for any late font loading (e.g., font loaded after ready event)
      if (typeof document.fonts?.addEventListener === "function") {
        const handleFontLoad = () => {
          monaco.editor.remeasureFonts();
          editor.layout();
        };
        document.fonts.addEventListener("loadingdone", handleFontLoad);
        // Store for cleanup
        (editor as any).__fontLoadHandler = handleFontLoad;
      }

      // Handle content changes - use ref to always get latest callback
      // This prevents memory leaks from multiple listener registrations
      const disposable = editor.onDidChangeModelContent(() => {
        onChangeRef.current?.(editor.getValue());
      });

      // Store disposable for cleanup (though Monaco editor handles this on dispose)
      // This is defensive coding in case the editor instance is reused
      (editor as any).__contentChangeDisposable = disposable;

      props.onMount?.(editor, monaco);
    },
    // Only depend on theme and onMount - onChange is accessed via ref
    [theme, props.onMount]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      const editor = editorRef.current as any;
      if (editor) {
        // Cleanup content change listener
        if (editor.__contentChangeDisposable) {
          editor.__contentChangeDisposable.dispose();
        }
        // Cleanup font load listener
        if (
          editor.__fontLoadHandler &&
          typeof document.fonts?.removeEventListener === "function"
        ) {
          document.fonts.removeEventListener(
            "loadingdone",
            editor.__fontLoadHandler
          );
        }
      }
    };
  }, []);

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
        // UNCONTROLLED MODE: Use defaultValue only
        // Parent should use key prop to force re-mount when value needs to reset
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
          lineHeight: 22,
          letterSpacing: 0.3,
          scrollBeyondLastLine: false,
          automaticLayout: true,
          // Disable font ligatures to prevent fi, ff, fl etc. from merging
          fontLigatures: false,
          // Use JetBrains Mono NL (No Ligatures) as primary font to completely prevent ligatures
          // The NL variant has all ligature glyphs removed at the font level
          // Fallback chain: JetBrains Mono NL -> SF Mono -> Menlo -> Consolas -> monospace
          fontFamily:
            "'JetBrains Mono NL', 'SF Mono', 'Menlo', 'Consolas', monospace",
          fontWeight: "400",
          // Smooth cursor animation for fluid typing experience
          cursorBlinking: "smooth",
          cursorSmoothCaretAnimation: "on",
          cursorWidth: 2,
          cursorStyle: "line",
          // Smooth scrolling
          smoothScrolling: true,
          mouseWheelScrollSensitivity: 1,
          fastScrollSensitivity: 5,
          padding: { top: 16, bottom: 16 },
          // Better rendering
          renderWhitespace: "selection",
          renderLineHighlight: "all",
          bracketPairColorization: { enabled: true },
          ...props.options,
        }}
      />
    </div>
  );
};
