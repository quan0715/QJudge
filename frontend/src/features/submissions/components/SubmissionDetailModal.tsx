import { useState, useEffect } from "react";
import {
  Modal,
  Tabs,
  Tab,
  TabList,
  TabPanels,
  TabPanel,
  Tag,
  Button,
  SkeletonText,
  SkeletonPlaceholder,
} from "@carbon/react";
import { Copy, Checkmark, Locked } from "@carbon/icons-react";
import Editor from "@monaco-editor/react";
import { getSubmission } from "@/infrastructure/api/repositories/submission.repository";
import { useCopyText } from "@/shared/hooks/useCopyText";
import { useInterval } from "@/shared/hooks/useInterval";
import ProblemLink from "@/features/problems/components/ProblemLink";
import { formatDate } from "@/shared/utils/format";
import type { SubmissionDetail, TestResult } from "@/core/entities/submission.entity";
import { DifficultyBadge } from "@/shared/ui/tag";
import { InfoCard } from "@/shared/ui/dataCard";
import { TestResultList, TestResultDetail } from "@/shared/ui/submission";
import { getLanguageConfig } from "@/core/config/language.config";
import { getStatusConfig } from "@/core/config/status.config";
interface SubmissionDetailModalProps {
  submissionId: string | null;
  isOpen: boolean;
  onClose: () => void;
  contestId?: string;
}

