import { useState } from "react";
import { Button, TextArea } from "@carbon/react";
import { ChevronDown, ChevronUp, Edit, Reset } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import type { TaskShellInitPrompt } from "./types";
import styles from "./InitPromptEditor.module.scss";

interface InitPromptEditorProps {
  prompt: TaskShellInitPrompt;
}

/**
 * 預設折疊；按 chevron 展開檢視。run 過後外部把 locked 設 true，UI 變 readonly；
 * 按「重新開始」解鎖（onUnlock 回到 editable + reset 成 defaultValue）。
 */
export function InitPromptEditor({ prompt }: InitPromptEditorProps) {
  const { t } = useTranslation("contest");
  const [expanded, setExpanded] = useState(false);

  const summary = prompt.value.trim().split(/\s+/).slice(0, 12).join(" ");

  return (
    <section className={styles.wrap}>
      <button
        type="button"
        className={styles.header}
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <div className={styles.headerLeft}>
          <span className={styles.label}>{t("grading.initPromptLabel", "初始 Prompt")}</span>
          {prompt.locked ? (
            <span className={styles.lockedTag}>{t("grading.initPromptLocked", "已鎖定")}</span>
          ) : null}
        </div>
        <div className={styles.headerRight}>
          {!expanded ? (
            <span className={styles.preview} title={prompt.value}>
              {summary || "—"}
            </span>
          ) : null}
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </button>

      {expanded ? (
        <div className={styles.body}>
          {prompt.locked ? (
            <>
              <pre className={styles.readonly}>{prompt.value}</pre>
              {prompt.onUnlock ? (
                <div className={styles.actionRow}>
                  <Button
                    kind="ghost"
                    size="sm"
                    renderIcon={Reset}
                    onClick={prompt.onUnlock}
                  >
                    {t("grading.initPromptRestart", "重新開始")}
                  </Button>
                </div>
              ) : null}
            </>
          ) : (
            <>
              <TextArea
                id="ai-task-init-prompt"
                labelText=""
                hideLabel
                rows={10}
                value={prompt.value}
                onChange={(e) => prompt.onChange(e.target.value)}
              />
              <div className={styles.actionRow}>
                <Button
                  kind="ghost"
                  size="sm"
                  renderIcon={Edit}
                  onClick={() => prompt.onChange(prompt.defaultValue)}
                >
                  {t("grading.initPromptResetDefault", "還原預設")}
                </Button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}
