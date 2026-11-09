import type { ReactNode } from "react";
import { ContentSwitcher, IconButton, Switch, Tag } from "@carbon/react";
import { DocumentDownload, View } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import type { WorkbenchMode } from "./workbenchMode";
import styles from "./WorkbenchRailHeader.module.scss";
export interface WorkbenchRailHeaderProps {
  mode: WorkbenchMode;
  gradeDisabled: boolean;
  editOnly?: boolean;
  onModeChange(mode: WorkbenchMode): void;
  onPreview?: () => void;
  onExport?: () => void;
  children?: ReactNode;
}
export function WorkbenchRailHeader({
  mode,
  gradeDisabled,
  editOnly = false,
  onModeChange,
  onPreview,
  onExport,
  children,
}: WorkbenchRailHeaderProps) {
  const { t } = useTranslation("contest");
  return (
    <div className={styles.header}>
      <div className={styles.title}>
        <h2>{t("workbench.edit.title", "工作台")}</h2>
        <Tag type="purple" size="sm">
          Beta
        </Tag>
        {editOnly && <Tag type="gray" size="sm">{t("workbench.edit.modeEdit", "編輯")}</Tag>}
        {onExport && (
          <IconButton kind="ghost" size="sm" label={t("adminLayout.header.exportFiles", "匯出")} onClick={onExport}>
            <DocumentDownload />
          </IconButton>
        )}
        {onPreview && (
          <IconButton
            kind="ghost"
            size="sm"
            label={t("workbench.edit.preview", "預覽學生畫面")}
            onClick={onPreview}
          >
            <View />
          </IconButton>
        )}
      </div>
      {!editOnly && <ContentSwitcher
        size="sm"
        selectedIndex={mode === "edit" ? 0 : 1}
        onChange={({ index }) => onModeChange(index === 0 ? "edit" : "grade")}
      >
        <Switch name="edit" text={t("workbench.edit.modeEdit", "編輯")} />
        <Switch
          name="grade"
          text={t("workbench.edit.modeGrade", "批改")}
          disabled={gradeDisabled}
          title={
            gradeDisabled
              ? t("workbench.edit.gradeDisabled", "考試開始後才能批改")
              : undefined
          }
        />
      </ContentSwitcher>}
      {children}
    </div>
  );
}
