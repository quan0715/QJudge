import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Button,
  InlineNotification,
  Stack,
  Tag,
  Tile,
  DataTable,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  TextInput,
  TextArea,
  NumberInput,
  Modal,
  Loading,
  Toggle,
} from "@carbon/react";
import { Renew, ArrowRight, Checkmark } from "@carbon/icons-react";
import { useInterval } from "@/shared/hooks/useInterval";
import { useExamV2Flow } from "./useExamV2Flow";
import {
  getAllExamAnswers,
  gradeExamAnswer,
  type ExamAnswerDetail,
} from "@/infrastructure/api/repositories/examAnswers.repository";
import { getContestParticipants } from "@/infrastructure/api/repositories/contestParticipants.repository";
import { updateContest } from "@/infrastructure/api/repositories";
import type { ContestParticipant } from "@/core/entities/contest.entity";

// ── Student view ──
const StudentGradingView: React.FC = () => {
  const navigate = useNavigate();
  const { contestId, contest, refreshContest } = useExamV2Flow();
  const published = !!contest?.resultsPublished;

  useInterval(() => {
    void refreshContest();
  }, published ? null : 15000);

  return (
    <div style={{ maxWidth: 720, margin: "2rem auto", padding: "0 1rem" }}>
      <h2 style={{ marginBottom: "0.5rem" }}>批改中</h2>
      <p style={{ color: "var(--cds-text-secondary)", marginBottom: "1.5rem" }}>
        {published
          ? "成績已發布，你可以前往結果頁查看。"
          : "你的考卷正在批改中，請耐心等待。"}
      </p>

      <Stack gap={5}>
        <Tile>
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <Tag type="teal">{`考試狀態：${contest?.examStatus || "not_started"}`}</Tag>
            <Tag type={published ? "green" : "gray"}>
              {published ? "成績已發布" : "批改中"}
            </Tag>
          </div>
        </Tile>

        {!published && contest?.examStatus === "submitted" && (
          <InlineNotification
            kind="info"
            lowContrast
            hideCloseButton
            title="等待批改中"
            subtitle="開放式題目由助教批改，系統每 15 秒自動刷新狀態。"
          />
        )}

        {published && (
          <InlineNotification
            kind="success"
            lowContrast
            hideCloseButton
            title="成績已發布"
            subtitle="點擊下方按鈕查看你的考試結果。"
          />
        )}

        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <Button kind="tertiary" renderIcon={Renew} onClick={() => void refreshContest()}>
            立即刷新
          </Button>
          <Button
            kind="primary"
            renderIcon={ArrowRight}
            disabled={!contestId}
            onClick={() => contestId && navigate(`/contests/${contestId}/exam-v2/result`)}
          >
            前往結果頁
          </Button>
        </div>
      </Stack>
    </div>
  );
};

