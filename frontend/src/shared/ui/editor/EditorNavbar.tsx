import React from "react";
import {
  Header,
  HeaderName,
  HeaderGlobalBar,
  HeaderGlobalAction,
  Button,
  Tag,
} from "@carbon/react";
import {
  ArrowLeft,
  SidePanelOpen,
  SidePanelClose,
  Save,
  View,
} from "@carbon/icons-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import "./EditorNavbar.scss";

interface EditorNavbarProps {
  /** Title to display */
  title: string;
  /** Back link destination */
  backTo?: string;
  /** Student view link (e.g., /labs/:labId) */
  studentViewLink?: string;
  /** Is left panel collapsed */
  leftCollapsed?: boolean;
  /** Toggle left panel */
  onToggleLeft?: () => void;
  /** Is right panel collapsed */
  rightCollapsed?: boolean;
  /** Toggle right panel */
  onToggleRight?: () => void;
  /** Save callback */
  onSave?: () => void;
  /** Is saving in progress */
  isSaving?: boolean;
  /** Is published */
  isPublished?: boolean;
  /** Has unsaved changes */
  hasChanges?: boolean;
  /** User menu slot - passed from features layer to maintain architecture boundaries */
  userMenu?: React.ReactNode;
}

/**
 * Reusable editor navbar with panel toggles, user avatar, and student view link.
 */
export const EditorNavbar: React.FC<EditorNavbarProps> = ({
  title,
  backTo = "/teacher",
  studentViewLink,
  leftCollapsed = false,
  onToggleLeft,
  rightCollapsed = false,
  onToggleRight,
  onSave,
  isSaving = false,
  isPublished = false,
  hasChanges = false,
  userMenu,
}) => {
  const navigate = useNavigate();
  const { t } = useTranslation("lab");

  return (
    <Header aria-label="Editor" className="editor-navbar">
      {/* Back Button */}
      <HeaderGlobalAction
        aria-label={t("button.back")}
        onClick={() => navigate(backTo)}
        className="editor-navbar__back"
      >
        <ArrowLeft size={20} />
      </HeaderGlobalAction>

      {/* Toggle Left Panel */}
      {onToggleLeft && (
        <HeaderGlobalAction
          aria-label={leftCollapsed ? "顯示選單" : "隱藏選單"}
          onClick={onToggleLeft}
          isActive={!leftCollapsed}
        >
          {leftCollapsed ? (
            <SidePanelOpen size={20} />
          ) : (
            <SidePanelClose size={20} />
          )}
        </HeaderGlobalAction>
      )}

      {/* Title */}
      <HeaderName prefix="" className="editor-navbar__title">
        {title}
      </HeaderName>

      {/* Status Tags */}
      <div className="editor-navbar__status">
        {hasChanges && (
          <Tag type="gray" size="sm">
            未儲存
          </Tag>
        )}
        {isPublished && (
          <Tag type="green" size="sm">
            已發布
          </Tag>
        )}
      </div>

      <HeaderGlobalBar>
        {/* Toggle Right Panel */}
        {onToggleRight && (
          <HeaderGlobalAction
            aria-label={rightCollapsed ? "顯示預覽" : "隱藏預覽"}
            onClick={onToggleRight}
            isActive={!rightCollapsed}
            tooltipAlignment="end"
          >
            <span style={{ display: "inline-flex", transform: "scaleX(-1)" }}>
              {rightCollapsed ? (
                <SidePanelOpen size={20} />
              ) : (
                <SidePanelClose size={20} />
              )}
            </span>
          </HeaderGlobalAction>
        )}

        {/* View as Student */}
        {studentViewLink && (
          <HeaderGlobalAction
            aria-label="學生檢視"
            onClick={() => window.open(studentViewLink, "_blank", "noopener,noreferrer")}
            tooltipAlignment="end"
          >
            <View size={20} />
          </HeaderGlobalAction>
        )}

        {/* Save Button */}
        {onSave && (
          <Button
            kind="ghost"
            size="sm"
            renderIcon={Save}
            onClick={onSave}
            disabled={isSaving || !hasChanges}
            className="editor-navbar__action"
          >
            {isSaving ? t("button.saving") : t("button.save")}
          </Button>
        )}

        {/* User Menu Slot */}
        {userMenu}
      </HeaderGlobalBar>
    </Header>
  );
};

export default EditorNavbar;
