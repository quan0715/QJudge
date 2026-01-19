import React, {
  createContext,
  useContext,
  useState,
  useCallback,
} from "react";
import type { ReactNode } from "react";

interface EditorConfig {
  fieldId: string;
  labelText: string;
  value: string;
  onChange: (value: string) => void;
}

interface MarkdownEditorContextValue {
  /** Open the editor modal with field config */
  openEditor: (config: EditorConfig) => void;
  /** Close the editor modal */
  closeEditor: () => void;
  /** Current field being edited */
  activeConfig: EditorConfig | null;
  /** Whether the modal is open */
  isOpen: boolean;
}

const MarkdownEditorContext = createContext<MarkdownEditorContextValue | null>(
  null
);

interface MarkdownEditorProviderProps {
  children: ReactNode;
}

/**
 * Provider for global markdown editor state.
 * Allows multiple fields to share a single editor modal instance.
 */
export const MarkdownEditorProvider: React.FC<MarkdownEditorProviderProps> = ({
  children,
}) => {
  const [activeConfig, setActiveConfig] = useState<EditorConfig | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const openEditor = useCallback((config: EditorConfig) => {
    setActiveConfig(config);
    setIsOpen(true);
  }, []);

  const closeEditor = useCallback(() => {
    setIsOpen(false);
    // Delay clearing config to allow for close animation
    setTimeout(() => setActiveConfig(null), 200);
  }, []);

  return (
    <MarkdownEditorContext.Provider
      value={{ openEditor, closeEditor, activeConfig, isOpen }}
    >
      {children}
    </MarkdownEditorContext.Provider>
  );
};

/**
 * Hook to access the markdown editor context.
 * Must be used within a MarkdownEditorProvider.
 */
export const useMarkdownEditor = (): MarkdownEditorContextValue => {
  const context = useContext(MarkdownEditorContext);
  if (!context) {
    throw new Error(
      "useMarkdownEditor must be used within a MarkdownEditorProvider"
    );
  }
  return context;
};
