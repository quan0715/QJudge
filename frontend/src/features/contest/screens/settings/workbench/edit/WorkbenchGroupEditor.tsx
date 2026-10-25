import { paperQuestionPoints } from "@/features/contest/domain/scorePolicyChoice";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Button, InlineNotification, TextInput } from "@carbon/react";
import { ChevronDown, ChevronUp } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import type { ExamPaperBlock } from "@/core/entities/contest.entity";
import type { ToolbarSaveStatus } from "@/features/contest/components/admin/examEditor/hooks/useToolbarSaveStatus";
import { GlobalSaveStatus } from "@/shared/ui/autoSave";
import { MarkdownField } from "@/shared/ui/markdown/markdownEditor";
import MarkdownRenderer from "@/shared/ui/markdown/MarkdownRenderer";
import { WorkbenchAddMenu } from "./WorkbenchAddMenu";
import { WorkbenchQuestionEditor } from "./WorkbenchQuestionEditor";
import type { WorkbenchEditActions } from "./WorkbenchEditScreen";
import type { QuestionAnswerSummary } from "./questionAnswerSummary";
import styles from "./WorkbenchEdit.module.scss";
export interface QuestionEditAnswerData {
  summary: QuestionAnswerSummary;
  counts: { total: number; graded: number };
}
export interface WorkbenchGroupEditorProps {
  block: Extract<ExamPaperBlock, { kind: "group" }>;
  label: string;
  childLabels: Map<string, string>;
  locked: boolean;
  expandedChildId: string | null;
  onExpandChild(id: string | null): void;
  actions: WorkbenchEditActions;
  saveStatus: ToolbarSaveStatus;
  registerFlush?: (flush: (() => Promise<void>) | null) => void;
  answerData?: Map<string, QuestionEditAnswerData>;
  impactError?: boolean;
  onRetryImpact?: () => void;
  onGradeQuestion?: (id: string) => void;
  onOpenScorePolicy?: (id: string) => void;
}
export function WorkbenchGroupEditor({
  block,
  label,
  childLabels,
  locked,
  expandedChildId,
  onExpandChild,
  actions,
  saveStatus,
  registerFlush,
  answerData,
  impactError,
  onRetryImpact,
  onGradeQuestion,
  onOpenScorePolicy,
}: WorkbenchGroupEditorProps) {
  const { t } = useTranslation("contest");
  const [form, setForm] = useState(() => ({
    title: block.group.title,
    stem: block.group.sharedStemMarkdown,
  }));
  const [saved, setSaved] = useState(form);
  const latest = useRef({ form, saved, locked, actions, id: block.id });
  useLayoutEffect(() => {
    latest.current = { form, saved, locked, actions, id: block.id };
  });
  const pending = useRef<Promise<void> | null>(null);
  const childFlush = useRef<(() => Promise<void>) | null>(null);
  const registerChildFlush = useCallback(
    (flush: (() => Promise<void>) | null) => {
      childFlush.current = flush;
    },
    [],
  );
  const flush = useCallback(async () => {
    if (pending.current) await pending.current;
    const current = latest.current;
    if (current.locked) return;
    const changes: { title?: string; shared_stem_markdown?: string } = {};
    if (current.form.title !== current.saved.title)
      changes.title = current.form.title;
    if (current.form.stem !== current.saved.stem)
      changes.shared_stem_markdown = current.form.stem;
    if (Object.keys(changes).length === 0) return;
    const operation = current.actions
      .saveGroup(current.id, changes)
      .then(() => {
        latest.current = { ...latest.current, saved: current.form };
        setSaved(current.form);
      });
    pending.current = operation;
    try {
      await operation;
    } finally {
      if (pending.current === operation) pending.current = null;
    }
  }, []);
  useEffect(() => {
    if (locked || (form.title === saved.title && form.stem === saved.stem))
      return;
    const timer = setTimeout(() => {
      void flush().catch(() => {});
    }, 1000);
    return () => clearTimeout(timer);
  }, [form, saved, locked, flush]);
  useLayoutEffect(
    () => () => {
      void flush().catch(() => {});
    },
    [flush],
  );
  const flushAll = useCallback(async () => {
    await flush();
    await childFlush.current?.();
  }, [flush]);
  useEffect(() => {
    registerFlush?.(locked ? async () => {} : flushAll);
    return () => registerFlush?.(null);
  }, [registerFlush, locked, flushAll]);
  const expand = async (id: string) => {
    try {
      await childFlush.current?.();
      onExpandChild(expandedChildId === id ? null : id);
    } catch {
      /* Stay on the unsaved child; the save action reports the error. */
    }
  };
  const names = {
    single_choice: "單選題",
    multiple_choice: "多選題",
    true_false: "是非題",
    short_answer: "簡答題",
    essay: "問答題",
  };
  return (
    <article className={styles.editor}>
      {locked && (
        <InlineNotification
          kind="warning"
          lowContrast
          hideCloseButton
          title={t(
            "workbench.edit.lockedNotice",
            "已有考生開始作答，題目內容已鎖定。仍可修正參考答案、配分與詳解；這類變更改為手動儲存，儲存前會先說明對既有批改的影響。",
          )}
        />
      )}
      <header className={styles.editorHeader}>
        <h1>
          <span className={styles.questionLabel}>{label}</span>
          <span className={styles.questionTitle}>{form.title}</span>
        </h1>
        <GlobalSaveStatus status={saveStatus} />
        {!locked && (
          <Button
            kind="danger--ghost"
            size="sm"
            onClick={() => {
              void actions.remove(block.id);
            }}
          >
            {t("workbench.edit.deleteGroup", "刪除題組")}
          </Button>
        )}
      </header>
      <div className={styles.groupSettings}>
        <TextInput
          id={`group-title-${block.id}`}
          labelText={t("workbench.edit.groupTitle", "題組標題")}
          readOnly={locked}
          value={form.title}
          onChange={(event) =>
            setForm((p) => ({ ...p, title: event.target.value }))
          }
        />
        <div>
          <span>{t("workbench.edit.children", "子題")}</span>
          <strong>
            {t("workbench.edit.childCount", "{{count}} 題", {
              count: block.children.length,
            })}
          </strong>
        </div>
        <div>
          <span>{t("workbench.edit.groupScore", "題組合計")}</span>
          <strong>
            {block.children.reduce((sum, q) => sum + paperQuestionPoints(q), 0)}
          </strong>
        </div>
      </div>
      <section
        className={styles.field}
        aria-label={t("workbench.edit.sharedStem", "共同題幹")}
      >
        <h2>{t("workbench.edit.sharedStem", "共同題幹")}</h2>
        {locked ? (
          <MarkdownRenderer>{form.stem}</MarkdownRenderer>
        ) : (
          <MarkdownField
            id={`group-stem-${block.id}`}
            labelText={t("workbench.edit.sharedStem", "共同題幹")}
            value={form.stem}
            onChange={(stem) => setForm((p) => ({ ...p, stem }))}
            showPreview
          />
        )}
      </section>
      <section className={styles.field}>
        <div className={styles.childListHeader}>
          <h2>{t("workbench.edit.children", "子題")}</h2>
          {!locked && (
            <WorkbenchAddMenu
              questionsOnly
              label={t("workbench.edit.addChild", "新增子題")}
              onAdd={(choice) => {
                if (choice.kind === "question")
                  void actions.addChild(block.id, choice.type);
              }}
            />
          )}
        </div>
        {block.children.length === 0 && (
          <p>{t("workbench.edit.emptyGroup", "尚無子題")}</p>
        )}
        {block.children.map((child) => {
          const open = expandedChildId === child.id;
          return (
            <section key={child.id} className={styles.childSection}>
              <Button
                className={styles.childHeading}
                kind="ghost"
                size="md"
                aria-expanded={open}
                aria-controls={`child-editor-${child.id}`}
                onClick={() => {
                  void expand(child.id);
                }}
              >
                <span>{childLabels.get(child.id)}</span>
                <span className={styles.childType}>
                  {t(
                    `common:questionType.label.${child.questionType}`,
                    names[child.questionType],
                  )}
                </span>
                <span className={styles.childPrompt}>
                  {child.prompt.split("\n")[0]}
                </span>
                <span>{paperQuestionPoints(child)}</span>
                {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </Button>
              {open && (
                <div
                  id={`child-editor-${child.id}`}
                  className={styles.childEditor}
                >
                  <WorkbenchQuestionEditor
                    key={child.id}
                    compact
                    question={child}
                    label={childLabels.get(child.id) ?? ""}
                    locked={locked}
                    actions={actions}
                    saveStatus={saveStatus}
                    onNavigate={() => {}}
                    registerFlush={registerChildFlush}
                    answerSummary={answerData?.get(child.id)?.summary}
                    answerCounts={answerData?.get(child.id)?.counts}
                    impactError={impactError}
                    onRetryImpact={onRetryImpact}
                    onGradeQuestion={() => onGradeQuestion?.(child.id)}
                    onOpenScorePolicy={() => onOpenScorePolicy?.(child.id)}
                  />
                  {!locked && (
                    <div className={styles.childActions}>
                      <Button
                        kind="ghost"
                        size="sm"
                        onClick={() => {
                          void actions.duplicate(child.id);
                        }}
                      >
                        {t("workbench.edit.duplicate", "複製這題")}
                      </Button>
                      <Button
                        kind="danger--ghost"
                        size="sm"
                        onClick={() => {
                          void actions.remove(child.id);
                        }}
                      >
                        {t("workbench.edit.deleteQuestion", "刪除這題")}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </section>
          );
        })}
      </section>
    </article>
  );
}
