import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { MarkdownEditor } from "./MarkdownEditor";
import {
  MarkdownImageUploadProvider,
  type MarkdownImageUploadHandler,
} from "./MarkdownImageUploadContext";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/shared/ui/theme/ThemeContext", () => ({
  useTheme: () => ({ theme: "white" }),
}));

vi.mock("@/shared/ui/markdown/MarkdownRenderer", () => ({
  default: ({ children }: { children: string }) => <div>{children}</div>,
}));

vi.mock("@monaco-editor/react", () => {
  function MockEditor({
    value,
    onChange,
    onMount,
    beforeMount,
  }: {
    value: string;
    onChange: (value: string) => void;
    onMount: (editor: any, monaco: any) => void;
    beforeMount?: (monaco: any) => void;
  }) {
      const valueRef = React.useRef(value || "");
      const containerRef = React.useRef<HTMLDivElement | null>(null);

      React.useEffect(() => {
        valueRef.current = value || "";
      }, [value]);

      React.useEffect(() => {
        const monaco = {
          Selection: class {
            constructor() {}
          },
          editor: {
            setTheme: () => {},
            defineTheme: () => {},
            remeasureFonts: () => {},
          },
        };
        beforeMount?.(monaco);

        const editor = {
          getSelection: () => ({
            startLineNumber: 1,
            startColumn: valueRef.current.length + 1,
            endLineNumber: 1,
            endColumn: valueRef.current.length + 1,
          }),
          getModel: () => ({
            getValueInRange: () => "",
          }),
          executeEdits: (_source: string, edits: Array<{ text: string }>) => {
            const inserted = edits.map((edit) => edit.text).join("");
            valueRef.current = `${valueRef.current}${inserted}`;
            onChange(valueRef.current);
            return true;
          },
          setSelection: () => {},
          focus: () => {},
          trigger: () => {},
          layout: () => {},
          getDomNode: () => containerRef.current,
          getContentHeight: () => 220,
          onDidContentSizeChange: () => ({ dispose: () => {} }),
        };

        onMount(editor, monaco);
      }, [beforeMount, onChange, onMount]);

    return <div data-testid="monaco-editor-mock" ref={containerRef} />;
  }
  return { default: MockEditor };
});

describe("MarkdownEditor image upload integration", () => {
  beforeAll(() => {
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: {
        ready: Promise.resolve(),
      },
    });
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderEditor = (
    uploadImage: MarkdownImageUploadHandler,
    onChange = vi.fn()
  ) => {
    return {
      onChange,
      ...render(
        <MarkdownImageUploadProvider uploadImage={uploadImage}>
          <MarkdownEditor value="" onChange={onChange} showPreview={false} />
        </MarkdownImageUploadProvider>
      ),
    };
  };

  it("uploads image from toolbar file picker and inserts markdown", async () => {
    const uploadImage = vi.fn().mockResolvedValue({
      url: "http://testserver/api/v1/markdown/images/markdown/2026/03/a.png",
      markdown:
        "![a](http://testserver/api/v1/markdown/images/markdown/2026/03/a.png)",
      contentType: "image/png",
      size: 123,
    });
    const { onChange } = renderEditor(uploadImage);

    fireEvent.click(screen.getByRole("button", { name: "上傳圖片" }));

    const input = document.querySelector(
      ".markdown-editor__image-input"
    ) as HTMLInputElement;
    const imageFile = new File(["content"], "diagram.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [imageFile] } });

    await waitFor(() => {
      expect(uploadImage).toHaveBeenCalledTimes(1);
      expect(uploadImage).toHaveBeenCalledWith(imageFile);
      expect(onChange).toHaveBeenCalledWith(
        expect.stringContaining("![a](http://testserver/api/v1/markdown/images/")
      );
    });
  }, 15000);

  it("uploads image from paste event", async () => {
    const uploadImage = vi.fn().mockResolvedValue({
      url: "http://testserver/api/v1/markdown/images/markdown/2026/03/paste.png",
      markdown:
        "![paste](http://testserver/api/v1/markdown/images/markdown/2026/03/paste.png)",
      contentType: "image/png",
      size: 200,
    });
    renderEditor(uploadImage);
    const editorNode = screen.getByTestId("monaco-editor-mock");

    const imageFile = new File(["clipboard"], "clipboard.png", {
      type: "image/png",
    });
    const pasteEvent = new Event("paste", {
      bubbles: true,
      cancelable: true,
    }) as ClipboardEvent;
    Object.defineProperty(pasteEvent, "clipboardData", {
      value: {
        items: [
          {
            kind: "file",
            getAsFile: () => imageFile,
          },
        ],
      },
    });

    fireEvent(editorNode, pasteEvent);

    await waitFor(() => {
      expect(uploadImage).toHaveBeenCalledWith(imageFile);
    });
  }, 15000);

  it("uploads image from drag and drop", async () => {
    const uploadImage = vi.fn().mockResolvedValue({
      url: "http://testserver/api/v1/markdown/images/markdown/2026/03/drop.png",
      markdown:
        "![drop](http://testserver/api/v1/markdown/images/markdown/2026/03/drop.png)",
      contentType: "image/png",
      size: 321,
    });
    renderEditor(uploadImage);
    const editorNode = screen.getByTestId("monaco-editor-mock");

    const imageFile = new File(["drop"], "drop.png", { type: "image/png" });
    const dropEvent = new Event("drop", {
      bubbles: true,
      cancelable: true,
    }) as DragEvent;
    Object.defineProperty(dropEvent, "dataTransfer", {
      value: { files: [imageFile] },
    });

    fireEvent(editorNode, dropEvent);

    await waitFor(() => {
      expect(uploadImage).toHaveBeenCalledWith(imageFile);
    });
  }, 15000);
});
