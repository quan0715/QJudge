
import React from 'react';
import Editor, { type EditorProps } from '@monaco-editor/react';
import { useTheme } from '@/ui/theme/ThemeContext';

interface QJudgeEditorProps extends EditorProps {
  // Add any custom props if needed, otherwise generic EditorProps is fine
}

export const QJudgeEditor: React.FC<QJudgeEditorProps> = (props) => {
  const { theme } = useTheme();

  return (
    <div style={{ height: '100%', border: '1px solid var(--cds-border-subtle-01)' }}>
      <Editor
        height="100%"
        theme={theme === 'white' ? 'vs' : 'my-dark'}
        beforeMount={(monaco) => {
            // Define custom theme only if not already defined (Monaco handles overwrite safely though)
            monaco.editor.defineTheme('my-dark', {
            base: 'vs-dark',
            inherit: true,
            rules: [
                { token: 'comment', foreground: '8FC876', fontStyle: 'italic' },
                { token: 'keyword', foreground: 'E685DC', fontStyle: 'bold' },
                { token: 'string', foreground: 'FFB86C' },
                { token: 'number', foreground: 'D1F1A9' },
                { token: 'type', foreground: '5FE7C3' },
                { token: 'function', foreground: 'F9E2AF' },
                { token: 'variable', foreground: 'B4E7FF' },
                { token: 'operator', foreground: 'F5F5F5' },
            ],
            colors: {
                'editor.background': '#0D1117',
                'editor.foreground': '#E6EDF3',
                'editorLineNumber.foreground': '#6E7681',
                'editorLineNumber.activeForeground': '#FFFFFF',
                'editor.selectionBackground': '#3B5270',
                'editor.inactiveSelectionBackground': '#2D3748',
                'editorCursor.foreground': '#58A6FF',
                'editor.lineHighlightBackground': '#161B22',
            }
            });
            props.beforeMount?.(monaco);
        }}
        onMount={(editor, monaco) => {
            monaco.editor.setTheme(theme === 'white' ? 'vs' : 'my-dark');
            
            // Fix layout issues
            setTimeout(() => {
                editor.layout();
            }, 100);
            document.fonts.ready.then(() => {
                editor.layout();
            });
            
            props.onMount?.(editor, monaco);
        }}
        options={{
            minimap: { enabled: false },
            fontSize: 14,
            lineHeight: 20,
            letterSpacing: 0,
            scrollBeyondLastLine: false,
            automaticLayout: true,
            fontLigatures: false,
            fontFamily: "'Menlo', 'Monaco', 'Courier New', monospace",
            fontWeight: '400',
            cursorBlinking: 'smooth',
            cursorSmoothCaretAnimation: 'on',
            smoothScrolling: true,
            padding: { top: 16, bottom: 16 },
            ...props.options
        }}
        {...props}
      />
    </div>
  );
};
