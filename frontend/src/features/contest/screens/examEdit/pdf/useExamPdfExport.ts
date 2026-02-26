import { useState, useCallback } from "react";
import { pdf } from "@react-pdf/renderer";
import React from "react";
import type { ContestDetail, ExamQuestion } from "@/core/entities/contest.entity";
import ExamPdfDocument from "./ExamPdfDocument";

type PdfMode = "question" | "answer";

interface UseExamPdfExportOptions {
  contest: ContestDetail | null;
  questions: ExamQuestion[];
}

interface UseExamPdfExportReturn {
  exportPdf: (mode: PdfMode) => Promise<void>;
  generating: boolean;
}

export function useExamPdfExport({
  contest,
  questions,
}: UseExamPdfExportOptions): UseExamPdfExportReturn {
  const [generating, setGenerating] = useState(false);

  const exportPdf = useCallback(
    async (mode: PdfMode) => {
      if (!contest || questions.length === 0) return;
      setGenerating(true);

      try {
        const doc = React.createElement(ExamPdfDocument, {
          contest,
          questions,
          mode,
        });
        const blob = await pdf(doc).toBlob();
        const url = URL.createObjectURL(blob);

        const suffix = mode === "answer" ? "答案卷" : "題目卷";
        const filename = `${contest.name}_${suffix}.pdf`;

        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } finally {
        setGenerating(false);
      }
    },
    [contest, questions]
  );

  return { exportPdf, generating };
}

export default useExamPdfExport;
