import React from "react";
import { IconButton, Tooltip } from "@carbon/react";
import {
  Undo,
  Redo,
  TextBold,
  TextItalic,
  TextStrikethrough,
  Code,
  ListBulleted,
  ListNumbered,
  Quotes,
  Link,
  Image,
  View,
  ViewOff,
} from "@carbon/icons-react";
import "./MarkdownEditor.scss";

interface ToolbarAction {
  id: string;
  icon: React.ComponentType<{ size?: number }>;
  label: string;
  markdown?: string;
  wrapSelection?: boolean;
  action?: "undo" | "redo" | "togglePreview";
}

const TOOLBAR_GROUPS: ToolbarAction[][] = [
  // Actions
  [
    { id: "undo", icon: Undo, label: "復原", action: "undo" },
    { id: "redo", icon: Redo, label: "重做", action: "redo" },
  ],
  // Formatting
  [
    { id: "bold", icon: TextBold, label: "粗體", markdown: "**", wrapSelection: true },
    { id: "italic", icon: TextItalic, label: "斜體", markdown: "*", wrapSelection: true },
    { id: "strike", icon: TextStrikethrough, label: "刪除線", markdown: "~~", wrapSelection: true },
    { id: "code", icon: Code, label: "行內程式碼", markdown: "`", wrapSelection: true },
  ],
  // Paragraph
  [
    { id: "bullet-list", icon: ListBulleted, label: "項目符號清單", markdown: "- " },
    { id: "number-list", icon: ListNumbered, label: "編號清單", markdown: "1. " },
    { id: "quote", icon: Quotes, label: "引用", markdown: "> " },
    { id: "code-block", icon: Code, label: "程式碼區塊", markdown: "```\n" },
  ],
  // Attachment
  [
    { id: "link", icon: Link, label: "插入連結", markdown: "[文字](url)" },
    { id: "image", icon: Image, label: "插入圖片", markdown: "![描述](url)" },
  ],
];

interface MarkdownToolbarProps {
  onAction: (action: ToolbarAction) => void;
  showPreview: boolean;
  onTogglePreview: () => void;
}

/**
 * Toolbar following Carbon Text Toolbar Pattern.
 * Groups: Actions | Formatting | Paragraph | Attachment | Preview
 */
export const MarkdownToolbar: React.FC<MarkdownToolbarProps> = ({
  onAction,
  showPreview,
  onTogglePreview,
}) => {
  return (
    <div className="markdown-toolbar">
      {TOOLBAR_GROUPS.map((group, groupIndex) => (
        <div key={groupIndex} className="markdown-toolbar__group">
          {group.map((item) => (
            <Tooltip key={item.id} label={item.label} align="bottom">
              <IconButton
                kind="ghost"
                size="sm"
                label={item.label}
                onClick={() => onAction(item)}
              >
                <item.icon size={16} />
              </IconButton>
            </Tooltip>
          ))}
          {groupIndex < TOOLBAR_GROUPS.length - 1 && (
            <div className="markdown-toolbar__divider" />
          )}
        </div>
      ))}
      
      {/* Preview toggle */}
      <div className="markdown-toolbar__group markdown-toolbar__group--right">
        <Tooltip label={showPreview ? "隱藏預覽" : "顯示預覽"} align="bottom">
          <IconButton
            kind={showPreview ? "primary" : "ghost"}
            size="sm"
            label="切換預覽"
            onClick={onTogglePreview}
          >
            {showPreview ? <ViewOff size={16} /> : <View size={16} />}
          </IconButton>
        </Tooltip>
      </div>
    </div>
  );
};

export type { ToolbarAction };
