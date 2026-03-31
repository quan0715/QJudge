import React from "react";
import { IconButton } from "@carbon/react";
import {
  TextBold,
  TextItalic,
  TextStrikethrough,
  Code,
  ListBulleted,
  ListNumbered,
  Quotes,
  Link,
  Image,
} from "@carbon/icons-react";
import "./MarkdownEditor.scss";

interface ToolbarAction {
  id: string;
  icon: React.ComponentType<{ size?: number }>;
  label: string;
  markdown?: string;
  wrapSelection?: boolean;
  action?: "undo" | "redo";
}

const TOOLBAR_GROUPS: ToolbarAction[][] = [
  // Formatting
  [
    { id: "bold", icon: TextBold, label: "粗體", markdown: "**", wrapSelection: true },
    { id: "italic", icon: TextItalic, label: "斜體", markdown: "*", wrapSelection: true },
    { id: "code", icon: Code, label: "行內程式碼", markdown: "`", wrapSelection: true },
    { id: "strike", icon: TextStrikethrough, label: "刪除線", markdown: "~~", wrapSelection: true },
    { id: "link", icon: Link, label: "插入連結", markdown: "[文字](url)" },
  ],
  // Paragraph
  [
    { id: "bullet-list", icon: ListBulleted, label: "項目符號清單", markdown: "- " },
    { id: "number-list", icon: ListNumbered, label: "編號清單", markdown: "1. " },
    { id: "quote", icon: Quotes, label: "引用", markdown: "> " },
  ],
  // Attachment & code block
  [
    { id: "code-block", icon: Code, label: "程式碼區塊", markdown: "```\n" },
    { id: "image", icon: Image, label: "插入圖片", markdown: "![描述](url)" },
  ],
];

interface MarkdownToolbarProps {
  onAction: (action: ToolbarAction) => void;
  disabled?: boolean;
  disableImage?: boolean;
  imageLabel?: string;
}

/**
 * Toolbar following Carbon Text Toolbar Pattern.
 * Groups: Actions | Formatting | Paragraph | Attachment
 */
export const MarkdownToolbar: React.FC<MarkdownToolbarProps> = ({
  onAction,
  disabled = false,
  disableImage = false,
  imageLabel = "插入圖片",
}) => {
  return (
    <div className="markdown-toolbar">
      {TOOLBAR_GROUPS.map((group, groupIndex) => (
        <div key={groupIndex} className="markdown-toolbar__group">
          {group.map((item) => {
            const label = item.id === "image" ? imageLabel : item.label;
            return (
              <IconButton
                key={item.id}
                kind="ghost"
                size="sm"
                label={label}
                align="bottom"
                autoAlign
                onClick={() => onAction(item)}
                disabled={disabled || (item.id === "image" ? disableImage : false)}
              >
                <item.icon size={16} />
              </IconButton>
            );
          })}
          {groupIndex < TOOLBAR_GROUPS.length - 1 && (
            <div className="markdown-toolbar__divider" />
          )}
        </div>
      ))}
    </div>
  );
};

export type { ToolbarAction };
