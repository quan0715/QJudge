import React, { useState, useEffect } from "react";
import {
  Tag,
  Tile,
  DataTable,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  Loading,
  InlineNotification,
} from "@carbon/react";
import {
  getExamResults,
  type ExamAnswerDetail,
} from "@/infrastructure/api/repositories/examAnswers.repository";

interface ExamResultsSummaryProps {
  contestId: string;
}

export const ExamResultsSummary: React.FC<ExamResultsSummaryProps> = ({ contestId }) => {
  const [results, setResults] = useState<ExamAnswerDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    getExamResults(contestId)
      .then(setResults)
      .catch((e) => setError(e?.message || "無法載入成績"))
      .finally(() => setLoading(false));
  }, [contestId]);

  if (loading) {
    return <Loading small withOverlay={false} />;
  }

  if (error) {
    return (
      <InlineNotification
        kind="error"
        lowContrast
        hideCloseButton
        title="載入失敗"
        subtitle={error}
      />
    );
  }

  if (results.length === 0) {
    return (
      <InlineNotification
        kind="info"
        lowContrast
        hideCloseButton
        title="無作答記錄"
        subtitle="未找到你的作答資料。"
      />
    );
  }

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
    <>
      <Tile style={{ marginBottom: "1rem" }}>
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
  );
};

export default ExamResultsSummary;
