import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Button,
  InlineNotification,
  Stack,
  Tag,
  Tile,
  Modal,
} from "@carbon/react";
import {
  Checkmark,
  WarningAlt,
  ArrowLeft,
  SendFilled,
} from "@carbon/icons-react";
import { usePaperExamFlow } from "./usePaperExamFlow";
import { getMyExamAnswers } from "@/infrastructure/api/repositories/examAnswers.repository";
import { getExamQuestions } from "@/infrastructure/api/repositories/examQuestions.repository";
import type { ExamQuestion } from "@/core/entities/contest.entity";

const PaperExamSubmitReviewScreen: React.FC = () => {
  const navigate = useNavigate();
  const { contestId, contest, loading, error, clearError, submitExam } =
    usePaperExamFlow();

  const [showConfirm, setShowConfirm] = useState(false);
  const [answeredIds, setAnsweredIds] = useState<Set<string>>(new Set());
  const [examQuestions, setExamQuestions] = useState<ExamQuestion[]>([]);
  const [loadingAnswers, setLoadingAnswers] = useState(true);

  // Fetch questions + answers
  useEffect(() => {
    if (!contestId) return;
    setLoadingAnswers(true);
    Promise.all([
      getExamQuestions(contestId).catch(() => []),
      getMyExamAnswers(contestId).catch(() => []),
    ]).then(([questions, answers]) => {
      setExamQuestions(questions);
      const ids = new Set<string>();
      for (const a of answers) {
        const val = a.answer;
        const hasContent =
          val &&
          (("selected" in val && val.selected) ||
            ("text" in val && val.text));
        if (hasContent) ids.add(a.questionId);
      }
      setAnsweredIds(ids);
    }).finally(() => setLoadingAnswers(false));
  }, [contestId]);

  // Exit fullscreen after submission
  useEffect(() => {
    if (contest?.examStatus === "submitted" && document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
  }, [contest?.examStatus]);

  const canSubmit =
    contest?.examStatus === "in_progress" ||
    contest?.examStatus === "paused" ||
    contest?.examStatus === "locked";

  const unanswered = examQuestions.filter((q) => !answeredIds.has(String(q.id)));
  const totalCount = examQuestions.length;
  const answeredCount = totalCount - unanswered.length;

  const handleSubmitExam = async () => {
    setShowConfirm(false);
    const success = await submitExam();
    if (!success || !contestId) return;
    // Phase 2: 交卷後導回主頁
    navigate(`/contests/${contestId}`);
  };

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "2rem 1rem", minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "center" }}>
      <h2 style={{ marginBottom: "0.5rem" }}>交卷前確認</h2>
      <p style={{ color: "var(--cds-text-secondary)", marginBottom: "1.5rem" }}>
        請確認作答情況，交卷後將無法再修改答案。
      </p>

      {error && (
        <InlineNotification
          kind="error"
          lowContrast
          hideCloseButton
          title="交卷失敗"
          subtitle={error}
          onCloseButtonClick={clearError}
          style={{ marginBottom: "1rem" }}
        />
      )}

      <Stack gap={5}>
        <Tile>
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: "1rem" }}>
            <Tag type={answeredCount === totalCount ? "green" : "red"}>
              {`已作答 ${answeredCount} / ${totalCount} 題`}
            </Tag>
            <Tag type="teal">
              {contest?.endTime
                ? `截止：${new Date(contest.endTime).toLocaleString("zh-TW")}`
                : "未設定截止時間"}
            </Tag>
          </div>

          {loadingAnswers ? (
            <p style={{ color: "var(--cds-text-secondary)" }}>載入作答狀態中...</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {examQuestions.map((q, i) => {
                const done = answeredIds.has(String(q.id));
                return (
                  <div
                    key={q.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.75rem",
                      padding: "0.5rem 0.75rem",
                      background: done ? "transparent" : "var(--cds-support-error-inverse)",
                      borderRadius: "4px",
                    }}
                  >
                    {done ? (
                      <Checkmark size={16} style={{ color: "var(--cds-support-success)" }} />
                    ) : (
                      <WarningAlt size={16} style={{ color: "var(--cds-support-error)" }} />
                    )}
                    <span>
                      第 {i + 1} 題
                      {q.prompt && ` — ${q.prompt.slice(0, 60)}${q.prompt.length > 60 ? "..." : ""}`}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Tile>

        {unanswered.length > 0 && !loadingAnswers && (
          <InlineNotification
            kind="warning"
            lowContrast
            hideCloseButton
            title={`有 ${unanswered.length} 題尚未作答`}
            subtitle="建議返回作答頁完成所有題目再交卷。"
          />
        )}

        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <Button
            kind="secondary"
            renderIcon={ArrowLeft}
            disabled={!contestId}
            onClick={() =>
              contestId && navigate(`/contests/${contestId}/paper-exam/answering`)
            }
          >
            回作答頁
          </Button>
          <Button
            kind="danger"
            renderIcon={SendFilled}
            disabled={!canSubmit || loading}
            onClick={() => setShowConfirm(true)}
          >
            確認交卷
          </Button>
        </div>
      </Stack>

      <Modal
        open={showConfirm}
        danger
        modalHeading="確認交卷"
        primaryButtonText="確定交卷"
        secondaryButtonText="取消"
        onRequestSubmit={handleSubmitExam}
        onRequestClose={() => setShowConfirm(false)}
      >
        <p>
          交卷後將無法再修改答案。
          {unanswered.length > 0 && (
            <strong> 你還有 {unanswered.length} 題尚未作答。</strong>
          )}
        </p>
        <p>確定要交卷嗎？</p>
      </Modal>
    </div>
  );
};

export default PaperExamSubmitReviewScreen;
