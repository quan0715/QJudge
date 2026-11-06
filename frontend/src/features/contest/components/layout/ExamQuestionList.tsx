import { memo, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import type { ExamItem } from "../../types/exam.types";
import { buildPaperQuestionLabels } from "../../domain/paperQuestionLabels";
import styles from "./ExamQuestionList.module.scss";

interface ExamQuestionListProps {
  items: ExamItem[];
  activeIndex: number;
  answeredIds: Set<string>;
  markedIds?: Set<string>;
  onSelect: (index: number) => void;
  collapsed: boolean;
}

interface ListRow {
  index: number;
  id: string;
  badge: string;
  typeLabel: string;
  summary: string;
  isCoding: boolean;
  /** Set on the first child of a question group, e.g. "4" or "4–6". */
  groupStart?: string;
  grouped: boolean;
}

// Summaries are one quiet line: emphasis, headings and block math are flattened.
const SUMMARY_COMPONENTS = {
  p: ({ children }: { children?: React.ReactNode }) => <span>{children} </span>,
  strong: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
  em: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
  h1: ({ children }: { children?: React.ReactNode }) => <span>{children} </span>,
  h2: ({ children }: { children?: React.ReactNode }) => <span>{children} </span>,
  h3: ({ children }: { children?: React.ReactNode }) => <span>{children} </span>,
  a: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
  ul: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
  ol: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
  li: ({ children }: { children?: React.ReactNode }) => <span>{children} </span>,
  img: () => null,
  pre: () => null,
  table: () => null,
  blockquote: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
};

export const ExamQuestionList = memo(function ExamQuestionList({ items, activeIndex, answeredIds, markedIds, onSelect, collapsed }: ExamQuestionListProps) {
  const { t } = useTranslation("contest");
  const rowRefs = useRef(new Map<number, HTMLButtonElement>());

  const rows = useMemo<ListRow[]>(() => {
    const labels = buildPaperQuestionLabels(items.flatMap((item) => item.kind === "question" ? [item.data] : []));
    return items.map((item, index) => {
      if (item.kind === "coding") {
        return {
          index,
          id: item.data.id,
          badge: item.data.label || String(index + 1),
          typeLabel: t("answering.questionTypes.coding", "程式題"),
          summary: item.data.title,
          isCoding: true,
          grouped: false,
        };
      }
      const label = labels.get(item.data.id);
      const groupId = item.data.groupId;
      const previous = items[index - 1];
      const previousGroup = previous?.kind === "question" ? previous.data.groupId : undefined;
      const groupStart = groupId && groupId !== previousGroup ? label?.groupLabel ?? String(label?.mainNumber ?? "") : undefined;
      return {
        index,
        id: item.data.id,
        badge: label?.label ?? String(index + 1),
        typeLabel: t(`answering.questionTypes.${item.data.questionType}`),
        summary: item.data.prompt,
        isCoding: false,
        groupStart,
        grouped: !!groupId,
      };
    });
  }, [items, t]);

  useEffect(() => {
    rowRefs.current.get(activeIndex)?.scrollIntoView?.({ block: "nearest" });
  }, [activeIndex, collapsed]);

  const answeredCount = rows.filter((row) => answeredIds.has(row.id)).length;
  const markedCount = rows.filter((row) => markedIds?.has(row.id)).length;
  const percent = rows.length ? Math.round((answeredCount / rows.length) * 100) : 0;

  return (
    <div className={styles.list} data-collapsed={collapsed}>
      {!collapsed && (
        <div className={styles.header}>
          <span className={styles.heading}>{t("workspace.questionList.title", "題目")}</span>
          <span className={styles.count}>{t("workspace.questionList.count", `${rows.length} 題`, { count: rows.length })}</span>
        </div>
      )}
      <div className={styles.scroll} role="list">
        {rows.map((row) => {
          const answered = answeredIds.has(row.id);
          const marked = markedIds?.has(row.id) ?? false;
          const active = row.index === activeIndex;
          const status = [
            answered ? t("workspace.status.answered", "已作答") : t("workspace.status.unanswered", "未作答"),
            marked ? t("workspace.status.marked", "已標記") : null,
          ].filter(Boolean).join("，");
          return (
            <div role="listitem" key={row.id} className={styles.rowWrap}>
              {!collapsed && row.groupStart != null && (
                <div className={styles.groupHeading}>{t("workspace.questionList.group", `第 ${row.groupStart} 題 · 題組`, { number: row.groupStart })}</div>
              )}
              <button
                type="button"
                ref={(element) => {
                  if (element) rowRefs.current.set(row.index, element);
                  else rowRefs.current.delete(row.index);
                }}
                className={styles.row}
                data-active={active}
                data-grouped={row.grouped && !collapsed}
                aria-current={active ? "step" : undefined}
                aria-label={collapsed ? `${row.isCoding ? row.badge : `Q${row.badge}`}，${status}` : undefined}
                title={collapsed ? `${row.isCoding ? row.badge : `Q${row.badge}`} · ${status}` : undefined}
                onClick={() => onSelect(row.index)}
              >
                <span className={styles.badge} data-answered={answered} data-marked={marked}>
                  {row.isCoding ? row.badge : collapsed ? `Q${row.badge}` : row.badge}
                </span>
                {!collapsed && (
                  <span className={styles.text}>
                    <span className={styles.type}>
                      {row.typeLabel}
                      <span className={styles.srOnly}>，{status}</span>
                    </span>
                    <span className={styles.summary}>
                      {row.isCoding ? row.summary : (
                        <ReactMarkdown skipHtml remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]} components={SUMMARY_COMPONENTS}>
                          {row.summary}
                        </ReactMarkdown>
                      )}
                    </span>
                  </span>
                )}
              </button>
            </div>
          );
        })}
      </div>
      {!collapsed && (
        <div className={styles.footer}>
          <div className={styles.progressText}>
            <span>
              {rows.every((row) => row.isCoding) && rows.length
                ? t("workspace.questionList.acceptedProgress", `已通過 ${answeredCount} / ${rows.length}`, { answered: answeredCount, total: rows.length })
                : t("answering.navigation.answeredProgress", { answered: answeredCount, total: rows.length })}
            </span>
            {markedCount > 0 && <span className={styles.marked}>{t("answering.navigation.markedCount", { count: markedCount })}</span>}
          </div>
          <div className={styles.progressTrack} aria-hidden="true"><span style={{ inlineSize: `${percent}%` }} /></div>
        </div>
      )}
    </div>
  );
});
