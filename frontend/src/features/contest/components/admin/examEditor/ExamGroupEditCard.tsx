import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button, IconButton, Layer, Tag, TextInput } from "@carbon/react";
import { Add, Close, Draggable, TrashCan } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import type { ExamPaperBlock } from "@/core/entities/contest.entity";
import { formatScore } from "@/shared/utils/scoreFormat";
import MarkdownRenderer from "@/shared/ui/markdown/MarkdownRenderer";
import { MarkdownField } from "@/shared/ui/markdown/markdownEditor";
import styles from "./ExamGroupEditCard.module.scss";

interface ExamGroupEditCardProps {
  block: Extract<ExamPaperBlock, { kind: "group" }>;
  index: number;
  questionRangeLabel?: string;
  frozen?: boolean;
  onAutoSave: (
    blockId: string,
    payload: { title?: string; shared_stem_markdown?: string },
  ) => Promise<void>;
  onDelete: (blockId: string) => Promise<void>;
  onAddChild: (blockId: string) => void;
  onPointerDownDrag?: (event: React.PointerEvent) => void;
}

const ExamGroupEditCard: React.FC<ExamGroupEditCardProps> = ({
  block,
  index,
  questionRangeLabel,
  frozen,
  onAutoSave,
  onDelete,
  onAddChild,
  onPointerDownDrag,
}) => {
  const { t } = useTranslation("contest");
  const [title, setTitle] = useState(block.group.title);
  const [stem, setStem] = useState(block.group.sharedStemMarkdown);
  const [editingStem, setEditingStem] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setTitle(block.group.title);
    setStem(block.group.sharedStemMarkdown);
  }, [block.group.sharedStemMarkdown, block.group.title]);

  const score = useMemo(
    () => block.children.reduce((sum, child) => sum + child.score, 0),
    [block.children],
  );

  const persist = useCallback(async () => {
    if (frozen) return;
    const nextTitle = title.trim();
    const nextStem = stem.trim();
    if (
      nextTitle === block.group.title &&
      nextStem === block.group.sharedStemMarkdown
    ) {
      return;
    }
    setSaving(true);
    try {
      await onAutoSave(block.id, {
        title: nextTitle,
        shared_stem_markdown: nextStem,
      });
    } finally {
      setSaving(false);
    }
  }, [block.group.sharedStemMarkdown, block.group.title, block.id, frozen, onAutoSave, stem, title]);

  return (
    <Layer>
      <section className={styles.groupCard}>
        {!frozen && onPointerDownDrag ? (
          <div className={styles.dragIndicator} onPointerDown={onPointerDownDrag}>
            <Draggable size={16} />
          </div>
        ) : null}
        <div className={styles.body}>
          <div className={styles.header}>
            <div className={styles.headerTitle}>
              <span className={styles.label}>
                {t("examEditor.groupBlockNumber", {
                  index: questionRangeLabel ?? index + 1,
                  defaultValue: "題組 {{index}}",
                })}
              </span>
              <Tag type="purple" size="sm">
                {t("examEditor.groupBlockWithCount", {
                  count: block.children.length,
                  defaultValue: "題組 {{count}} 題",
                })}
              </Tag>
              <Tag type="gray" size="sm">
                {t("examEditor.scoreShort", {
                  score: formatScore(score),
                  defaultValue: "{{score}} 分",
                })}
              </Tag>
            </div>
            <div className={styles.headerActions}>
              <Button
                kind="ghost"
                size="sm"
                renderIcon={Add}
                onClick={() => onAddChild(block.id)}
                disabled={frozen}
              >
                {t("examEditor.addChildQuestion", "新增子題")}
              </Button>
              <IconButton
                kind="ghost"
                size="sm"
                label={t("button.delete", "刪除")}
                onClick={() => void onDelete(block.id)}
                disabled={frozen}
              >
                <TrashCan size={16} />
              </IconButton>
            </div>
          </div>
          <div className={styles.fields}>
            <TextInput
              id={`exam-group-title-${block.id}`}
              labelText={t("examEditor.groupTitle", "題組標題")}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              onBlur={() => void persist()}
              disabled={frozen}
            />
            {editingStem ? (
              <div>
                <MarkdownField
                  id={`exam-group-stem-${block.id}`}
                  labelText={t("examEditor.groupStem", "共同題幹")}
                  value={stem}
                  onChange={setStem}
                  minHeight="180px"
                  disabled={frozen}
                />
                <Button
                  kind="ghost"
                  size="sm"
                  renderIcon={Close}
                  onClick={() => {
                    void persist();
                    setEditingStem(false);
                  }}
                  disabled={frozen || saving}
                >
                  {t("button.close", "關閉")}
                </Button>
              </div>
            ) : (
              <button
                type="button"
                className={styles.stemPreview}
                onClick={() => {
                  if (!frozen) setEditingStem(true);
                }}
                disabled={frozen}
              >
                {stem ? (
                  <MarkdownRenderer enableMath>{stem}</MarkdownRenderer>
                ) : (
                  <span className={styles.emptyStem}>
                    {t("examEditor.groupStemPlaceholder", "點擊新增共同題幹")}
                  </span>
                )}
              </button>
            )}
          </div>
        </div>
      </section>
    </Layer>
  );
};

export default ExamGroupEditCard;
