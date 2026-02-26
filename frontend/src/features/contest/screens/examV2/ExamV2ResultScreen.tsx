import React, { useState, useEffect } from "react";
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
} from "@carbon/react";
import { Renew, ArrowLeft } from "@carbon/icons-react";
import { useExamV2Flow } from "./useExamV2Flow";
import {
  getExamResults,
  type ExamAnswerDetail,
} from "@/infrastructure/api/repositories/examAnswers.repository";

const ExamV2ResultScreen: React.FC = () => {
  const navigate = useNavigate();
  const { contestId, contest, refreshContest } = useExamV2Flow();

  const [results, setResults] = useState<ExamAnswerDetail[]>([]);
  const [loadingResults, setLoadingResults] = useState(true);
  const [resultError, setResultError] = useState<string | null>(null);

  const published = !!contest?.resultsPublished;

  useEffect(() => {
    if (!contestId || !published) {
      setLoadingResults(false);
      return;
    }
    setLoadingResults(true);
    getExamResults(contestId)
      .then(setResults)
      .catch((e) => setResultError(e?.message || "無法載入成績"))
      .finally(() => setLoadingResults(false));
  }, [contestId, published]);

  const totalScore = results.reduce((sum, r) => sum + (r.score ?? 0), 0);
  const totalMax = results.reduce((sum, r) => sum + (r.maxScore ?? 0), 0);

  const rows = results.map((r, i) => ({
    id: String(r.id),
    index: i + 1,
    prompt: r.questionPrompt?.slice(0, 80) || `第 ${i + 1} 題`,
    type: r.questionType || "-",
    score: r.score != null ? `${r.score}` : "未批改",
    maxScore: r.maxScore != null ? `${r.maxScore}` : "-",
    feedback: r.feedback || "-",
  }));

  const headers = [
    { key: "index", header: "#" },
    { key: "prompt", header: "題目" },
    { key: "type", header: "題型" },
    { key: "score", header: "得分" },
    { key: "maxScore", header: "滿分" },
    { key: "feedback", header: "評語" },
  ];

  return (
    <div style={{ maxWidth: 800, margin: "2rem auto", padding: "0 1rem" }}>
      <h2 style={{ marginBottom: "0.5rem" }}>考試結果</h2>
      <p style={{ color: "var(--cds-text-secondary)", marginBottom: "1.5rem" }}>
        {published ? "成績已發布，以下為你的作答結果。" : "成績尚未發布，請耐心等待。"}
      </p>

      <Stack gap={5}>
        {!published && (
          <InlineNotification
            kind="info"
            lowContrast
            hideCloseButton
            title="成績尚未發布"
            subtitle="助教批改完成並發布成績後，你將可以查看詳細結果。"
          />
        )}

        {resultError && (
          <InlineNotification
            kind="error"
            lowContrast
            hideCloseButton
            title="載入失敗"
            subtitle={resultError}
          />
        )}

        {published && !loadingResults && results.length > 0 && (
          <>
            <Tile>
              <div style={{ display: "flex", alignItems: "baseline", gap: "1rem" }}>
                <h3 style={{ margin: 0 }}>
                  總分：{totalScore} / {totalMax}
                </h3>
                <Tag type={totalScore >= totalMax * 0.6 ? "green" : "red"}>
                  {Math.round((totalScore / (totalMax || 1)) * 100)}%
                </Tag>
              </div>
            </Tile>

            <DataTable rows={rows} headers={headers}>
              {({ rows: tableRows, headers: tableHeaders, getTableProps, getHeaderProps, getRowProps }) => (
                <Table {...getTableProps()} size="md">
                  <TableHead>
                    <TableRow>
                      {tableHeaders.map((h) => (
                        <TableHeader {...getHeaderProps({ header: h })} key={h.key}>
                          {h.header}
                        </TableHeader>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {tableRows.map((row) => (
                      <TableRow {...getRowProps({ row })} key={row.id}>
                        {row.cells.map((cell) => (
                          <TableCell key={cell.id}>{cell.value}</TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </DataTable>
          </>
        )}

        {published && !loadingResults && results.length === 0 && (
          <InlineNotification
            kind="info"
            lowContrast
            hideCloseButton
            title="無作答記錄"
            subtitle="未找到你的作答資料。"
          />
        )}

        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <Button
            kind="secondary"
            renderIcon={ArrowLeft}
            onClick={() => contestId && navigate(`/contests/${contestId}`)}
          >
            返回考試首頁
          </Button>
          <Button
            kind="tertiary"
            renderIcon={Renew}
            onClick={() => void refreshContest()}
          >
            重新整理
          </Button>
        </div>
      </Stack>
    </div>
  );
};

export default ExamV2ResultScreen;