const SubmissionDetailModal = ({
  submissionId,
  isOpen,
  onClose,
  contestId,
}: SubmissionDetailModalProps) => {
  const [submission, setSubmission] = useState<SubmissionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedResult, setSelectedResult] = useState<TestResult | null>(null);
  const { isCopied, copy } = useCopyText();

  useEffect(() => {
    if (isOpen && submissionId) {
      setLoading(true);
      setError(null);
      setSelectedResult(null);
      fetchSubmission();
    } else {
      setSubmission(null);
      setSelectedResult(null);
    }
  }, [isOpen, submissionId]);

  const fetchSubmission = async () => {
    try {
      const data = await getSubmission(submissionId!);
      setSubmission(data);

    } catch (err: any) {
      console.error("Error:", err);
      if (err.message === "Permission denied") {
        setError("permission_denied");
      } else {
        setError("fetch_failed");
      }
    } finally {
      setLoading(false);
    }
  };

  const shouldPoll =
    isOpen &&
    !!submissionId &&
    (submission?.status === "pending" || submission?.status === "judging");

  useInterval(() => {
    if (!shouldPoll || !submissionId) return;
    getSubmission(submissionId)
      .then((data) => {
        setSubmission(data);
      })
      .catch((error) => {
        console.error("Polling error:", error);
      });
  }, shouldPoll ? 1000 : null);

  const handleCopyCode = () => {
    if (submission?.code) {
      copy(submission.code);
    }
  };

  return (
    <Modal
      open={isOpen}
      color="white"
      onRequestClose={onClose}
      passiveModal
      size="lg"
      style={{ minHeight: "600px" }}
    >
      {loading ? (
        <div style={{ padding: "0" }}>
          {/* Hero Skeleton */}
          <div
            style={{
              padding: "2rem 1rem",
              margin: "-1rem -1rem 0 -1rem",
              backgroundColor: "var(--cds-layer-01)",
              marginBottom: "0",
              borderBottom: "1px solid var(--cds-border-subtle)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: "2rem",
              }}
            >
              <div style={{ width: "60%" }}>
                <div style={{ marginBottom: "0.5rem" }}>
                  <SkeletonText width="30%" />
                </div>
                <div style={{ marginBottom: "0.5rem" }}>
                  <SkeletonText heading width="80%" />
                </div>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <SkeletonPlaceholder
                    style={{ width: "80px", height: "24px" }}
                  />
                  <SkeletonPlaceholder
                    style={{ width: "60px", height: "24px" }}
                  />
                  <SkeletonPlaceholder
                    style={{ width: "100px", height: "24px" }}
                  />
                </div>
              </div>
              <SkeletonPlaceholder style={{ width: "100px", height: "32px" }} />
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
                gap: "1.5rem",
                paddingTop: "1.5rem",
                borderTop: "1px solid var(--cds-border-subtle-01)",
              }}
            >
              {[1, 2, 3].map((i) => (
                <div key={i}>
                  <div style={{ marginBottom: "0.25rem" }}>
                    <SkeletonText width="40px" />
                  </div>
                  <SkeletonText width="80px" heading />
                </div>
              ))}
            </div>
          </div>

          {/* Tabs Skeleton */}
          <div style={{ marginTop: "2rem" }}>
            <SkeletonPlaceholder
              style={{ width: "200px", height: "40px", marginBottom: "1rem" }}
            />
            <SkeletonPlaceholder style={{ width: "100%", height: "300px" }} />
          </div>
        </div>
      ) : error === "permission_denied" ? (
        <div style={{ padding: "2rem", textAlign: "center" }}>
          <div style={{ marginBottom: "1rem" }}>
            <Locked size={64} style={{ color: "var(--cds-icon-secondary)" }} />
          </div>
          <h2 style={{ marginBottom: "1rem" }}>權限不足</h2>
          <p style={{ color: "var(--cds-text-secondary)" }}>
            您沒有權限查看此提交的詳細內容。
          </p>
        </div>
      ) : !submission ? (
        <div style={{ padding: "2rem", textAlign: "center" }}>
          <p>提交不存在或無法載入</p>
        </div>
      ) : (
        <div style={{ padding: "1rem 1rem", margin: "1rem 1rem" }}>
          <div
            style={{
              backgroundColor: "var(--cds-layer-01)",
              marginBottom: "0",
              borderBottom: "1px solid var(--cds-border-subtle-01)",
            }}
          >
            {/* Header: Title + Status */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                marginBottom: "2rem",
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: "0.875rem",
                    color: "var(--cds-text-secondary)",
                    marginBottom: "0.5rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                  }}
                >
                  <span>提交 #{submission.id}</span>
                  <span>•</span>
                  <span>{formatDate(submission.createdAt)}</span>
                </div>
                <h2
                  style={{
                    fontSize: "2rem",
                    fontWeight: 600,
                    lineHeight: 1.2,
                    marginBottom: "0.5rem",
                  }}
                >
                  {submission.problem ? (
                    <ProblemLink
                      problemId={submission.problem.id}
                      displayId={
                        submission.problem.displayId || submission.problem.id
                      }
                      title={submission.problem.title}
                      contestId={contestId}
                    />
                  ) : (
                    submission.problemId
                  )}
                </h2>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  {submission.problem && (
                    <DifficultyBadge
                      difficulty={submission.problem.difficulty}
                    />
                  )}
                  <Tag type="gray">
                    {getLanguageConfig(submission.language).label}
                  </Tag>
                  <Tag type="cyan">
                    By {submission.user?.username || submission.userId}
                  </Tag>
                </div>
              </div>
            </div>

            {/* Data Grid */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
                gap: "0.5rem",
                padding: "1rem 0rem",
                borderTop: "1px solid var(--cds-border-subtle-01)",
              }}
            >
              <InfoCard
                title="提交狀態"
                value={getStatusConfig(submission.status).label}
                description={`本次繳交狀態`}
                valueStyle={{
                  color: getStatusConfig(submission.status).color,
                }}
              />
              <InfoCard
                title="得分"
                value={submission.score || 0}
                unit="分"
                description={`題目總得分`}
              />
              <InfoCard
                title="執行時間"
                value={submission.execTime || 0}
                unit="ms"
                description={`題目總執行時間`}
              />
              <InfoCard
                title="記憶體使用"
                value={submission.memoryUsage || 0}
                unit="MB"
                description={`題目總記憶體使用`}
              />
            </div>

            {submission.errorMessage && (
              <div style={{ marginTop: "1.5rem" }}>
                <div
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--cds-text-secondary)",
                    marginBottom: "0.5rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                  }}
                >
                  錯誤訊息
                </div>
                <pre
                  style={{
                    padding: "1rem",
                    backgroundColor: "var(--cds-layer-02)",
                    borderRadius: "4px",
                    fontSize: "0.875rem",
                    fontFamily: "'IBM Plex Mono', monospace",
                    whiteSpace: "pre-wrap",
                    color: "var(--cds-text-error)",
                    margin: 0,
                    border: "1px solid var(--cds-border-subtle)",
                  }}
                >
                  {submission.errorMessage}
                </pre>
              </div>
            )}
          </div>

          {/* Tabs */}
          <Tabs>
            <TabList contained aria-label="Submission details">
              <Tab>程式碼</Tab>
              <Tab>測試結果</Tab>
            </TabList>
            <TabPanels>
              {/* Code Tab */}
              <TabPanel>
                <div
                  style={{
                    padding: "0.5rem",
                  }}
                >
                  <div
                    style={{
                      position: "relative",
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        top: "0.5rem",
                        right: "0.5rem",
                        left: "auto",
                        zIndex: 10,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Button
                        kind="primary"
                        size="sm"
                        hasIconOnly
                        renderIcon={isCopied ? Checkmark : Copy}
                        iconDescription={isCopied ? "已複製" : "複製程式碼"}
                        onClick={handleCopyCode}
                      />
                    </div>

                    <Editor
                      height="400px"
                      language={
                        submission.language === "cpp"
                          ? "cpp"
                          : submission.language
                      }
                      value={submission.code}
                      theme="vs-dark"
                      options={{
                        copyWithSyntaxHighlighting: true,
                        selectionClipboard: true,
                        readOnly: true,
                        minimap: { enabled: false },
                        fontSize: 14,
                        scrollBeyondLastLine: false,
                        domReadOnly: true,
                        lineNumbers: "on",
                        fontLigatures: false,
                        fontFamily:
                          "'JetBrains Mono NL', 'SF Mono', 'Menlo', 'Consolas', monospace",
                      }}
                    />
                  </div>
                </div>
              </TabPanel>

              {/* Test Results Tab */}
              <TabPanel>
                <div>
                  {submission.results && submission.results.length > 0 ? (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "1rem",
                      }}
                    >
                      {/* Test Result List */}
                      <TestResultList
                        results={submission.results}
                        layout="horizontal"
                        size="md"
                        selectedId={selectedResult?.id}
                        onSelect={(result) => setSelectedResult(result)}
                        showDetails
                      />

                      {/* Test Result Detail */}
                      {selectedResult ? (
                        <TestResultDetail
                          result={selectedResult}
                          index={
                            submission.results.findIndex(
                              (r) => r.id === selectedResult.id
                            ) + 1
                          }
                          variant="inline"
                          showDiff
                          onClose={() => setSelectedResult(null)}
                        />
                      ) : (
                        <div
                          style={{
                            padding: "3rem",
                            textAlign: "center",
                            color: "var(--cds-text-secondary)",
                            backgroundColor: "var(--cds-layer-01)",
                            border: "1px solid var(--cds-border-subtle)",
                            borderRadius: "4px",
                          }}
                        >
                          點擊上方測試案例查看詳情
                        </div>
                      )}
                    </div>
                  ) : submission.isTest &&
                    submission.customTestCases &&
                    submission.customTestCases.length > 0 ? (
                    /* Pending custom test cases */
                    <TestResultList
                      results={submission.customTestCases.map((tc, index) => ({
                        id: `custom-${index}`,
                        testCaseId: `custom-${index}`,
                        status: "pending" as const,
                        execTime: 0,
                        memoryUsage: 0,
                        isHidden: false,
                        input: tc.input,
                        expectedOutput: tc.output,
                      }))}
                      layout="horizontal"
                      size="md"
                    />
                  ) : (
                    <div
                      style={{
                        padding: "2rem",
                        textAlign: "center",
                        color: "var(--cds-text-secondary)",
                      }}
                    >
                      暫無測試結果
                    </div>
                  )}
                </div>
              </TabPanel>
            </TabPanels>
          </Tabs>
        </div>
      )}
    </Modal>
  );
};

export { SubmissionDetailModal };