// ── TA/Admin grading view ──
const TAGradingView: React.FC = () => {
  const { contestId, contest, refreshContest } = useExamV2Flow();

  const [participants, setParticipants] = useState<ContestParticipant[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<ExamAnswerDetail[]>([]);
  const [loadingAnswers, setLoadingAnswers] = useState(false);
  const [gradingAnswer, setGradingAnswer] = useState<ExamAnswerDetail | null>(null);
  const [gradeScore, setGradeScore] = useState<number>(0);
  const [gradeFeedback, setGradeFeedback] = useState("");
  const [saving, setSaving] = useState(false);
  const [publishingResults, setPublishingResults] = useState(false);
  const [notification, setNotification] = useState<{ kind: "success" | "error"; msg: string } | null>(null);

  const published = !!contest?.resultsPublished;

  // Load participants
  useEffect(() => {
    if (!contestId) return;
    getContestParticipants(contestId).then(setParticipants).catch(() => {});
  }, [contestId]);

  // Load answers for selected participant
  useEffect(() => {
    if (!contestId || !selectedUserId) return;
    setLoadingAnswers(true);
    getAllExamAnswers(contestId, selectedUserId)
      .then(setAnswers)
      .catch(() => setAnswers([]))
      .finally(() => setLoadingAnswers(false));
  }, [contestId, selectedUserId]);

  const handleGrade = async () => {
    if (!gradingAnswer || !contestId) return;
    setSaving(true);
    try {
      const updated = await gradeExamAnswer(contestId, gradingAnswer.id, {
        score: gradeScore,
        feedback: gradeFeedback || undefined,
      });
      setAnswers((prev) =>
        prev.map((a) => (a.id === updated.id ? updated : a))
      );
      setGradingAnswer(null);
      setNotification({ kind: "success", msg: "批改已儲存" });
    } catch {
      setNotification({ kind: "error", msg: "儲存失敗" });
    } finally {
      setSaving(false);
    }
  };

  const handlePublishResults = async () => {
    if (!contestId) return;
    setPublishingResults(true);
    try {
      await updateContest(contestId, { resultsPublished: true } as any);
      await refreshContest();
      setNotification({ kind: "success", msg: "成績已發布" });
    } catch {
      setNotification({ kind: "error", msg: "發布失敗" });
    } finally {
      setPublishingResults(false);
    }
  };

  const gradedCount = answers.filter((a) => a.score != null).length;
  const totalAnswers = answers.length;

  return (
    <div style={{ maxWidth: 960, margin: "2rem auto", padding: "0 1rem" }}>
      <h2 style={{ marginBottom: "0.5rem" }}>考卷批改</h2>
      <p style={{ color: "var(--cds-text-secondary)", marginBottom: "1.5rem" }}>
        選擇學生後可逐題批改，批改完成後發布成績。
      </p>

      {notification && (
        <InlineNotification
          kind={notification.kind}
          lowContrast
          hideCloseButton
          title={notification.msg}
          onCloseButtonClick={() => setNotification(null)}
          style={{ marginBottom: "1rem" }}
        />
      )}

      <Stack gap={5}>
        {/* Publish control */}
        <Tile>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
              <Tag type={published ? "green" : "gray"}>
                {published ? "成績已發布" : "成績未發布"}
              </Tag>
              <Tag type="teal">{`${participants.length} 位考生`}</Tag>
            </div>
            <Button
              kind={published ? "secondary" : "primary"}
              size="sm"
              disabled={publishingResults}
              onClick={handlePublishResults}
            >
              {published ? "已發布" : "發布成績"}
            </Button>
          </div>
        </Tile>

        {/* Participant list */}
        <Tile>
          <h4 style={{ marginTop: 0, marginBottom: "0.75rem" }}>選擇考生</h4>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
            {participants.map((p) => (
              <Button
                key={p.userId}
                kind={selectedUserId === String(p.userId) ? "primary" : "ghost"}
                size="sm"
                onClick={() => setSelectedUserId(String(p.userId))}
              >
                {p.nickname || p.username || `User ${p.userId}`}
              </Button>
            ))}
          </div>
        </Tile>

        {/* Answers table */}
        {selectedUserId && (
          <Tile>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <h4 style={{ margin: 0 }}>作答內容</h4>
              {totalAnswers > 0 && (
                <Tag type={gradedCount === totalAnswers ? "green" : "blue"}>
                  {`已批改 ${gradedCount} / ${totalAnswers}`}
                </Tag>
              )}
            </div>

            {loadingAnswers ? (
              <Loading small withOverlay={false} />
            ) : answers.length === 0 ? (
              <p style={{ color: "var(--cds-text-secondary)" }}>此考生無作答記錄。</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <DataTable
                  rows={answers.map((a, i) => ({
                    id: a.id,
                    index: i + 1,
                    type: a.questionType || "-",
                    prompt: a.questionPrompt?.slice(0, 50) || `題目 ${i + 1}`,
                    answer: JSON.stringify(a.answer).slice(0, 60),
                    score: a.score != null ? String(a.score) : "未批改",
                    maxScore: a.maxScore != null ? String(a.maxScore) : "-",
                  }))}
                  headers={[
                    { key: "index", header: "#" },
                    { key: "type", header: "題型" },
                    { key: "prompt", header: "題目" },
                    { key: "answer", header: "作答" },
                    { key: "score", header: "得分" },
                    { key: "maxScore", header: "滿分" },
                  ]}
                >
                  {({ rows, headers: hdrs, getTableProps, getHeaderProps, getRowProps }) => (
                    <Table {...getTableProps()} size="md">
                      <TableHead>
                        <TableRow>
                          {hdrs.map((h) => (
                            <TableHeader {...getHeaderProps({ header: h })} key={h.key}>
                              {h.header}
                            </TableHeader>
                          ))}
                          <TableHeader>操作</TableHeader>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {rows.map((row) => {
                          const original = answers.find((a) => a.id === row.id);
                          return (
                            <TableRow {...getRowProps({ row })} key={row.id}>
                              {row.cells.map((cell) => (
                                <TableCell key={cell.id}>{cell.value}</TableCell>
                              ))}
                              <TableCell>
                                <Button
                                  kind="ghost"
                                  size="sm"
                                  renderIcon={Checkmark}
                                  onClick={() => {
                                    if (original) {
                                      setGradingAnswer(original);
                                      setGradeScore(original.score ?? 0);
                                      setGradeFeedback(original.feedback ?? "");
                                    }
                                  }}
                                >
                                  批改
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </DataTable>
              </div>
            )}
          </Tile>
        )}
      </Stack>

      {/* Grade modal */}
      <Modal
        open={!!gradingAnswer}
        modalHeading={`批改 — ${gradingAnswer?.questionPrompt?.slice(0, 40) || "題目"}`}
        primaryButtonText={saving ? "儲存中..." : "儲存"}
        secondaryButtonText="取消"
        primaryButtonDisabled={saving}
        onRequestSubmit={handleGrade}
        onRequestClose={() => setGradingAnswer(null)}
      >
        {gradingAnswer && (
          <Stack gap={4}>
            <div>
              <strong>題型：</strong>{gradingAnswer.questionType || "-"}
              <span style={{ marginLeft: "1rem" }}>
                <strong>滿分：</strong>{gradingAnswer.maxScore ?? "-"}
              </span>
            </div>
            <div>
              <strong>作答內容：</strong>
              <pre style={{
                background: "var(--cds-layer-01)",
                padding: "0.75rem",
                borderRadius: "4px",
                whiteSpace: "pre-wrap",
                fontSize: "0.875rem",
                marginTop: "0.25rem",
              }}>
                {JSON.stringify(gradingAnswer.answer, null, 2)}
              </pre>
            </div>
            <NumberInput
              id="grade-score"
              label="分數"
              value={gradeScore}
              min={0}
              max={gradingAnswer.maxScore ?? 100}
              step={0.5}
              onChange={(_: any, { value }: { value: number }) => setGradeScore(value)}
            />
            <TextArea
              id="grade-feedback"
              labelText="評語（選填）"
              value={gradeFeedback}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setGradeFeedback(e.target.value)}
              rows={3}
            />
          </Stack>
        )}
      </Modal>
    </div>
  );
};

// ── Main screen: route to TA or student view ──
const ExamV2GradingScreen: React.FC = () => {
  const { contest } = useExamV2Flow();

  const isTA = contest?.currentUserRole === "teacher" || contest?.currentUserRole === "admin";

  if (isTA) return <TAGradingView />;
  return <StudentGradingView />;
};

export default ExamV2GradingScreen;
