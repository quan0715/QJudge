import { useState } from "react";
import { Button, Tooltip } from "@carbon/react";
import { Settings, FitToScreen } from "@carbon/icons-react";
import { QJudgeEditor } from "@/shared/ui/editor/QJudgeEditor";
import { EditorSettingsModal } from "@/shared/ui/editor/EditorSettingsModal";
import { LanguageSelector } from "./LanguageSelector";
import { LANGUAGE_OPTIONS } from "@/core/config/language.config";
import type { EditorSettings } from "@/shared/ui/editor/EditorSettingsModal";
import "./EditorContent.scss";

interface EditorContentProps {
  /** Current code content */
  code: string;
  /** Current language */
  language: string;
  /** Callback when code changes */
  onCodeChange: (code: string) => void;
  /** Callback when language changes */
  onLanguageChange: (lang: string) => void;
  /** Editor font size */
  fontSize?: number;
  /** Editor tab size */
  tabSize?: 2 | 4;
  /** Callback when editor settings change */
  onEditorSettingsChange?: (settings: Partial<EditorSettings>) => void;
  /** Callback to collapse all panels (maximize editor space) */
  onCollapseAll?: () => void;
}

export const EditorContent: React.FC<EditorContentProps> = ({
  code,
  language,
  onCodeChange,
  onLanguageChange,
  fontSize = 12,
  tabSize = 4,
  onEditorSettingsChange,
  onCollapseAll,
}) => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const handleSettingsChange = (settings: Partial<EditorSettings>) => {
    onEditorSettingsChange?.(settings);
  };

  return (
    <div className="editor-content">
      {/* Editor Toolbar - 48px */}
      <div className="editor-content__toolbar">
        <div className="editor-content__toolbar-left">
          <LanguageSelector
            languages={LANGUAGE_OPTIONS}
            selectedLanguage={language}
            onLanguageChange={onLanguageChange}
          />
        </div>
        <div className="editor-content__toolbar-right">
          {/* Settings Button */}
          <Tooltip label="編輯器設定" align="bottom">
            <Button
              kind="ghost"
              hasIconOnly
              renderIcon={Settings}
              iconDescription="編輯器設定"
              onClick={() => setIsSettingsOpen(true)}
            />
          </Tooltip>

          {/* Collapse All Button - maximize editor space */}
          {onCollapseAll && (
            <Tooltip label="收合所有面板" align="bottom">
              <Button
                kind="ghost"
                hasIconOnly
                renderIcon={FitToScreen}
                iconDescription="收合所有面板"
                onClick={onCollapseAll}
              />
            </Tooltip>
          )}
        </div>
      </div>

      {/* Monaco Editor */}
      <div className="editor-content__editor">
        <QJudgeEditor
          value={code}
          language={language}
          onChange={(value) => onCodeChange(value || "")}
          options={{
            fontSize,
            tabSize,
          }}
        />
      </div>

      {/* Settings Modal */}
      <EditorSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={{ fontSize, tabSize }}
        onSettingsChange={handleSettingsChange}
      />
    </div>
  );
};

export default EditorContent;
