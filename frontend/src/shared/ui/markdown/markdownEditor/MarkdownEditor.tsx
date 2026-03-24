import React, { useRef, useState, useCallback, useEffect } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import { Tabs, TabList, Tab } from "@carbon/react";
import { useTheme } from "@/shared/ui/theme/ThemeContext";
import { MarkdownToolbar, type ToolbarAction } from "./MarkdownToolbar";
import MarkdownRenderer from "@/shared/ui/markdown/MarkdownRenderer";
import { useMarkdownImageUpload } from "./MarkdownImageUploadContext";
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
  /** Enable preview tab */
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
 * - Modal mode (default): Used inside a modal dialog
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
  const uploadImage = useMarkdownImageUpload();
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof Monaco | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const imageFileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedTab, setSelectedTab] = useState(0);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);
  const [isDragOverImage, setIsDragOverImage] = useState(false);
  const supportsPreview = initialShowPreview;

  useEffect(() => {
    if (!supportsPreview && selectedTab !== 0) {
      setSelectedTab(0);
    }
  }, [selectedTab, supportsPreview]);

  const handleMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Configure markdown language
    monaco.editor.setTheme(theme === "white" ? "vs" : "markdown-dark");

    // Layout fix
    setTimeout(() => editor.layout(), 100);

    // Font loading handling
    if (document.fonts && "ready" in document.fonts) {
      document.fonts.ready.then(() => {
        monaco.editor.remeasureFonts();
        editor.layout();
      });
    }
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

  const isImageFile = useCallback((file: File): boolean => {
    return file.type.startsWith("image/");
  }, []);

  const uploadAndInsertImage = useCallback(
    async (file: File) => {
      if (!uploadImage || !isImageFile(file)) return;

      setImageUploadError(null);
      setIsUploadingImage(true);
      try {
        const result = await uploadImage(file);
        insertText(result.markdown);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "圖片上傳失敗";
        setImageUploadError(message);
      } finally {
        setIsUploadingImage(false);
      }
    },
    [insertText, isImageFile, uploadImage]
  );

  const uploadAndInsertManyImages = useCallback(
    async (files: File[]) => {
      const imageFiles = files.filter((file) => isImageFile(file));
      if (!uploadImage || imageFiles.length === 0) return;
      for (const imageFile of imageFiles) {
        // Keep order deterministic when multiple images are dropped/pasted.
        await uploadAndInsertImage(imageFile);
      }
    },
    [isImageFile, uploadAndInsertImage, uploadImage]
  );

  // Handle toolbar actions
  const handleToolbarAction = useCallback(
    (action: ToolbarAction) => {
      const editor = editorRef.current;
      if (!editor) return;

      if (action.id === "image" && uploadImage) {
        imageFileInputRef.current?.click();
        return;
      }

      if (action.markdown) {
        insertText(action.markdown, action.wrapSelection);
      }
    },
    [insertText, uploadImage]
  );

  const handleImageFileInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files || []);
      if (files.length > 0) {
        void uploadAndInsertManyImages(files);
      }
      // Allow selecting the same file twice
      event.target.value = "";
    },
    [uploadAndInsertManyImages]
  );

  // Paste handler — scoped to Monaco DOM so it only fires when the editor is focused.
  useEffect(() => {
    const domNode = editorRef.current?.getDomNode();
    if (!domNode || !uploadImage) return;

    const handlePaste = (event: ClipboardEvent) => {
      const items = Array.from(event.clipboardData?.items || []);
      const files = items
        .filter((item) => item.kind === "file")
        .map((item) => item.getAsFile())
        .filter((file): file is File => Boolean(file));
      const imageFiles = files.filter((file) => isImageFile(file));
      if (imageFiles.length === 0) return;
      event.preventDefault();
      void uploadAndInsertManyImages(imageFiles);
    };

    domNode.addEventListener("paste", handlePaste);
    return () => {
      domNode.removeEventListener("paste", handlePaste);
    };
  }, [isImageFile, uploadAndInsertManyImages, uploadImage]);

  // Drag-and-drop handler — scoped to the entire editor container so dropping
  // anywhere on the component (toolbar, status bar, editor) works and the
  // browser never navigates to the dropped file.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !uploadImage) return;

    const handleDragOver = (event: DragEvent) => {
      if (!event.dataTransfer?.types.includes("Files")) return;
      event.preventDefault();
      setIsDragOverImage(true);
    };

    const handleDragLeave = (event: DragEvent) => {
      // Only reset when leaving the container, not when entering a child.
      if (container.contains(event.relatedTarget as Node)) return;
      setIsDragOverImage(false);
    };

    const handleDrop = (event: DragEvent) => {
      // Always prevent the browser from opening the file.
      event.preventDefault();
      setIsDragOverImage(false);

      const files = Array.from(event.dataTransfer?.files || []);
      const imageFiles = files.filter((file) => isImageFile(file));
      if (imageFiles.length === 0) return;
      void uploadAndInsertManyImages(imageFiles);
    };

    container.addEventListener("dragover", handleDragOver);
    container.addEventListener("dragleave", handleDragLeave);
    container.addEventListener("drop", handleDrop);

    return () => {
      container.removeEventListener("dragover", handleDragOver);
      container.removeEventListener("dragleave", handleDragLeave);
      container.removeEventListener("drop", handleDrop);
      setIsDragOverImage(false);
    };
  }, [isImageFile, uploadAndInsertManyImages, uploadImage]);

  const containerClassName = [
    "markdown-editor",
    inline ? "markdown-editor--inline" : "",
    isDragOverImage ? "markdown-editor--dragover" : "",
  ].filter(Boolean).join(" ");
  const isEditTabActive = !supportsPreview || selectedTab === 0;

  const editorContent = (
    <div className="markdown-editor__editor">
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
  );

  const previewContent = (
    <div className="markdown-editor__preview">
      <div className="markdown-editor__preview-content">
        <MarkdownRenderer enableMath enableHighlight>
          {value || "*尚無內容*"}
        </MarkdownRenderer>
      </div>
    </div>
  );

  const toolbarNode =
    showToolbar ? (
      <MarkdownToolbar
        onAction={handleToolbarAction}
        disabled={supportsPreview && !isEditTabActive}
        disableImage={Boolean(uploadImage && isUploadingImage)}
        imageLabel={
          uploadImage
            ? (isUploadingImage ? "圖片上傳中..." : "上傳圖片")
            : "插入圖片"
        }
      />
    ) : null;

  return (
    <div
      ref={containerRef}
      className={containerClassName}
      style={{ minHeight, height }}
    >
      <input
        ref={imageFileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
        multiple
        className="markdown-editor__image-input"
        onChange={handleImageFileInputChange}
      />
      {supportsPreview ? (
        <div className="markdown-editor__topbar">
          <div className="markdown-editor__tabs-nav">
            <Tabs
              selectedIndex={selectedTab}
              onChange={({ selectedIndex: nextIndex }) => setSelectedTab(nextIndex)}
            >
              <TabList aria-label="Markdown editor tabs">
                <Tab>Edit</Tab>
                <Tab>Preview</Tab>
              </TabList>
            </Tabs>
          </div>
          {toolbarNode && (
            <div className="markdown-editor__topbar-toolbar">{toolbarNode}</div>
          )}
        </div>
      ) : (
        toolbarNode
      )}

      {(isUploadingImage || imageUploadError) && (
        <div className="markdown-editor__status">
          {isUploadingImage && (
            <span className="markdown-editor__status-text">圖片上傳中...</span>
          )}
          {imageUploadError && (
            <span className="markdown-editor__status-error">{imageUploadError}</span>
          )}
        </div>
      )}

      <div className="markdown-editor__content">
        {supportsPreview
          ? (selectedTab === 0 ? editorContent : previewContent)
          : editorContent}
      </div>
    </div>
  );
};
